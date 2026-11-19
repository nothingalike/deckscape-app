import type { CardCharacteristics } from "./characteristics";
import type { CardPresentation } from "./board-view";
import type { GameState } from "./game-state";
import {
  projectGame,
  projectSpectatorGame,
  type GameVisibility,
} from "./game-view";
import { projectCardInspection, artworkUrlSchema } from "./card-inspection";
import {
  activeCombatEffects,
  type TimedCombatEffect,
} from "./timed-combat-effects";
import { projectSynergyPresentations } from "./synergy-presentation";

function effectLabel(change: TimedCombatEffect["change"]): string {
  switch (change.kind) {
    case "grant-keyword":
      return change.keyword;
    case "cannot-block":
      return "CANNOT BLOCK";
    case "must-attack":
      return "MUST ATTACK";
    case "must-block":
      return "MUST BLOCK";
    case "grant-character-hit-copy":
      return "CHARACTER HIT TRIGGERS TWICE";
    case "grant-smash-and-grab":
      return "SMASH AND GRAB";
    case "grant-unchained-rage":
      return "UNCHAINED RAGE";
    case "grant-psychosis":
      return `PSYCHOSIS ${change.amount}`;
  }
}

export interface BattlefieldPresentationRuntime {
  /** Fixed public ability descriptions keyed by the pinned trigger handler. Never
   * interpolate private event facts, targets, deck contents, or current hidden state.
   * Required when this runtime can produce simultaneous triggered abilities.
   */
  triggerLabels?: ReadonlyMap<string, string>;
  /** Pinned engine evaluator: current characteristics for each instance. */
  characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
  /** Printed inspection data for an authorized face-down card, never rule evaluation. */
  inspectFaceDown?(state: GameState, instanceId: string): CardCharacteristics;
  /** Artwork belonging to the pinned definition, not a lookup by current card name. */
  artworkUrl(definitionVersion: string): string | undefined;
}

/** Server-only assembly. Authorization precedes evaluation, and metadata follows the
 * same inspection decision as the view. No definition/characteristic maps cross the boundary.
 */
export function projectBattlefield(
  state: GameState,
  userId: string,
  visibility: GameVisibility,
  runtime: BattlefieldPresentationRuntime,
) {
  const view = projectGame(state, userId, visibility);
  return decorateBattlefield(state, view, runtime);
}

export function projectSpectatorBattlefield(
  state: GameState,
  visibility: GameVisibility,
  runtime: BattlefieldPresentationRuntime,
) {
  const view = projectSpectatorGame(state, visibility);
  return decorateBattlefield(state, view, runtime);
}

function decorateBattlefield(
  state: GameState,
  view: ReturnType<typeof projectGame>,
  runtime: BattlefieldPresentationRuntime,
) {
  view.reveals = view.reveals.map((reveal) => ({
    player: reveal.player,
    definitionVersion: reveal.definitionVersion,
    ...projectCardInspection(
      reveal.characteristics,
      runtime.artworkUrl(reveal.definitionVersion),
    ),
  }));
  const effective = runtime.characteristics(structuredClone(state));
  const effectsByTarget = new Map<
    string,
    { label: string; duration: "until-end-of-turn" | "while-source-in-play" }[]
  >();
  for (const effect of activeCombatEffects(state)) {
    if (effect.targetId === null) continue;
    const presented = {
      label: effectLabel(effect.change),
      duration:
        effect.expiresAfterTurn === null
          ? ("while-source-in-play" as const)
          : ("until-end-of-turn" as const),
    };
    const existing = effectsByTarget.get(effect.targetId) ?? [];
    existing.push(presented);
    effectsByTarget.set(effect.targetId, existing);
  }
  // Classify only names already present in the viewer-projected log text.
  // Never serialize the underlying definition map or private draw detail.
  const logCards = [
    ...new Map(
      [...effective.values()].map((card) => [
        card.name,
        { name: card.name, type: card.cardType },
      ]),
    ).values(),
  ];
  view.gameLog = view.gameLog?.map((entry) => ({
    ...entry,
    cards: logCards.filter(
      (card) => card.name && entry.message.includes(card.name),
    ),
  }));
  const cards = [
    ...view.arena,
    ...view.environment,
    ...view.cache,
    ...view.players.flatMap((player) => [
      ...player.mainframe,
      ...player.ramBank,
      ...player.recycleBin,
      ...player.purge,
      ...(player.hand ?? []),
      ...(player.revealedHand ?? []),
      ...(player.cyberdeckTop ? [player.cyberdeckTop] : []),
    ]),
  ];
  const entries: [string, CardPresentation][] = [];
  for (const card of cards) {
    if (!card.definitionVersion) continue;
    const characteristics =
      card.faceDown && runtime.inspectFaceDown
        ? runtime.inspectFaceDown(structuredClone(state), card.instanceId)
        : effective.get(card.instanceId);
    if (!characteristics)
      throw new Error("Visible card characteristics unavailable");
    const artworkUrl = runtime.artworkUrl(card.definitionVersion);
    const effects = effectsByTarget.get(card.instanceId) ?? [];
    if (artworkUrl) {
      artworkUrlSchema.parse(artworkUrl);
    }
    // Explicit fields: evaluators may hold hidden state or handler data alongside these.
    entries.push([
      card.instanceId,
      {
        name: characteristics.name,
        rulesText: characteristics.rulesText,
        ...(artworkUrl ? { artworkUrl } : {}),
        ...(characteristics.cardType === "character"
          ? {
              attack: characteristics.attack,
              defence: characteristics.defence,
              attackType: characteristics.attackType,
            }
          : {}),
        ...(effects.length ? { effects } : {}),
      },
    ]);
  }
  return {
    view,
    presentations: Object.fromEntries(entries),
    synergy: projectSynergyPresentations(state, effective, view),
  };
}
