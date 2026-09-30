/** GENERATED from contracts/ — do not edit; regenerate with npm run contracts:build. */
export type ToolName =
  | 'computer_capabilities'
  | 'computer_start_session'
  | 'computer_observe'
  | 'computer_find'
  | 'computer_act'
  | 'computer_verify'
  | 'computer_request_handoff'
  | 'computer_resume_after_handoff'
  | 'computer_stop_session';

/**
 * The complete model-visible tool surface for computer use (design §3.1). Exactly these nine tools: the array holds nine entries and each required name appears at least once, so the surface is enforced exactly. No raw backend tool is advertised as a planner tool (CU-PLUGIN-02).
 */
export interface PublicToolSurface {
  contractVersion: 1;
  /**
   * @minItems 9
   * @maxItems 9
   */
  tools: {
    [k: string]: unknown;
  } & [ToolEntry, ToolEntry, ToolEntry, ToolEntry, ToolEntry, ToolEntry, ToolEntry, ToolEntry, ToolEntry];
}
export interface ToolEntry {
  name: ToolName;
  description: string;
  input?: {};
  result?: {};
}
