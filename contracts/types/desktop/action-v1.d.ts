/** GENERATED from contracts/ — do not edit; regenerate with npm run contracts:build. */
/**
 * Model-visible act payload uses opaque target handles only — raw desktop coordinates exist solely inside the supervisor (design §3.1, CU-PLUGIN-02).
 */
export interface AtomicDesktopActionAndOutcome {
  actionId: string;
  sessionId?: string;
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
  outcome?: {
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
