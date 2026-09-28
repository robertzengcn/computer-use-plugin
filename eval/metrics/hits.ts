/**
 * Region-hit and absence metrics (design §8.2, §8.4): any point inside the
 * labeled clickable region counts as a hit; an absent case fails when any
 * candidate is accepted. Latency percentiles use linear interpolation.
 */
export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Region {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Inclusive on all edges: a point on the boundary is inside. */
export function pointInRegion(point: Point, region: Region): boolean {
  return (
    point.x >= region.x &&
    point.x <= region.x + region.w &&
    point.y >= region.y &&
    point.y <= region.y + region.h
  );
}

/** True when any candidate point lands in the expected region. */
export function regionHit(candidatePoints: readonly Point[], expected: Region): boolean {
  return candidatePoints.some((point) => pointInRegion(point, expected));
}

/** Count of accepted candidates on absent cases — every one is a false accept. */
export function absenceFalseAccepts(
  candidatesPerCase: readonly (readonly Point[])[],
): number {
  return candidatesPerCase.reduce((total, candidates) => total + candidates.length, 0);
}

/** Linear-interpolated percentile of a non-empty sample, in [0, 100]. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) {
    throw new Error('percentile of empty sample');
  }
  if (p < 0 || p > 100) {
    throw new Error(`percentile out of range: ${p}`);
  }
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1 || p === 100) {
    return sorted[sorted.length - 1] as number;
  }
  const rank = (p / 100) * (sorted.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  const lowValue = sorted[low] as number;
  const highValue = sorted[high] as number;
  return lowValue + (rank - low) * (highValue - lowValue);
}

export interface LatencySummary {
  readonly p50: number;
  readonly p95: number;
  readonly max: number;
}

export function latencySummary(values: readonly number[]): LatencySummary {
  return {
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    max: percentile(values, 100),
  };
}
