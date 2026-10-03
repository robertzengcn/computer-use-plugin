/** GENERATED from contracts/ — do not edit; regenerate with npm run contracts:build. */
/**
 * Envelope, image reference and task for a ground() call (design §3.4.2). The adapter never receives or returns desktop coordinates.
 */
export interface GroundingRequest {
  contractVersion: 1;
  requestId: string;
  sessionGeneration: number;
  observationId: string;
  modelConfigurationId: string;
  image: {
    format: 'png' | 'jpeg';
    widthPx: number;
    heightPx: number;
    sha256?: string;
    crop?: {
      x: number;
      y: number;
      w: number;
      h: number;
    };
  };
  task: {
    description: string;
    maxCandidates?: number;
    pixelBudget?: number;
  };
}
