import type { DeckReadiness } from "@/lib/simulator/deck-readiness";
import { Check } from "lucide-react";

export function DeckReadinessNotice({
  readiness,
  compact = false,
}: {
  readiness: DeckReadiness;
  compact?: boolean;
}) {
  if (readiness.ready)
    return compact ? (
      <span className="simulator-ready-badge">
        <Check size={14} aria-hidden="true" />
        Simulator ready
      </span>
    ) : (
      <p className="muted">Simulator ready</p>
    );
  return (
    <details>
      <summary>Simulator: needs attention</summary>
      <ul>
        {readiness.issues.map((issue) => (
          <li key={issue}>{issue}</li>
        ))}
      </ul>
    </details>
  );
}
