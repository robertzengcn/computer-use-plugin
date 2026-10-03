/** GENERATED from contracts/ — do not edit; regenerate with npm run contracts:build. */
/**
 * Structured observation returned by computer_observe: metadata plus bounded window/AX state (design §3.2, §3.5).
 */
export interface DesktopObservation {
  metadata: {
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
    imageSha256: string;
    downsampling?: {
      originalWidthPx: number;
      originalHeightPx: number;
      method: 'none' | 'lanczos' | 'bilinear' | 'area' | 'unknown';
    };
  };
  state: {
    /**
     * @maxItems 64
     */
    windows: {
      id: string;
      title: string;
      processId: number;
      processName?: string;
      frame: {
        x: number;
        y: number;
        w: number;
        h: number;
      };
    }[];
    focusedWindowId?: string;
    foregroundOwner?: string;
    axTree?: {
      elementCount: number;
      truncated: boolean;
      /**
       * @maxItems 5000
       */
      elements: {
        role: string;
        name?: string;
        value?: string;
        frame?: {
          x: number;
          y: number;
          w: number;
          h: number;
        };
        /**
         * @maxItems 200
         */
        children?: number[];
      }[];
    };
  };
}
