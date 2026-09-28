/** GENERATED from contracts/ — do not edit; regenerate with npm run contracts:build. */
export type LicenceId = 'apache-2.0' | 'mit' | 'bsd-3-clause' | 'other-commercial-ok' | 'qwen-research-non-commercial';

/**
 * A model package is a set of individually hashed files, not an archive (design §6.4). This manifest records the full reproducibility and licence identity; release tooling blocks non-commercial licence chains (CU-INST-11).
 */
export interface GroundingModelPackageManifest {
  packageKind: 'grounding-model';
  runtimeId: string;
  version: string;
  upstream: {
    modelId: string;
    revision: string;
    licence: LicenceId;
    baseModel: {
      modelId: string;
      licence: LicenceId;
    };
  };
  identity: {
    groundingContractVersion: number;
    adapterId: string;
    architecture: string;
    manifestVersion: number;
    preprocessingRevision: string;
    decodingRevision: string;
    calibrationRevision: string;
  };
  export: {
    pipelineVersion: string;
    exporter: string;
    opset: number;
    quantization: 'fp16' | 'int8-weight-only' | 'int4-weight-only-decoder-fp16-vision' | 'none';
  };
  preprocessing: {
    patchSize: 14;
    mergeSize: 2;
    temporalPatchSize: 2;
    pointerPadTokenId: 151661;
    pixelBounds: {
      minWidthPx: number;
      maxWidthPx: number;
      minHeightPx: number;
      maxHeightPx: number;
    };
    defaultPixelBudget: number;
  };
  /**
   * @minItems 1
   * @maxItems 8
   */
  graphs:
    | [
        {
          name: string;
          /**
           * @minItems 1
           */
          inputs: [string, ...string[]];
          /**
           * @minItems 1
           */
          outputs: [string, ...string[]];
        }
      ]
    | [
        {
          name: string;
          /**
           * @minItems 1
           */
          inputs: [string, ...string[]];
          /**
           * @minItems 1
           */
          outputs: [string, ...string[]];
        },
        {
          name: string;
          /**
           * @minItems 1
           */
          inputs: [string, ...string[]];
          /**
           * @minItems 1
           */
          outputs: [string, ...string[]];
        }
      ]
    | [
        {
          name: string;
          /**
           * @minItems 1
           */
          inputs: [string, ...string[]];
          /**
           * @minItems 1
           */
          outputs: [string, ...string[]];
        },
        {
          name: string;
          /**
           * @minItems 1
           */
          inputs: [string, ...string[]];
          /**
           * @minItems 1
           */
          outputs: [string, ...string[]];
        },
        {
          name: string;
          /**
           * @minItems 1
           */
          inputs: [string, ...string[]];
          /**
           * @minItems 1
           */
          outputs: [string, ...string[]];
        }
      ]
    | [
        {
          name: string;
          /**
           * @minItems 1
           */
          inputs: [string, ...string[]];
          /**
           * @minItems 1
           */
          outputs: [string, ...string[]];
        },
        {
          name: string;
          /**
           * @minItems 1
           */
          inputs: [string, ...string[]];
          /**
           * @minItems 1
           */
          outputs: [string, ...string[]];
        },
        {
          name: string;
          /**
           * @minItems 1
           */
          inputs: [string, ...string[]];
          /**
           * @minItems 1
           */
          outputs: [string, ...string[]];
        },
        {
          name: string;
          /**
           * @minItems 1
           */
          inputs: [string, ...string[]];
          /**
           * @minItems 1
           */
          outputs: [string, ...string[]];
        }
      ]
    | [
        {
          name: string;
          /**
           * @minItems 1
           */
          inputs: [string, ...string[]];
          /**
           * @minItems 1
           */
          outputs: [string, ...string[]];
        },
        {
          name: string;
          /**
           * @minItems 1
           */
          inputs: [string, ...string[]];
          /**
           * @minItems 1
           */
          outputs: [string, ...string[]];
        },
        {
          name: string;
          /**
           * @minItems 1
           */
          inputs: [string, ...string[]];
          /**
           * @minItems 1
           */
          outputs: [string, ...string[]];
        },
        {
          name: string;
          /**
           * @minItems 1
           */
          inputs: [string, ...string[]];
          /**
           * @minItems 1
           */
          outputs: [string, ...string[]];
        },
        {
          name: string;
          /**
           * @minItems 1
           */
          inputs: [string, ...string[]];
          /**
           * @minItems 1
           */
          outputs: [string, ...string[]];
        }
      ]
    | [
        {
          name: string;
          /**
           * @minItems 1
           */
          inputs: [string, ...string[]];
          /**
           * @minItems 1
           */
          outputs: [string, ...string[]];
        },
        {
          name: string;
          /**
           * @minItems 1
           */
          inputs: [string, ...string[]];
          /**
           * @minItems 1
           */
          outputs: [string, ...string[]];
        },
        {
          name: string;
          /**
           * @minItems 1
           */
          inputs: [string, ...string[]];
          /**
           * @minItems 1
           */
          outputs: [string, ...string[]];
        },
        {
          name: string;
          /**
           * @minItems 1
           */
          inputs: [string, ...string[]];
          /**
           * @minItems 1
           */
          outputs: [string, ...string[]];
        },
        {
          name: string;
          /**
           * @minItems 1
           */
          inputs: [string, ...string[]];
          /**
           * @minItems 1
           */
          outputs: [string, ...string[]];
        },
        {
          name: string;
          /**
           * @minItems 1
           */
          inputs: [string, ...string[]];
          /**
           * @minItems 1
           */
          outputs: [string, ...string[]];
        }
      ]
    | [
        {
          name: string;
          /**
           * @minItems 1
           */
          inputs: [string, ...string[]];
          /**
           * @minItems 1
           */
          outputs: [string, ...string[]];
        },
        {
          name: string;
          /**
           * @minItems 1
           */
          inputs: [string, ...string[]];
          /**
           * @minItems 1
           */
          outputs: [string, ...string[]];
        },
        {
          name: string;
          /**
           * @minItems 1
           */
          inputs: [string, ...string[]];
          /**
           * @minItems 1
           */
          outputs: [string, ...string[]];
        },
        {
          name: string;
          /**
           * @minItems 1
           */
          inputs: [string, ...string[]];
          /**
           * @minItems 1
           */
          outputs: [string, ...string[]];
        },
        {
          name: string;
          /**
           * @minItems 1
           */
          inputs: [string, ...string[]];
          /**
           * @minItems 1
           */
          outputs: [string, ...string[]];
        },
        {
          name: string;
          /**
           * @minItems 1
           */
          inputs: [string, ...string[]];
          /**
           * @minItems 1
           */
          outputs: [string, ...string[]];
        },
        {
          name: string;
          /**
           * @minItems 1
           */
          inputs: [string, ...string[]];
          /**
           * @minItems 1
           */
          outputs: [string, ...string[]];
        }
      ]
    | [
        {
          name: string;
          /**
           * @minItems 1
           */
          inputs: [string, ...string[]];
          /**
           * @minItems 1
           */
          outputs: [string, ...string[]];
        },
        {
          name: string;
          /**
           * @minItems 1
           */
          inputs: [string, ...string[]];
          /**
           * @minItems 1
           */
          outputs: [string, ...string[]];
        },
        {
          name: string;
          /**
           * @minItems 1
           */
          inputs: [string, ...string[]];
          /**
           * @minItems 1
           */
          outputs: [string, ...string[]];
        },
        {
          name: string;
          /**
           * @minItems 1
           */
          inputs: [string, ...string[]];
          /**
           * @minItems 1
           */
          outputs: [string, ...string[]];
        },
        {
          name: string;
          /**
           * @minItems 1
           */
          inputs: [string, ...string[]];
          /**
           * @minItems 1
           */
          outputs: [string, ...string[]];
        },
        {
          name: string;
          /**
           * @minItems 1
           */
          inputs: [string, ...string[]];
          /**
           * @minItems 1
           */
          outputs: [string, ...string[]];
        },
        {
          name: string;
          /**
           * @minItems 1
           */
          inputs: [string, ...string[]];
          /**
           * @minItems 1
           */
          outputs: [string, ...string[]];
        },
        {
          name: string;
          /**
           * @minItems 1
           */
          inputs: [string, ...string[]];
          /**
           * @minItems 1
           */
          outputs: [string, ...string[]];
        }
      ];
  /**
   * @minItems 1
   */
  executionProviders: ['dml' | 'coreml' | 'cpu', ...('dml' | 'coreml' | 'cpu')[]];
  /**
   * @minItems 1
   */
  files: [
    {
      path: string;
      bytes: number;
      sha256: string;
    },
    ...{
      path: string;
      bytes: number;
      sha256: string;
    }[]
  ];
  /**
   * @minItems 1
   */
  licences: [
    {
      component: string;
      licence: LicenceId;
      noticePath: string;
    },
    ...{
      component: string;
      licence: LicenceId;
      noticePath: string;
    }[]
  ];
  parityReport: {
    sha256: string;
    fixtureCount: number;
    status: 'candidate' | 'passed';
  };
  healthFixture: {
    imagePath: string;
    expectedPath: string;
  };
  limits: {
    maxFiles: 128;
    maxTotalBytes: 8589934592;
    maxShardBytes: 536870912;
  };
}
