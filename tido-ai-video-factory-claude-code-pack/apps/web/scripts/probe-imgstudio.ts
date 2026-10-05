/**
 * ImgStudio provider probe — what the API actually does, measured and recorded.
 *
 * Every claim the migration makes about the provider has to come from a recorded
 * response, not from memory or a document. This script makes those responses: it
 * calls ImgStudio directly (not through the app's adapter, so nothing the adapter
 * does — retries, packing, ratio gates — can hide what the API itself accepts),
 * and writes every request and response to disk with secrets removed.
 *
 * IT SPENDS MONEY. It refuses to run without both
 *
 *   --yes-i-approve-spending
 *   --max-vnd <n>            (n <= 4000)
 *
 * and it checks the NEXT call's expected price against the cap before sending it,
 * so it stops short of the cap rather than discovering it has crossed it. It also
 * stops on the first response that looks like an empty balance. Nothing is retried:
 * a retry is a second charge.
 *
 * Run from apps/web:
 *   npx tsx --env-file=.env.local scripts/probe-imgstudio.ts --yes-i-approve-spending --max-vnd 4000
 *
 * Optional:
 *   --product <path>       product photo for step 3 (default: a synthetic bottle with a
 *                          known label, generated here, so label fidelity can be checked)
 *   --provider-id <id>     skip discovery and use this id
 *   --quality-slow-id <id> run step 7 against this id
 *
 * Output: data/probe/<run>/ — one JSON per call (request + response, headers
 * included, redacted), every downloaded image, and summary.json. `data/` is
 * gitignored; nothing here is committed.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import sharp from "sharp";

// ── arguments and guards ─────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(name);
const option = (name: string): string | undefined => {
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : undefined;
};

const HARD_CAP_VND = 4000;
const maxVnd = Number(option("--max-vnd"));

if (!flag("--yes-i-approve-spending") || !Number.isFinite(maxVnd) || maxVnd <= 0 || maxVnd > HARD_CAP_VND) {
  console.error(
    "Refusing to run: this probe spends money.\n" +
      `Pass --yes-i-approve-spending and --max-vnd <n> with 0 < n <= ${HARD_CAP_VND}.`,
  );
  process.exit(2);
}

const API_KEY = process.env.IMGSTUDIO_API_KEY || "";
if (!API_KEY.trim()) {
  console.error("IMGSTUDIO_API_KEY is not set. Run with --env-file=.env.local.");
  process.exit(2);
}
const BASE_URL = (process.env.IMGSTUDIO_BASE_URL || "https://imgstudio.site").replace(/\/+$/, "");

const SUNBURST_CANDIDATES = ["gpt-image-2.5-sunburst", "GPT-Image-2.5-Sunburst"];

/** Expected price per call before the first real cost is seen. From the decision list. */
const EXPECTED_VND: Record<string, number> = {
  "gpt-image-2.5-sunburst": 150,
  "GPT-Image-2.5-Sunburst": 150,
};
const DEFAULT_EXPECTED_VND = 200; // deliberately above the listed price, so the cap check errs safe

const CALL_TIMEOUT_MS = 300_000;

const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const OUT_DIR = path.join(process.cwd(), "data", "probe", RUN_ID);
fs.mkdirSync(OUT_DIR, { recursive: true });

// ── ledger ───────────────────────────────────────────────────────────────────

const ledger = {
  calls: 0,
  costSum: 0,
  firstBalance: null as number | null,
  lastBalance: null as number | null,
  observedPrice: new Map<string, number>(),
  stoppedBecause: null as string | null,
};

/** What has been spent, by the larger of the two measures available. */
function spent(): number {
  const delta =
    ledger.firstBalance !== null && ledger.lastBalance !== null ? ledger.firstBalance - ledger.lastBalance : 0;
  return Math.max(ledger.costSum, delta);
}

function expectedPrice(providerId: string): number {
  return ledger.observedPrice.get(providerId) ?? EXPECTED_VND[providerId] ?? DEFAULT_EXPECTED_VND;
}

class BudgetStop extends Error {}

function guardBudget(providerId: string, label: string) {
  if (ledger.stoppedBecause) throw new BudgetStop(ledger.stoppedBecause);
  const next = expectedPrice(providerId);
  if (spent() + next > maxVnd) {
    ledger.stoppedBecause = `cap: spent ${spent()} + next ${next} (${label}) would exceed --max-vnd ${maxVnd}`;
    throw new BudgetStop(ledger.stoppedBecause);
  }
  if (ledger.lastBalance !== null && ledger.lastBalance < next) {
    ledger.stoppedBecause = `balance: ${ledger.lastBalance} VND left, next call expected ${next}`;
    throw new BudgetStop(ledger.stoppedBecause);
  }
}

// ── redaction and recording ──────────────────────────────────────────────────

/**
 * Names that carry credentials. Anchored on purpose: a bare /key/ also matched the
 * probe's own `response_keys` field and redacted the very shape it was recording.
 */
const SECRET_KEY = /^(authorization|cookie|set-cookie|key|token)$|api[-_]?key|access[-_]?token|secret|password/i;

function redactHeaders(h: Headers | Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  const entries = h instanceof Headers ? [...h.entries()] : Object.entries(h);
  for (const [k, v] of entries) out[k] = SECRET_KEY.test(k) ? "<REDACTED>" : v;
  return out;
}

function redactValue(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(redactValue);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = SECRET_KEY.test(k) ? "<REDACTED>" : redactValue(val);
    }
    return out;
  }
  // A key pasted into any string field is still a key.
  if (typeof v === "string" && API_KEY && v.includes(API_KEY)) return v.split(API_KEY).join("<REDACTED>");
  return v;
}

function save(name: string, data: unknown) {
  fs.writeFileSync(path.join(OUT_DIR, name), JSON.stringify(redactValue(data), null, 2), "utf8");
}

// ── one call ─────────────────────────────────────────────────────────────────

interface RefImage {
  name: string;
  buffer: Buffer;
  mime: string;
}

interface CallSpec {
  label: string;
  providerId: string;
  prompt: string;
  aspectRatio: string;
  resolution?: string;
  quality?: string;
  references?: RefImage[];
  /** Extra form/JSON fields, to test whether the API accepts them. */
  extra?: Record<string, string | number>;
}

interface CallResult {
  label: string;
  providerId: string;
  ok: boolean;
  httpStatus: number;
  apiStatus?: string;
  providerName?: string;
  model?: string;
  costVnd?: number;
  balanceVnd?: number;
  requestMs: number;
  downloadMs?: number;
  width?: number;
  height?: number;
  format?: string;
  bytes?: number;
  imageFile?: string;
  errorBody?: string;
  /** Any field in the response that hints at an async job. */
  jobHints?: string[];
  /** Top-level keys of the JSON response, to record its shape. */
  responseKeys?: string[];
  /** How the image came back: a URL to fetch, inline base64, or a job to poll. */
  imageTransport?: string;
}

const results: CallResult[] = [];

async function call(spec: CallSpec): Promise<CallResult> {
  guardBudget(spec.providerId, spec.label);
  ledger.calls++;
  const n = String(ledger.calls).padStart(2, "0");
  const refs = spec.references || [];
  const endpoint = `${BASE_URL}/api/v1/images/${refs.length ? "edit" : "generate"}`;
  const idempotencyKey = `probe-${RUN_ID}-${n}-${crypto.randomBytes(4).toString("hex")}`;
  const fields: Record<string, string | number> = {
    prompt: spec.prompt,
    provider_id: spec.providerId,
    aspect_ratio: spec.aspectRatio,
    resolution: spec.resolution ?? "1K",
    quality: spec.quality ?? "standard",
    ...(spec.extra || {}),
  };
  const headers: Record<string, string> = {
    Authorization: `Bearer ${API_KEY}`,
    "Idempotency-Key": idempotencyKey,
  };

  let body: FormData | string;
  if (refs.length) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, String(v));
    for (const r of refs) fd.append("images", new Blob([new Uint8Array(r.buffer)], { type: r.mime }), r.name);
    body = fd;
  } else {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(fields);
  }

  const record: Record<string, unknown> = {
    request: {
      method: "POST",
      url: endpoint,
      headers: redactHeaders(headers),
      fields,
      files: refs.map((r) => ({
        name: r.name,
        mime: r.mime,
        bytes: r.buffer.length,
        sha256: crypto.createHash("sha256").update(r.buffer).digest("hex"),
      })),
    },
  };

  const started = Date.now();
  const result: CallResult = { label: spec.label, providerId: spec.providerId, ok: false, httpStatus: 0, requestMs: 0 };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CALL_TIMEOUT_MS);
  try {
    const res = await fetch(endpoint, { method: "POST", headers, body, signal: ctrl.signal });
    result.requestMs = Date.now() - started;
    result.httpStatus = res.status;
    const text = await res.text();
    let json: Record<string, unknown> | null = null;
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      json = null;
    }
    record.response = { status: res.status, headers: redactHeaders(res.headers), body: json ?? text };

    if (json) {
      result.apiStatus = typeof json.status === "string" ? json.status : undefined;
      result.providerName = typeof json.provider_name === "string" ? json.provider_name : undefined;
      result.model = typeof json.model === "string" ? json.model : undefined;
      if (typeof json.cost_vnd === "number") result.costVnd = json.cost_vnd;
      if (typeof json.balance_vnd === "number") result.balanceVnd = json.balance_vnd;
      result.jobHints = Object.keys(json).filter((k) => /job|task|queue|poll|status_url|eta/i.test(k));
      result.responseKeys = Object.keys(json);
      const inlineB64 = Object.entries(json).some(
        ([k, v]) => /b64|base64|image_data/i.test(k) || (typeof v === "string" && v.length > 2000 && /^[A-Za-z0-9+/=]+$/.test(v.slice(0, 200))),
      );
      result.imageTransport = typeof json.url === "string" ? "url" : inlineB64 ? "base64" : result.jobHints.length ? "job" : "unknown";
    }

    // Money first, before anything else can throw.
    if (typeof result.costVnd === "number") {
      ledger.costSum += result.costVnd;
      ledger.observedPrice.set(spec.providerId, result.costVnd);
    }
    if (typeof result.balanceVnd === "number") {
      if (ledger.firstBalance === null) ledger.firstBalance = result.balanceVnd + (result.costVnd ?? 0);
      ledger.lastBalance = result.balanceVnd;
    }
    if (res.status === 402 || /insufficient|balance|số dư|không đủ|nạp/i.test(res.ok ? "" : text)) {
      ledger.stoppedBecause = `provider reported a balance problem on ${spec.label} (HTTP ${res.status})`;
    }

    if (!res.ok || !json || json.status !== "completed" || typeof json.url !== "string") {
      result.errorBody = text.slice(0, 1000);
      return result;
    }

    const fileUrl = json.url.startsWith("http") ? json.url : `${BASE_URL}${json.url}`;
    const dlStart = Date.now();
    const dl = await fetch(fileUrl, { headers: { Authorization: `Bearer ${API_KEY}` } });
    const buf = Buffer.from(await dl.arrayBuffer());
    result.downloadMs = Date.now() - dlStart;
    record.download = { status: dl.status, headers: redactHeaders(dl.headers), bytes: buf.length };
    if (dl.ok && buf.length) {
      const meta = await sharp(buf).metadata();
      result.width = meta.width;
      result.height = meta.height;
      result.format = meta.format;
      result.bytes = buf.length;
      result.imageFile = `${n}-${spec.label}.${meta.format || "bin"}`;
      fs.writeFileSync(path.join(OUT_DIR, result.imageFile), buf);
      result.ok = true;
    }
    return result;
  } catch (e) {
    result.requestMs = result.requestMs || Date.now() - started;
    result.errorBody = (e as Error).name === "AbortError" ? `client timeout after ${CALL_TIMEOUT_MS}ms` : String(e);
    return result;
  } finally {
    clearTimeout(timer);
    record.result = result;
    save(`${n}-${spec.label}.json`, record);
    results.push(result);
    console.log(
      `[probe] ${n} ${spec.label} http=${result.httpStatus} ok=${result.ok} ` +
        `provider_name=${result.providerName ?? "-"} cost=${result.costVnd ?? "-"} ` +
        `dims=${result.width ?? "-"}x${result.height ?? "-"} ms=${result.requestMs} spent=${spent()}`,
    );
  }
}

// ── fixtures, generated here ────────────────────────────────────────────────

async function shape(kind: "square" | "circle" | "triangle" | "star", color: string): Promise<RefImage> {
  const draw = {
    square: `<rect x="128" y="128" width="256" height="256" fill="${color}"/>`,
    circle: `<circle cx="256" cy="256" r="140" fill="${color}"/>`,
    triangle: `<polygon points="256,96 416,400 96,400" fill="${color}"/>`,
    star: `<polygon points="256,80 300,200 430,200 325,275 365,400 256,325 147,400 187,275 82,200 212,200" fill="${color}"/>`,
  }[kind];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="white"/>${draw}</svg>`;
  return { name: `${kind}.png`, mime: "image/png", buffer: await sharp(Buffer.from(svg)).png().toBuffer() };
}

/** A synthetic bottle with a label whose exact text is known, so fidelity can be checked. */
async function syntheticProduct(): Promise<RefImage> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="768" height="1024">
  <rect width="768" height="1024" fill="#f2f2f2"/>
  <rect x="309" y="90" width="150" height="90" rx="10" fill="#1a1a1a"/>
  <rect x="329" y="180" width="110" height="80" fill="#3b2412"/>
  <rect x="234" y="260" width="300" height="660" rx="60" fill="#3b2412"/>
  <rect x="244" y="430" width="280" height="300" fill="#f5efe4"/>
  <text x="384" y="520" font-family="Arial, Helvetica, sans-serif" font-size="38" font-weight="bold" text-anchor="middle" fill="#3b2412">COLD BREW</text>
  <text x="384" y="590" font-family="Arial, Helvetica, sans-serif" font-size="30" text-anchor="middle" fill="#3b2412">ARABICA</text>
  <text x="384" y="680" font-family="Arial, Helvetica, sans-serif" font-size="28" text-anchor="middle" fill="#3b2412">250 ML</text>
</svg>`;
  return { name: "product-cold-brew.png", mime: "image/png", buffer: await sharp(Buffer.from(svg)).png().toBuffer() };
}

async function loadProduct(file: string): Promise<RefImage> {
  const buf = fs.readFileSync(file);
  const meta = await sharp(buf).metadata();
  const mime = meta.format === "jpeg" ? "image/jpeg" : meta.format === "webp" ? "image/webp" : "image/png";
  return { name: path.basename(file), mime, buffer: buf };
}

/** Mean colour of a region, as the name of the dominant channel. */
async function dominantIn(file: string, region: { left: number; top: number; width: number; height: number }) {
  const img = sharp(path.join(OUT_DIR, file));
  const meta = await img.metadata();
  const w = meta.width || 1;
  const h = meta.height || 1;
  const box = {
    left: Math.round(region.left * w),
    top: Math.round(region.top * h),
    width: Math.max(1, Math.round(region.width * w)),
    height: Math.max(1, Math.round(region.height * h)),
  };
  const { data, info } = await sharp(path.join(OUT_DIR, file)).extract(box).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let r = 0;
  let g = 0;
  let b = 0;
  let counted = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    // Ignore near-white background pixels: we want the object's colour.
    if (data[i] > 225 && data[i + 1] > 225 && data[i + 2] > 225) continue;
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    counted++;
  }
  if (!counted) return "empty";
  r /= counted;
  g /= counted;
  b /= counted;
  const top = Math.max(r, g, b);
  if (top - Math.min(r, g, b) < 30) return "neutral";
  return top === r ? "red" : top === g ? "green" : "blue";
}

// ── the steps, in priority order ─────────────────────────────────────────────

const LATENCY_PROMPT =
  "A photorealistic product photograph of a plain white ceramic coffee cup on a light oak table beside a window, soft morning daylight from the left, shallow background blur. No text anywhere in the image.";

/**
 * The settings the ImgStudio web UI sent for this model, minus the two fields under
 * test. Every latency sample uses exactly these.
 */
const BASE = { aspectRatio: "1:1", resolution: "1K", quality: "high" } as const;

/**
 * `--order-test-two`: reference binding at the provider's real limit of two images.
 *
 * The three-shape test cannot run on a provider that edits at most two images. This
 * one does not describe the shapes in the prompt at all — it only says where Image 1
 * and Image 2 go — and runs twice with the attachments swapped. If the colours follow
 * the swap, the model binds "Image N" to the Nth attached file, which is the binding
 * the master prompt relies on.
 */
async function orderTestTwo(providerId: string, summary: Record<string, unknown>) {
  const red = await shape("square", "#e01b1b");
  const blue = await shape("circle", "#1b3fe0");
  const prompt =
    "A flat illustration on a plain white background. Place the object from Image 1 in the top-left corner " +
    "and the object from Image 2 in the bottom-right corner. Keep each object's exact color and shape. " +
    "Nothing else in the image. No text.";
  const runs: Array<[string, RefImage[], { top_left: string; bottom_right: string }]> = [
    ["order2-red-then-blue", [red, blue], { top_left: "red", bottom_right: "blue" }],
    ["order2-blue-then-red", [blue, red], { top_left: "blue", bottom_right: "red" }],
  ];
  const checks: unknown[] = [];
  for (const [label, refs, expected] of runs) {
    const r = await call({ label, providerId, ...BASE, references: refs, prompt });
    if (r.ok && r.imageFile) {
      const got = {
        top_left: await dominantIn(r.imageFile, { left: 0, top: 0, width: 0.4, height: 0.4 }),
        bottom_right: await dominantIn(r.imageFile, { left: 0.6, top: 0.6, width: 0.4, height: 0.4 }),
      };
      checks.push({ label, attached: refs.map((x) => x.name), expected, got, binds_by_number: got.top_left === expected.top_left && got.bottom_right === expected.bottom_right });
    } else {
      checks.push({ label, ok: false, http: r.httpStatus, error: r.errorBody?.slice(0, 200) });
    }
  }
  summary.reference_order_two = checks;
}

async function main() {
  const summary: Record<string, unknown> = { run: RUN_ID, max_vnd: maxVnd, endpoint_base: BASE_URL };
  let sunburst: string | null = option("--provider-id") ?? null;

  if (flag("--order-test-two")) {
    if (!sunburst) throw new Error("--order-test-two needs --provider-id");
    try {
      await orderTestTwo(sunburst, summary);
    } catch (e) {
      if (!(e instanceof BudgetStop)) throw e;
      summary.stopped = (e as Error).message;
    }
    summary.spent_vnd = spent();
    summary.balance_before_vnd = ledger.firstBalance;
    summary.balance_after_vnd = ledger.lastBalance;
    summary.results = results;
    save("summary.json", summary);
    console.log(`[probe] order-test-two done: spent ${spent()} VND, output ${OUT_DIR}`);
    return;
  }

  try {
    if (!sunburst) {
      // Discovery, kept for the record. Not used when the id is supplied.
      const attempts: unknown[] = [];
      for (const candidate of SUNBURST_CANDIDATES) {
        const r = await call({ label: `discover-${candidate}`, providerId: candidate, prompt: LATENCY_PROMPT, ...BASE });
        const confirmed = r.ok && /sunburst/i.test(r.providerName ?? "");
        attempts.push({ candidate, ok: r.ok, http: r.httpStatus, provider_name: r.providerName, model: r.model, confirmed });
        if (confirmed) {
          sunburst = candidate;
          break;
        }
      }
      summary.discovery = attempts;
      if (!sunburst) throw new BudgetStop("no Sunburst id confirmed; nothing further to probe");
    } else {
      summary.discovery = { supplied: sunburst };
    }
    summary.sunburst_provider_id = sunburst;

    // 1. Text-only, 1:1, 1K, quality high, WITHOUT background and count. This call is
    //    also latency sample #1. Its provider_name must say Sunburst, or nothing else runs.
    const first = await call({ label: "1-first-high", providerId: sunburst, prompt: LATENCY_PROMPT, ...BASE });
    summary.first_call = {
      ok: first.ok,
      http: first.httpStatus,
      provider_name: first.providerName,
      model: first.model,
      response_keys: first.responseKeys,
      image_transport: first.imageTransport,
      job_hints: first.jobHints,
      cost_vnd: first.costVnd,
      balance_vnd: first.balanceVnd,
      request_ms: first.requestMs,
      dims: first.width && first.height ? `${first.width}x${first.height}` : null,
    };
    if (!first.ok) throw new BudgetStop(`first call failed (HTTP ${first.httpStatus}); stopping`);
    if (!/sunburst/i.test(first.providerName ?? "")) {
      throw new BudgetStop(`provider_name is "${first.providerName ?? "(absent)"}", not Sunburst; stopping as instructed`);
    }

    // 2. Quality: the same call at "standard".
    await call({ label: "2-quality-standard", providerId: sunburst, prompt: LATENCY_PROMPT, ...BASE, quality: "standard" });

    // 3. The two fields the web UI sends and the adapter does not.
    await call({
      label: "3-extra-background-count",
      providerId: sunburst,
      prompt: LATENCY_PROMPT,
      ...BASE,
      extra: { background: "opaque", count: 1 },
    });

    // 4. Ratios. 1:1 is call 1. 4:5 once, only to record whether it is accepted.
    const ratios: Array<[string, string]> = [
      ["9:16", "4-ratio-9x16"],
      ["16:9", "4-ratio-16x9"],
      ["4:5", "4-ratio-4x5-acceptance"],
    ];
    for (const [ratio, label] of ratios) {
      await call({ label, providerId: sunburst, prompt: LATENCY_PROMPT, ...BASE, aspectRatio: ratio });
    }

    // 5. Vietnamese poster, with the product as a reference.
    const productPath = option("--product");
    const product = productPath ? await loadProduct(productPath) : await syntheticProduct();
    fs.writeFileSync(path.join(OUT_DIR, `input-${product.name}`), product.buffer);
    summary.product_reference = productPath
      ? { file: productPath }
      : { synthetic: true, label_text: ["COLD BREW", "ARABICA", "250 ML"] };
    await call({
      label: "5-vietnamese-poster",
      providerId: sunburst,
      ...BASE,
      aspectRatio: "9:16",
      references: [product],
      prompt: [
        "OUTPUT: A vertical commercial poster for a cold brew coffee brand, photorealistic, finished and ready to publish.",
        "REFERENCE IMAGES: Image 1 is the product. Keep its exact shape, proportions, colors, materials and label layout; do not redesign it and do not change or add any lettering on it.",
        "SCENE & CONCEPT: The bottle stands on a dark slate counter in early morning light, a few coffee beans beside it, cool condensation on the glass.",
        "COMPOSITION & LAYOUT: The bottle fills the lower middle of the frame. The upper third is a calm, softly lit wall reserved for the text.",
        'TEXT: In the upper third, centered, a bold modern sans-serif headline in warm white: "Khởi động ngày mới". Directly below it, smaller and lighter: "Cold brew đậm vị, tươi mỗi sáng". Render every Vietnamese accent exactly. No other text, numbers, watermarks or extra logos.',
        "CONSTRAINTS: no people, no second bottle.",
      ].join("\n"),
    });

    // 6. Reference order: roles assigned by number, checked by colour in each region.
    const order = [await shape("square", "#e01b1b"), await shape("circle", "#1b3fe0"), await shape("triangle", "#16a33a")];
    const orderResult = await call({
      label: "6-reference-order",
      providerId: sunburst,
      ...BASE,
      references: order,
      prompt:
        "A flat illustration on a plain white background. Image 1 is a red square, Image 2 is a blue circle, Image 3 is a green triangle. " +
        "Place the object from Image 1 in the top-left corner, the object from Image 2 in the exact center, and the object from Image 3 in the bottom-right corner. " +
        "Keep each object's exact color and shape. Nothing else in the image. No text.",
    });
    if (orderResult.ok && orderResult.imageFile) {
      summary.reference_order_check = {
        top_left: await dominantIn(orderResult.imageFile, { left: 0, top: 0, width: 0.4, height: 0.4 }),
        center: await dominantIn(orderResult.imageFile, { left: 0.3, top: 0.3, width: 0.4, height: 0.4 }),
        bottom_right: await dominantIn(orderResult.imageFile, { left: 0.6, top: 0.6, width: 0.4, height: 0.4 }),
        expected: { top_left: "red", center: "blue", bottom_right: "green" },
      };
    }

    // 7. Latency: two more calls identical to call 1, for three samples.
    for (const i of [2, 3]) {
      await call({ label: `7-latency-${i}`, providerId: sunburst, prompt: LATENCY_PROMPT, ...BASE });
    }

    // 8a. Reference count beyond three.
    const four = [...order, await shape("star", "#d4b000")];
    await call({
      label: "8-reference-count-4",
      providerId: sunburst,
      ...BASE,
      references: four,
      prompt: "Image 1, Image 2, Image 3 and Image 4 are four shapes. Arrange all four in a row on a white background. No text.",
    });

    // 8b. A pixel-size field, deliberately at odds with the aspect ratio so its effect shows.
    await call({
      label: "8-pixel-size-1280x720-with-ratio-1x1",
      providerId: sunburst,
      prompt: LATENCY_PROMPT,
      ...BASE,
      extra: { size: "1280x720" },
    });
  } catch (e) {
    if (!(e instanceof BudgetStop)) throw e;
    summary.stopped = (e as Error).message;
  }

  const latency = results
    .filter((r) => r.ok && r.providerId === sunburst && /^1-first-high$|^7-latency-/.test(r.label))
    .map((r) => r.requestMs)
    .sort((a, b) => a - b);
  summary.latency_request_ms = {
    settings: BASE,
    samples: latency,
    p50: latency.length ? latency[Math.floor((latency.length - 1) / 2)] : null,
    max: latency.length ? latency[latency.length - 1] : null,
  };
  summary.spent_vnd = spent();
  summary.cost_sum_vnd = ledger.costSum;
  summary.balance_before_vnd = ledger.firstBalance;
  summary.balance_after_vnd = ledger.lastBalance;
  summary.stopped_because = ledger.stoppedBecause ?? summary.stopped ?? null;
  summary.results = results;
  save("summary.json", summary);
  console.log(`[probe] done: ${results.length} calls, spent ${spent()} VND, output ${OUT_DIR}`);
}

main().catch((e) => {
  console.error("[probe] aborted:", (e as Error).message);
  process.exit(1);
});
