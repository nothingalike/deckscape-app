"use client";
import type { CardSort } from "@/lib/card-sort";
export function CardBrowseControls({
  sort,
  setSort,
  layout,
  setLayout,
}: {
  sort: CardSort;
  setSort: (sort: CardSort) => void;
  layout: "grid" | "list";
  setLayout: (layout: "grid" | "list") => void;
}) {
  return (
    <div className="card-browse-controls">
      <select
        aria-label="Sort cards"
        value={sort}
        onChange={(e) => setSort(e.target.value as CardSort)}
      >
        <option value="number">Set + Card number</option>
        <option value="name">Name A–Z</option>
        <option value="ram">RAM cost</option>
      </select>
      <div className="card-view-toggle" role="group" aria-label="Card display">
        <button
          type="button"
          className={layout === "grid" ? "" : "secondary"}
          aria-pressed={layout === "grid"}
          onClick={() => setLayout("grid")}
        >
          Grid
        </button>
        <button
          type="button"
          className={layout === "list" ? "" : "secondary"}
          aria-pressed={layout === "list"}
          onClick={() => setLayout("list")}
        >
          List
        </button>
      </div>
    </div>
  );
}
