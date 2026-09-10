import fs from "fs";
import path from "path";
import { IMAGE_ENGINE_CONFIG } from "../config";
import {
  BENCHMARK_DIMENSIONS,
  BENCHMARK_INDUSTRIES,
  BenchmarkCase,
  BenchmarkDataset,
  BenchmarkIndustry,
} from "./creative-benchmark.types";

/**
 * Loads and validates the benchmark dataset.
 *
 * Validation is not ceremony here. A benchmark whose cases drift out of shape
 * produces numbers that still look like numbers, and a wrong benchmark is worse
 * than no benchmark because it is trusted. So the loader refuses to hand back a
 * dataset it cannot vouch for, and `validate()` reports every problem at once
 * rather than failing on the first.
 */
export class BenchmarkDatasetRepository {
  private readonly filePath: string;
  private cache: BenchmarkDataset | null = null;

  constructor(filePath: string = IMAGE_ENGINE_CONFIG.CREATIVE_BENCHMARK_PATH) {
    this.filePath = filePath;
  }

  public getPath(): string {
    return this.filePath;
  }

  public load(): BenchmarkDataset {
    if (this.cache) return this.cache;
    if (!fs.existsSync(this.filePath)) {
      throw new Error(`Benchmark dataset not found at ${this.filePath}`);
    }
    const raw = fs.readFileSync(this.filePath, "utf-8");
    let parsed: BenchmarkDataset;
    try {
      parsed = JSON.parse(raw) as BenchmarkDataset;
    } catch (err: any) {
      throw new Error(`Benchmark dataset is not valid JSON (${path.basename(this.filePath)}): ${err.message}`);
    }
    const issues = BenchmarkDatasetRepository.validate(parsed);
    if (issues.length) {
      throw new Error(`Benchmark dataset failed validation:\n  - ${issues.join("\n  - ")}`);
    }
    this.cache = parsed;
    return parsed;
  }

  public getCases(): BenchmarkCase[] {
    return this.load().cases;
  }

  public getByIndustry(industry: BenchmarkIndustry): BenchmarkCase[] {
    return this.getCases().filter((c) => c.industry === industry);
  }

  public getById(caseId: string): BenchmarkCase | null {
    return this.getCases().find((c) => c.case_id === caseId) || null;
  }

  public stats(): { total: number; byIndustry: Record<string, number>; byChallenge: Record<string, number> } {
    const cases = this.getCases();
    const byIndustry: Record<string, number> = {};
    const byChallenge: Record<string, number> = {};
    for (const c of cases) {
      byIndustry[c.industry] = (byIndustry[c.industry] || 0) + 1;
      byChallenge[c.challenge] = (byChallenge[c.challenge] || 0) + 1;
    }
    return { total: cases.length, byIndustry, byChallenge };
  }

  /** Every structural problem in the dataset, as plain sentences. */
  public static validate(dataset: BenchmarkDataset): string[] {
    const issues: string[] = [];
    if (!dataset || typeof dataset !== "object") return ["Dataset is not an object."];
    if (!dataset.dataset_id) issues.push("Missing dataset_id.");
    if (!/^v\d+$/.test(dataset.version || "")) issues.push(`Version "${dataset.version}" must look like v1.`);
    if (!Array.isArray(dataset.cases) || dataset.cases.length === 0) {
      issues.push("Dataset has no cases.");
      return issues;
    }

    const validDimensions = new Set(BENCHMARK_DIMENSIONS.map((d) => d.id));
    const seen = new Set<string>();

    for (const c of dataset.cases) {
      const id = c.case_id || "(no id)";
      if (seen.has(id)) issues.push(`Duplicate case_id "${id}".`);
      seen.add(id);

      if (!/^bench\.[a-z_]+\.[a-z0-9_]+\.\d{3}$/.test(id)) {
        issues.push(`${id}: case_id must be bench.<industry>.<topic>.<NNN>.`);
      }
      if (!BENCHMARK_INDUSTRIES.includes(c.industry)) {
        issues.push(`${id}: "${c.industry}" is not a benchmark industry.`);
      }
      // The id encodes the industry, so a mismatch means one of the two is a
      // typo — and both are used for grouping, which would split a case out of
      // its own cohort silently.
      if (c.industry && !id.startsWith(`bench.${c.industry}.`)) {
        issues.push(`${id}: case_id does not match industry "${c.industry}".`);
      }
      if (!c.creative_challenge || c.creative_challenge.length < 20) {
        issues.push(`${id}: creative_challenge is missing or too short to state a problem.`);
      }

      const b = c.brief || ({} as BenchmarkCase["brief"]);
      for (const field of ["brand", "product", "audience", "objective", "channel", "tone"] as const) {
        if (!b[field]) issues.push(`${id}: brief.${field} is required.`);
      }

      const cr = c.criteria;
      if (!cr) {
        issues.push(`${id}: criteria is required.`);
        continue;
      }
      if (!cr.must_address || cr.must_address.length < 2) {
        issues.push(`${id}: must_address needs at least two entries.`);
      }
      if (!cr.must_avoid || cr.must_avoid.length < 2) {
        issues.push(`${id}: must_avoid needs at least two entries.`);
      }
      if (!cr.weighted_dimensions || cr.weighted_dimensions.length < 2) {
        issues.push(`${id}: weighted_dimensions needs at least two entries.`);
      }
      for (const d of cr.weighted_dimensions || []) {
        if (!validDimensions.has(d)) issues.push(`${id}: "${d}" is not a benchmark dimension.`);
      }
    }

    return issues;
  }
}
