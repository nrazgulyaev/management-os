/**
 * Block 09 ESTIMATOR — pure takeoff geometry. Shared by the client workbench
 * and the server re-cost path so a measured quantity is derived identically in
 * both places (the workbench previously inlined these). No `server-only` guard
 * so it can be imported on the client and unit-tested directly.
 */

export type TakeoffKind = "area" | "length" | "count";

export interface GeometryPoint {
  x: number;
  y: number;
}

export interface ScaleSnapshot {
  /** Pixel distance of the calibration line. */
  pixels: number;
  /** Real-world metres that distance represents. */
  meters: number;
}

/** Canonical unit per measurement kind. */
export const TAKEOFF_UNIT: Record<TakeoffKind, string> = {
  area: "m2",
  length: "m",
  count: "ea",
};

/** Shoelace polygon area in pixels². */
export function polygonAreaPx(pts: GeometryPoint[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(a) / 2;
}

/** Polyline length in pixels. */
export function polylineLengthPx(pts: GeometryPoint[]): number {
  let d = 0;
  for (let i = 1; i < pts.length; i++) {
    d += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return d;
}

/**
 * Convert a measurement's geometry + scale to a real-world quantity, or null
 * when it cannot be computed (no scale for area/length).
 *   - count → number of points (scale-independent)
 *   - area  → m² via metres-per-pixel²
 *   - length → m via metres-per-pixel
 */
export function quantityFor(
  kind: TakeoffKind,
  points: GeometryPoint[],
  scale: ScaleSnapshot | null,
): number | null {
  if (kind === "count") return points.length;
  if (!scale || scale.pixels <= 0) return null;
  const mpp = scale.meters / scale.pixels; // metres per pixel
  if (kind === "area") return polygonAreaPx(points) * mpp * mpp;
  if (kind === "length") return polylineLengthPx(points) * mpp;
  return null;
}
