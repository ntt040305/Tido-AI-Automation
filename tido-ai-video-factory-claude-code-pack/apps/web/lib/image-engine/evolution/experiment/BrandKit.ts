/**
 * Phase 5.4 — the Brand Kit, as the engine sees it.
 *
 * A brand's standing identity: its colours, its fonts, the style it wants and
 * the styles it refuses, and whether it has a logo. Stored against a project
 * (`projects.brand_context`) above the engine boundary; what crosses into the
 * engine is this plain object -- no account, no id, no bytes. The logo itself
 * travels as an ordinary LOGO-role reference image, exactly as an uploaded logo
 * always has, so the renderer sees the real mark rather than a description.
 *
 * AUTHORITY
 * ---------
 * A brand kit is the client speaking, so it outranks the director's taste --
 * but not the brief in front of it, and never the text requirement: the kit's
 * fonts decide how the client's words LOOK, and nothing here can add a word.
 */

export type BrandColorRole = "primary" | "secondary" | "accent" | "text" | "background";

export interface BrandColor {
  hex: string;
  role: BrandColorRole;
  name?: string;
}

export interface BrandKit {
  name: string;
  colors: BrandColor[];
  fonts: { heading?: string; body?: string };
  style: {
    /** Styles the brand wants, in its own words. */
    preferred: string[];
    /** Styles the brand refuses. A route that proposes one is marked down. */
    forbidden: string[];
    /** How the brand sets type, in its own words. */
    typography_preference?: string;
    /** Short descriptions of reference work the brand points to. */
    references: string[];
  };
  /** A logo is stored and will be attached to the render as a LOGO reference. */
  has_logo: boolean;
}

const COLOR_ROLES: BrandColorRole[] = ["primary", "secondary", "accent", "text", "background"];
const MAX_COLORS = 8;
const MAX_LIST = 10;

const text = (v: unknown, max: number): string => {
  const s = typeof v === "string" ? v.replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim() : "";
  return s.slice(0, max);
};
const list = (v: unknown, max = 80): string[] =>
  Array.isArray(v) ? [...new Set(v.map((x) => text(x, max)).filter(Boolean))].slice(0, MAX_LIST) : [];

/** `#rgb` or `#rrggbb`, normalised to lower-case `#rrggbb`, or null. */
export function normalizeHex(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/.exec(s);
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return `#${h}`;
}

/**
 * Validates and bounds a brand kit from storage or from a request. Everything
 * is optional except a name; an unusable field is dropped rather than guessed.
 */
export function normalizeBrandKit(raw: unknown): BrandKit | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, any>;
  const name = text(r.name, 80);
  if (!name) return null;

  const colors: BrandColor[] = [];
  for (const c of Array.isArray(r.colors) ? r.colors : []) {
    const hex = normalizeHex(typeof c === "string" ? c : c?.hex);
    if (!hex || colors.some((x) => x.hex === hex)) continue;
    const role = COLOR_ROLES.includes(c?.role) ? (c.role as BrandColorRole) : colors.length === 0 ? "primary" : "secondary";
    colors.push({ hex, role, ...(text(c?.name, 40) ? { name: text(c?.name, 40) } : {}) });
    if (colors.length >= MAX_COLORS) break;
  }

  const fonts: BrandKit["fonts"] = {};
  const heading = text(r.fonts?.heading, 60);
  const body = text(r.fonts?.body, 60);
  if (heading) fonts.heading = heading;
  if (body) fonts.body = body;

  return {
    name,
    colors,
    fonts,
    style: {
      preferred: list(r.style?.preferred),
      forbidden: list(r.style?.forbidden),
      ...(text(r.style?.typography_preference, 200) ? { typography_preference: text(r.style?.typography_preference, 200) } : {}),
      references: list(r.style?.references, 200),
    },
    has_logo: Boolean(r.has_logo),
  };
}

export function colorFor(kit: BrandKit | null | undefined, ...roles: BrandColorRole[]): string | null {
  for (const role of roles) {
    const c = kit?.colors.find((x) => x.role === role);
    if (c) return c.hex;
  }
  return null;
}

/** WCAG relative luminance contrast between two hex colours, 1..21. */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const n = normalizeHex(hex);
    if (!n) return 0;
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(n.slice(i, i + 2), 16) / 255).map((c) =>
      c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4),
    );
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/** Black or white, whichever reads better on `background`. */
export function readableOn(background: string): string {
  return contrastRatio("#ffffff", background) >= contrastRatio("#111111", background) ? "#ffffff" : "#111111";
}

const palette = (kit: BrandKit) =>
  kit.colors.map((c) => `${c.role} ${c.hex}${c.name ? ` (${c.name})` : ""}`).join(", ");

/**
 * Whether the image carries text. A brand's fonts only matter when it does: in
 * "none" mode the font lines are left out entirely, so a brand kit can never
 * be read as an invitation to add typography nobody supplied.
 */
export type BrandTextMode = "exact" | "none";

/** The Creative Director's brief block. Absent kit, absent block. */
export function brandKitBrief(kit: BrandKit | null | undefined, textMode: BrandTextMode = "exact"): string | undefined {
  if (!kit) return undefined;
  const lines = [`BRAND KIT — ${kit.name}. The client's standing identity: it outranks your taste, not the brief above.`];
  if (kit.colors.length) lines.push(`  Palette: ${palette(kit)}. Build the colour story from these.`);
  if (textMode === "exact" && (kit.fonts.heading || kit.fonts.body)) {
    lines.push(`  Fonts: ${[kit.fonts.heading && `headings in ${kit.fonts.heading}`, kit.fonts.body && `supporting text in ${kit.fonts.body}`].filter(Boolean).join(", ")}.`);
  }
  if (textMode === "exact" && kit.style.typography_preference) lines.push(`  Typography preference: ${kit.style.typography_preference}.`);
  if (kit.style.preferred.length) lines.push(`  Preferred style: ${kit.style.preferred.join(", ")}.`);
  if (kit.style.forbidden.length) lines.push(`  Never propose: ${kit.style.forbidden.join(", ")}. A route built on any of these is wrong for this brand.`);
  if (kit.style.references.length) lines.push(`  Reference work the brand points to: ${kit.style.references.join("; ")}.`);
  if (kit.has_logo) lines.push("  The brand's logo is attached as a reference image and will appear once, unaltered.");
  return lines.join("\n");
}

/** The render prompt's brand block, appended near the end with the text directive. */
export function brandKitDirective(
  kit: BrandKit | null | undefined,
  textMode: BrandTextMode = "exact",
  /**
   * Phase 5.5. `logo: false` when the logo is placed as its own layer after the
   * render (Editable mode): the renderer must then leave it out entirely.
   */
  opts: { logo?: boolean } = {},
): string | undefined {
  if (!kit) return undefined;
  const lines = [`BRAND KIT — ${kit.name}.`];
  if (kit.colors.length) lines.push(`Use the brand palette for the colour story and any designed elements: ${palette(kit)}. Do not introduce competing accent colours.`);
  if (textMode === "exact" && (kit.fonts.heading || kit.fonts.body)) {
    lines.push(`Set the supplied text in the brand's fonts: ${[kit.fonts.heading && `${kit.fonts.heading} for headings`, kit.fonts.body && `${kit.fonts.body} for supporting text`].filter(Boolean).join(", ")}.`);
  }
  if (kit.style.preferred.length) lines.push(`The overall style should read as: ${kit.style.preferred.join(", ")}.`);
  if (kit.style.forbidden.length) lines.push(`Avoid entirely: ${kit.style.forbidden.join(", ")}.`);
  if (kit.has_logo && opts.logo !== false) lines.push("Place the attached brand logo exactly once, unaltered — same shape, colours and proportions — small, in a clear corner, never on the product.");
  return lines.join("\n");
}

/** Forbidden styles a piece of prose proposes. Case-insensitive, whole phrase. */
export function forbiddenStylesIn(fields: (string | null | undefined)[], kit: BrandKit | null | undefined): string[] {
  if (!kit?.style.forbidden.length) return [];
  const prose = fields.filter(Boolean).join(" ").toLowerCase();
  return kit.style.forbidden.filter((f) => {
    const needle = f.toLowerCase();
    return needle && new RegExp(`(^|[^\\p{L}])${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}])`, "u").test(prose);
  });
}

/** Preferred styles a piece of prose embodies. Same matching rule. */
export function preferredStylesIn(fields: (string | null | undefined)[], kit: BrandKit | null | undefined): string[] {
  if (!kit?.style.preferred.length) return [];
  return forbiddenStylesIn(fields, { ...kit, style: { ...kit.style, forbidden: kit.style.preferred } });
}

/** A style the brand calls premium or minimal wants more empty space. */
export function wantsGenerousSpace(kit: BrandKit | null | undefined): boolean {
  return Boolean(kit?.style.preferred.some((p) => /minimal|premium|luxury|clean|airy|elegant|tối giản|sang trọng|cao cấp/i.test(p)));
}

export function brandKitTelemetry(kit: BrandKit | null | undefined) {
  if (!kit) return { brand_kit: false };
  return {
    brand_kit: true,
    colors: kit.colors.length,
    fonts: Number(Boolean(kit.fonts.heading)) + Number(Boolean(kit.fonts.body)),
    preferred: kit.style.preferred.length,
    forbidden: kit.style.forbidden.length,
    has_logo: kit.has_logo,
  };
}
