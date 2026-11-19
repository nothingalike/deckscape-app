import type { Card } from './types';

// Desktop artwork transport preserves the hosted CardArt/preview interface.
export function publicCardArtworkUrl(card: Pick<Card, 'image_path'> | null) {
  const path = card?.image_path;
  return path && /^[a-f0-9]{64}\.(png|jpg|webp)$/.test(path) ? `neuroscape://art/${path}` : null;
}
