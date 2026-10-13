/**
 * Canonical evidence-suite registry (B10): assembly, verification, reports
 * and workflows share one mapping from artifact roles to mandatory suites.
 * No more `${role}-native` string surgery yielding `windows-env-native` or
 * `mac-native-native`.
 */
export type ArtifactRole = 'contracts' | 'plugin' | 'windows-env' | 'mac-native' | 'model';

const ROLE_SUITES: Record<ArtifactRole, readonly string[]> = {
  contracts: ['contract-conformance'],
  // N02: the plugin's host surface and its Hub ingestion mapping are
  // independently gated — a model parity report never stands in for them.
  plugin: ['host-consumer', 'hub-ingest'],
  'windows-env': ['windows-native', 'host-consumer'],
  'mac-native': ['mac-native', 'host-consumer'],
  // N02: a model needs parity evidence AND host catalog/adapter/provider
  // acceptance of its exact file set.
  model: ['parity', 'host-consumer'],
};

/** Mandatory suites for a set of shipped roles, sorted and deduplicated. */
export function mandatorySuitesForRoles(roles: readonly string[]): readonly string[] {
  const suites = new Set<string>();
  for (const role of roles) {
    const mapped = (ROLE_SUITES as Record<string, readonly string[]>)[role];
    if (mapped !== undefined) {
      for (const suite of mapped) {
        suites.add(suite);
      }
    }
  }
  return [...suites].sort();
}
