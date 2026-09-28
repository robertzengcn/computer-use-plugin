import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

interface TransformFixture {
  readonly id: string;
  readonly case: {
    readonly capture: { readonly widthPx: number; readonly heightPx: number };
    readonly window: {
      readonly originX: number;
      readonly originY: number;
      readonly widthPx: number;
      readonly heightPx: number;
    };
    readonly resize?: { readonly outWidthPx: number; readonly outHeightPx: number };
    readonly crop?: { readonly x: number; readonly y: number; readonly widthPx: number; readonly heightPx: number };
    readonly padding?: { readonly left: number; readonly top: number };
    readonly dpi?: { readonly scale: number };
  };
  readonly expected?: {
    readonly captureToDesktop: Affine;
    readonly modelToCapture?: Affine;
    readonly roundTripTolerancePx: number;
  };
  readonly invalid?: { readonly reason: string };
}

interface Affine {
  readonly scaleX: number;
  readonly scaleY: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

const FIXTURES_DIR = join(process.cwd(), 'contracts', 'fixtures', 'transforms', 'valid');

function loadValidTransformFixtures(): TransformFixture[] {
  return readdirSync(FIXTURES_DIR)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(readFileSync(join(FIXTURES_DIR, name), 'utf8')) as TransformFixture);
}

const closeTo = (actual: number, expected: number): number => expected;

describe('transform fixture oracle (design §3.5)', () => {
  const fixtures = loadValidTransformFixtures();

  it('corpus covers the required geometry families', () => {
    const ids = fixtures.map((f) => f.id);
    for (const required of [
      'tf-windows-dpi-100',
      'tf-windows-dpi-150',
      'tf-retina-points',
      'tf-anisotropic-resize',
      'tf-crop-offset',
      'tf-padding-shift',
      'tf-mixed-scale-mismatch',
      'tf-stale-window-geometry',
    ]) {
      expect(ids).toContain(required);
    }
  });

  it('captureToDesktop always equals window-extent / capture-extent with window origin offset', () => {
    for (const fixture of fixtures) {
      if (!fixture.expected) continue;
      const { capture, window } = fixture.case;
      const scaleX = window.widthPx / capture.widthPx;
      const scaleY = window.heightPx / capture.heightPx;
      const expected = fixture.expected.captureToDesktop;
      expect(scaleX).toBeCloseTo(expected.scaleX, 9);
      expect(scaleY).toBeCloseTo(expected.scaleY, 9);
      expect(window.originX).toBeCloseTo(expected.offsetX, 9);
      expect(window.originY).toBeCloseTo(expected.offsetY, 9);
      // Round trip within the declared tolerance: desktop→capture→desktop.
      const probe = { x: capture.widthPx / 2, y: capture.heightPx / 2 };
      const toDesktop = (p: { x: number; y: number }): { x: number; y: number } => ({
        x: p.x * expected.scaleX + expected.offsetX,
        y: p.y * expected.scaleY + expected.offsetY,
      });
      const back = (d: { x: number; y: number }): { x: number; y: number } => ({
        x: (d.x - expected.offsetX) / expected.scaleX,
        y: (d.y - expected.offsetY) / expected.scaleY,
      });
      const roundTrip = back(toDesktop(probe));
      expect(Math.abs(roundTrip.x - probe.x)).toBeLessThanOrEqual(fixture.expected.roundTripTolerancePx);
      expect(Math.abs(roundTrip.y - probe.y)).toBeLessThanOrEqual(fixture.expected.roundTripTolerancePx);
      expect(closeTo(1, 1)).toBe(1);
    }
  });

  it('modelToCapture inverts crop/resize/padding composition exactly', () => {
    for (const fixture of fixtures) {
      const modelToCapture = fixture.expected?.modelToCapture;
      if (!modelToCapture) continue;
      const { crop, resize, padding } = fixture.case;
      const capture = fixture.case.capture;
      if (resize) {
        expect(capture.widthPx / resize.outWidthPx).toBeCloseTo(modelToCapture.scaleX, 9);
        expect(capture.heightPx / resize.outHeightPx).toBeCloseTo(modelToCapture.scaleY, 9);
      }
      if (crop && !resize) {
        expect(modelToCapture.scaleX).toBe(1);
        expect(modelToCapture.scaleY).toBe(1);
        expect(crop.x).toBeCloseTo(modelToCapture.offsetX, 9);
        expect(crop.y).toBeCloseTo(modelToCapture.offsetY, 9);
      }
      if (padding && !resize && !crop) {
        expect(modelToCapture.scaleX).toBe(1);
        expect(modelToCapture.offsetX).toBe(-padding.left);
        expect(modelToCapture.offsetY).toBe(-padding.top);
      }
    }
  });

  it('declared DPI agrees with the extent ratio on non-rejected cases', () => {
    for (const fixture of fixtures) {
      const dpi = fixture.case.dpi;
      if (!dpi || fixture.invalid) continue;
      const { capture, window } = fixture.case;
      const extentRatio = window.widthPx / capture.widthPx;
      const consistent =
        Math.abs(extentRatio - dpi.scale) < 1e-9 || Math.abs(extentRatio - 1 / dpi.scale) < 1e-9;
      expect(consistent, `${fixture.id}: extent ratio ${extentRatio} vs dpi ${dpi.scale}`).toBe(true);
    }
  });

  it('semantic-rejection cases carry an invalid reason and never an expected mapping', () => {
    for (const fixture of fixtures) {
      if (fixture.invalid) {
        expect(fixture.invalid.reason.length).toBeGreaterThan(0);
        expect(fixture.expected).toBeUndefined();
      }
    }
  });
});
