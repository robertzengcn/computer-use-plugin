/** GENERATED from contracts/ — do not edit; regenerate with npm run contracts:build. */
/**
 * Golden geometry case consumed by host transform tests and the plugin oracle check (design §3.5). Invalid cases declare the reason they must be rejected.
 */
export type CoordinateTransformFixture = {
  [k: string]: unknown;
} & {
  id: string;
  kind: 'transform';
  description?: string;
  case: {
    capture: {
      widthPx: number;
      heightPx: number;
    };
    window: {
      originX: number;
      originY: number;
      widthPx: number;
      heightPx: number;
    };
    dpi?: {
      scale: number;
    };
    resize?: {
      outWidthPx: number;
      outHeightPx: number;
    };
    crop?: {
      x: number;
      y: number;
      widthPx: number;
      heightPx: number;
    };
    padding?: {
      left: number;
      top: number;
    };
    executorUnits: 'desktop_physical_pixels' | 'desktop_logical_points';
  };
  expected?: {
    captureToDesktop: {
      scaleX: number;
      scaleY: number;
      offsetX: number;
      offsetY: number;
    };
    modelToCapture?: {
      scaleX: number;
      scaleY: number;
      offsetX: number;
      offsetY: number;
    };
    roundTripTolerancePx: number;
  };
  invalid?: {
    reason:
      | 'mixed_scale_mismatch'
      | 'crop_out_of_bounds'
      | 'non_finite_geometry'
      | 'stale_window_geometry'
      | 'negative_display_origin_unsupported';
    detail?: string;
  };
};
