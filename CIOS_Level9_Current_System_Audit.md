# CIOS Level 9 — Current System Audit

**Subject:** TIDO AI Video Factory / Image Engine
**Scope:** `tido-ai-video-factory-claude-code-pack/apps/web`
**Date:** 2026-09-07
**Phase:** 1 — Audit only. No code was modified in producing this report.

**Evidence basis:** all 20 knowledge metadata files and the authoring standard read in full; `llm-provider.service.ts`, `SmartKnowledgeRetriever.ts`, `KnowledgeBudgetManager.ts`, `PromptBudgetManagerService.ts`, `KnowledgeRouterService.ts` read directly; one live 5-asset campaign traced end to end with its compiled prompts retained; the local LLM gateway probed for its model list; the embedding index compared against disk.

**Marked `[UNKNOWN]`** wherever a claim could not be verified from the codebase.

---

# 1. Executive Summary

The system is a **well-engineered deterministic prompt compiler with one strategy call attached**. It is not yet a Creative Intelligence Operating System, and the reason is narrower and more fixable than "the AI needs to be smarter".

Three findings dominate:

### 1.1 The knowledge base is constitutionally forbidden from being expert

`data/knowledge/KNOWLEDGE_AUTHORING_STANDARD_V1.md` governs every knowledge block. Its Principle A gives this example pair verbatim:

> ❌ **BAD (Recipe):** "Use a 50mm lens at f/2.8 with warm golden sunset light and a dark slate pedestal."
> ✅ **GOOD (Knowledge):** "Depth of field and light quality should isolate the subject cleanly while reinforcing spatial hierarchy and surface texture legibility."

The example labelled BAD is what a photographer knows. The example labelled GOOD is a tautology. Principle D adds *"Downstream models and user briefs retain absolute creative authority"*; Principle G forbids "massive negative rule lists", which blocks any anti-pattern layer; §3.3 mandates `creative_recipe: false`, and it is `false` on all 20 blocks.

This was a **correct** design for the original goal — a neutral craft substrate that never over-constrains a diffusion model. It is precisely wrong for a Creative Director product, whose entire commercial value is a defensible professional opinion.

### 1.2 The corpus is far smaller than assumed

20 blocks, **2,724 words total** — roughly 11 pages. Hedge words outnumber concrete decisions **5.8 : 1** (64 vs 11). A further **2,972 words** sit in `knowledge_full.md` files that no code path ever loads — more unused text than the entire active corpus.

### 1.3 The semantic index is stale, and it has silently disabled the creative variety that does exist

`data/indexes/knowledge_embeddings_v1.json` was generated **2026-08-13** and contains **7 of 20 blocks**. All 13 specialist blocks are absent — including all 7 poster style variants (`poster_editorial_minimal_luxury`, `poster_photographic_cinematic`, `poster_3d_cgi_digital`, etc.).

Those style blocks are the closest thing in the repository to genuine art-direction variety, and they are **semantically unreachable**. `SmartKnowledgeRetriever.ts` only rebuilds when the index is *missing entirely* (`if (!indexSchema)`), never when it is stale, and `run-build-knowledge-index.ts` is wired to no npm script. This is a concrete, cheap bug fix — not an architecture problem.

### Verdict

**The engineering is stronger than the intelligence.** The deterministic core, provenance model, layout system and delivery pipeline are genuinely production-grade and should be preserved. What is missing is knowledge that decides, retrieval that understands commerce, memory of any kind, and any mechanism for self-criticism.

---

# 2. Current System Architecture

## 2.1 Frontend

| Property | Finding |
|---|---|
| Framework | Next.js **16.3.0** (App Router, Turbopack), React **19.2.8**, TypeScript strict |
| Styling | Tailwind v4 with `@theme` tokens in `app/globals.css` (dark-first: `--color-bg #0B0B0C`, `--color-accent #E6402F`) |
| Fonts | Be Vietnam Pro + IBM Plex Mono via `next/font` (`app/layout.tsx`) |
| Pages | 8, **all `"use client"`** |
| Components | 7 files, 3,016 lines |
| State management | **None.** 76 `useState` calls, **0** Context providers. `zustand` is a declared dependency used in **0 files** |
| Server components | **0 used for data** — every page is a client component |
| Auth | **None** |

### Routes

| Route | File | Lines | Purpose |
|---|---|---|---|
| `/` | `app/page.tsx` | 202 | Campaign Workspace dashboard (mock cards) |
| `/campaign-site` | `app/campaign-site/page.tsx` | 773 | **Campaign Studio — the primary product surface** |
| `/render-image` | `app/render-image/page.tsx` | 8 | Legacy single-image generator (delegates to components) |
| `/cost` | `app/cost/page.tsx` | 86 | Cost view |
| `/projects/new` | `app/projects/new/page.tsx` | 426 | Video project creation |
| `/projects/[id]` | + `/creative`, `/production` | 399/231/197 | Video project workflow |

> **Orphaned surface:** the `/projects/*` tree (1,253 lines) still builds and works, but since `/` became the Campaign Dashboard, **nothing links to it**. Reachable only by typing the URL.

### User workflow — input to output

```
/                    Dashboard → "+ Tạo chiến dịch mới"
   ↓
/campaign-site       Creative Brief panel (sticky, left)
                       brand · product · industry · audience · objective
                       · channel · tone · creative direction · references
                       · asset toggles
   ↓  "Tạo chiến dịch"
POST /api/campaign/generate   dryRun=true, includePrompts=true   (~25-40s)
   ↓
Right column renders three stages:
   01 Campaign concept  big idea · name · core message · consumer insight
   02 Visual DNA        6 shared rules
   03 Asset system      5 tabs; per tab: goal · ratio · layout logic ·
                        attention budget · art-direction decisions
                        (value/source/confidence/specificity/score/lock)
                        · collapsible final prompt
   ↓  per-asset "Render …"
POST /api/campaign/render-asset   ONE provider call
   ↓
Preview shown → browser download auto-triggers → export metadata JSON offered
```

**Critical characteristic:** the entire campaign — concept, DNA, 5 compiled prompts (~21.7 KB each) — lives **only in React `useState`**. A refresh or navigation destroys it. Nothing is persisted client-side or server-side against a campaign identity.

## 2.2 Backend

| Property | Finding |
|---|---|
| Runtime | Next.js Route Handlers, `runtime = "nodejs"` |
| API routes | **17** (all POST/GET; no PUT/DELETE) |
| Database | **None.** Verified: the 5 files matching a DB grep are false positives — `pg` inside `.jpg` / `image/jpeg` |
| Auth | **None** — 0 files reference `next-auth`, Clerk, JWT, or sessions |
| Background jobs | **None** — 0 queues, cron, or workers. Every operation is synchronous inside the request |
| Storage | Filesystem only |

### API surface

| Route | Lines | Role |
|---|---|---|
| `/api/campaign/generate` | 194 | Campaign orchestration entry point |
| `/api/campaign/render-asset` | 230 | Single-asset render + export metadata |
| `/api/image/generate` · `generate-simple` · `edit` | 178/235/199 | Legacy single-image paths |
| `/api/image/generated/[id]` | 57 | Serves rendered bytes |
| `/api/image/knowledge/*` | 21–38 each | Knowledge blocks / status / retrieve (4 routes) |
| `/api/image/prompt/compile` · `router/analyze` · `provider` | 61/140/41 | Engine introspection |
| `/api/generate-script` · `render-voice` · `voices` | 201/66/33 | Video-side (Groq + ElevenLabs) |

### Persistence

| Path | Files | Contents |
|---|---|---|
| `data/generated/image-renders/` | 1,003 | Per-generation dir: `output.webp`, `master_prompt.md`, `metadata.json` |
| `data/deliveries/` | 26 | Campaign packages: manifest, summary, per-asset `prompt.md` + `asset_plan.json` |
| `data/knowledge/` | 54 | 20 blocks (`knowledge.md` + `metadata.json`, some `knowledge_full.md`) |
| `data/indexes/` | 3 | Embedding index (**stale**) + manifest |
| `data/schemas/` | 2 | `knowledge_block_schema_v1.json` + one other |

Path traversal is guarded in `config.ts` `resolveDataPath()`. Storage abstraction exists (`GeneratedImageStorage.ts` interface, `LocalGeneratedImageStorage.ts` impl) — cloud storage would be a drop-in.

### External integrations

| Service | SDK / transport | Used by | Config |
|---|---|---|---|
| **LLM gateway** | Raw `fetch`, OpenAI-compatible | 4 services | `LLM_BASE_URL` default `http://127.0.0.1:8317/v1` |
| **Gemini** | `@google/genai` | Router, embeddings, image provider | `GEMINI_API_KEY`, `GEMINI_MODEL` = `gemini-3.6-flash` |
| **ImgStudio** | Raw `fetch` | Active image provider | `IMGSTUDIO_*`, model `flow-nano-banana-2` |
| **Groq** | `groq-sdk` | `/api/generate-script` only | `GROQ_API_KEY` |
| **ElevenLabs** | SDK | Voice routes | `ELEVENLABS_*` |
| **Cloudflare** | Raw `fetch` | Inactive image provider | `CLOUDFLARE_*` |

**Dead dependencies:** `@anthropic-ai/sdk`, `openai`, `zustand` are installed and imported by **zero** files. `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` are set in `.env.local` and read by **zero** files.

---

# 3. Current AI Pipeline

## 3.1 Complete trace

```
USER BRIEF  (brand, product, industry, audience, objective, channel, tone, concept, refs)
     │
     ├─►  KnowledgeRouterService          @google/genai   gemini-3.6-flash   12s ceiling, retries
     │       └─ produces routing JSON (schema-constrained)          [1 Gemini call]
     │
     ├─►  CreativeInterpretationService    LLM  temp 0.2 / 900 tok / 20s     [1 LLM call]
     │       └─ parses client language, marks HIGH-specificity locks
     │
     └─►  MarketingBrainService            LLM  temp 0.6 / 1800 tok / 60s    [1 LLM call]
             └─ consumer_insight → emotional_response → creative_message
                → visual_translation (6 fields)
     │
     ▼
   SmartKnowledgeRetriever   9 stages (lines 59-160)
     validate → load repo → extract signals → metadata match → semantic/embedding
     → candidate fusion → deterministic re-rank → dedupe → dependency resolve → budget
     │
     ▼   returns the SAME 7 blocks every run
   CampaignBuilderService      deterministic — assembles Visual DNA
   AssetAdaptationService      deterministic — per-format goal, layout, attention budget
   ArtDirectionResolverService deterministic — scored selection across 7 dimensions
   CommercialLayoutService     deterministic — normalised zones
   MasterPromptCompilerService deterministic — string assembly
   PromptBudgetManagerService  dedupe → drop by priority → hard truncate
     │
     ▼
   ~21.7 KB prompt ──► ImgStudio (flow-nano-banana-2) ──► WebP
     │
     ▼
   LocalGeneratedImageStorage + buildAssetExportMetadata + DeliveryPackageService
```

**Budget per campaign:** 1 Gemini + 2 LLM + 5 deterministic compiles; 0 renders (dryRun default) or 5 on demand.

## 3.2 Where the LLM is called

**One client, no SDK:** `lib/image-engine/llm/llm-provider.service.ts` (124 lines). A single `fetch` to `POST {baseUrl}/chat/completions` — OpenAI wire format. No Anthropic SDK, no `x-api-key`, no `anthropic-version` header.

| Setting | Source | Default |
|---|---|---|
| Base URL | `LLM_BASE_URL` | `http://127.0.0.1:8317/v1` |
| Model | `LLM_MODEL` | `claude-sonnet-4-6` |
| API key | `LLM_API_KEY` | **hardcoded literal** `"marketing-test-key-2026"` (line ~30) |

**None of these three are set in `.env.local`** — production runs entirely on source-code fallbacks.

Probing the gateway returned 11 models under one endpoint: `claude-sonnet-4-6`, `claude-opus-4-6-thinking`, 8 Gemini variants, `gpt-oss-120b-medium`. **Provider swap is an env-var change, not an engineering task.**

### The four consumers

| Service | Purpose tag | temp / max_tokens / timeout |
|---|---|---|
| `MarketingBrainService` | `marketing_brain` | 0.6 / 1800 / 60s |
| `CreativeInterpretationService` | `creative_interpretation` | 0.2 / 900 / 20s |
| `ConceptProfessionalizerService` | `concept_professionalizer` | 0.7 / 400 / default 15s |
| `InspirationStyleIntelligenceService` | vision (base64 `image_url`) | 0.3 / 2600 / 60s |

`GroqClient` (`llm/groq.client.ts`) is a legacy shim that delegates to the same service — the name is misleading, no Groq is involved.

## 3.3 Reasoning, memory, and stored decisions

| Capability | Status | Evidence |
|---|---|---|
| **Reasoning** | ⚠️ One stage | `MarketingBrainService`, single pass. 4 of 6 named services contain **zero** LLM calls |
| **Multi-step reasoning** | ❌ None | No chain, no alternatives, no revision |
| **Self-critique** | ❌ None | Nothing evaluates output quality at any point |
| **Session memory** | ❌ None | React `useState` only; lost on refresh |
| **Cross-campaign memory** | ❌ None | No database |
| **Brand memory** | ❌ None | `brandInfo` is per-request free text |
| **Decision storage** | ⚠️ Written, never read back | Decisions land in `data/deliveries/*/asset_plan.json` and export metadata, but **no code path reads them** |
| **Learning from outcomes** | ❌ None | `tested_jobs` empty on all 20 blocks |

**Decisions are recorded but never consulted.** The provenance data is high quality — `{dimension, value, source, confidence, specificity, score, client_locked}` per art-direction dimension — and it is write-only. This is the foundation of a memory system already half-built.

---

# 4. Current Knowledge Flow

## 4.1 Storage and structure

```
data/knowledge/
├── KNOWLEDGE_AUTHORING_STANDARD_V1.md   ← the governing constitution
├── universal/    5 blocks   perspective · hierarchy · lighting · scene · typography
├── specialist/  13 blocks   7 poster STYLES + 5 asset-type foundations + 1 poster design
├── materials/    1 block    glass
└── properties/   1 block    transparent
                 ─────────
                 20 blocks / 2,724 words / ~18 KB
```

Each block = `knowledge.md` (prose) + `metadata.json` (schema-validated).

## 4.2 Metadata population — all 20 files audited

| Field | Populated | Note |
|---|---|---|
| `visual_challenges` | 16/20 | The one working content dimension |
| `match_rules` | 14/20 | **Trivial**: `useCase == 'Poster'`, weight 0.85 |
| `categories` | 2/20 | Both are material/property blocks |
| `industry_domains` | 2/20 | `material.glass` → f&b, beauty, pharma; `property.transparent` → general |
| `materials` / `contents` / `properties` / `geometry_traits` / `packaging_types` | 2/20 each | Same two blocks |
| `covers` | 1/20 | |
| `dependencies` | **0/20** | Dependency resolver has nothing to resolve |
| `tested_jobs` | **0/20** | No validation feedback loop |
| `creative_recipe: true` | **0/20** | Mandated `false` by standard §3.3 |

**No schema slot exists** for audience, objective, funnel stage, brand position, or channel. Retrieval could not route on them even if authored.

## 4.3 Retrieval and injection

`SmartKnowledgeRetriever.retrieve()` runs 9 stages. Observed result on a live 5-asset campaign:

```
poster        [5 universal] + property.transparent + specialist.poster_foundation
banner        [5 universal] + property.transparent + specialist.website_banner_foundation
social_ad     [5 universal] + property.transparent + specialist.social_ad_foundation
product_hero  [5 universal] + property.transparent + specialist.product_hero_foundation
thumbnail     [5 universal] + property.transparent + specialist.ugc_thumbnail_foundation
```

**Identical except the asset-type block.** Fully predicted by `assetType` + one material signal. Nothing about *skincare*, *women 25–40*, *premium Korean*, or *launch awareness* altered a single retrieved block.

Injection: `KnowledgeRetrievalDocumentBuilder.ts` emits `Title`, `Summary`, `Relevant descriptors`, `Routing applicability` (materials/properties/contents/geometry/packaging/challenges — **no commercial dimensions**), then `Professional knowledge: {content}`.

Budgets: `KnowledgeBudgetManager.ts` caps knowledge at `MAX_SAFE_PROMPT_CHARS = 19400` with `basePromptChars = 12800` overhead; `PromptBudgetManagerService.ts` enforces `EMERGENCY_TARGET = 22000` / `HARD_MAXIMUM = 24000`.

## 4.4 Evaluation: A or B?

**A — a simple prompt enhancement system.** Reasoning:

1. **It retrieves text, not decisions.** 5.8:1 hedging. A representative sentence: *"Visual emphasis may emerge through relationships among scale, contrast, detail, placement, depth, color, spacing, and surrounding elements according to the needs of the image"* — eight variables named, none ranked.
2. **Selection is not intelligent.** Nine stages resolve to a static lookup.
3. **Nothing conditions on commerce.** No industry, audience, objective, or channel routing exists.
4. **Knowledge answers 1 of 7 decision questions.** It says *what a good state looks like*; it never says when to use, when not to, what the trade-off is, or what to avoid.
5. **No feedback.** Retrieval quality is never measured against outcomes.

It is **not** merely a keyword stuffer — 18% of the prompt is genuine campaign strategy and 11% is scored art direction with provenance. That is above "prompt enhancement". But it is materially below a decision engine.

---

# 5. Current Strengths

These are real and should be **preserved**.

1. **The deterministic core.** Campaign Builder, Asset Adaptation, Art Direction Resolver, Prompt Compiler contain **zero** LLM calls. Auditable, cheap, fast, testable. Most systems at this stage have the opposite problem — everything in one mega-prompt.

2. **Provenance modelling.** Every art-direction decision carries source, confidence, specificity, score and lock state. This is the hardest part of an explainable creative system and it already exists and is surfaced in the UI.

3. **Authority resolution.** Client instructions lock at HIGH specificity and no downstream layer overrides them — verified identical across all five assets of a live run.

4. **Asset differentiation is genuine.** Same campaign, five different jobs:
   `banner` inverts hierarchy to headline-first (headline 34 / cta 28 / product 70) while `product_hero` takes 100% product. This is real art direction, not five crops.

5. **Regression discipline.** 488 assertions across 5 suites, all passing, including a 10-brief × 5-industry campaign benchmark.

6. **Delivery pipeline.** Crop-vs-direct derivation is explicit; a 728×90 leaderboard is a documented crop, not a stretch. Export metadata reads real dimensions from PNG **and** WebP headers.

7. **Provider abstraction is already correct.** One OpenAI-compatible client, dependency-injected into every consumer (`constructor(provider?: LLMProviderService)`). Adding Gemini is an env change.

---

# 6. Current Limitations

Ranked by impact on the CIOS Level 9 goal.

| # | Limitation | Evidence | Impact |
|---|---|---|---|
| L1 | Knowledge forbidden from deciding | Authoring standard Principles A, D, G; `creative_recipe: false` × 20 | **Blocks the entire product thesis** |
| L2 | No differentiation capability | Zero competitive/cliché knowledge; Principle G forbids negative lists | Output is generic by construction |
| L3 | No critique or revision stage | Single-pass; nothing evaluates quality | Ships idea #1 always |
| L4 | No memory of any kind | No DB; `useState` only | Cannot learn, cannot maintain brand consistency across sessions |
| L5 | Retrieval blind to commerce | No industry/audience/objective/channel routing | Same knowledge for a luxury launch and a discount promo |
| L6 | Stale embedding index | 7/20 indexed, generated 2026-08-13 | **13 blocks, incl. all 7 poster styles, semantically unreachable** |
| L7 | Corpus smaller than prompt window | 18 KB corpus vs 22 KB budget | 9-stage retrieval is solving a problem that does not yet exist |
| L8 | 15% of prompt is its weakest content | `PROFESSIONAL KNOWLEDGE` = 3,298 ch of hedged prose | Wasted budget at maximum token cost |
| L9 | Unused authored content | 2,972 words in `knowledge_full.md`, `full_content_file` referenced nowhere | Paid-for asset sitting idle |
| L10 | Campaign state is ephemeral | No persistence layer | Refresh destroys ~21.7 KB × 5 of work |
| L11 | Single undeclared point of failure | `127.0.0.1:8317` not in `.env.local`, not documented | Will not exist in staging/production |
| L12 | Hardcoded credential | `"marketing-test-key-2026"` literal in source | Security + deployment risk |
| L13 | Misleading names / dead deps | `GroqClient` uses no Groq; `@anthropic-ai/sdk`, `openai`, `zustand` unused | Misleads any architecture review |
| L14 | Orphaned `/projects` tree | 1,253 lines, no inbound links | Unclear whether live work or legacy |

---

# 7. CIOS Level 9 Gap Analysis

> **`[UNKNOWN]` — the CIOS Level 9 architecture documents referenced in the brief have not been provided.** This section is a **provisional** gap analysis against the 19-module target architecture established in the prior session. It must be re-validated once the official specification arrives; module names and boundaries may differ.

## 7.1 Gaps by requested dimension

| Dimension | Current | Level 9 target | Gap |
|---|---|---|---|
| **Creative reasoning** | 1 LLM stage (`MarketingBrainService`), single-pass | Staged: business → market → audience → category → differentiation → concept → critique | **Large.** 3 stages missing outright; concept generation is single-shot |
| **Knowledge architecture** | 20 blocks, craft-only, hedged by mandate | Two corpora: model-facing (neutral) + reasoning-facing (prescriptive) across 19 modules | **Largest gap.** Requires a new authoring standard before any authoring |
| **Memory architecture** | None | Session · campaign · brand · outcome memory | **Total.** No persistence layer exists |
| **Retrieval system** | 9 stages, static result, physical signals only | Brief→query transformation; commercial routing; two-tier by corpus size | **Large**, but infrastructure exists and is good |
| **Decision framework** | Excellent for art direction; absent for strategy | Provenance + authority across all decision types | **Partial.** Pattern proven — needs extension, not invention |
| **Creative critic** | None | Generic-output detection, cliché matching, revision loop | **Total.** Highest ROI per unit of effort |
| **Prompt compiler** | Deterministic, budget-aware, section-prioritised | Same, plus reasoning-corpus separation | **Small.** Nearly there |
| **Agency workflow** | Brief → concept → 5 assets → render → download | + versioning, approvals, revisions, client presentation, asset library | **Large**, but this is product surface, not intelligence |

## 7.2 Module coverage snapshot

| Coverage | Modules |
|---|---|
| **60–65%** | 09 Visual Direction · 10 Layout · 17 Production |
| **45–55%** | 14 Photography · 15 Material Realism |
| **20–40%** | 06 Creative Strategy · 16 Channel · 18 Failure Prevention · 07 Concept · 11 Design System · 12 Typography |
| **0–10%** | 01 Business · 02 Market · **03 Category** · **04 Audience** · 05 Brand · **08 Differentiation** · 13 Color · **19 Examples** |

Coverage is **inverted against value**: strongest where diffusion models are already competent (optics, physics, materials), empty where they are hopeless (strategy, audience, differentiation).

---

# 8. Architecture Risks

| ID | Risk | Severity | Detail |
|---|---|---|---|
| R1 | Undeclared local gateway dependency | **High** | All text reasoning depends on `127.0.0.1:8317`. Absent from `.env.local`. Will not exist in any deployed environment |
| R2 | Silent degradation on LLM failure | **High** | `MarketingBrainService` falls back to deterministic output and still reports `success: true`. This exact failure ran undetected until a 15s timeout was traced |
| R3 | Hardcoded API key in source | **High** | `llm-provider.service.ts` line ~30 |
| R4 | Stale index with no repair path | **Medium** | Auto-sync only fires when index is *missing*; rebuild script wired to no npm script |
| R5 | No persistence = no product | **Medium** | Campaigns cannot be saved, revisited, versioned, or shared. Blocks the agency workflow entirely |
| R6 | No auth ahead of multi-tenant use | **Medium** | Acceptable now; blocking for commercial release |
| R7 | Synchronous long requests | **Medium** | 40s campaign + up to 600s render inside one HTTP request. Serverless platforms will time out |
| R8 | Prompt budget pressure | **Medium** | Already dropping `BRAND KNOWLEDGE` at priority 7. Adding reasoning knowledge to the same budget will start evicting strategy |
| R9 | Filesystem storage on ephemeral hosts | **Medium** | 1,003 files in `data/generated`. Vercel-style deploys lose them. Interface exists for cloud swap |
| R10 | Single image provider in practice | **Low** | Abstraction present; Gemini/Cloudflare paths untested recently |

---

# 9. Recommended Upgrade Strategy

## 9.1 Component classification

### KEEP — do not touch

| Component | Rationale |
|---|---|
| `CampaignBuilderService`, `AssetAdaptationService`, `ArtDirectionResolverService`, `MasterPromptCompilerService` | Deterministic, tested, fast. The system's best asset |
| `CommercialLayoutService`, `DeliveryPackageService`, `export-presets.ts`, `export-metadata.ts` | Production-grade |
| Provenance model (`art_direction_decisions`) | Extend the pattern; don't rebuild |
| `LLMProviderService` | Correct abstraction. Only fix the hardcoded key |
| The 5 universal craft blocks | Valid model-facing knowledge under V1 |
| 488-assertion regression suite | The gate for every future phase |
| Campaign Studio UI (`app/campaign-site/page.tsx`) | Already surfaces provenance and reasoning well |

### IMPROVE — extend, don't replace

| Component | Change |
|---|---|
| `KNOWLEDGE_AUTHORING_STANDARD_V1.md` | **Rescope** to model-facing only. Add a V2 for reasoning knowledge |
| `knowledge_block_schema_v1.json` | Add `industry_domains` usage, `audience_segments`, `objectives`, `channels`, `decision_type`, `authority` |
| `SmartKnowledgeRetriever` | Add brief→query transformation; two-tier strategy by corpus size |
| `MarketingBrainService` | Split one call into staged reasoning |
| `PromptBudgetManagerService` | Separate reasoning-corpus budget from image-prompt budget |
| Embedding index | Wire an npm script; detect staleness, not just absence |
| The 7 poster style blocks | Promote to a real Visual Direction taxonomy with style→strategy fit rules |
| Export metadata | Already carries layer geometry — extend toward real editable export |

### REBUILD — architecture insufficient

| Component | Rationale |
|---|---|
| **Nothing in the current codebase** | No existing component's architecture is inadequate for Level 9 |
| *(new)* Memory / persistence layer | Does not exist; must be built |
| *(new)* Reasoning knowledge corpus | Cannot be an edit of the current corpus — different consumer, different standard |
| *(new)* Creative critic service | Does not exist |

> **Explicit finding: no rewrite is warranted.** Every gap is additive. The existing architecture is a sound foundation for Level 9.

## 9.2 Sequencing principle

Each phase must (a) ship something observable, (b) pass the 488-assertion suite unchanged, (c) leave the deterministic fallback path intact.

---

# 10. Phase 2 Implementation Plan

> Assumes CIOS Level 9 documents arrive before Phase 2 begins. If module boundaries differ from §7, re-scope before authoring.

## Phase 2.0 — Preconditions (½ day, zero risk)

| Task | Files | Why first |
|---|---|---|
| Move LLM config to `.env.local` | `.env.local`, `llm-provider.service.ts` | Removes R1/R3 |
| Load `knowledge_full.md` | `KnowledgeRetrievalDocumentBuilder.ts` + retriever | 2,972 words already paid for |
| Wire index rebuild npm script; detect staleness | `package.json`, `SmartKnowledgeRetriever.ts` | **Unlocks 13 unreachable blocks incl. all poster styles** |
| Remove dead deps + rename `GroqClient` | `package.json`, `llm/groq.client.ts` | Stops misleading future audits |

## Phase 2.1 — Authoring constitution (2–3 days)

Write **V2 — Reasoning Knowledge Standard**: prescriptive, numeric, anti-patterns required, closed-world examples encouraged, explicitly *not* injected into image prompts. Rescope V1 to model-facing. Extend the block schema with commercial dimensions and `authority`.

**Deliverable:** two standards, one extended schema. **No knowledge authored yet.**

## Phase 2.2 — Proof on one category (3–5 days)

Author **Module 08 (Differentiation) for skincare only** — the cliché library for the category where a working benchmark already exists (Skin1004). Add the **critique stage**: one LLM call asking *"is this generic, and which category cliché did it land on?"*, followed by one revision pass.

**Files:** new `data/reasoning-knowledge/`, `marketing-brain.service.ts`, `CampaignOrchestratorService.ts`, new critique service.

**Measurement:** re-run the Skin1004 benchmark. Before/after concept comparison is the evidence that justifies Phases 3–4.

## Phase 2.3 — Category + audience (1–2 weeks)

Modules 03 and 04 across the 5 benchmark industries already in `run-campaign-benchmark.ts`. Insert category analysis and audience psychology as reasoning stages. Populate commercial routing metadata. Add brief→query transformation.

## Phase 2.4 — Memory foundation (1 week)

Introduce persistence — campaigns, decisions, outcomes. The provenance data already produced is the schema; it currently has nowhere to live. This unblocks brand memory, versioning, and the agency workflow.

## Success criteria for Phase 2

| Criterion | Measure |
|---|---|
| Regression intact | 488 assertions still pass |
| Differentiation works | Benchmark concepts avoid named category clichés |
| Critique fires | Measurable revision rate > 0 on the 10-brief benchmark |
| Knowledge reachable | 20/20 blocks in the embedding index |
| Deployable | No `127.0.0.1` dependency; no hardcoded key |

---

## Appendix — Audit limitations

- **CIOS Level 9 specification not supplied.** §7 is provisional against the previously agreed 19-module model.
- **Coverage percentages** in §7.2 are architectural judgements, not measurements.
- **The 5.8:1 hedge ratio** is a keyword proxy (regex over modal verbs vs. numerals/imperatives), directionally sound but not a semantic measure.
- **Content read in full** for universal, material and property blocks; **sampled** for the 13 specialist blocks — all 20 `metadata.json` files were read in full.
- **`/projects/*` tree not deeply audited** — its status (live vs. legacy) is `[UNKNOWN]` and should be confirmed by the team.
- **Video pipeline** (`generate-script`, `render-voice`, ElevenLabs) noted but not audited; out of scope for the image-side Level 9 upgrade.
