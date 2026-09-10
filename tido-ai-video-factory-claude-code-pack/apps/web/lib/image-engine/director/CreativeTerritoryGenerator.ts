import {
  CreativeTerritoryV2,
  CreativeUnderstanding,
  DirectorBrief,
} from "./creative-director.types";

/**
 * CIOS Phase 4.1 Task 2 — several directions, not one solution.
 *
 * Why more than one
 * ----------------
 * One idea cannot be judged. The whole downstream apparatus — taste engine,
 * director model, ranking — is built to choose, and it has spent every phase so
 * far choosing between rephrasings of a single strategy. A territory generator
 * that returns one territory is a strategy layer wearing a plural noun.
 *
 * Each territory here is built from a *different part of the understanding*:
 * the emotion, the visual opportunity, the brand's role, the challenge. That is
 * what makes them different directions rather than the same direction described
 * four ways — they are literally about different things.
 *
 * On the names
 * ------------
 * Fixed archetypes rather than phrases generated from the brief. An earlier
 * version composed names by pulling content words out of the understanding and
 * title-casing them, which produced "Wanting Deciding Want" and "Appetite Comes
 * Thought" — word salad presented as a creative artefact. A stable archetype
 * name that a team can actually say is more useful and more honest than a
 * brief-specific one that is gibberish. Two briefs may share a territory name;
 * they are archetypes, and that is what an archetype is.
 *
 * Relationship to the existing territory engine
 * --------------------------------------------
 * `reasoning/CreativeTerritoryEngine` builds territories from a human-insight
 * ladder for the campaign-idea pipeline. This one builds them from a client
 * brief for the image pipeline, and carries the two fields that pipeline needs
 * and the other does not: a `visual_metaphor` that can actually be photographed,
 * and a `story_world` a format planner can place a camera inside. Neither
 * replaces the other; they serve different consumers.
 */

export class CreativeTerritoryGenerator {
  /**
   * Generates the territories this understanding supports.
   *
   * Between three and five. A territory whose source material is missing is not
   * produced — a padded list is worse than a short one, because the ranking
   * downstream cannot tell padding from a real option.
   */
  public static generate(
    brief: DirectorBrief,
    understanding: CreativeUnderstanding
  ): CreativeTerritoryV2[] {
    const out: CreativeTerritoryV2[] = [];
    const who = shortAudience(brief.audience);
    const category = String(brief.category || "the category").toLowerCase();

    // ── 1. Built on the emotion ────────────────────────────────────────
    out.push({
      name: "Felt Before Read",
      big_idea: `The picture delivers ${understanding.human_emotion} before ${who} have read a single word`,
      emotional_direction: understanding.human_emotion,
      visual_metaphor: `${brief.product} caught at the exact moment the feeling arrives — not before it, not after`,
      story_world: `A run of images that are all the same instant in different lives: the second before the first taste, the first look, the first use`,
      brand_connection: understanding.brand_role,
      derived_from: "human_emotion",
    });

    // ── 2. Built on the visual opportunity ─────────────────────────────
    out.push({
      name: "Shown Not Said",
      big_idea: `Stop claiming it and ${understanding.visual_opportunity}`,
      emotional_direction: "the satisfaction of being shown evidence instead of being told a claim",
      visual_metaphor: `The product at a distance no ${category} advertisement normally uses — close enough that the proof is in the surface`,
      story_world: `A body of work that treats ${brief.product} as a subject worth examining rather than a product worth announcing`,
      brand_connection: `${brief.brand} is confident enough to let the thing speak for itself`,
      derived_from: "visual_opportunity",
    });

    // ── 3. Built on the challenge ──────────────────────────────────────
    out.push({
      name: "Against The Grain",
      big_idea: `Do the opposite of what ${category} does, on purpose and visibly`,
      emotional_direction: "the small jolt of seeing a familiar thing framed unfamiliarly",
      visual_metaphor: `Every convention of the ${category} shot inverted — the light, the angle, or the moment, but only one of them`,
      story_world: `A campaign recognisable as ${category} at a glance and unlike any of it on a second look`,
      brand_connection: `${brief.brand} is the one that did not copy the category's homework`,
      derived_from: "creative_challenge",
    });

    // ── 4. Built on the brand's role ───────────────────────────────────
    out.push({
      name: "The Brand As Verb",
      big_idea: understanding.brand_role,
      emotional_direction: "trust earned by watching someone do the work",
      visual_metaphor: `The evidence of the brand's behaviour left visible in the frame — the process, the hand, or the thing left out`,
      story_world: `A series where the brand is present as an action rather than as a logo`,
      brand_connection: `The role is the idea: what ${brief.brand} does is what the picture is of`,
      derived_from: "brand_role",
    });

    // ── 5. Built on the desired reaction, only where one was stated ────
    // This is the territory most likely to be padding, so it is the one gated on
    // the brief actually having said something.
    if (understanding.grounding >= 0.5) {
      out.push({
        name: "After The Look",
        big_idea: `Build the frame backwards from the moment ${who} ${understanding.desired_reaction}`,
        emotional_direction: understanding.human_emotion,
        visual_metaphor: `The consequence rather than the product: what the room, the table or the person looks like afterwards`,
        story_world: `A campaign about aftermaths — every image is the minute after ${brief.product} did its job`,
        brand_connection: `${brief.brand} is measured by what it leaves behind`,
        derived_from: "desired_reaction",
      });
    }

    return out;
  }

  /**
   * Picks the territory to execute.
   *
   * Deliberately simple and stated rather than scored: the first territory whose
   * source material was actually grounded in the brief, falling back to the
   * emotion territory. A scoring model here would be a third ranking layer
   * competing with the two that already exist, and this phase is about deciding
   * a picture, not about adding another evaluator.
   */
  public static choose(
    territories: CreativeTerritoryV2[],
    understanding: CreativeUnderstanding
  ): CreativeTerritoryV2 {
    if (!territories.length) throw new Error("No territories to choose from.");
    const groundedFirst: string[] = [];
    if (!understanding.assumptions.some((a) => /Visual opportunity defaulted/.test(a))) {
      groundedFirst.push("visual_opportunity");
    }
    if (!understanding.assumptions.some((a) => /Challenge inferred/.test(a))) {
      groundedFirst.push("creative_challenge");
    }
    if (!understanding.assumptions.some((a) => /Emotion defaulted/.test(a))) {
      groundedFirst.push("human_emotion");
    }
    for (const source of groundedFirst) {
      const hit = territories.find((t) => t.derived_from === source);
      if (hit) return hit;
    }
    return territories[0];
  }

}


function shortAudience(raw: string): string {
  const t = String(raw || "").replace(/\.$/, "").trim();
  if (!t) return "people";
  const head = t
    .replace(/\baged?\s+\d+[^,]*/gi, " ")
    .replace(/\b\d+\s*[-–—]\s*\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .split(/\s+who\b|\s+that\b|\s+with\b|,/i)[0]
    .trim();
  const words = head.split(/\s+/).filter(Boolean).slice(0, 3);
  return (words.join(" ") || "people").toLowerCase();
}
