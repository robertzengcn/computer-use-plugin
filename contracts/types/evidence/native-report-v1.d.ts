/** GENERATED from contracts/ — do not edit; regenerate with npm run contracts:build. */
export type ComputerUseWindowsNativeMacNativeEvidenceReport =
  HttpsAifetchlyDevSchemasComputerUseEvidenceReportCoreV1Json & {
    schema?: 'computer-use-native-report-v1';
    run?: {
      runnerKind?: 'native-controlled';
    };
  };

export interface HttpsAifetchlyDevSchemasComputerUseEvidenceReportCoreV1Json {
  schema: string;
  run: {
    mode: string;
    datasetId: string;
    datasetVersion: string;
    runnerKind: string;
    sourceCommit: string;
    provider: string;
    timestamp?: string;
    hardware?: string;
    consumerBuild?: string;
    artifactDigest?: string;
    [k: string]: unknown;
  };
  configuration: {
    modelConfigurationId: string;
    adapterId: string;
    [k: string]: unknown;
  };
  /**
   * @minItems 1
   */
  cases: [
    {
      caseId: string;
      fixtureHash: string;
      status: 'pass' | 'passed' | 'fail' | 'failed' | 'skipped';
      [k: string]: unknown;
    },
    ...{
      caseId: string;
      fixtureHash: string;
      status: 'pass' | 'passed' | 'fail' | 'failed' | 'skipped';
      [k: string]: unknown;
    }[]
  ];
  aggregate: {
    planned: number;
    executed: number;
    passed: number;
    failed: number;
    skipped: number;
    [k: string]: unknown;
  };
  qualification: {
    missingEvidence: string[];
    producerOnly?: boolean;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}
