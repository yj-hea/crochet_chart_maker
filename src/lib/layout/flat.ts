/**
 * 평면 도안 레이아웃.
 *
 * - 각 Op 은 1개의 PositionedStitch 를 만든다.
 * - 각 round 는 독립적으로 uniform cell (FLAT_CELL_WIDTH) 에 배치한 뒤,
 *   자식 round 의 첫 child x 로 부모를 맞춰 정렬(`alignParentRows`) 한다.
 *   → 자식이 samehole 로 여러 셀로 확장되면 부모는 첫 셀 위치로 이동하고,
 *     나머지 자식 셀들은 부모 행에 빈칸으로 남는다.
 * - MAGIC 은 row 1 아래 1셀 독립 위치.
 * - tc(...) 는 세로 스택, samehole chain 은 위로 볼록한 arc.
 */

import type { ExpandedRound, Op } from '$lib/expand/op';
import type { PositionedStitch, Point, LayoutResult, RoundMarker } from './types';
import { FLAT_CELL_WIDTH, FLAT_CELL_HEIGHT } from './constants';
import { computeBounds, markerFarPoint } from './bounds';
import { STITCH_META } from '$lib/model/stitch';

const MARKER_SIDE_OFFSET = 16;

/** op 가 행에서 차지하는 시각적 셀 수. samehole chain 은 arc 로 처리되므로 셀 미차지. */
function visualProduceFor(op: Op): number {
  if (op.kind === 'MAGIC' || op.kind === 'SKIP' || op.kind === 'BRIDGE_ANCHOR') return 0;
  if (op.turningChain) return op.sameHoleContinuation ? 0 : 1;
  if (op.inSameHoleGroup && op.kind === 'CHAIN') return 0;
  return op.produce;
}

function effectiveSymH(op: Op): number {
  const isIncDec = op.kind === 'INC' || op.kind === 'DEC';
  const baseKind = isIncDec && op.baseKind ? op.baseKind : op.kind;
  if ((baseKind === 'TR' || baseKind === 'DTR') && op.yarnOverCount && op.yarnOverCount >= 2) {
    return 9 + 2 * (op.yarnOverCount - 1);
  }
  return STITCH_META[baseKind].symbolHalfHeight;
}

export interface FlatOptions {
  /** 상하 반전: true 면 1단이 위쪽에 오고 이후 단이 아래로 쌓임. */
  flipVertical?: boolean;
}

export function layoutFlat(rounds: ExpandedRound[], opts: FlatOptions = {}): LayoutResult {
  const stitches: PositionedStitch[] = [];
  const roundMarkers: RoundMarker[] = [];
  const slotMapByRound = new Map<number, number[]>();

  // 1) 각 round 를 자체 slot 수 기준 uniform 셀 폭으로 배치.
  for (const round of rounds) {
    placeRow(round, stitches, slotMapByRound, roundMarkers);
  }

  // 2) 부모 행을 첫 자식 x 에 정렬 — tc 등 stitch 위치 이동이 필요한 후처리 전에 먼저 수행
  alignParentRows(stitches);

  // 3) tc 세로 스택 — alignParentRows 이후 첫 op 의 갱신된 x 기준으로 스택
  repositionTurningChainColumns(stitches);

  // 4) samehole 사슬 arc
  repositionChainArcs(stitches);

  // 5) roundMarker 위치 재계산 — stitch 이동이 완료된 뒤 참조 stitch 의 최종 x 로 맞춤
  for (const m of roundMarkers) {
    const mExt = m as RoundMarker & { _stitchIdx?: number };
    if (mExt._stitchIdx !== undefined) {
      const s = stitches[mExt._stitchIdx]!;
      const off = m.direction === 'right' ? -MARKER_SIDE_OFFSET : MARKER_SIDE_OFFSET;
      m.position = { x: s.position.x + off, y: s.position.y };
      delete mExt._stitchIdx;
    }
  }

  // 6) 상하 반전 옵션 — y 좌표만 뒤집음 (기호 자체 회전은 변경 없음, 기호는 항상 위쪽이 위)
  if (opts.flipVertical) {
    for (const s of stitches) s.position = { x: s.position.x, y: -s.position.y };
    for (const m of roundMarkers) m.position = { x: m.position.x, y: -m.position.y };
  }

  // 5) bounds (stitch extent 포함)
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

  // 6) 그리드 가이드 — 최대 slot 수 행 기준 uniform 셀
  const maxSlots = Math.max(0, ...rounds.map((r) => r.ops.reduce((s, o) => s + visualProduceFor(o), 0)));
  const xOffset = maxSlots % 2 === 0 ? 0 : FLAT_CELL_WIDTH / 2;
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
  let currentGroupFirstX: number | null = null;

  for (const op of round.ops) {
    if (op.kind === 'MAGIC') {
      const idx = stitches.length;
      stitches.push({
        op, roundIndex: roundIdx,
        position: { x: 0, y: y + FLAT_CELL_HEIGHT },
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

    if (vSlots === 0) {
      // samehole chain / tc continuation / SKIP — 부모 위치에 임시 배치, arc/column 후처리에서 조정
      let px: number;
      let py = y;
      if (op.inSameHoleGroup && op.sameHoleContinuation && currentGroupFirstX !== null) {
        px = currentGroupFirstX;
      } else {
        const ref = parents.length > 0 ? stitches[parents[0]!] : undefined;
        if (ref) { px = ref.position.x; py = ref.position.y; }
        else { px = 0; }
      }
      const idx = stitches.length;
      stitches.push({
        op, roundIndex: roundIdx,
        position: { x: px, y: py }, angle,
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

    if (op.inSameHoleGroup && !op.sameHoleContinuation) {
      currentGroupFirstX = midX;
    } else if (!op.inSameHoleGroup) {
      currentGroupFirstX = null;
    }
  }

  const slotMap: number[] = [];
  for (const sIdx of thisStitchIndices) {
    const s = stitches[sIdx]!;
    for (let k = 0; k < s.exposedSlots; k++) slotMap.push(sIdx);
  }
  slotMapByRound.set(roundIdx, slotMap);

  const visibleIndices = thisStitchIndices.filter((i) => {
    const k = stitches[i]!.op.kind;
    return k !== 'MAGIC' && k !== 'SKIP' && k !== 'BRIDGE_ANCHOR';
  });
  if (visibleIndices.length > 0) {
    const startStitchIdx = direction === 1
      ? visibleIndices[0]!
      : visibleIndices[visibleIndices.length - 1]!;
    // 실제 좌표는 후처리에서 재계산 — 여기선 참조만 저장
    roundMarkers.push({
      roundIndex: roundIdx,
      position: { x: 0, y: 0 },
      direction: direction === 1 ? 'right' : 'left',
      _stitchIdx: startStitchIdx,
    } as RoundMarker & { _stitchIdx: number });
  }
}

// ============================================================
// 부모 행 정렬 — 위 round 의 첫 자식 x 로 아래 round 의 부모 stitch 이동
// (decrease A 처럼 자식이 여러 부모를 소비하는 경우는 건드리지 않음)
// ============================================================

function alignParentRows(stitches: PositionedStitch[]): void {
  // childrenOf[parentIdx] = [childStitchIdx, ...] (연결 순서대로)
  const childrenOf = new Map<number, number[]>();
  for (let i = 0; i < stitches.length; i++) {
    for (const pIdx of stitches[i]!.parentIndices) {
      const arr = childrenOf.get(pIdx) ?? [];
      arr.push(i);
      childrenOf.set(pIdx, arr);
    }
  }

  // 큰 round 인덱스부터 작은 순으로 내려가며 부모 이동. 연쇄 이동을 위해 한 번에 처리.
  const byRound = new Map<number, number[]>();
  for (let i = 0; i < stitches.length; i++) {
    const r = stitches[i]!.roundIndex;
    if (!byRound.has(r)) byRound.set(r, []);
    byRound.get(r)!.push(i);
  }
  const rounds = [...byRound.keys()].sort((a, b) => b - a);
  for (const r of rounds) {
    const parents = byRound.get(r) ?? [];
    for (const pIdx of parents) {
      const parent = stitches[pIdx]!;
      if (parent.op.kind === 'MAGIC') continue; // MAGIC 은 고정 위치 유지
      const kids = childrenOf.get(pIdx);
      if (!kids || kids.length === 0) continue;
      const firstKid = stitches[kids[0]!]!;
      // A(dec): 자식이 여러 부모를 공유. 이 경우 부모 이동은 금지
      if (firstKid.parentIndices.length > 1) continue;
      parent.position = { x: firstKid.position.x, y: parent.position.y };
    }
  }
}

// ============================================================
// tc(...) 기둥코 세로 스택 (flat)
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
    const baseY = s.position.y;
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
    if (t.op.kind === 'MAGIC' || t.op.kind === 'SKIP' || t.op.kind === 'BRIDGE_ANCHOR') continue;
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

    let perpX: number, perpY: number;
    if (chord < 0.001) { perpX = 0; perpY = -1; }
    else {
      const cdx = dx / chord, cdy = dy / chord;
      const p1x = -cdy, p1y = cdx;
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
