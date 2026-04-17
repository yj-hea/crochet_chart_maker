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

/** 단 방향에 해당하는 부호. forward=CCW(-1), reverse=CW(+1) */
function directionSign(dir: 'forward' | 'reverse' | undefined): 1 | -1 {
  return dir === 'reverse' ? 1 : -1;
}

export interface CircularOptions {
  stitchArc?: number;
  minRadius?: number;
}

export function layoutCircular(
  rounds: ExpandedRound[],
  opts: CircularOptions = {},
): LayoutResult {
  const minRadius = opts.minRadius ?? FIRST_RING_RADIUS;

  // 1) 각 단의 슬롯 수(시각 기준), baseRadius 사전 계산
  const slotCountByRound = new Map<number, number>();
  const baseRadiusByRound = new Map<number, number>();
  let currentBase = minRadius;

  for (const round of rounds) {
    const slots = round.ops.reduce((sum, op) => sum + visualProduceFor(op), 0);
    slotCountByRound.set(round.index, slots);
    baseRadiusByRound.set(round.index, currentBase);

    // 다음 단의 baseRadius = 심볼 높이 + 여백. 짧은 코도 최소 간격 보장.
    const MIN_RING_SPACING = 48;
    const ROUND_GAP = 30;
    const MIN_SLOT_SPACING = 16; // 슬롯 간 최소 간격 (px)
    const maxSymH = round.ops.reduce((max, op) => {
      if (op.kind === 'MAGIC') return max;
      return Math.max(max, effectiveSymH(op));
    }, 5);
    const heightBased = Math.max(maxSymH * 2 + ROUND_GAP, MIN_RING_SPACING);

    // 다음 단의 슬롯 수가 많으면 원주가 충분하도록 반지름 보장
    const nextRound = rounds[rounds.indexOf(round) + 1];
    const nextSlots = nextRound
      ? nextRound.ops.reduce((s, op) => s + visualProduceFor(op), 0)
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

  // 3) `[^...]` 기둥코 후처리 — 세로 스택으로 쌓기
  repositionTurningChainColumns(stitches, baseRadiusByRound);

  // 4) 사슬 호: 연속된 CHAIN 만 대상, top-to-top anchor (기둥코는 제외)
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

/** op 의 실제 심볼 반높이. V/A 에 baseKind 있으면 그 stitch 의 높이 사용. */
function effectiveSymH(op: Op): number {
  if ((op.kind === 'INC' || op.kind === 'DEC') && op.baseKind) {
    return STITCH_META[op.baseKind].symbolHalfHeight;
  }
  return STITCH_META[op.kind].symbolHalfHeight;
}

/**
 * op 가 링에서 차지하는 시각적 슬롯 수.
 * MAGIC/SKIP/기둥코 연속 op 는 링 슬롯을 차지하지 않음. 그 외는 produce 와 일치.
 */
function visualProduceFor(op: Op): number {
  if (op.kind === 'MAGIC' || op.kind === 'SKIP') return 0;
  if (op.turningChain) return op.sameHoleContinuation ? 0 : 1;
  return op.produce;
}

/** 기호 하단이 baseRadius에 맞도록 심볼 반높이만큼 밀어냄 */
function stitchRadius(baseRadius: number, op: Op): number {
  return baseRadius + effectiveSymH(op);
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
  const dirSign = directionSign(round.direction);

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

    // SKIP: 부모 N개만 건너뛰고 중간 반경에 마커 배치
    if (op.kind === 'SKIP') {
      const skipParents: number[] = [];
      for (let k = 0; k < op.consume; k++) {
        const p = parentSlotMap[parentCursor + k];
        if (p !== undefined) skipParents.push(p);
      }
      parentCursor += op.consume;

      // 건너뛴 부모들의 평균 각도, 현재/이전 단 사이 중간 반경에 배치
      let sumX = 0, sumY = 0;
      for (const pi of skipParents) {
        sumX += stitches[pi]!.position.x;
        sumY += stitches[pi]!.position.y;
      }
      const nParents = skipParents.length;
      const prevBase = baseRadiusByRound.get(roundIdx - 1) ?? 0;
      const midR = nParents > 0 ? (prevBase + baseRadius) / 2 : baseRadius;
      let pos: Point;
      let markerAngle = START_ANGLE;
      if (nParents > 0) {
        const cx = sumX / nParents;
        const cy = sumY / nParents;
        const d = Math.sqrt(cx * cx + cy * cy);
        if (d > 0.001) {
          pos = { x: (cx * midR) / d, y: (cy * midR) / d };
          markerAngle = Math.atan2(pos.y, pos.x);
        } else {
          pos = polarToCartesian(midR, START_ANGLE);
        }
      } else {
        pos = polarToCartesian(midR, START_ANGLE);
      }

      const idx = stitches.length;
      stitches.push({
        op, roundIndex: roundIdx,
        position: pos, angle: markerAngle + Math.PI / 2,
        parentIndices: skipParents, exposedSlots: 0,
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

    const vSlots = visualProduceFor(op);

    // 링 슬롯을 차지하지 않는 op (예: 기둥코 continuation). 부모 각도 옆에 임시 배치 — 후처리에서 이동.
    if (vSlots === 0) {
      const refStitch = parents.length > 0 ? stitches[parents[0]!] : undefined;
      let pos: Point;
      let angle = 0;
      if (refStitch) {
        const parentAngle = Math.atan2(refStitch.position.y, refStitch.position.x);
        const r = baseRadius + STITCH_META[op.kind].symbolHalfHeight;
        const angOff = op.sameHoleContinuation ? 0.04 : 0;
        pos = polarToCartesian(r, parentAngle + angOff);
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

    const startSlot = slotCursor;
    const endSlot = slotCursor + vSlots - 1;
    const startAngle = angleAt(startSlot, ringSlots, dirSign);
    const endAngle = angleAt(endSlot, ringSlots, dirSign);
    const midAngle = (startAngle + endAngle) / 2;

    const r = stitchRadius(baseRadius, op);
    const pos = polarToCartesian(r, midAngle);

    // V/A 는 부모 방향에 맞춰 기울이기 (연결선 각도와 일치)
    let symbolAngle = midAngle + Math.PI / 2;
    if ((op.kind === 'INC' || op.kind === 'DEC') && parents.length > 0) {
      let pxSum = 0, pySum = 0;
      for (const pi of parents) {
        pxSum += stitches[pi]!.position.x;
        pySum += stitches[pi]!.position.y;
      }
      const parentMid = { x: pxSum / parents.length, y: pySum / parents.length };
      const dx = parentMid.x - pos.x;
      const dy = parentMid.y - pos.y;
      symbolAngle = Math.atan2(dy, dx) - Math.PI / 2;
    }

    // exposedSlots 는 다음 단 부모 매핑용 — 실제 produce 기준. SLIP 은 시각 슬롯 1개지만 produce=0.
    const idx = stitches.length;
    stitches.push({
      op, roundIndex: roundIdx,
      position: pos, angle: symbolAngle,
      parentIndices: parents, exposedSlots: op.produce,
    });
    thisStitchIndices.push(idx);
    slotCursor += vSlots;
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
// `[^...]` / `tc(...)` 기둥코 세로 스택 재배치
// ============================================================

/**
 * 기둥코 그룹: turningChain=true 로 마킹된 op 들을 첫 op 의 슬롯 각도에서
 * 바깥 방향으로 세로 스택(사슬 기둥)으로 배치.
 *
 * 첫 op(sameHoleContinuation=false)가 해당 슬롯의 정상 각도에 놓여 있으므로,
 * 그 각도를 기준으로 모든 op 를 r=baseR+symH, baseR+3·symH, ... 에 쌓는다.
 */
function repositionTurningChainColumns(
  stitches: PositionedStitch[],
  baseRadiusByRound: Map<number, number>,
): void {
  for (let i = 0; i < stitches.length; i++) {
    const s = stitches[i]!;
    if (!s.op.turningChain) continue;
    if (s.op.sameHoleContinuation) continue;

    // 그룹 수집: 같은 단 내 뒤따르는 turningChain + sameHoleContinuation 연속
    const groupIndices: number[] = [i];
    for (let j = i + 1; j < stitches.length; j++) {
      const t = stitches[j]!;
      if (t.roundIndex !== s.roundIndex) break;
      if (!t.op.turningChain) break;
      if (!t.op.sameHoleContinuation) break;
      groupIndices.push(j);
    }

    const baseR = baseRadiusByRound.get(s.roundIndex) ?? FIRST_RING_RADIUS;
    const columnAngle = Math.atan2(s.position.y, s.position.x);
    const chainSymH = STITCH_META['CHAIN'].symbolHalfHeight;

    for (let k = 0; k < groupIndices.length; k++) {
      const cs = stitches[groupIndices[k]!]!;
      const r = baseR + chainSymH + k * chainSymH * 2;
      cs.position = polarToCartesian(r, columnAngle);
      cs.angle = columnAngle + Math.PI / 2;
    }

    i = groupIndices[groupIndices.length - 1]!;
  }
}

// ============================================================
// 사슬 호(arc) 재배치 — 순수 CHAIN 연속만, top-to-top
// ============================================================

/** 기호의 바깥쪽 끝(top) 좌표. */
function stitchTop(s: PositionedStitch): Point {
  const symH = effectiveSymH(s.op);
  const r = Math.sqrt(s.position.x * s.position.x + s.position.y * s.position.y);
  if (r < 0.001) return { x: s.position.x, y: s.position.y };
  const k = (r + symH) / r;
  return { x: s.position.x * k, y: s.position.y * k };
}

/**
 * 연속된 CHAIN ops 를 찾아 양쪽 anchor 의 top 사이를 바깥쪽으로 볼록한 호로 연결.
 * 사슬 기호를 호 위에 균등 배치. 기둥코/same-hole CHAIN 은 제외.
 * SLIP 이 CHAIN 연속을 끊으면 그 구간은 arc 대상에서 제외 (SLIP 은 제자리).
 */
function repositionChainArcs(stitches: PositionedStitch[]): void {
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

function repositionChainArcsInRound(stitches: PositionedStitch[], indices: number[]): void {
  const isArcChain = (s: PositionedStitch | undefined): boolean => {
    if (!s) return false;
    if (s.op.inSameHoleGroup || s.op.turningChain) return false;
    return s.op.kind === 'CHAIN';
  };

  let runStart = -1;
  for (let i = 0; i <= indices.length; i++) {
    const idx = i < indices.length ? indices[i] : undefined;
    const st = idx !== undefined ? stitches[idx] : undefined;
    const isChain = isArcChain(st);
    if (isChain && runStart < 0) {
      runStart = i;
    } else if (!isChain && runStart >= 0) {
      const runLen = i - runStart;
      // 왼쪽 anchor: runStart-1, 오른쪽 anchor: i (원형 wrap)
      const leftIdx = runStart > 0 ? indices[runStart - 1]! : indices[indices.length - 1]!;
      const rightIdx = i < indices.length ? indices[i]! : indices[0]!;
      const leftS = stitches[leftIdx]!;
      const rightS = stitches[rightIdx]!;

      // 양쪽 모두 chain(드문 경우: 전체가 chain) 이면 스킵
      if (isArcChain(leftS) && isArcChain(rightS)) { runStart = -1; continue; }

      const leftTop = stitchTop(leftS);
      const rightTop = stitchTop(rightS);

      // bezier midpoint 가 top 반지름에 닿도록 C 위치 계산
      const midX = (leftTop.x + rightTop.x) / 2;
      const midY = (leftTop.y + rightTop.y) / 2;
      const midDist = Math.sqrt(midX * midX + midY * midY);
      const leftR = Math.sqrt(leftTop.x ** 2 + leftTop.y ** 2);
      const rightR = Math.sqrt(rightTop.x ** 2 + rightTop.y ** 2);
      const targetR = Math.max(leftR, rightR);
      const cR = 2 * targetR - midDist;
      let cx: number, cy: number;
      if (midDist < 0.001) { cx = cR; cy = 0; }
      else { const k = cR / midDist; cx = midX * k; cy = midY * k; }

      const CHAIN_SPACING = 11;
      const tValues = sampleByArcLength(leftTop, { x: cx, y: cy }, rightTop, runLen, CHAIN_SPACING);

      for (let j = 0; j < runLen; j++) {
        const t = tValues[j]!;
        const bx = bezierQuad(leftTop.x, cx, rightTop.x, t);
        const by = bezierQuad(leftTop.y, cy, rightTop.y, t);
        const sIdx = indices[runStart + j]!;
        const s = stitches[sIdx]!;
        s.position = { x: bx, y: by };
        const tx = bezierQuadDeriv(leftTop.x, cx, rightTop.x, t);
        const ty = bezierQuadDeriv(leftTop.y, cy, rightTop.y, t);
        s.angle = Math.atan2(ty, tx);
      }
      runStart = -1;
    }
  }
}

/** 베지어 위에 arc-length 등간격으로 count 개 점의 t 값 반환. 곡선 중앙 정렬. */
function sampleByArcLength(
  p0: Point, c: Point, p1: Point, count: number, spacing: number,
): number[] {
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
  const groupLen = (count - 1) * spacing;
  const startLen = (totalLen - groupLen) / 2;
  const result: number[] = [];
  for (let j = 0; j < count; j++) {
    const target = Math.max(0, Math.min(totalLen, startLen + j * spacing));
    let lo = 0;
    for (let k = 1; k < table.length; k++) {
      if (table[k]!.len >= target) { lo = k - 1; break; }
      lo = k - 1;
    }
    const a = table[lo]!;
    const b = table[lo + 1] ?? a;
    const seg = b.len - a.len;
    const frac = seg > 0 ? (target - a.len) / seg : 0;
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

function angleAt(i: number, total: number, sign: 1 | -1): number {
  if (total <= 0) return START_ANGLE;
  return START_ANGLE + sign * ((2 * Math.PI * i) / total);
}

function polarToCartesian(r: number, angle: number): Point {
  return { x: r * Math.cos(angle), y: r * Math.sin(angle) };
}
