/** GENERATED from contracts/ — do not edit; regenerate with npm run contracts:build. */
/**
 * Versioned fixture case records for offline evaluation (design §8.4). Split and consent classification are explicit fields, never inferred from filenames.
 */
export interface EvaluationDatasetManifest {
  schemaVersion: 1;
  datasetId: string;
  version: string;
  description?: string;
  /**
   * @minItems 1
   */
  cases: [
    {
      id: string;
      consentClass: 'synthetic' | 'reviewed';
      split: 'regression' | 'calibration' | 'held_out';
      taskDescription: string;
      contentSha256?: string;
      imageRef?: {
        path: string;
        sha256: string;
      };
      displayMetadata?: {
        scaling: number;
        locale?: string;
        theme?: string;
      };
      expected:
        | {
            kind: 'region';
            region: {
              x: number;
              y: number;
              w: number;
              h: number;
            };
          }
        | {
            kind: 'absent';
          }
        | {
            kind: 'ambiguous';
          };
    },
    ...{
      id: string;
      consentClass: 'synthetic' | 'reviewed';
      split: 'regression' | 'calibration' | 'held_out';
      taskDescription: string;
      contentSha256?: string;
      imageRef?: {
        path: string;
        sha256: string;
      };
      displayMetadata?: {
        scaling: number;
        locale?: string;
        theme?: string;
      };
      expected:
        | {
            kind: 'region';
            region: {
              x: number;
              y: number;
              w: number;
              h: number;
            };
          }
        | {
            kind: 'absent';
          }
        | {
            kind: 'ambiguous';
          };
    }[]
  ];
}
