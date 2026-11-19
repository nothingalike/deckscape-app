"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  boardZones,
  presentationFor,
  type CardPresentation,
  type PlayerGameView,
} from "@/lib/simulator/board-view";
import type { PlayerSynergyPresentation } from "@/lib/simulator/synergy-presentation";
import { gearPortChoiceId } from "@/lib/simulator/gear-port-choice";
import { turnStatus, turnStageLabels } from "@/lib/simulator/turn-status";
import { useBoardInteraction } from "./board-interaction";
import styles from "./game-table.module.css";
import { PlayerFlair } from "@/components/player-flair";
import type { PublicFlair } from "@/lib/achievements/public-flair";

export function GameStatus({
  view,
  presentations,
  synergy = [],
  connectionStatus,
  playerNames,
  playerFlair,
  onInspect,
  onPreview,
  onControlHighlight,
  onResourcesToggle,
  placements,
  onEndpointLayout,
  intentEndpoints = [],
}: {
  view: PlayerGameView;
  presentations: Record<string, CardPresentation>;
  synergy?: PlayerSynergyPresentation[];
  connectionStatus?: ReactNode;
  playerNames?: readonly [string, string];
  playerFlair?: readonly [PublicFlair | undefined, PublicFlair | undefined];
  onInspect?: (id: string) => void;
  onPreview?: (card: { id: string } | null) => void;
  onControlHighlight?: (id: string | null) => void;
  onResourcesToggle?: (seat: number, open: boolean) => void;
  placements: readonly {
    seat: 0 | 1;
    x: number;
    y: number;
    width: number;
    height: number;
    scale: number;
    nameX: number;
    nameY?: number;
    piles?: { x: number; y: number; width: number; gap: number; height: number };
  }[];
  onEndpointLayout?: (
    placements: Readonly<Record<string, { x: number; y: number }>>,
  ) => void;
  intentEndpoints?: readonly string[];
}) {
  const status = useRef<HTMLElement>(null);
  const controlId = (target: EventTarget | null) =>
    target instanceof Element
      ? (target.closest<HTMLElement>("[data-panel-control]")?.dataset
          .panelControl ?? null)
      : null;
  const cards = boardZones(view, playerNames).flatMap((zone) => zone.cards);
  const interaction = useBoardInteraction();
  const picker = interaction?.disabled ? null : interaction?.picker;
  const [openSeat, setOpenSeat] = useState<0 | 1 | null>(null);
  const [openPile, setOpenPile] = useState<{
    seat: 0 | 1;
    kind: "recycle" | "purge";
  } | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const pileOpener = useRef<HTMLButtonElement | null>(null);
  const closeSynergy = useCallback(() => {
    setOpenSeat(null);
    queueMicrotask(() => opener.current?.focus());
  }, []);
  const closePile = useCallback(() => {
    setOpenPile(null);
    queueMicrotask(() => pileOpener.current?.focus());
  }, []);
  useEffect(() => {
    if (openSeat === null) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeSynergy();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [closeSynergy, openSeat]);
  useEffect(() => {
    if (!openPile) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePile();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [closePile, openPile]);
  const ordered = [...view.players].sort(
    (a, b) => Number(a.seat === view.seat) - Number(b.seat === view.seat),
  );
  const endpointKey = cards
    .map((card) => `${card.instanceId}:${JSON.stringify(card.attachments)}`)
    .join("|");
  useEffect(() => {
    const root = status.current;
    if (!root || !onEndpointLayout) return;
    const report = () => {
      const endpoints: Record<string, { x: number; y: number }> = {};
      for (const node of root.querySelectorAll<HTMLElement>(
        "[data-board-endpoint], [data-card-endpoint]",
      )) {
        const bounds = node.getBoundingClientRect();
        for (const id of [
          node.dataset.boardEndpoint,
          node.dataset.cardEndpoint,
        ])
          if (id)
            endpoints[id] = {
              x: bounds.left + bounds.width / 2,
              y: bounds.top + bounds.height / 2,
            };
      }
      onEndpointLayout(endpoints);
    };
    const observer = new ResizeObserver(report);
    observer.observe(root);
    window.addEventListener("resize", report);
    const frame = requestAnimationFrame(report);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", report);
      onEndpointLayout({});
    };
  }, [endpointKey, onEndpointLayout, placements]);
  return (
    <aside
      ref={status}
      className={styles.statusColumn}
      aria-label="Player status"
      onPointerOver={(event) =>
        onControlHighlight?.(
          controlId(event.target) ?? controlId(document.activeElement),
        )
      }
      onPointerLeave={() =>
        onControlHighlight?.(controlId(document.activeElement))
      }
      onFocusCapture={(event) => onControlHighlight?.(controlId(event.target))}
      onBlurCapture={(event) =>
        onControlHighlight?.(controlId(event.relatedTarget))
      }
    >
      <div className={styles.playerPanels}>
        {ordered.map((player) => {
          const placement = placements.find(
            (candidate) => candidate.seat === player.seat,
          );
          if (!placement) return null;
          const mainframe = player.mainframe[0];
          const mainframeName = mainframe
            ? presentationFor(mainframe, presentations).name
            : "Mainframe unavailable";
          const protocols = mainframe
            ? cards.filter((card) =>
                card.attachments.some(
                  (attachment) =>
                    attachment.kind === "protocol" &&
                    attachment.hostId === mainframe.instanceId,
                ),
              )
            : [];
          const programPortCount = Math.max(3, protocols.length);
          const ready = player.ramBank.filter(
            (ram) => !ram.running && !ram.attachments.length,
          ).length;
          const running = player.ramBank.filter(
            (ram) => ram.running && !ram.attachments.length,
          ).length;
          const committed = cards.filter(
            (card) =>
              card.controller === player.seat &&
              card.attachments.some((attachment) => attachment.kind === "ram"),
          ).length;
          const detail = synergy.find((item) => item.seat === player.seat);
          const owner =
            playerNames?.[player.seat] ??
            (player.seat === view.seat ? "Your" : "Opponent");
          return (
            <section
              key={player.seat}
              className={styles.playerPanel}
              data-player={player.seat === view.seat ? "self" : "opponent"}
              aria-label={`${owner} player panel`}
              style={{
                left: placement.x,
                top: placement.y,
                width: placement.width,
                height: placement.height,
                transform: `scale(${placement.scale})`,
              }}
            >
              <div
                className={styles.playerPanelBody}
                style={{ height: placement.height }}
              >
                <header
                  className={styles.playerPanelHeader}
                  style={{ left: placement.nameX, top: placement.nameY ?? 0 }}
                >
                  <strong>
                    {playerNames?.[player.seat] ??
                      (player.seat === view.seat ? "You" : "Opponent")}
                  </strong>
                  <span className={styles.playerFlairAccessible}>
                    <PlayerFlair {...playerFlair?.[player.seat]} />
                  </span>
                  <span>
                    {player.seat === view.turn.activePlayer
                      ? "Active"
                      : "Waiting"}
                  </span>
                  {player.seat === view.seat && connectionStatus && (
                    <div
                      className={styles.connectionStatus}
                      aria-label="Match connection"
                    >
                      {connectionStatus}
                    </div>
                  )}
                </header>
                <dl className={styles.healthStats}>
                  <div className={styles.mainframeHealth}>
                    <dt>Mainframe life</dt>
                    <dd>{player.mainframeHealth}</dd>
                  </div>
                  <div className={styles.bioframeHealth}>
                    <dt>Bioframe life</dt>
                    <dd>{player.bioframeHealth}</dd>
                  </div>
                </dl>
                <div className={styles.mainframeSummary}>
                  {mainframe ? (
                    <button
                      type="button"
                      className={styles.mainframeCard}
                      data-board-endpoint={mainframe.instanceId}
                      data-intent-target={
                        intentEndpoints.includes(mainframe.instanceId) ||
                        undefined
                      }
                      data-candidate={
                        picker?.candidates.includes(mainframe.instanceId) ||
                        undefined
                      }
                      data-selected={
                        picker?.selected.includes(mainframe.instanceId) ||
                        interaction?.decoration.selected.includes(
                          mainframe.instanceId,
                        ) ||
                        undefined
                      }
                      aria-label={`${mainframeName} mainframe`}
                      title={`${mainframeName} — inspect Mainframe`}
                      onPointerEnter={() =>
                        onPreview?.({ id: mainframe.instanceId })
                      }
                      onPointerLeave={() => onPreview?.(null)}
                      onFocus={() => onPreview?.({ id: mainframe.instanceId })}
                      onBlur={() => onPreview?.(null)}
                      onClick={() => {
                        if (picker?.candidates.includes(mainframe.instanceId))
                          picker.choose(mainframe.instanceId);
                        else onInspect?.(mainframe.instanceId);
                      }}
                    >
                      {presentationFor(mainframe, presentations).artworkUrl ? (
                        <img
                          src={
                            presentationFor(mainframe, presentations).artworkUrl
                          }
                          alt=""
                        />
                      ) : (
                        mainframeName
                      )}
                    </button>
                  ) : (
                    <span>{mainframeName}</span>
                  )}
                  <div
                    className={styles.protocolPorts}
                    aria-label={`${mainframeName} protocol ports`}
                  >
                    {programPortCount ? (
                      Array.from({ length: programPortCount }, (_, index) => {
                        const protocol = protocols[index];
                        const reservedRam = protocol
                          ? cards.filter((candidate) =>
                              candidate.attachments.some(
                                (attachment) =>
                                  attachment.kind === "ram" &&
                                  attachment.hostId === protocol.instanceId,
                              ),
                            ).length
                          : 0;
                        const portId = gearPortChoiceId(
                          mainframe!.instanceId,
                          `program:${index}`,
                        );
                        return (
                          <button
                            type="button"
                            key={portId}
                            data-board-endpoint={portId}
                            data-card-endpoint={protocol?.instanceId}
                            data-intent-target={
                              intentEndpoints.includes(portId) ||
                              (!!protocol &&
                                intentEndpoints.includes(
                                  protocol.instanceId,
                                )) ||
                              undefined
                            }
                            title={
                              protocol
                                ? presentationFor(protocol, presentations).name
                                : `Empty protocol slot ${index + 1}`
                            }
                            disabled={
                              !protocol &&
                              !picker?.candidates.includes(
                                mainframe!.instanceId,
                              )
                            }
                            data-candidate={
                              picker?.candidates.includes(
                                mainframe!.instanceId,
                              ) ||
                              (!!protocol && picker?.candidates.includes(protocol.instanceId)) ||
                              undefined
                            }
                            data-selected={
                              interaction?.programSlot === portId ||
                              (!!protocol && picker?.selected.includes(protocol.instanceId)) ||
                              undefined
                            }
                            data-occupied={!!protocol}
                            aria-label={`Program port ${index + 1} on ${mainframeName}${protocol ? `, ${presentationFor(protocol, presentations).name}` : ", empty"}`}
                            onClick={() => {
                              if (
                                picker?.candidates.includes(
                                  mainframe!.instanceId,
                                )
                              ) {
                                interaction?.setProgramSlot(portId);
                                picker.choose(mainframe!.instanceId);
                              } else if (protocol) {
                                if (picker?.candidates.includes(protocol.instanceId))
                                  picker.choose(protocol.instanceId);
                                else onInspect?.(protocol.instanceId);
                              }
                            }}
                          >
                            <span aria-hidden="true">P{index + 1}</span>
                            {reservedRam ? (
                              <small>{reservedRam} RAM</small>
                            ) : null}
                          </button>
                        );
                      })
                    ) : (
                      <span>No protocols</span>
                    )}
                  </div>
                </div>
                <div
                  className={styles.synergyPorts}
                  aria-label={`${mainframeName} synergy tiers`}
                >
                  {detail?.tiers.map((tier) => (
                    <button
                      key={tier.index}
                      data-panel-control={`panel:${player.seat}:synergy:${tier.index}`}
                      type="button"
                      className={styles.synergySummary}
                      data-active={tier.active}
                      data-replaced={tier.replaced || undefined}
                      aria-label={`Synergy tier ${tier.index + 1}: ${tier.active ? "active" : tier.replaced ? "replaced" : "inactive"}`}
                      title={`Tier ${tier.index + 1}: ${tier.text}`}
                      aria-description={tier.text}
                      aria-haspopup="dialog"
                      onClick={(event) => {
                        opener.current = event.currentTarget;
                        setOpenSeat(player.seat);
                      }}
                    >
                      <span aria-hidden="true">{tier.index + 1}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.pileButtons} style={placement.piles ? {
                left: placement.piles.x,
                top: placement.piles.y,
                width: placement.piles.width * 2 + placement.piles.gap,
                gap: placement.piles.gap,
              } : undefined}>
                {(
                  [
                    ["recycle", "Recycle", player.recycleBin],
                    ["purge", "Purge", player.purge],
                  ] as const
                ).map(([kind, label, pile]) => (
                  <button
                    type="button"
                    key={kind}
                    data-panel-control={`panel:${player.seat}:${kind}`}
                    style={placement.piles ? { height: placement.piles.height } : undefined}
                    title={label}
                    disabled={!pile.length}
                    onClick={(event) => {
                      pileOpener.current = event.currentTarget;
                      setOpenPile({ seat: player.seat, kind });
                    }}
                  >
                    {label} {pile.length}
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      {openSeat !== null && (
        <SynergyDialog
          detail={synergy.find((item) => item.seat === openSeat)!}
          presentations={presentations}
          playerName={
            playerNames?.[openSeat] ??
            (openSeat === view.seat ? "Your" : "Opponent")
          }
          onClose={closeSynergy}
          onInspect={onInspect}
        />
      )}
      {openPile && createPortal(
        <PileDialog
          label={openPile.kind === "recycle" ? "Recycle bin" : "Purge"}
          cards={
            view.players.find((player) => player.seat === openPile.seat)?.[
              openPile.kind === "recycle" ? "recycleBin" : "purge"
            ] ?? []
          }
          presentations={presentations}
          onClose={closePile}
          candidates={interaction?.picker?.candidates}
          selected={interaction?.picker?.selected}
          disabled={interaction?.disabled}
          onChoose={(id) => {
            if (interaction?.picker) {
              if (
                interaction.disabled ||
                !interaction.picker.candidates.includes(id)
              ) return;
              interaction.picker.choose(id);
              closePile();
              return;
            }
            closePile();
            onInspect?.(id);
          }}
        />,
        document.body,
      )}
    </aside>
  );
}

function PileDialog({
  label,
  cards,
  presentations,
  onClose,
  onChoose,
  candidates,
  selected,
  disabled,
}: {
  label: string;
  cards: ReturnType<typeof boardZones>[number]["cards"];
  presentations: Record<string, CardPresentation>;
  onClose: () => void;
  onChoose: (id: string) => void;
  candidates?: string[];
  selected?: string[];
  disabled?: boolean;
}) {
  return (
    <div
      className={styles.pileDialog}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <header>
        <h2>{label}</h2>
        <button
          type="button"
          autoFocus
          onClick={onClose}
          aria-label="Close pile"
        >
          ×
        </button>
      </header>
      <div className={styles.pileCards}>
        {cards.map((card) => {
          const presentation = presentationFor(card, presentations);
          return (
            <button
              type="button"
              key={card.instanceId}
              disabled={
                !!candidates && (disabled || !candidates.includes(card.instanceId))
              }
              aria-pressed={
                candidates ? selected?.includes(card.instanceId) ?? false : undefined
              }
              aria-description={
                candidates?.includes(card.instanceId) ? "Valid target" : undefined
              }
              onClick={() => onChoose(card.instanceId)}
            >
              {presentation.artworkUrl && (
                <img src={presentation.artworkUrl} alt="" />
              )}
              <span>{presentation.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SynergyDialog({
  detail,
  presentations,
  playerName,
  onClose,
  onInspect,
}: {
  detail: PlayerSynergyPresentation;
  presentations: Record<string, CardPresentation>;
  playerName: string;
  onClose: () => void;
  onInspect?: (id: string) => void;
}) {
  const contributorList = (
    label: string,
    group: PlayerSynergyPresentation["contributors"]["persistents"],
  ) => (
    <section key={label}>
      <h3>
        {label} · {group.current}
      </h3>
      <ul>
        {group.cardIds.map((id) => (
          <li key={id}>
            <button
              type="button"
              onClick={() => {
                onClose();
                onInspect?.(id);
              }}
            >
              {presentations[id]?.name ?? "Visible card"}
            </button>
          </li>
        ))}
        {!!group.hiddenCount && (
          <li>
            {group.hiddenCount} hidden{" "}
            {group.hiddenCount === 1 ? "contributor" : "contributors"}
          </li>
        )}
      </ul>
    </section>
  );
  return (
    <div
      className={styles.synergyDialog}
      role="dialog"
      aria-modal="true"
      aria-label={`${playerName} mainframe synergy`}
    >
      <header>
        <div>
          <span>{playerName}</span>
          <h2>
            {presentations[detail.mainframeId]?.name ?? "Mainframe"} synergy
          </h2>
        </div>
        <button
          type="button"
          autoFocus
          onClick={onClose}
          aria-label="Close synergy details"
        >
          ×
        </button>
      </header>
      <ol className={styles.synergyTiers}>
        {detail.tiers.map((tier) => (
          <li key={tier.index} data-active={tier.active}>
            <strong>
              Tier {tier.index + 1} ·{" "}
              {tier.replaced
                ? "Replaced by higher tier"
                : tier.active
                  ? "Active"
                  : "Unmet"}
            </strong>
            <span>
              Permanents {tier.persistents.current}/{tier.persistents.required}
            </span>
            {tier.factions.map((faction) => (
              <span key={faction.faction}>
                {faction.faction} {faction.current}/{faction.required}
              </span>
            ))}
            <p>{tier.text}</p>
          </li>
        ))}
      </ol>
      <details className={styles.synergyExplanationDetails}>
        <summary>What counts?</summary>
        <div className={styles.synergyContributors}>
          {contributorList(
            "Permanent contributors",
            detail.contributors.persistents,
          )}
          {Object.entries(detail.contributors.factions).map(([faction, group]) =>
            contributorList(`${faction} contributors`, group),
          )}
        </div>
        {detail.explanations.map((explanation) => (
          <p className={styles.synergyExplanation} key={explanation}>
            {explanation}
          </p>
        ))}
      </details>
    </div>
  );
}

export function TurnContext({
  view,
  headerControl,
}: {
  view: PlayerGameView;
  headerControl?: ReactNode;
}) {
  const status = turnStatus(view);
  return (
    <div className={styles.turnContext}>
      <div className={styles.turnHeader}>
        <strong>{status.owner}</strong>
        {headerControl}
      </div>
      <span>Turn {view.turn.number}</span>
      <p>{status.stage}</p>
      <p role="status">{status.instruction}</p>
      <ol className={styles.stageTracker} aria-label="Turn stages">
        {Object.entries(turnStageLabels).map(([step, label]) => (
          <li
            key={step}
            aria-current={
              !view.outcome && step === view.turn.step ? "step" : undefined
            }
          >
            {label}
          </li>
        ))}
      </ol>
    </div>
  );
}
