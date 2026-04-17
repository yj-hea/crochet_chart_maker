/**
 * 원형 도안 레이아웃.
 *
 * 핵심 원칙:
 *   - 각 Op은 정확히 1개의 PositionedStitch를 생성한다.
 *   - 단의 "슬롯"은 단의 totalProduce(생성 코 수)와 같다. 슬롯들은 원주에 균등 각도로 분포.
 *   - 일반 코는 1 슬롯, V(INC^N)는 N 슬롯, A(DEC^N)는 1 슬롯.
 *   - 코 종류별 반지름이 다르다: relativeHeight에 비례 (SC=1.0, DC=2.0 등).
 *   - 사슬(CHAIN) run은 양쪽 anchor 사이를 잇는 안쪽 호(arc)로 재배치.
 */

import type { ExpandedRound, Op } from '$lib/expand/op';
import type { PositionedStitch, Point, LayoutResult, RoundMarker } from './types';
import { FIRST_RING_RADIUS } from './constants';
import { STITCH_META } from '$lib/model/stitch';
import { computeBounds, markerFarPoint } from './bounds';

const MARKER_SIDE_OFFSET = 11;
const START_ANGLE = -Math.PI / 2; // 12시 방향
const DIRECTION = -1;              // 반시계방향(CCW)

export interface CircularOptions {
  stitchArc?: number;
  minRadius?: number;
}

export function layoutCircular(
  rounds: ExpandedRound[],
  opts: CircularOptions = {},
): LayoutResult {
  const minRadius = opts.minRadius ?? FIRST_RING_RADIUS;

  // 1) 각 단의 슬롯 수, baseRadius 사전 계산
  const slotCountByRound = new Map<number, number>();
  const baseRadiusByRound = new Map<number, number>();
  let currentBase = minRadius;

  for (const round of rounds) {
    const slots = round.ops.reduce((sum, op) => sum + op.produce, 0);
    slotCountByRound.set(round.index, slots);
    baseRadiusByRound.set(round.index, currentBase);

    // 다음 단의 baseRadius = 심볼 높이 + 여백. 짧은 코도 최소 간격 보장.
    const MIN_RING_SPACING = 48;
    const ROUND_GAP = 30;
    const MIN_SLOT_SPACING = 16; // 슬롯 간 최소 간격 (px)
    const maxSymH = round.ops.reduce((max, op) => {
      if (op.kind === 'MAGIC') return max;
      return Math.max(max, STITCH_META[op.kind].symbolHalfHeight);
    }, 5);
    const heightBased = Math.max(maxSymH * 2 + ROUND_GAP, MIN_RING_SPACING);

    // 다음 단의 슬롯 수가 많으면 원주가 충분하도록 반지름 보장
    const nextRound = rounds[rounds.indexOf(round) + 1];
    const nextSlots = nextRound
      ? nextRound.ops.reduce((s, op) => s + op.produce, 0)
      : 0;
    const circumBased = nextSlots > 0
      ? Math.max(0, (nextSlots * MIN_SLOT_SPACING) / (2 * Math.PI) - currentBase)
      : 0;

    currentBase += Math.max(heightBased, circumBased);
  }

  // 2) 각 단 배치
  const stitches: PositionedStitch[] = [];
  const roundMarkers: RoundMarker[] = [];
  const slotMapByRound = new Map<number, number[]>();

  for (const round of rounds) {
    placeRound(round, stitches, slotMapByRound, baseRadiusByRound, slotCountByRound, roundMarkers);
  }

  // 3) same-hole 사슬 기둥 (turning chain) 후처리
  repositionTurningChains(stitches, baseRadiusByRound);

  // 4) same-hole SLIP 밀착 배치
  repositionSameHoleSlips(stitches, baseRadiusByRound);

  // 5) 사슬 호 후처리
  repositionChainArcs(stitches);

  // 5) 마커 위치 재계산 (후처리로 stitch 위치가 바뀌었을 수 있음)
  for (const m of roundMarkers) {
    const mExt = m as RoundMarker & { _stitchIdx?: number };
    if (mExt._stitchIdx !== undefined) {
      const s = stitches[mExt._stitchIdx]!;
      m.position = { x: s.position.x + MARKER_SIDE_OFFSET, y: s.position.y };
      delete mExt._stitchIdx;
    }
  }

  // 6) 바운딩 + 그리드 가이드
  const bounds = computeBounds([
    ...stitches.map((s) => s.position),
    ...roundMarkers.map((m) => m.position),
    ...roundMarkers.map(markerFarPoint),
  ]);

  const ringRadii: number[] = [];
  for (const round of rounds) {
    const n = slotCountByRound.get(round.index) ?? 0;
    if (n > 0) ringRadii.push(baseRadiusByRound.get(round.index) ?? 0);
  }
  const sectorCount = ringRadii.length === 0
    ? 0
    : (() => {
        for (const r of rounds) {
          const n = slotCountByRound.get(r.index) ?? 0;
          if (n > 0) return n;
        }
        return 0;
      })();

  return {
    stitches,
    bounds,
    gridGuide: { type: 'concentric', ringRadii, sectorCount },
    roundMarkers,
  };
}

/** 기호 하단이 baseRadius에 맞도록 심볼 반높이만큼 밀어냄 */
function stitchRadius(baseRadius: number, op: Op): number {
  return baseRadius + STITCH_META[op.kind].symbolHalfHeight;
}

function placeRound(
  round: ExpandedRound,
  stitches: PositionedStitch[],
  slotMapByRound: Map<number, number[]>,
  baseRadiusByRound: Map<number, number>,
  slotCountByRound: Map<number, number>,
  roundMarkers: RoundMarker[],
): void {
  const { index: roundIdx } = round;
  const ringSlots = slotCountByRound.get(roundIdx) ?? 0;
  const baseRadius = baseRadiusByRound.get(roundIdx) ?? FIRST_RING_RADIUS;

  const parentSlotMap = slotMapByRound.get(roundIdx - 1) ?? [];
  const thisStitchIndices: number[] = [];
  let parentCursor = 0;
  let slotCursor = 0;
  let lastGroupParents: number[] = [];

  for (const op of round.ops) {
    if (op.kind === 'MAGIC') {
      const idx = stitches.length;
      stitches.push({
        op, roundIndex: roundIdx,
        position: { x: 0, y: 0 }, angle: 0,
        parentIndices: [], exposedSlots: 0,
      });
      thisStitchIndices.push(idx);
      continue;
    }

    let parents: number[];
    if (op.sameHoleContinuation) {
      parents = lastGroupParents;
    } else {
      parents = [];
      for (let k = 0; k < op.consume; k++) {
        const p = parentSlotMap[parentCursor + k];
        if (p !== undefined) parents.push(p);
      }
      parentCursor += op.consume;
      lastGroupParents = parents;
    }

    if (op.kind === 'SLIP' || op.produce === 0) {
      const refStitch = parents.length > 0 ? stitches[parents[0]!] : undefined;
      let pos: Point;
      let angle = 0;
      if (refStitch) {
        // SLIP은 현재 단의 baseRadius에 부모 각도 방향으로 배치 (ch와 동일)
        const parentAngle = Math.atan2(refStitch.position.y, refStitch.position.x);
        const slipR = baseRadius + STITCH_META[op.kind].symbolHalfHeight;
        const angOff = op.sameHoleContinuation ? 0.04 : 0;
        pos = polarToCartesian(slipR, parentAngle + angOff);
        angle = parentAngle + angOff + Math.PI / 2;
      } else {
        pos = { x: 0, y: 0 };
      }
      const idx = stitches.length;
      stitches.push({
        op, roundIndex: roundIdx,
        position: pos, angle,
        parentIndices: parents, exposedSlots: 0,
      });
      thisStitchIndices.push(idx);
      continue;
    }

    const slotsOccupied = op.produce;
    const startSlot = slotCursor;
    const endSlot = slotCursor + slotsOccupied - 1;
    const startAngle = angleAt(startSlot, ringSlots);
    const endAngle = angleAt(endSlot, ringSlots);
    const midAngle = (startAngle + endAngle) / 2;

    const r = stitchRadius(baseRadius, op);
    const pos = polarToCartesian(r, midAngle);
    const symbolAngle = midAngle + Math.PI / 2;

    const idx = stitches.length;
    stitches.push({
      op, roundIndex: roundIdx,
      position: pos, angle: symbolAngle,
      parentIndices: parents, exposedSlots: slotsOccupied,
    });
    thisStitchIndices.push(idx);
    slotCursor += slotsOccupied;
  }

  // 슬롯 매핑
  const slotMap: number[] = [];
  for (const sIdx of thisStitchIndices) {
    const s = stitches[sIdx]!;
    for (let k = 0; k < s.exposedSlots; k++) {
      slotMap.push(sIdx);
    }
  }
  slotMapByRound.set(roundIdx, slotMap);

  // 시작 마커: MAGIC, CHAIN, SLIP 제외한 첫 visible stitch
  const firstVisible = thisStitchIndices.find(
    (i) => {
      const k = stitches[i]!.op.kind;
      return k !== 'MAGIC' && k !== 'CHAIN' && k !== 'SLIP' && stitches[i]!.op.produce > 0;
    }
  );
  if (firstVisible !== undefined) {
    roundMarkers.push({
      roundIndex: roundIdx,
      position: { x: 0, y: 0 }, // 후처리에서 재계산
      direction: 'left',
      _stitchIdx: firstVisible, // 임시 참조
    } as RoundMarker & { _stitchIdx: number });
  }
}

// ============================================================
// same-hole SLIP 밀착
// ============================================================

/**
 * same-hole 그룹 내 SLIP(produce=0)을 가장 가까운 produce>0 기호 근처로 이동.
 * 기본 배치에서는 SLIP이 부모 각도에 놓여 그룹 내 다른 기호와 멀어질 수 있음.
 */
function repositionSameHoleSlips(
  stitches: PositionedStitch[],
  _baseRadiusByRound: Map<number, number>,
): void {
  for (let i = 0; i < stitches.length; i++) {
    const s = stitches[i]!;
    if (s.op.kind !== 'SLIP' || !s.op.inSameHoleGroup) continue;

    // 그룹 내 가장 가까운 produce>0 기호 찾기 (앞뒤로 탐색)
    let anchor: PositionedStitch | undefined;
    // 뒤쪽 탐색
    for (let j = i + 1; j < stitches.length; j++) {
      const t = stitches[j]!;
      if (t.roundIndex !== s.roundIndex) break;
      if (!t.op.inSameHoleGroup && !t.op.sameHoleContinuation) break;
      if (t.op.produce > 0 && t.op.kind !== 'SLIP') { anchor = t; break; }
    }
    // 앞쪽 탐색 (fallback)
    if (!anchor) {
      for (let j = i - 1; j >= 0; j--) {
        const t = stitches[j]!;
        if (t.roundIndex !== s.roundIndex) break;
        if (t.op.produce > 0 && t.op.kind !== 'SLIP') { anchor = t; break; }
      }
    }
    if (!anchor) continue;

    // SLIP은 부모 기호 근처에 놓되, 그룹 내 anchor 방향으로 살짝 이동
    // anchor 방향, 현재 단 baseRadius에 배치
    const anchorAngle = Math.atan2(anchor.position.y, anchor.position.x);
    const baseR = _baseRadiusByRound.get(s.roundIndex) ?? FIRST_RING_RADIUS;
    const slipR = baseR + STITCH_META[s.op.kind].symbolHalfHeight;
    const angOff = s.op.sameHoleContinuation ? 0.04 : 0;
    s.position = polarToCartesian(slipR, anchorAngle + angOff);
    s.angle = anchorAngle + angOff + Math.PI / 2;
  }
}

// ============================================================
// same-hole 사슬 기둥 (turning chain) 재배치
// ============================================================

/**
 * [2ch, F] 같은 same-hole 그룹에서 사슬을 F 아래 세로(방사 방향)로 쌓는다.
 * 감지: inSameHoleGroup=true인 CHAIN 연속 뒤에 inSameHoleGroup=true인 non-CHAIN.
 */
function repositionTurningChains(
  stitches: PositionedStitch[],
  baseRadiusByRound: Map<number, number>,
): void {
  for (let i = 0; i < stitches.length; i++) {
    const s = stitches[i]!;
    if (s.op.kind !== 'CHAIN' || !s.op.inSameHoleGroup) continue;
    // group 시작 위치(first consumer 이전)의 chain만 turning chain으로 처리
    if (s.op.sameHoleContinuation) continue;

    // 연속된 CHAIN 수집 (같은 단, sameHoleContinuation=false)
    const chainIndices: number[] = [i];
    let j = i + 1;
    while (j < stitches.length
      && stitches[j]!.op.kind === 'CHAIN'
      && stitches[j]!.op.inSameHoleGroup
      && !stitches[j]!.op.sameHoleContinuation
      && stitches[j]!.roundIndex === s.roundIndex) {
      chainIndices.push(j);
      j++;
    }
    // 뒤에 같은 same-hole 그룹의 non-CHAIN anchor가 있어야 함
    if (j >= stitches.length) continue;
    const anchor = stitches[j]!;
    if (anchor.roundIndex !== s.roundIndex) continue;
    if (!anchor.op.inSameHoleGroup) continue;
    if (anchor.op.kind === 'CHAIN') continue;

    // anchor 아래 공간(baseRadius ~ anchor 위치)에 균등 분포
    const baseR = baseRadiusByRound.get(s.roundIndex) ?? FIRST_RING_RADIUS;
    const anchorAngle = Math.atan2(anchor.position.y, anchor.position.x);
    const count = chainIndices.length;

    // 사슬을 anchor 옆(각도 오프셋)에 세로 배치. DC는 원래 위치 유지.
    const chainSymH = STITCH_META['CHAIN'].symbolHalfHeight;
    // chains는 진행 방향상 anchor 앞(시계방향)에 배치
    const angOffset = 0.22;
    for (let k = 0; k < count; k++) {
      const cs = stitches[chainIndices[k]!]!;
      const r = baseR + chainSymH + k * chainSymH * 2;
      cs.position = polarToCartesian(r, anchorAngle - DIRECTION * angOffset);
      cs.angle = anchorAngle - DIRECTION * angOffset + Math.PI / 2;
    }

    i = j;
  }
}

// ============================================================
// 사슬 호(arc) 재배치
// ============================================================

/**
 * 한 단 안에서 연속된 CHAIN ops를 찾아, 양쪽 non-chain anchor 사이의
 * 안쪽 호(quadratic bezier)로 시각적 위치를 재배치.
 * 슬롯/부모 매핑은 변경하지 않음 — 렌더 위치만 조정.
 */
function repositionChainArcs(stitches: PositionedStitch[]): void {
  // 단별로 그룹핑
  const byRound = new Map<number, number[]>();
  for (let i = 0; i < stitches.length; i++) {
    const ri = stitches[i]!.roundIndex;
    const arr = byRound.get(ri) ?? [];
    arr.push(i);
    byRound.set(ri, arr);
  }

  for (const indices of byRound.values()) {
    repositionChainArcsInRound(stitches, indices);
  }
}

function repositionChainArcsInRound(
  stitches: PositionedStitch[],
  indices: number[],
): void {
  // 연속 CHAIN run 탐지
  let runStart = -1;
  for (let i = 0; i <= indices.length; i++) {
    // turning chain(group 시작 chains)만 arc 처리 제외. group 중간 chains는 arc 대상.
    const st = i < indices.length ? stitches[indices[i]!]! : undefined;
    const isTurningChain = st !== undefined && st.op.inSameHoleGroup && !st.op.sameHoleContinuation;
    const isChain = st !== undefined && st.op.kind === 'CHAIN' && !isTurningChain;
    if (isChain && runStart < 0) {
      runStart = i;
    } else if (!isChain && runStart >= 0) {
      // run: [runStart, i)
      const runLen = i - runStart;
      // 왼쪽 anchor: runStart-1, 오른쪽 anchor: i (원형이므로 wrap)
      const leftIdx = runStart > 0
        ? indices[runStart - 1]!
        : indices[indices.length - 1]!; // wrap
      const rightIdx = i < indices.length
        ? indices[i]!
        : indices[0]!; // wrap

      const leftS = stitches[leftIdx]!;
      const rightS = stitches[rightIdx]!;

      // anchor 중 하나가 CHAIN이면 스킵 (전체가 chain인 단)
      if (leftS.op.kind === 'CHAIN' || rightS.op.kind === 'CHAIN') {
        runStart = -1;
        continue;
      }

      // 바깥쪽 호: 두 anchor의 중점에서 원점 반대 방향(바깥)으로 밀어낸 control point
      const midX = (leftS.position.x + rightS.position.x) / 2;
      const midY = (leftS.position.y + rightS.position.y) / 2;
      const dist = Math.sqrt(midX * midX + midY * midY);
      // 밀어내는 정도: anchor 간 거리의 25% + chain 수에 비례
      const anchorDist = Math.sqrt(
        (rightS.position.x - leftS.position.x) ** 2 +
        (rightS.position.y - leftS.position.y) ** 2
      );
      const outward = anchorDist * 0.25 + runLen * 4;
      const cx = dist > 0 ? midX * (1 + outward / dist) : midX;
      const cy = dist > 0 ? midY * (1 + outward / dist) : midY;

      // arc-length 등간격으로 밀착 배치 (사슬 타원 지름 2*rx=12, 약간 겹쳐서 연결감)
      const CHAIN_SPACING = 11;
      const cp: Point = { x: cx, y: cy };
      const tValues = sampleByArcLength(
        leftS.position, cp, rightS.position, runLen, CHAIN_SPACING,
      );

      for (let j = 0; j < runLen; j++) {
        const t = tValues[j]!;
        const bx = bezierQuad(leftS.position.x, cx, rightS.position.x, t);
        const by = bezierQuad(leftS.position.y, cy, rightS.position.y, t);
        const sIdx = indices[runStart + j]!;
        const s = stitches[sIdx]!;
        s.position = { x: bx, y: by };
        // 사슬 타원의 장축(rx)이 곡선 접선 방향을 따르도록 회전
        const tx = bezierQuadDeriv(leftS.position.x, cx, rightS.position.x, t);
        const ty = bezierQuadDeriv(leftS.position.y, cy, rightS.position.y, t);
        s.angle = Math.atan2(ty, tx);
      }

      runStart = -1;
    }
  }
}

/**
 * 베지어 곡선 위에 arc-length 등간격으로 count개 점의 t값을 반환.
 * spacing px 간격으로 곡선 중앙에 밀착 배치.
 */
function sampleByArcLength(
  p0: Point, c: Point, p1: Point,
  count: number, spacing: number,
): number[] {
  // 1) 곡선을 미세 샘플링하여 arc-length → t 테이블 구축
  const N = 60;
  const table: Array<{ t: number; len: number }> = [{ t: 0, len: 0 }];
  let totalLen = 0;
  let px = p0.x, py = p0.y;
  for (let i = 1; i <= N; i++) {
    const t = i / N;
    const x = bezierQuad(p0.x, c.x, p1.x, t);
    const y = bezierQuad(p0.y, c.y, p1.y, t);
    totalLen += Math.sqrt((x - px) ** 2 + (y - py) ** 2);
    table.push({ t, len: totalLen });
    px = x; py = y;
  }

  // 2) 원하는 총 길이를 곡선 중앙에 정렬
  const chainGroupLen = (count - 1) * spacing;
  const startLen = (totalLen - chainGroupLen) / 2;

  // 3) 각 사슬의 목표 arc-length → t 보간
  const result: number[] = [];
  for (let j = 0; j < count; j++) {
    const target = startLen + j * spacing;
    const clamped = Math.max(0, Math.min(totalLen, target));
    // 선형 보간으로 t 찾기
    let lo = 0;
    for (let k = 1; k < table.length; k++) {
      if (table[k]!.len >= clamped) { lo = k - 1; break; }
      lo = k - 1;
    }
    const a = table[lo]!;
    const b = table[lo + 1] ?? a;
    const seg = b.len - a.len;
    const frac = seg > 0 ? (clamped - a.len) / seg : 0;
    result.push(a.t + frac * (b.t - a.t));
  }
  return result;
}

function bezierQuad(p0: number, c: number, p1: number, t: number): number {
  const mt = 1 - t;
  return mt * mt * p0 + 2 * mt * t * c + t * t * p1;
}

function bezierQuadDeriv(p0: number, c: number, p1: number, t: number): number {
  return 2 * (1 - t) * (c - p0) + 2 * t * (p1 - c);
}

function angleAt(i: number, total: number): number {
  if (total <= 0) return START_ANGLE;
  return START_ANGLE + DIRECTION * ((2 * Math.PI * i) / total);
}

function polarToCartesian(r: number, angle: number): Point {
  return { x: r * Math.cos(angle), y: r * Math.sin(angle) };
}
