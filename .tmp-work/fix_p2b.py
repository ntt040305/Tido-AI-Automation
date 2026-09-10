import io, os

# ── FIX 4: category must be a controlled token, or undefined ─────────────
p = "lib/image-engine/reasoning/CreativeContextExtractor.ts"
s = io.open(p, encoding="utf-8").read()

old = """const BRAND_POSITION_RULES: [RegExp, string][] = ["""
new = """/**
 * Product category, as a controlled token.
 *
 * Passing raw product text through this axis looks harmless and is not: knowledge
 * declaring `category: skincare` was excluded from a skincare brief because the
 * query carried "Tone Brightening Capsule Ampoule". An axis is only useful if both
 * sides speak the same vocabulary, so an unrecognised product resolves to
 * undefined and simply stops constraining the match.
 */
const CATEGORY_RULES: [RegExp, string][] = [
  [/serum|ampoule|essence|moisturi[sz]er|cleanser|toner|skincare|dưỡng da|tinh chất/i, "skincare"],
  [/lipstick|foundation|mascara|makeup|son môi|trang điểm/i, "makeup"],
  [/perfume|fragrance|nước hoa/i, "fragrance"],
  [/coffee|espresso|latte|cà phê/i, "coffee"],
  [/tea|trà/i, "tea"],
  [/beer|wine|spirit|bia|rượu/i, "alcohol"],
  [/scarf|dress|shirt|jacket|apparel|clothing|khăn|áo|quần/i, "apparel"],
  [/bag|handbag|shoe|sneaker|túi|giày/i, "accessories"],
  [/phone|laptop|headphone|earbud|speaker|tai nghe|điện thoại/i, "consumer_electronics"],
  [/apartment|condo|townhouse|villa|căn hộ|nhà phố/i, "residential_property"],
];

const BRAND_POSITION_RULES: [RegExp, string][] = ["""
assert old in s, "fix4 anchor missing"
s = s.replace(old, new, 1)

old2 = """    // `category` is the product category within an industry. There is no
    // controlled vocabulary for it yet, so the raw product text is carried
    // through rather than invented.
    query.category = brief.product?.trim() || undefined;"""
new2 = """    // Controlled token only. An unrecognised product leaves the axis undefined,
    // which stops it constraining retrieval rather than excluding the very
    // knowledge that was authored for it.
    query.category = brief.product ? firstMatch(CATEGORY_RULES, brief.product) : undefined;
    query.category ||= firstMatch(CATEGORY_RULES, blob);"""
assert old2 in s, "fix4b anchor missing"
s = s.replace(old2, new2)
io.open(p, "w", encoding="utf-8").write(s)
print("FIX 4: category resolves to a controlled token or undefined")

# ── FIX 5: methodology must never become the big idea ────────────────────
p = "lib/image-engine/reasoning/CreativeConceptEngine.ts"
s = io.open(p, encoding="utf-8").read()

old = """    const eligible = (r: ScoredReasoningKnowledge) => r.object.knowledge_type !== "anti_pattern";
    for (const domain of ["strategy", "concept", "audience"]) {
      const hit = retrieved.filter((r) => String(r.object.domain) === domain && eligible(r))[0];
      if (hit) return hit;
    }
    return this.pickStrategic(retrieved).filter(eligible)[0] || retrieved.filter(eligible)[0] || retrieved[0];"""
new = """    // A `framework` or `principle` describes HOW to build a concept; an
    // `anti_pattern` describes what to avoid. None of the three is a campaign
    // idea, and letting one lead produced the same big idea for a skincare launch
    // and a fashion social ad — methodology restated as creative.
    const eligible = (r: ScoredReasoningKnowledge) =>
      !["anti_pattern", "framework", "principle", "evaluation_rule", "production_rule"].includes(
        String(r.object.knowledge_type)
      );

    for (const domain of ["strategy", "concept", "audience"]) {
      const hit = retrieved.filter((r) => String(r.object.domain) === domain && eligible(r))[0];
      if (hit) return hit;
    }
    return this.pickStrategic(retrieved).filter(eligible)[0] || retrieved.filter(eligible)[0] || retrieved[0];"""
assert old in s, "fix5 anchor missing"
s = s.replace(old, new)
io.open(p, "w", encoding="utf-8").write(s)
print("FIX 5: methodology knowledge can no longer lead the big idea")

# ── Seed a fashion strategy object so the domain is not blind ────────────
body = """
knowledge_id: strategy.self_expression.fashion_social.001
name: Self-expression framing for fashion social advertising
domain: strategy
sub_domain: self_expression
knowledge_type: decision_rule
creative_stage: [strategy, concept]
context:
  industry: fashion
  category: [apparel, accessories]
  audience: "*"
  objective: [awareness, product_launch]
  channel: [instagram, tiktok, facebook]
  asset_type: "*"
  brand_position: "*"
problem: >-
  Fashion social advertising presents garments as merchandise, which asks the
  viewer to evaluate a product when they are actually shopping for a version of
  themselves.
human_insight:
  functional_need: Clothing that fits the occasion and the body
  emotional_need: To feel like the version of themselves they intend to be
  social_need: To be read as distinctive rather than assembled from a template
decision: >-
  Lead the campaign with a character carrying a specific attitude, and treat the
  garment as evidence of that attitude rather than as the subject.
reasoning: >-
  This category sells identity, not textile. A viewer scrolls past merchandise and
  stops for a person whose stance they recognise or want.
why_this_works: >-
  Attitude is legible at thumbnail scale and survives feed compression, while
  garment detail does not, so the identity claim lands before the product does.
use_when:
  - Fashion or accessories advertising on a social channel
  - Objective is awareness, launch or brand building
avoid_when:
  - E-commerce listing imagery where literal product clarity is the requirement
  - Fit, size or construction demonstration
trade_off:
  advantage: Higher stop rate, stronger brand attribution and identity association
  limitation: Less literal product information per asset
  suitable_conditions: Social-first brand campaigns
  unsuitable_conditions: Catalogue and product detail systems
alternatives:
  - Movement-led capture where garment behaviour carries the story
  - Creator-led delivery where the creator supplies the identity signal
anti_patterns:
  - problem: Garment presented as merchandise on a neutral ground with a blank expression
    why_it_fails: Offers nothing to identify with, so the viewer evaluates price instead of desire
    replacement: A character with a specific readable stance, wearing the garment as evidence
impact: Raises stop rate and shifts evaluation from price to identity.
impact_score: 9
priority: 9
confidence: 0.86
context_relevance: 0.85
related_knowledge:
  - differentiation.fashion.category_cliches.001
  - audience.gen_z.authenticity_signals.001
source: CIOS Phase 2 seed - Core Creative Brain
"""
path = os.path.join("data/cios-knowledge/strategy", "self_expression_fashion_social.yaml")
io.open(path, "w", encoding="utf-8").write(body.lstrip("\n"))
print("SEEDED: " + path)

# ── Update test expectations to the corrected behaviour ──────────────────
p = "lib/image-engine/run-knowledge-quality-tests.ts"
s = io.open(p, encoding="utf-8").read()
s = s.replace('assert.ok(corpus.length >= 12, `expected at least 12 objects, got ${corpus.length}`);',
              'assert.ok(corpus.length >= 13, `expected at least 13 objects, got ${corpus.length}`);')
s = s.replace('assert.ok(/continuity of identity/i.test(skin.concept.big_idea), skin.concept.big_idea);',
              'assert.ok(/continuity of identity/i.test(skin.concept.big_idea), skin.concept.big_idea);')
io.open(p, "w", encoding="utf-8").write(s)
print("test expectations updated")
