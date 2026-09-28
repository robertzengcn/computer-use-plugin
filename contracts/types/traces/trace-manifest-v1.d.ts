/** GENERATED from contracts/ — do not edit; regenerate with npm run contracts:build. */
/**
 * Index of a trace bundle (design §3.6). Typed content is redacted by default; consent must be explicit.
 */
export interface TraceBundleManifest {
  schemaVersion: 1;
  traceId: string;
  contractVersions: {
    tools: number;
    desktop: number;
    grounding: number;
  };
  configuration?: {
    modelConfigurationId: string;
    adapterId?: string;
    adapterVersion?: string;
    onnxRuntimeVersion?: string;
    executionProvider?: 'dml' | 'coreml' | 'cpu';
    preprocessingRevision: string;
    decodingRevision: string;
    calibrationRevision: string;
    modelManifestSha256?: string;
  };
  target: {
    windowTitle?: string;
    appId?: string;
    os?: string;
    displayMetadata?: {
      scaling: number;
      locale?: string;
      theme?: string;
    };
    consent: boolean;
  };
  plannerMode: 'local_only' | 'visual_planner';
  /**
   * @maxItems 5000
   */
  steps: {
    stepId: string;
    observation?: string;
    grounding?: string;
    action?: string;
    verification?: string;
  }[];
  annotations?: string;
  redacted: boolean;
}
