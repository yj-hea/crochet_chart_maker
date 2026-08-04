/**
 * 편물 마커(`pm`) 를 코 흐름에서 분리한다.
 *
 * 마커는 코가 아니라 **코와 코 사이의 경계**라서 레이아웃이 코로 취급하면 안 된다
 * (원형은 슬롯, 격자는 칸을 하나 잡아먹는다). 그래서 레이아웃 직전에 뽑아내고,
 * "앞에 코가 몇 개 있었는지"만 기억했다가 배치가 끝난 뒤 좌표를 계산한다.
 *
 * 마커는 **단마다 다시 적는다** — 위 단으로 자동 전파하지 않으므로
 * 각 단의 마커 위치는 그 단의 op 목록만으로 결정된다.
 */

import type { Op, ExpandedRound } from '$lib/expand/op';
import type { PositionedStitch, PositionedMarker } from './types';

/** 코 흐름에서 뽑아낸 마커 하나 */
export interface MarkerSlot {
  /** 1-based 단 번호 */
  roundIndex: number;
  /** 이 마커 **앞**에 오는 코의 수. 0 이면 단 맨 앞, 코 수와 같으면 단 맨 뒤 */
  before: number;
  op: Op;
}

export function isMarkerOp(op: Op): boolean {
  return op.kind === 'MARKER';
}

/** 한 단의 op 목록에서 마커를 분리 */
export function splitMarkers(
  ops: readonly Op[],
  roundIndex: number,
): { ops: Op[]; markers: MarkerSlot[] } {
  const out: Op[] = [];
  const markers: MarkerSlot[] = [];
  for (const op of ops) {
    if (isMarkerOp(op)) markers.push({ roundIndex, before: out.length, op });
    else out.push(op);
  }
  return { ops: out, markers };
}

/** 여러 단에서 한꺼번에 분리 */
export function extractMarkers(rounds: readonly ExpandedRound[]): {
  rounds: ExpandedRound[];
  markers: MarkerSlot[];
} {
  const all: MarkerSlot[] = [];
  const cleaned = rounds.map((round) => {
    const { ops, markers } = splitMarkers(round.ops, round.index);
    if (markers.length === 0) return round;
    all.push(...markers);
    return { ...round, ops };
  });
  return { rounds: cleaned, markers: all };
}

/** 단 번호별 코 목록 — 배열 순서(= 작업 순서)를 유지한다 */
function groupByRound(stitches: readonly PositionedStitch[]): Map<number, PositionedStitch[]> {
  const map = new Map<number, PositionedStitch[]>();
  for (const s of stitches) {
    const arr = map.get(s.roundIndex);
    if (arr) arr.push(s);
    else map.set(s.roundIndex, [s]);
  }
  return map;
}

/** 마커 op 이 가진 색/라벨 */
function decorate(slot: MarkerSlot, position: { x: number; y: number }, angle?: number): PositionedMarker {
  return {
    roundIndex: slot.roundIndex,
    position,
    angle,
    color: slot.op.color,
    label: slot.op.comment,
  };
}

/**
 * 원형 배치 — 이웃한 두 코 사이의 각도에 놓는다.
 *
 * 각도는 한 바퀴를 넘어가며 증가하므로(2π 래핑) 먼저 단조 증가하도록 펴고(unwrap)
 * 중간값을 구한다. 단 맨 앞/맨 뒤 경계는 평균 코 간격의 절반만큼 바깥에 둔다.
 */
export function placeCircularMarkers(
  slots: readonly MarkerSlot[],
  stitches: readonly PositionedStitch[],
): PositionedMarker[] {
  const byRound = groupByRound(stitches);
  const out: PositionedMarker[] = [];

  for (const slot of slots) {
    const list = byRound.get(slot.roundIndex);
    if (!list || list.length === 0) continue;

    const radii = list.map((s) => Math.hypot(s.position.x, s.position.y));
    // 각도 unwrap — 이전 각도에서 ±π 안에 들어오도록 2π 를 더하거나 뺀다
    const angles: number[] = [];
    for (const s of list) {
      let a = Math.atan2(s.position.y, s.position.x);
      const prev = angles[angles.length - 1];
      if (prev !== undefined) {
        while (a - prev > Math.PI) a -= 2 * Math.PI;
        while (prev - a > Math.PI) a += 2 * Math.PI;
      }
      angles.push(a);
    }

    const n = angles.length;
    const span = angles[n - 1]! - angles[0]!;
    const gap = n > 1 ? span / (n - 1) : (2 * Math.PI) / Math.max(1, n);
    const b = Math.max(0, Math.min(slot.before, n));

    let angle: number;
    let radius: number;
    if (b === 0) {
      angle = angles[0]! - gap / 2;
      radius = radii[0]!;
    } else if (b >= n) {
      angle = angles[n - 1]! + gap / 2;
      radius = radii[n - 1]!;
    } else {
      angle = (angles[b - 1]! + angles[b]!) / 2;
      radius = (radii[b - 1]! + radii[b]!) / 2;
    }

    out.push(decorate(
      slot,
      { x: radius * Math.cos(angle), y: radius * Math.sin(angle) },
      angle,
    ));
  }
  return out;
}

/** 평면 배치 — 이웃한 두 코 사이의 x 중간. 양 끝은 평균 간격의 절반만큼 바깥. */
export function placeLinearMarkers(
  slots: readonly MarkerSlot[],
  stitches: readonly PositionedStitch[],
): PositionedMarker[] {
  const byRound = groupByRound(stitches);
  const out: PositionedMarker[] = [];

  for (const slot of slots) {
    const list = byRound.get(slot.roundIndex);
    if (!list || list.length === 0) continue;

    const n = list.length;
    const xs = list.map((s) => s.position.x);
    const span = Math.abs(xs[n - 1]! - xs[0]!);
    const gap = n > 1 ? span / (n - 1) : 0;
    const b = Math.max(0, Math.min(slot.before, n));
    // 작업 방향 — 짝수 단은 오른쪽에서 왼쪽으로 진행하므로 부호가 뒤집힌다
    const dir = n > 1 && xs[n - 1]! < xs[0]! ? -1 : 1;

    let x: number;
    let y: number;
    if (b === 0) {
      x = xs[0]! - (dir * gap) / 2;
      y = list[0]!.position.y;
    } else if (b >= n) {
      x = xs[n - 1]! + (dir * gap) / 2;
      y = list[n - 1]!.position.y;
    } else {
      x = (xs[b - 1]! + xs[b]!) / 2;
      y = (list[b - 1]!.position.y + list[b]!.position.y) / 2;
    }

    out.push(decorate(slot, { x, y }));
  }
  return out;
}
