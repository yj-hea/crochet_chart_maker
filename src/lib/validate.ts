/**
 * 인접 단 간 의미 오류 검증.
 *
 * 단 N의 totalConsume 과 단 N-1의 totalProduce 를 비교:
 *   - 초과(over_consumed): 부모가 준 것보다 더 많이 소비 → 빨강
 *   - 부족(under_consumed): 부모가 준 것을 다 소비하지 못함 → 노랑
 *
 * 단 1은 부모가 없으므로 검증하지 않는다.
 */

import type { ExpandedRound, Op } from '$lib/expand/op';
import type { ValidationError, SourceRange } from '$lib/model/errors';

/**
 * 같은 단 내 standalone chain → 이후 op 가 chain 위에 코를 떠는 (chain-as-parent) 만큼
 * prev 단 consume 에서 제외. queue 시뮬레이션으로 in-round consume 카운트.
 * SKIP 으로 chain 소비된 건 chain 이 장식으로 남아 다음 단 produce 에 노출되니 제외 안 함.
 */
function inRoundChainConsumed(ops: ReadonlyArray<Op>): { consumed: number; hiddenProduce: number } {
  let queue = 0;
  let consumed = 0;
  for (const op of ops) {
    if (op.sameHoleContinuation) continue;
    if (op.kind === 'CHAIN' && !op.inSameHoleGroup && !op.turningChain && op.produce > 0) {
      queue += op.produce;
      continue;
    }
    if (op.consume <= 0) continue;
    const fromQueue = Math.min(queue, op.consume);
    if (fromQueue > 0) {
      queue -= fromQueue;
      consumed += fromQueue;
    }
  }
  // chain queue 에서 consume 된 chain 은 모두 다음 단 부모로 노출 안 됨 (SC 든 SKIP 이든):
  //  - SC on chain: SC 가 새 top, chain 가려짐.
  //  - SKIP on chain: chain 이 장식이지만 위에 코 안 뜸 → 다음 단 부모 못 됨.
  return { consumed, hiddenProduce: consumed };
}

/**
 * 현재 단과 이전 단을 비교하여 의미 오류를 반환.
 * 오류가 없으면 빈 배열.
 */
export function validateRound(
  current: ExpandedRound,
  previous: ExpandedRound,
): ValidationError[] {
  const prevInRound = inRoundChainConsumed(previous.ops);
  const curInRound = inRoundChainConsumed(current.ops);
  // prev 가 다음 단에 노출하는 실 produce = totalProduce - (chain 위에 코로 가려진 만큼).
  const expected = previous.totalProduce - prevInRound.hiddenProduce;
  // 현재 단이 prev 에서 실제 consume = totalConsume - (in-round queue 에서 consume 한 만큼).
  const actual = current.totalConsume - curInRound.consumed;

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
 * chain queue 에서 consume 한 만큼은 prev 누적에 안 더함 — chain-as-parent 의미 일관.
 */
function findOverflowRange(
  round: ExpandedRound,
  expected: number,
): SourceRange | undefined {
  let cumulative = 0;
  let queue = 0;
  for (const op of round.ops) {
    if (op.kind === 'CHAIN' && !op.inSameHoleGroup && !op.turningChain && !op.sameHoleContinuation && op.produce > 0) {
      queue += op.produce;
      continue;
    }
    if (op.sameHoleContinuation) continue;
    if (op.consume <= 0) continue;
    const fromQueue = Math.min(queue, op.consume);
    queue -= fromQueue;
    const fromPrev = op.consume - fromQueue;
    cumulative += fromPrev;
    if (cumulative > expected) {
      return op.sourceRange;
    }
  }
  return undefined;
}
