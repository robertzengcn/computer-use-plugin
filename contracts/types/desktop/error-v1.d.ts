/** GENERATED from contracts/ — do not edit; regenerate with npm run contracts:build. */
/**
 * Stable error contract for desktop backends and public tools (design §3.3). Safe messages only: no tracebacks, secrets, image bytes, absolute paths or argv.
 */
export type DesktopBackendError = {
  [k: string]: unknown;
} & {
  errorCode:
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
  message: string;
  stage:
    | 'startup'
    | 'initialization'
    | 'readiness'
    | 'observation'
    | 'grounding'
    | 'dispatch'
    | 'completion'
    | 'cancellation'
    | 'shutdown';
  retryClass: 'none' | 'retry_same' | 'retry_after_reobserve' | 'handoff';
  correlationId: string;
  reason?: 'elevated_window' | 'own_window' | 'protected_view' | 'unsupported_app' | 'unsupported_display';
  readiness?: string;
};
