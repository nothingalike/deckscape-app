const badgePaths = {
  Builder: "builder",
  Player: "player",
  Explorer: "explorer",
  Community: "community",
} as const;

const badgeMaterials = {
  I: "starter",
  II: "copper",
  III: "silver",
  IV: "gold",
  V: "diamond",
} as const;

export function badgeMaterialForLabel(label: string): string | null {
  const parts = label.split(" ");
  if (parts.length !== 2) return null;
  const tier = parts[1];
  return badgeMaterials[tier as keyof typeof badgeMaterials] ?? null;
}

export function badgeArtForLabel(label: string): string | null {
  const [name] = label.split(" ");
  const path = badgePaths[name as keyof typeof badgePaths];
  const material = badgeMaterialForLabel(label);
  if (!path || !material) return null;
  return `/achievements/badges/${path}${material === "gold" ? "" : `-${material}`}.webp`;
}
