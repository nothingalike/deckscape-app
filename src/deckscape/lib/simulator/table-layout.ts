import type {
  BoardZone,
  VisibleBoardCard,
  CardPresentation,
} from "./board-view";
import { characterCluster } from "./character-cluster";
import { gearPortChoiceId } from "./gear-port-choice";

export const TABLE_WIDTH = 1200;
// Temporary layout preview requested by the user; zone data is unchanged.
export const SHOW_TABLE_UTILITIES = true;
export const TABLE_CARD_WIDTH = 92;
export const TABLE_CARD_HEIGHT = 130;
export type TablePlacement = {
  formationScale?: number;
  card: VisibleBoardCard;
  x: number;
  y: number;
  width: number;
  height: number;
  compact?: boolean;
  iconLabel?: string;
  hand?: boolean;
  handHitWidth?: number;
  tapped?: boolean;
  tetherBadge?: string;
  ramStack?: {
    key: string;
    count: number;
    memberIds: string[];
    expanded: boolean;
    index: number;
  };
  reservedRam?: {
    count: number;
    memberIds: string[];
    stackKeys: string[];
    expanded: boolean;
  };
};
export type RamStackGroup = {
  key: string;
  zoneId: string;
  hostId: string | null;
  cards: VisibleBoardCard[];
  running: boolean;
};
export type TableArea = {
  zone: BoardZone;
  x: number;
  y: number;
  width: number;
  height: number;
  frameless?: boolean;
  overlay?: boolean;
  cards: TablePlacement[];
  slots: {
    x: number;
    y: number;
    size: number;
    label: string;
    hostId: string;
    port: string;
  }[];
};

function sortedValues(value: Record<string, number> | undefined) {
  return Object.entries(value ?? {})
    .filter(([, amount]) => amount !== 0)
    .sort(([left], [right]) => left.localeCompare(right));
}

function ramStackIdentity(
  zoneId: string,
  card: VisibleBoardCard,
  hostId: string | null,
) {
  if (zoneId.endsWith(":ram"))
    return hostId === null
      ? JSON.stringify([zoneId, card.running])
      : JSON.stringify([zoneId, hostId, card.running]);
  return JSON.stringify([
    zoneId,
    hostId,
    card.definitionVersion ?? card.instanceId,
    card.running,
    card.abilitySpent,
    sortedValues(card.damage),
    sortedValues(card.counters),
  ]);
}

/** Conservative visual groups only; every member keeps its projected instance identity. */
export function ramStackGroups(zones: readonly BoardZone[]): RamStackGroup[] {
  const groups = new Map<string, RamStackGroup>();
  for (const zone of zones)
    for (const card of zone.cards) {
      const ramLink = card.attachments.find((link) => link.kind === "ram");
      if (!zone.id.endsWith(":ram") && !ramLink) continue;
      const hostId = ramLink?.hostId ?? null;
      const key = ramStackIdentity(zone.id, card, hostId);
      const group = groups.get(key);
      if (group) group.cards.push(card);
      else
        groups.set(key, {
          key,
          zoneId: zone.id,
          hostId,
          cards: [card],
          running: card.running,
        });
    }
  return [...groups.values()];
}

/** Visual grouping only; the participant projection and command identities stay unchanged. */
export function layoutTable(
  zones: readonly BoardZone[],
  seat: 0 | 1,
  width = TABLE_WIDTH,
  presentations: Readonly<Record<string, CardPresentation>> = {},
  expandedRamStacks: ReadonlySet<string> = new Set(),
  candidates: ReadonlySet<string> = new Set(),
  minimumPanelHeight = 240,
) {
  width = Math.max(TABLE_WIDTH, width);
  const areas: TableArea[] = [];
  const all = zones.flatMap((zone) => zone.cards);
  const mainframes = new Set(
    zones
      .filter((zone) => zone.id.endsWith(":mainframe"))
      .flatMap((zone) => zone.cards.map((card) => card.instanceId)),
  );
  const ramByHost = new Map<string, VisibleBoardCard[]>();
  const gearByHost = new Map<string, VisibleBoardCard[]>();
  const programsByHost = new Map<string, VisibleBoardCard[]>();
  const ramGroupByCard = new Map(
    ramStackGroups(zones).flatMap((group) =>
      group.cards.map((card) => [card.instanceId, group] as const),
    ),
  );
  const ramDisplays = (
    cards: readonly VisibleBoardCard[],
    includeCollapsed = true,
  ) => {
    const seen = new Set<string>();
    return cards.flatMap((card) => {
      const group = ramGroupByCard.get(card.instanceId);
      if (!group || seen.has(group.key)) return [];
      seen.add(group.key);
      const expanded = expandedRamStacks.has(group.key);
      const visible = expanded
        ? group.cards
        : includeCollapsed
          ? group.cards.slice(0, 1)
          : [];
      return visible.map((member, index) => ({
        card: member,
        stack: {
          key: group.key,
          count: group.cards.length,
          memberIds: group.cards.map((item) => item.instanceId),
          expanded,
          index,
        },
      }));
    });
  };
  const reservedRamBadge = (cards: readonly VisibleBoardCard[]) => {
    const groups = [
      ...new Map(
        cards.flatMap((card) => {
          const group = ramGroupByCard.get(card.instanceId);
          return group ? [[group.key, group] as const] : [];
        }),
      ).values(),
    ];
    return groups.length
      ? {
          count: groups.reduce((total, group) => total + group.cards.length, 0),
          memberIds: groups.flatMap((group) =>
            group.cards.map((card) => card.instanceId),
          ),
          stackKeys: groups.map((group) => group.key),
          expanded: groups.every((group) => expandedRamStacks.has(group.key)),
        }
      : undefined;
  };
  const isCharacter = (card: VisibleBoardCard) =>
    !!card.definitionVersion &&
    presentations[card.instanceId]?.attack !== undefined;
  const grouped = new Set<string>();
  const sharedGear = all
    .filter(
      (card) =>
        card.attachments.filter((link) => link.kind === "gear").length > 1,
    )
    .map((card) => card.instanceId)
    .sort();
  for (const card of all) {
    const gearLinks = card.attachments.filter((link) => link.kind === "gear");
    if (
      gearLinks.length > 1 &&
      gearLinks.every(
        (link) =>
          link.port &&
          all.some(
            (host) =>
              host.instanceId === link.hostId &&
              isCharacter(host) &&
              !host.attachments.some(
                (item) => item.kind === "ram" || item.kind === "gear",
              ),
          ),
      )
    ) {
      for (const link of gearLinks)
        gearByHost.set(link.hostId, [
          ...(gearByHost.get(link.hostId) ?? []),
          card,
        ]);
      grouped.add(card.instanceId);
      continue;
    }
    const link = card.attachments.find(
      (link) =>
        link.kind === "ram" ||
        (link.kind === "protocol" && mainframes.has(link.hostId)) ||
        (link.kind === "gear" && card.attachments.length === 1 && link.port),
    );
    const host = link && all.find((item) => item.instanceId === link.hostId);
    if (
      !link ||
      !host ||
      host.instanceId === card.instanceId ||
      host.attachments.some(
        (item) => item.kind === "ram" || item.kind === "gear",
      )
    )
      continue;
    // Gear without a visible character host retains its normal zone placement.
    if (link.kind === "gear" && !isCharacter(host)) continue;
    const map =
      link.kind === "ram"
        ? ramByHost
        : link.kind === "gear"
          ? gearByHost
          : programsByHost;
    map.set(link.hostId, [...(map.get(link.hostId) ?? []), card]);
    grouped.add(card.instanceId);
  }
  let y = 8;
  const get = (id: string) => zones.find((zone) => zone.id === id)!;
  function row(
    specs: {
      id: string;
      x: number;
      width: number;
      pile?: boolean;
      hand?: boolean;
      stagger?: boolean;
      minHeight?: number;
      fillRowHeight?: boolean;
      frameless?: boolean;
      insetStart?: number;
      insetEnd?: number;
    }[],
  ) {
    const rows = specs.map((spec) => {
      const zone = get(spec.id);
      const roots = (spec.pile ? zone.cards.slice(-1) : zone.cards).filter(
        (card) => !grouped.has(card.instanceId),
      );
      const cards: TablePlacement[] = [];
      const slots: TableArea["slots"] = [];
      let rowCardStart = 0,
        rowSlotStart = 0;
      const centerRow = () => {
        if (!zone.id.endsWith(":arena") || cards.length === rowCardStart)
          return;
        const free = Math.max(
          0,
          spec.width - 10 - (spec.insetEnd ?? 0) - (x - 12),
        );
        const shift = free / 2;
        for (const card of cards.slice(rowCardStart)) card.x += shift;
        for (const slot of slots.slice(rowSlotStart)) slot.x += shift;
        rowCardStart = cards.length;
        rowSlotStart = slots.length;
      };
      let x = 10 + (spec.insetStart ?? 0),
        top = spec.hand ? 32 : spec.frameless ? 10 : 23,
        rowHeight =
          !roots.length && (zone.id === "environment" || zone.id === "cache")
            ? 62
            : (spec.minHeight ?? TABLE_CARD_HEIGHT);
      const place = (
        card: VisibleBoardCard,
        px: number,
        py: number,
        w: number,
        h: number,
        iconLabel?: string,
        ramStack?: TablePlacement["ramStack"],
        reservedRam?: TablePlacement["reservedRam"],
      ) => {
        const tapped = card.running && !spec.hand && !spec.pile;
        cards.push({
          card,
          x: px,
          y: py,
          width: tapped ? h : w,
          height: tapped ? w : h,
          compact: !!iconLabel,
          iconLabel,
          hand: spec.hand,
          tapped,
          ramStack,
          reservedRam,
          tetherBadge: sharedGear.includes(card.instanceId)
            ? `T${sharedGear.indexOf(card.instanceId) + 1}`
            : undefined,
        });
      };
      if (spec.hand) {
        const faceWidth = 128,
          faceHeight = 181;
        const available = Math.max(faceWidth, spec.width - 20);
        const perRow = Math.max(
          1,
          Math.floor((available - faceWidth) / 44) + 1,
        );
        let bottom = top;
        for (let first = 0; first < roots.length; first += perRow) {
          const batch = roots.slice(first, first + perRow);
          const step =
            batch.length > 1
              ? Math.min(100, (available - faceWidth) / (batch.length - 1))
              : 0;
          const span = faceWidth + step * (batch.length - 1);
          const left = spec.x + (spec.width - span) / 2;
          const rowTop =
            y + top + Math.floor(first / perRow) * (faceHeight + 36);
          batch.forEach((card, index) => {
            const offset =
              batch.length > 1 ? (index / (batch.length - 1)) * 2 - 1 : 0;
            const arc = Math.round(offset * offset * 16);
            place(
              card,
              left + index * step,
              rowTop + arc,
              faceWidth,
              faceHeight,
            );
            cards[cards.length - 1].handHitWidth =
              index === batch.length - 1 ? faceWidth : step;
            bottom = rowTop + arc + faceHeight - y;
          });
        }
        return {
          zone,
          x: spec.x,
          y,
          width: spec.width,
          height: Math.max(top + rowHeight + 5, bottom + 12),
          cards,
          slots,
          frameless: spec.frameless,
        };
      }
      if (zone.id.endsWith(":mainframe")) {
        for (const root of roots) {
          const programs = programsByHost.get(root.instanceId) ?? [];
          const hostWidth = root.running ? 181 : 128;
          const hostHeight = root.running ? 128 : 181;
          place(
            root,
            spec.x + (spec.width - hostWidth) / 2,
            y + top,
            128,
            181,
            undefined,
            undefined,
            reservedRamBadge(ramByHost.get(root.instanceId) ?? []),
          );
          let slotTop = top + hostHeight + 6;
          const slotCount = candidates.has(root.instanceId)
            ? Math.max(3, programs.length + 1)
            : programs.length;
          for (let first = 0; first < slotCount; first += 3) {
            const reservedRows = Math.max(
              0,
              ...programs
                .slice(first, first + 3)
                .map(
                  (program) =>
                    ramDisplays(ramByHost.get(program.instanceId) ?? [], false)
                      .length,
                ),
            );
            for (let column = 0; column < 3; column++) {
              const index = first + column;
              if (index >= slotCount) break;
              const slotX = spec.x + (spec.width - 116) / 2 + column * 40;
              const slotY = y + slotTop;
              slots.push({
                x: slotX,
                y: slotY,
                size: 36,
                label: `P${index + 1}`,
                hostId: root.instanceId,
                port: `program:${index}`,
              });
              const program = programs[index];
              if (!program) continue;
              const reserved = ramByHost.get(program.instanceId) ?? [];
              place(
                program,
                slotX,
                slotY,
                36,
                36,
                "PROGRAM",
                undefined,
                reservedRamBadge(reserved),
              );
              ramDisplays(reserved, false).forEach(
                ({ card: ram, stack }, ramIndex) =>
                  place(
                    ram,
                    slotX,
                    slotY + 40 + ramIndex * 54,
                    36,
                    50,
                    `R${ramIndex + 1}`,
                    stack,
                  ),
              );
            }
            slotTop += 40 + reservedRows * 54;
          }
          rowHeight = slotCount ? slotTop - top : hostHeight;
        }
        return {
          zone,
          x: spec.x,
          y,
          width: spec.width,
          height: top + rowHeight + 5,
          cards,
          slots,
          frameless: spec.frameless,
        };
      }
      if (zone.id.endsWith(":ram")) {
        for (const { card, stack } of ramDisplays(roots)) {
          const cardWidth = card.running ? TABLE_CARD_HEIGHT : TABLE_CARD_WIDTH,
            cardHeight = card.running ? TABLE_CARD_WIDTH : TABLE_CARD_HEIGHT;
          if (x + cardWidth > spec.width - 10 && x > 10) {
            x = 10;
            top += rowHeight + 6;
            rowHeight = cardHeight;
          }
          place(
            card,
            spec.x + x,
            y + top,
            TABLE_CARD_WIDTH,
            TABLE_CARD_HEIGHT,
            undefined,
            stack,
          );
          rowHeight = Math.max(rowHeight, cardHeight);
          x += cardWidth + 8;
        }
        return {
          zone,
          x: spec.x,
          y,
          width: spec.width,
          height: top + rowHeight + 5,
          cards,
          slots,
          frameless: spec.frameless,
        };
      }
      for (const root of roots)
        for (const card of [
          root,
          ...(programsByHost.get(root.instanceId) ?? []),
        ]) {
          const reserved = ramByHost.get(card.instanceId) ?? [];
          const displayedRam = ramDisplays(reserved, false);
          const character = zone.id.endsWith(":arena") && isCharacter(card);
          const characterPorts = ["head", "body", "leftArm", "rightArm"].filter(
            (port) =>
              (gearByHost.get(card.instanceId) ?? []).some((gear) =>
                gear.attachments.some(
                  (link) =>
                    link.hostId === card.instanceId && link.port === port,
                ),
              ) || candidates.has(gearPortChoiceId(card.instanceId, port)),
          ) as import("./character-cluster").CharacterPort[];
          const cluster = character
            ? characterCluster(
                displayedRam.length,
                card.running,
                new Set(characterPorts),
              )
            : null;
          const tapped = card.running && !spec.hand && !spec.pile;
          const faceWidth = zone.id === "cache" ? 140 : TABLE_CARD_WIDTH;
          const faceHeight = zone.id === "cache" ? 198 : TABLE_CARD_HEIGHT;
          const cardWidth = tapped ? faceHeight : faceWidth;
          const groupWidth =
            cluster?.width ??
            cardWidth +
              (displayedRam.length
                ? 58 + 52 * (Math.ceil(displayedRam.length / 2) - 1)
                : 0);
          const groupHeight =
            cluster?.height ??
            Math.max(faceHeight, displayedRam.length > 1 ? 140 : 68);
          if (
            !zone.id.endsWith(":arena") &&
            x + groupWidth > spec.width - 10 - (spec.insetEnd ?? 0) &&
            x > 10 + (spec.insetStart ?? 0)
          ) {
            centerRow();
            x = 10 + (spec.insetStart ?? 0);
            top += rowHeight + 6;
            rowHeight = TABLE_CARD_HEIGHT;
          }
          const px = spec.x + x,
            py = y + top;
          if (cluster) {
            const cx = px + cluster.center.x,
              cy = py + cluster.center.y;
            place(
              card,
              cx,
              cy,
              128,
              181,
              undefined,
              undefined,
              reservedRamBadge(reserved),
            );
            for (const slot of cluster.slots) {
              const gear = (gearByHost.get(card.instanceId) ?? []).find(
                (gear) =>
                  gear.attachments.some(
                    (link) =>
                      link.hostId === card.instanceId &&
                      link.port === slot.port,
                  ),
              );
              slots.push({
                ...slot,
                hostId: card.instanceId,
                x: px + slot.x,
                y: py + slot.y,
              });
              if (gear)
                place(
                  gear,
                  px + slot.x,
                  py + slot.y,
                  slot.size,
                  slot.size,
                  "GEAR",
                );
            }
            displayedRam.forEach(({ card: ram, stack }, index) => {
              const spot = cluster.ram[index];
              place(
                ram,
                px + spot.x,
                py + spot.y,
                spot.width,
                spot.height,
                `R${index + 1}`,
                stack,
              );
            });
          } else {
            place(
              card,
              px,
              py + (spec.stagger ? (roots.indexOf(root) % 2) * 8 : 0),
              faceWidth,
              faceHeight,
              undefined,
              undefined,
              reservedRamBadge(reserved),
            );
            displayedRam.forEach(({ card: ram, stack }, index) =>
              place(
                ram,
                px + cardWidth + 6 + Math.floor(index / 2) * 52,
                py + (index % 2) * 72,
                48,
                68,
                `R${index + 1}`,
                stack,
              ),
            );
          }
          rowHeight = Math.max(rowHeight, groupHeight + (spec.stagger ? 8 : 0));
          x += spec.hand ? 70 : groupWidth + 12;
        }
      centerRow();
      if (zone.id.endsWith(":arena")) {
        // A stable lane decouples character population from the rest of the
        // table's scale. Fit complete clusters, not individual card artwork.
        const laneHeight = 270;
        const objects = [...cards, ...slots];
        if (objects.length) {
          const left = Math.min(...objects.map((item) => item.x));
          const right = Math.max(
            ...objects.map(
              (item) => item.x + ("size" in item ? item.size : item.width),
            ),
          );
          const topEdge = Math.min(...objects.map((item) => item.y));
          const bottom = Math.max(
            ...objects.map(
              (item) => item.y + ("size" in item ? item.size : item.height),
            ),
          );
          const scale = Math.min(
            1.35,
            (spec.width - 24) / (right - left),
            (laneHeight - 20) / (bottom - topEdge),
          );
          const startX = spec.x + (spec.width - (right - left) * scale) / 2;
          const startY = y + (laneHeight - (bottom - topEdge) * scale) / 2;
          for (const item of objects) {
            item.x = startX + (item.x - left) * scale;
            item.y = startY + (item.y - topEdge) * scale;
            if ("size" in item) item.size *= scale;
            else {
              item.width *= scale;
              item.height *= scale;
            }
          }
          for (const card of cards) card.formationScale = scale;
        }
        return {
          zone,
          x: spec.x,
          y,
          width: spec.width,
          height: laneHeight,
          cards,
          slots,
          frameless: spec.frameless,
        };
      }
      return {
        zone,
        x: spec.x,
        y,
        width: spec.width,
        height: top + rowHeight + 5,
        cards,
        slots,
        frameless: spec.frameless,
      };
    });
    const height = Math.max(...rows.map((row) => row.height));
    areas.push(
      ...rows.map((area, index) => ({
        ...area,
        height: specs[index].fillRowHeight === false ? area.height : height,
      })),
    );
    y += height + 5;
  }
  const environment = get("environment");
  const protocolRows = Math.max(
    3,
    ...[...mainframes].map(
      (id) =>
        (programsByHost.get(id)?.length ?? 0) + (candidates.has(id) ? 1 : 0),
    ),
  );
  const panelHeight = Math.max(minimumPanelHeight, 240, 56 * protocolRows + 20);
  const environmentLane = () => {
    if (!SHOW_TABLE_UTILITIES || !environment.cards.length) return;
    row([
      {
        id: "environment",
        x: (width - TABLE_CARD_WIDTH - 20) / 2,
        width: TABLE_CARD_WIDTH + 20,
        pile: true,
        fillRowHeight: false,
        frameless: true,
      },
    ]);
  };
  const opponentBoard = (s: number) => {
    row([
      {
        id: `${s}:arena`,
        x: 8,
        width: width - 16,
        minHeight: 185,
        frameless: true,
      },
    ]);
  };
  const ownBoard = (s: number) => {
    row([
      {
        id: `${s}:arena`,
        x: 8,
        width: width - 16,
        minHeight: 185,
        frameless: true,
      },
    ]);
  };
  const support = (s: number) => {
    const bankWidth = (width - 320) / 2;
    row([
      {
        id: `${s}:ram`,
        x: width - bankWidth - 8,
        width: bankWidth,
        stagger: true,
        minHeight: panelHeight - 15 - 48,
        frameless: true,
      },
    ]);
  };
  const opponent = seat === 0 ? 1 : 0;
  const panels = [
    {
      seat: opponent as 0 | 1,
      x: (width - 280) / 2,
      y,
      width: 280,
      height: panelHeight,
    },
  ];
  row([
    {
      id: `${opponent}:ram`,
      x: (width + 320) / 2 - 8,
      width: (width - 320) / 2,
      minHeight: panelHeight - 15,
      frameless: true,
    },
  ]);
  opponentBoard(opponent);
  environmentLane();
  ownBoard(seat);
  // Bring the local support row toward the hand without moving either arena.
  // Its shorter reservation offsets this gap; crowded RAM may still grow naturally.
  y += 48;
  panels.push({
    seat,
    x: (width - 280) / 2,
    y,
    width: 280,
    height: panelHeight - 48,
  });
  support(seat);
  const handWidth = Math.min(width - 32, 720);
  row([
    {
      id: `${seat}:hand`,
      x: (width - handWidth) / 2,
      width: handWidth,
      hand: true,
      frameless: true,
    },
  ]);
  const ownArena = areas.find((area) => area.zone.id === `${seat}:arena`)!;
  const boardHeight = y;
  for (const id of ["cache"]) {
    const zone = get(id);
    if (!SHOW_TABLE_UTILITIES || !zone.cards.length) continue;
    const overlayWidth = 320;
    const x = (width - overlayWidth) / 2;
    y = 0;
    row([
      {
        id,
        x,
        width: overlayWidth,
        fillRowHeight: false,
      },
    ]);
    const overlay = areas[areas.length - 1];
    const top = ownArena.y - overlay.height / 2;
    overlay.y = Math.max(8, top);
    for (const card of overlay.cards) card.y += overlay.y;
    for (const slot of overlay.slots) slot.y += overlay.y;
    overlay.overlay = true;
  }
  // The bank sits beside, not above, the hand: lower it without reflowing the hand.
  const localBank = areas.find((area) => area.zone.id === `${seat}:ram`);
  if (localBank) {
    localBank.y += 40;
    for (const card of localBank.cards) card.y += 40;
    for (const slot of localBank.slots) slot.y += 40;
  }
  return { areas, panels, height: boardHeight, width };
}
