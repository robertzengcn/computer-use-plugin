/** GENERATED from contracts/ — do not edit; regenerate with npm run contracts:build. */
/**
 * Published serialization for the §3.4.1 lifecycle: capabilities, load, ground, cancel, unload. Discriminated by 'op'; ground reuses the canonical request/result schemas. The executable registry/adapters stay host code (design §3.4) — this document is the shared contract.
 */
export type GroundingWorkerLifecycleOperations =
  | {
      contractVersion: 1;
      op: 'capabilities';
      adapterId: string;
    }
  | {
      contractVersion: 1;
      op: 'load';
      sessionGeneration: number;
      identity: {
        modelConfigurationId: string;
        adapterId: string;
        adapterVersion: string;
        preprocessingRevision: string;
        decodingRevision: string;
        calibrationRevision: string;
        modelManifestSha256?: string;
        onnxRuntimeVersion?: string;
        executionProvider?: 'dml' | 'coreml' | 'cpu';
      };
      providerPreference?: 'dml' | 'coreml' | 'cpu';
    }
  | {
      contractVersion: 1;
      op: 'load';
      loaded: boolean;
      identity: {
        modelConfigurationId: string;
        adapterId: string;
        adapterVersion: string;
        preprocessingRevision: string;
        decodingRevision: string;
        calibrationRevision: string;
        modelManifestSha256?: string;
        onnxRuntimeVersion?: string;
        executionProvider?: 'dml' | 'coreml' | 'cpu';
      };
      selectedProvider?: 'dml' | 'coreml' | 'cpu';
      loadMs?: number;
      memoryEstimateBytes?: number;
      failure?: {
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
      };
    }
  | {
      contractVersion: 1;
      op: 'ground';
      request: GroundingRequest;
    }
  | {
      contractVersion: 1;
      op: 'cancel';
      requestId: string;
      sessionGeneration: number;
    }
  | {
      contractVersion: 1;
      op: 'cancel';
      cancelled: boolean;
      suppressedResult: boolean;
    }
  | {
      contractVersion: 1;
      op: 'unload';
      modelConfigurationId: string;
    }
  | {
      contractVersion: 1;
      op: 'unload';
      released: boolean;
    };

/**
 * Envelope, image reference and task for a ground() call (design §3.4.2). The adapter never receives or returns desktop coordinates.
 */
export interface GroundingRequest {
  contractVersion: 1;
  requestId: string;
  sessionGeneration: number;
  observationId: string;
  modelConfigurationId: string;
  image: {
    format: 'png' | 'jpeg';
    widthPx: number;
    heightPx: number;
    sha256?: string;
    crop?: {
      x: number;
      y: number;
      w: number;
      h: number;
    };
  };
  task: {
    description: string;
    maxCandidates?: number;
    pixelBudget?: number;
  };
}
