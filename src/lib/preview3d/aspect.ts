/**
 * 코 하나의 실제 편물 비율 — 3D 미리보기 전용.
 *
 * `STITCH_META.symbolHalfHeight` 와 **다른 값이다**. 저쪽은 도안 기호의 규격으로,
 * 기둥코 개수 관례(sc=1, hdc=2, dc=3, tr=4, dtr=5)를 그대로 그림에 옮긴 1:2:3:4:5 이다.
 * 실제로 떠 보면 실을 한 번 더 감을 때마다 높이가 한 단위씩 붙는 게 아니라 기둥이
 * 늘어나는 만큼만 붙어서, 증가폭이 점점 완만해진다 (1:1.5:2:2.7:3.4).
 *
 * 단위는 **코 폭 1** 이다. 폭은 바늘과 실이 정하므로 코 종류와 거의 무관하고,
 * 달라지는 건 높이뿐이다. 절대 크기(cm)는 게이지에서 따로 곱한다.
 */

import type { Op } from '$lib/expand/op';
import type { StitchKind } from '$lib/model/stitch-kind';

/** 코 폭 1 기준 높이. 게이지·실 종류에 따라 ±15% 는 정상 범위다. */
const HEIGHT: Partial<Record<StitchKind, number>> = {
  MAGIC: 0,
  CHAIN: 0.5,
  SLIP: 0.25,
  SC: 1.0,
  HDC: 1.5,
  DC: 2.0,
  TR: 2.7,
  DTR: 3.4,
  // 팝콘·버블은 한길긴뜨기 여러 개를 한 구멍에 모은 것이라 높이는 dc 와 같다
  POPCORN: 2.0,
  BUBBLE: 2.0,
};

/** 코 폭. 대부분 1 이고, 사슬·빼뜨기만 좁다. */
const WIDTH: Partial<Record<StitchKind, number>> = {
  MAGIC: 0,
  CHAIN: 0.6,
  SLIP: 0.8,
  // 팝콘·버블은 부풀어서 옆으로도 자리를 더 먹는다
  POPCORN: 1.3,
  BUBBLE: 1.3,
};

/**
 * `tr(N)` 처럼 실을 N 번 감는 코의 높이.
 *
 * dc(1회) 2.0 · tr(2회) 2.7 · dtr(3회) 3.4 — 감을 때마다 0.7 씩 붙는 직선이라
 * 네길·다섯길 긴뜨기도 같은 기울기로 이어 쓴다.
 */
function heightByYarnOver(yarnOverCount: number): number {
  return 2.0 + 0.7 * (yarnOverCount - 1);
}

/** V/A 는 자기 높이가 아니라 **바탕 코**의 높이를 따른다 (`2V^3` 은 짧은뜨기 3개) */
function resolveKind(op: Op): StitchKind {
  if ((op.kind === 'INC' || op.kind === 'DEC') && op.baseKind) return op.baseKind;
  return op.kind;
}

/** 이 코의 높이 (코 폭 단위) */
export function stitchHeight(op: Op): number {
  const kind = resolveKind(op);
  if ((kind === 'TR' || kind === 'DTR') && op.yarnOverCount !== undefined) {
    return heightByYarnOver(op.yarnOverCount);
  }
  return HEIGHT[kind] ?? 1.0;
}

/**
 * 이 코가 **윗변에서** 차지하는 폭 (코 폭 단위).
 *
 * 아랫변이 아니라 윗변인 게 중요하다. `V`(늘림)는 한 구멍에서 시작하지만 위로는
 * 코 두 개만큼 벌어지고, `A`(줄임)는 두 구멍을 먹지만 위로는 한 코다. 다음 단이
 * 올라앉는 건 윗변이므로, 단의 둘레를 정하는 것도 윗변이다.
 *
 * 매직링은 코가 아니라 1단이 모이는 점이라 0 이다.
 */
export function stitchTopWidth(op: Op): number {
  const base = WIDTH[resolveKind(op)] ?? 1.0;
  if (op.kind === 'MAGIC') return 0;
  return base * Math.max(1, op.produce);
}

/**
 * 편물의 두께 (코 폭 단위).
 *
 * 편물 두께는 대략 실 굵기의 2배이고, 실 굵기는 코 폭의 1/4 쯤이다.
 * 코 종류와 무관하게 실이 정하므로 상수로 둔다.
 */
export const FABRIC_THICKNESS = 0.5;
