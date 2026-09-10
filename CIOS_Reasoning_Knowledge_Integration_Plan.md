# CIOS — Reasoning Knowledge Integration Plan

**Standard of record:** `REASONING_KNOWLEDGE_STANDARD_V2.md`
**Companion documents:** `CIOS_Level9_Core_Architecture_v2.md` · `CIOS_Level9_Knowledge_Domain_Map.md` · `CIOS_Level9_Creative_Knowledge_Database_Specification.md` · `CIOS_Level9_Agency_Creative_Playbook.md`
**Date:** 2026-09-07 · **Status:** Design only. No code written, no knowledge authored.

## Preservation contract

| Component | File | Guarantee |
|---|---|---|
| Campaign Builder | `campaign/CampaignBuilderService.ts` | **Zero changes** |
| Art Direction Resolver | `service/ArtDirectionResolverService.ts` | **Zero changes** |
| Prompt Compiler | `compiler/MasterPromptCompilerService.ts` | **Zero changes** |
| Rendering pipeline | `provider/ImgStudio*`, `api/campaign/render-asset`, `delivery/*` | **Zero changes** |

This plan achieves that guarantee not by careful avoidance but because **the integration seams already exist as typed inputs**. See §1.4.

---

# 0. Headline finding

**The existing engine already has a service whose entire job is converting knowledge into art-direction decisions, and a typed input slot to receive it.**

`ArtDirectionResolverService.ts:97-105` declares:

```ts
export interface ArtDirectionResolverInput {
  lockedIntent: LockedIntent;                          // → USER tier          (1.00)
  inspirationStyleManifest?: InspirationStyleManifest; // → REFERENCE tier     (0.85)
  marketingStrategy?: MarketingBrainStrategy;          // → STRATEGY tier      (0.65)  ◄ seam A
  knowledgeDirection?: KnowledgeCreativeDirection;     // → KNOWLEDGE tier     (0.50)  ◄ seam B
  assetDefaults?: VisualExecutionDirectives;           // → ASSET_DEFAULT tier (0.35)
  assetType?: string;
  aspectRatio?: string;
}
```

`knowledgeDirection` is typed as `CreativeDirection` from `CreativeKnowledgeService.ts:3-10`:

```ts
export interface CreativeDirection {
  visual_style: string;      camera_direction: string;
  lighting_direction: string; composition_strategy: string;
  typography_strategy: string; color_strategy: string;
  quality_checks: string[];
}
```

**Reasoning Knowledge enters the engine by populating these two existing slots more intelligently.** Nothing downstream changes — the resolver scores the candidates it is handed, the compiler assembles what the resolver returns, the renderer renders what the compiler produced.

That reduces this integration from "add a layer to the pipeline" to "add a better producer behind two existing typed inputs".

---

# 1. Current Knowledge Pipeline Compatibility

## 1.1 Compatible — repository accepts a second corpus with zero class changes

`LocalKnowledgeRepository.ts:21`:

```ts
knowledgeDir: string = IMAGE_ENGINE_CONFIG.KNOWLEDGE_DIR,
```

The directory is a **constructor parameter with a default**. A second instance pointed at `data/cios-knowledge/` requires no modification to the class.

The interface documents this intent explicitly (`KnowledgeRepository.ts:9-13`):

> *"Switching from Local Filesystem to Database / Vector DB requires ZERO rewriting of caller services."*

**Verdict: compatible.** Layer 2 gets its own repository instance.

## 1.2 Blocking — the v1 schema will reject every V2 object

`data/schemas/knowledge_block_schema_v1.json`:

- `additionalProperties: false`
- **23 required fields** including `scope`, `keywords`, `aliases`, `semantic_tags`, `routing_dimensions`, `match_rules`, `covers`, `genericity`, `creative_recipe`, `content_file`

A V2 object carrying `human_insight`, `problem`, `reasoning`, `alternatives`, `impact` fails on `additionalProperties`, and omitting `genericity`/`creative_recipe`/`scope` fails on `required`.

**Two enforcement points, different strictness:**

| Path | Strictness | Consequence |
|---|---|---|
| Load (`LocalKnowledgeRepository.ts:242`) | Checks only `id`, `knowledge_type`, `version` | V2 blocks would *load* |
| `validateRepository()` (line 192+) | Full schema | V2 blocks in `data/knowledge/` would **break repository validation** |

**Verdict: V2 objects must never be placed in `data/knowledge/`.** This is decisive for the directory design and confirms the two-corpus separation is required, not merely tidy.

## 1.3 Compatible — a knowledge→direction converter already exists

`CreativeKnowledgeService` already performs the exact transformation Layer 2 needs: knowledge in, six art-direction dimensions out, capped at `MAX_GUIDANCE_CHARS = 1500`.

**Verdict:** Layer 2 needs a *sibling* of this service, not a new architecture. The output contract is already defined and already consumed.

## 1.4 Compatible — the two seams are typed, optional, and already wired

`MasterPromptCompilerService.ts:634-636` populates both slots today:

```ts
marketingStrategy: input.marketingStrategy,
knowledgeDirection: creativeRes.creativeDirection,
```

Both are optional (`?`). Enriching what flows into them changes no signature.

## 1.5 Incompatible — retrieval cannot select on V2 context

V2 §5 mandates that every object declare seven context fields: `industry, category, audience, objective, channel, asset_type, brand_position`.

Current routing (`routing_dimensions`) offers: `categories, industry_domains, materials, contents, properties, geometry_traits, packaging_types, visual_challenges` — physical, not commercial. Of the seven V2 fields, only `industry` and `category` have any counterpart, and both are populated on just **2 of 20** blocks (`material.glass`, `property.transparent`).

**Verdict: the retrieval selector must be extended.** This is the single largest engineering item in the plan (§3).

## 1.6 Compatibility summary

| Area | Status | Action |
|---|---|---|
| Repository loading | ✅ Compatible | Second instance, no class change |
| Repository interface | ✅ Compatible | Designed for exactly this |
| v1 JSON schema | ⛔ Blocking | Separate schema, separate directory |
| Resolver input contract | ✅ Compatible | Two typed slots already exist |
| Knowledge→direction conversion | ✅ Compatible | Pattern proven by `CreativeKnowledgeService` |
| Retrieval selection | ⛔ Incompatible | Requires commercial context axes |
| Embedding index | ⚠️ Degraded | 7/20 indexed; separate Layer 2 index needed |
| Prompt budget | ✅ Compatible | Layer 2 never enters the image prompt |

---

# 2. Required Database Changes

No relational database is introduced. Storage stays filesystem, consistent with the current architecture.

## 2.1 New corpus directory (Database Spec §13)

```
data/cios-knowledge/
├── REASONING_KNOWLEDGE_STANDARD_V2.md      (copy of record)
├── _schema/
│   └── reasoning_knowledge_schema_v2.json  ← NEW, separate from v1
├── strategy/        audience/       category/
├── concept/         differentiation/ visual_direction/
├── layout/          typography/      color/
├── photography/     material/        channel/
├── production/      critic/          examples/
```

Each object: `<knowledge_id>.yaml` (or `.json`). V2 §3 is a flat field list — no separate content file is needed, unlike Layer 1's `metadata.json` + `knowledge.md` split.

## 2.2 New config entries

`config.ts` gains, alongside the existing `KNOWLEDGE_DIR`:

| Key | Value |
|---|---|
| `REASONING_KNOWLEDGE_DIR` | `data/cios-knowledge` |
| `REASONING_INDEX_PATH` | `data/indexes/reasoning_embeddings_v1.json` |
| `REASONING_CONTEXT_BUDGET_CHARS` | new — LLM context, not image prompt |

## 2.3 Separate embedding index

Layer 1 and Layer 2 must not share an index — different consumers, different retrieval budgets, different rebuild cadence.

**Precondition:** the existing Layer 1 index is stale (7 of 20 blocks, generated 2026-08-13) and self-repairs only when *absent* (`if (!indexSchema)`). Fix that first, or the same failure mode will be duplicated into Layer 2.

## 2.4 What does not change

`data/knowledge/` — untouched. All 20 blocks, `knowledge_block_schema_v1.json`, and `KNOWLEDGE_AUTHORING_STANDARD_V1.md` remain exactly as they are. V1 is the correct standard for Layer 1 (Core Architecture §4: model knowledge *"should remain relatively neutral"*).

---

# 3. Required Retrieval Changes

## 3.1 The missing mechanism

V2 §12 requires activation on eight axes: industry, product category, audience, objective, channel, asset type, brand positioning, creative direction. Today the brief carries most of these, they reach the LLM — and are then **discarded before retrieval runs**. `RoutingSignalExtractor` emits physical signals only.

This is why an observed live campaign retrieved identical knowledge for all five assets regardless of industry, audience or objective.

## 3.2 Target flow

```
BRIEF
  │
  ▼
CreativeContextExtractor                                     [NEW, small]
  emits the 7 V2 §5 context fields + creative_direction
  │
  ├──────────────────────────────┬──────────────────────────────┐
  ▼                              ▼                              ▼
LAYER 1 retrieval           LAYER 2 retrieval             Task context
SmartKnowledgeRetriever     ReasoningKnowledgeRetriever    (brief, refs,
[UNCHANGED, 9 stages]       [NEW — reuses the same         prior decisions)
  ↓                          9-stage components]
data/knowledge (20)          data/cios-knowledge
  ↓                              ↓
image prompt (≤19,400 ch)    LLM context (separate budget)
  ↓                              ↓
MasterPromptCompiler         ReasoningKnowledgeService
[UNCHANGED]                      ↓ produces CreativeDirection
                             ArtDirectionResolverInput
                             .knowledgeDirection / .marketingStrategy
                                 ↓
                             ArtDirectionResolver [UNCHANGED]
```

## 3.3 Component changes

| Component | Change | Preserves |
|---|---|---|
| `RoutingSignalExtractor` | Extend to emit commercial axes beside physical signals | Existing outputs unchanged |
| `MetadataKnowledgeMatcher` | Match V2 `context` fields when operating on Layer 2 | Layer 1 path untouched |
| `KnowledgeReRanker` | Apply V2 §13 scoring | Layer 1 ranking unchanged unless opted in |
| `SmartKnowledgeRetriever` | **Not modified.** A parallel `ReasoningKnowledgeRetriever` composes the same stage classes against the Layer 2 repository | Layer 1 fully intact |
| `KnowledgeBudgetManager` | New Layer 2 budget path; `MAX_SAFE_PROMPT_CHARS = 19400` untouched | Image prompt budget unchanged |

**Design choice — compose, don't parameterise.** Adding a `layer` flag to `SmartKnowledgeRetriever` would modify a component on the critical path of every existing render. Building a second retriever from the same stage classes (`CandidateFusion`, `KnowledgeReRanker`, `KnowledgeDeduplicator`, `MetadataKnowledgeMatcher`) leaves the proven path byte-identical.

## 3.4 Scale note

At Layer 2's target scale (~1,500 objects per the Domain Map), semantic retrieval is essential, not optional. The 9-stage architecture is correct for that volume — it is currently over-specified only because the corpus is 20 blocks.

---

# 4. Required Metadata Changes

## 4.1 Standard reconciliation — needs a ruling

`REASONING_KNOWLEDGE_STANDARD_V2.md` §3 and `CIOS_Level9_Reasoning_Knowledge_Schema.md` §2 specify **different schemas**. V2 is the standard of record, but the differences are material:

| Field | Reasoning_Knowledge_Schema.md | REASONING_KNOWLEDGE_STANDARD_V2 | Resolution |
|---|---|---|---|
| identifier | `id` | `knowledge_id` | Use V2 |
| industry slot | `category` | `sub_domain` (+ `context.category`) | Use V2 |
| relationships | `related_blocks` | `related_knowledge` | Use V2 |
| explanation | `reason` | `reasoning` **+** `why_this_works` | Use V2 (two fields) |
| **`authority_level`** | present (core/expert/specialized/experimental) | **absent** | See §4.2 |
| — | — | **adds** `problem`, `human_insight`, `alternatives`, `impact`, `priority` | Use V2 |

**Internal inconsistency inside V2 itself:** §3 lists `impact`, `priority`, `confidence`. §13 requires `priority`, `confidence`, `impact_score`, `context_relevance`. Two fields (`impact_score`, `context_relevance`) appear in §13 but not in the §3 schema, and §3's `impact` may or may not be §13's `impact_score`. **`[NEEDS RULING]`** — §5 of this plan assumes §3 is authoritative for structure and §13 adds two scoring fields.

## 4.2 Dropping `authority_level` is architecturally correct

My earlier implementation plan mapped `authority_level` to the resolver's five-tier ladder. **V2 removing it is right**, and the reason is worth recording:

The resolver's tiers describe **where a claim came from in this campaign** (client → reference → strategy → knowledge → default). `authority_level` would describe **how reliable a knowledge object is in general**. These are orthogonal.

All Layer 2 knowledge enters at the `KNOWLEDGE` tier (weight 0.50) regardless of its own reliability. Ranking *within* that tier is what `priority` and `confidence` do — and the resolver already multiplies `tier weight × confidence × specificity` (`ArtDirectionResolverService.ts:143-148`).

**No resolver change is required to honour V2 scoring.** Confidence maps to the existing `confidence` input; priority governs retrieval ordering upstream.

## 4.3 Layer 1 metadata — additive only

`knowledge_block_schema_v1.json` gains **optional** fields so Layer 1 blocks can declare commercial applicability without becoming decision knowledge:

| Field | Type | Purpose |
|---|---|---|
| `routing_dimensions.audience_segments` | `string[]` | Contextual activation |
| `routing_dimensions.objectives` | `string[]` | Contextual activation |
| `routing_dimensions.channels` | `string[]` | Contextual activation |
| `routing_dimensions.brand_positions` | `string[]` | Contextual activation |
| `reasoning_twin` | `string \| null` | Link to the Layer 2 object that decides *when* to use this block |

All optional; `additionalProperties: false` is preserved by declaring them explicitly. **No existing block is edited to remain valid.**

`reasoning_twin` is the mechanism that makes the 7 poster style blocks usable: each neutral Layer 1 style block points to a Layer 2 decision rule stating which strategy it serves.

## 4.4 Scoring field mapping

| V2 field | Existing Layer 1 analogue | Action |
|---|---|---|
| `priority` (1–10) | `priority` (85–100 across 20 blocks) | Rescale for Layer 2; leave Layer 1 alone |
| `confidence` | `information_value` (0.90–0.98) | Direct analogue |
| `context_relevance` | `genericity` (0.30–0.90, inverse) | Derive |
| `impact_score` | — | New |

---

# 5. Required LLM Context Changes

## 5.1 The separation that makes both standards correct

| | Layer 1 | Layer 2 |
|---|---|---|
| Consumer | Diffusion model | Reasoning LLM |
| Standard | V1 (creative-neutral) | V2 (prescriptive) |
| Destination | Image prompt | LLM message context |
| Budget | `MAX_SAFE_PROMPT_CHARS = 19400` | **New, independent** |
| Reaches the image model? | Yes, verbatim | **No — only its conclusions do** |

Layer 2 may say *"use a 50mm at f/2.8 with warm directional light, avoid crowded promotional layouts"* — prescriptive text that V1 explicitly forbids — because that sentence never reaches the diffusion model. It reaches the LLM, which decides, and the **decision** enters the prompt through `knowledgeDirection`.

This also removes the prompt-budget risk flagged in the audit: Layer 2 cannot evict `CAMPAIGN STRATEGY` or `BRAND KNOWLEDGE` because it never competes for that budget.

## 5.2 Injection format

V2 objects are structured YAML, not prose. They should reach the LLM **as structure**, not flattened narrative — the field names carry the reasoning contract:

```
[REASONING KNOWLEDGE — {domain}/{sub_domain}]
context:      industry · category · audience · objective · channel · asset_type · brand_position
problem:      …
human_insight: functional / emotional / social      (V2 §7)
decision:     …
reasoning:    …
why_this_works: …
use_when:     …
avoid_when:   …
trade_off:    …
alternatives: …
anti_patterns: …
impact:       …
```

`use_when` / `avoid_when` / `anti_patterns` are the fields that make the difference between retrieval and judgement. They must survive injection intact.

## 5.3 Per-stage context assembly

Different reasoning stages need different domains. V2 `creative_stage` is the selector:

| Stage | `creative_stage` filter | Domains |
|---|---|---|
| Audience analysis | `strategy` | audience, category |
| Category analysis | `strategy` | category |
| Differentiation | `concept` | differentiation, category |
| Concept development | `concept` | concept, strategy |
| Critique | `evaluation` | critic |
| Visual direction | `visual_direction` | visual_direction, layout, color, photography |

This is why `creative_stage` is a required V2 field: it is the primary context-assembly key, not documentation.

## 5.4 Existing LLM client — unchanged

`LLMProviderService.generateChatCompletion(messages, purpose, options)` already accepts a `purpose` tag at every call site (currently logged only). It becomes the stage selector. **No client change required.**

---

# 6. Required Prompt Compiler Changes

## **None.**

This is the strongest result of the analysis, and it follows from §0.

`MasterPromptCompilerService` receives `marketingStrategy` and `creativeRes.creativeDirection`, hands them to the resolver, and assembles the resolver's output. Layer 2 changes **what is in those objects**, never their shape.

| Concern | Why the compiler is unaffected |
|---|---|
| New section needed? | No. Reasoning output arrives as `CreativeDirection` — already compiled into `[RESOLVED ART DIRECTION]` |
| Budget impact? | None. Layer 2 text never enters the prompt |
| Section priority changes? | None. `PromptBudgetManagerService` priorities stay as-is |
| Provenance changes? | None required for integration (see below) |

## 6.1 One optional, additive enhancement

V2 §6 requires decision rules to carry `expected_effect`, and Core Architecture §15 requires traceability of Decision → Reason → **Knowledge Source** → **Expected Impact**.

Today `provenance.art_direction.decisions[]` carries `{dimension, value, source, confidence, specificity, score, client_locked, qualifiers}` — decision, source-tier and score, but **not** the human reason or the expected impact.

Adding two optional fields — `reason` and `expected_impact` — to that record achieves spec §15 compliance. It is:

- **Additive** — optional fields on an existing structure
- **Already surfaced** — the Campaign Studio renders this record per dimension
- **Already persisted** — written to `asset_plan.json` and export metadata
- **Not required for Layer 2 to function** — defer to a later phase if the compiler must stay literally untouched

**Recommendation:** treat as Phase 3, explicitly out of scope for initial integration, so the preservation contract holds absolutely during Phase 1–2.

---

# 7. Integration Architecture

```
                    ┌──────────── NEW ────────────────────────────┐
BRIEF ──► CreativeContextExtractor                                │
            │ 7 V2 context fields + creative_direction            │
            ▼                                                     │
          ReasoningKnowledgeRetriever ──► data/cios-knowledge/    │
            │ (composes existing stage classes)                   │
            ▼                                                     │
          Staged reasoning via LLMProviderService                 │
            audience → category → differentiation                 │
            → concepts(3) → critique → select                     │
            │                                                     │
            ▼                                                     │
          ReasoningKnowledgeService                               │
            emits: MarketingBrainStrategy  (enriched)             │
                   CreativeDirection       (Layer-2 informed)     │
                    └────────────────┬────────────────────────────┘
                                     │  existing typed slots
                                     ▼
        ┌──────── EXISTING ENGINE — UNCHANGED ─────────────────┐
        │ ArtDirectionResolverInput                            │
        │   .marketingStrategy   → STRATEGY tier  0.65         │
        │   .knowledgeDirection  → KNOWLEDGE tier 0.50         │
        │        ▼                                             │
        │ ArtDirectionResolverService                          │
        │ CampaignBuilderService · AssetAdaptationService      │
        │ CommercialLayoutService · MasterPromptCompilerService│
        │ PromptBudgetManagerService                           │
        └──────────────────────┬───────────────────────────────┘
                               ▼
                    ImgStudio → Delivery pipeline  [UNCHANGED]
```

---

# 8. Phased Integration

Each phase gates on **488 regression assertions passing unchanged**.

## Phase A — Preconditions (½ day, zero risk)

Fix the Layer 1 index before duplicating its failure mode: rebuild for all 20 blocks, add staleness detection (not just absence), wire an npm script. Move LLM config out of source. Load `knowledge_full.md`.

**No Layer 2 work. No new knowledge.**

## Phase B — Layer 2 substrate (3–5 days, low risk)

`reasoning_knowledge_schema_v2.json` · `data/cios-knowledge/` tree · config entries · `CreativeContextExtractor` · `ReasoningKnowledgeRetriever` · optional Layer 1 schema fields incl. `reasoning_twin`.

**Deliverable:** substrate that loads and retrieves an empty corpus without touching Layer 1. **No knowledge authored.**

## Phase C — First domain, proof of value (1 week, medium risk)

Author `differentiation/` for **beauty/skincare only** (~30 objects, V2-compliant) plus `critic/` evaluation rules (V2 §15, six criteria). Add the differentiation and critique reasoning stages. Route their output into `marketingStrategy` / `knowledgeDirection`.

**Measurement:** re-run the Skin1004 benchmark; compare concepts before/after. This phase proves or disproves the thesis on ~30 objects before ~1,500 are commissioned.

## Phase D — Breadth (2–3 weeks)

`category/` + `audience/` for the five categories already in `run-campaign-benchmark.ts`. `visual_direction/` reasoning twins for the 7 poster style blocks. Optional provenance extension (§6.1).

---

# 9. Risk Register

| ID | Risk | Mitigation |
|---|---|---|
| **RK1** | **Layer 2 text leaks into the image prompt** — the exact over-constraining V1 was written to prevent | Separate repository, retriever, and budget. Add a regression assertion that no `cios-knowledge` string appears in any compiled prompt |
| RK2 | V2 objects placed in `data/knowledge/` break `validateRepository()` | Separate directory + separate schema; enforce in the validator |
| RK3 | Duplicating the stale-index failure into Layer 2 | Phase A fixes Layer 1 first; Layer 2 index ships with staleness detection from day one |
| RK4 | Schema ambiguity (§4.1) causes rework after authoring begins | Resolve `[NEEDS RULING]` items before Phase C |
| RK5 | Latency growth from added reasoning stages | Run independent stages concurrently; cap critique at one revision |
| RK6 | Silent degradation — a stage falls back and the run still reports success | Every stage reports its source in diagnostics, as `strategy_source` already does |
| RK7 | Authoring becomes the bottleneck (~1,500 objects) | Phase C proves value on 30 before committing |

---

# 10. Open Rulings Required Before Authoring

1. **§13 vs §3 scoring fields.** Are `impact_score` and `context_relevance` (§13) required alongside `impact`, `priority`, `confidence` (§3)? Is `impact` the same as `impact_score`?
2. **`authority_level`.** Confirmed dropped from V2? §4.2 argues its removal is correct; the earlier `CIOS_Level9_Reasoning_Knowledge_Schema.md` still lists it.
3. **File format.** YAML (as written throughout V2) or JSON (consistent with Layer 1 tooling)? YAML is more readable for authors; JSON needs no new parser dependency.
4. **`sub_domain` vocabulary.** Free text or a controlled enum? Retrieval precision depends on this.
5. **`context` field cardinality.** May an object declare multiple industries/audiences, or exactly one each? Determines whether matching is set-intersection or equality.
6. **Layer 1 `reasoning_twin`** (§4.3) — accepted as the mechanism for linking neutral blocks to their decision rules?

---

# 11. Recommended Next Action

**Phase A, then resolve the six rulings in §10, then Phase B.**

Do not author V2 knowledge until §10.1–§10.5 are settled. Authoring against an ambiguous schema is the one mistake in this plan that is expensive to undo — every object would need rewriting.

The highest-value item available immediately is unrelated to Layer 2: **rebuilding the Layer 1 embedding index** makes 13 already-written blocks reachable, including all 7 poster style blocks that Layer 2 will later attach reasoning twins to.
