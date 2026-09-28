/** GENERATED from contracts/ — do not edit; regenerate with npm run contracts:build. */
/**
 * Either candidates or a typed failure. Candidate geometry is finite and lives in explicitly declared capture_pixels or model_input_pixels — never desktop coordinates (design §3.4.2).
 */
export type GroundingResult = {
  [k: string]: unknown;
} & {
  contractVersion: 1;
  requestId: string;
  sessionGeneration: number;
  observationId: string;
  modelConfigurationId: string;
  /**
   * @maxItems 20
   */
  candidates?:
    | []
    | [Candidate]
    | [Candidate, Candidate]
    | [Candidate, Candidate, Candidate]
    | [Candidate, Candidate, Candidate, Candidate]
    | [Candidate, Candidate, Candidate, Candidate, Candidate]
    | [Candidate, Candidate, Candidate, Candidate, Candidate, Candidate]
    | [Candidate, Candidate, Candidate, Candidate, Candidate, Candidate, Candidate]
    | [Candidate, Candidate, Candidate, Candidate, Candidate, Candidate, Candidate, Candidate]
    | [Candidate, Candidate, Candidate, Candidate, Candidate, Candidate, Candidate, Candidate, Candidate]
    | [Candidate, Candidate, Candidate, Candidate, Candidate, Candidate, Candidate, Candidate, Candidate, Candidate]
    | [
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate
      ]
    | [
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate
      ]
    | [
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate
      ]
    | [
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate
      ]
    | [
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate
      ]
    | [
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate
      ]
    | [
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate
      ]
    | [
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate
      ]
    | [
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate
      ]
    | [
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate,
        Candidate
      ];
  preprocessing?: PreprocessingEvidence;
  diagnostics?: Diagnostics;
  failure?: TypedFailure;
};

export interface Candidate {
  geometry: {
    point: FinitePoint;
    region?: FiniteRegion;
  };
  coordinateSpace: 'capture_pixels' | 'model_input_pixels';
  imageDimensions: {
    widthPx: number;
    heightPx: number;
  };
  /**
   * @minItems 1
   * @maxItems 8
   */
  scores:
    | [
        {
          name: string;
          value: number;
          semantics: 'attention_activation' | 'region_mean_activation' | 'calibrated_probability' | 'diagnostic_raw';
          version: string;
        }
      ]
    | [
        {
          name: string;
          value: number;
          semantics: 'attention_activation' | 'region_mean_activation' | 'calibrated_probability' | 'diagnostic_raw';
          version: string;
        },
        {
          name: string;
          value: number;
          semantics: 'attention_activation' | 'region_mean_activation' | 'calibrated_probability' | 'diagnostic_raw';
          version: string;
        }
      ]
    | [
        {
          name: string;
          value: number;
          semantics: 'attention_activation' | 'region_mean_activation' | 'calibrated_probability' | 'diagnostic_raw';
          version: string;
        },
        {
          name: string;
          value: number;
          semantics: 'attention_activation' | 'region_mean_activation' | 'calibrated_probability' | 'diagnostic_raw';
          version: string;
        },
        {
          name: string;
          value: number;
          semantics: 'attention_activation' | 'region_mean_activation' | 'calibrated_probability' | 'diagnostic_raw';
          version: string;
        }
      ]
    | [
        {
          name: string;
          value: number;
          semantics: 'attention_activation' | 'region_mean_activation' | 'calibrated_probability' | 'diagnostic_raw';
          version: string;
        },
        {
          name: string;
          value: number;
          semantics: 'attention_activation' | 'region_mean_activation' | 'calibrated_probability' | 'diagnostic_raw';
          version: string;
        },
        {
          name: string;
          value: number;
          semantics: 'attention_activation' | 'region_mean_activation' | 'calibrated_probability' | 'diagnostic_raw';
          version: string;
        },
        {
          name: string;
          value: number;
          semantics: 'attention_activation' | 'region_mean_activation' | 'calibrated_probability' | 'diagnostic_raw';
          version: string;
        }
      ]
    | [
        {
          name: string;
          value: number;
          semantics: 'attention_activation' | 'region_mean_activation' | 'calibrated_probability' | 'diagnostic_raw';
          version: string;
        },
        {
          name: string;
          value: number;
          semantics: 'attention_activation' | 'region_mean_activation' | 'calibrated_probability' | 'diagnostic_raw';
          version: string;
        },
        {
          name: string;
          value: number;
          semantics: 'attention_activation' | 'region_mean_activation' | 'calibrated_probability' | 'diagnostic_raw';
          version: string;
        },
        {
          name: string;
          value: number;
          semantics: 'attention_activation' | 'region_mean_activation' | 'calibrated_probability' | 'diagnostic_raw';
          version: string;
        },
        {
          name: string;
          value: number;
          semantics: 'attention_activation' | 'region_mean_activation' | 'calibrated_probability' | 'diagnostic_raw';
          version: string;
        }
      ]
    | [
        {
          name: string;
          value: number;
          semantics: 'attention_activation' | 'region_mean_activation' | 'calibrated_probability' | 'diagnostic_raw';
          version: string;
        },
        {
          name: string;
          value: number;
          semantics: 'attention_activation' | 'region_mean_activation' | 'calibrated_probability' | 'diagnostic_raw';
          version: string;
        },
        {
          name: string;
          value: number;
          semantics: 'attention_activation' | 'region_mean_activation' | 'calibrated_probability' | 'diagnostic_raw';
          version: string;
        },
        {
          name: string;
          value: number;
          semantics: 'attention_activation' | 'region_mean_activation' | 'calibrated_probability' | 'diagnostic_raw';
          version: string;
        },
        {
          name: string;
          value: number;
          semantics: 'attention_activation' | 'region_mean_activation' | 'calibrated_probability' | 'diagnostic_raw';
          version: string;
        },
        {
          name: string;
          value: number;
          semantics: 'attention_activation' | 'region_mean_activation' | 'calibrated_probability' | 'diagnostic_raw';
          version: string;
        }
      ]
    | [
        {
          name: string;
          value: number;
          semantics: 'attention_activation' | 'region_mean_activation' | 'calibrated_probability' | 'diagnostic_raw';
          version: string;
        },
        {
          name: string;
          value: number;
          semantics: 'attention_activation' | 'region_mean_activation' | 'calibrated_probability' | 'diagnostic_raw';
          version: string;
        },
        {
          name: string;
          value: number;
          semantics: 'attention_activation' | 'region_mean_activation' | 'calibrated_probability' | 'diagnostic_raw';
          version: string;
        },
        {
          name: string;
          value: number;
          semantics: 'attention_activation' | 'region_mean_activation' | 'calibrated_probability' | 'diagnostic_raw';
          version: string;
        },
        {
          name: string;
          value: number;
          semantics: 'attention_activation' | 'region_mean_activation' | 'calibrated_probability' | 'diagnostic_raw';
          version: string;
        },
        {
          name: string;
          value: number;
          semantics: 'attention_activation' | 'region_mean_activation' | 'calibrated_probability' | 'diagnostic_raw';
          version: string;
        },
        {
          name: string;
          value: number;
          semantics: 'attention_activation' | 'region_mean_activation' | 'calibrated_probability' | 'diagnostic_raw';
          version: string;
        }
      ]
    | [
        {
          name: string;
          value: number;
          semantics: 'attention_activation' | 'region_mean_activation' | 'calibrated_probability' | 'diagnostic_raw';
          version: string;
        },
        {
          name: string;
          value: number;
          semantics: 'attention_activation' | 'region_mean_activation' | 'calibrated_probability' | 'diagnostic_raw';
          version: string;
        },
        {
          name: string;
          value: number;
          semantics: 'attention_activation' | 'region_mean_activation' | 'calibrated_probability' | 'diagnostic_raw';
          version: string;
        },
        {
          name: string;
          value: number;
          semantics: 'attention_activation' | 'region_mean_activation' | 'calibrated_probability' | 'diagnostic_raw';
          version: string;
        },
        {
          name: string;
          value: number;
          semantics: 'attention_activation' | 'region_mean_activation' | 'calibrated_probability' | 'diagnostic_raw';
          version: string;
        },
        {
          name: string;
          value: number;
          semantics: 'attention_activation' | 'region_mean_activation' | 'calibrated_probability' | 'diagnostic_raw';
          version: string;
        },
        {
          name: string;
          value: number;
          semantics: 'attention_activation' | 'region_mean_activation' | 'calibrated_probability' | 'diagnostic_raw';
          version: string;
        },
        {
          name: string;
          value: number;
          semantics: 'attention_activation' | 'region_mean_activation' | 'calibrated_probability' | 'diagnostic_raw';
          version: string;
        }
      ];
}
export interface FinitePoint {
  x: number;
  y: number;
}
export interface FiniteRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface PreprocessingEvidence {
  crop?: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  resize?: {
    method: 'none' | 'lanczos' | 'bilinear' | 'area';
    outWidthPx: number;
    outHeightPx: number;
  };
  padding?: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
  modelInputDimensions: {
    widthPx: number;
    heightPx: number;
  };
  transformToCapture: {
    scaleX: number;
    scaleY: number;
    offsetX: number;
    offsetY: number;
  };
}
export interface Diagnostics {
  executionProvider: 'dml' | 'coreml' | 'cpu';
  onnxRuntimeVersion?: string;
  inferenceMs: number;
  stageTimings?: {
    [k: string]: number;
  };
  attentionGrid?: {
    width: number;
    height: number;
  };
}
export interface TypedFailure {
  errorCode:
    | 'target_not_found'
    | 'target_ambiguous'
    | 'invalid_grounding_output'
    | 'action_cancelled'
    | 'resource_limit'
    | 'backend_unavailable'
    | 'model_not_ready'
    | 'protocol_mismatch';
  stage: string;
  correlationId?: string;
}
