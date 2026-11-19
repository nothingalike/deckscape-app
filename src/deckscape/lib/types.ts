export type Card = {
  id: string;
  name: string;
  normalized_name: string;
  card_type: string;
  subtype: string;
  set_code: string;
  set_name: string;
  collector_number: string;
  rules_text: string;
  flavor_text: string;
  artist: string;
  rarity: string;
  factions: string[];
  ram_cost: string[];
  attack: number | null;
  defence: number | null;
  image_path: string | null;
  image_hash: string | null;
  is_landscape: boolean;
  is_basic_ram: boolean;
  copies_limit: number | null;
  raw: Record<string, unknown>;
};
export const sections = [
  "mainframe",
  "cyberdeck",
  "ram",
  "sideboard",
  "sideboard_mainframe",
] as const;
export type Section = (typeof sections)[number];
export const sectionLabels: Record<Section, string> = {
  mainframe: "Mainframe",
  cyberdeck: "Cyberdeck",
  ram: "RAM deck",
  sideboard: "Sideboard",
  sideboard_mainframe: "Sideboard mainframe",
};
export type Entry = { card_id: string; section: Section; quantity: number };
export type Deck = {
  parent_deck_id?: string | null;
  id: string;
  name: string;
  description: string;
  revision: number;
  entries: Entry[];
  updated_at: string;
  published_at?: string | null;
};
export type Publication = {
  author_id?: string;
  like_count?: number;
  comment_count?: number;
  liked?: boolean;
  id: string;
  name: string;
  description: string;
  entries: Entry[];
  author_name: string;
  mainframe_id: string | null;
  factions: string[];
  published_at: string;
  updated_at: string;
};
export type Issue = { code: string; message: string };
