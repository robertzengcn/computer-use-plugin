/**
 * Cross-field semantic rules the JSON Schemas cannot express (2020-12 has no
 * sibling-field comparison): candidate geometry must fit the declared image
 * dimensions, request crops must fit the declared capture (design §3.4.2).
 * Applied by the conformance runner as an additional gate.
 *
 * M01: the implemented rule set is the one DECLARED in
 * contracts/rules/semantic-rules-v1.json — the document ships in the archive
 * for consumers, and declaredRuleIds() + implementedRuleIds() keep code and
 * document from drifting (asserted by contracts:check).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface SemanticViolation {
  readonly rule: string;
  readonly detail: string;
}

interface CandidateShape {
  readonly geometry?: {
    readonly point?: { readonly x: number; readonly y: number };
    readonly region?: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  };
  readonly coordinateSpace?: string;
  readonly imageDimensions?: { readonly widthPx: number; readonly heightPx: number };
}

/** Validate a grounding/result-v1 instance. */
export function checkGroundingResult(instance: unknown): readonly SemanticViolation[] {
  const record = instance as { candidates?: CandidateShape[] };
  const violations: SemanticViolation[] = [];
  for (const [index, candidate] of (record.candidates ?? []).entries()) {
    const dims = candidate.imageDimensions;
    if (dims === undefined) continue;
    const point = candidate.geometry?.point;
    if (point !== undefined) {
      if (point.x < 0 || point.x > dims.widthPx || point.y < 0 || point.y > dims.heightPx) {
        violations.push({
          rule: 'candidate-point-within-image',
          detail: `candidates[${index}] point (${point.x}, ${point.y}) outside declared ${candidate.coordinateSpace} dimensions ${dims.widthPx}x${dims.heightPx}px`,
        });
      }
    }
    const region = candidate.geometry?.region;
    if (region !== undefined) {
      if (
        region.x < 0 ||
        region.y < 0 ||
        region.x + region.w > dims.widthPx ||
        region.y + region.h > dims.heightPx
      ) {
        violations.push({
          rule: 'candidate-region-within-image',
          detail: `candidates[${index}] region (${region.x}, ${region.y}, ${region.w}, ${region.h}) exceeds declared ${candidate.coordinateSpace} dimensions ${dims.widthPx}x${dims.heightPx}px`,
        });
      }
    }
  }
  return violations;
}

/** Validate a grounding/request-v1 instance. */
export function checkGroundingRequest(instance: unknown): readonly SemanticViolation[] {
  const record = instance as {
    image?: {
      widthPx?: number;
      heightPx?: number;
      crop?: { x: number; y: number; w: number; h: number };
    };
  };
  const image = record.image;
  const crop = image?.crop;
  if (image === undefined || crop === undefined) {
    return [];
  }
  if (crop.x + crop.w > (image.widthPx ?? 0) || crop.y + crop.h > (image.heightPx ?? 0)) {
    return [
      {
        rule: 'request-crop-within-capture',
        detail: `crop (${crop.x}, ${crop.y}, ${crop.w}, ${crop.h}) exceeds capture ${image.widthPx}x${image.heightPx}px`,
      },
    ];
  }
  return [];
}


interface RulesDocument {
  readonly version: number;
  readonly rules: readonly { readonly id: string; readonly schema: string }[];
}

let cachedDeclared: readonly string[] | undefined;

/** Rule ids declared by the published semantic-rules document (M01). */
export function declaredRuleIds(contractsDir: string = join(process.cwd(), 'contracts')): readonly string[] {
  if (cachedDeclared === undefined) {
    const document = JSON.parse(
      readFileSync(join(contractsDir, 'rules', 'semantic-rules-v1.json'), 'utf8'),
    ) as RulesDocument;
    cachedDeclared = document.rules.map((rule) => rule.id).sort();
  }
  return cachedDeclared;
}

/** Rule ids this module can actually enforce. */
export function implementedRuleIds(): readonly string[] {
  return ['candidate-point-within-image', 'candidate-region-within-image', 'request-crop-within-capture'].sort();
}
