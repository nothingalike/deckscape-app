"use client";

import { useState } from "react";
import { Maximize2 } from "lucide-react";
import { CardArt } from "./card-art";
import { CardImageViewer } from "./card-image-viewer";
import type { Card } from "@/lib/types";

export function ExpandableCardArt({ card }: { card: Card }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="expandable-card-art">
      <CardArt card={card} />
      {card.image_path && (
        <button
          type="button"
          className="secondary card-image-expand"
          aria-label={`Enlarge ${card.name} image`}
          title="Enlarge card image"
          onClick={() => setExpanded(true)}
        >
          <Maximize2 size={18} />
        </button>
      )}
      {expanded && (
        <CardImageViewer name={card.name} onClose={() => setExpanded(false)}>
          <CardArt card={card} />
        </CardImageViewer>
      )}
    </div>
  );
}
