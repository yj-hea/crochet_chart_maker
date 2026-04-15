/**
 * 도안 전체 상태 — 단들의 나열.
 */

import type { ParsedRound } from '$lib/parser/ast';
import type { ExpandedRound } from '$lib/expand/op';
import type { ValidationError } from '$lib/model/errors';

export type ShapeKind = 'circular' | 'flat';

export interface Pattern {
  shape: ShapeKind;
  rounds: PatternRound[];
}

export interface PatternRound {
  index: number;      // 1-based
  source: string;     // 원본 텍스트
  parsed?: ParsedRound;
  expanded?: ExpandedRound;
  validationErrors: ValidationError[];
}
