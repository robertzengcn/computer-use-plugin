/** GENERATED from contracts/ — do not edit; regenerate with npm run contracts:build. */
/**
 * Pin record for a native backend source (Windows-MCP or the macOS helper). Everything but status:'pinned' makes entrypoints and packaging fail closed.
 */
export type BackendUpstreamLock = {
  [k: string]: unknown;
} & {
  $schema?: string;
  status: 'unpinned' | 'pinned';
  component: string;
  upstream: string;
  selectedRevision?: string | null;
  sourceSha256?: string | null;
  patchSetDigest?: string | null;
  pythonVersion?: string | null;
  dependencyLockSha256?: string | null;
  dependencyLock?: string | null;
  inspectedConstraints?: {
    [k: string]: unknown;
  };
  notes?: string;
};
