import type { BattlefieldSnapshot, MatchClientState } from "./match-client-session";
import { turnPromptMatchesView } from "./turn-prompt";

const preferenceVersion = 1;

export function automaticPassPreferenceKey(matchId: string, seat: 0 | 1) {
  return `deckscape:auto-pass:${encodeURIComponent(matchId)}:${seat}`;
}

export function serializeAutomaticPassPreference(enabled: boolean) {
  return JSON.stringify({ version: preferenceVersion, enabled });
}

export function parseAutomaticPassPreference(value: string | null): boolean {
  if (!value) return false;
  try {
    const parsed: unknown = JSON.parse(value);
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      "version" in parsed &&
      parsed.version === preferenceVersion &&
      "enabled" in parsed &&
      parsed.enabled === true
    );
  } catch {
    return false;
  }
}

export function automaticPassLockName(matchId: string, seat: 0 | 1) {
  return `deckscape:auto-pass:${matchId}:${seat}`;
}

export function canAutomaticallyPass(
  state: MatchClientState,
  snapshot: BattlefieldSnapshot,
  options: {
    enabled: boolean;
    preferenceLoaded: boolean;
    synchronized: boolean;
    lockOwned: boolean;
    visible: boolean;
  },
) {
  const { view } = snapshot;
  const prompt = snapshot.turnPrompt;
  if (
    !options.enabled ||
    !options.preferenceLoaded ||
    !options.synchronized ||
    !options.lockOwned ||
    !options.visible ||
    state.phase !== "ready" ||
    state.commandPending ||
    view.outcome ||
    view.pendingDecision ||
    !prompt ||
    prompt.type !== "pass" ||
    !turnPromptMatchesView(prompt, view)
  )
    return false;

  // An empty cache on your own Deploy is the deliberate opportunity to end
  // deployment. Responses to played cards still pass automatically.
  return !(
    view.turn.step === "deploy" &&
    view.turn.activePlayer === view.seat &&
    view.priority?.stack.length === 0
  );
}
