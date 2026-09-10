import { BrandDNA } from "./brand-dna.types";

/**
 * CIOS Phase 4.0.4.1 — declared brand DNA, for exercising the ownership path.
 *
 * Why this file exists and what it is not
 * -------------------------------------
 * `BrandDNAOwnership` judges an idea against what a brand has done, how it
 * behaves, and what it owns. None of the hundred benchmark briefs carries any of
 * that, so on the benchmark the evaluator correctly reports "unestablished" for
 * every idea — which demonstrates that it declines honestly and demonstrates
 * nothing at all about whether it works.
 *
 * These four are **fixtures**. The brands are fictional, invented for the
 * benchmark in an earlier phase, so there is no real history to misrepresent —
 * which is exactly why they can be written here and why nothing like them should
 * ever be written for a brand that exists. Inventing a history for a real client
 * would put fabricated evidence into an ownership argument, and an ownership
 * argument is the one place in this system where fabricated evidence would be
 * indistinguishable from the real thing.
 *
 * The benchmark reports the fixture cohort separately from the rest for the same
 * reason: four briefs with DNA and ninety-six without are two different
 * measurements, and averaging them would describe neither.
 */

/** Fixture DNA, keyed by the benchmark's brand name. */
export const BRAND_DNA_FIXTURES: Record<string, Partial<BrandDNA>> = {
  // cb.beauty.claim_fatigue.001
  Lumiere: {
    values: [
      "the face someone has now is not a problem to be solved",
      "an ingredient list is a promise, not a decoration",
    ],
    history: [
      "published the full concentration of every active in 2023, before the category did",
      "withdrew a whitening line rather than reformulate it around a claim it could not support",
    ],
    behavior: [
      "prints the concentration on the front of the pack",
      "answers ingredient questions with the number rather than the benefit",
      "declines to photograph a result it cannot repeat",
    ],
    distinctive_assets: ["the concentration on the front", "the unretouched two-week photograph"],
  },

  // cb.fashion.* — the wool coat brand
  Ao: {
    values: ["a garment should outlast the season it was bought in"],
    history: [
      "began buying its own garments back in 2024 and publishing what they resold for",
      "has never run a seasonal sale",
    ],
    behavior: [
      "prints the resale value on the swing tag",
      "repairs before it replaces",
    ],
    distinctive_assets: ["the resale figure on the tag", "the repair receipt"],
  },

  // cb.healthcare.* — the primary care clinic
  Kham: {
    values: ["nobody should have to decide whether they are ill enough to come in"],
    history: [
      "removed its triage questionnaire in 2025 after finding it deterred the patients it was meant to sort",
    ],
    behavior: [
      "publishes the wait before the appointment is booked",
      "says when it does not know",
    ],
    distinctive_assets: ["the published wait", "the room with the door open"],
  },

  // cb.local_business.* — the neighbourhood gym
  Tap: {
    values: ["the first visit is the whole product"],
    history: ["has never photographed a member's body"],
    behavior: [
      "keeps the front window covered at the hours it is busiest",
      "walks a first-timer round before anyone signs anything",
    ],
    distinctive_assets: ["the covered window", "the walk round"],
  },
};

/** True where a brand has declared DNA rather than derived DNA. */
export function hasFixture(brand?: string): boolean {
  return Boolean(brand && BRAND_DNA_FIXTURES[brand]);
}
