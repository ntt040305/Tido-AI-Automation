import { CreativeTerritory } from "./creative-taste.types";
import { classify } from "./semantic-relations";

/**
 * CIOS Phase 4.0.4.1 — can this be more than one execution?
 *
 * What was wrong with `execution_potential`
 * ----------------------------------------
 * It counted concrete nouns and checked for unfilmable vocabulary. That answers
 * "could you shoot this once", which is not the question. The question a director
 * asks is whether the idea survives being made six different ways, because an
 * idea that only works as one film is an ad, not a campaign.
 *
 * Six channels, and each asks something different of an idea:
 *
 *   film       Needs a change over time — something that is different at the end.
 *   social     Needs to work without sound, small, and mid-scroll.
 *   print      Needs to hold in one static frame with no sequence to help it.
 *   activation Needs something a person can *do*, not merely watch.
 *   experience Needs a place it could happen in.
 *   platform   Needs to still be true after the first execution has run.
 *
 * A campaign that passes four or more is scalable. Fewer than three and it is a
 * single execution wearing a campaign's name.
 *
 * The limit
 * --------
 * These are structural reads on a sentence, and a real channel test is a team
 * spending a week trying. What this catches is the idea that plainly cannot go
 * somewhere — no change, so no film; nothing to do, so no activation. It cannot
 * tell you the six would be any good.
 */

export const CHANNELS = ["film", "social", "print", "activation", "experience", "platform"] as const;
export type Channel = (typeof CHANNELS)[number];

export interface ChannelVerdict {
  channel: Channel;
  works: boolean;
  /** What in the idea decided it. */
  evidence: string;
  /** What would have to be true for it to work here. */
  requirement: string;
}

export interface ScalabilityResult {
  idea: string;
  verdicts: ChannelVerdict[];
  /** How many channels the idea can occupy. */
  channels: number;
  /** 0-1. */
  scalability: number;
  /** True at four or more. */
  scalable: boolean;
  notes: string[];
}

/** Something changes: the minimum a film needs. */
const CHANGE =
  /\b(?:before|after|then|until|becomes?|turns? into|stops?|starts?|ends? up|comes? back|no longer|used to|once|by the time|every time)\b/i;

/** Something you can see without sound. */
const VISUAL =
  /\b(?:aisle|shelf|counter|room|door|house|home|flat|table|bill|receipt|phone|screen|photograph|photo|menu|queue|bottle|bottles|packet|label|box|bag|street|shop|face|hands|letter|list|seat|mirror|window|kitchen|car|bus|market|sign|price|chair|bed|wardrobe)\b/i;

/** A single proposition that holds still. */
const STATEMENT = /\b(?:is|are|will|never|nobody|everyone|people|what)\b/i;

/** Something a person could be asked to do. */
const ACTION =
  /\b(?:ask|asking|check|checking|say|saying|show|showing|tell|telling|count|counting|bring|swap|return|trade|hand over|print|write|name|call|book|try|start|stop|leave|keep)\b/i;

/**
 * An act stated only to say it does not happen.
 *
 * "Nobody asks", "will not say", "never once been asked" all contain a verb and
 * describe an absence. An activation needs the act, not the report of its
 * absence, and the keyword test could not tell the two apart.
 */
const NEGATED_ACTION =
  /\b(?:nobody|no one|never|not one of them|will not|would not|does not|do not|cannot|refuse[sd]?)\b[^.]{0,30}\b(?:ask|asks|asking|say|says|saying|tell|tells|check|checks|show|shows|count|counts|admit|admits)\b/i;

/** A place the thing could happen in. */
const PLACE =
  /\b(?:shop|store|aisle|counter|clinic|salon|gym|room|street|market|kitchen|home|house|flat|office|queue|doorway|till|studio|branch)\b/i;

/** Language pinned to one execution rather than to a standing idea. */
const ONE_OFF =
  /\b(?:this ad|this film|this campaign|the poster|the headline|the spot|this season|this year|right now|today)\b/i;

export class CampaignScalabilityTest {
  public static run(
    idea: string,
    context: { territory?: CreativeTerritory | null; human_truth?: string } = {}
  ): ScalabilityResult {
    const t = String(idea || "").trim();
    const notes: string[] = [];

    if (!t) {
      const dead = CHANNELS.map((channel) => ({
        channel,
        works: false,
        evidence: "no idea",
        requirement: "an idea",
      }));
      return { idea: t, verdicts: dead, channels: 0, scalability: 0, scalable: false, notes };
    }

    const verdicts: ChannelVerdict[] = [];

    // ── Film ───────────────────────────────────────────────────────────
    const change = CHANGE.test(t);
    verdicts.push({
      channel: "film",
      works: change,
      evidence: change ? `something changes: "${t.match(CHANGE)?.[0]}"` : "nothing changes across it",
      requirement: "a before and an after",
    });

    // ── Social ─────────────────────────────────────────────────────────
    // Short, and legible without sound.
    const words = t.split(/\s+/).length;
    const visual = VISUAL.test(t);
    const social = words <= 20 && (visual || /^["“]/.test(t));
    verdicts.push({
      channel: "social",
      works: social,
      evidence: social
        ? `${words} words and ${visual ? "something to see" : "a line to read"}`
        : `${words} words${visual ? "" : ", nothing to see"}`,
      requirement: "legible small, mid-scroll, without sound",
    });

    // ── Print ──────────────────────────────────────────────────────────
    // One static frame, no sequence to help it.
    const singleClause = t.split(/[,;:—]/).filter((c) => c.trim().length > 3).length <= 2;
    const print = singleClause && STATEMENT.test(t) && words <= 24;
    verdicts.push({
      channel: "print",
      works: print,
      evidence: print ? "holds as one statement in one frame" : "needs a sequence to make sense",
      requirement: "a proposition that holds still",
    });

    // ── Activation ─────────────────────────────────────────────────────
    //
    // Phase 4.0.4.1: a channel test is a question about whether the idea
    // *supplies* what the channel demands, so the demand is written out and the
    // relation is classified. A verb somewhere in the sentence is not the same
    // as an act a person could be invited into — "nobody asks" contains "ask"
    // and offers nothing to do.
    const demand = "a person does something in public that they were avoiding";
    const relation = classify(t, demand);
    const action = ACTION.test(t) && !NEGATED_ACTION.test(t);
    const supplies = action || relation.relation === "ENACTS";
    verdicts.push({
      channel: "activation",
      works: supplies,
      evidence: supplies
        ? `there is something to do: "${t.match(ACTION)?.[0] || relation.evidence}"`
        : NEGATED_ACTION.test(t)
          ? "the only act in it is one nobody performs"
          : "nothing anyone could do",
      requirement: "an act a person can be invited into",
    });

    // ── Experience ─────────────────────────────────────────────────────
    const place = PLACE.test(t) || Boolean(context.territory && /Ordinary places/.test(context.territory.visual_world));
    verdicts.push({
      channel: "experience",
      works: place,
      evidence: place ? "there is somewhere this happens" : "no place attached to it",
      requirement: "a location the idea could occupy",
    });

    // ── Long-term platform ─────────────────────────────────────────────
    // Still true after the first execution. An idea pinned to one artefact is not.
    const oneOff = ONE_OFF.test(t);
    const restsOnTruth = context.human_truth
      ? context.human_truth.trim().length > 0
      : false;
    const platform = !oneOff && restsOnTruth && words <= 26;
    verdicts.push({
      channel: "platform",
      works: platform,
      evidence: oneOff
        ? `pinned to one execution: "${t.match(ONE_OFF)?.[0]}"`
        : restsOnTruth
          ? "rests on a standing truth, so it outlives its first execution"
          : "no truth beneath it to carry a second execution",
      requirement: "still true once the first execution has run",
    });

    const channels = verdicts.filter((v) => v.works).length;
    const scalable = channels >= 4;
    if (channels <= 2) {
      notes.push("This is a single execution wearing a campaign's name.");
    }

    return {
      idea: t,
      verdicts,
      channels,
      scalability: Number((channels / CHANNELS.length).toFixed(3)),
      scalable,
      notes,
    };
  }

  public static aggregate(results: ScalabilityResult[]): {
    cases: number;
    scalable: number;
    scalable_rate: number;
    mean_channels: number;
    by_channel: Record<Channel, number>;
    weakest: Channel;
  } {
    const by_channel = {} as Record<Channel, number>;
    for (const c of CHANNELS) {
      by_channel[c] = results.filter((r) => r.verdicts.find((v) => v.channel === c)?.works).length;
    }
    const weakest = [...CHANNELS].sort((a, b) => by_channel[a] - by_channel[b])[0];
    const n = results.length || 1;
    return {
      cases: results.length,
      scalable: results.filter((r) => r.scalable).length,
      scalable_rate: Number((results.filter((r) => r.scalable).length / n).toFixed(3)),
      mean_channels: Number((results.reduce((s, r) => s + r.channels, 0) / n).toFixed(2)),
      by_channel,
      weakest,
    };
  }

  public static format(agg: ReturnType<typeof CampaignScalabilityTest.aggregate>): string {
    const L = [
      `CAMPAIGN SCALABILITY — ${agg.cases} ideas · ${agg.scalable} scalable (${(agg.scalable_rate * 100).toFixed(0)}%)`,
      `  mean channels : ${agg.mean_channels.toFixed(1)} of 6`,
    ];
    for (const c of CHANNELS) L.push(`  ${c.padEnd(12)} ${String(by(agg, c)).padStart(4)} / ${agg.cases}`);
    L.push(`  weakest channel : ${agg.weakest}`);
    L.push("");
    L.push("  note: structural reads on a sentence. A real channel test is a team spending a");
    L.push("        week trying. This catches the idea that plainly cannot go somewhere — no");
    L.push("        change, so no film — and cannot tell you the six would be any good.");
    return L.join("\n");
  }
}

function by(agg: ReturnType<typeof CampaignScalabilityTest.aggregate>, c: Channel): number {
  return agg.by_channel[c];
}
