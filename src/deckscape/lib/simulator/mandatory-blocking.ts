/** Test whether a legal assignment can satisfy more must-block requirements.
 * Group minima matter: one character cannot be forced to block Sidewinder alone.
 * Optional blockers may help a required blocker satisfy a group's minimum. */
export function canSatisfyMoreBlocks(
  blockers: { id: string; required: boolean; attackers: string[] }[],
  minimum: ReadonlyMap<string, number>,
  assigned: readonly { blockerId: string; attackerId: string }[],
): boolean {
  const score = blockers.filter(
    (b) => b.required && assigned.some((a) => a.blockerId === b.id),
  ).length;
  const candidates = blockers
    .filter((b) => b.attackers.length)
    .sort(
      (a, b) =>
        Number(b.required) - Number(a.required) ||
        a.attackers.length - b.attackers.length,
    );
  if (candidates.filter((b) => b.required).length <= score) return false;
  const attackers = [...minimum.keys()],
    counts = attackers.map(() => 0),
    seen = new Map<string, number>();
  const remaining = candidates.map(
    (_, i) => candidates.slice(i).filter((b) => b.required).length,
  );
  function search(index: number, achieved: number): boolean {
    if (achieved + (remaining[index] ?? 0) <= score) return false;
    if (index === candidates.length)
      return counts.every((c, i) => c === 0 || c >= minimum.get(attackers[i])!);
    const key = `${index}:${counts.join(",")}`;
    if ((seen.get(key) ?? -1) >= achieved) return false;
    seen.set(key, achieved);
    const b = candidates[index];
    for (const target of b.attackers) {
      const i = attackers.indexOf(target),
        old = counts[i];
      counts[i] = Math.min(old + 1, minimum.get(target)!);
      if (search(index + 1, achieved + Number(b.required))) return true;
      counts[i] = old;
    }
    return search(index + 1, achieved);
  }
  return search(0, 0);
}
