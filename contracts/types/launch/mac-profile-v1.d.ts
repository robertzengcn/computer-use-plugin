/** GENERATED from contracts/ — do not edit; regenerate with npm run contracts:build. */
/**
 * Exact reviewed Mac helper launch contract: helper mcp vector, managed root, disabled telemetry (design §5.1).
 */
export interface MacHelperLaunchProfile {
  version: 1;
  /**
   * @minItems 2
   * @maxItems 2
   */
  argv: [unknown, unknown];
  cwd: '<managed-env-root>' | '<managed-macos-root>';
  envPolicy?: {
    telemetry?: 'disabled';
  };
  upstreamLockRequired: 'pinned';
  [k: string]: unknown;
}
