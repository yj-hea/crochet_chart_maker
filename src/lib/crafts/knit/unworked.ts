/**
 * 되돌아뜨기 단의 **미작업 코(`unw`) 자동 채우기**.
 *
 * 되돌아뜨기 단에서 `unw` 를 줄 앞에 쓸지 뒤에 쓸지, 몇 코를 쓸지는 전부
 * **바늘 상태에서 계산되는 값**이다. 그래서 손으로 적지 않아도 된다 —
 * 뜨는 코만 적으면 여기서 양 끝의 미작업 코를 채워 넣는다.
 *
 *   1단  k11, wt      →  k11, wt, unw7
 *   2단  p4, wt       →  unw7, p4, wt, unw7
 *   3단  k12          →  unw7, k12
 *
 * ## 바늘 상태
 *
 * 단은 늘 한쪽 끝(또는 돌린 자리)에서 반대쪽으로 가고, 돌면 다음 단은 그 자리에서
 * 되돌아온다. 그래서 각 단은 **이어진 한 구간**만 뜨고, 양쪽에 남은 코는 미작업 코다.
 *
 *   - `nearHeld` — 이 단을 시작하는 쪽에 남아 있는 코 → 줄 **앞**의 `unw`
 *   - `farHeld`  — 반대쪽 끝에 남아 있는 코
 *
 * 한 단을 처리하면 바늘이 뒤집히므로, 다음 단의 `nearHeld` 는 이 단이 **뒤에 남긴 코**,
 * `farHeld` 는 이 단이 **앞에 두고 온 코**가 된다 (= 그냥 서로 맞바꾼다).
 *
 * ## 채우는 조건
 *
 * 코 수가 비는 단을 무조건 채우면 오타(`k11` 을 `k1` 로 적은 것)가 조용히 묻힌다.
 * 그래서 **새로 남기는 코가 있을 때는 되돌아뜨기 기호(`wt`·`ds`)가 있어야** 채운다.
 * 이미 남아 있던 코 안에서 끝나는 단(= 그냥 돌리기)은 기호 없이도 채운다.
 * 채우지 않은 단은 지금처럼 코 수 부족 오류로 남는다.
 *
 * `unw` 를 직접 적은 단은 손대지 않는다 — 예전에 적어 둔 도안이 그대로 그려진다.
 */

import type { ExpandedRound, Op } from '$lib/expand/op';

/** 되돌아뜨기 기호 — 이 단에서 돌았다는 표시 */
const TURN_KINDS = new Set(['WRAP_TURN', 'DOUBLE_ST']);

/** 바늘 양 끝에 남은 미작업 코 */
interface Held {
  near: number;
  far: number;
}

/**
 * 단마다 생략된 `unw` 를 채운다.
 *
 * 입력 순서대로 바늘 상태를 따라가므로 **도안 전체**를 한 번에 넘겨야 한다.
 * 이미 채워 둔 op(`autoFilled`)은 걷어내고 다시 계산하므로 여러 번 호출해도 같다.
 */
export function fillUnworked(
  rounds: ReadonlyArray<ExpandedRound | undefined>,
): Array<ExpandedRound | undefined> {
  const held: Held = { near: 0, far: 0 };
  /** 바늘 위 코 수 = 앞 단이 만든 코 수. 1단은 부모가 없다 */
  let onNeedle: number | undefined;

  return rounds.map((round) => {
    if (!round) {
      held.near = held.far = 0;
      onNeedle = undefined;
      return round;
    }
    const written = stripAuto(round);
    const filled = onNeedle === undefined ? written : fillRow(written, onNeedle, held);
    onNeedle = filled.totalProduce;
    return filled;
  });
}

/** 자동으로 채운 op 를 걷어낸 모습 (= 사용자가 적은 그대로) */
function stripAuto(round: ExpandedRound): ExpandedRound {
  if (!round.ops.some((op) => op.autoFilled)) return round;
  return withOps(round, round.ops.filter((op) => !op.autoFilled));
}

function fillRow(round: ExpandedRound, onNeedle: number, held: Held): ExpandedRound {
  const explicit = countExplicit(round.ops);
  if (explicit) {
    // 직접 적은 단 — 그대로 두고 바늘 상태만 따라간다
    swap(held, explicit.lead, explicit.trail);
    return round;
  }

  const missing = onNeedle - round.totalConsume;
  if (missing <= 0) {
    // 다 떴거나(=단이 끝났다) 코 수가 넘친다(=오류) — 남은 코가 없다
    held.near = held.far = 0;
    return round;
  }

  const lead = Math.min(held.near, missing);
  const trail = missing - lead;
  // 새로 남기는 코가 있으면 되돌아뜨기 기호가 있어야 한다
  const turning = round.ops.some((op) => TURN_KINDS.has(op.kind));
  if (trail > held.far && !turning) {
    held.near = held.far = 0;
    return round;
  }

  const ops = [
    ...unworkedOps(lead, round.ops[0]),
    ...round.ops,
    ...unworkedOps(trail, round.ops[round.ops.length - 1]),
  ];
  swap(held, lead, trail);
  return withOps(round, ops);
}

/**
 * 직접 적은 `unw` 가 있으면 줄 앞·뒤 개수를 센다.
 * 가운데에만 있는 `unw` 도 "직접 적었다"로 보고 손대지 않는다.
 */
function countExplicit(ops: ReadonlyArray<Op>): { lead: number; trail: number } | undefined {
  if (!ops.some((op) => op.kind === 'UNWORKED')) return undefined;
  let lead = 0;
  while (lead < ops.length && ops[lead]!.kind === 'UNWORKED') lead++;
  let trail = 0;
  while (trail < ops.length - lead && ops[ops.length - 1 - trail]!.kind === 'UNWORKED') trail++;
  return { lead, trail };
}

/** 바늘을 뒤집는다 — 뒤에 남긴 코가 다음 단의 줄 앞이 된다 */
function swap(held: Held, lead: number, trail: number): void {
  held.near = trail;
  held.far = lead;
}

function unworkedOps(count: number, neighbor: Op | undefined): Op[] {
  if (count <= 0 || !neighbor) return [];
  return Array.from({ length: count }, () => ({
    kind: 'UNWORKED' as const,
    expansion: 1,
    consume: 1,
    produce: 1,
    autoFilled: true,
    // 소스에 없는 코라 가리킬 자리가 없다 — 옆 코의 자리를 빌린다
    sourceRange: neighbor.sourceRange,
  }));
}

function withOps(round: ExpandedRound, ops: Op[]): ExpandedRound {
  let totalConsume = 0;
  let totalProduce = 0;
  for (const op of ops) {
    totalConsume += op.consume;
    totalProduce += op.produce;
  }
  return { ...round, ops, totalConsume, totalProduce };
}
