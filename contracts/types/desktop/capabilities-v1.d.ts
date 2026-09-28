/** GENERATED from contracts/ — do not edit; regenerate with npm run contracts:build. */
export type PermissionState = 'granted' | 'denied' | 'not_determined' | 'unsupported_platform';

/**
 * Backend/protocol versions, supported actions, permissions, grounder state and planner mode reported by computer_capabilities (design §3.1).
 */
export interface DesktopBackendCapabilities {
  backendVersion: string;
  protocolVersion: string;
  contractVersion: number;
  /**
   * @minItems 1
   */
  supportedActions: [
    'click' | 'type' | 'scroll' | 'move' | 'drag' | 'keys' | 'key',
    ...('click' | 'type' | 'scroll' | 'move' | 'drag' | 'keys' | 'key')[]
  ];
  permissions: {
    accessibility: PermissionState;
    screenRecording: PermissionState;
    inputMonitoring: PermissionState;
  };
  plannerMode: 'local_only' | 'visual_planner';
  displaySupport: {
    multiMonitor: boolean;
    mixedDpi: boolean;
  };
  grounder?: {
    state: 'not_installed' | 'installing' | 'ready' | 'unavailable';
    provider: string;
  };
}
