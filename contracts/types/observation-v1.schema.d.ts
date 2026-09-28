/** GENERATED from contracts/ — do not edit; regenerate with npm run contracts:build. */
export type Sha256Hex = string;

/**
 * Structured observation returned by computer_observe: metadata plus bounded window/AX state (design §3.2, §3.5).
 */
export interface DesktopObservation {
  metadata: ObservationMetadata;
  state: ObservationState;
}
export interface ObservationMetadata {
  id: string;
  sessionId: string;
  sessionGeneration: number;
  capturedAt: string;
  targetWindowId: string;
  displayConfigurationVersion: string;
  executorUnits: 'desktop_physical_pixels' | 'desktop_logical_points';
  captureWidthPx: number;
  captureHeightPx: number;
  plannerMode: 'local_only' | 'visual_planner';
  plannerImageAttached: boolean;
  imageSha256: Sha256Hex;
  downsampling?: {
    originalWidthPx: number;
    originalHeightPx: number;
    method: 'none' | 'lanczos' | 'bilinear' | 'area' | 'unknown';
  };
}
export interface ObservationState {
  /**
   * @maxItems 64
   */
  windows: WindowRecord[];
  focusedWindowId?: string;
  foregroundOwner?: string;
  axTree?: AxTree;
}
export interface WindowRecord {
  id: string;
  title: string;
  processId: number;
  processName?: string;
  frame: Rect;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface AxTree {
  elementCount: number;
  truncated: boolean;
  /**
   * @maxItems 5000
   */
  elements: {
    role: string;
    name?: string;
    value?: string;
    frame?: Rect;
    /**
     * @maxItems 200
     */
    children?: number[];
  }[];
}
