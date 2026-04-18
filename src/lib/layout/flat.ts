/**
 * 평면 도안 레이아웃.
 *
 * 핵심 원칙은 circular와 동일:
 *   - 각 Op은 1개의 PositionedStitch를 생성한다.
 *   - V(INC^N)는 1개의 stitch가 N개 슬롯을 차지하며, 다음 단에 N개 부모 슬롯 노출.
 *   - A(DEC^N)는 1슬롯, 1 노출.
 *
 * y = -(N-1) * FLAT_CELL_HEIGHT (위로 쌓임)
 * 행 내 슬롯은 수평 균등 간격으로 분포, 좌우 중앙 정렬.
 * 작업 방향: 홀수 단 L→R, 짝수 단 R→L. 방향은 시작 마커(▶/◀)로만 표현하고
 * 기호 자체는 항상 위쪽이 위를 향하도록 angle=0 유지 (코바늘 차트 관행).
 *
 * MAGIC은 단의 가운데 약간 아래에 배치 (참고용).
 */

import type { ExpandedRound, Op } from '$lib/expand/op';
import type { PositionedStitch, Point, LayoutResult, RoundMarker } from './types';
import { FLAT_CELL_WIDTH, FLAT_CELL_HEIGHT } from './constants';
import { computeBounds, markerFarPoint } from './bounds';
import { STITCH_META } from '$lib/model/stitch';

const MARKER_SIDE_OFFSET = 16;  // 시작코 가장자리에서 마커 삼각형 중심까지의 거리

/** op 가 행에서 차지하는 시각적 셀 수. samehole chain 은 slot 미차지. */
function visualProduceFor(op: Op): number {
  if (op.kind === 'MAGIC' || op.kind === 'SKIP') return 0;
  if (op.turningChain) return op.sameHoleContinuation ? 0 : 1;
  return op.produce;
}

function effectiveSymH(op: Op): number {
  if ((op.kind === 'INC' || op.kind === 'DEC') && op.baseKind) {
    return STITCH_META[op.baseKind].symbolHalfHeight;
  }
  return STITCH_META[op.kind].symbolHalfHeight;
}

export function layoutFlat(rounds: ExpandedRound[]): LayoutResult {
  const stitches: PositionedStitch[] = [];
  const roundMarkers: RoundMarker[] = [];
  const slotMapByRound = new Map<number, number[]>();

  for (const round of rounds) {
    placeRow(round, stitches, slotMapByRound, roundMarkers);
  }

  // tc(...) 기둥코 세로 스택 후처리
  repositionTurningChainColumns(stitches);

  // samehole 사슬 arc 후처리
  repositionChainArcs(stitches);

  // 기호 extent 까지 포함한 bounds (잘림 방지)
  const extentPoints: Point[] = [];
  for (const s of stitches) {
    const symH = effectiveSymH(s.op);
    extentPoints.push(
      { x: s.position.x + symH, y: s.position.y + symH },
      { x: s.position.x + symH, y: s.position.y - symH },
      { x: s.position.x - symH, y: s.position.y + symH },
      { x: s.position.x - symH, y: s.position.y - symH },
    );
  }
  const bounds = computeBounds([
    ...extentPoints,
    ...roundMarkers.map((m) => m.position),
    ...roundMarkers.map(markerFarPoint),
  ]);

  // row 1의 코 수 패리티에 맞춰 수평 셀 경계 오프셋 결정.
  const round1 = rounds[0];
  const round1Slots = round1
    ? round1.ops.reduce((sum, op) => sum + visualProduceFor(op), 0)
    : 0;
  const xOffset = round1Slots % 2 === 0 ? 0 : FLAT_CELL_WIDTH / 2;
  const yOffset = FLAT_CELL_HEIGHT / 2;

  return {
    stitches,
    bounds,
    gridGuide: {
      type: 'rect',
      cellWidth: FLAT_CELL_WIDTH,
      cellHeight: FLAT_CELL_HEIGHT,
      xOffset,
      yOffset,
    },
    roundMarkers,
  };
}

function placeRow(
  round: ExpandedRound,
  stitches: PositionedStitch[],
  slotMapByRound: Map<number, number[]>,
  roundMarkers: RoundMarker[],
): void {
  const { index: roundIdx } = round;
  const rowSlots = round.ops.reduce((sum, op) => sum + visualProduceFor(op), 0);

  const y = -(roundIdx - 1) * FLAT_CELL_HEIGHT;
  const startX = -((rowSlots - 1) * FLAT_CELL_WIDTH) / 2;
  const direction: 1 | -1 = round.direction === 'reverse' ? -1 : 1;
  const angle = 0;

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
        position: { x: 0, y: y + FLAT_CELL_HEIGHT / 2 },
        angle: 0, parentIndices: [], exposedSlots: 0,
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

    // vSlots=0: samehole chain, SKIP, tc continuation 등 — 셀 미차지.
    // 임시로 parent 위치에 두고 사슬 호 후처리에서 이동.
    if (vSlots === 0) {
      const refStitch = parents.length > 0 ? stitches[parents[0]!] : undefined;
      const pos = refStitch ? { ...refStitch.position } : { x: 0, y };
      const idx = stitches.length;
      stitches.push({
        op, roundIndex: roundIdx,
        position: pos, angle,
        parentIndices: parents, exposedSlots: op.produce,
      });
      thisStitchIndices.push(idx);
      continue;
    }

    const startSlotX = startX + slotCursor * FLAT_CELL_WIDTH;
    const endSlotX = startX + (slotCursor + vSlots - 1) * FLAT_CELL_WIDTH;
    const midX = (startSlotX + endSlotX) / 2;

    const idx = stitches.length;
    stitches.push({
      op, roundIndex: roundIdx,
      position: { x: midX, y }, angle,
      parentIndices: parents, exposedSlots: op.produce,
    });
    thisStitchIndices.push(idx);
    slotCursor += vSlots;
  }

  const slotMap: number[] = [];
  for (const sIdx of thisStitchIndices) {
    const s = stitches[sIdx]!;
    for (let k = 0; k < s.exposedSlots; k++) slotMap.push(sIdx);
  }
  slotMapByRound.set(roundIdx, slotMap);

  // 시작 마커: MAGIC / SKIP 제외한 첫 visible
  const visibleIndices = thisStitchIndices.filter((i) => {
    const k = stitches[i]!.op.kind;
    return k !== 'MAGIC' && k !== 'SKIP';
  });
  if (visibleIndices.length > 0) {
    const startStitchIdx = direction === 1
      ? visibleIndices[0]!
      : visibleIndices[visibleIndices.length - 1]!;
    const s = stitches[startStitchIdx]!;
    const xOffsetMarker = direction === 1 ? -MARKER_SIDE_OFFSET : MARKER_SIDE_OFFSET;
    roundMarkers.push({
      roundIndex: roundIdx,
      position: { x: s.position.x + xOffsetMarker, y: s.position.y },
      direction: direction === 1 ? 'right' : 'left',
    });
  }
}

// ============================================================
// tc(...) 기둥코 세로 스택 (flat) — 첫 op 위로 기호 높이만큼 쌓음
// ============================================================

function repositionTurningChainColumns(stitches: PositionedStitch[]): void {
  for (let i = 0; i < stitches.length; i++) {
    const s = stitches[i]!;
    if (!s.op.turningChain || s.op.sameHoleContinuation) continue;

    const groupIndices: number[] = [i];
    for (let j = i + 1; j < stitches.length; j++) {
      const t = stitches[j]!;
      if (t.roundIndex !== s.roundIndex) break;
      if (!t.op.turningChain) break;
      if (!t.op.sameHoleContinuation) break;
      groupIndices.push(j);
    }

    const baseX = s.position.x;
    const baseY = s.position.y; // 첫 op 의 row y
    // 각 op 가 자체 symH 높이만큼 차지하며 위로(y 감소) 쌓임
    let yCursor = baseY;
    for (let k = 0; k < groupIndices.length; k++) {
      const cs = stitches[groupIndices[k]!]!;
      const symH = effectiveSymH(cs.op);
      if (k === 0) {
        yCursor = baseY;
      } else {
        const prev = stitches[groupIndices[k - 1]!]!;
        const prevSymH = effectiveSymH(prev.op);
        yCursor = yCursor - prevSymH - symH;
      }
      cs.position = { x: baseX, y: yCursor };
      cs.angle = 0;
    }
    i = groupIndices[groupIndices.length - 1]!;
  }
}

// ============================================================
// samehole chain arc (flat) — 위쪽으로 볼록한 bezier
// ============================================================

function isSameholeArcChain(s: PositionedStitch | undefined): boolean {
  if (!s) return false;
  if (s.op.turningChain) return false;
  if (!s.op.inSameHoleGroup) return false;
  return s.op.kind === 'CHAIN';
}

function findAdjacentNonChain(
  stitches: PositionedStitch[],
  indices: number[],
  from: number,
  direction: 1 | -1,
): PositionedStitch | undefined {
  for (let j = from; direction > 0 ? j < indices.length : j >= 0; j += direction) {
    const t = stitches[indices[j]!]!;
    if (t.op.kind === 'CHAIN') continue;
    if (t.op.turningChain) continue;
    if (t.op.kind === 'MAGIC' || t.op.kind === 'SKIP') continue;
    return t;
  }
  return undefined;
}

function repositionChainArcs(stitches: PositionedStitch[]): void {
  const byRound = new Map<number, number[]>();
  for (let i = 0; i < stitches.length; i++) {
    const ri = stitches[i]!.roundIndex;
    const arr = byRound.get(ri) ?? [];
    arr.push(i);
    byRound.set(ri, arr);
  }
  for (const indices of byRound.values()) {
    repositionChainArcsInRow(stitches, indices);
  }
}

function repositionChainArcsInRow(stitches: PositionedStitch[], indices: number[]): void {
  let i = 0;
  while (i < indices.length) {
    if (!isSameholeArcChain(stitches[indices[i]!])) { i++; continue; }
    const runStart = i;
    while (i < indices.length && isSameholeArcChain(stitches[indices[i]!])) i++;
    const runEnd = i;
    const runLen = runEnd - runStart;

    const prev = findAdjacentNonChain(stitches, indices, runStart - 1, -1);
    const next = findAdjacentNonChain(stitches, indices, runEnd, 1);
    if (!prev && !next) continue;

    // 평면에서는 stitch 의 top 은 y 가 작은 쪽(위쪽)
    const topOffset = (s: PositionedStitch) => ({ x: s.position.x, y: s.position.y - effectiveSymH(s.op) });
    const leftTop = prev ? topOffset(prev) : { x: (next!.position.x - FLAT_CELL_WIDTH), y: next!.position.y - effectiveSymH(next!.op) };
    const rightTop = next ? topOffset(next) : { x: (prev!.position.x + FLAT_CELL_WIDTH), y: prev!.position.y - effectiveSymH(prev!.op) };

    const dx = rightTop.x - leftTop.x;
    const dy = rightTop.y - leftTop.y;
    const chord = Math.sqrt(dx * dx + dy * dy);

    const CHAIN_SPACING = 9;
    const ANCHOR_GAP = 12;
    const chainSpan = (runLen - 1) * CHAIN_SPACING;
    const requiredArc = chainSpan + 2 * ANCHOR_GAP;
    const arcRatio = chord > 0.001 ? requiredArc / chord : 1;
    const minBulgeRatio = 0.15;
    const h_bez = chord * Math.max(minBulgeRatio, Math.sqrt(Math.max(0, 0.75 * (arcRatio - 1))));
    const cOffset = 2 * h_bez;

    // perpendicular upward (y 가 작아지는 방향)
    let perpX: number, perpY: number;
    if (chord < 0.001) { perpX = 0; perpY = -1; }
    else {
      const cdx = dx / chord, cdy = dy / chord;
      const p1x = -cdy, p1y = cdx;
      // up 방향 (y 감소) 선택
      if (p1y <= 0) { perpX = p1x; perpY = p1y; }
      else { perpX = cdy; perpY = -cdx; }
    }

    const midX = (leftTop.x + rightTop.x) / 2;
    const midY = (leftTop.y + rightTop.y) / 2;
    const cx = midX + cOffset * perpX;
    const cy = midY + cOffset * perpY;

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
  }
}

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
