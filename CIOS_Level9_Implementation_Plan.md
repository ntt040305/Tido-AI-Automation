# CIOS Level 9 — Implementation Plan

**Supersedes:** §7 (Gap Analysis) and §10 (Phase 2 Plan) of `CIOS_Level9_Current_System_Audit.md`, which were written before the official specification was available and were explicitly marked provisional. §1–§6, §8, §9 of that audit remain valid as the current-state record.

**Source specifications:**
`CIOS_Level9_Core_Architecture_v2.md` · `CIOS_Level9_Knowledge_Domain_Map.md` (v3) · `CIOS_Level9_Reasoning_Knowledge_Schema.md` (v2) · `CIOS_Level9_Creative_Knowledge_Database_Specification.md` (v2) · `CIOS_Level9_Agency_Creative_Playbook.md` (v2)

**Date:** 2026-09-07 · **Phase:** Design only. No code modified.

**Preservation contract — non-negotiable for every phase below:**
`CampaignBuilderService` · `ArtDirectionResolverService` · `MasterPromptCompilerService` · the provenance system · `DeliveryPackageService` and the delivery pipeline. **All remain untouched.** Every change in this plan is additive or upstream of them.

---

# 0. What the official specification changed

Three corrections to my provisional analysis, and three findings that make the gap smaller than it appears.

## 0.1 Corrections

### C1 — The V1 authoring standard is CORRECT and must be preserved

My audit recommended "rescoping" `KNOWLEDGE_AUTHORING_STANDARD_V1.md` as though it were a mistake. **It is not.** Core Architecture §4 defines Layer 1 — Model Knowledge — and states it *"should remain relatively neutral"*, containing camera principles, lighting principles, material physics, realism rules, composition fundamentals.

That is a precise description of the existing 20 blocks and of V1's Principles A, D, G. **V1 is the correct constitution for Layer 1.** Its only error was being the *only* standard, applied to the *only* corpus. The fix is not to amend it — it is to leave it alone and add Layer 2 beside it.

### C2 — Target scale reverses my retrieval recommendation

I advised bypassing the 9-stage retriever "until the corpus exceeds ~200 blocks". The Domain Map sets the target explicitly:

| Domain | Spec requirement | Objects |
|---|---|---|
| 03 Category | "50-100 creative patterns, 50+ common mistakes" × 7 categories | 700–1,050 |
| 10 Layout | "Minimum target: 100+ professional layout patterns" | 100+ |
| 12–16 Typography, Color, Photography, Material, Channel | Expansion lists per domain | ~250 |
| 19 Examples | Per-example extraction schema | ~100 |
| 01–08 Business → Differentiation | Decision frameworks | ~200 |
| | **Total** | **≈1,400–1,700** |

Against today's 20 blocks that is a **70–85× increase**. `SmartKnowledgeRetriever`'s 9 stages, `CandidateFusion`, `KnowledgeReRanker`, `KnowledgeDependencyResolver` and the embedding index are **not over-engineering — they are the correct architecture, built early**. They should be preserved and fed, not bypassed.

### C3 — Module 18 is "Creative Critic Engine", not "Failure Prevention"

My provisional map named slot 18 *Failure Prevention*. The official Domain 18 is the **Creative Critic Engine** with seven evaluation criteria. Broader and more active than I assumed: it must be able to **reject** weak ideas (Core §5 Module 18), not merely warn.

## 0.2 The gap is smaller in plumbing than expected

Three pieces of the official architecture are **already implemented** and appear to be unrecognised in the specification:

### F1 — The Creative Decision Graph already has its edges

Core Architecture §13 and Database Spec §8 require knowledge to connect as a graph via `related_blocks`.

**Verified: `related_blocks` is populated on 20/20 blocks.** The edge structure exists today. What is missing is *nodes worth connecting*, not the graph mechanism.

### F2 — Knowledge Conflict Resolution is already built, and built well

Core §14 and Database Spec §10 require the system to resolve conflicts (luxury restraint vs. promotional urgency) by weighing authority.

`ArtDirectionResolverService.ts:11-31` implements exactly this:

```
USER          tier 1   weight 1.00   explicit client requirement
REFERENCE     tier 2   weight 0.85   analysis of uploaded reference
STRATEGY      tier 3   weight 0.65   marketing reasoning
KNOWLEDGE     tier 4   weight 0.50   retrieved professional knowledge
ASSET_DEFAULT tier 5   weight 0.35   asset-type profile fallback
```

And at lines 143–148 the code already documents the subtlety the spec implies:

> *"Ranking purely by source means the word 'premium', typed by a client, outranks a fully specified art direction… score on tier weight × confidence × specificity."*

**This is a working implementation of spec §14 for visual decisions.** It requires extension to strategic conflicts — not invention.

### F3 — Knowledge prioritisation is 3/5 present

| Spec §11 field | Current field | Status |
|---|---|---|
| `priority` | `priority` (20/20, range 85–100) | Present — needs rescaling to 1–10 |
| `confidence` | `information_value` (20/20, 0.90–0.98) | Present — rename |
| `context_relevance` | `genericity` (20/20, 0.30–0.90) | Present as inverse |
| `impact_score` | — | **Missing** |
| `frequency` | — | **Missing** |

## 0.3 Net effect

**The gap is narrower in infrastructure and wider in content than either document assumed.** The plumbing for graph, conflict resolution, prioritisation, provenance and retrieval at scale largely exists. What does not exist is ~1,500 decision-grade knowledge objects and four reasoning stages.

---

# 1. Updated CIOS Gap Analysis

## 1.1 Against the 19 official domains

| # | Domain | Coverage | What exists (file-level) | Gap |
|---|---|---|---|---|
| 01 | Business Intelligence | **0%** | Brief fields pass through | Objective→creative-implication frameworks (awareness=attention+memory; conversion=clarity+trust; retention=relationship) |
| 02 | Market Intelligence | **0%** | — | Maturity, competitor behaviour, saturation |
| 03 | Category Intelligence | **0%** | `industry_domains` on 2 material blocks only | **700–1,050 objects across 7 categories** |
| 04 | Audience Psychology | **5%** | `target_customer_psychology` (one LLM output field) | Surface need vs deep need vs emotional trigger; objections; identity drivers |
| 05 | Brand Intelligence | **5%** | `brandInfo` free text | 6 positioning tiers, archetypes, consistency rules |
| 06 | Creative Strategy | **40%** | `MarketingBrainService` + `prompt-strategy.schema.ts` | Positioning, message hierarchy, campaign territories |
| 07 | Concept Development | **20%** | Single-shot concept in brain call | **Multiple territories + comparison + scoring + recommendation** |
| 08 | Differentiation Engine | **0%** | Nothing | Cliché libraries, white-space discovery, pattern interruption |
| 09 | Visual Direction | **65%** | `ArtDirectionResolverService`, `VisualDNA`, 7 poster style blocks | Style→strategy fit rules; visual worlds |
| 10 | Layout Intelligence | **60%** | `CommercialLayoutService` zones, `universal.commercial_visual_hierarchy` | **100+ patterns with use/avoid/failure cases** |
| 11 | Design System | **20%** | Asset profiles, attention budgets | Gestalt, cognitive load, conversion design |
| 12 | Typography Intelligence | **20%** | 1 block, 193 words | Pairing, hierarchy, **Vietnamese typography rules** (spec-named) |
| 13 | Color Intelligence | **10%** | `colour` dimension in resolver, no knowledge behind it | Psychology, harmony, cultural meaning |
| 14 | Photography & Cine | **45%** | 2 universal blocks | **"Why this camera decision fits this idea"** — lens by emotional intent |
| 15 | Material Realism | **55%** | `material.glass`, `property.transparent`, `physical_scene_coherence` | 8 of 9 spec materials missing |
| 16 | Channel Intelligence | **35%** | 5 asset-type foundations + `export-presets.ts` | Platform psychology, attention behaviour |
| 17 | Production Knowledge | **60%** | `export-presets`, `DeliveryPackageService`, `export-metadata` | Print/prepress, editable-asset requirements |
| 18 | **Creative Critic Engine** | **0%** | `visual_challenges` metadata is passive labelling only | **7 criteria + scoring + rejection authority** |
| 19 | Creative Examples | **0%** | `tested_jobs` empty 20/20 | Extraction schema per example |

## 1.2 Against the architectural systems (Core §10–§16)

| System | Spec | Current | Gap |
|---|---|---|---|
| **Memory L1 — Global Creative** | Always-available universal principles | ✅ **The 5 universal blocks are exactly this layer** | Content quality only |
| **Memory L2 — Contextual Domain** | Activated by industry/category/audience/objective/channel/brand | ❌ No activation axis exists | **Total** — the core retrieval gap |
| **Memory L3 — Task Specific** | Brief, guidelines, references, previous decisions, approved direction | ⚠️ Exists as React `useState`, dies on refresh | Needs persistence |
| **Memory L4 — Reasoning** | Why selected, why alternatives rejected, trade-offs | ⚠️ Provenance covers *what/where*, not *why* | Extend existing structure |
| **Prioritisation (§11)** | 5 scoring fields | ⚠️ 3/5 present | Add `impact_score`, `frequency` |
| **Decision Graph (§13)** | Connected knowledge | ✅ `related_blocks` 20/20 | Nodes, not edges |
| **Conflict Resolution (§14)** | Weigh business priority, brand risk, audience expectation | ✅ **Implemented for visual decisions** | Extend to strategic |
| **Traceability (§15)** | Decision → Reason → Knowledge Source → Expected Impact | ⚠️ Decision → Source → Confidence → Score | **Add `reason` + `expected_impact`** |

> **Traceability is two fields away from spec compliance.** `ArtDirectionDecisionRecord` already carries `dimension, value, source, confidence, specificity, score, client_locked`.

## 1.3 Reasoning pipeline — Core §6 (13 required steps)

| # | Required step | Status | Where it goes |
|---|---|---|---|
| 1 | Understand business goal | ⚠️ Fields read, not reasoned | Extend `CreativeInterpretationService` |
| 2 | Analyze audience | ⚠️ One output field | **New stage** |
| 3 | Analyze category | ❌ Missing | **New stage** |
| 4 | Identify market clichés | ❌ Missing | **New stage** |
| 5 | Find differentiation opportunity | ❌ Missing | **New stage** |
| 6 | Generate creative directions *(plural)* | ⚠️ Single shot | Widen `MarketingBrainService` |
| 7 | **Critique directions** | ❌ Missing | **New service** |
| 8 | Select strongest concept | ❌ Missing | Follows from 6+7 |
| 9 | Decide visual system | ✅ `CampaignBuilderService` | **Preserve** |
| 10 | Decide layout | ✅ `CommercialLayoutService` | **Preserve** |
| 11 | Decide typography | ⚠️ No type rendered | Deferred |
| 12 | Decide camera and production | ✅ `ArtDirectionResolverService` | **Preserve** |
| 13 | Compile final prompt | ✅ `MasterPromptCompilerService` | **Preserve** |

**5 of 13 steps exist and are exactly the components under the preservation contract.** The missing work is steps 2–8 — all upstream of the deterministic engine, which is precisely where it can be added without touching it.

---

# 2. Knowledge Architecture Migration Plan

## 2.1 The two-layer split (Core §4)

```
data/knowledge/                         LAYER 1 — MODEL KNOWLEDGE   [PRESERVE AS-IS]
  governed by KNOWLEDGE_AUTHORING_STANDARD_V1.md
  creative-neutral · open-world · ≤1800 tok universal ceiling
  consumer: the diffusion model
  → injected into the ~22 KB image prompt, exactly as today

data/cios-knowledge/                    LAYER 2 — REASONING KNOWLEDGE   [NEW]
  governed by REASONING_KNOWLEDGE_STANDARD_V2.md
  prescriptive · numeric · anti-patterns required · closed-world examples
  consumer: the reasoning LLM
  → NEVER injected into the image prompt; only its conclusions are
```

**This separation is what makes both standards correct simultaneously.** Layer 2 can be as opinionated as a senior creative director — *"use a 50mm at f/2.8 with warm directional light"* — because that text never reaches the diffusion model. Only the *decision it produced* does, arriving through the existing `ArtDirectionResolverService` as a `STRATEGY`- or `KNOWLEDGE`-tier candidate.

**Consequence: the two layers have different budgets.** Layer 1 competes for the 22 KB image prompt (`PromptBudgetManagerService`). Layer 2 competes for the reasoning LLM's context window. They must never share a budget — this removes Risk R8 from the audit.

## 2.2 Directory structure (Database Spec §13)

```
data/cios-knowledge/
├── REASONING_KNOWLEDGE_STANDARD_V2.md
├── strategy/          domains 01, 02, 06
├── audience/          domain 04
├── category/          domain 03    ← beauty, fashion, food, technology,
│                                      automotive, hospitality, real_estate
├── concept/           domain 07
├── differentiation/   domain 08    ← cliché libraries (spec calls this the anti-generic core)
├── visual_direction/  domain 09
├── layout/            domain 10
├── typography/        domain 12
├── color/             domain 13
├── photography/       domain 14
├── material/          domain 15
├── channel/           domain 16
├── production/        domain 17
├── critic/            domain 18
└── examples/          domain 19
```

## 2.3 Knowledge object schema (Reasoning Schema §2)

Adopt the specified YAML verbatim. Mapping from the existing V1 schema:

| V2 field | V1 equivalent | Action |
|---|---|---|
| `id`, `name` | `id`, `title` | Rename |
| `domain`, `category` | `knowledge_type`, `routing_dimensions.industry_domains` | Map + populate |
| `knowledge_type` | — | **New enum**: principle · decision_rule · framework · pattern · anti_pattern · example · evaluation_rule · production_rule |
| `authority_level` | — | **New enum**: core · expert · specialized · experimental |
| `creative_stage` | — | **New enum**: strategy · concept · visual_direction · layout · production · evaluation |
| `context`, `decision`, `reason`, `use_when`, `avoid_when`, `trade_off` | — | **New — this is the entire point** |
| `examples`, `anti_patterns` | — | **New** |
| `related_blocks` | `related_blocks` | ✅ **Reuse directly — already populated 20/20** |
| `confidence` | `information_value` | Rename |
| `source` | `validation.notes` | Map |

## 2.4 Migration of the existing 20 blocks

**No existing block is deleted, rewritten, or moved.** All 20 remain valid Layer 1 knowledge.

| Existing asset | Destination | Action |
|---|---|---|
| 5 universal blocks | Layer 1 + **Memory L1 (Global Creative)** | Keep. They already serve the spec's always-available layer |
| `material.glass`, `property.transparent` | Layer 1 · domain 15 | Keep; author 8 sibling materials |
| 5 asset-type foundations | Layer 1 · domain 16 | Keep; add Layer 2 channel decision rules beside them |
| 7 poster style blocks | Layer 1 + **Layer 2 domain 09 twins** | Keep the neutral block; author a `visual_direction/` decision rule per style stating *when to choose it and when not to* |
| `specialist.commercial_poster_design` | Layer 1 · domain 10 | Keep |
| `knowledge_full.md` × 13 (2,972 words) | Layer 1 | **Load it** — currently dead |

**The 7 poster style blocks are the highest-value migration.** They already describe seven distinct visual territories. What they lack is a rule saying *which strategy each serves*. That is one Layer 2 object each — 7 objects that make an existing, currently-unreachable asset usable.

## 2.5 Scale sequencing

The Domain Map's targets (~1,500 objects) are a destination, not a starting requirement. Author in this order, gated on measurable benefit:

1. **Differentiation (08) for 1 category** — ~30 objects. Proves the thesis.
2. **Category (03) for the 5 categories the benchmark already covers** — beauty, fashion, food, technology, real estate are all in `run-campaign-benchmark.ts`. ~100 objects at 20/category, not the full 50–100.
3. **Audience (04) + Critic (18)** — ~60 objects.
4. **Layout (10), Photography (14), Color (13), Typography (12)** — expand toward spec depth.
5. **Automotive + hospitality** — the 2 spec categories with no benchmark coverage.

---

# 3. Retrieval Architecture Plan

## 3.1 The single missing mechanism

Core §12 and §7 both require **context extraction before retrieval**:

```
User Brief → Context Extraction → Creative Problem Definition
           → Knowledge Activation → Decision Making → Prompt Compilation
```

Today the brief is **never transformed into a retrieval query**. `RoutingSignalExtractor` extracts physical signals (material, property, geometry). The commercial dimensions — industry, audience, objective, channel, brand position, creative style — are read from the brief, passed to the LLM, and then discarded before retrieval runs.

**This one gap explains the observed behaviour**: identical knowledge retrieved for every asset in every campaign, in every industry.

## 3.2 Target architecture

```
BRIEF
  │
  ▼
CreativeContextExtractor                                    [NEW — small service]
  emits the 8 axes the spec names:
  industry · audience · objective · channel · asset_type
  · brand_position · creative_style · production_requirement
  │
  ├──────────────────────────────┬────────────────────────────────┐
  ▼                              ▼                                ▼
MEMORY L1                   MEMORY L2                        MEMORY L3
Global Creative             Contextual Domain                Task Specific
5 universal blocks          activated by the 8 axes          brief · brand ·
always injected             ← SmartKnowledgeRetriever        refs · prior decisions
                              9 stages, unchanged
  │                              │                                │
  └──────────────────────────────┴────────────────────────────────┘
                                 ▼
                    Layer 2 → REASONING LLM        (context-window budget)
                    Layer 1 → PROMPT COMPILER      (22 KB image-prompt budget)
```

## 3.3 Changes required

| Component | Change | Risk |
|---|---|---|
| `RoutingSignalExtractor` | Extend to emit the 8 commercial axes alongside physical signals | Low — additive |
| `knowledge_block_schema_v1.json` | Add `audience_segments`, `objectives`, `channels`, `brand_positions`, `creative_stage`, `authority_level` | Low — additive fields |
| `MetadataKnowledgeMatcher` | Match on the new axes | Low |
| `KnowledgeReRanker` | Apply spec §11 scoring: `impact × context_relevance × confidence × priority` | Medium — changes ranking |
| `SmartKnowledgeRetriever` | Add a `layer` parameter (1 or 2); route to separate budgets | Medium |
| `KnowledgeBudgetManager` | Split: image-prompt budget (unchanged, 19,400) vs reasoning budget (new) | Low — new path |
| **Embedding index** | Rebuild for all blocks; detect staleness not just absence; wire npm script | **Trivial, high payoff** |

**Everything in `SmartKnowledgeRetriever`'s 9 stages is preserved.** Fusion, re-ranking, dedup and dependency resolution are the correct architecture for ~1,500 objects. The change is *what feeds them*, not how they work.

## 3.4 The index bug is the cheapest win in this plan

7 of 20 blocks indexed; the 13 missing are every specialist block including all 7 poster styles. Auto-sync fires only `if (!indexSchema)`. One npm script plus a staleness check makes the existing style knowledge reachable for the first time.

---

# 4. Reasoning Engine Implementation Strategy

## 4.1 Design constraint

The deterministic engine is preserved. Therefore **every new reasoning stage sits upstream of `CampaignBuilderService`** and communicates with the existing pipeline through one channel: by emitting `STRATEGY`-tier candidates that `ArtDirectionResolverService` already knows how to score.

```
                    ┌─── NEW REASONING LAYER ────────────────────┐
BRIEF ──► Context ──┤ business → audience → category             │
          Extractor │ → differentiation → concepts(3) → critique │
                    │ → selection                                │
                    └────────────────┬───────────────────────────┘
                                     │ emits STRATEGY-tier candidates
                                     ▼
        ┌─── EXISTING DETERMINISTIC ENGINE — UNCHANGED ───┐
        │ CampaignBuilder → AssetAdaptation               │
        │ → ArtDirectionResolver → CommercialLayout       │
        │ → MasterPromptCompiler → PromptBudgetManager    │
        └─────────────────────────────────────────────────┘
                                     ▼
                          ImgStudio → Delivery pipeline
```

The interface between the two is already defined and already working: the `STRATEGY` tier at weight 0.65, scored by `tier × confidence × specificity`. **A richer reasoning layer produces better STRATEGY candidates; the engine below does not change at all.**

## 4.2 Stage design

| Stage | Type | Input | Output | Cost |
|---|---|---|---|---|
| Context Extraction | Deterministic + 1 LLM | Brief | 8 retrieval axes | ~0 (fold into existing interpretation call) |
| Business Understanding | Deterministic | Objective | Campaign-type framework (awareness/launch/conversion/retention) | 0 |
| Audience Analysis | LLM + Layer 2 | Axes + audience knowledge | Surface need · deep need · emotional trigger · objections | 1 call |
| Category Analysis | LLM + Layer 2 | Axes + category knowledge | Conventions · expectations · saturation | shares call with above |
| **Differentiation** | LLM + Layer 2 | Category clichés | Clichés to reject · white space | 1 call |
| Concept Development | LLM | All above | **3 territories**, each with name, big idea, insight, emotion, visual metaphor, risk | 1 call |
| **Critique & Select** | LLM + Layer 2 critic rules | 3 concepts | Scores on 7 criteria; selection; rejection reasons | 1 call |

**Net: 3–4 additional LLM calls per campaign.** Current spend is 1 Gemini + 2 LLM. New total ~1 Gemini + 5–6 LLM — against 5 paid renders in a full run, immaterial.

## 4.3 Critic Engine (Domain 18 + Playbook §9)

Two specifications converge on the criteria. Implement the union:

| Criterion | Question | Source |
|---|---|---|
| Strategic fit | Does it solve the business goal? | Playbook §9 |
| Audience fit | Will the target audience care? | Both |
| **Differentiation** | Does it avoid category clichés? | Both |
| Originality | Different from competitors? | Domain 18 |
| Visual hierarchy | Is hierarchy strong? | Both |
| Brand fit | Does it match positioning? | Both |
| Commercial strength | Does it help the objective? | Domain 18 |
| Production feasibility | Can it be produced? | Both |
| **Generic AI feeling** | Does it read as machine-made? | Domain 18 |

Scored 1–10 per Reasoning Schema §10, with `improvement_action` per criterion. **The critic must be able to reject** (Core §5 Module 18) — a score below threshold returns to concept generation for one revision pass, bounded at one iteration to cap latency.

## 4.4 Memory implementation

| Layer | Implementation | Phase |
|---|---|---|
| L1 Global | The 5 universal blocks, always injected | ✅ Exists |
| L2 Contextual | Retrieval activation by the 8 axes | Phase 2 |
| L3 Task | Persist campaign: brief, concept, decisions, approved direction | Phase 4 |
| L4 Reasoning | Extend `ArtDirectionDecisionRecord` with `reason` + `expected_impact`; add `rejected_alternatives` | Phase 3 |

**L4 is the cheapest high-value addition.** Spec §15 requires Decision → Reason → Knowledge Source → Expected Impact. Three of four fields exist. Adding two fields to a record that is already built, already surfaced in the Campaign Studio UI, and already written to `asset_plan.json` delivers spec-compliant traceability without new infrastructure.

---

# 5. Updated Phase Roadmap

Each phase gates on: **488 regression assertions pass unchanged**, deterministic engine untouched, deterministic fallback path intact.

## Phase 0 — Foundations (½ day · zero risk · no new knowledge)

| Task | Files | Payoff |
|---|---|---|
| Move LLM config to env; remove hardcoded key | `.env.local`, `llm-provider.service.ts` | Closes audit R1, R3 |
| Load `knowledge_full.md` | `KnowledgeRetrievalDocumentBuilder.ts` | +2,972 words already authored |
| Rebuild index; wire npm script; staleness detection | `package.json`, `SmartKnowledgeRetriever.ts` | **Unlocks 13 unreachable blocks incl. all 7 poster styles** |
| Remove dead deps (`@anthropic-ai/sdk`, `openai`, `zustand`); rename `GroqClient` | `package.json`, `llm/groq.client.ts` | Removes audit R-misleading |

## Phase 1 — Two-layer foundation (3–5 days · low risk)

Author `REASONING_KNOWLEDGE_STANDARD_V2.md` per Reasoning Schema §2–§10. **Leave V1 untouched** — add a one-line scope note identifying it as Layer 1. Create `data/cios-knowledge/` per Database Spec §13. Extend the block schema with the 8 commercial axes plus `authority_level`, `creative_stage`, `impact_score`, `frequency`. Build `CreativeContextExtractor`.

**Deliverable:** standards, schema, directory, extractor. **No knowledge authored yet, no reasoning stages added.**

## Phase 2 — Differentiation proof (1 week · medium risk · the decisive phase)

Author **Domain 08 for beauty/skincare only** (~30 objects: clichés, white spaces, replacements). Add the **Differentiation** and **Critique** stages. Wire Layer 2 retrieval on the industry axis.

**Measurement:** re-run the Skin1004 benchmark. Compare concepts before/after. This phase either proves the CIOS thesis or disproves it, cheaply, before ~1,500 objects are commissioned.

## Phase 3 — Reasoning depth (2–3 weeks · medium risk)

Domains 03 + 04 across the 5 benchmark-covered categories. Insert audience and category stages. Widen concept generation to 3 territories with scored selection. Extend provenance with `reason` + `expected_impact` (spec §15 compliance). Author Layer 2 twins for the 7 poster styles.

## Phase 4 — Memory and scale (3–4 weeks · low technical risk)

Persistence for Memory L3 — campaigns, decisions, approved directions. Domain 19 examples library; populate `tested_jobs`. Domains 10, 12, 13, 14 toward spec depth. Automotive + hospitality categories. Outcome feedback into `KnowledgeReRanker` (Database Spec §12).

## Milestones

| After | Capability | Spec sections satisfied |
|---|---|---|
| Phase 0 | All authored knowledge reachable | — |
| Phase 1 | Expert knowledge is *legal* to author | Core §4 · Reasoning Schema |
| **Phase 2** | **System rejects its own generic ideas** | Core §5 M08, M18 · Playbook §9 |
| Phase 3 | Category- and audience-reasoned; traceable | Core §6 steps 2–8 · §15 |
| Phase 4 | Remembers, learns, explains | Core §10 · Database Spec §12 |

---

# 6. Risk Register (delta from audit §8)

| ID | Risk | Change | Mitigation |
|---|---|---|---|
| R8 | Prompt budget pressure | **Resolved by design** | Two-layer split gives Layer 2 a separate budget; it never enters the 22 KB prompt |
| R11 | *(new)* Knowledge authoring becomes the bottleneck | ~1,500 objects is a content programme, not an engineering task | Phase 2 proves value on 30 objects before committing to the rest |
| R12 | *(new)* Latency growth | 3–4 added LLM calls; current campaign is already 25–40s | Run independent stages concurrently; cap critique at one revision |
| R13 | *(new)* Layer 2 leaking into image prompts | Would over-constrain the diffusion model — the exact failure V1 was written to prevent | Enforce at the type level: separate retriever path, separate budget manager, assertion in the regression suite |
| R2 | Silent degradation on LLM failure | **Worsens with more stages** | Every new stage must report its source in diagnostics, as `strategy_source` already does |

---

# 7. Recommended Next Action

**Phase 0, then Phase 1.** Do not author knowledge before the V2 standard exists — authoring under V1 would produce more of the hedged prose the audit measured at 5.8:1.

Within Phase 0, the index rebuild is the single highest return: one npm script makes 13 already-written blocks reachable, including the 7 poster styles that are the only real art-direction variety in the repository.

---

## Appendix — Open questions for the specification owners

1. **Domain 11 (Design System) vs Domain 10 (Layout)** overlap on hierarchy, spacing and attention flow. Boundary unclear. `[NEEDS RULING]`
2. **Typography (Domain 12)** assumes type is rendered. The current engine renders **no text into pixels** — it reserves zones for typography applied downstream. Should Domain 12 target prompt-level type description, or a future text-compositing layer? `[NEEDS RULING]`
3. **Domain 03 scale** (50–100 patterns + 50 mistakes × 7 categories) implies ~700–1,050 objects. Confirm whether this is a v1 target or a long-term ceiling. Phase 2 assumes 20–30 per category initially.
4. **Automotive and hospitality** appear in the Domain Map but have no benchmark coverage. Confirm priority relative to the 5 existing benchmark categories.
5. **Playbook §11** assigns CIOS four roles by phase (Creative Director → Art Director → Creative Reviewer → Production Assistant). Should these map to distinct system prompts per reasoning stage? `[NEEDS RULING]`
