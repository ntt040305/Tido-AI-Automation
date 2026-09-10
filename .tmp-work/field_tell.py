# -*- coding: utf-8 -*-
"""Add the per-field absence tell — the coverage check was too coarse to see it."""
import io

p = "lib/image-engine/benchmark/HumanBenchmarkPreparer.ts"
s = io.open(p, encoding="utf-8").read()

# 1. New failure kind on the types.
t = "lib/image-engine/benchmark/human-benchmark.types.ts"
ts = io.open(t, encoding="utf-8").read()
ts = ts.replace('''  /** One side systematically empty where the other is filled. */
  | "COVERAGE_TELL"''', '''  /** One side systematically empty where the other is filled. */
  | "COVERAGE_TELL"
  /**
   * One specific field empty on one side in most cases and filled on the other.
   *
   * Separate from COVERAGE_TELL because the coarse check compares total filled
   * counts, and a side missing exactly one field on 26 of 30 cases barely moves
   * that total while being the most obvious tell a reviewer could have: the same
   * box reads "(not provided)" on the same side, case after case.
   */
  | "FIELD_ABSENCE_TELL"''')
io.open(t, "w", encoding="utf-8").write(ts)

# 2. The check itself, inserted before the register tell.
ANCHOR = "    // ── 3. Register tell ───────────────────────────────────────────────"
NEW = '''    // ── 2b. Per-field absence tell ─────────────────────────────────────
    //
    // The coarse coverage check above compares how many fields each side filled
    // in total. That misses the sharpest tell there is: one side leaving the
    // SAME field blank case after case. A reviewer does not count fields, they
    // notice that "big idea" reads "(not provided)" on submission B every time.
    const fieldNames = [
      ...Object.keys(packet.cases[0]?.submissions[0].concept ?? {}).map((k) => `concept.${k}`),
      ...Object.keys(packet.cases[0]?.submissions[0].direction ?? {}).map((k) => `direction.${k}`),
    ];
    for (const field of fieldNames) {
      const [group, key] = field.split(".") as ["concept" | "direction", string];
      let asymmetric = 0;
      const affected: string[] = [];
      for (const c of packet.cases) {
        const aIs = assignment[c.case_id];
        if (!aIs) continue;
        const a = String((c.submissions[0][group] as Record<string, string>)[key] ?? "").trim();
        const b = String((c.submissions[1][group] as Record<string, string>)[key] ?? "").trim();
        if (Boolean(a) !== Boolean(b)) {
          asymmetric++;
          affected.push(c.case_id);
        }
      }
      const share = packet.cases.length ? asymmetric / packet.cases.length : 0;
      if (share >= 0.6) {
        findings.push({
          kind: "FIELD_ABSENCE_TELL",
          severity: "BLOCKING",
          summary:
            `"${field}" is present on one side and absent on the other in ${asymmetric} of ${packet.cases.length} cases ` +
            `(${Math.round(share * 100)}%). The same box reads empty on the same side case after case, which identifies it.`,
          evidence: [],
          affected_cases: affected.slice(0, 8),
        });
      }
    }

''' + ANCHOR
assert ANCHOR in s, "register anchor missing"
s = s.replace(ANCHOR, NEW, 1)
io.open(p, "w", encoding="utf-8").write(s)
print("per-field absence tell added")
