import fs from "fs";
import path from "path";
import { BenchmarkComparisonEngine } from "./benchmark/BenchmarkComparisonEngine";
import { BenchmarkDatasetRepository } from "./benchmark/BenchmarkDatasetRepository";
import { HumanBenchmarkAggregator } from "./benchmark/HumanBenchmarkAggregator";
import { HumanBenchmarkPreparer } from "./benchmark/HumanBenchmarkPreparer";
import { HumanBenchmarkResponse } from "./benchmark/human-benchmark.types";

/**
 * Builds a blind human review packet, or aggregates the responses to one.
 *
 *   npx tsx lib/image-engine/run-human-benchmark.ts [--out DIR] [--cases N] [--seed N]
 *   npx tsx lib/image-engine/run-human-benchmark.ts --aggregate DIR
 *
 * Writes `packet.json` (what a reviewer receives), `key.json` (what they must
 * not), `review_form.html` (a fillable form that exports its own response file)
 * and `blindness_audit.txt`.
 *
 * The packet is written even when the audit fails, because the audit findings
 * are themselves the useful output at that point — but the run says so loudly
 * and the form is not something to send until they are cleared.
 */

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** A self-contained review form. No network, no framework, exports its own JSON. */
function buildForm(packet: ReturnType<typeof HumanBenchmarkPreparer.prepare>["packet"]): string {
  const criteria = packet.criteria;
  const caseBlocks = packet.cases
    .map((c, ci) => {
      const sub = (i: 0 | 1) => {
        const s = c.submissions[i];
        const row = (k: string, v: string) =>
          `<tr><th>${escapeHtml(k)}</th><td>${v.trim() ? escapeHtml(v) : '<em class="empty">(not provided)</em>'}</td></tr>`;
        return `<div class="sub"><h4>Submission ${s.label}</h4><table>
          ${row("Big idea", s.concept.big_idea)}
          ${row("Core message", s.concept.core_message)}
          ${row("Insight", s.concept.consumer_insight)}
          ${row("Differentiation", s.concept.differentiation)}
          ${row("Camera", s.direction.camera)}
          ${row("Lighting", s.direction.lighting)}
          ${row("Composition", s.direction.composition)}
          ${row("Colour", s.direction.colour)}
          ${row("Typography", s.direction.typography)}
          ${row("Material", s.direction.material)}
          ${row("Atmosphere", s.direction.atmosphere)}
        </table></div>`;
      };
      const scoreRows = criteria
        .map(
          (cr) => `<tr>
            <td class="crit"><b>${escapeHtml(cr.question)}</b><br><span class="anchor">0 = ${escapeHtml(cr.anchors.low)} · 10 = ${escapeHtml(cr.anchors.high)}</span></td>
            <td><input type="number" min="0" max="10" step="1" data-case="${c.case_id}" data-crit="${cr.id}" data-label="A"></td>
            <td><input type="number" min="0" max="10" step="1" data-case="${c.case_id}" data-crit="${cr.id}" data-label="B"></td>
          </tr>`
        )
        .join("");
      return `<section class="case">
        <h2>${ci + 1}. ${escapeHtml(c.brief_summary.brand)} — ${escapeHtml(c.brief_summary.product)}</h2>
        <p class="challenge">${escapeHtml(c.creative_challenge)}</p>
        <table class="brief">
          <tr><th>Audience</th><td>${escapeHtml(c.brief_summary.audience)}</td></tr>
          <tr><th>Objective</th><td>${escapeHtml(c.brief_summary.objective)}</td></tr>
          <tr><th>Channel</th><td>${escapeHtml(c.brief_summary.channel)}</td></tr>
          <tr><th>Tone</th><td>${escapeHtml(c.brief_summary.tone)}</td></tr>
        </table>
        <p class="must"><b>Must address:</b></p>
        <ul>${c.must_address.map((m) => `<li>${escapeHtml(m)}</li>`).join("")}</ul>
        <div class="subs">${sub(0)}${sub(1)}</div>
        <table class="scores"><thead><tr><th>Criterion</th><th>A</th><th>B</th></tr></thead><tbody>${scoreRows}</tbody></table>
        <p class="pref"><b>Overall preference — which would you take into a client meeting?</b>
          <label><input type="radio" name="pref_${c.case_id}" value="A"> A</label>
          <label><input type="radio" name="pref_${c.case_id}" value="B"> B</label>
          <label><input type="radio" name="pref_${c.case_id}" value="NO_PREFERENCE"> No preference</label>
        </p>
        <p><textarea data-comment="${c.case_id}" rows="2" placeholder="Comment (optional)"></textarea></p>
      </section>`;
    })
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"><title>Creative review — ${packet.packet_id}</title>
<style>
body{font-family:system-ui,-apple-system,sans-serif;max-width:60rem;margin:0 auto;padding:2rem 1.25rem 6rem;line-height:1.55;color:#181b20}
h1{font-size:1.6rem} h2{font-size:1.15rem;margin-top:0} h4{margin:0 0 .4rem;font-size:.85rem;text-transform:uppercase;letter-spacing:.06em;color:#5b626d}
.case{border:1px solid #d9dde3;border-radius:8px;padding:1.25rem;margin:1.5rem 0;background:#fff}
.challenge{color:#4a515c;font-style:italic}
table{border-collapse:collapse;width:100%;font-size:.88rem;margin:.5rem 0}
th,td{border-bottom:1px solid #eceef2;padding:.35rem .5rem;text-align:left;vertical-align:top}
th{width:9rem;color:#5b626d;font-weight:600}
.subs{display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin:1rem 0}
@media(max-width:800px){.subs{grid-template-columns:1fr}}
.sub{border:1px solid #e3e6eb;border-radius:6px;padding:.75rem;background:#fafbfc}
.empty{color:#98a0ab}
.scores td.crit{width:auto} .scores input{width:4rem;padding:.25rem}
.anchor{font-size:.78rem;color:#6d7480}
.pref label{margin-right:1rem}
textarea{width:100%;font-family:inherit;font-size:.88rem;padding:.4rem}
#bar{position:fixed;bottom:0;left:0;right:0;background:#181b20;color:#fff;padding:.75rem 1.25rem;display:flex;gap:1rem;align-items:center}
#bar input{padding:.35rem;border:0;border-radius:4px}
button{padding:.45rem .9rem;border:0;border-radius:5px;background:#0e6f6b;color:#fff;font-weight:600;cursor:pointer}
.intro{background:#f2f4f7;border-radius:8px;padding:1rem 1.25rem}
.intro li{margin-bottom:.3rem}
</style></head><body>
<h1>Creative review</h1>
<div class="intro"><ul>${packet.instructions.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul></div>
${caseBlocks}
<div id="bar">
  <label>Your name/id <input id="rid" placeholder="reviewer_1"></label>
  <label>Background <input id="bg" placeholder="e.g. 8y art director"></label>
  <button onclick="exportJson()">Download responses</button>
  <span id="progress"></span>
</div>
<script>
const PACKET_ID = ${JSON.stringify(packet.packet_id)};
const CASE_IDS = ${JSON.stringify(packet.cases.map((c) => c.case_id))};
function exportJson(){
  const byCase = {};
  document.querySelectorAll('input[data-case]').forEach(el => {
    if (el.value === '') return;
    const c = el.dataset.case;
    byCase[c] = byCase[c] || { case_id: c, scores: [], overall_preference: 'NO_PREFERENCE' };
    byCase[c].scores.push({ label: el.dataset.label, criterion: el.dataset.crit, score: Number(el.value) });
  });
  CASE_IDS.forEach(c => {
    const picked = document.querySelector('input[name="pref_' + c + '"]:checked');
    if (picked) { byCase[c] = byCase[c] || { case_id: c, scores: [], overall_preference: 'NO_PREFERENCE' }; byCase[c].overall_preference = picked.value; }
    const ta = document.querySelector('textarea[data-comment="' + c + '"]');
    if (ta && ta.value.trim() && byCase[c]) byCase[c].comment = ta.value.trim();
  });
  const out = {
    packet_id: PACKET_ID,
    reviewer_id: (document.getElementById('rid').value || 'reviewer_unnamed').trim(),
    reviewer_background: document.getElementById('bg').value.trim() || undefined,
    submitted_at: new Date().toISOString(),
    cases: Object.values(byCase)
  };
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'response_' + out.reviewer_id + '.json';
  a.click();
}
function updateProgress(){
  const all = document.querySelectorAll('input[data-case]');
  const done = [...all].filter(e => e.value !== '').length;
  document.getElementById('progress').textContent = done + ' / ' + all.length + ' scored';
}
document.addEventListener('input', updateProgress);
updateProgress();
</script>
</body></html>`;
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);

  const aggregateDir = arg("--aggregate");
  if (aggregateDir) {
    const packet = JSON.parse(fs.readFileSync(path.join(aggregateDir, "packet.json"), "utf-8"));
    const key = JSON.parse(fs.readFileSync(path.join(aggregateDir, "key.json"), "utf-8"));
    const responseFiles = fs
      .readdirSync(aggregateDir)
      .filter((f) => f.startsWith("response") && f.endsWith(".json"));
    if (!responseFiles.length) {
      console.error(`No response*.json files found in ${aggregateDir}.`);
      process.exit(1);
    }
    const responses: HumanBenchmarkResponse[] = responseFiles.map((f) =>
      JSON.parse(fs.readFileSync(path.join(aggregateDir, f), "utf-8"))
    );
    const repo = new BenchmarkDatasetRepository();
    const results = await BenchmarkComparisonEngine.runAll(repo.getCases(), { mode: "offline" });
    const report = HumanBenchmarkAggregator.aggregate(packet, key, responses, results);
    console.log(HumanBenchmarkAggregator.format(report));
    fs.writeFileSync(path.join(aggregateDir, "human_report.json"), JSON.stringify(report, null, 2));
    console.log(`\nWrote human_report.json to ${aggregateDir}/`);
    return;
  }

  const outDir = arg("--out") || ".human-benchmark";
  const seed = Number(arg("--seed") || 20260908);
  const limit = arg("--cases") ? Number(arg("--cases")) : undefined;

  const repo = new BenchmarkDatasetRepository();
  const allCases = repo.getCases();
  console.log(`Running ${allCases.length} cases to produce the two sides…`);
  const results = await BenchmarkComparisonEngine.runAll(allCases, { mode: "offline" });

  const caseIds = limit ? results.slice(0, limit).map((r) => r.case_id) : undefined;
  const { packet, key, audit } = HumanBenchmarkPreparer.prepare(results, allCases, { seed, caseIds });

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "packet.json"), JSON.stringify(packet, null, 2));
  fs.writeFileSync(path.join(outDir, "key.json"), JSON.stringify(key, null, 2));
  fs.writeFileSync(path.join(outDir, "review_form.html"), buildForm(packet));
  fs.writeFileSync(path.join(outDir, "blindness_audit.txt"), HumanBenchmarkPreparer.formatAudit(audit));

  console.log(`\n${HumanBenchmarkPreparer.formatAudit(audit)}`);
  console.log(
    `\nWrote packet.json (${packet.cases.length} cases × ${packet.criteria.length} criteria), key.json, ` +
      `review_form.html and blindness_audit.txt to ${outDir}/`
  );
  if (!audit.blind) {
    console.log("\n⚠ DO NOT SEND THIS PACKET. The blindness audit failed — a reviewer could identify the systems,");
    console.log("  and the responses would not be evidence. Fix the findings above and rebuild.");
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
