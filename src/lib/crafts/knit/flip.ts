/**
 * 안면(WS) 단 반전.
 *
 * 대바늘 기호도의 대원칙: **차트는 항상 겉면(RS)에서 본 모습**이다.
 * 입력은 "뜨는 대로" 하므로, 안면에서 뜬 단은 표시 전에 두 가지를 뒤집는다:
 *   1. 순서 반전 — 뜬 순서(좌→우)를 차트 좌표(우→좌 기준)로
 *   2. 기호 반전 — 안면에서 뜬 동작을 겉면에서 본 모습으로
 *
 * 규칙은 docs/knit_symbol_system.md §6.2 참조.
 */

import type { Op, ExpandedRound } from '$lib/expand/op';
import type { StitchKind } from '$lib/model/stitch-kind';

/** 안면에서 뜬 코 → 겉면에서 보이는 코 */
const WS_TO_RS: Partial<Record<StitchKind, StitchKind>> = {
  KNIT: 'PURL',
  PURL: 'KNIT',
  KTBL: 'PTBL',
  PTBL: 'KTBL',
  // 줄임: 기욺 방향은 겉면 기준이라 안뜨기/겉뜨기 짝이 서로 바뀐다
  K2TOG: 'SSP',
  SSK: 'P2TOG',
  P2TOG: 'SSK',
  SSP: 'K2TOG',
  // 늘림: 좌/우가 뒤바뀐다
  M1L: 'M1R',
  M1R: 'M1L',
  // YO, SLIP_ST, NO_STITCH, KFB, M1P, CDD 는 불변
};

/** 이 단이 겉면(RS)인지 판정. 원통뜨기는 모든 단이 겉면. */
export function isRightSide(
  shape: string,
  roundIndex: number,
  direction: 'forward' | 'reverse' | undefined,
): boolean {
  // 원통: 항상 겉면
  if (shape !== 'flat') return true;
  // 평면: 홀수단 겉면 / 짝수단 안면. direction='reverse' 는 사용자의 수동 오버라이드.
  const natural = roundIndex % 2 === 1;
  return direction === 'reverse' ? !natural : natural;
}

/** 한 코를 겉면에서 본 모습으로 변환 */
export function flipOp(op: Op): Op {
  const flipped = WS_TO_RS[op.kind];
  return flipped ? { ...op, kind: flipped } : op;
}

/**
 * 표시 순서(왼→오른쪽) 로 정렬된 ops 를 만든다.
 *
 * - 겉면(RS) 단: 오른쪽에서 왼쪽으로 뜨므로, 뜬 순서를 뒤집으면 좌→우가 된다.
 * - 안면(WS) 단: 왼쪽에서 오른쪽으로 뜨므로 뜬 순서가 곧 좌→우. 대신 기호를 겉면 기준으로 반전.
 *
 * `flipSymbols` 가 false 면 기호 반전을 하지 않는다 ("뜨는 대로 표시" 모드).
 */
export function toDisplayOrder(round: ExpandedRound, rightSide: boolean, flipSymbols = true): Op[] {
  if (rightSide) return [...round.ops].reverse();
  return flipSymbols ? round.ops.map(flipOp) : [...round.ops];
}
