/**
 * Parser AST node types.
 *
 * 문법(EBNF, 요약):
 *   round     ::= sequence
 *   sequence  ::= element ("," element)*
 *   element   ::= count? operand expansion?
 *   operand   ::= stitch | modifier stitch | "(" sequence ")"
 *   expansion ::= "^" NUMBER           (V/A에만)
 *   repeat    ::= "(" sequence ")" "*" NUMBER
 */

import type { StitchKind, ModifierKind } from '$lib/model/stitch';
import type { ParseError, SourceRange } from '$lib/model/errors';

export type AstNode = StitchNode | RepeatNode | SequenceNode;

export interface StitchNode {
  type: 'stitch';
  kind: StitchKind;
  /** 앞 숫자 (반복) — 기본 1 */
  count: number;
  /** `^N` — V/A에서만 사용. undefined이면 기본 확장(V=2, A=2) */
  expansion?: number;
  /** 선행 수식자 (blo 등) */
  modifier?: ModifierKind;
  range: SourceRange;
}

export interface RepeatNode {
  type: 'repeat';
  body: SequenceNode;
  /** `*N` */
  count: number;
  range: SourceRange;
}

export interface SequenceNode {
  type: 'sequence';
  elements: Array<StitchNode | RepeatNode>;
  range: SourceRange;
}

/**
 * 하나의 단(round)에 대한 파싱 결과.
 */
export interface ParsedRound {
  /** 1-based 단 번호 */
  index: number;
  /** 원본 텍스트 (해당 단만) */
  source: string;
  /** 파싱된 AST. 전면 실패 시 undefined */
  body?: SequenceNode;
  /** 점진적 파싱에서 마지막 정상 세그먼트까지 잘라서 성공적으로 파싱된 AST */
  lastValid?: SequenceNode;
  /** 수집된 에러들 */
  errors: ParseError[];
}
