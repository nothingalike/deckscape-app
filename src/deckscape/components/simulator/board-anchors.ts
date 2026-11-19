/** Renderer-measured viewport bounds for instruction overlays; never gameplay eligibility. */
export type BoardAnchor = {
  x: number;
  y: number;
  width: number;
  height: number;
};
export type BoardAnchors = Readonly<Record<string, BoardAnchor>>;
export type BoardAnchorListener = (anchors: BoardAnchors) => void;
