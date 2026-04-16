/**
 * 인접 단 간 의미 오류 검증.
 *
 * 단 N의 totalConsume 과 단 N-1의 totalProduce 를 비교:
 *   - 초과(over_consumed): 부모가 준 것보다 더 많이 소비 → 빨강
 *   - 부족(under_consumed): 부모가 준 것을 다 소비하지 못함 → 노랑
 *
 * 단 1은 부모가 없으므로 검증하지 않는다.
 */

import type { ExpandedRound } from '$lib/expand/op';
import type { ValidationError, SourceRange } from '$lib/model/errors';

/**
 * 현재 단과 이전 단을 비교하여 의미 오류를 반환.
 * 오류가 없으면 빈 배열.
 */
export function validateRound(
  current: ExpandedRound,
  previous: ExpandedRound,
): ValidationError[] {
  const expected = previous.totalProduce;
  const actual = current.totalConsume;

  if (actual === expected) return [];

  if (actual > expected) {
    return [{
      kind: 'over_consumed',
      roundIndex: current.index,
      message: `${previous.index}단의 코 수(${expected}코)를 초과하여 소비합니다 (${actual}코 소비, ${actual - expected}코 초과)`,
      offendingRange: findOverflowRange(current, expected),
      expected,
      actual,
    }];
  }

  // under_consumed
  return [{
    kind: 'under_consumed',
    roundIndex: current.index,
    message: `${previous.index}단의 ${expected}코 중 ${actual}코만 소비합니다 (${expected - actual}코 부족)`,
    expected,
    actual,
  }];
}

/**
 * 초과를 일으킨 Op의 소스 위치를 찾는다.
 * ops를 순회하며 누적 consume이 expected를 넘는 첫 시점의 sourceRange 반환.
 */
function findOverflowRange(
  round: ExpandedRound,
  expected: number,
): SourceRange | undefined {
  let cumulative = 0;
  for (const op of round.ops) {
    cumulative += op.consume;
    if (cumulative > expected) {
      return op.sourceRange;
    }
  }
  return undefined;
}
