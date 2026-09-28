/** GENERATED from contracts/ — do not edit; regenerate with npm run contracts:build. */
export type TypedAction = ClickAction | TypeAction | ScrollAction | MoveAction | DragAction | KeysAction;
export type TargetHandle = string;

/**
 * Model-visible act payload uses opaque target handles only — raw desktop coordinates exist solely inside the supervisor (design §3.1, CU-PLUGIN-02).
 */
export interface AtomicDesktopActionAndOutcome {
  actionId: string;
  sessionId?: string;
  action: TypedAction;
  outcome?: ActionOutcome;
}
export interface ClickAction {
  kind: 'click';
  targetHandle: TargetHandle;
  button?: 'left' | 'right' | 'middle';
  count?: number;
}
export interface TypeAction {
  kind: 'type';
  targetHandle?: TargetHandle;
  text: string;
}
export interface ScrollAction {
  kind: 'scroll';
  targetHandle: TargetHandle;
  direction: 'up' | 'down' | 'left' | 'right';
  amount: number;
}
export interface MoveAction {
  kind: 'move';
  targetHandle: TargetHandle;
}
export interface DragAction {
  kind: 'drag';
  fromHandle: TargetHandle;
  toHandle: TargetHandle;
}
export interface KeysAction {
  kind: 'keys';
  targetHandle?: TargetHandle;
  combo: string;
}
export interface ActionOutcome {
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
}
