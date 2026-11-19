"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { ChevronRight, Maximize2 } from "lucide-react";
import { CardImageViewer } from "@/components/card-image-viewer";
import {
  boardZones,
  presentationFor,
  type CardPresentation,
  type PlayerGameView,
} from "@/lib/simulator/board-view";
import styles from "./battlefield.module.css";
import { cardChoiceLabel } from "@/lib/simulator/card-choice-label";
import { useBoardInteraction } from "./board-interaction";
import type { BoardIntentLink } from "./board-interaction";
import { gearPortChoiceId } from "@/lib/simulator/gear-port-choice";
import {
  CurrentCardState,
  RequirementFeedback,
  ReservedRamChips,
} from "./card-inspection";
import { ramStackGroups } from "@/lib/simulator/table-layout";
import tableStyles from "./game-table.module.css";
import type { CardRequirementAssessment } from "@/lib/simulator/card-requirement-assessment";
import type { BoardCanvasRenderer, BoardCanvasState } from "./board-canvas";
import type { BoardAnchorListener } from "./board-anchors";
import type { PlayerSynergyPresentation } from "@/lib/simulator/synergy-presentation";
import { GameStatus } from "./game-status";
import type { PublicFlair } from "@/lib/achievements/public-flair";
import { phaseAnnouncement } from "@/lib/simulator/phase-announcement";
import { RamStackBrowser } from "./ram-stack-browser";
import { CacheBrowser } from "./cache-browser";
import {
  cardActionCueLabels,
  type CardActionCue,
} from "@/lib/simulator/card-action-cues";

export function Battlefield({
  view,
  presentations,
  inspectedCardId,
  requirementAssessment,
  onInspect,
  actionPanel,
  activeCardId = null,
  disabled = false,
  playerNames,
  playerFlair,
  synergy = [],
  connectionStatus,
  cardListsVisible = true,
  fitViewport = false,
  onCloseCardLists,
  actionCues = {},
  onAnchorLayout,
  compactHand = false,
}: {
  view: PlayerGameView;
  /** Only presentations the authenticated viewer may inspect, keyed by instance. */
  presentations: Record<string, CardPresentation>;
  inspectedCardId?: string | null;
  requirementAssessment?: CardRequirementAssessment;
  onInspect?: (id: string | null) => void;
  actionPanel?: ReactNode;
  activeCardId?: string | null;
  disabled?: boolean;
  playerNames?: readonly [string, string];
  playerFlair?: readonly [PublicFlair | undefined, PublicFlair | undefined];
  synergy?: PlayerSynergyPresentation[];
  connectionStatus?: ReactNode;
  cardListsVisible?: boolean;
  fitViewport?: boolean;
  onCloseCardLists?: () => void;
  actionCues?: Readonly<Record<string, CardActionCue>>;
  onAnchorLayout?: BoardAnchorListener;
  compactHand?: boolean;
}) {
  const canvasHost = useRef<HTMLDivElement>(null);
  const boardRenderer = useRef<BoardCanvasRenderer | null>(null);
  const inspectionTrigger = useRef<HTMLElement | null>(null);
  const [canvasFailed, setCanvasFailed] = useState(false);
  const [detailsVisible, setDetailsVisible] = useState(true);
  const [cacheHidden, setCacheHidden] = useState(false);
  const showCacheButton = useRef<HTMLButtonElement>(null);
  const [enlargedCardId, setEnlargedCardId] = useState<string | null>(null);
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const [focusedHandCardId, setFocusedHandCardId] = useState<string | null>(
    null,
  );
  const [highlightedPanelControl, setHighlightedPanelControl] = useState<
    string | null
  >(null);
  const [openResourceSeats, setOpenResourceSeats] = useState<number[]>([]);
  const updateResourceOpen = useCallback((seat: number, open: boolean) => {
    setOpenResourceSeats((current) =>
      current.includes(seat) === open
        ? current
        : open
          ? [...current, seat]
          : current.filter((value) => value !== seat),
    );
  }, []);
  const [openRamStackKey, setOpenRamStackKey] = useState<string | null>(null);
  const [ramQuantityStackKey, setRamQuantityStackKey] = useState<string | null>(
    null,
  );
  const [ramQuantity, setRamQuantity] = useState(1);
  const [playerPanelPlacements, setPlayerPanelPlacements] = useState<
    readonly {
      seat: 0 | 1;
      x: number;
      y: number;
      width: number;
      height: number;
      scale: number;
      nameX: number;
      nameY: number;
    }[]
  >([]);
  const [cacheEndpointPlacements, setCacheEndpointPlacements] = useState<
    Readonly<Record<string, { x: number; y: number }>>
  >({});
  const [cacheIntentLines, setCacheIntentLines] = useState<
    import("./board-canvas").ViewportIntent[]
  >([]);
  const updateIntentLayout = useCallback(
    (next: import("./board-canvas").ViewportIntent[]) => {
      setCacheIntentLines((current) =>
        JSON.stringify(current) === JSON.stringify(next) ? current : next,
      );
    },
    [],
  );
  const [panelEndpointPlacements, setPanelEndpointPlacements] = useState<
    Readonly<Record<string, { x: number; y: number }>>
  >({});
  const updateCacheEndpointPlacements = useCallback(
    (next: Readonly<Record<string, { x: number; y: number }>>) =>
      setCacheEndpointPlacements((current) =>
        JSON.stringify(current) === JSON.stringify(next) ? current : next,
      ),
    [],
  );
  const updatePanelEndpointPlacements = useCallback(
    (next: Readonly<Record<string, { x: number; y: number }>>) =>
      setPanelEndpointPlacements((current) =>
        JSON.stringify(current) === JSON.stringify(next) ? current : next,
      ),
    [],
  );
  const endpointPlacements = useMemo(
    () => ({ ...panelEndpointPlacements, ...cacheEndpointPlacements }),
    [cacheEndpointPlacements, panelEndpointPlacements],
  );
  const updatePlayerPanelPlacements = useCallback(
    (
      next: readonly {
        seat: 0 | 1;
        x: number;
        y: number;
        width: number;
        height: number;
        scale: number;
        nameX: number;
        nameY: number;
      }[],
    ) =>
      setPlayerPanelPlacements((current) =>
        JSON.stringify(current) === JSON.stringify(next) ? current : next,
      ),
    [],
  );
  const closeInspection = useCallback(() => {
    setHoveredCardId(null);
    setEnlargedCardId(null);
    onInspect?.(null);
    queueMicrotask(() => inspectionTrigger.current?.focus());
  }, [onInspect]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && inspectedCardId) closeInspection();
    };
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("keydown", escape);
    };
  }, [closeInspection, inspectedCardId]);
  const interaction = useBoardInteraction();
  const picker = disabled ? null : interaction?.picker;
  const clickRef = useRef<(id: string) => void>(() => {});
  clickRef.current = (id) => {
    setHoveredCardId(null);
    if (id.startsWith("gear-port:")) {
      const [hostId, port] = JSON.parse(id.slice("gear-port:".length)) as [
        string,
        string,
      ];
      if (port.startsWith("program:") && picker?.candidates.includes(hostId)) {
        interaction?.setProgramSlot(id);
        picker.choose(hostId);
        return;
      }
    }
    if (picker) {
      if (picker.candidates.includes(id)) picker.choose(id);
    } else if (!id.startsWith("gear-port:")) {
      if (inspectedCardId === id) closeInspection();
      else onInspect?.(id);
    }
  };
  const selectCard = useCallback((id: string) => clickRef.current(id), []);
  const previewCard = useCallback(
    (hovered: { id: string } | null) =>
      setHoveredCardId(inspectedCardId ? null : (hovered?.id ?? null)),
    [inspectedCardId],
  );
  useEffect(() => {
    if (inspectedCardId) setHoveredCardId(null);
  }, [inspectedCardId]);
  const candidateKey = JSON.stringify(picker?.candidates ?? []);
  const chosenKey = JSON.stringify([
    ...(interaction?.decoration.selected ?? []),
    ...(picker?.selected ?? []),
    ...(interaction?.programSlot ? [interaction.programSlot] : []),
  ]);
  const combatLinks =
    view.combat && !["damage-applied", "end"].includes(view.combat.stage)
      ? (view.combat.blockers ?? []).map((link) => ({
          from: link.blockerId,
          to: link.attackerId,
          kind: "assignment" as const,
          label: "Blocks",
        }))
      : [];
  const pendingActions = useMemo(
    () =>
      view.priority
        ? [
            ...view.priority.stack,
            ...(view.priority.resolving ? [view.priority.resolving] : []),
          ]
        : [],
    [view.priority],
  );
  const zones = useMemo(
    () => boardZones(view, playerNames),
    [view, playerNames],
  );
  const cards = zones.flatMap((zone) => zone.cards);
  const cacheEntries = [
    ...[...pendingActions].reverse().map((action) => ({
      endpointId: `cache-action:${action.id}`,
      card: cards.find((card) => card.instanceId === action.sourceId),
    })),
    ...view.cache
      .filter(
        (card) =>
          !pendingActions.some((action) => action.sourceId === card.instanceId),
      )
      .map((card) => ({
        endpointId: `cache-card:${card.instanceId}`,
        card,
      })),
  ];
  const nextProtocolPort = (mainframeId: string) => {
    const occupied = cards.filter((card) =>
      card.attachments.some(
        (attachment) =>
          attachment.kind === "protocol" && attachment.hostId === mainframeId,
      ),
    ).length;
    return gearPortChoiceId(mainframeId, `program:${Math.min(occupied, 2)}`);
  };
  useEffect(() => {
    if (!pendingActions.length && !view.cache.length) setCacheHidden(false);
  }, [pendingActions.length, view.cache.length]);
  const cacheLinks: BoardIntentLink[] = pendingActions.flatMap((action) =>
    action.sourceId
      ? action.targets.map((target) => ({
          from: `cache-action:${action.id}`,
          to:
            target.type === "object"
              ? target.port
                ? gearPortChoiceId(target.id, target.port)
                : target.group === "Mainframe attachment"
                  ? nextProtocolPort(target.id)
                  : target.id
              : target.type === "player"
                ? `player:${target.player}`
                : `cache-action:${target.id}`,
          label: target.group,
          kind: "target" as const,
        }))
      : [],
  );
  const draftLinks = (interaction?.decoration.links ?? []).map((link) => ({
    ...link,
    draft: true,
  }));
  const linksKey = JSON.stringify([
    ...new Map(
      [...combatLinks, ...draftLinks, ...cacheLinks].map((link) => [
        link.from + ":" + link.to,
        link,
      ]),
    ).values(),
  ]);
  useEffect(() => {
    setHoveredCardId((current) =>
      current &&
      zones.some((zone) =>
        zone.cards.some((card) => card.instanceId === current),
      )
        ? current
        : null,
    );
  }, [zones]);
  const ramStacks = useMemo(() => ramStackGroups(zones), [zones]);
  const openRamStack = ramStacks.find((stack) => stack.key === openRamStackKey);
  const browserCards = openRamStack?.hostId
    ? ramStacks
        .filter((stack) => stack.hostId === openRamStack.hostId)
        .flatMap((stack) => stack.cards)
    : (openRamStack?.cards ?? []);
  useEffect(() => {
    if (!openRamStack) setOpenRamStackKey(null);
  }, [openRamStack]);
  const expandedRamKey = "[]";
  const toggleRamStack = useCallback((key: string) => {
    setHoveredCardId(null);
    setOpenRamStackKey(key);
  }, []);
  const toggleRamStackFromBoard = useCallback(
    (key: string) => {
      const stack = ramStacks.find((item) => item.key === key);
      if (
        picker?.label === "Force quit" &&
        stack?.cards.some((card) => picker.candidates.includes(card.instanceId))
      ) {
        const eligible = stack.cards.filter((card) =>
          picker.candidates.includes(card.instanceId),
        );
        const currentlySelected = eligible.filter((card) =>
          picker.selected.includes(card.instanceId),
        ).length;
        setRamQuantity(currentlySelected || 1);
        setRamQuantityStackKey(key);
        return;
      }
      toggleRamStack(key);
    },
    [picker, ramStacks, toggleRamStack],
  );
  const ramQuantityStack = ramStacks.find(
    (stack) => stack.key === ramQuantityStackKey,
  );
  const ramQuantityCandidates =
    picker?.label === "Force quit" && ramQuantityStack
      ? ramQuantityStack.cards.filter((card) =>
          picker.candidates.includes(card.instanceId),
        )
      : [];
  useEffect(() => {
    if (
      picker?.label !== "Force quit" ||
      !ramQuantityStack ||
      ramQuantityCandidates.length === 0
    )
      setRamQuantityStackKey(null);
  }, [picker?.label, ramQuantityCandidates.length, ramQuantityStack]);
  const displayedCardId = inspectedCardId ?? hoveredCardId;
  const card = cards.find((item) => item.instanceId === displayedCardId);
  const details = card ? presentationFor(card, presentations) : null;
  const resourcePlayer = view.players.find((player) => player.mainframe.some((mainframe) => mainframe.instanceId === card?.instanceId));
  const mainframeResources = resourcePlayer ? (
    <section aria-label="Mainframe resources" style={{ width: "100%", fontSize: 14 }}>
      <strong>Resources</strong>
      <dl>
        <dt>Ready RAM</dt><dd>{resourcePlayer.ramBank.filter((ram) => !ram.running && !ram.attachments.length).length}</dd>
        <dt>Running RAM</dt><dd>{resourcePlayer.ramBank.filter((ram) => ram.running && !ram.attachments.length).length}</dd>
        <dt>Committed</dt><dd>{cards.filter((item) => item.controller === resourcePlayer.seat && item.attachments.some((attachment) => attachment.kind === "ram")).length}</dd>
        <dt>Cyberdeck</dt><dd>{resourcePlayer.cyberdeckTop ? <button type="button" aria-label={`Cyberdeck ${resourcePlayer.cyberdeckCount}, inspect ${presentationFor(resourcePlayer.cyberdeckTop, presentations).name}`} onClick={() => onInspect?.(resourcePlayer.cyberdeckTop!.instanceId)}>{resourcePlayer.cyberdeckCount}</button> : resourcePlayer.cyberdeckCount}</dd>
        <dt>RAM deck</dt><dd>{resourcePlayer.ramDeckCount}</dd>
      </dl>
    </section>
  ) : null;
  const persistentInspection = card?.instanceId === inspectedCardId;
  useEffect(() => {
    if (
      enlargedCardId &&
      (card?.instanceId !== enlargedCardId || !details?.artworkUrl)
    )
      setEnlargedCardId(null);
  }, [card?.instanceId, details?.artworkUrl, enlargedCardId]);
  const boardState = useMemo<BoardCanvasState>(
    () => ({
      onAnchorLayout,
      compactHand,
      fitViewport,
      phaseAnnouncement: phaseAnnouncement(view),
      actionCues: picker ? {} : actionCues,
      zones,
      presentations,
      selected: inspectedCardId ?? null,
      previewedCardId: focusedHandCardId ?? hoveredCardId,
      inspect: selectCard,
      seat: view.seat,
      candidates: JSON.parse(candidateKey),
      chosen: JSON.parse(chosenKey),
      descriptions: Object.fromEntries(
        zones.flatMap((zone) =>
          zone.cards.map((card) => [
            card.instanceId,
            cardChoiceLabel(view, presentations, card.instanceId),
          ]),
        ),
      ),
      hover: previewCard,
      activeCardId,
      assignments: JSON.parse(linksKey),
      combatRoles:
        view.combat && !["damage-applied", "end"].includes(view.combat.stage)
          ? Object.fromEntries([
              ...(view.combat.attackers ?? []).map(
                (id) => [id, "Attacking"] as const,
              ),
              ...(view.combat.blockers ?? []).map(
                (link) => [link.blockerId, "Blocking"] as const,
              ),
            ])
          : {},
      endpointPlacements,
      cacheEntries,
      onIntentLayout: updateIntentLayout,
      playerPanels: view.players.map((player) => ({
        seat: player.seat,
        name:
          playerNames?.[player.seat] ??
          (player.seat === view.seat ? "You" : "Opponent"),
        title: playerFlair?.[player.seat]?.title ?? null,
        badge: null,
        active: player.seat === view.turn.activePlayer,
        mainframeHealth: player.mainframeHealth,
        bioframeHealth: player.bioframeHealth,
        readyRam: player.ramBank.filter(
          (ram) => !ram.running && !ram.attachments.length,
        ).length,
        runningRam: player.ramBank.filter(
          (ram) => ram.running && !ram.attachments.length,
        ).length,
        committedRam: cards.filter(
          (card) =>
            card.controller === player.seat &&
            card.attachments.some((attachment) => attachment.kind === "ram"),
        ).length,
        cyberdeckCount: player.cyberdeckCount,
        ramDeckCount: player.ramDeckCount,
        recycleCount: player.recycleBin.length,
        purgeCount: player.purge.length,
        tiers: synergy.find((item) => item.seat === player.seat)?.tiers ?? [],
      })),
      highlightedPanelControl,
      openResourceSeats,
      cacheHidden,
      expandedRamStacks: JSON.parse(expandedRamKey),
      toggleRamStack: toggleRamStackFromBoard,
      forceQuit: picker?.label === "Force quit",
      onPlayerPanelLayout: updatePlayerPanelPlacements,
    }),
    [
      onAnchorLayout,
      compactHand,
      zones,
      presentations,
      inspectedCardId,
      actionCues,
      picker,
      hoveredCardId,
      fitViewport,
      focusedHandCardId,
      selectCard,
      view,
      candidateKey,
      chosenKey,
      previewCard,
      activeCardId,
      linksKey,
      pendingActions,
      endpointPlacements,
      cacheHidden,
      expandedRamKey,
      toggleRamStackFromBoard,
      picker?.label,
      updatePlayerPanelPlacements,
      updateIntentLayout,
      playerNames,
      playerFlair,
      synergy,
      highlightedPanelControl,
      openResourceSeats,
    ],
  );
  const boardStateRef = useRef(boardState);
  boardStateRef.current = boardState;
  useEffect(() => {
    const controller = new AbortController();
    const host = canvasHost.current;
    if (host) {
      setCanvasFailed(false);
      void import("./board-canvas.js")
        .then(({ mountBoardCanvas }) => {
          if (!controller.signal.aborted)
            return mountBoardCanvas(
              host,
              controller.signal,
              boardStateRef.current,
            );
        })
        .then((renderer) => {
          if (!renderer) return;
          if (controller.signal.aborted) renderer.dispose();
          else {
            boardRenderer.current = renderer;
            renderer.update(boardStateRef.current);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) setCanvasFailed(true);
        });
    }
    return () => {
      boardRenderer.current = null;
      controller.abort();
    };
  }, []);
  useEffect(() => {
    try {
      boardRenderer.current?.update(boardState);
    } catch {
      boardRenderer.current?.dispose();
      boardRenderer.current = null;
      setCanvasFailed(true);
    }
  }, [boardState]);
  const describe = (id: string) => {
    const target = cards.find((item) => item.instanceId === id);
    return target
      ? presentationFor(target, presentations).name
      : "Unavailable card";
  };
  const describeEndpoint = (id: string) => {
    if (id.startsWith("player:"))
      return (
        playerNames?.[Number(id.slice(7)) as 0 | 1] ??
        (Number(id.slice(7)) === view.seat ? "You" : "Your opponent")
      );
    if (id.startsWith("cache-action:")) {
      const action = pendingActions.find(
        (item) => item.id === id.slice("cache-action:".length),
      );
      return action?.sourceId
        ? describe(action.sourceId)
        : "Unavailable effect";
    }
    if (id.startsWith("gear-port:")) {
      try {
        const [hostId, port] = JSON.parse(id.slice("gear-port:".length)) as [
          string,
          string,
        ];
        return `${describe(hostId)} ${
          port.startsWith("program:")
            ? `protocol port ${Number(port.slice("program:".length)) + 1}`
            : port
        }`;
      } catch {
        return "Unavailable attachment port";
      }
    }
    return describe(id);
  };
  const cardActions = persistentInspection && actionPanel && (
    <div className={styles.cardPopoverActions}>
      <strong>Actions</strong>
      {actionPanel}
    </div>
  );
  return (
    <section
      className={`${styles.battlefield} ${fitViewport ? styles.viewport : ""}`}
      aria-label="Neuroscape battlefield"
    >
      {!cacheHidden && (view.cache.length > 0 || pendingActions.length > 0) && (
        <CacheBrowser
          intentLines={cacheIntentLines}
          cards={view.cache}
          visibleCards={cards}
          actions={pendingActions}
          presentations={presentations}
          candidates={picker?.candidates}
          onEndpointLayout={updateCacheEndpointPlacements}
          onHide={() => {
            setCacheHidden(true);
            requestAnimationFrame(() => showCacheButton.current?.focus());
          }}
          onChoose={(id) => {
            setHoveredCardId(null);
            if (picker) {
              setCacheHidden(true);
              selectCard(id);
            } else onInspect?.(id);
          }}
        />
      )}
      {openRamStack && browserCards.length > 0 && (
        <RamStackBrowser
          cards={browserCards}
          presentations={presentations}
          selected={picker?.selected ?? []}
          candidates={picker?.candidates}
          onClose={() => setOpenRamStackKey(null)}
          onChoose={(id) => {
            if (picker) picker.choose(id);
            else {
              setOpenRamStackKey(null);
              onInspect?.(id);
            }
          }}
        />
      )}
      {card &&
        details &&
        createPortal(
          <div
            className={`${styles.cardPopover} ${
              detailsVisible ? "" : styles.cardPopoverCollapsed
            } ${!details.artworkUrl ? styles.cardPopoverNoArtwork : ""} ${
              picker ? styles.cardPopoverSelecting : ""
            } ${persistentInspection ? "" : styles.cardPopoverTransient}`}
            role="dialog"
            aria-label="Card popover"
            data-inspected-card={card.instanceId}
            aria-modal="false"
            inert={picker || !persistentInspection ? true : undefined}
          >
            <div className={styles.cardPopoverHeader}>
              <strong className={styles.cardPopoverTitle}>
                {details.name}
              </strong>
              <button
                type="button"
                className={styles.cardPopoverToggle}
                aria-expanded={detailsVisible}
                aria-label={
                  detailsVisible ? "Hide card details" : "Show card details"
                }
                title={
                  detailsVisible ? "Hide card details" : "Show card details"
                }
                onClick={() => setDetailsVisible((visible) => !visible)}
              >
                <ChevronRight size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={styles.cardPopoverClose}
                aria-label="Close card popover"
                onClick={closeInspection}
              >
                ×
              </button>
            </div>
            {(details.artworkUrl || mainframeResources) && (
              <div className={styles.cardPopoverArtwork}>
                {details.artworkUrl && <div className={styles.cardPopoverArtworkFrame}>
                  <img
                    key={details.artworkUrl}
                    src={details.artworkUrl}
                    alt={details.name}
                    onError={(event) => {
                      event.currentTarget.hidden = true;
                    }}
                  />
                  <button
                    type="button"
                    className={styles.cardPopoverEnlarge}
                    aria-label={`Enlarge ${details.name} image`}
                    title="Enlarge card image"
                    onClick={() => setEnlargedCardId(card.instanceId)}
                  >
                    <Maximize2 size={18} aria-hidden="true" />
                  </button>
                </div>}
                {mainframeResources}
                {details.customTokenArtwork && <small>Custom token artwork · not official</small>}
                <ReservedRamChips
                  card={card}
                  visibleCards={cards}
                  presentations={presentations}
                  onInspect={(id) => onInspect?.(id)}
                  className={styles.reservedRamChips}
                />
                {cardActions}
              </div>
            )}
            {enlargedCardId === card.instanceId && details.artworkUrl && (
              <CardImageViewer
                name={details.name}
                onClose={() => setEnlargedCardId(null)}
              >
                <img
                  className="card-art"
                  src={details.artworkUrl}
                  alt={details.name}
                  referrerPolicy="no-referrer"
                  onError={() => setEnlargedCardId(null)}
                />
              </CardImageViewer>
            )}
            {detailsVisible && (
              <div className={styles.cardPopoverState}>
                {actionCues[card.instanceId] && !picker && (
                  <p>{cardActionCueLabels[actionCues[card.instanceId]]}</p>
                )}
                {!details.artworkUrl && <p>No artwork available.</p>}
                {!details.artworkUrl && (
                  <>
                    <ReservedRamChips
                      card={card}
                      visibleCards={cards}
                      presentations={presentations}
                      onInspect={(id) => onInspect?.(id)}
                      className={styles.reservedRamChips}
                    />
                    {cardActions}
                  </>
                )}
                <CurrentCardState
                  card={card}
                  protocolPortsClassName={tableStyles.popoverProtocolPorts}
                  isMainframe={view.players.some((player) =>
                    player.mainframe.some(
                      (item) => item.instanceId === card.instanceId,
                    ),
                  )}
                  onInspect={persistentInspection ? onInspect : undefined}
                  presentation={details}
                  visibleCards={cards}
                  describe={describe}
                />
                {persistentInspection && requirementAssessment && (
                  <RequirementFeedback
                    assessment={requirementAssessment}
                    className={styles.requirementFeedback}
                  />
                )}
              </div>
            )}
          </div>,
          document.body,
        )}

      {picker && (
        <div
          className={styles.selection}
          role="status"
        >
          {picker.label} — click a highlighted card. {picker.selected.length}
          {picker.required === undefined
            ? ""
            : `/${picker.required}`} selected.{" "}
        </div>
      )}
      {picker?.label === "Force quit" && (
        <div
          className={styles.forceQuitControls}
          role="group"
          aria-label="Force Quit object controls"
        >
          {ramStacks
            .filter(
              (stack) =>
                stack.cards.length > 1 &&
                stack.cards.some((item) =>
                  picker.candidates.includes(item.instanceId),
                ),
            )
            .map((stack) => {
              const eligible = stack.cards.filter((item) =>
                picker.candidates.includes(item.instanceId),
              );
              const selected = eligible.filter((item) =>
                picker.selected.includes(item.instanceId),
              ).length;
              return (
                <button
                  type="button"
                  key={stack.key}
                  aria-pressed={selected > 0}
                  onClick={() => toggleRamStackFromBoard(stack.key)}
                >
                  × {describe(eligible[0].instanceId)} ×{eligible.length}
                  {selected ? ` · ${selected} selected` : ""}
                </button>
              );
            })}
          {picker.candidates
            .filter(
              (id) =>
                !ramStacks.some(
                  (stack) =>
                    stack.cards.length > 1 &&
                    stack.cards.some((item) => item.instanceId === id),
                ),
            )
            .map((id) => (
              <button
                type="button"
                key={id}
                aria-label={`Force quit ${describe(id)}`}
                aria-pressed={picker.selected.includes(id)}
                onClick={() => picker.choose(id)}
              >
                × {describe(id)}
              </button>
            ))}
        </div>
      )}
      {picker?.label === "Force quit" && ramQuantityCandidates.length > 0 && (
        <div
          className={styles.ramQuantity}
          role="dialog"
          aria-label="Force quit RAM quantity"
        >
          <strong>
            Force quit how many{" "}
            {ramQuantityStack?.running ? "running" : "refreshed"} RAM?
          </strong>
          <div className={styles.ramQuantityControls}>
            <button
              type="button"
              aria-label="Decrease RAM quantity"
              disabled={ramQuantity === 0}
              onClick={() =>
                setRamQuantity((amount) => Math.max(0, amount - 1))
              }
            >
              −
            </button>
            <input
              type="number"
              aria-label="RAM quantity"
              min={0}
              max={ramQuantityCandidates.length}
              step={1}
              value={ramQuantity}
              onChange={(event) =>
                setRamQuantity(
                  Math.max(
                    0,
                    Math.min(
                      ramQuantityCandidates.length,
                      Math.trunc(Number(event.target.value) || 0),
                    ),
                  ),
                )
              }
            />
            <button
              type="button"
              aria-label="Increase RAM quantity"
              disabled={ramQuantity === ramQuantityCandidates.length}
              onClick={() =>
                setRamQuantity((amount) =>
                  Math.min(ramQuantityCandidates.length, amount + 1),
                )
              }
            >
              +
            </button>
            <button
              type="button"
              onClick={() => {
                const desired = new Set(
                  ramQuantityCandidates
                    .slice(0, ramQuantity)
                    .map((card) => card.instanceId),
                );
                for (const card of ramQuantityCandidates)
                  if (
                    picker.selected.includes(card.instanceId) !==
                    desired.has(card.instanceId)
                  )
                    picker.choose(card.instanceId);
                setRamQuantityStackKey(null);
              }}
            >
              {ramQuantity === 0
                ? "Select none"
                : `Force quit ${ramQuantity} RAM`}
            </button>
            <button type="button" onClick={() => setRamQuantityStackKey(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <ul
        className={styles.intentDescriptions}
        aria-label="Visible board connections"
      >
        {JSON.parse(linksKey).map((link: BoardIntentLink, index: number) => (
          <li key={`${link.from}:${link.to}:${index}`}>
            {link.draft ? "Draft: " : "Committed or pending: "}
            {describeEndpoint(link.from)} {link.label ?? "connects to"}{" "}
            {describeEndpoint(link.to)}
          </li>
        ))}
      </ul>
      <div className={styles.columns}>
        <div>
          {canvasFailed && (
            <p role="status">
              The canvas is unavailable. Use the card lists below to inspect the
              battlefield.
            </p>
          )}
          <div className={styles.canvasFrame}>
            <div ref={canvasHost} className={styles.canvas} />
            {cacheHidden &&
              (view.cache.length > 0 || pendingActions.length > 0) && (
                <div className={styles.cacheControls}>
                  <button
                    type="button"
                    aria-expanded={!cacheHidden}
                    ref={showCacheButton}
                    aria-label={cacheHidden ? "Show Cache" : "Hide Cache"}
                    onClick={() => {
                      setHoveredCardId(null);
                      if (
                        view.cache.some(
                          (item) => item.instanceId === inspectedCardId,
                        )
                      )
                        closeInspection();
                      setCacheHidden((hidden) => !hidden);
                    }}
                  >
                    Show Cache ·{" "}
                    {pendingActions.length +
                      view.cache.filter(
                        (card) =>
                          !pendingActions.some(
                            (action) => action.sourceId === card.instanceId,
                          ),
                      ).length}
                  </button>
                </div>
              )}
            <GameStatus
              view={view}
              presentations={presentations}
              synergy={synergy}
              connectionStatus={connectionStatus}
              playerNames={playerNames}
              playerFlair={playerFlair}
              onInspect={(id) => onInspect?.(id)}
              placements={playerPanelPlacements}
              onPreview={previewCard}
              onControlHighlight={setHighlightedPanelControl}
              onResourcesToggle={updateResourceOpen}
              onEndpointLayout={updatePanelEndpointPlacements}
              intentEndpoints={cacheLinks.map((link) => link.to)}
            />
          </div>
          <details
            className={styles.cardLists}
            hidden={!cardListsVisible && !canvasFailed}
            open={canvasFailed || undefined}
          >
            <summary>Card lists & all discard piles</summary>
            {onCloseCardLists && !canvasFailed && (
              <button type="button" onClick={onCloseCardLists}>
                Close card lists
              </button>
            )}
            <div className={styles.zones} aria-label="Battlefield card lists">
              {zones.map((zone) => (
                <details
                  key={zone.id}
                  open={
                    zone.id.endsWith(":arena") ||
                    zone.id === `${view.seat}:hand`
                  }
                >
                  <summary>
                    {zone.label} ({zone.hiddenCount ?? zone.cards.length})
                  </summary>
                  {zone.hiddenCount !== undefined && !zone.cards.length ? (
                    <p>{zone.hiddenCount} hidden cards</p>
                  ) : zone.cards.length ? (
                    <ul>
                      {zone.cards.map((item, index) => (
                        <li key={item.instanceId}>
                          <button
                            type="button"
                            aria-pressed={
                              item.instanceId === activeCardId ||
                              picker?.selected.includes(item.instanceId) ||
                              interaction?.decoration.selected.includes(
                                item.instanceId,
                              ) ||
                              item.instanceId === inspectedCardId
                            }
                            aria-expanded={item.instanceId === inspectedCardId}
                            title={
                              actionCues[item.instanceId]
                                ? cardActionCueLabels[
                                    actionCues[item.instanceId]
                                  ]
                                : "Inspect card"
                            }
                            aria-description={
                              picker?.candidates.includes(item.instanceId)
                                ? "Valid target"
                                : actionCues[item.instanceId]
                                  ? cardActionCueLabels[
                                      actionCues[item.instanceId]
                                    ]
                                  : "Inspect card"
                            }
                            data-board-card={item.instanceId}
                            data-candidate={
                              picker?.candidates.includes(item.instanceId) ||
                              undefined
                            }
                            onClick={(event) => {
                              inspectionTrigger.current = event.currentTarget;
                              selectCard(item.instanceId);
                            }}
                            onMouseEnter={() =>
                              previewCard({ id: item.instanceId })
                            }
                            onFocus={() => {
                              if (zone.id === `${view.seat}:hand`)
                                setFocusedHandCardId(item.instanceId);
                            }}
                            onBlur={() =>
                              setFocusedHandCardId((current) =>
                                current === item.instanceId ? null : current,
                              )
                            }
                            onMouseLeave={() =>
                              setHoveredCardId((current) =>
                                current === item.instanceId ? null : current,
                              )
                            }
                          >
                            {index + 1}.{" "}
                            {cardChoiceLabel(
                              view,
                              presentations,
                              item.instanceId,
                            )}
                            {item.running &&
                            !zone.id.endsWith(":ram") &&
                            !item.attachments.some(
                              (link) => link.kind === "ram",
                            )
                              ? " · Running"
                              : ""}
                            {item.abilitySpent ? " · Spent" : ""}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>Empty</p>
                  )}
                </details>
              ))}
            </div>
          </details>
        </div>
      </div>
    </section>
  );
}
