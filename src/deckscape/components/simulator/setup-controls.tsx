"use client";

import { useEffect, useRef, useState } from "react";
import type { SetupView } from "@/lib/simulator/setup-response";
import type { SetupCommand } from "@/lib/simulator/setup";
import {
  mountSetupTableCanvas,
  type SetupTableState,
} from "./setup-table-canvas";
import styles from "./setup-controls.module.css";
import type { BoardAnchorListener } from "./board-anchors";

export function SetupControls({
  view,
  disabled,
  send,
  roomId,
  gameIndex = 0,
  error = "",
  uncertain = false,
  retry,
  retryDisabled = false,
  exit,
  exitLabel = "Leave game setup",
  inspectionOnly = false,
  onAnchorLayout,
}: {
  view: SetupView;
  disabled: boolean;
  send: (command: SetupCommand) => void;
  roomId: string;
  gameIndex?: number;
  error?: string;
  uncertain?: boolean;
  retry?: () => void;
  retryDisabled?: boolean;
  exit?: () => void;
  exitLabel?: string;
  inspectionOnly?: boolean;
  onAnchorLayout?: BoardAnchorListener;
}) {
  const hand = view.players[view.seat].hand!;
  const handKey = hand.map((card) => card.instanceId).join("|");
  const choice = view.legalDecisions[0];
  const [bottomOrder, setBottomOrder] = useState<string[]>([]);
  const [displayHand, setDisplayHand] = useState(hand);
  const [transition, setTransition] = useState<"out" | "in" | null>(null);
  const [transitionIds, setTransitionIds] = useState<string[]>([]);
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const [focusedCardId, setFocusedCardId] = useState<string | null>(null);
  const [canvasReady, setCanvasReady] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<Awaited<
    ReturnType<typeof mountSetupTableCanvas>
  > | null>(null);
  const pending = useRef<{
    revision: number;
    selected: string[];
    hand: typeof hand;
  } | null>(null);
  const seenHand = useRef(handKey);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const revealKey = `deckscape:setup-reveal:${roomId}:${gameIndex}`;
  const rolls = view.openingRolls;
  const rollKey = JSON.stringify(rolls);
  const [rollIndex, setRollIndex] = useState(-1);
  const shownRollIndex = view.decision.type === "choose-starter"
    ? rollIndex
    : (rolls?.length ?? 1) - 1;
  const shownRoll = rolls?.[Math.max(0, shownRollIndex)];
  const revealTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [revealStatus, setRevealStatus] = useState<
    "checking" | "running" | "done"
  >("checking");
  const revealDone = revealStatus === "done";

  useEffect(() => {
    if (view.decision.type !== "choose-starter") return;
    const finish = () => {
      setRevealStatus("done");
      setRollIndex((rolls?.length ?? 1) - 1);
      try { sessionStorage.setItem(revealKey, "seen"); } catch {}
    };
    try {
      if (sessionStorage.getItem(revealKey) === "seen") {
        finish();
        return;
      }
    } catch {}
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (!rolls || reduced) {
      finish();
      return;
    }
    setRevealStatus("running");
    setRollIndex(-1);
    rolls.forEach((_, index) => {
      revealTimers.current.push(setTimeout(() => setRollIndex(index), 750 + index * 1100));
    });
    revealTimers.current.push(setTimeout(finish, 1600 + (rolls.length - 1) * 1100));
    return () => {
      for (const timer of revealTimers.current) clearTimeout(timer);
      revealTimers.current = [];
    };
  }, [view.decision.type, revealKey, rollKey]);
  useEffect(() => {
    if (seenHand.current === handKey) return;
    seenHand.current = handKey;
    for (const timer of timers.current) clearTimeout(timer);
    timers.current = [];
    const submitted = pending.current;
    pending.current = null;
    if (
      submitted &&
      view.revision > submitted.revision &&
      submitted.selected.length &&
      submitted.hand.some(
        (card) => !hand.some((item) => item.instanceId === card.instanceId),
      ) &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setDisplayHand(submitted.hand);
      setTransitionIds(submitted.selected);
      setTransition("out");
      timers.current.push(
        setTimeout(() => {
          setDisplayHand(hand);
          setBottomOrder([]);
          setTransitionIds(
            hand
              .filter(
                (card) =>
                  !submitted.hand.some(
                    (old) => old.instanceId === card.instanceId,
                  ),
              )
              .map((card) => card.instanceId),
          );
          setTransition("in");
          timers.current.push(
            setTimeout(() => {
              setTransition(null);
              setTransitionIds([]);
            }, 270),
          );
        }, 190),
      );
      return;
    }
    setDisplayHand(hand);
    setBottomOrder([]);
    setTransition(null);
    setTransitionIds([]);
  }, [view.revision, handKey, hand]);
  useEffect(
    () => () => {
      for (const timer of timers.current) clearTimeout(timer);
    },
    [],
  );

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let stopped = false;
    void mountSetupTableCanvas(element, () => stopped)
      .then((mounted) => {
        if (stopped) return;
        canvas.current = mounted;
        setCanvasReady(true);
      })
      .catch(() => setCanvasReady(false));
    return () => {
      stopped = true;
      canvas.current?.dispose();
      canvas.current = null;
    };
  }, []);
  useEffect(() => {
    const state: SetupTableState = {
      onAnchorLayout,
      cards: displayHand.map((card) => ({
        id: card.instanceId,
        name: card.characteristics.name,
        artworkUrl: card.artworkUrl,
      })),
      selected: bottomOrder,
      transition,
      transitionIds,
      chooser: view.decision.type === "choose-starter",
      revealing:
        view.decision.type === "choose-starter" && revealStatus === "running",
      mainframes: view.players.map((player) => ({
        seat: player.seat,
        name: player.mainframe.characteristics.name,
        artworkUrl: player.mainframe.artworkUrl,
      })),
      viewerSeat: view.seat,
      roll: shownRoll ?? null,
      rollVisible: shownRollIndex >= 0,
    };
    canvas.current?.update(state);
  }, [
    onAnchorLayout,
    canvasReady,
    displayHand,
    bottomOrder,
    transition,
    transitionIds,
    view.decision.type,
    revealStatus,
    shownRollIndex,
    rollKey,
    view.players,
  ]);

  function move(index: number, offset: number) {
    setBottomOrder((old) => {
      const next = [...old];
      [next[index], next[index + offset]] = [next[index + offset], next[index]];
      return next;
    });
  }
  function skipReveal() {
    for (const timer of revealTimers.current) clearTimeout(timer);
    revealTimers.current = [];
    setRollIndex((rolls?.length ?? 1) - 1);
    setRevealStatus("done");
    try {
      sessionStorage.setItem(revealKey, "seen");
    } catch {}
  }
  function confirmMulligan() {
    pending.current = {
      revision: view.revision,
      selected: [...bottomOrder],
      hand,
    };
    send({ type: "mulligan", bottomOrder });
  }
  const chooser = view.decision.type === "choose-starter";
  const chooserSeat =
    view.decision.type === "choose-starter" ? view.decision.seat : null;
  const waiting = !choice && view.decision.type !== "ready";
  const previewId = hoveredCardId ?? focusedCardId;
  const previewCard = displayHand.find((card) => card.instanceId === previewId)
    ?? view.players.find((player) => player.mainframe.instanceId === previewId)?.mainframe;
  return (
    <section className={styles.setup} aria-labelledby="setup-heading">
      <div
        className={styles.table}
        ref={host}
        data-canvas-ready={canvasReady}
        data-setup-transition={transition ?? undefined}
      >
        <header className={styles.topBar}>
          <h2 id="setup-heading">Game setup</h2>
          {exit && <button type="button" onClick={exit} disabled={disabled}>{exitLabel}</button>}
        </header>
        <div className={styles.opponent}>
          <span className={styles.panelLabel}>Opponent · {view.players[1 - view.seat].mainframe.characteristics.name}</span>
          <button
            type="button"
            className={styles.mainframeFace}
            data-setup-mainframe={1 - view.seat}
            aria-label={`View ${view.players[1 - view.seat].mainframe.characteristics.name} card`}
            onMouseEnter={() => setHoveredCardId(view.players[1 - view.seat].mainframe.instanceId)}
            onMouseLeave={() => setHoveredCardId(null)}
            onFocus={() => setFocusedCardId(view.players[1 - view.seat].mainframe.instanceId)}
            onBlur={() => setFocusedCardId(null)}
          />
          <span>{view.players[1 - view.seat].handCount} cards in hand</span>
        </div>
        <div className={styles.center}>
        {chooser && revealStatus !== "checking" && (
          <div className={styles.reveal} data-setup-reveal>
            <span className={styles.eyebrow}>{rolls ? "D20 · Starting player roll" : "Starting player selection"}</span>
            {rolls && <div className={styles.dice}>
              <span data-setup-die="0"><span className={styles.srOnly}>You rolled {shownRollIndex >= 0 ? shownRoll?.[view.seat] : "pending"}</span></span>
              <span data-setup-die="1"><span className={styles.srOnly}>Opponent rolled {shownRollIndex >= 0 ? shownRoll?.[1 - view.seat] : "pending"}</span></span>
            </div>}
            <p role="status">
              {revealDone
                ? rolls
                  ? chooserSeat === view.seat
                    ? "You won the roll. Choose who plays first."
                    : "Your opponent won the roll and chooses who plays first."
                  : chooserSeat === view.seat
                    ? "You choose who plays first for this game."
                    : "Your opponent chooses who plays first for this game."
                : shownRollIndex >= 0 && shownRoll?.[0] === shownRoll?.[1]
                  ? "Tie. Rolling again…"
                  : "Rolling to choose the starting player…"}
            </p>
            {!revealDone && (
              <button type="button" onClick={skipReveal}>
                Skip reveal
              </button>
            )}
          </div>
        )}
        {choice?.type === "choose-starter" && revealDone && (
          <fieldset className={styles.starter} disabled={disabled || inspectionOnly}>
            <legend>{rolls ? "You won the roll" : "You choose the starting player"}</legend>
            {[...choice.choices]
              .sort((a, b) => a === view.seat ? -1 : b === view.seat ? 1 : 0)
              .map((seat) => (
              <button
                type="button"
                key={seat}
                className={seat === view.seat ? styles.primaryChoice : undefined}
                onClick={() =>
                  send({ type: "choose-starter", startingPlayer: seat })
                }
              >
                {seat === view.seat ? "Play first" : "Let opponent play first"}
              </button>
            ))}
          </fieldset>
        )}
        {view.startingPlayer !== null && (
          <p className={styles.starterResult}>
            {view.startingPlayer === view.seat
              ? "You play"
              : "Your opponent plays"}{" "}
            first.
          </p>
        )}
        {waiting && (
          <p className={styles.waiting} role="status">
            {view.decision.type === "choose-starter"
              ? "Waiting for your opponent to choose who plays first."
              : "Waiting for your opponent’s mulligan."}
          </p>
        )}
        {error && <p className={styles.error} role="alert">{error}</p>}
        {uncertain && retry && <button type="button" disabled={retryDisabled} onClick={retry}>Retry same request</button>}
        </div>
        <div className={styles.self}>
          <span className={styles.panelLabel}>You · {view.players[view.seat].mainframe.characteristics.name}</span>
          <button
            type="button"
            className={styles.mainframeFace}
            data-setup-mainframe={view.seat}
            aria-label={`View ${view.players[view.seat].mainframe.characteristics.name} card`}
            onMouseEnter={() => setHoveredCardId(view.players[view.seat].mainframe.instanceId)}
            onMouseLeave={() => setHoveredCardId(null)}
            onFocus={() => setFocusedCardId(view.players[view.seat].mainframe.instanceId)}
            onBlur={() => setFocusedCardId(null)}
          />
        </div>
        {previewCard && (
          <aside className={styles.cardPreview} data-setup-card-preview role="region" aria-label={`${previewCard.characteristics.name} card details`}>
            {previewCard.artworkUrl ? (
              <img
                src={previewCard.artworkUrl}
                alt=""
                referrerPolicy="no-referrer"
                onError={(event) => { event.currentTarget.hidden = true; }}
              />
            ) : null}
            <strong>{previewCard.characteristics.name}</strong>
            {inspectionOnly && previewCard.characteristics.cardType === "character" && (
              <span>
                RAM cost {previewCard.characteristics.ramCost} · {previewCard.characteristics.attack} {previewCard.characteristics.attackType} attack · {previewCard.characteristics.defence} defence
              </span>
            )}
            <span>{previewCard.characteristics.rulesText}</span>
          </aside>
        )}
        {displayHand.length > 0 && (
          <fieldset
            className={styles.mulligan}
            disabled={
              disabled || (!inspectionOnly && choice?.type !== "mulligan") || transition !== null
            }
          >
            <legend>Your opening hand</legend>
            {choice?.type === "mulligan" && !inspectionOnly && (
              <p>
                Keep all five cards, or select cards to put on the bottom of
                your cyberdeck and draw that many replacements.
              </p>
            )}
            <div className={styles.hand} aria-label="Opening hand">
              {displayHand.map((card) => (
                <div
                  className={styles.card}
                  key={card.instanceId}
                  onMouseEnter={() => setHoveredCardId(card.instanceId)}
                  onMouseLeave={() => setHoveredCardId((current) => current === card.instanceId ? null : current)}
                >
                  <button
                    type="button"
                    className={styles.cardChoice}
                    data-setup-card={card.instanceId}
                    aria-pressed={bottomOrder.includes(card.instanceId)}
                    aria-label={`${inspectionOnly ? "Inspect" : "Select"} ${card.characteristics.name}`}
                    onFocus={() => setFocusedCardId(card.instanceId)}
                    onBlur={() => setFocusedCardId((current) => current === card.instanceId ? null : current)}
                    onClick={() =>
                      !inspectionOnly && setBottomOrder((values) =>
                        values.includes(card.instanceId)
                          ? values.filter((value) => value !== card.instanceId)
                          : [...values, card.instanceId],
                      )
                    }
                  >
                    <span className={styles.fallback}>
                      {card.artworkUrl && (
                        <img
                          src={card.artworkUrl}
                          alt=""
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          onError={(event) => { event.currentTarget.hidden = true; }}
                        />
                      )}
                      {card.characteristics.name}
                      {bottomOrder.includes(card.instanceId) && " · Selected"}
                    </span>
                  </button>
                </div>
              ))}
            </div>
            {choice?.type === "mulligan" && !inspectionOnly && (
              <div className={styles.mulliganActions}>
                {bottomOrder.length > 0 && (
                  <>
                    <p>
                      Bottom order: first listed is above the other returned
                      cards; last listed is the bottom card.
                    </p>
                    <ol aria-label="Bottom order">
                      {bottomOrder.map((id, index) => (
                        <li key={id}>
                          {displayHand.find((card) => card.instanceId === id)
                            ?.characteristics.name ?? id}
                          <button
                            type="button"
                            aria-label={`Move returned card ${index + 1} up`}
                            disabled={index === 0}
                            onClick={() => move(index, -1)}
                          >
                            Move up
                          </button>
                          <button
                            type="button"
                            aria-label={`Move returned card ${index + 1} down`}
                            disabled={index === bottomOrder.length - 1}
                            onClick={() => move(index, 1)}
                          >
                            Move down
                          </button>
                        </li>
                      ))}
                    </ol>
                  </>
                )}
                <button type="button" onClick={confirmMulligan}>
                  {bottomOrder.length
                    ? `Replace ${bottomOrder.length} selected cards`
                    : "Keep all five cards"}
                </button>
              </div>
            )}
          </fieldset>
        )}
      </div>
    </section>
  );
}
