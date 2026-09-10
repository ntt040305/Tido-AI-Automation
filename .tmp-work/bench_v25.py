# -*- coding: utf-8 -*-
"""Phase 3.1.7 — wire the LegacyCreativeProvider in and add the material dimension."""
import io

# ── 1. Types: material on the output, and as a 15th dimension ───────────
p = "lib/image-engine/benchmark/creative-benchmark.types.ts"
s = io.open(p, encoding="utf-8").read()

OLD_DIR = '''  direction: {
    camera: string;
    lighting: string;
    composition: string;
    colour: string;
    atmosphere: string;
    typography: string;
  };'''
NEW_DIR = '''  direction: {
    camera: string;
    lighting: string;
    composition: string;
    colour: string;
    atmosphere: string;
    typography: string;
    /** Phase 3.1.7 — surfaces and finish, now measured on both sides. */
    material: string;
  };'''
assert OLD_DIR in s, "direction anchor missing"
s = s.replace(OLD_DIR, NEW_DIR)

s = s.replace('''  | "typography"
  | "photography"
  | "color_direction"''', '''  | "typography"
  | "photography"
  | "color_direction"
  | "material"''')

OLD_COLOR_DIM = '''  {
    id: "color_direction",
    category: "visual",
    method: "AUTOMATED",
    question: "Is there a concrete colour instruction?",
  },'''
NEW_COLOR_DIM = '''  {
    id: "color_direction",
    category: "visual",
    method: "AUTOMATED",
    question: "Is there a concrete colour instruction?",
  },
  {
    id: "material",
    category: "visual",
    method: "AUTOMATED",
    question: "Is there a concrete instruction for how surfaces and materials render?",
  },'''
assert OLD_COLOR_DIM in s, "color dimension anchor missing"
s = s.replace(OLD_COLOR_DIM, NEW_COLOR_DIM)

# Record which backend produced the baseline, on every result.
s = s.replace('''  /** How this output was produced, for the record. */
  source: string;''', '''  /** How this output was produced, for the record. */
  source: string;
  /**
   * Phase 3.1.7 — which baseline backend produced a LEGACY output.
   *
   * Carried onto the result rather than the run header because a single run can
   * mix them: the llm backend degrades to template per case when a call fails,
   * and a report that averaged the two without saying so would be comparing CIOS
   * against two different baselines at once.
   */
  legacy_backend?: "llm" | "template";
  legacy_degraded_reason?: string;''')

io.open(p, "w", encoding="utf-8").write(s)
print("types: +material dimension, +legacy_backend")

# ── 2. Scorer: score the material dimension ─────────────────────────────
p = "lib/image-engine/benchmark/CreativeBenchmarkScorer.ts"
s = io.open(p, encoding="utf-8").read()
OLD = '''      case "color_direction":
        return this.scoreInstruction(base, dir.colour, "colour");'''
NEW = '''      case "color_direction":
        return this.scoreInstruction(base, dir.colour, "colour");
      case "material":
        return this.scoreInstruction(base, dir.material, "material");'''
assert OLD in s, "scorer colour anchor missing"
s = s.replace(OLD, NEW)
io.open(p, "w", encoding="utf-8").write(s)
print("scorer: material scored")

# ── 3. Comparison engine: real baseline instead of an empty one ─────────
p = "lib/image-engine/benchmark/BenchmarkComparisonEngine.ts"
s = io.open(p, encoding="utf-8").read()

s = s.replace('''import { CreativeKnowledgeService } from "../service/CreativeKnowledgeService";''',
              '''import { LegacyBackend, LegacyCreativeProvider } from "./LegacyCreativeProvider";''')

OLD_OPTS = '''  /**
   * Supplies the legacy concept in live mode. Injected rather than constructed so
   * the benchmark never reaches for the network on its own.
   */
  legacyConceptProvider?: (c: BenchmarkCase) => Promise<{
    big_idea: string;
    core_message: string;
    consumer_insight: string;
    differentiation: string;
  }>;'''
NEW_OPTS = '''  /**
   * The baseline. Defaults to the template backend, which needs no network.
   *
   * Phase 3.1.7 replaced the old `legacyConceptProvider` seam: it only supplied a
   * concept, leaving the legacy direction to CreativeKnowledgeService, so the two
   * halves of the baseline came from different systems. A baseline assembled from
   * parts is not a baseline.
   */
  legacyProvider?: LegacyCreativeProvider;
  legacyBackend?: LegacyBackend;'''
assert OLD_OPTS in s, "options anchor missing"
s = s.replace(OLD_OPTS, NEW_OPTS)

OLD_LEGACY = s[s.index("  private static async buildLegacyOutput("):s.index("  private static emptyOutput(")]
NEW_LEGACY = '''  private static async buildLegacyOutput(
    benchmarkCase: BenchmarkCase,
    mode: BenchmarkMode,
    options: ComparisonOptions,
    warnings: string[]
  ): Promise<BenchmarkOutput> {
    const provider =
      options.legacyProvider ||
      new LegacyCreativeProvider({ backend: options.legacyBackend || (mode === "live" ? "llm" : "template") });

    const out = await provider.generate(benchmarkCase);

    if (out.degraded_reason) {
      warnings.push(`LEGACY_BACKEND_DEGRADED: ${benchmarkCase.case_id} — ${out.degraded_reason}`);
    }
    if (out.backend === "template") {
      // Stated on every case, because it is the one caveat that decides how much
      // the taste dimensions are worth. The structural dimensions survive it; the
      // originality and differentiation comparisons do not.
      warnings.push(
        "TEMPLATE_BASELINE: the legacy side was produced by the deterministic backend, authored by the same hand as CIOS. " +
          "Structural dimensions (concreteness, coverage, consistency) are meaningful; originality and differentiation are not. " +
          "Run with the llm backend for a defensible taste comparison."
      );
    }

    return {
      pipeline: "LEGACY",
      concept: out.concept,
      direction: out.direction,
      knowledge_used: [],
      source:
        out.backend === "llm"
          ? "LegacyCreativeProvider (llm) — brief → generic creative reasoning → direction"
          : "LegacyCreativeProvider (template) — brief → category convention → direction",
      legacy_backend: out.backend,
      legacy_degraded_reason: out.degraded_reason,
    };
  }

'''
s = s.replace(OLD_LEGACY, NEW_LEGACY)

# emptyOutput must carry the new material field.
s = s.replace('''      direction: { camera: "", lighting: "", composition: "", colour: "", atmosphere: "", typography: "" },''',
              '''      direction: { camera: "", lighting: "", composition: "", colour: "", atmosphere: "", typography: "", material: "" },''')

# CIOS side gains material from the direction slot added in 3.1.6.
s = s.replace('''        typography: shadow.cios_direction.typography_strategy || "",
      },''', '''        typography: shadow.cios_direction.typography_strategy || "",
        material: shadow.cios_direction.material_direction || "",
      },''')

io.open(p, "w", encoding="utf-8").write(s)
print("comparison engine: real baseline wired")
