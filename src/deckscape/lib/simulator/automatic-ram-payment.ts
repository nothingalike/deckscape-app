/**
 * Selects a deterministic base RAM payment from the authoritative candidates.
 * It deliberately knows nothing about targets, sacrifices, or action submission.
 */
export function proposeAutomaticRamPayment(
  candidates: readonly string[],
  cost: number,
): string[] | null {
  if (!Number.isSafeInteger(cost) || cost < 0) return null;
  const eligible = [...new Set(candidates)];
  if (eligible.length < cost) return null;
  return eligible.slice(0, cost);
}
