/** GENERATED from contracts/ — do not edit; regenerate with npm run contracts:build. */
/**
 * Exact reviewed Windows launch contract: managed Python entrypoint, unbuffered stdio, managed cwd, disabled telemetry (design §1.3, §4.2).
 */
export type WindowsManagedBackendLaunchProfile = {
  [k: string]: unknown;
} & {
  version: 1;
  transport: 'stdio-jsonrpc';
  /**
   * @minItems 4
   * @maxItems 4
   */
  argv?: [unknown, unknown, unknown, unknown];
  /**
   * @minItems 4
   * @maxItems 4
   */
  argvTemplate?: [unknown, unknown, unknown, unknown];
  cwd: '<managed-env-root>';
  envPolicy: {
    telemetry: 'disabled';
    noGlobalPath: true;
    extra: {
      PYTHONUNBUFFERED: '1';
    };
  };
  stdoutPolicy: 'protocol-only';
  upstreamLockRequired: 'pinned';
  [k: string]: unknown;
};
