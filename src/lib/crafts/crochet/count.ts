/**
 * 코바늘 코 세는 규칙 — 도안을 적는 관행에 맞춘 보정.
 *
 * 코 수는 "뜨는 동작의 수" 가 아니라 **다음 단이 쓸 수 있는 코의 수**다. 그래서 몇몇
 * 동작은 코 수에 들어가지 않는다. 패턴라이터 사용설명서(2장·11-2)의 기준을 따른다.
 *
 * | 동작 | 코 수 |
 * |---|---|
 * | 단을 닫는 **마지막** 빼뜨기 | 세지 않는다 (단 중간의 빼뜨기는 1코) |
 * | 기둥코 1 (`tc(O)`) | 세지 않는다 |
 * | 기둥코 2~5 (`tc(3O)`) | 1코 — 아래 코 하나를 차지한다 |
 * | 추가 기둥코 (`tc+(3O)`) | 1코 — 아래 코를 차지하지 않고 따로 선다 |
 *
 * 기둥코는 expander 가 모양을 알고 있어 거기서 처리하고(`expand/expander.ts`),
 * 단을 닫는 빼뜨기는 **그 단 전체를 봐야** 알 수 있어 여기서 처리한다.
 */

import type { ExpandedRound, Op } from '$lib/expand/op';

/**
 * 단을 닫는 빼뜨기를 코 수에서 뺀다 (0 → 0).
 *
 * 마지막 op 가 빼뜨기일 때만. 그 빼뜨기는 **이 단의 첫 코**에 거는 것이라 아래 단의
 * 코를 쓰지 않고, 다음 단의 부모도 되지 않는다. 기호는 그대로 그려진다.
 */
export function uncountClosingSlip(round: ExpandedRound): ExpandedRound {
  const ops = round.ops;
  if (ops.length < 2) return round;
  const last = ops[ops.length - 1]!;
  if (last.kind !== 'SLIP') return round;
  if (last.consume === 0 && last.produce === 0) return round;

  const next: Op[] = [...ops];
  next[ops.length - 1] = { ...last, consume: 0, produce: 0, closingSlip: true };
  return {
    ...round,
    ops: next,
    totalConsume: round.totalConsume - last.consume,
    totalProduce: round.totalProduce - last.produce,
  };
}

/** 도안 전체에 적용 (CraftDefinition.resolveRounds) */
export function applyCrochetCounting(
  rounds: ReadonlyArray<ExpandedRound | undefined>,
): Array<ExpandedRound | undefined> {
  return rounds.map((r) => (r ? uncountClosingSlip(r) : r));
}
