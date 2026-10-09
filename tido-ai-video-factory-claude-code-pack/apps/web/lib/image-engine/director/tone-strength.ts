/**
 * Which tone words may decide how bold a frame is — and which may not.
 *
 * The defect this fixes
 * --------------------
 * `CreativeApproach` read every term in `ConceptStructuringLayer`'s `TONES`
 * table as evidence of a desired treatment. Measured against real briefs, that
 * was wrong often enough to be useless:
 *
 *   - "Chai serum **cao cấp** đặt trên bệ đá obsidian đen mờ…" — the form's own
 *     placeholder — scored `premium` and inferred *restrained*. "cao cấp" there
 *     describes the product's tier, not the picture's treatment.
 *   - A juice brief saying "rau má **tươi**" scored `energetic` and inferred
 *     *bold*. "tươi" describes the leaves.
 *   - "sản phẩm **nổi bật**" scored `energetic`. "nổi bật" names a goal every
 *     advertisement has; it says nothing about how to light or compose.
 *
 * The principle
 * ------------
 * A term may drive the inference only when it states a **desired treatment** —
 * how the picture should look. It may not when it is a generic adjective, a
 * product attribute, or a goal the brief would have anyway. Applied to all 27
 * terms in the table, not only the ones that were reported.
 *
 * Why this is a separate table rather than a filter
 * ------------------------------------------------
 * `TONES` is read by `parse()`, whose `intent.tone` contract other layers depend
 * on, so it is not edited. A pure filter over its matches was the first design
 * and could not work: the strong set has to be able to contain a term the table
 * lacks. "táo bạo" is the word this product's own UI puts in front of the user
 * ("Táo bạo & sáng tạo") and the table has never held it, so a user typing the
 * label back at us matched nothing.
 *
 * Pure, and isomorphic: no imports, no I/O, no clock.
 */

/** The groups that argue for restraint, and the groups that argue for boldness. */
export const RESTRAINED_TONES = ["premium", "minimal"] as const;
export const BOLD_TONES = ["bold", "energetic"] as const;

export interface ToneHit {
  tone: string;
  /** The text that matched, verbatim, so a surprising reading can be traced. */
  match: string;
  /** True when it matched only after accents were folded away. */
  unaccented?: boolean;
}

/**
 * Terms that state a treatment. These decide.
 *
 * Every term here is multi-syllable or an unambiguous English design word. Single
 * generic syllables are deliberately absent: see WEAK_TERMS.
 */
export const STRONG_TERMS: { tone: string; terms: string[] }[] = [
  { tone: "premium", terms: ["sang trọng", "luxury", "elegant"] },
  { tone: "minimal", terms: ["tối giản", "đơn giản", "minimal"] },
  { tone: "energetic", terms: ["năng động", "playful", "vibrant"] },
  // "táo bạo" is not in the TONES table. It is added because it is the exact
  // phrase this product's own control offers the user.
  { tone: "bold", terms: ["táo bạo", "bold", "striking"] },
];

/**
 * Terms that do not decide, and why each one does not.
 *
 * Kept in code rather than in a comment so a test can assert that every term in
 * the real `TONES` table is accounted for in exactly one of these two lists — a
 * term added to the table later cannot quietly start or stop driving the level.
 */
export const WEAK_TERMS: { term: string; tone: string; why: string }[] = [
  // ── premium ──
  { term: "cao cấp", tone: "premium", why: "product tier, not treatment — it is the form's own placeholder, 'Chai serum cao cấp'" },
  { term: "premium", tone: "premium", why: "the English of 'cao cấp', and used the same way: 'premium ingredients', 'premium serum'" },
  // ── minimal ──
  { term: "sạch", tone: "minimal", why: "product attribute — 'da sạch', 'sạch mụn', 'sạch khuẩn'" },
  { term: "clean", tone: "minimal", why: "the English of 'sạch', and dominant in beauty as a claim: 'clean beauty', 'clean formula'" },
  // ── energetic ──
  { term: "vui", tone: "energetic", why: "generic adjective, one syllable" },
  { term: "tươi", tone: "energetic", why: "product attribute — 'rau má tươi', 'tươi mát', 'tươi mỗi ngày'" },
  { term: "fun", tone: "energetic", why: "the English of 'vui'; generic" },
  { term: "nổi bật", tone: "energetic", why: "a goal every advertisement has, not a treatment — 'sản phẩm nổi bật'" },
  // ── bold ──
  { term: "mạnh", tone: "bold", why: "generic, one syllable, and usually a product claim — 'công thức mạnh', 'mùi mạnh'" },
  { term: "ấn tượng", tone: "bold", why: "a desired effect, not a treatment; the same kind of word as 'nổi bật'" },
  { term: "gây chú ý", tone: "bold", why: "a goal — attract attention — which says nothing about light or composition" },
  // ── warm ──
  // The warm group never signals either way (a brief about temperature has not
  // said how daring the frame should be), so these are weak by construction.
  { term: "ấm áp", tone: "warm", why: "the warm group never signals a level" },
  { term: "thân thiện", tone: "warm", why: "the warm group never signals a level" },
  { term: "warm", tone: "warm", why: "the warm group never signals a level" },
  { term: "friendly", tone: "warm", why: "the warm group never signals a level" },
  { term: "gần gũi", tone: "warm", why: "the warm group never signals a level" },
];

/**
 * Strip Vietnamese diacritics. `đ`/`Đ` are letters, not accented `d`, so NFD
 * leaves them alone and they are mapped by hand.
 */
export function stripAccents(text: string): string {
  return String(text || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

/** Syllables in a Vietnamese term: whitespace-separated. */
function syllables(term: string): string[] {
  return term.split(/\s+/).filter(Boolean);
}

/**
 * Phrases that make an accent-folded term mean something else entirely.
 *
 * Folding accents is not free. Unaccented "sang trong" is "sang trọng", but it is
 * also the start of "sang trong suốt" (becomes transparent) and "sang trong nhà"
 * (to indoors) — both ordinary in a product brief, where "trong" is a
 * preposition rather than half of "trọng". Measured: "nền chuyển sang trong suốt"
 * would otherwise have inferred restrained from a sentence about a background.
 *
 * Only the folded form needs this. With its accents written, "sang trọng" cannot
 * collide with "trong" at all.
 */
const FOLD_COLLISIONS: Record<string, string[]> = {
  "sang trong": ["suot", "nha", "veo", "vat", "treo", "lanh", "sang"],
};

/**
 * A word boundary that works on Vietnamese.
 *
 * The same device as `ConceptStructuringLayer.vn()`: `\b` is ASCII-only and so
 * never matches at the end of a string ending in a Vietnamese letter. Duplicated
 * rather than imported to keep this module import-free.
 */
function boundaried(body: string): RegExp {
  return new RegExp("(?<![\\p{L}\\p{N}])(?:" + body + ")(?![\\p{L}\\p{N}])", "iu");
}

/** "tối giản" → /tối\s?giản/ with boundaries, matching "tốigiản" too, as the table does. */
function termPattern(term: string): RegExp {
  return boundaried(syllables(term).map(escapeRegExp).join("\\s?"));
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The folded pattern for a term, or null when the term must not be folded.
 *
 * Single syllables are never folded, which is the whole safety property: folding
 * "tươi" would make it match "tuổi" ("độ tuổi 25-34") and "tuoi", and folding
 * "mạnh" would match "manh"/"mảnh" ("kết cấu mỏng nhẹ" briefs say "mảnh" often).
 * Two syllables that both have to line up is a much harder accident.
 */
function foldedPattern(term: string): RegExp | null {
  if (syllables(term).length < 2) return null;
  const folded = stripAccents(term);
  if (folded === term) return null; // an English term; nothing to fold.
  const body = syllables(folded).map(escapeRegExp).join("\\s?");
  const blocked = FOLD_COLLISIONS[folded];
  const guard = blocked ? `(?!\\s+(?:${blocked.join("|")})(?![\\p{L}\\p{N}]))` : "";
  return new RegExp("(?<![\\p{L}\\p{N}])(?:" + body + ")" + guard + "(?![\\p{L}\\p{N}])", "iu");
}

interface CompiledTerm {
  tone: string;
  term: string;
  accented: RegExp;
  folded: RegExp | null;
}

const COMPILED: CompiledTerm[] = STRONG_TERMS.flatMap((group) =>
  group.terms.map((term) => ({
    tone: group.tone,
    term,
    accented: termPattern(term),
    folded: foldedPattern(term),
  })),
);

/** Every strong term that is folded, for the report and for the tests. */
export const FOLDED_TERMS: string[] = COMPILED.filter((c) => c.folded).map((c) => c.term);

/**
 * The strong tone groups present in the text.
 *
 * One entry per group, not per term, so "sang trọng và tối giản" reports premium
 * and minimal once each rather than a tally.
 */
export function strongTonesIn(text: string): ToneHit[] {
  const subject = String(text || "");
  const stripped = stripAccents(subject);
  const byTone = new Map<string, ToneHit>();

  for (const c of COMPILED) {
    if (byTone.has(c.tone)) continue;
    const direct = subject.match(c.accented);
    if (direct) {
      byTone.set(c.tone, { tone: c.tone, match: direct[0] });
      continue;
    }
    if (c.folded) {
      const folded = stripped.match(c.folded);
      if (folded) byTone.set(c.tone, { tone: c.tone, match: folded[0], unaccented: true });
    }
  }

  // Table order, so the reason line is stable for a given text.
  return STRONG_TERMS.map((g) => byTone.get(g.tone)).filter((h): h is ToneHit => Boolean(h));
}
