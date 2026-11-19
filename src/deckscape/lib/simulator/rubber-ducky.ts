import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { Seat } from "./setup";
import type { ActivatedAction } from "./resolve-ability";
import type { GameCommandRuntime } from "./commands";
import type { ProgramChoices } from "./program-choices";
import type { ProgramQuoteRequest } from "./program-quote-contract";
import { takeEffectTimestamp } from "./effect-timestamp";
import { projectGame } from "./game-view";
import { projectProgramPlays } from "./project-program-plays";
import { quoteProgramPlay } from "./program-quote";
import { playProgram } from "./play-program";
export const duckyHandler = "trojan/rubber-ducky";
export function duckyTargets(
  s: GameState,
  player: Seat,
  cards: ReadonlyMap<string, CardCharacteristics>,
) {
  return (s.priorityWindow?.stack ?? []).filter(
    (a) =>
      a.kind === "card" &&
      a.controller !== player &&
      s.cache.includes(a.sourceId) &&
      s.objects[a.sourceId]?.incarnation === a.sourceIncarnation &&
      cards.get(a.sourceId)?.cardType === "program" &&
      (cards.get(a.sourceId) as { subtype?: string })?.subtype === "script",
  );
}
export function beginDucky(
  s: GameState,
  a: ActivatedAction,
  cards: ReadonlyMap<string, CardCharacteristics>,
) {
  const target = duckyTargets(s, a.controller, cards).find(
    (t) => t.id === a.activatedAbility.choices.cacheActionId,
  );
  if (!target) return s;
  const next = structuredClone(s),
    id = "script-copy:" + next.nextTokenNumber++;
  if (next.objects[id]) throw Error("Copy identity collision");
  const definitionVersion = s.objects[target.sourceId].definitionVersion;
  next.objects[id] = {
    id,
    incarnation: 0,
    timestamp: takeEffectTimestamp(next),
    token: false,
    scriptCopy: true,
    definitionVersion,
    owner: a.controller,
    controller: a.controller,
    running: false,
    abilitySpent: false,
    faceDown: false,
    damage: { MF: 0, BF: 0 },
    lastDamageSourceId: null,
    lastDamagedTurn: null,
    counters: {},
    attachments: [],
  };
  next.players[a.controller].zones.hand.push(id);
  next.pendingDecision = {
    type: "ducky-play",
    id: "ducky:" + a.id,
    sourceId: a.sourceId,
    actionId: a.id,
    player: a.controller,
    cardId: id,
    definitionVersion,
  };
  validateDucky(next);
  return next;
}
export function validateDucky(s: GameState) {
  const d = s.pendingDecision,
    a = s.priorityWindow?.resolving;
  if (
    d?.type !== "ducky-play" ||
    a?.kind !== "activated" ||
    a.activatedAbility?.handler !== duckyHandler ||
    d.actionId !== a.id ||
    d.sourceId !== a.sourceId ||
    d.player !== a.controller ||
    d.id !== "ducky:" + a.id ||
    s.priorityWindow?.mode !== "drain" ||
    !s.objects[d.cardId]?.scriptCopy ||
    s.objects[d.cardId].definitionVersion !== d.definitionVersion ||
    s.objects[d.cardId].owner !== d.player ||
    !s.players[d.player].zones.hand.includes(d.cardId)
  )
    throw Error("Invalid Rubber Ducky continuation");
  return d;
}
type Runtime = Pick<
  GameCommandRuntime,
  | "program"
  | "programVariants"
  | "canReplayProgram"
  | "canPlayCyberdeckTop"
  | "quoteDuringResolution"
>;
export interface DuckyEffects {
  commands: Runtime;
  characteristics(s: GameState): ReadonlyMap<string, CardCharacteristics>;
}
function context(s: GameState, e: DuckyEffects) {
  const d = validateDucky(s),
    next = structuredClone(s);
  next.pendingDecision = null;
  next.pendingRuleEvents = [];
  next.pendingTriggers = [];
  next.triggersOrdered = true;
  next.priorityWindow = {
    ...next.priorityWindow!,
    resolving: null,
    resolutionApplied: false,
    priority: d.player,
    mode: "priority",
    triggers: [],
  };
  const runtime: Runtime = {
    ...e.commands,
    quoteDuringResolution: undefined,
    program(state, id, choices) {
      if (id !== d.cardId || (choices.x !== null && choices.x !== 0))
        throw Error("Waived copy requires X=0");
      return {
        ...e.commands.program(state, id, choices),
        ramCost: 0,
        freeDrugEffects: [],
        swift: true,
      };
    },
    programVariants(state, id) {
      return (e.commands.programVariants?.(state, id) ?? [])
        .filter((v) => v.x === null || v.x.minimum === 0)
        .map((v) => ({ ...v, x: v.x ? { minimum: 0, maximum: 0 } : null }));
    },
  };
  return { state: next, runtime, d, user: s.players[d.player].userId };
}
export function duckyOptions(s: GameState, e: DuckyEffects) {
  const c = context(s, e),
    view = projectGame(c.state, c.user, { canInspectFaceDown: () => false });
  return projectProgramPlays(c.state, view, c.runtime, {
    characteristics: e.characteristics,
  })
    .filter((o) => o.id === c.d.cardId)
    .map((o) => {
      const next = { ...o };
      delete next.freePlays;
      return next;
    });
}
export function quoteDucky(
  s: GameState,
  user: string,
  request: ProgramQuoteRequest,
  e: DuckyEffects,
) {
  const c = context(s, e);
  if (user !== c.user || request.id !== c.d.cardId || request.freePlay)
    throw Error("Invalid copy quote");
  return quoteProgramPlay(c.state, user, request, c.runtime);
}
export function answerDucky(
  s: GameState,
  user: string,
  decisionId: string,
  choices: ProgramChoices | undefined,
  skip: boolean | undefined,
  e: DuckyEffects,
) {
  const c = context(s, e);
  if (user !== c.user || decisionId !== c.d.id)
    throw Error("Unauthorized copy play");
  let next: GameState;
  if (skip) {
    if (choices || canPlayDucky(s, e))
      throw Error("A playable copy must be played");
    next = structuredClone(s);
    next.players[c.d.player].zones.hand = next.players[
      c.d.player
    ].zones.hand.filter((id) => id !== c.d.cardId);
    delete next.objects[c.d.cardId];
    next.pendingDecision = null;
  } else {
    if (!choices) throw Error("Choose how to play the copy");
    next = playProgram(
      c.state,
      user,
      s.revision,
      c.d.cardId,
      [],
      choices,
      c.runtime.program(c.state, c.d.cardId, choices),
    );
    next.pendingRuleEvents = [
      ...s.pendingRuleEvents,
      ...next.pendingRuleEvents,
    ];
    next.pendingTriggers = [...s.pendingTriggers, ...next.pendingTriggers];
    next.priorityWindow = {
      ...s.priorityWindow!,
      stack: next.priorityWindow!.stack,
    };
  }
  next.priorityWindow!.resolutionApplied = true;
  next.revision = s.revision + 1;
  return next;
}
function* subsets(
  ids: string[],
  count: number,
  start = 0,
  picked: string[] = [],
): Generator<string[]> {
  if (!count) {
    yield picked;
    return;
  }
  for (let i = start; i <= ids.length - count; i++)
    yield* subsets(ids, count - 1, i + 1, [...picked, ids[i]]);
}

export function canPlayDucky(s: GameState, e: DuckyEffects): boolean {
  const options = duckyOptions(s, e),
    c = context(s, e);
  for (const option of options)
    for (const variant of option.variants) {
      const groups = variant.targets;
      function* targets(
        index: number,
        choices: ProgramChoices,
      ): Generator<ProgramChoices> {
        if (index === groups.length) {
          yield choices;
          return;
        }
        const g = groups[index];
        for (
          let count = g.minimum;
          count <= Math.min(g.maximum, g.candidates.length);
          count++
        )
          for (const selected of subsets(g.candidates, count))
            yield* targets(
              index + 1,
              g.purpose === "sacrifice-character"
                ? { ...choices, sacrificeCharacters: selected }
                : { ...choices, targets: [...choices.targets, ...selected] },
            );
      }
      xChoice: for (
        let x = variant.x?.minimum ?? 0;
        x <= (variant.x?.maximum ?? 0);
        x++
      )
        for (const mainframeTarget of variant.mainframes ?? [undefined])
          for (const playerTarget of variant.playerTargets?.map(
            (p) => p.player,
          ) ?? [undefined])
            for (const runs of variant.runCharacters
              ? subsets(variant.runCharacters.candidates, x)
              : [undefined])
              for (const choices of targets(0, {
                targets: [],
                modes: variant.modes,
                reversed: variant.reversed,
                x: variant.x ? x : null,
                ...(mainframeTarget ? { mainframeTarget } : {}),
                ...(playerTarget !== undefined ? { playerTarget } : {}),
                ...(runs ? { runCharacters: runs } : {}),
                ...(variant.cacheActionId
                  ? { cacheActionId: variant.cacheActionId }
                  : {}),
              })) {
                const q = quoteProgramPlay(
                  c.state,
                  c.user,
                  { expectedRevision: s.revision, id: option.id, choices },
                  c.runtime,
                );
                if (q.status === "ready" && q.affordable) return true;
                // RAM cost is fixed for this mode/X; changing targets cannot make it affordable.
                if (q.status === "ready" && !q.affordable) continue xChoice;
                if (
                  q.status === "unavailable" &&
                  ["synergy", "health", "prohibited"].includes(q.reason)
                )
                  return false;
              }
    }
  return false;
}
