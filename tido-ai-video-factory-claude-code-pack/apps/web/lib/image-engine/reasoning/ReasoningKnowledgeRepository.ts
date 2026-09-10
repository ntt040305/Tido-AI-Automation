import fs from "fs";
import path from "path";
import { IMAGE_ENGINE_CONFIG } from "../config";
import { ReasoningKnowledgeObject } from "./reasoning-knowledge.types";

/**
 * Loader for CIOS Layer 2 — Reasoning Knowledge.
 *
 * A deliberate sibling of LocalKnowledgeRepository rather than a reuse of it.
 * Layer 1 blocks are a metadata.json + knowledge.md pair validated against
 * knowledge_block_schema_v1.json, which sets `additionalProperties: false` over
 * 23 required fields — every Layer 2 field would fail it. Pointing the existing
 * repository at this directory would break `validateRepository()` for the whole
 * engine, so the two corpora keep separate loaders, schemas and indexes.
 *
 * Governance §16 sets the format: authored as YAML, converted to JSON at runtime.
 * Both extensions are accepted so a generated or exported object can be dropped
 * in without a conversion step.
 */
export class ReasoningKnowledgeRepository {
  private readonly rootDir: string;
  private cache: ReasoningKnowledgeObject[] | null = null;
  private loadErrors: { file: string; message: string }[] = [];

  constructor(rootDir: string = IMAGE_ENGINE_CONFIG.REASONING_KNOWLEDGE_DIR) {
    this.rootDir = rootDir;
  }

  public getRootDir(): string {
    return this.rootDir;
  }

  /** Files that could not be parsed. Never thrown — a bad file must not blank the corpus. */
  public getLoadErrors(): { file: string; message: string }[] {
    return [...this.loadErrors];
  }

  public clearCache(): void {
    this.cache = null;
    this.loadErrors = [];
  }

  /**
   * Parses YAML if a parser is resolvable, otherwise JSON only.
   *
   * js-yaml is present in the tree but reaches us transitively, so its absence is
   * treated as a degraded mode rather than a crash: .json objects still load and
   * the caller is told which files were skipped.
   */
  private parseFile(filePath: string): unknown {
    const raw = fs.readFileSync(filePath, "utf-8");
    if (filePath.endsWith(".json")) return JSON.parse(raw);

    try {
      // Required lazily so a missing parser degrades instead of breaking import.
      const yaml = require("js-yaml");
      return yaml.load(raw);
    } catch (err: any) {
      if (err?.code === "MODULE_NOT_FOUND") {
        throw new Error(
          "YAML parser unavailable (js-yaml). Author the object as .json, or install js-yaml."
        );
      }
      throw err;
    }
  }

  private walk(dir: string, out: string[]): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      // _schema holds the JSON Schema itself, not knowledge.
      if (entry.isDirectory()) {
        if (entry.name.startsWith("_") || entry.name.startsWith(".")) continue;
        this.walk(full, out);
      } else if (/\.(ya?ml|json)$/i.test(entry.name) && !entry.name.startsWith(".")) {
        out.push(full);
      }
    }
  }

  /**
   * Loads every object under the corpus root.
   *
   * An unparseable or non-object file is recorded and skipped. A corpus that
   * silently drops half its knowledge is the failure mode that made the Layer 1
   * embedding index ship with 7 of 20 blocks, so nothing here fails quietly.
   */
  public getAll(): ReasoningKnowledgeObject[] {
    if (this.cache) return this.cache;

    this.loadErrors = [];
    const files: string[] = [];
    this.walk(this.rootDir, files);

    const objects: ReasoningKnowledgeObject[] = [];
    for (const file of files) {
      try {
        const parsed = this.parseFile(file);
        const relative = path.relative(this.rootDir, file).split(path.sep).join("/");

        // A single file may hold one object or a list of them.
        const items = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of items) {
          if (!item || typeof item !== "object") {
            this.loadErrors.push({ file: relative, message: "Not a knowledge object" });
            continue;
          }
          objects.push({ ...(item as ReasoningKnowledgeObject), _file: relative });
        }
      } catch (err: any) {
        this.loadErrors.push({
          file: path.relative(this.rootDir, file).split(path.sep).join("/"),
          message: err?.message || String(err),
        });
      }
    }

    this.cache = objects;
    return objects;
  }

  public getById(knowledgeId: string): ReasoningKnowledgeObject | null {
    return this.getAll().find((o) => o.knowledge_id === knowledgeId) || null;
  }

  public getByDomain(domain: string): ReasoningKnowledgeObject[] {
    return this.getAll().filter((o) => o.domain === domain);
  }

  /** Duplicate ids break the permanence rule in Governance §3. */
  public findDuplicateIds(): string[] {
    const seen = new Map<string, number>();
    for (const o of this.getAll()) {
      if (!o.knowledge_id) continue;
      seen.set(o.knowledge_id, (seen.get(o.knowledge_id) || 0) + 1);
    }
    return [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id);
  }

  /** related_knowledge entries that point at nothing. */
  public findBrokenRelations(): { from: string; to: string }[] {
    const ids = new Set(this.getAll().map((o) => o.knowledge_id));
    const broken: { from: string; to: string }[] = [];
    for (const o of this.getAll()) {
      for (const rel of o.related_knowledge || []) {
        if (!ids.has(rel)) broken.push({ from: o.knowledge_id, to: rel });
      }
    }
    return broken;
  }

  public stats(): { total: number; byDomain: Record<string, number>; loadErrors: number } {
    const all = this.getAll();
    const byDomain: Record<string, number> = {};
    for (const o of all) byDomain[o.domain] = (byDomain[o.domain] || 0) + 1;
    return { total: all.length, byDomain, loadErrors: this.loadErrors.length };
  }
}
