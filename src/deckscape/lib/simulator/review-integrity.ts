import { createHash } from "node:crypto";
import { z } from "zod";
import { normalizeCard, type SourceCard } from "../catalog-import";
import { BASIC_RAM_ID } from "./catalog-audit";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const reviewEvidence = z.object({
  sourceId: z.uuid(),
  name: z.string().min(1),
  artworkSource: z.url().refine((value) => {
    const url = new URL(value);
    return !url.search && !url.hash && !url.username && !url.password;
  }, "Review evidence must not retain signed URL credentials."),
  artworkSha256: digest,
  sourceMechanicsSha256: digest,
});

/** Deliberately excludes import timestamps, signed URLs, and presentation metadata. */
export function sourceMechanicsHash(source: SourceCard): string {
  const card = normalizeCard(source, BASIC_RAM_ID);
  const mechanics = {
    id: card.id,
    name: card.name,
    type: card.card_type,
    subtype: card.subtype,
    rulesText: card.rules_text,
    factions: [...card.factions].sort(),
    ramCost: card.ram_cost,
    attack: card.attack,
    defence: card.defence,
    attackType: source.attack_type ?? null,
    iconic: source.iconic ?? false,
    copiesLimit: card.copies_limit,
  };
  return createHash("sha256").update(JSON.stringify(mechanics)).digest("hex");
}

export type ReviewEvidence = z.infer<typeof reviewEvidence>;
export type ReviewAssessment =
  | { status: "unreviewed" }
  | { status: "current" }
  | {
      status: "review-required";
      reasons: ("source-changed" | "artwork-changed" | "artwork-unverified")[];
    };

/** A current transcription does not imply an executable or tested card handler. */
export function assessReview(
  source: SourceCard,
  artworkHash: string | null,
  evidence?: ReviewEvidence,
): ReviewAssessment {
  if (!evidence) return { status: "unreviewed" };
  const review = reviewEvidence.parse(evidence);
  if (review.sourceId !== source.id)
    throw new Error("Review belongs to a different source card.");
  const reasons: Extract<
    ReviewAssessment,
    { status: "review-required" }
  >["reasons"] = [];
  if (sourceMechanicsHash(source) !== review.sourceMechanicsSha256)
    reasons.push("source-changed");
  if (!artworkHash) reasons.push("artwork-unverified");
  else if (digest.parse(artworkHash) !== review.artworkSha256)
    reasons.push("artwork-changed");
  return reasons.length
    ? { status: "review-required", reasons }
    : { status: "current" };
}

export function indexReviews(input: unknown[]): Map<string, ReviewEvidence> {
  const result = new Map<string, ReviewEvidence>();
  for (const item of input) {
    const evidence = reviewEvidence.parse(item);
    if (result.has(evidence.sourceId))
      throw new Error(`Duplicate review for ${evidence.sourceId}.`);
    result.set(evidence.sourceId, evidence);
  }
  return result;
}

export function catalogReviewReport(
  sources: SourceCard[],
  artworkHashes: Map<string, string | null>,
  reviews: Map<string, ReviewEvidence>,
) {
  const cards = sources.map((source) => ({
    sourceId: source.id,
    name: source.name,
    ...assessReview(
      source,
      artworkHashes.get(source.id) ?? null,
      reviews.get(source.id),
    ),
  }));
  const present = new Set(sources.map((source) => source.id));
  return {
    current: cards.filter((card) => card.status === "current").length,
    unreviewed: cards.filter((card) => card.status === "unreviewed").length,
    reviewRequired: cards.filter((card) => card.status === "review-required"),
    missingReviewedCards: [...reviews.values()]
      .filter((review) => !present.has(review.sourceId))
      .map(({ sourceId, name }) => ({ sourceId, name })),
  };
}
