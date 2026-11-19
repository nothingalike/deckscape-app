import { createHash } from "node:crypto";
import { botCandidates } from "./bot-policy";
import { activationValue } from "./bot-activation-value";
import type { BotPlaybook } from "./bot-playbook";
import {
  readMatchBattlefield,
  readProgramPlayQuote,
  readActivationQuote,
  submitMatchCommand,
  MatchCommandRejected,
  type MatchStore,
  type MatchRuntimeResolver,
} from "./match-service";

/** Stable input identity makes overlapping requests and lost responses safe to retry. */
function commandId(match: string, revision: number, action: unknown): string {
  const hash = createHash("sha256")
    .update(JSON.stringify([match, revision, action]))
    .digest("hex")
    .slice(0, 32);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20)}`;
}

export async function advanceBot(
  store: MatchStore,
  resolve: MatchRuntimeResolver,
  matchId: string,
  actor: string,
  playbook: BotPlaybook,
  budget = 24,
): Promise<{ applied: number; waiting: boolean }> {
  let applied = 0;
  for (let step = 0; step < budget; step++) {
    const snapshot = await readMatchBattlefield(
      store,
      resolve,
      matchId,
      actor,
      { botCombat: true },
    );
    const candidates = botCandidates(snapshot, playbook, snapshot.botCombat);
    if (!candidates.length) return { applied, waiting: true };
    let progressed = false;
    for (const candidate of candidates) {
      let action = candidate.action;
      const expectedRevision = snapshot.view.revision;
      if (action.type === "play-program" || action.type === "activate") {
        const request = {
          expectedRevision,
          id: action.id,
          choices: action.choices,
          ...(action.type === "activate"
            ? { abilityId: action.abilityId }
            : { freePlay: action.freePlay }),
        };
        const quote =
          action.type === "activate"
            ? await readActivationQuote(store, resolve, matchId, actor, request)
            : await readProgramPlayQuote(
                store,
                resolve,
                matchId,
                actor,
                request,
              );
        if (quote.status !== "ready" || !quote.affordable) continue;
        if (
          action.type === "activate" &&
          activationValue(
            snapshot,
            action.id,
            action.abilityId,
            action.choices,
            quote.cost,
          ) === null
        )
          continue;
        action = { ...action, ram: quote.ram.slice(0, quote.cost) };
      }
      if (
        action.type === "answer-wonderland" &&
        action.play?.type === "play-program"
      ) {
        const quote = await readProgramPlayQuote(
          store,
          resolve,
          matchId,
          actor,
          {
            expectedRevision,
            id: action.play.id,
            choices: action.play.choices,
          },
        );
        if (quote.status !== "ready" || !quote.affordable) continue;
        action = {
          ...action,
          play: { ...action.play, ram: quote.ram.slice(0, quote.cost) },
        };
      }
      const own = snapshot.view.players.find(
        (p) => p.seat === snapshot.view.seat,
      )!;
      const readyRam = own.ramBank.filter((r) => !r.running).length;
      // Keep responses available once established; urgent priorities and recovery override saving RAM.
      if (
        "ram" in action &&
        candidate.score < 20 &&
        snapshot.view.turn.activePlayer === snapshot.view.seat &&
        snapshot.view.arena.filter((c) => c.controller === snapshot.view.seat)
          .length >= 2 &&
        readyRam >= 4 &&
        Math.min(own.mainframeHealth, own.bioframeHealth) > 7 &&
        readyRam - action.ram.length < playbook.reserveRam
      )
        continue;
      try {
        await submitMatchCommand(
          store,
          resolve,
          matchId,
          actor,
          commandId(matchId, expectedRevision, action),
          { expectedRevision, action },
        );
        applied++;
        progressed = true;
        break;
      } catch (error) {
        if (!(error instanceof MatchCommandRejected)) throw error;
        if (error.message === "Stale match revision") {
          progressed = true;
          break;
        }
      }
    }
    if (!progressed)
      throw new Error("Bot has no valid choice for the current decision");
  }
  return { applied, waiting: false };
}
