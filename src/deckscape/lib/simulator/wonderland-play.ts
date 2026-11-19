import type { GameState } from "./game-state";
import type { GameCommandRuntime } from "./commands";
import type { BattlefieldPresentationRuntime } from "./battlefield-presentation";
import type { ProgramChoices } from "./program-choices";
import type { ProgramQuoteRequest } from "./program-quote-contract";
import type { WonderlandOptions, WonderlandPlay } from "./wonderland-contract";
import { validateWonderland } from "./wonderland";
import { projectGame } from "./game-view";
import { projectCharacterPlays } from "./project-character-plays";
import { projectGearPlays } from "./project-gear-plays";
import { projectProgramPlays } from "./project-program-plays";
import { quoteProgramPlay } from "./program-quote";
import { playCharacter } from "./play-character";
import { playGear } from "./play-gear";
import { playProgram } from "./play-program";
import { openPriority } from "./priority";

/** Private transaction view for an explicit play instruction. It bypasses only
 * ordinary timing/origin, not costs, requirements, targets or additional costs.
 * Queued events and triggers are restored before returning to settlement. */
type PlayRuntime = Pick<
  GameCommandRuntime,
  | "character"
  | "gear"
  | "program"
  | "programVariants"
  | "canReplayProgram"
  | "canPlayCyberdeckTop"
  | "quoteDuringResolution"
>;
function context(s: GameState, commands: PlayRuntime) {
  const d = validateWonderland(s);
  if (d.stage !== "play" || !d.cardId) throw Error("No Wonderland card play");
  const next = structuredClone(s);
  next.pendingDecision = null;
  next.pendingRuleEvents = [];
  next.pendingTriggers = [];
  next.objects[d.cardId].setRamCost = 0;
  next.priorityWindow =
    next.priorityWindow ?? openPriority(d.player, "netcheck");
  next.priorityWindow.priority = d.player;
  next.priorityWindow.mode = "priority";
  const forced = { fromCyberdeck: true, swift: true };
  const runtime: PlayRuntime = {
    ...commands,
    quoteDuringResolution: undefined,
    canPlayCyberdeckTop: (_, id, p) => id === d.cardId && p === d.player,
    character: (state, id) => {
      const e = commands.character(state, id);
      return { ...e, ...forced };
    },
    gear: (state, id) => {
      const e = commands.gear(state, id);
      return {
        ...e,
        play: {
          ...e.play,
          ...forced,
        },
      };
    },
    program: (state, id, choices) => {
      const e = commands.program(state, id, choices);
      return { ...e, ...forced };
    },
  };
  return { state: next, runtime, d, user: s.players[d.player].userId };
}
export function wonderlandOptions(
  s: GameState,
  commands: PlayRuntime,
  presentation: BattlefieldPresentationRuntime,
): WonderlandOptions {
  const c = context(s, commands),
    view = projectGame(c.state, c.user, {
      canInspectFaceDown: () => false,
      canInspectCyberdeckTop: () => true,
    });
  const withoutWaiver = <T extends { freePlays?: number }>(option: T): T => {
    const next = { ...option };
    delete next.freePlays;
    return next;
  };
  return {
    characters: projectCharacterPlays(c.state, view, c.runtime, presentation)
      .filter((o) => o.id === c.d.cardId)
      .map(withoutWaiver),
    gear: projectGearPlays(c.state, view, c.runtime, presentation)
      .filter((o) => o.id === c.d.cardId)
      .map(withoutWaiver),
    programs: projectProgramPlays(c.state, view, c.runtime, presentation)
      .filter((o) => o.id === c.d.cardId)
      .map(withoutWaiver),
  };
}
export function quoteWonderland(
  s: GameState,
  user: string,
  request: ProgramQuoteRequest,
  commands: PlayRuntime,
) {
  const c = context(s, commands);
  if (user !== c.user || request.id !== c.d.cardId)
    throw Error("Not the Wonderland card or player");
  return quoteProgramPlay(c.state, user, request, c.runtime);
}
export function playWonderland(
  s: GameState,
  action: WonderlandPlay,
  commands: PlayRuntime,
): GameState {
  const c = context(s, commands),
    { state, runtime, user } = c;
  if (action.id !== c.d.cardId) throw Error("Not the revealed card");
  let next: GameState;
  if (action.type === "play-character")
    next = playCharacter(
      state,
      user,
      state.revision,
      action.id,
      action.ram,
      runtime.character(state, action.id),
      action.runCharacters,
    );
  else if (action.type === "play-gear") {
    const e = runtime.gear(state, action.id);
    next = playGear(
      state,
      user,
      state.revision,
      action.id,
      action.ram,
      action.targets,
      e.play,
      e.attachment,
    );
  } else
    next = playProgram(
      state,
      user,
      state.revision,
      action.id,
      action.ram,
      action.choices,
      runtime.program(state, action.id, action.choices),
    );
  next.pendingRuleEvents = [...s.pendingRuleEvents, ...next.pendingRuleEvents];
  next.pendingTriggers = [...s.pendingTriggers, ...next.pendingTriggers];
  next.revision = s.revision;
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
/** Search legal announcements, not just visible modes. Invalid target/cost choices
 * never bin a playable card: only absence of any valid announcement does. */
export function canPlayWonderland(
  s: GameState,
  commands: PlayRuntime,
  presentation: BattlefieldPresentationRuntime,
): boolean {
  const options = wonderlandOptions(s, commands, presentation);
  if (
    options.characters?.some((o) => o.unavailable === null) ||
    options.gear?.some((o) => o.unavailable === null)
  )
    return true;
  const c = context(s, commands);
  for (const option of options.programs ?? [])
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
