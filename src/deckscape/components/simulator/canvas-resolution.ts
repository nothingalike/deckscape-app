/** Sharpen high-density screens without unbounded GPU memory growth on 3x/4x phones. */
export function canvasResolution(limit = 2) {
  return Math.min(limit, Math.max(1, window.devicePixelRatio || 1));
}
