import { CreativeStructure } from "./creative-patterns.types";
import { MemoryMechanism, TasteEdge, TasteNode, TastePath } from "./emotional-mechanism.types";

/**
 * CIOS Phase 4.0.6 — what has been made, held as a shape.
 *
 *   Idea → Creative Structure → Emotional Mechanism → Director Decision → Outcome
 *
 * Why a graph rather than rows
 * ---------------------------
 * `TasteMemoryRetriever` already stores decisions as records, and records answer
 * questions about individual ideas. The questions this phase needs are about the
 * *middle* of the chain: which mechanisms survive a director, which structures
 * carry which mechanisms, which pairings have never been tried at all. Those are
 * questions about connections, and a table of outcomes cannot answer them
 * without reconstructing the graph anyway.
 *
 * The one that matters most is the last: a pairing with no edge is a combination
 * this system has never made. That is the only place in the whole codebase where
 * *absence* is the useful signal, and it is what `UNUSUAL_COMBINATION` in the
 * attention engine reads.
 *
 * What this is not
 * ---------------
 * It is not a model of taste. It records what was made and what happened to it,
 * and every count in it is a count of this engine's own output judged by this
 * engine's own director model. A pairing that survives here has survived a proxy,
 * not a person. That distinction is the reason the attention engine surfaces
 * rather than decides.
 */

export class CreativeTasteGraph {
  private readonly nodes = new Map<string, TasteNode>();
  private readonly edges = new Map<string, TasteEdge>();
  private readonly paths: TastePath[] = [];

  private static key(kind: string, label: string): string {
    return `${kind}:${label}`;
  }

  private touch(kind: TasteNode["kind"], label: string): string {
    const id = CreativeTasteGraph.key(kind, label);
    const existing = this.nodes.get(id);
    if (existing) existing.count++;
    else this.nodes.set(id, { id, kind, label, count: 1 });
    return id;
  }

  private link(from: string, to: string): void {
    const id = `${from}→${to}`;
    const existing = this.edges.get(id);
    if (existing) existing.count++;
    else this.edges.set(id, { from, to, count: 1 });
  }

  /** Records one complete path, from an idea to what happened to it. */
  public add(path: TastePath): void {
    this.paths.push(path);
    const idea = this.touch("idea", path.idea);
    const decision = this.touch("decision", path.decision);
    const outcome = this.touch("outcome", path.outcome);

    // A missing structure or mechanism breaks the chain rather than being
    // bridged. An edge that skips a stage would make the graph say a structure
    // led to a decision when nothing was recorded in between.
    if (path.structure) {
      const structure = this.touch("structure", path.structure);
      this.link(idea, structure);
      if (path.mechanism) {
        const mechanism = this.touch("mechanism", path.mechanism);
        this.link(structure, mechanism);
        this.link(mechanism, decision);
      }
    } else if (path.mechanism) {
      const mechanism = this.touch("mechanism", path.mechanism);
      this.link(idea, mechanism);
      this.link(mechanism, decision);
    } else {
      this.link(idea, decision);
    }
    this.link(decision, outcome);
  }

  public size(): number {
    return this.paths.length;
  }

  public allPaths(): TastePath[] {
    return [...this.paths];
  }

  public reset(): void {
    this.nodes.clear();
    this.edges.clear();
    this.paths.length = 0;
  }

  // ── Queries ─────────────────────────────────────────────────────────────

  /** How often each mechanism survived the director. */
  public mechanismSurvival(): { mechanism: MemoryMechanism; kept: number; total: number; rate: number }[] {
    const stats = new Map<MemoryMechanism, { kept: number; total: number }>();
    for (const p of this.paths) {
      if (!p.mechanism) continue;
      const cur = stats.get(p.mechanism) || { kept: 0, total: 0 };
      cur.total++;
      if (p.outcome === "kept") cur.kept++;
      stats.set(p.mechanism, cur);
    }
    return [...stats.entries()]
      .map(([mechanism, v]) => ({ mechanism, ...v, rate: Number((v.kept / v.total).toFixed(3)) }))
      .sort((a, b) => b.rate - a.rate || b.total - a.total);
  }

  /**
   * How a structure-and-mechanism pairing has fared.
   *
   * The unit the attention engine reads: a structure is how an idea was built
   * and a mechanism is why it would be kept, and the pairing is more
   * informative than either alone.
   */
  public pairing(structure: string, mechanism: string): { kept: number; total: number; rate: number } {
    let kept = 0;
    let total = 0;
    for (const p of this.paths) {
      if (p.structure !== structure || p.mechanism !== mechanism) continue;
      total++;
      if (p.outcome === "kept") kept++;
    }
    return { kept, total, rate: total ? Number((kept / total).toFixed(3)) : 0 };
  }

  /** Every pairing seen, best-surviving first. */
  public pairings(): { structure: string; mechanism: string; kept: number; total: number; rate: number }[] {
    const seen = new Map<string, { structure: string; mechanism: string }>();
    for (const p of this.paths) {
      if (!p.structure || !p.mechanism) continue;
      seen.set(`${p.structure}|${p.mechanism}`, { structure: p.structure, mechanism: p.mechanism });
    }
    return [...seen.values()]
      .map((x) => ({ ...x, ...this.pairing(x.structure, x.mechanism) }))
      .sort((a, b) => b.rate - a.rate || b.total - a.total);
  }

  /**
   * Has this combination ever been made?
   *
   * The only query in the codebase where absence is the signal.
   */
  public isNovelPairing(structure: string | null, mechanism: string | null): boolean {
    if (!structure || !mechanism) return false;
    return this.pairing(structure, mechanism).total === 0;
  }

  /** Structures that have carried a given mechanism. */
  public structuresFor(mechanism: MemoryMechanism): CreativeStructure[] {
    const out = new Set<CreativeStructure>();
    for (const p of this.paths) {
      if (p.mechanism === mechanism && p.structure) out.add(p.structure as CreativeStructure);
    }
    return [...out];
  }

  public aggregate(): {
    paths: number;
    nodes: number;
    edges: number;
    kept: number;
    mechanism_survival: ReturnType<CreativeTasteGraph["mechanismSurvival"]>;
    pairings: number;
    /** Pairings seen exactly once: too thin to learn from, worth noticing. */
    singleton_pairings: number;
  } {
    const pairings = this.pairings();
    return {
      paths: this.paths.length,
      nodes: this.nodes.size,
      edges: this.edges.size,
      kept: this.paths.filter((p) => p.outcome === "kept").length,
      mechanism_survival: this.mechanismSurvival(),
      pairings: pairings.length,
      singleton_pairings: pairings.filter((p) => p.total === 1).length,
    };
  }

  public format(): string {
    const agg = this.aggregate();
    const L = [
      `TASTE GRAPH — ${agg.paths} paths · ${agg.nodes} nodes · ${agg.edges} edges`,
      `  kept ${agg.kept} of ${agg.paths}`,
      "  mechanisms, by how often they survived the director:",
    ];
    for (const m of agg.mechanism_survival) {
      L.push(`    ${(m.rate * 100).toFixed(0).padStart(3)}%  ${m.mechanism.padEnd(16)} ${m.kept}/${m.total}`);
    }
    L.push(`  structure × mechanism pairings : ${agg.pairings} (${agg.singleton_pairings} seen once)`);
    L.push("");
    L.push("  note: every count here is this engine's output judged by this engine's director");
    L.push("        model. A pairing that survives has survived a proxy, not a person — which is");
    L.push("        why the attention engine surfaces rather than decides.");
    return L.join("\n");
  }
}
