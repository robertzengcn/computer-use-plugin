/** GENERATED from contracts/ — do not edit; regenerate with npm run contracts:build. */
/**
 * Hub-consumed plugin identity and compatibility declaration (design §7.1). Declares which local runtime IDs the plugin can use; the host accepts only IDs in its compiled allowlist, so this manifest can never add a runtime or change a download URL.
 */
export interface CommonPluginManifest {
  id: 'aifetchly-computer-use';
  version: string;
  contractVersions: {
    publicTools: number;
    desktop: number;
    grounding: number;
    modelManifest: number;
    trace: number;
  };
  /**
   * @minItems 1
   */
  platforms: ['win32-x64' | 'darwin-arm64', ...('win32-x64' | 'darwin-arm64')[]];
  localAiRuntimes: {
    runtimeId: 'grounding-onnxruntime' | 'grounding-model-gui-actor-2b-fp16' | 'grounding-model-gui-actor-2b-int4';
    minVersion: string;
  }[];
  backend?: {
    windows: BackendStatus;
    macos: BackendStatus;
  };
  skills?: string[];
}
export interface BackendStatus {
  status: 'spike-pending' | 'candidate' | 'qualified';
  artifactDigest?: string;
}
