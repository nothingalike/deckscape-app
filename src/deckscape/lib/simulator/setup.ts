import { rollD20, shuffle, type RandomState } from "./random";

export type Seat = 0 | 1;
export interface SetupDeck {
  /** Immutable definition versions; the caller validates deck legality and engine support. */
  mainframe: string;
  cyberdeck: readonly string[];
  ramDeck: readonly string[];
}
export interface SetupPlayer {
  userId: string;
  mainframe: string;
  cyberdeck: string[];
  ramDeck: string[];
  hand: string[];
  mainframeHealth: number;
  bioframeHealth: number;
}
export interface SetupState {
  revision: number;
  random: RandomState;
  /** First-game public d20 contest. Older saved setups omit this field. */
  openingRolls?: [number, number][] | null;
  instances: Record<string, { definitionVersion: string; owner: Seat }>;
  players: [SetupPlayer, SetupPlayer];
  decision:
    | { type: "choose-starter"; seat: Seat }
    | { type: "mulligan"; seat: Seat }
    | { type: "ready" };
  startingPlayer: Seat | null;
}

/** CR 103.1-4. A public d20 contest selects the first-game chooser. */
export function createSetup(
  users: readonly [string, string],
  decks: readonly [SetupDeck, SetupDeck],
  random: RandomState,
  fixedChooser?: Seat,
): SetupState {
  if (!users[0] || !users[1] || users[0] === users[1])
    throw new Error("Two distinct players required");
  const instances: SetupState["instances"] = {};
  let nextRandom = random;
  const players: SetupPlayer[] = decks.map((deck, index) => {
    const seat = index as Seat;
    if (deck.cyberdeck.length < 5)
      throw new Error("Opening hand requires five cards");
    const instantiate = (versions: readonly string[], section: string) =>
      versions.map((definitionVersion, i) => {
        if (!/^[a-f0-9]{64}$/.test(definitionVersion))
          throw new Error("Invalid pinned definition version");
        const id = `${seat}:${section}:${i}`;
        instances[id] = { definitionVersion, owner: seat };
        return id;
      });
    const mainframe = instantiate([deck.mainframe], "mainframe")[0];
    const cyberdeck = shuffle(
      instantiate(deck.cyberdeck, "cyberdeck"),
      nextRandom,
    );
    const ramDeck = shuffle(
      instantiate(deck.ramDeck, "ram-deck"),
      cyberdeck.state,
    );
    nextRandom = ramDeck.state;
    return {
      userId: users[seat],
      mainframe,
      cyberdeck: cyberdeck.items,
      ramDeck: ramDeck.items,
      hand: [],
      mainframeHealth: 20,
      bioframeHealth: 20,
    };
  });
  const openingRolls: [number, number][] = [];
  let chooser: Seat = fixedChooser ?? 0;
  if (fixedChooser === undefined) {
    for (;;) {
      const first = rollD20(nextRandom);
      const second = rollD20(first.state);
      nextRandom = second.state;
      const pair: [number, number] = [first.value, second.value];
      openingRolls.push(pair);
      if (pair[0] !== pair[1]) {
        chooser = pair[0] > pair[1] ? 0 : 1;
        break;
      }
    }
  }
  return {
    revision: 0,
    random: nextRandom,
    openingRolls: fixedChooser === undefined ? openingRolls : null,
    instances,
    players: [players[0], players[1]],
    decision: { type: "choose-starter", seat: chooser },
    startingPlayer: null,
  };
}

export type SetupCommand =
  | { type: "choose-starter"; startingPlayer: Seat }
  | { type: "mulligan"; bottomOrder: string[] };
export type SetupResult =
  | { accepted: true; state: SetupState }
  | { accepted: false; reason: string; state: SetupState };

/** CR 103.5: empty bottomOrder means keep; card order is top-to-bottom at deck bottom. */
export function applySetupCommand(
  state: SetupState,
  actor: string,
  revision: number,
  command: SetupCommand,
): SetupResult {
  const reject = (reason: string): SetupResult => ({
    accepted: false,
    reason,
    state,
  });
  if (revision !== state.revision) return reject("stale-revision");
  if (state.decision.type === "ready") return reject("setup-finished");
  if (state.players[state.decision.seat].userId !== actor)
    return reject("not-your-decision");
  if (command.type !== state.decision.type) return reject("wrong-decision");
  if (
    command.type === "choose-starter" &&
    command.startingPlayer !== 0 &&
    command.startingPlayer !== 1
  )
    return reject("invalid-seat");
  if (command.type === "mulligan") {
    const hand = state.players[state.decision.seat].hand;
    if (
      !Array.isArray(command.bottomOrder) ||
      new Set(command.bottomOrder).size !== command.bottomOrder.length ||
      command.bottomOrder.some((id) => !hand.includes(id))
    )
      return reject("invalid-mulligan-cards");
  }
  const next = structuredClone(state);
  if (command.type === "choose-starter") {
    next.startingPlayer = command.startingPlayer;
    for (const player of next.players)
      player.hand = player.cyberdeck.splice(0, 5);
    next.decision = { type: "mulligan", seat: command.startingPlayer };
  } else {
    const seat = state.decision.seat;
    const player = next.players[seat];
    const bottom = new Set(command.bottomOrder);
    player.hand = player.hand.filter((id) => !bottom.has(id));
    player.cyberdeck.push(...command.bottomOrder);
    player.hand.push(...player.cyberdeck.splice(0, command.bottomOrder.length));
    next.decision =
      seat === next.startingPlayer
        ? { type: "mulligan", seat: (1 - seat) as Seat }
        : { type: "ready" };
  }
  next.revision++;
  return { accepted: true, state: next };
}
