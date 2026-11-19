import styles from "./player-flair.module.css";
import { Layers3 } from "lucide-react";
import {
  badgeArtForLabel,
  badgeMaterialForLabel,
} from "@/lib/achievements/badge-artwork";

export function AchievementBadge({
  label,
  locked = false,
}: {
  label: string;
  locked?: boolean;
}) {
  const tier = label.split(" ").at(-1);
  const artwork = badgeArtForLabel(label);
  const material = badgeMaterialForLabel(label);
  return (
    <span
      className={`${styles.badge} ${locked ? styles.locked : ""}`}
      aria-label={`${locked ? "Locked" : "Achievement"} badge: ${label}${material ? `, ${material}` : ""}`}
      title={`${label}${material ? ` · ${material}` : ""}`}
    >
      {artwork ? (
        <img src={artwork} width={40} height={40} alt="" aria-hidden="true" />
      ) : (
        <Layers3 size={24} strokeWidth={1.8} aria-hidden="true" />
      )}
      <span className={styles.badgeTier} aria-hidden="true">
        {tier ?? "•"}
      </span>
    </span>
  );
}

export function PlayerFlair({
  title,
  badge,
  showEmpty = false,
  showBadge = false,
}: {
  title?: string | null;
  badge?: string | null;
  showEmpty?: boolean;
  showBadge?: boolean;
}) {
  if (!title && !(showBadge && badge))
    return showEmpty ? (
      <span className={styles.empty}>No flair equipped</span>
    ) : null;

  return (
    <span className={styles.flair}>
      {title && <span className={styles.title}>{title}</span>}
      {showBadge && badge && <AchievementBadge label={badge} />}
    </span>
  );
}
