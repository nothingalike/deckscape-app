import { z } from "zod";
import { characteristicsSchema } from "./characteristics";

export const artworkUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    try {
      const url = new URL(value);
      if (url.protocol === 'neuroscape:') return url.host === 'art' && !url.search && !url.hash
        && !url.username && !url.password && !url.port
        && /^\/[a-f0-9-]{36}\/[a-f0-9]{64}\.(png|jpg|webp)$/.test(url.pathname);
      return (
        ["https:", "http:"].includes(url.protocol) &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  }, "Invalid card artwork URL");

/** Public card data only. Artwork is resolved at read time, never persisted in a reveal. */
export const cardInspectionSchema = z
  .object({
    characteristics: characteristicsSchema,
    artworkUrl: artworkUrlSchema.optional(),
  })
  .strict();
export type CardInspection = z.infer<typeof cardInspectionSchema>;

export function projectCardInspection(
  characteristics: unknown,
  artworkUrl?: string,
): CardInspection {
  return cardInspectionSchema.parse({
    characteristics,
    ...(artworkUrl !== undefined ? { artworkUrl } : {}),
  });
}
