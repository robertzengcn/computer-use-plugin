/** GENERATED from contracts/ — do not edit; regenerate with npm run contracts:build. */
/**
 * The complete model-visible tool surface (design §3.1, CU-PLUGIN-02). Nine tools exactly; each tool's input and result are strictly shaped. Raw coordinates, model-supplied grants or approvals are structurally rejected in act payloads.
 */
export interface PublicToolSurface {
  contractVersion: 1;
  /**
   * @minItems 9
   * @maxItems 9
   */
  tools: {
    [k: string]: unknown;
  } & [
    (
      | {
          name: 'computer_capabilities';
          description: string;
          input?: {};
          result?: DesktopBackendCapabilities;
        }
      | {
          name: 'computer_start_session';
          description: string;
          input?: {
            targetRef: string;
            purpose: string;
          };
          result?: {
            sessionId: string;
            scopedCapabilities: DesktopBackendCapabilities1;
          };
        }
      | {
          name: 'computer_observe';
          description: string;
          input?: {
            sessionId: string;
            mode?: 'local_only' | 'visual_planner';
          };
          result?: {
            observationId: string;
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
            state?: {
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
          };
        }
      | {
          name: 'computer_find';
          description: string;
          input?: {
            sessionId: string;
            observationId: string;
            targetDescription: string;
          };
          result?:
            | {
                targetHandle: string;
                groundingSource: 'accessibility' | 'vision';
                evidenceSummary?: string;
              }
            | {
                errorCode: 'target_not_found' | 'target_ambiguous';
              };
        }
      | {
          name: 'computer_act';
          description: string;
          input?: {
            sessionId: string;
            targetHandle: string;
            actionId: string;
            action:
              | {
                  kind: 'click';
                  targetHandle: string;
                  button?: 'left' | 'right' | 'middle';
                  count?: number;
                }
              | {
                  kind: 'type';
                  targetHandle?: string;
                  text: string;
                }
              | {
                  kind: 'scroll';
                  targetHandle: string;
                  direction: 'up' | 'down' | 'left' | 'right';
                  amount: number;
                }
              | {
                  kind: 'move';
                  targetHandle: string;
                }
              | {
                  kind: 'drag';
                  fromHandle: string;
                  toHandle: string;
                }
              | {
                  kind: 'keys';
                  targetHandle?: string;
                  combo: string;
                };
          };
          result?: {
            actionId: string;
            state: 'not_dispatched' | 'dispatched' | 'failed' | 'uncertain';
            verification: 'satisfied' | 'unsatisfied' | 'unknown';
            postObservationId?: string;
            errorCode?:
              | 'ai_disabled'
              | 'permission_required'
              | 'desktop_busy'
              | 'unsupported_target'
              | 'unsupported_display_configuration'
              | 'runtime_not_ready'
              | 'model_not_ready'
              | 'target_not_found'
              | 'target_ambiguous'
              | 'invalid_grounding_output'
              | 'stale_observation'
              | 'focus_changed'
              | 'action_not_authorized'
              | 'action_cancelled'
              | 'execution_uncertain'
              | 'verification_failed'
              | 'backend_unavailable'
              | 'resource_limit'
              | 'protocol_mismatch'
              | 'planner_mode_unavailable'
              | 'stop_hotkey_unavailable'
              | 'host_elevated';
            dispatchedAt?: string;
          };
        }
      | {
          name: 'computer_verify';
          description: string;
          input?: {
            sessionId: string;
            expectedState: string;
            observationId?: string;
          };
          result?: {
            verification: 'satisfied' | 'unsatisfied' | 'unknown';
            evidence?: string;
          };
        }
      | {
          name: 'computer_request_handoff';
          description: string;
          input?: {
            sessionId: string;
            reason: string;
          };
          result?: {
            sessionId: string;
            inputRevoked: true;
          };
        }
      | {
          name: 'computer_resume_after_handoff';
          description: string;
          input?: {
            sessionId: string;
          };
          result?: {
            sessionId: string;
            observationId: string;
          };
        }
      | {
          name: 'computer_stop_session';
          description: string;
          input?: {
            sessionId: string;
          };
          result?: {
            sessionId: string;
            stopped: true;
          };
        }
    ),
    (
      | {
          name: 'computer_capabilities';
          description: string;
          input?: {};
          result?: DesktopBackendCapabilities;
        }
      | {
          name: 'computer_start_session';
          description: string;
          input?: {
            targetRef: string;
            purpose: string;
          };
          result?: {
            sessionId: string;
            scopedCapabilities: DesktopBackendCapabilities1;
          };
        }
      | {
          name: 'computer_observe';
          description: string;
          input?: {
            sessionId: string;
            mode?: 'local_only' | 'visual_planner';
          };
          result?: {
            observationId: string;
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
            state?: {
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
          };
        }
      | {
          name: 'computer_find';
          description: string;
          input?: {
            sessionId: string;
            observationId: string;
            targetDescription: string;
          };
          result?:
            | {
                targetHandle: string;
                groundingSource: 'accessibility' | 'vision';
                evidenceSummary?: string;
              }
            | {
                errorCode: 'target_not_found' | 'target_ambiguous';
              };
        }
      | {
          name: 'computer_act';
          description: string;
          input?: {
            sessionId: string;
            targetHandle: string;
            actionId: string;
            action:
              | {
                  kind: 'click';
                  targetHandle: string;
                  button?: 'left' | 'right' | 'middle';
                  count?: number;
                }
              | {
                  kind: 'type';
                  targetHandle?: string;
                  text: string;
                }
              | {
                  kind: 'scroll';
                  targetHandle: string;
                  direction: 'up' | 'down' | 'left' | 'right';
                  amount: number;
                }
              | {
                  kind: 'move';
                  targetHandle: string;
                }
              | {
                  kind: 'drag';
                  fromHandle: string;
                  toHandle: string;
                }
              | {
                  kind: 'keys';
                  targetHandle?: string;
                  combo: string;
                };
          };
          result?: {
            actionId: string;
            state: 'not_dispatched' | 'dispatched' | 'failed' | 'uncertain';
            verification: 'satisfied' | 'unsatisfied' | 'unknown';
            postObservationId?: string;
            errorCode?:
              | 'ai_disabled'
              | 'permission_required'
              | 'desktop_busy'
              | 'unsupported_target'
              | 'unsupported_display_configuration'
              | 'runtime_not_ready'
              | 'model_not_ready'
              | 'target_not_found'
              | 'target_ambiguous'
              | 'invalid_grounding_output'
              | 'stale_observation'
              | 'focus_changed'
              | 'action_not_authorized'
              | 'action_cancelled'
              | 'execution_uncertain'
              | 'verification_failed'
              | 'backend_unavailable'
              | 'resource_limit'
              | 'protocol_mismatch'
              | 'planner_mode_unavailable'
              | 'stop_hotkey_unavailable'
              | 'host_elevated';
            dispatchedAt?: string;
          };
        }
      | {
          name: 'computer_verify';
          description: string;
          input?: {
            sessionId: string;
            expectedState: string;
            observationId?: string;
          };
          result?: {
            verification: 'satisfied' | 'unsatisfied' | 'unknown';
            evidence?: string;
          };
        }
      | {
          name: 'computer_request_handoff';
          description: string;
          input?: {
            sessionId: string;
            reason: string;
          };
          result?: {
            sessionId: string;
            inputRevoked: true;
          };
        }
      | {
          name: 'computer_resume_after_handoff';
          description: string;
          input?: {
            sessionId: string;
          };
          result?: {
            sessionId: string;
            observationId: string;
          };
        }
      | {
          name: 'computer_stop_session';
          description: string;
          input?: {
            sessionId: string;
          };
          result?: {
            sessionId: string;
            stopped: true;
          };
        }
    ),
    (
      | {
          name: 'computer_capabilities';
          description: string;
          input?: {};
          result?: DesktopBackendCapabilities;
        }
      | {
          name: 'computer_start_session';
          description: string;
          input?: {
            targetRef: string;
            purpose: string;
          };
          result?: {
            sessionId: string;
            scopedCapabilities: DesktopBackendCapabilities1;
          };
        }
      | {
          name: 'computer_observe';
          description: string;
          input?: {
            sessionId: string;
            mode?: 'local_only' | 'visual_planner';
          };
          result?: {
            observationId: string;
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
            state?: {
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
          };
        }
      | {
          name: 'computer_find';
          description: string;
          input?: {
            sessionId: string;
            observationId: string;
            targetDescription: string;
          };
          result?:
            | {
                targetHandle: string;
                groundingSource: 'accessibility' | 'vision';
                evidenceSummary?: string;
              }
            | {
                errorCode: 'target_not_found' | 'target_ambiguous';
              };
        }
      | {
          name: 'computer_act';
          description: string;
          input?: {
            sessionId: string;
            targetHandle: string;
            actionId: string;
            action:
              | {
                  kind: 'click';
                  targetHandle: string;
                  button?: 'left' | 'right' | 'middle';
                  count?: number;
                }
              | {
                  kind: 'type';
                  targetHandle?: string;
                  text: string;
                }
              | {
                  kind: 'scroll';
                  targetHandle: string;
                  direction: 'up' | 'down' | 'left' | 'right';
                  amount: number;
                }
              | {
                  kind: 'move';
                  targetHandle: string;
                }
              | {
                  kind: 'drag';
                  fromHandle: string;
                  toHandle: string;
                }
              | {
                  kind: 'keys';
                  targetHandle?: string;
                  combo: string;
                };
          };
          result?: {
            actionId: string;
            state: 'not_dispatched' | 'dispatched' | 'failed' | 'uncertain';
            verification: 'satisfied' | 'unsatisfied' | 'unknown';
            postObservationId?: string;
            errorCode?:
              | 'ai_disabled'
              | 'permission_required'
              | 'desktop_busy'
              | 'unsupported_target'
              | 'unsupported_display_configuration'
              | 'runtime_not_ready'
              | 'model_not_ready'
              | 'target_not_found'
              | 'target_ambiguous'
              | 'invalid_grounding_output'
              | 'stale_observation'
              | 'focus_changed'
              | 'action_not_authorized'
              | 'action_cancelled'
              | 'execution_uncertain'
              | 'verification_failed'
              | 'backend_unavailable'
              | 'resource_limit'
              | 'protocol_mismatch'
              | 'planner_mode_unavailable'
              | 'stop_hotkey_unavailable'
              | 'host_elevated';
            dispatchedAt?: string;
          };
        }
      | {
          name: 'computer_verify';
          description: string;
          input?: {
            sessionId: string;
            expectedState: string;
            observationId?: string;
          };
          result?: {
            verification: 'satisfied' | 'unsatisfied' | 'unknown';
            evidence?: string;
          };
        }
      | {
          name: 'computer_request_handoff';
          description: string;
          input?: {
            sessionId: string;
            reason: string;
          };
          result?: {
            sessionId: string;
            inputRevoked: true;
          };
        }
      | {
          name: 'computer_resume_after_handoff';
          description: string;
          input?: {
            sessionId: string;
          };
          result?: {
            sessionId: string;
            observationId: string;
          };
        }
      | {
          name: 'computer_stop_session';
          description: string;
          input?: {
            sessionId: string;
          };
          result?: {
            sessionId: string;
            stopped: true;
          };
        }
    ),
    (
      | {
          name: 'computer_capabilities';
          description: string;
          input?: {};
          result?: DesktopBackendCapabilities;
        }
      | {
          name: 'computer_start_session';
          description: string;
          input?: {
            targetRef: string;
            purpose: string;
          };
          result?: {
            sessionId: string;
            scopedCapabilities: DesktopBackendCapabilities1;
          };
        }
      | {
          name: 'computer_observe';
          description: string;
          input?: {
            sessionId: string;
            mode?: 'local_only' | 'visual_planner';
          };
          result?: {
            observationId: string;
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
            state?: {
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
          };
        }
      | {
          name: 'computer_find';
          description: string;
          input?: {
            sessionId: string;
            observationId: string;
            targetDescription: string;
          };
          result?:
            | {
                targetHandle: string;
                groundingSource: 'accessibility' | 'vision';
                evidenceSummary?: string;
              }
            | {
                errorCode: 'target_not_found' | 'target_ambiguous';
              };
        }
      | {
          name: 'computer_act';
          description: string;
          input?: {
            sessionId: string;
            targetHandle: string;
            actionId: string;
            action:
              | {
                  kind: 'click';
                  targetHandle: string;
                  button?: 'left' | 'right' | 'middle';
                  count?: number;
                }
              | {
                  kind: 'type';
                  targetHandle?: string;
                  text: string;
                }
              | {
                  kind: 'scroll';
                  targetHandle: string;
                  direction: 'up' | 'down' | 'left' | 'right';
                  amount: number;
                }
              | {
                  kind: 'move';
                  targetHandle: string;
                }
              | {
                  kind: 'drag';
                  fromHandle: string;
                  toHandle: string;
                }
              | {
                  kind: 'keys';
                  targetHandle?: string;
                  combo: string;
                };
          };
          result?: {
            actionId: string;
            state: 'not_dispatched' | 'dispatched' | 'failed' | 'uncertain';
            verification: 'satisfied' | 'unsatisfied' | 'unknown';
            postObservationId?: string;
            errorCode?:
              | 'ai_disabled'
              | 'permission_required'
              | 'desktop_busy'
              | 'unsupported_target'
              | 'unsupported_display_configuration'
              | 'runtime_not_ready'
              | 'model_not_ready'
              | 'target_not_found'
              | 'target_ambiguous'
              | 'invalid_grounding_output'
              | 'stale_observation'
              | 'focus_changed'
              | 'action_not_authorized'
              | 'action_cancelled'
              | 'execution_uncertain'
              | 'verification_failed'
              | 'backend_unavailable'
              | 'resource_limit'
              | 'protocol_mismatch'
              | 'planner_mode_unavailable'
              | 'stop_hotkey_unavailable'
              | 'host_elevated';
            dispatchedAt?: string;
          };
        }
      | {
          name: 'computer_verify';
          description: string;
          input?: {
            sessionId: string;
            expectedState: string;
            observationId?: string;
          };
          result?: {
            verification: 'satisfied' | 'unsatisfied' | 'unknown';
            evidence?: string;
          };
        }
      | {
          name: 'computer_request_handoff';
          description: string;
          input?: {
            sessionId: string;
            reason: string;
          };
          result?: {
            sessionId: string;
            inputRevoked: true;
          };
        }
      | {
          name: 'computer_resume_after_handoff';
          description: string;
          input?: {
            sessionId: string;
          };
          result?: {
            sessionId: string;
            observationId: string;
          };
        }
      | {
          name: 'computer_stop_session';
          description: string;
          input?: {
            sessionId: string;
          };
          result?: {
            sessionId: string;
            stopped: true;
          };
        }
    ),
    (
      | {
          name: 'computer_capabilities';
          description: string;
          input?: {};
          result?: DesktopBackendCapabilities;
        }
      | {
          name: 'computer_start_session';
          description: string;
          input?: {
            targetRef: string;
            purpose: string;
          };
          result?: {
            sessionId: string;
            scopedCapabilities: DesktopBackendCapabilities1;
          };
        }
      | {
          name: 'computer_observe';
          description: string;
          input?: {
            sessionId: string;
            mode?: 'local_only' | 'visual_planner';
          };
          result?: {
            observationId: string;
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
            state?: {
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
          };
        }
      | {
          name: 'computer_find';
          description: string;
          input?: {
            sessionId: string;
            observationId: string;
            targetDescription: string;
          };
          result?:
            | {
                targetHandle: string;
                groundingSource: 'accessibility' | 'vision';
                evidenceSummary?: string;
              }
            | {
                errorCode: 'target_not_found' | 'target_ambiguous';
              };
        }
      | {
          name: 'computer_act';
          description: string;
          input?: {
            sessionId: string;
            targetHandle: string;
            actionId: string;
            action:
              | {
                  kind: 'click';
                  targetHandle: string;
                  button?: 'left' | 'right' | 'middle';
                  count?: number;
                }
              | {
                  kind: 'type';
                  targetHandle?: string;
                  text: string;
                }
              | {
                  kind: 'scroll';
                  targetHandle: string;
                  direction: 'up' | 'down' | 'left' | 'right';
                  amount: number;
                }
              | {
                  kind: 'move';
                  targetHandle: string;
                }
              | {
                  kind: 'drag';
                  fromHandle: string;
                  toHandle: string;
                }
              | {
                  kind: 'keys';
                  targetHandle?: string;
                  combo: string;
                };
          };
          result?: {
            actionId: string;
            state: 'not_dispatched' | 'dispatched' | 'failed' | 'uncertain';
            verification: 'satisfied' | 'unsatisfied' | 'unknown';
            postObservationId?: string;
            errorCode?:
              | 'ai_disabled'
              | 'permission_required'
              | 'desktop_busy'
              | 'unsupported_target'
              | 'unsupported_display_configuration'
              | 'runtime_not_ready'
              | 'model_not_ready'
              | 'target_not_found'
              | 'target_ambiguous'
              | 'invalid_grounding_output'
              | 'stale_observation'
              | 'focus_changed'
              | 'action_not_authorized'
              | 'action_cancelled'
              | 'execution_uncertain'
              | 'verification_failed'
              | 'backend_unavailable'
              | 'resource_limit'
              | 'protocol_mismatch'
              | 'planner_mode_unavailable'
              | 'stop_hotkey_unavailable'
              | 'host_elevated';
            dispatchedAt?: string;
          };
        }
      | {
          name: 'computer_verify';
          description: string;
          input?: {
            sessionId: string;
            expectedState: string;
            observationId?: string;
          };
          result?: {
            verification: 'satisfied' | 'unsatisfied' | 'unknown';
            evidence?: string;
          };
        }
      | {
          name: 'computer_request_handoff';
          description: string;
          input?: {
            sessionId: string;
            reason: string;
          };
          result?: {
            sessionId: string;
            inputRevoked: true;
          };
        }
      | {
          name: 'computer_resume_after_handoff';
          description: string;
          input?: {
            sessionId: string;
          };
          result?: {
            sessionId: string;
            observationId: string;
          };
        }
      | {
          name: 'computer_stop_session';
          description: string;
          input?: {
            sessionId: string;
          };
          result?: {
            sessionId: string;
            stopped: true;
          };
        }
    ),
    (
      | {
          name: 'computer_capabilities';
          description: string;
          input?: {};
          result?: DesktopBackendCapabilities;
        }
      | {
          name: 'computer_start_session';
          description: string;
          input?: {
            targetRef: string;
            purpose: string;
          };
          result?: {
            sessionId: string;
            scopedCapabilities: DesktopBackendCapabilities1;
          };
        }
      | {
          name: 'computer_observe';
          description: string;
          input?: {
            sessionId: string;
            mode?: 'local_only' | 'visual_planner';
          };
          result?: {
            observationId: string;
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
            state?: {
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
          };
        }
      | {
          name: 'computer_find';
          description: string;
          input?: {
            sessionId: string;
            observationId: string;
            targetDescription: string;
          };
          result?:
            | {
                targetHandle: string;
                groundingSource: 'accessibility' | 'vision';
                evidenceSummary?: string;
              }
            | {
                errorCode: 'target_not_found' | 'target_ambiguous';
              };
        }
      | {
          name: 'computer_act';
          description: string;
          input?: {
            sessionId: string;
            targetHandle: string;
            actionId: string;
            action:
              | {
                  kind: 'click';
                  targetHandle: string;
                  button?: 'left' | 'right' | 'middle';
                  count?: number;
                }
              | {
                  kind: 'type';
                  targetHandle?: string;
                  text: string;
                }
              | {
                  kind: 'scroll';
                  targetHandle: string;
                  direction: 'up' | 'down' | 'left' | 'right';
                  amount: number;
                }
              | {
                  kind: 'move';
                  targetHandle: string;
                }
              | {
                  kind: 'drag';
                  fromHandle: string;
                  toHandle: string;
                }
              | {
                  kind: 'keys';
                  targetHandle?: string;
                  combo: string;
                };
          };
          result?: {
            actionId: string;
            state: 'not_dispatched' | 'dispatched' | 'failed' | 'uncertain';
            verification: 'satisfied' | 'unsatisfied' | 'unknown';
            postObservationId?: string;
            errorCode?:
              | 'ai_disabled'
              | 'permission_required'
              | 'desktop_busy'
              | 'unsupported_target'
              | 'unsupported_display_configuration'
              | 'runtime_not_ready'
              | 'model_not_ready'
              | 'target_not_found'
              | 'target_ambiguous'
              | 'invalid_grounding_output'
              | 'stale_observation'
              | 'focus_changed'
              | 'action_not_authorized'
              | 'action_cancelled'
              | 'execution_uncertain'
              | 'verification_failed'
              | 'backend_unavailable'
              | 'resource_limit'
              | 'protocol_mismatch'
              | 'planner_mode_unavailable'
              | 'stop_hotkey_unavailable'
              | 'host_elevated';
            dispatchedAt?: string;
          };
        }
      | {
          name: 'computer_verify';
          description: string;
          input?: {
            sessionId: string;
            expectedState: string;
            observationId?: string;
          };
          result?: {
            verification: 'satisfied' | 'unsatisfied' | 'unknown';
            evidence?: string;
          };
        }
      | {
          name: 'computer_request_handoff';
          description: string;
          input?: {
            sessionId: string;
            reason: string;
          };
          result?: {
            sessionId: string;
            inputRevoked: true;
          };
        }
      | {
          name: 'computer_resume_after_handoff';
          description: string;
          input?: {
            sessionId: string;
          };
          result?: {
            sessionId: string;
            observationId: string;
          };
        }
      | {
          name: 'computer_stop_session';
          description: string;
          input?: {
            sessionId: string;
          };
          result?: {
            sessionId: string;
            stopped: true;
          };
        }
    ),
    (
      | {
          name: 'computer_capabilities';
          description: string;
          input?: {};
          result?: DesktopBackendCapabilities;
        }
      | {
          name: 'computer_start_session';
          description: string;
          input?: {
            targetRef: string;
            purpose: string;
          };
          result?: {
            sessionId: string;
            scopedCapabilities: DesktopBackendCapabilities1;
          };
        }
      | {
          name: 'computer_observe';
          description: string;
          input?: {
            sessionId: string;
            mode?: 'local_only' | 'visual_planner';
          };
          result?: {
            observationId: string;
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
            state?: {
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
          };
        }
      | {
          name: 'computer_find';
          description: string;
          input?: {
            sessionId: string;
            observationId: string;
            targetDescription: string;
          };
          result?:
            | {
                targetHandle: string;
                groundingSource: 'accessibility' | 'vision';
                evidenceSummary?: string;
              }
            | {
                errorCode: 'target_not_found' | 'target_ambiguous';
              };
        }
      | {
          name: 'computer_act';
          description: string;
          input?: {
            sessionId: string;
            targetHandle: string;
            actionId: string;
            action:
              | {
                  kind: 'click';
                  targetHandle: string;
                  button?: 'left' | 'right' | 'middle';
                  count?: number;
                }
              | {
                  kind: 'type';
                  targetHandle?: string;
                  text: string;
                }
              | {
                  kind: 'scroll';
                  targetHandle: string;
                  direction: 'up' | 'down' | 'left' | 'right';
                  amount: number;
                }
              | {
                  kind: 'move';
                  targetHandle: string;
                }
              | {
                  kind: 'drag';
                  fromHandle: string;
                  toHandle: string;
                }
              | {
                  kind: 'keys';
                  targetHandle?: string;
                  combo: string;
                };
          };
          result?: {
            actionId: string;
            state: 'not_dispatched' | 'dispatched' | 'failed' | 'uncertain';
            verification: 'satisfied' | 'unsatisfied' | 'unknown';
            postObservationId?: string;
            errorCode?:
              | 'ai_disabled'
              | 'permission_required'
              | 'desktop_busy'
              | 'unsupported_target'
              | 'unsupported_display_configuration'
              | 'runtime_not_ready'
              | 'model_not_ready'
              | 'target_not_found'
              | 'target_ambiguous'
              | 'invalid_grounding_output'
              | 'stale_observation'
              | 'focus_changed'
              | 'action_not_authorized'
              | 'action_cancelled'
              | 'execution_uncertain'
              | 'verification_failed'
              | 'backend_unavailable'
              | 'resource_limit'
              | 'protocol_mismatch'
              | 'planner_mode_unavailable'
              | 'stop_hotkey_unavailable'
              | 'host_elevated';
            dispatchedAt?: string;
          };
        }
      | {
          name: 'computer_verify';
          description: string;
          input?: {
            sessionId: string;
            expectedState: string;
            observationId?: string;
          };
          result?: {
            verification: 'satisfied' | 'unsatisfied' | 'unknown';
            evidence?: string;
          };
        }
      | {
          name: 'computer_request_handoff';
          description: string;
          input?: {
            sessionId: string;
            reason: string;
          };
          result?: {
            sessionId: string;
            inputRevoked: true;
          };
        }
      | {
          name: 'computer_resume_after_handoff';
          description: string;
          input?: {
            sessionId: string;
          };
          result?: {
            sessionId: string;
            observationId: string;
          };
        }
      | {
          name: 'computer_stop_session';
          description: string;
          input?: {
            sessionId: string;
          };
          result?: {
            sessionId: string;
            stopped: true;
          };
        }
    ),
    (
      | {
          name: 'computer_capabilities';
          description: string;
          input?: {};
          result?: DesktopBackendCapabilities;
        }
      | {
          name: 'computer_start_session';
          description: string;
          input?: {
            targetRef: string;
            purpose: string;
          };
          result?: {
            sessionId: string;
            scopedCapabilities: DesktopBackendCapabilities1;
          };
        }
      | {
          name: 'computer_observe';
          description: string;
          input?: {
            sessionId: string;
            mode?: 'local_only' | 'visual_planner';
          };
          result?: {
            observationId: string;
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
            state?: {
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
          };
        }
      | {
          name: 'computer_find';
          description: string;
          input?: {
            sessionId: string;
            observationId: string;
            targetDescription: string;
          };
          result?:
            | {
                targetHandle: string;
                groundingSource: 'accessibility' | 'vision';
                evidenceSummary?: string;
              }
            | {
                errorCode: 'target_not_found' | 'target_ambiguous';
              };
        }
      | {
          name: 'computer_act';
          description: string;
          input?: {
            sessionId: string;
            targetHandle: string;
            actionId: string;
            action:
              | {
                  kind: 'click';
                  targetHandle: string;
                  button?: 'left' | 'right' | 'middle';
                  count?: number;
                }
              | {
                  kind: 'type';
                  targetHandle?: string;
                  text: string;
                }
              | {
                  kind: 'scroll';
                  targetHandle: string;
                  direction: 'up' | 'down' | 'left' | 'right';
                  amount: number;
                }
              | {
                  kind: 'move';
                  targetHandle: string;
                }
              | {
                  kind: 'drag';
                  fromHandle: string;
                  toHandle: string;
                }
              | {
                  kind: 'keys';
                  targetHandle?: string;
                  combo: string;
                };
          };
          result?: {
            actionId: string;
            state: 'not_dispatched' | 'dispatched' | 'failed' | 'uncertain';
            verification: 'satisfied' | 'unsatisfied' | 'unknown';
            postObservationId?: string;
            errorCode?:
              | 'ai_disabled'
              | 'permission_required'
              | 'desktop_busy'
              | 'unsupported_target'
              | 'unsupported_display_configuration'
              | 'runtime_not_ready'
              | 'model_not_ready'
              | 'target_not_found'
              | 'target_ambiguous'
              | 'invalid_grounding_output'
              | 'stale_observation'
              | 'focus_changed'
              | 'action_not_authorized'
              | 'action_cancelled'
              | 'execution_uncertain'
              | 'verification_failed'
              | 'backend_unavailable'
              | 'resource_limit'
              | 'protocol_mismatch'
              | 'planner_mode_unavailable'
              | 'stop_hotkey_unavailable'
              | 'host_elevated';
            dispatchedAt?: string;
          };
        }
      | {
          name: 'computer_verify';
          description: string;
          input?: {
            sessionId: string;
            expectedState: string;
            observationId?: string;
          };
          result?: {
            verification: 'satisfied' | 'unsatisfied' | 'unknown';
            evidence?: string;
          };
        }
      | {
          name: 'computer_request_handoff';
          description: string;
          input?: {
            sessionId: string;
            reason: string;
          };
          result?: {
            sessionId: string;
            inputRevoked: true;
          };
        }
      | {
          name: 'computer_resume_after_handoff';
          description: string;
          input?: {
            sessionId: string;
          };
          result?: {
            sessionId: string;
            observationId: string;
          };
        }
      | {
          name: 'computer_stop_session';
          description: string;
          input?: {
            sessionId: string;
          };
          result?: {
            sessionId: string;
            stopped: true;
          };
        }
    ),
    (
      | {
          name: 'computer_capabilities';
          description: string;
          input?: {};
          result?: DesktopBackendCapabilities;
        }
      | {
          name: 'computer_start_session';
          description: string;
          input?: {
            targetRef: string;
            purpose: string;
          };
          result?: {
            sessionId: string;
            scopedCapabilities: DesktopBackendCapabilities1;
          };
        }
      | {
          name: 'computer_observe';
          description: string;
          input?: {
            sessionId: string;
            mode?: 'local_only' | 'visual_planner';
          };
          result?: {
            observationId: string;
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
            state?: {
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
          };
        }
      | {
          name: 'computer_find';
          description: string;
          input?: {
            sessionId: string;
            observationId: string;
            targetDescription: string;
          };
          result?:
            | {
                targetHandle: string;
                groundingSource: 'accessibility' | 'vision';
                evidenceSummary?: string;
              }
            | {
                errorCode: 'target_not_found' | 'target_ambiguous';
              };
        }
      | {
          name: 'computer_act';
          description: string;
          input?: {
            sessionId: string;
            targetHandle: string;
            actionId: string;
            action:
              | {
                  kind: 'click';
                  targetHandle: string;
                  button?: 'left' | 'right' | 'middle';
                  count?: number;
                }
              | {
                  kind: 'type';
                  targetHandle?: string;
                  text: string;
                }
              | {
                  kind: 'scroll';
                  targetHandle: string;
                  direction: 'up' | 'down' | 'left' | 'right';
                  amount: number;
                }
              | {
                  kind: 'move';
                  targetHandle: string;
                }
              | {
                  kind: 'drag';
                  fromHandle: string;
                  toHandle: string;
                }
              | {
                  kind: 'keys';
                  targetHandle?: string;
                  combo: string;
                };
          };
          result?: {
            actionId: string;
            state: 'not_dispatched' | 'dispatched' | 'failed' | 'uncertain';
            verification: 'satisfied' | 'unsatisfied' | 'unknown';
            postObservationId?: string;
            errorCode?:
              | 'ai_disabled'
              | 'permission_required'
              | 'desktop_busy'
              | 'unsupported_target'
              | 'unsupported_display_configuration'
              | 'runtime_not_ready'
              | 'model_not_ready'
              | 'target_not_found'
              | 'target_ambiguous'
              | 'invalid_grounding_output'
              | 'stale_observation'
              | 'focus_changed'
              | 'action_not_authorized'
              | 'action_cancelled'
              | 'execution_uncertain'
              | 'verification_failed'
              | 'backend_unavailable'
              | 'resource_limit'
              | 'protocol_mismatch'
              | 'planner_mode_unavailable'
              | 'stop_hotkey_unavailable'
              | 'host_elevated';
            dispatchedAt?: string;
          };
        }
      | {
          name: 'computer_verify';
          description: string;
          input?: {
            sessionId: string;
            expectedState: string;
            observationId?: string;
          };
          result?: {
            verification: 'satisfied' | 'unsatisfied' | 'unknown';
            evidence?: string;
          };
        }
      | {
          name: 'computer_request_handoff';
          description: string;
          input?: {
            sessionId: string;
            reason: string;
          };
          result?: {
            sessionId: string;
            inputRevoked: true;
          };
        }
      | {
          name: 'computer_resume_after_handoff';
          description: string;
          input?: {
            sessionId: string;
          };
          result?: {
            sessionId: string;
            observationId: string;
          };
        }
      | {
          name: 'computer_stop_session';
          description: string;
          input?: {
            sessionId: string;
          };
          result?: {
            sessionId: string;
            stopped: true;
          };
        }
    )
  ];
}
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
    accessibility: 'granted' | 'denied' | 'not_determined' | 'unsupported_platform';
    screenRecording: 'granted' | 'denied' | 'not_determined' | 'unsupported_platform';
    inputMonitoring: 'granted' | 'denied' | 'not_determined' | 'unsupported_platform';
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
/**
 * Backend/protocol versions, supported actions, permissions, grounder state and planner mode reported by computer_capabilities (design §3.1).
 */
export interface DesktopBackendCapabilities1 {
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
    accessibility: 'granted' | 'denied' | 'not_determined' | 'unsupported_platform';
    screenRecording: 'granted' | 'denied' | 'not_determined' | 'unsupported_platform';
    inputMonitoring: 'granted' | 'denied' | 'not_determined' | 'unsupported_platform';
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
