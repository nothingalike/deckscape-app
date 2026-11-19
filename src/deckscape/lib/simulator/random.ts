import { createHmac } from "node:crypto";

/** Canonical server-private state. Never include it in a player projection. */
export interface RandomState {
  algorithm: "hmac-sha256-counter-v1";
  seed: string;
  counter: number;
}

export function initialRandomState(seed: string): RandomState {
  if (!/^[a-f0-9]{64}$/.test(seed))
    throw new Error(
      "Random seed must be 32 bytes encoded as lowercase hexadecimal",
    );
  return { algorithm: "hmac-sha256-counter-v1", seed, counter: 0 };
}

function validate(state: RandomState) {
  if (
    state.algorithm !== "hmac-sha256-counter-v1" ||
    !/^[a-f0-9]{64}$/.test(state.seed) ||
    !Number.isSafeInteger(state.counter) ||
    state.counter < 0
  )
    throw new Error("Invalid random state");
}

/** Zero-based uniform integer. Rejection sampling avoids modulo bias. No input mutation. */
export function randomBelow(
  state: RandomState,
  bound: number,
): { value: number; state: RandomState } {
  validate(state);
  if (!Number.isSafeInteger(bound) || bound < 1 || bound > 0x100000000)
    throw new Error("Random bound must be an integer from 1 through 2^32");
  const limit = Math.floor(0x100000000 / bound) * bound;
  let counter = state.counter;
  while (true) {
    if (counter === Number.MAX_SAFE_INTEGER)
      throw new Error("Random stream exhausted");
    const word = createHmac("sha256", Buffer.from(state.seed, "hex"))
      .update(`neuroscape/random/v1/${counter}`)
      .digest()
      .readUInt32BE(0);
    counter++;
    if (word < limit)
      return { value: word % bound, state: { ...state, counter } };
  }
}

export function rollD20(state: RandomState) {
  const result = randomBelow(state, 20);
  return { value: result.value + 1, state: result.state };
}

/** Fisher-Yates over a copy: retains identities, does not mutate saved deck order. */
export function shuffle<T>(
  items: readonly T[],
  state: RandomState,
): { items: T[]; state: RandomState } {
  validate(state);
  const result = [...items];
  let next = { ...state };
  for (let i = result.length - 1; i > 0; i--) {
    const draw = randomBelow(next, i + 1);
    [result[i], result[draw.value]] = [result[draw.value], result[i]];
    next = draw.state;
  }
  return { items: result, state: next };
}
