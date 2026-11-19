"use client";
import { useState } from "react";
import { Layers3 } from "lucide-react";
import { publicCardArtworkUrl } from "@/lib/card-artwork";
import type { Card } from "@/lib/types";
export function CardArt({
  card,
  className = "",
}: {
  card: Card;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const url = publicCardArtworkUrl(card);
  return url && !failed ? (
    <img
      className={`card-art ${className}`}
      src={url}
      alt={card.name}
      width={card.is_landscape ? 350 : 250}
      height={card.is_landscape ? 250 : 350}
      data-landscape={card.is_landscape || undefined}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  ) : (
    <div className={`card-placeholder ${className}`}>
      <Layers3 />
      <strong>{card.name}</strong>
      <span>{card.card_type}</span>
    </div>
  );
}
