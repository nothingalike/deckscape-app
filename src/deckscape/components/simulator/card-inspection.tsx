"use client";

import type { CardInspection as Inspection } from "@/lib/simulator/card-inspection";
import type {
  CardPresentation,
  VisibleBoardCard,
} from "@/lib/simulator/board-view";
import { presentationFor } from "@/lib/simulator/board-view";
import { portsByCardEdge } from "@/lib/simulator/ports";
import type { CardRequirementAssessment } from "@/lib/simulator/card-requirement-assessment";

const requirements = (values: Record<string, number>) =>
  Object.entries(values)
    .map(([faction, count]) => `${faction} ${count}`)
    .join(" · ");

/** Render current, authorized battlefield state without deriving game rules in the UI. */
export function CurrentCardState({
  card,
  presentation,
  visibleCards,
  describe,
  isMainframe = false,
  onInspect,
  protocolPortsClassName,
}: {
  card: VisibleBoardCard;
  presentation: CardPresentation;
  visibleCards: readonly VisibleBoardCard[];
  describe: (id: string) => string;
  isMainframe?: boolean;
  onInspect?: (id: string) => void;
  protocolPortsClassName?: string;
}) {
  const counters = Object.entries(card.counters).filter(
    ([, amount]) => amount !== 0,
  );
  const attachedCards = visibleCards.filter((candidate) =>
    candidate.attachments.some((link) => link.hostId === card.instanceId),
  );
  const reservedRam = attachedCards.filter((candidate) =>
    candidate.attachments.some(
      (link) => link.kind === "ram" && link.hostId === card.instanceId,
    ),
  );
  const protocols = isMainframe
    ? attachedCards.filter((candidate) =>
        candidate.attachments.some(
          (link) => link.kind === "protocol" && link.hostId === card.instanceId,
        ),
      )
    : [];
  const otherAttachments = attachedCards.filter(
    (candidate) =>
      !reservedRam.includes(candidate) && !protocols.includes(candidate),
  );

  return (
    <div aria-label="Current card state">
      {presentation.attack !== undefined && (
        <p>
          <strong>Current combat values</strong>
          <br />
          {presentation.attack} {presentation.attackType ?? "ATK"} attack ·{" "}
          {presentation.defence ?? "Unknown"} defence
        </p>
      )}
      {!!presentation.effects?.length && (
        <div>
          <strong>Current effects</strong>
          <ul>
            {presentation.effects.map((effect, index) => (
              <li key={`${effect.label}:${effect.duration}:${index}`}>
                {effect.label} ·{" "}
                {effect.duration === "until-end-of-turn"
                  ? "Until end of turn"
                  : "While source remains in play"}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p>
        <strong>Status</strong>
        <br />
        {card.running ? "Running" : "Refreshed"}
        {card.abilitySpent ? " · Ability spent" : ""}
        {card.token ? " · Token" : ""}
      </p>
      <p>
        <strong>Marked damage</strong>
        <br />
        {card.damage.MF} MF · {card.damage.BF} BF
      </p>
      <div>
        <strong>Counters</strong>
        {counters.length ? (
          <ul>
            {counters.map(([name, amount]) => (
              <li key={name}>
                {name}: {amount}
              </li>
            ))}
          </ul>
        ) : (
          <p>None</p>
        )}
      </div>
      {isMainframe && (
        <section
          aria-label="Mainframe protocol ports"
          className={protocolPortsClassName}
        >
          <strong>Protocol ports</strong>
          {Array.from({ length: Math.max(3, protocols.length) }, (_, index) => {
            const protocol = protocols[index];
            return (
              <button
                key={index}
                type="button"
                data-occupied={!!protocol}
                disabled={!protocol || !onInspect}
                onClick={() => protocol && onInspect?.(protocol.instanceId)}
              >
                P{index + 1} ·{" "}
                {protocol ? describe(protocol.instanceId) : "Empty"}
              </button>
            );
          })}
        </section>
      )}
      {(!isMainframe ||
        card.attachments.length > 0 ||
        otherAttachments.length > 0) && (
        <div>
          <strong>Attachments</strong>
          {card.attachments.length || otherAttachments.length ? (
            <ul>
              {card.attachments.map((link, index) => (
                <li key={`host-${index}`}>
                  Attached to {describe(link.hostId)}
                  {link.port ? ` (${link.port})` : ""}
                </li>
              ))}
              {otherAttachments.map((attached) => (
                <li key={`attached-${attached.instanceId}`}>
                  Attached: {describe(attached.instanceId)}
                </li>
              ))}
            </ul>
          ) : (
            <p>None</p>
          )}
        </div>
      )}
      {presentation.rulesText && (
        <p>
          <strong>Rules text</strong>
          <br />
          {presentation.rulesText}
        </p>
      )}
    </div>
  );
}

export function ReservedRamChips({
  card,
  visibleCards,
  presentations,
  onInspect,
  className,
}: {
  card: VisibleBoardCard;
  visibleCards: readonly VisibleBoardCard[];
  presentations: Readonly<Record<string, CardPresentation>>;
  onInspect: (id: string) => void;
  className?: string;
}) {
  const groups = new Map<
    string,
    { name: string; artworkUrl?: string; cards: VisibleBoardCard[] }
  >();
  for (const candidate of visibleCards) {
    if (
      !candidate.attachments.some(
        (link) => link.kind === "ram" && link.hostId === card.instanceId,
      )
    )
      continue;
    const presentation = presentationFor(candidate, presentations);
    const key = presentation.name;
    const group = groups.get(key);
    if (group) group.cards.push(candidate);
    else
      groups.set(key, {
        name: presentation.name,
        artworkUrl: presentation.artworkUrl,
        cards: [candidate],
      });
  }
  if (!groups.size) return null;

  return (
    <section aria-label="Reserved RAM" className={className}>
      <strong>Reserved RAM</strong>
      <div>
        {[...groups.values()].map((group) => (
          <button
            type="button"
            key={group.cards[0].instanceId}
            onClick={() => onInspect(group.cards[0].instanceId)}
            aria-label={`Inspect reserved RAM: ${group.name}, ${group.cards.length} reserved`}
          >
            {group.artworkUrl && <img src={group.artworkUrl} alt="" />}
            <span>{group.name}</span>
            <b>×{group.cards.length}</b>
          </button>
        ))}
      </div>
    </section>
  );
}

export function RequirementFeedback({
  assessment,
  className,
}: {
  assessment: CardRequirementAssessment;
  className?: string;
}) {
  const synergy = Object.entries(assessment.synergy);
  const ramShortfall = assessment.availableRam < assessment.cost;
  const synergyShortfall = synergy.some(
    ([, values]) => values.available < values.required,
  );
  const distinctBlockers = assessment.blockers.filter(
    (blocker) =>
      !(
        (blocker.code === "ram" && ramShortfall) ||
        (blocker.code === "synergy" && synergyShortfall) ||
        (blocker.code === "choices" && assessment.choicesRequired)
      ),
  );
  return (
    <section
      aria-label="Card requirements"
      className={className}
      data-status={assessment.status}
    >
      <strong>
        {assessment.status === "blocked"
          ? "Can’t play"
          : assessment.choicesRequired
            ? "Requirements pending"
            : "Play requirements"}
      </strong>
      <p data-unmet={ramShortfall || undefined}>
        {assessment.cost} RAM to play · {assessment.availableRam} available
      </p>
      {!!synergy.length && (
        <ul aria-label="Faction synergy requirements">
          {synergy.map(([faction, values]) => (
            <li
              key={faction}
              data-unmet={values.available < values.required || undefined}
              aria-label={`${faction}: ${values.available} available of ${values.required} required`}
            >
              {faction}: {values.available} / {values.required}
            </li>
          ))}
        </ul>
      )}
      {!!distinctBlockers.length && (
        <ul aria-label="Unmet play requirements">
          {distinctBlockers.map((blocker) => (
            <li key={blocker.code}>{blocker.message}</li>
          ))}
        </ul>
      )}
      {assessment.choicesRequired && (
        <p role="status">
          Choose this action&apos;s mode, targets, or variable values to confirm
          its final requirements.
        </p>
      )}
      {assessment.status === "ready" &&
        !distinctBlockers.length &&
        !assessment.choicesRequired && <p>No unmet play requirements.</p>}
    </section>
  );
}

/** Render only the server's authorized card snapshot; never fetch by card name. */
export function CardDetails({
  characteristics: card,
  artworkUrl,
}: Inspection) {
  return (
    <div>
      <h3>{card.name}</h3>
      {artworkUrl && (
        <img
          key={artworkUrl}
          src={artworkUrl}
          alt={card.name}
          loading="lazy"
          referrerPolicy="no-referrer"
          style={{ maxWidth: 260, width: "100%" }}
          onError={(event) => {
            event.currentTarget.hidden = true;
          }}
        />
      )}
      <p>
        {card.cardType}
        {"subtype" in card ? ` · ${card.subtype}` : ""}
        {card.iconic ? " · Iconic" : ""}
        {card.cardType === "program" && card.swift ? " · Swift" : ""}
        {card.cardType === "ram" && card.isBasicRam ? " · Basic RAM" : ""}
      </p>
      <p>Factions: {card.factions.join(" · ") || "None"}</p>
      {!!card.tags.length && <p>{card.tags.join(" · ")}</p>}
      {"ramCost" in card && (
        <>
          <p>RAM cost: {card.ramCost}</p>
          {!!Object.keys(card.requirements).length && (
            <p>Requirements: {requirements(card.requirements)}</p>
          )}
          {card.additionalPlayCostText && (
            <p>Additional play cost: {card.additionalPlayCostText}</p>
          )}
        </>
      )}
      {card.cardType === "character" && (
        <p>
          Attack {card.attack} {card.attackType} · Defence {card.defence}
        </p>
      )}
      {"ports" in card && (
        <p>
          Gear ports (printed card sides):{" "}
          {Object.entries(portsByCardEdge(card.cardType, card.ports))
            .map(([side, count]) => `${side} ${count}`)
            .join(" · ")}
        </p>
      )}
      <p style={{ whiteSpace: "pre-wrap" }}>{card.rulesText}</p>
      {"activatedAbilities" in card && card.activatedAbilities.length > 0 && (
        <ul aria-label="Activated abilities">
          {card.activatedAbilities.map((ability, index) => (
            <li key={index}>
              {ability.name} · {ability.ramCost} RAM
              {ability.run ? " · Run this card" : ""}
              {ability.additionalCostText
                ? ` · ${ability.additionalCostText}`
                : ""}
              {ability.grantedTo ? " · Granted to attached character" : ""}
            </li>
          ))}
        </ul>
      )}
      {card.cardType === "mainframe" && (
        <>
          {card.prefix && <p>{card.prefix}</p>}
          <ol aria-label="Mainframe tiers">
            {card.tiers.map((tier, index) => (
              <li key={index}>
                {tier.persistents} persistents
                {Object.keys(tier.factions).length
                  ? ` · ${requirements(tier.factions)}`
                  : ""}
                {" · "}
                {tier.operator}
                <p style={{ whiteSpace: "pre-wrap" }}>{tier.text}</p>
              </li>
            ))}
          </ol>
        </>
      )}
      {card.copiesLimit !== null && <p>Deck copy limit: {card.copiesLimit}</p>}
    </div>
  );
}
