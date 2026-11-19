"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BoardInteractionProvider } from "./board-interaction";
import { outcomeLabel } from "@/lib/simulator/outcome-label";
import styles from "./game-table.module.css";
import { ConfirmationDock, InlineConfirmation } from "./visual-action-controls";
import { MatchHud } from "./match-hud";
import { LandscapePrompt } from "./landscape-prompt";

import { cardChoiceLabel } from "@/lib/simulator/card-choice-label";
import { Battlefield } from "./battlefield";
import type { BoardAnchorListener } from "./board-anchors";
import type { PublicFlair } from "@/lib/achievements/public-flair";
import { CardDetails } from "./card-inspection";
import { EndMatchControls } from "./end-match-controls";
import { DecisionControls, type SubmitDecision } from "./decision-controls";
import {
  type CardPresentation,
  type PlayerGameView,
} from "@/lib/simulator/board-view";
import type { DecisionPrompt } from "@/lib/simulator/decision-prompt";
import {
  turnPromptMatchesView,
  type TurnPrompt,
} from "@/lib/simulator/turn-prompt";
import { TurnControls } from "./turn-controls";
import { passPriorityLabel } from "@/lib/simulator/turn-status";
import type {
  ProgramQuoteTransport,
  ActivationQuoteTransport,
} from "@/lib/simulator/http-match-transport";
import type { CardRequirementAssessment } from "@/lib/simulator/card-requirement-assessment";
import type { ProgramQuote } from "@/lib/simulator/program-quote-contract";
import {
  activationQuoteRequestSchema,
  activationQuoteSchema,
  type ActivationQuote,
  type ActivationQuoteRequest,
} from "@/lib/simulator/activation-quote-contract";
import { cardActionCues } from "@/lib/simulator/card-action-cues";

/** Mounted by the match client with its authenticated response and command transport. */
export function GameplaySurface(props: Parameters<typeof GameTable>[0]) {
  return (
    <BoardInteractionProvider disabled={props.disabled || !!props.view.outcome}>
      <GameTable {...props} />
      <LandscapePrompt active={!props.view.outcome} />
    </BoardInteractionProvider>
  );
}

function GameTable({
  view,
  presentations,
  synergy = [],
  requirements = {},
  decision,
  turnPrompt,
  onSubmit,
  onQuote,
  onActivationQuote,
  disabled = false,
  connectionStatus,
  automaticControls,
  matchOptions,
  playerNames,
  playerFlair,
  resultLink,
  lessonGuidance,
  onAnchorLayout,
  compactHandDuringAction = false,
  initialInspectionId,
}: {
  resultLink?: { href: string; label: string };
  connectionStatus?: ReactNode;
  automaticControls?: ReactNode;
  matchOptions?: ReactNode;
  playerNames?: readonly [string, string];
  playerFlair?: readonly [PublicFlair | undefined, PublicFlair | undefined];
  lessonGuidance?: string;
  onAnchorLayout?: BoardAnchorListener;
  compactHandDuringAction?: boolean;
  initialInspectionId?: string;
  view: PlayerGameView;
  presentations: Record<string, CardPresentation>;
  synergy?: import("@/lib/simulator/synergy-presentation").PlayerSynergyPresentation[];
  requirements?: Record<string, CardRequirementAssessment>;
  decision: DecisionPrompt | null;
  turnPrompt: TurnPrompt | null;
  onSubmit: SubmitDecision;
  onQuote?: ProgramQuoteTransport["quoteProgram"];
  onActivationQuote?: ActivationQuoteTransport["quoteActivation"];
  disabled?: boolean;
}) {
  // Action selection belongs to one authoritative snapshot, not the next priority window.
  const [focus, setFocus] = useState<{ id: string; revision: number } | null>(
    null,
  );
  useEffect(() => {
    setFocus(
      initialInspectionId ? { id: initialInspectionId, revision: view.revision } : null,
    );
  }, [initialInspectionId, view.revision]);
  const [launchedAction, setLaunchedAction] = useState<{
    id: string;
    revision: number;
    abilityId?: string;
  } | null>(null);
  const [programQuoteFeedback, setProgramQuoteFeedback] = useState<{
    id: string;
    quote: ProgramQuote | null;
  } | null>(null);
  const updateProgramQuoteFeedback = useCallback(
    (id: string, quote: ProgramQuote | null) =>
      setProgramQuoteFeedback({ id, quote }),
    [],
  );
  const focusedCard = focus?.revision === view.revision ? focus.id : null;
  const activeAction =
    launchedAction?.revision === view.revision ? launchedAction : null;
  const cancelAction = useCallback(() => {
    setFocus(null);
    setLaunchedAction(null);
  }, []);
  const inspectCard = useCallback(
    (id: string | null) => {
      setLaunchedAction(null);
      setFocus(id ? { id, revision: view.revision } : null);
    },
    [view.revision],
  );
  const requirementAssessment = useMemo(() => {
    const base = focusedCard ? requirements[focusedCard] : undefined;
    const quote =
      programQuoteFeedback?.id === focusedCard
        ? programQuoteFeedback.quote
        : null;
    if (!base || !quote || quote.request.expectedRevision !== view.revision)
      return base;
    if (quote.status !== "ready") return base;
    const blockers = base.blockers.filter((blocker) => blocker.code !== "ram");
    if (!quote.affordable)
      blockers.push({ code: "ram", message: "Not enough refreshed RAM." });
    return {
      ...base,
      cost: quote.cost,
      availableRam: quote.ram.length,
      choicesRequired: false,
      status: blockers.length ? "blocked" : "ready",
      blockers,
    } satisfies CardRequirementAssessment;
  }, [focusedCard, programQuoteFeedback, requirements, view.revision]);
  const [dismissedOutcome, setDismissedOutcome] = useState(false);
  const [cardListsVisible, setCardListsVisible] = useState(false);
  const name = (id: string) => cardChoiceLabel(view, presentations, id);
  const canAct = turnPrompt && turnPromptMatchesView(turnPrompt, view);
  const canAnswer =
    !view.outcome &&
    decision &&
    decision.revision === view.revision &&
    view.pendingDecision?.decisionId === decision.decisionId &&
    view.pendingDecision.player === view.seat;
  const focusedActions =
    canAct && turnPrompt.type === "pass" && focusedCard
      ? cardActionLaunchers(turnPrompt, focusedCard)
      : [];
  const guardCombat = !!(
    canAct &&
    turnPrompt.type === "pass" &&
    !activeAction &&
    passPriorityLabel(view) === "Proceed to combat" &&
    turnPrompt.characters?.some(
      (option) => option.id === focusedCard && option.unavailable === null,
    )
  );
  const [abilityChecks, setAbilityChecks] = useState<{
    revision: number;
    id: string;
    optionsKey: string;
    quotes: Record<string, ActivationQuote | "error">;
  } | null>(null);
  const quoteActivation = useRef(onActivationQuote);
  quoteActivation.current = onActivationQuote;
  const activationOptionsKey = canAct && turnPrompt.type === "pass" && focusedCard
    ? JSON.stringify(turnPrompt.activations?.find((option) => option.id === focusedCard)?.abilities ?? [])
    : "";
  useEffect(() => {
    const checkActivation = quoteActivation.current;
    if (!focusedCard || !canAct || turnPrompt.type !== "pass" || !checkActivation || disabled)
      return;
    const activation = turnPrompt.activations?.find((option) => option.id === focusedCard);
    const requests = (activation?.abilities ?? []).flatMap((ability) => {
      if (ability.variants.length !== 1) return [];
      const variant = ability.variants[0];
      if (variant.targets.length || (variant.x && variant.x.minimum !== variant.x.maximum) ||
          (variant.playerTargets && variant.playerTargets.length !== 1)) return [];
      return [{
        expectedRevision: view.revision,
        id: focusedCard,
        abilityId: ability.abilityId,
        choices: {
          modes: variant.modes,
          targets: [],
          x: variant.x?.minimum ?? null,
          ...(variant.cacheActionId ? { cacheActionId: variant.cacheActionId } : {}),
          ...(variant.playerTargets ? { playerTarget: variant.playerTargets[0].player } : {}),
        },
      } satisfies ActivationQuoteRequest];
    });
    const controller = new AbortController();
    for (const request of requests) {
      const canonicalRequest = activationQuoteRequestSchema.parse(request);
      void checkActivation(canonicalRequest, controller.signal).then((response) => {
        if (controller.signal.aborted) return;
        const quote = activationQuoteSchema.parse(response);
        if (quote.revision !== view.revision ||
            JSON.stringify(quote.request) !== JSON.stringify(canonicalRequest)) return;
        setAbilityChecks((current) => ({
          revision: view.revision,
          id: focusedCard,
          optionsKey: activationOptionsKey,
          quotes: {
            ...(current?.revision === view.revision && current.id === focusedCard &&
                current.optionsKey === activationOptionsKey ? current.quotes : {}),
            [request.abilityId]: quote,
          },
        }));
      }).catch(() => {
        if (!controller.signal.aborted)
          setAbilityChecks((current) => ({
            revision: view.revision,
            id: focusedCard,
            optionsKey: activationOptionsKey,
            quotes: {
              ...(current?.revision === view.revision && current.id === focusedCard &&
                  current.optionsKey === activationOptionsKey ? current.quotes : {}),
              [request.abilityId]: "error",
            },
          }));
      });
    }
    return () => controller.abort();
  }, [focusedCard, view.revision, activationOptionsKey, disabled, !!onActivationQuote, canAct]);
  const checkedActions = focusedActions.map((action) => {
    const ability = canAct && turnPrompt.type === "pass" && focusedCard && action.abilityId
      ? turnPrompt.activations?.find((option) => option.id === focusedCard)
          ?.abilities.find((option) => option.abilityId === action.abilityId)
      : undefined;
    const variant = ability?.variants.length === 1 ? ability.variants[0] : undefined;
    const checkable = variant && !variant.targets.length &&
      (!variant.x || variant.x.minimum === variant.x.maximum) &&
      (!variant.playerTargets || variant.playerTargets.length === 1);
    const quote = abilityChecks?.revision === view.revision &&
      abilityChecks.id === focusedCard && abilityChecks.optionsKey === activationOptionsKey &&
      !!onActivationQuote && action.abilityId
        ? abilityChecks.quotes[action.abilityId]
        : undefined;
    if (checkable && onActivationQuote && !quote)
      return { ...action, unavailable: "Checking ability…" };
    if (quote === "error") return action;
    if (quote?.status === "ready" && !quote.affordable)
      return { ...action, unavailable: `Needs ${quote.cost} refreshed RAM; ${quote.ram.length} available.` };
    if (quote?.status === "unavailable" && quote.reason !== "stale")
      return { ...action, unavailable: {
        window: "Cannot activate in this window.",
        source: "This source cannot activate now.",
        prohibited: "Blocked by a current effect.",
        additionalCost: "Additional cost unavailable.",
        choices: "Current choices are not legal.",
      }[quote.reason] };
    return action;
  });
  const checkedOptionsKey = canAct && turnPrompt.type === "pass" && abilityChecks
    ? JSON.stringify(turnPrompt.activations?.find((option) => option.id === abilityChecks.id)?.abilities ?? [])
    : "";
  const currentAbilityQuotes = onActivationQuote &&
    abilityChecks?.revision === view.revision &&
    abilityChecks.optionsKey === checkedOptionsKey
      ? { [abilityChecks.id]: abilityChecks.quotes }
      : {};
  const launchFocusedAction = useCallback(
    (abilityId?: string) => {
      if (!focusedCard) return;
      setLaunchedAction({
        id: focusedCard,
        revision: view.revision,
        ...(abilityId ? { abilityId } : {}),
      });
      setFocus(null);
    },
    [focusedCard, view.revision],
  );
  const compact =
    !canAnswer &&
    (!canAct ||
      (turnPrompt.type === "pass" && !activeAction && checkedActions.length === 0));
  return (
    <div
      className={`${styles.table} ${!view.outcome ? styles.immersive : ""}`}
      data-game-viewport={!view.outcome || undefined}
    >
      <div className={styles.board}>
        <div className={styles.confirmationDock} data-confirmation-dock>
          <ConfirmationDock />
        </div>
        <Battlefield
          compactHand={compactHandDuringAction && !!activeAction}
          onAnchorLayout={onAnchorLayout}
          actionCues={cardActionCues(
            view,
            turnPrompt,
            requirements,
            disabled || !!activeAction,
            currentAbilityQuotes,
          )}
          fitViewport={!view.outcome}
          cardListsVisible={cardListsVisible}
          onCloseCardLists={() => setCardListsVisible(false)}
          view={view}
          activeCardId={canAct ? (activeAction?.id ?? focusedCard) : null}
          inspectedCardId={focusedCard}
          requirementAssessment={requirementAssessment}
          presentations={presentations}
          onInspect={inspectCard}
          actionPanel={
            checkedActions.length ? (
              <CardActionLaunchers
                actions={checkedActions}
                disabled={disabled}
                onLaunch={launchFocusedAction}
              />
            ) : null
          }
          synergy={synergy}
          playerNames={playerNames}
          playerFlair={playerFlair}
          connectionStatus={connectionStatus}
          disabled={disabled || !!view.outcome}
        />
        {view.outcome && !dismissedOutcome && (
          <section
            className={styles.outcome}
            role="dialog"
            aria-label="Game result"
            aria-modal="false"
          >
            <p>GAME OVER</p>
            <h2>{outcomeLabel(view.outcome, view.seat)}</h2>
            <button
              type="button"
              autoFocus
              onClick={() => setDismissedOutcome(true)}
            >
              Review board and log
            </button>
            <a href={resultLink?.href ?? "#/solo"}>{resultLink?.label ?? "Your games"}</a>
          </section>
        )}
      </div>
      <MatchHud
        view={view}
        playerNames={playerNames}
        automaticControls={automaticControls}
        compact={compact}
        options={
          <>
            {matchOptions}
            <a href="#/solo">Leave match view</a>
            <label>
              <input
                type="checkbox"
                checked={cardListsVisible}
                onChange={(event) => setCardListsVisible(event.target.checked)}
              />
              Show accessible card lists
            </label>
            {!!view.reveals?.length && (
              <section aria-label="Revealed cards">
                <h3>Revealed cards</h3>
                <ol>
                  {view.reveals.map((reveal, index) => (
                    <li key={index}>
                      {reveal.player === view.seat ? "You" : "Your opponent"}{" "}
                      revealed <strong>{reveal.characteristics.name}</strong>.
                      <CardDetails
                        characteristics={reveal.characteristics}
                        artworkUrl={reveal.artworkUrl}
                      />
                    </li>
                  ))}
                </ol>
              </section>
            )}
            {view.triggerOrder && view.triggerOrder.player !== view.seat && (
              <p role="status">
                Waiting for your opponent to order triggered abilities.
              </p>
            )}
            {!view.outcome && !lessonGuidance && (
              <EndMatchControls
                key={view.revision}
                revision={view.revision}
                disabled={disabled}
                onSubmit={onSubmit}
              />
            )}
          </>
        }
      >
        <div aria-label="Action guidance">
          {!canAct && !canAnswer && (
            <p role="status">
              {lessonGuidance && !disabled ? lessonGuidance : view.outcome
                ? outcomeLabel(view.outcome, view.seat)
                : disabled
                  ? "Synchronizing game…"
                  : "Waiting for your opponent."}
            </p>
          )}
          {canAnswer && (
            <fieldset
              disabled={disabled}
              style={{ border: 0, padding: 0, margin: 0 }}
            >
              <DecisionControls
                onQuote={onQuote}
                decision={decision}
                onSubmit={onSubmit}
                name={name}
              />
            </fieldset>
          )}
          {canAct && (
            <fieldset
              disabled={disabled}
              style={{ border: 0, padding: 0, margin: 0 }}
            >
              <InlineConfirmation
                enabled={
                  turnPrompt.type === "attack" ||
                  turnPrompt.type === "block" ||
                  (turnPrompt.type === "pass" && !!activeAction)
                }
              >
                <TurnControls
                  // Inspection keeps priority controls; character selection guards combat advancement.
                  focusedCard={
                    activeAction?.id ??
                    (turnPrompt.type === "pass" ? null : focusedCard)
                  }
                  initialAbilityId={activeAction?.abilityId}
                  onCancel={cancelAction}
                  prompt={turnPrompt}
                  passLabel={passPriorityLabel(view)}
                  passDisabled={guardCombat}
                  name={name}
                  onSubmit={onSubmit}
                  onQuote={onQuote}
                  onActivationQuote={onActivationQuote}
                  onProgramQuoteChange={updateProgramQuoteFeedback}
                />
              </InlineConfirmation>
            </fieldset>
          )}
          {canAct &&
            turnPrompt.type === "pass" &&
            !!focusedCard &&
            !activeAction &&
            checkedActions.length > 0 && (
              <CardActionLaunchers
                actions={checkedActions}
                disabled={disabled}
                onLaunch={launchFocusedAction}
                onClear={guardCombat ? cancelAction : undefined}
              />
            )}
        </div>
      </MatchHud>
    </div>
  );
}

function CardActionLaunchers({
  actions,
  disabled,
  onLaunch,
  onClear,
}: {
  actions: CardActionLauncher[];
  disabled: boolean;
  onLaunch: (abilityId?: string) => void;
  onClear?: () => void;
}) {
  return (
    <div aria-label="Available card actions" className={styles.cardActionLaunchers}>
      {actions.map((action) => (
        <span key={action.key} className={styles.cardActionLauncher}>
          <button
            type="button"
            disabled={disabled || !!action.unavailable}
            aria-label={action.unavailable ? `${action.label}. ${action.unavailable}` : undefined}
            onClick={() => onLaunch(action.abilityId)}
          >
            {action.label}
          </button>
          {action.unavailable && <span className={styles.cardActionUnavailable}> {action.unavailable}</span>}
        </span>
      ))}
      {onClear && (
        <button type="button" disabled={disabled} onClick={onClear}>
          Clear selection
        </button>
      )}
    </div>
  );
}

type CardActionLauncher = {
  key: string;
  label: string;
  abilityId?: string;
  unavailable?: string;
};

function cardActionLaunchers(
  prompt: Extract<TurnPrompt, { type: "pass" }>,
  id: string,
) {
  const actions: CardActionLauncher[] = [];
  if (prompt.characters?.some((option) => option.id === id))
    actions.push({ key: "play-character", label: "Play character" });
  if (prompt.gear?.some((option) => option.id === id))
    actions.push({ key: "play-gear", label: "Play gear" });
  if (prompt.programs?.some((option) => option.id === id))
    actions.push({ key: "play-program", label: "Play program" });
  const activation = prompt.activations?.find((option) => option.id === id);
  for (const ability of activation?.abilities ?? [])
    if (ability.variants.length)
      actions.push({
        key: `activate:${ability.abilityId}`,
        label: ability.label,
        abilityId: ability.abilityId,
      });
  return actions;
}
