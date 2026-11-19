import { z } from 'zod';
import { sections } from './types';

// The hosted local-deck draft shape, shared with the SQLite boundary. Desktop
// deck identities use UUIDs; incomplete and illegal entries remain editable.
export const localDeckSchema = z.object({
  parent_deck_id: z.uuid().nullable().optional(),
  id: z.uuid(),
  name: z.string().max(120),
  description: z.string().max(10000),
  revision: z.number().int().nonnegative(),
  updated_at: z.string(),
  entries: z.array(z.object({
    card_id: z.uuid(), section: z.enum(sections), quantity: z.number().int().min(1).max(999),
  })).max(1000),
});
