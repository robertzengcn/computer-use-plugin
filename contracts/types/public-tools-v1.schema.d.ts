/** GENERATED from contracts/ — do not edit; regenerate with npm run contracts:build. */
/**
 * The complete model-visible tool surface for computer use (design §3.1). Exactly these nine tools; no raw backend tool is advertised as a planner tool (CU-PLUGIN-02).
 */
export type PublicToolSurface = {
  [k: string]: unknown;
} & {
  contractVersion: 1;
  /**
   * @minItems 9
   * @maxItems 9
   */
  tools: [ToolEntry, ToolEntry, ToolEntry, ToolEntry, ToolEntry, ToolEntry, ToolEntry, ToolEntry, ToolEntry];
};
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

export interface ToolEntry {
  name: ToolName;
  description: string;
  input?: {
    [k: string]: string | number | boolean;
  };
  result?: {
    [k: string]: unknown;
  };
}
