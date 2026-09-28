/** GENERATED from contracts/ — do not edit; regenerate with npm run contracts:build. */
/**
 * What a grounding adapter accepts and produces, declared before load (design §3.4.1).
 */
export interface GroundingAdapterCapabilities {
  contractVersion: 1;
  adapterId: string;
  adapterVersion: string;
  /**
   * @minItems 1
   */
  acceptedArchitectures: [string, ...string[]];
  /**
   * @minItems 1
   */
  acceptedManifestVersions: [number, ...number[]];
  onnxRuntime: {
    version: string;
    /**
     * @minItems 1
     */
    providers: ['dml' | 'coreml' | 'cpu', ...('dml' | 'coreml' | 'cpu')[]];
  };
  image: {
    /**
     * @minItems 1
     */
    formats: ['png' | 'jpeg', ...('png' | 'jpeg')[]];
    maxPixels: number;
    maxBytes: number;
    cropSupported: boolean;
  };
  output: {
    point: boolean;
    region: boolean;
    heatmap: boolean;
    absencePolicy: 'none' | 'calibrated_threshold' | 'ax_cross_check';
  };
  cooperativeCancel: boolean;
}
