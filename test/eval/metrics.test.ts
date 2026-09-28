import { describe, expect, it } from 'vitest';
import {
  absenceFalseAccepts,
  latencySummary,
  percentile,
  pointInRegion,
  regionHit,
} from '../../eval/metrics/hits.js';

describe('pointInRegion (inclusive edges, §8.2 "any point inside counts")', () => {
  const region = { x: 100, y: 200, w: 50, h: 30 };
  it.each([
    [{ x: 100, y: 200 }, 'top-left corner'],
    [{ x: 150, y: 230 }, 'bottom-right corner'],
    [{ x: 125, y: 215 }, 'center'],
  ])('%s (%s) is inside', (point) => {
    expect(pointInRegion(point, region)).toBe(true);
  });
  it.each([
    [{ x: 99.9, y: 215 }, 'left of region'],
    [{ x: 150.1, y: 215 }, 'right of region'],
    [{ x: 125, y: 230.1 }, 'below region'],
  ])('%s (%s) is outside', (point) => {
    expect(pointInRegion(point, region)).toBe(false);
  });
});

describe('regionHit', () => {
  const expected = { x: 0, y: 0, w: 10, h: 10 };
  it('hits when any candidate lands inside', () => {
    expect(regionHit([{ x: -5, y: -5 }, { x: 5, y: 5 }], expected)).toBe(true);
  });
  it('misses when all candidates are outside', () => {
    expect(regionHit([{ x: 11, y: 5 }], expected)).toBe(false);
  });
  it('an empty candidate list is a miss, not an error', () => {
    expect(regionHit([], expected)).toBe(false);
  });
});

describe('absenceFalseAccepts', () => {
  it('counts every accepted candidate on absent cases', () => {
    expect(absenceFalseAccepts([[], [{ x: 1, y: 1 }], [{ x: 1, y: 1 }, { x: 2, y: 2 }]])).toBe(3);
    expect(absenceFalseAccepts([[], []])).toBe(0);
  });
});

describe('percentile', () => {
  it('interpolates linearly', () => {
    expect(percentile([10, 20, 30, 40], 50)).toBe(25);
    expect(percentile([10, 20, 30, 40], 25)).toBeCloseTo(17.5, 10);
  });
  it('returns max at p100 and handles single samples', () => {
    expect(percentile([10, 20, 30, 40], 100)).toBe(40);
    expect(percentile([7], 50)).toBe(7);
  });
  it('rejects empty samples and out-of-range p', () => {
    expect(() => percentile([], 50)).toThrow(/empty/);
    expect(() => percentile([1], 101)).toThrow(/range/);
  });
});

describe('latencySummary', () => {
  it('summarizes p50/p95/max', () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(latencySummary(values)).toEqual({ p50: 50.5, p95: 95.05, max: 100 });
  });
});
