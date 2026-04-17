/**
 * Parser AST node types.
 *
 * 문법(EBNF, 요약):
 *   round       ::= sequence
 *   sequence    ::= element ("," element)*
 *   element     ::= stitchElement | repeatElement | sameHoleElement
 *   stitchElement ::= modifier? count? stitch expansion?
 *   repeatElement ::= "(" sequence ")" "*" NUMBER
 *   sameHoleElement ::= count? "[" sequence "]"   (한 코에 여러 기호 적용. 안에 V/A/중첩[] 금지)
 *   expansion   ::= "^" NUMBER                    (V/A에만)
 */

import type { StitchKind, ModifierKind } from '$lib/model/stitch';
import type { ParseError, SourceRange } from '$lib/model/errors';

export type AstNode = StitchNode | RepeatNode | SameHoleGroupNode | SequenceNode;

export interface StitchNode {
  type: 'stitch';
  kind: StitchKind;
  /** 앞 숫자 (반복) — 기본 1 */
  count: number;
  /** `^N` — V/A에서만 사용. undefined이면 기본 확장(V=2, A=2) */
  expansion?: number;
  /** 선행 수식자 (blo 등) */
  modifier?: ModifierKind;
  /** 인라인 코멘트 "..." — 각 코에 대한 주의사항 */
  comment?: string;
  /** 인라인 색상 :#rrggbb — 기호/폰트 색상 (배색 도안용) */
  color?: string;
  range: SourceRange;
}

export interface RepeatNode {
  type: 'repeat';
  body: SequenceNode;
  /** `*N` */
  count: number;
  range: SourceRange;
}

/**
 * `[...]` 한 코 그룹. 그룹 전체가 부모 단 한 코를 공유한다.
 * 예: `[F,T]` = 한 부모 코에 F 한 번 + T 한 번 → consume 1, produce 2.
 * 제약: 안에 V/A 금지, `[...]` 중첩 금지. `(...)` 는 허용.
 */
export interface SameHoleGroupNode {
  type: 'samehole';
  body: SequenceNode;
  /** 앞 숫자 — 그룹 전체를 N번 반복. 예: 3[F,T] → count=3 */
  count: number;
  range: SourceRange;
}

export type ElementNode = StitchNode | RepeatNode | SameHoleGroupNode;

export interface SequenceNode {
  type: 'sequence';
  elements: ElementNode[];
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
