/**
 * 평면 도안 레이아웃.
 *
 * 핵심 모델 (단순):
 *  - 각 Op = 1개의 PositionedStitch.
 *  - 각 round 를 maxSlots (모든 단의 최대 cell 수) 안에서 align (L/R/C) 따라 cell 기반 배치.
 *  - cascade 옵션 ON: 다중 부모 자식 (DEC, bridge anchor) 만 부모 위치로 정렬.
 *    1:1 / V 확장 자식은 cell-based 유지 — row 안 균등 spacing 보존.
 *  - 후처리: tc 세로 스택, samehole chain 호 (anchor 중심 cluster), 단조 증가 보정.
 */

import type { ExpandedRound, Op } from '$lib/expand/op';
import type { PositionedStitch, Point, LayoutResult, RoundMarker } from './types';
import { FLAT_CELL_WIDTH, FLAT_CELL_HEIGHT } from './constants';
import { computeBounds, markerFarPoint } from './bounds';
import { STITCH_META } from '$lib/model/stitch';

const MARKER_SIDE_OFFSET = 16;

/**
 * op 가 행에서 차지하는 cell 수 (cascade flag 무관).
 *
 *  - MAGIC, 장식 conts (chain samehole cont, tc cont, produce=0 && consume=0) → 0 cell.
 *  - V (INC): produce cells — 기호 1 + (produce-1) 빈칸. 예: V^3 = "V . ." (3 cells).
 *  - A (DEC): consume cells — 기호 1 + (consume-1) 빈칸. 예: A^3.
 *  - bridge anchor (chain samehole consume>1): consume cells (사슬 호 영역).
 *  - SKIP: 1 cell (consume=1, produce=0; max=1).
 *  - 1:1 stitch / [Nch] anchor: 1 cell.
 */
function visualClaim(op: Op): number {
  if (op.kind === 'MAGIC') return 0;
  if (op.produce === 0 && op.consume === 0) return 0;
  return Math.max(op.produce, op.consume);
}

/**
 * cascade ON 시 op 별 *전파된* claim — 자식이 단일 부모 (exclusive) 이면 그 자식의
 * effective claim 이 부모로 합산되어 올라감. 다중 부모 자식 (DEC, bridge) 은 차단.
 *
 * 결과: V (claim=2) 가 R3 에 있으면 R2 부모 X 도 claim=2, R1 그 부모 chain 도 claim=2 →
 * 모든 단이 같은 폭 (= max 단 폭) 으로 spread 됨.
 *
 * cascade OFF 시 own visualClaim 그대로 반환 — 각 단이 자기 ops 너비로 배치.
 */
function computeEffectiveClaims(rounds: ExpandedRound[], cascade: boolean): number[][] {
  const own: number[][] = rounds.map((r) => r.ops.map(visualClaim));
  if (!cascade) return own;

  // op-level slot map: 각 round 의 produce 순서대로 op index 매핑.
  const slotMaps: number[][] = rounds.map((r) => {
    const sm: number[] = [];
    for (let i = 0; i < r.ops.length; i++) {
      const op = r.ops[i]!;
      for (let k = 0; k < op.produce; k++) sm.push(i);
    }
    return sm;
  });

  // 각 op 의 *exclusive 자식* 리스트 — 자식이 단일 부모일 때만 추가.
  const exclusiveKids: number[][][] = rounds.map((r) => r.ops.map(() => []));
  for (let r = 1; r < rounds.length; r++) {
    const round = rounds[r]!;
    const prevSm = slotMaps[r - 1] ?? [];
    let parentCursor = 0;
    let lastGroupParentOps: number[] = [];
    for (let opIdx = 0; opIdx < round.ops.length; opIdx++) {
      const op = round.ops[opIdx]!;
      let parentOps: number[];
      if (op.sameHoleContinuation) {
        parentOps = lastGroupParentOps;
      } else {
        parentOps = [];
        for (let k = 0; k < op.consume; k++) {
          const p = prevSm[parentCursor + k];
          if (p !== undefined) parentOps.push(p);
        }
        parentCursor += op.consume;
        lastGroupParentOps = parentOps;
      }
      // 단일 부모 + produce>0 자식만 exclusive 로 인정.
      if (parentOps.length === 1 && op.produce > 0) {
        exclusiveKids[r - 1]![parentOps[0]!]!.push(opIdx);
      }
    }
  }

  // 높은 단부터 낮은 단으로 walk — effective = max(own, sum of exclusive kids).
  const eff: number[][] = own.map((c) => [...c]);
  for (let r = rounds.length - 2; r >= 0; r--) {
    const ops = rounds[r]!.ops;
    for (let opIdx = 0; opIdx < ops.length; opIdx++) {
      let sum = 0;
      for (const k of exclusiveKids[r]![opIdx]!) {
        sum += eff[r + 1]![k]!;
      }
      eff[r]![opIdx] = Math.max(eff[r]![opIdx]!, sum);
    }
  }
  return eff;
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
  /**
   * 단마다 cell 수가 다를 때 좁은 단을 max 단의 어느 쪽에 정렬할지.
   *  - 'L': 좌측 끝. 자식 그룹이 부모 우측으로 펼쳐짐.
   *  - 'R': 우측 끝. 자식 그룹이 부모 좌측으로 펼쳐짐.
   *  - 'C': 가운데 (기본 동작 — pre-refactor).
   */
  align?: 'L' | 'R' | 'C';
  /**
   * 부모 행 cascade. true (기본): 부모를 첫 자식 x 로 이동. false: cell 위치 유지, 연결선 슬랜트.
   */
  cascade?: boolean;
}

export function layoutFlat(rounds: ExpandedRound[], opts: FlatOptions = {}): LayoutResult {
  const stitches: PositionedStitch[] = [];
  const roundMarkers: RoundMarker[] = [];
  const slotMapByRound = new Map<number, number[]>();
  const align: 'L' | 'R' | 'C' = opts.align ?? 'C';
  const cascade = opts.cascade ?? true;

  // op 별 effective claim — cascade ON 시 자식 claim 을 부모로 전파.
  const effClaims = computeEffectiveClaims(rounds, cascade);

  // chart 폭 = max 단 cell 수 — 모든 단이 동일 폭으로 spread (cascade ON).
  const maxSlots = Math.max(
    0,
    ...effClaims.map((row) => row.reduce((s, c) => s + c, 0)),
  );

  // 1) 각 round 를 max 폭 안에서 align 따라 uniform cell 배치.
  for (let i = 0; i < rounds.length; i++) {
    placeRow(rounds[i]!, stitches, slotMapByRound, roundMarkers, maxSlots, align, effClaims[i]!);
  }

  // 2) cascade ON: 다중 부모 자식 (DEC, bridge anchor) 만 부모 L/R/C 위치로 align.
  // 부모→자식 정렬은 effective claim 전파로 placeRow 단계에서 이미 컬럼 정렬됨.
  if (cascade) {
    alignChildToParents(stitches, align);
  }

  // 3) 행 안 op 순서대로 x 단조 증가 보정 — cascade 충돌이나 slot 불일치로 인한 같은 자리 stitch 흩뿌림.
  enforceRowMonotonic(stitches);

  // 4) tc 기둥코 세로 스택, samehole 사슬 호 후처리.
  repositionTurningChainColumns(stitches);
  repositionChainArcs(stitches);

  // 5) roundMarker 의 최종 좌표 — stitch 이동 완료 후 참조 stitch 의 최종 x 기준.
  for (const m of roundMarkers) {
    const mExt = m as RoundMarker & { _stitchIdx?: number };
    if (mExt._stitchIdx !== undefined) {
      const s = stitches[mExt._stitchIdx]!;
      const off = m.direction === 'right' ? -MARKER_SIDE_OFFSET : MARKER_SIDE_OFFSET;
      m.position = { x: s.position.x + off, y: s.position.y };
      delete mExt._stitchIdx;
    }
  }

  // 6) 상하 반전 옵션 — y 좌표만 뒤집음 (기호 회전은 그대로).
  if (opts.flipVertical) {
    for (const s of stitches) s.position = { x: s.position.x, y: -s.position.y };
    for (const m of roundMarkers) m.position = { x: m.position.x, y: -m.position.y };
  }

  // bounds — stitch extent + marker 위치.
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

  // 그리드 가이드 — 최대 cell 수 기준 uniform.
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
  maxSlots: number,
  align: 'L' | 'R' | 'C',
  rowClaims: number[],
): void {
  const { index: roundIdx } = round;
  const rowSlots = rowClaims.reduce((s, c) => s + c, 0);

  const y = -(roundIdx - 1) * FLAT_CELL_HEIGHT;
  const W = FLAT_CELL_WIDTH;
  // chart 좌측 끝 x (max 단 leftmost slot 의 중심) — L/R/C 정렬 기준점.
  const chartLeft = -((maxSlots - 1) * W) / 2;
  let startX: number;
  if (rowSlots <= 0) {
    startX = 0;
  } else if (align === 'L') {
    startX = chartLeft;
  } else if (align === 'R') {
    startX = chartLeft + (maxSlots - rowSlots) * W;
  } else {
    startX = -((rowSlots - 1) * W) / 2; // C: 자체 가운데 정렬
  }
  const direction: 1 | -1 = round.direction === 'reverse' ? -1 : 1;
  const angle = 0;

  const parentSlotMap = slotMapByRound.get(roundIdx - 1) ?? [];
  const thisStitchIndices: number[] = [];
  let parentCursor = 0;
  let slotCursor = 0;
  let lastGroupParents: number[] = [];

  for (let opIdx = 0; opIdx < round.ops.length; opIdx++) {
    const op = round.ops[opIdx]!;
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

    // 부모 결정 — samehole continuation 은 anchor 의 부모 재사용.
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

    const vSlots = rowClaims[opIdx]!;
    let px: number;
    let py = y;
    if (vSlots === 0) {
      // 장식 op (samehole chain cont, tc cont) — 부모 위치에 임시 배치.
      // 최종 위치는 후처리 (repositionChainArcs, repositionTurningChainColumns) 에서 결정.
      const ref = parents.length > 0 ? stitches[parents[0]!] : undefined;
      px = ref ? ref.position.x : 0;
      if (ref) py = ref.position.y;
    } else {
      // 셀 자리 차지 — claim>1 (V/A/bridge/propagated) 일 때 기호 자체는 1 cell.
      // align 모드 따라 한쪽 cell 에 정렬: L=startSlot, R=endSlot, C=midpoint.
      // (V^3 → "V . ." for L, ". . V" for R, ". V ." for C 등 — slotCursor 진행은 동일.)
      const startSlotX = startX + slotCursor * W;
      const endSlotX = startX + (slotCursor + vSlots - 1) * W;
      if (align === 'L') px = startSlotX;
      else if (align === 'R') px = endSlotX;
      else px = (startSlotX + endSlotX) / 2;
      slotCursor += vSlots;
    }

    const idx = stitches.length;
    stitches.push({
      op, roundIndex: roundIdx,
      position: { x: px, y: py }, angle,
      parentIndices: parents, exposedSlots: op.produce,
    });
    thisStitchIndices.push(idx);
  }

  const slotMap: number[] = [];
  for (const sIdx of thisStitchIndices) {
    const s = stitches[sIdx]!;
    for (let k = 0; k < s.exposedSlots; k++) slotMap.push(sIdx);
  }
  slotMapByRound.set(roundIdx, slotMap);

  const visibleIndices = thisStitchIndices.filter((i) => {
    const k = stitches[i]!.op.kind;
    return k !== 'MAGIC' && k !== 'SKIP';
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

/**
 * 자식 → 부모 align: 부모 column 으로 자식을 이동 → row 들이 같은 grid 위에 일관되게 spread.
 *  - 다중 부모 자식 (DEC, bridge anchor): L=첫 부모 / R=마지막 부모 / C=평균 부모.
 *  - 단일 부모 자식, 부모의 유효 자식 1개 (1:1): 부모 x 로 이동.
 *  - 단일 부모 자식, 부모의 유효 자식 N>1 (V/[Nx] 확장): cell-based 유지 (자식들이 spread 차지).
 */
function alignChildToParents(stitches: PositionedStitch[], align: 'L' | 'R' | 'C'): void {
  // 부모별 *유효 자식* 수 — exposedSlots>0 자식만 카운트.
  const realKidsCount = new Map<number, number>();
  for (const s of stitches) {
    if (s.exposedSlots <= 0) continue;
    for (const p of s.parentIndices) {
      realKidsCount.set(p, (realKidsCount.get(p) ?? 0) + 1);
    }
  }
  for (const s of stitches) {
    const parents = s.parentIndices;
    if (parents.length === 0) continue;
    if (parents.length >= 2) {
      const xs = parents.map((p) => stitches[p]!.position.x);
      let targetX: number;
      if (align === 'L') targetX = xs[0]!;
      else if (align === 'R') targetX = xs[xs.length - 1]!;
      else {
        let sum = 0;
        for (const x of xs) sum += x;
        targetX = sum / xs.length;
      }
      s.position = { x: targetX, y: s.position.y };
      continue;
    }
    // 단일 부모
    const parentIdx = parents[0]!;
    const parentX = stitches[parentIdx]!.position.x;
    const N = realKidsCount.get(parentIdx) ?? 0;
    if (s.exposedSlots <= 0 || N <= 1) {
      // 1:1 또는 장식 자식 (cont) — 부모 x 로 이동.
      s.position = { x: parentX, y: s.position.y };
    }
    // V/[Nx] 확장 (N>1) 인 produce>0 자식은 cell-based 유지.
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

/**
 * 각 행에서 op 순서대로 x 가 인접 코 너비 (FLAT_CELL_WIDTH) 이상 단조 증가하도록 보정.
 * cascade 후 충돌/순서 깨짐을 회복. claim=0 op (chain cont, tc cont) 는 후처리에서
 * 호/스택으로 정리되므로 여기서 단조 체크 skip.
 */
function enforceRowMonotonic(stitches: PositionedStitch[]): void {
  const W = FLAT_CELL_WIDTH;
  const byRound = new Map<number, number[]>();
  for (let i = 0; i < stitches.length; i++) {
    const r = stitches[i]!.roundIndex;
    if (!byRound.has(r)) byRound.set(r, []);
    byRound.get(r)!.push(i);
  }
  for (const indices of byRound.values()) {
    let prevX = -Infinity;
    for (const idx of indices) {
      const s = stitches[idx]!;
      if (s.op.kind === 'MAGIC') continue;
      if (visualClaim(s.op) === 0) continue;
      const minX = prevX === -Infinity ? s.position.x : prevX + W;
      if (s.position.x < minX) {
        s.position = { x: minX, y: s.position.y };
      }
      prevX = s.position.x;
    }
  }
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
    if (t.op.kind === 'MAGIC') continue;
    // SKIP 도 1 코 (boundary 역할). chain arc 가 SKIP 위에 침범하지 않도록 포함.
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

    // anchor 의 위치 (cascade/alignChildToParents 결과) 를 cluster 가운데로 사용 — 그래야
    // L/R/C cascade 가 anchor 에 반영되고, bridge 의 부모 정렬이 chain 호에도 보임.
    const anchor = stitches[indices[runStart]!]!;
    const anchorX = anchor.position.x;
    // chord 폭은 prev/next 의 거리를 그대로 사용 (호의 가로 폭). 단, *anchor 중심* 에 정렬.
    const topOffset = (s: PositionedStitch) => ({ x: s.position.x, y: s.position.y - effectiveSymH(s.op) });
    const prevTop = prev ? topOffset(prev) : { x: anchorX - FLAT_CELL_WIDTH, y: (next!.position.y - effectiveSymH(next!.op)) };
    const nextTop = next ? topOffset(next) : { x: anchorX + FLAT_CELL_WIDTH, y: (prev!.position.y - effectiveSymH(prev!.op)) };
    const halfChord = Math.max(
      anchorX - prevTop.x,
      nextTop.x - anchorX,
      FLAT_CELL_WIDTH * 0.5,
    );
    const leftTop = { x: anchorX - halfChord, y: prevTop.y };
    const rightTop = { x: anchorX + halfChord, y: nextTop.y };

    const dx = rightTop.x - leftTop.x;
    const dy = rightTop.y - leftTop.y;
    const chord = Math.sqrt(dx * dx + dy * dy);

    const CHAIN_SPACING = 9;
    const ANCHOR_GAP = 12;
    const chainSpan = (runLen - 1) * CHAIN_SPACING;
    const requiredArc = chainSpan + 2 * ANCHOR_GAP;
    const arcRatio = chord > 0.001 ? requiredArc / chord : 1;
    const minBulgeRatio = 0.15;
    // bulge 캡 — chain 호가 다음 단 영역을 침범하지 않게.
    // h_bez ≤ FLAT_CELL_HEIGHT*0.3 ≈ 9.6 → midpoint 가 row 위로 ~17 정도, 다음 단 HDC 와 5px+ 여유.
    const maxBulge = FLAT_CELL_HEIGHT * 0.3;
    const h_bez = Math.min(
      maxBulge,
      chord * Math.max(minBulgeRatio, Math.sqrt(Math.max(0, 0.75 * (arcRatio - 1)))),
    );
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
    // anchor (chain[0]) 가 cluster 가운데에 오도록 t-value 재배치 — 부모 연결선이
    // 부모 코의 *중점* 으로 가게. 다른 chain (cont) 들은 좌우로 spread.
    const midSampleIdx = Math.floor((runLen - 1) / 2);
    if (midSampleIdx > 0 && midSampleIdx < runLen) {
      [tValues[0], tValues[midSampleIdx]] = [tValues[midSampleIdx]!, tValues[0]!];
    }
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
