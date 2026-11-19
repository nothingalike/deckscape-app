import type { Card } from "./types";
export const rulesVersion = "1.0";
export const rulesChecked = "2026-09-08";
export const rulesSource =
  "https://static1.squarespace.com/static/64fa4af199cc011608a2aa30/t/6a684d9b0d37176601065dc8/1785220507233/Neuroscape+Comprehensive+Rules+v1.00.pdf";
export const rules = [
  ["100", "Deck construction", 5, "", "deckbuilding sideboard basic ram"],
  ["103.5", "Opening hand and mulligan", 7, "", "mulligan draw"],
  ["106", "RAM", 9, "", "ram commit"],
  ["120", "Swift checks", 31, "", "swift"],
  ["202", "RAM costs and faction requirements", 32, "", "cost"],
  ["209", "Gear ports", 37, "", "gear"],
  ["301", "Characters", 40, "", "character"],
  ["302", "Programs", 40, "", "program protocol environment script"],
  ["303", "Mainframes", 41, "", "mainframe"],
  ["304", "Gear", 43, "", "gear"],
  ["700.6", "Synergy", 74, "", "synergy"],
  [
    "702.2",
    "Biovamp",
    79,
    "Attack damage can restore bioframe health.",
    "biovamp",
  ],
  [
    "702.3",
    "Datavamp",
    80,
    "Attack damage can restore mainframe health.",
    "datavamp",
  ],
  ["702.4", "Cloaked", 80, "Protects a persistent from targeting.", "cloaked"],
  [
    "702.5",
    "Divine",
    80,
    "Choose one from inspected cards; bin others.",
    "divine",
  ],
  [
    "702.6",
    "Feedback",
    80,
    "Damage received produces retaliatory bioframe damage.",
    "feedback",
  ],
  [
    "702.7",
    "Index",
    80,
    "Find a qualifying card among revealed cards.",
    "index",
  ],
  [
    "702.8",
    "Malicious",
    81,
    "Allows attachment to any targeted character.",
    "malicious",
  ],
  [
    "702.9",
    "Mirage",
    81,
    "Opponent targeting permits return to hand.",
    "mirage",
  ],
  [
    "702.10",
    "Overrun",
    81,
    "Excess attack damage reaches the defending player.",
    "overrun",
  ],
  [
    "702.11",
    "Psychosis",
    81,
    "A failed roll can redirect an attack.",
    "psychosis",
  ],
  ["702.12", "Stealth", 82, "Blocking requires vision.", "stealth"],
  [
    "702.13",
    "Trojan",
    82,
    "Face-down attachment with later activation.",
    "trojan",
  ],
  [
    "702.14",
    "Tether",
    82,
    "Connects two characters through arm ports.",
    "tether",
  ],
  ["702.15", "Vision", 83, "Enables blocking stealth characters.", "vision"],
  ["702.16", "Stamina", 83, "Attacking does not run the character.", "stamina"],
  [
    "702.17",
    "Unstable",
    83,
    "Instability rolls can destroy controlled persistents.",
    "unstable",
  ],
  [
    "702.18",
    "Duel",
    83,
    "Characters exchange combat damage simultaneously.",
    "duel",
  ],
  [
    "702.19",
    "Reversed",
    84,
    "Exchanges the indicated pink effect text.",
    "reversed",
  ],
  [
    "703",
    "Keyword counters",
    84,
    "",
    "counter corruption bleed armor spirit invert",
  ],
].map(([id, title, page, summary, terms]) => ({
  id: String(id),
  title: String(title),
  page: Number(page),
  summary: String(summary),
  terms: String(terms),
}));
// Card details show named mechanics from rules text, not general game topics
// inferred from a card's type, costs, or gear-port labels.
export function cardRules(card: Card) {
  const text = card.rules_text || "";
  return rules.filter((r) => {
    const cardSpecific =
      r.id === "120" ||
      r.id === "700.6" ||
      r.id.startsWith("702.") ||
      r.id === "703";
    if (!cardSpecific) return false;
    const terms = r.terms.split(" ").filter((term) => term !== "counter");
    return terms.some((term) => new RegExp(`\\b${term}\\b`, "i").test(text));
  });
}
