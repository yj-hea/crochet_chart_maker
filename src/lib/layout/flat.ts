/**
 * 평면 도안 레이아웃 (cell 기반, claim = max(visualProduce, consume)).
 *
 * 핵심 모델:
 *  - 각 단은 자기 ops 의 *claim* 합만큼 셀을 가짐. claim = max(시각 슬롯 수, 소비 부모 수).
 *    → SKIP(N), BRIDGE_ANCHOR(consume=M) 처럼 시각 슬롯이 0 이라도 부모 N/M 개 분량의 셀을 차지.
 *    → 그래서 부모 행이 갖는 폭과 자식 행의 폭이 자연스럽게 맞음.
 *  - V(produce=N), 다중 stitch samehole 그룹은 produce 가 dominant 이라 N 셀 차지 → 행 확장.
 *  - 각 op 는 자기 claim 의 가운데에 배치. 그룹 안 visible 들은 각자 1셀씩.
 *  - 슬롯 맵은 produce 슬롯 각각의 cell 중심 x 를 저장 → 자식이 W 간격으로 정확히 정렬.
 *  - 체인 브릿지 [NO, skip(M)] : anchor 가 M 셀을 차지, 가운데 중심에 invisible anchor 1슬롯 노출,
 *    사슬은 그 셀 영역 위로 호. 사슬 ≥5 이면 첫/마지막 + (N) 라벨로 축약.
 *  - SKIP / MAGIC / 사슬 호의 사슬 / tc 연속 등 시각 비표시 op 도 자기 claim 만큼 셀을 차지.
 *  - tc(...) 는 turningChain 컬럼으로 세로 스택, samehole CHAIN 은 위로 볼록한 arc 후처리.
 */

import type { ExpandedRound, Op } from '$lib/expand/op';
import type { PositionedStitch, Point, LayoutResult, RoundMarker } from './types';
import { FLAT_CELL_WIDTH, FLAT_CELL_HEIGHT } from './constants';
import { computeBounds, markerFarPoint } from './bounds';
import { STITCH_META } from '$lib/model/stitch';

const MARKER_SIDE_OFFSET = 16;

/** op 가 행에서 차지하는 시각적 셀 수 (visible only). samehole/bridge chain 은 arc 처리. */
function visualProduceFor(op: Op): number {
  if (op.kind === 'MAGIC' || op.kind === 'SKIP' || op.kind === 'BRIDGE_ANCHOR') return 0;
  if (op.turningChain) return op.sameHoleContinuation ? 0 : 1;
  if (op.inSameHoleGroup && op.kind === 'CHAIN') return 0;
  if (op.inBridge && op.kind === 'CHAIN') return 0;
  return op.produce;
}

/** op 가 행에서 *예약하는* 셀 수. 1 코 = 1 cell. SKIP 과 bridge 는 안 보이지만 1 cell 자리. */
function visualClaimFor(op: Op): number {
  if (op.kind === 'MAGIC') return 0; // MAGIC 은 행 위쪽에 별도 배치
  if (op.inBridge && op.kind === 'CHAIN') return 0; // bridge 사슬은 anchor 의 셀 안에 호로 그려짐
  if (op.turningChain && op.sameHoleContinuation) return 0; // tc 연속은 세로 스택
  if (op.inSameHoleGroup && op.kind === 'CHAIN') return 0; // samehole 사슬은 호
  if (op.kind === 'SKIP') return op.consume; // SKIP(n) = n cells 자리 (빈칸, 시각 비표시)
  if (op.kind === 'BRIDGE_ANCHOR') return op.consume; // bridge = skip(M) 의 M cells 자리, 사슬 호가 위에 그려짐
  return Math.max(visualProduceFor(op), op.consume);
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
   * 단마다 cell 수가 다를 때 좁은 단을 가장 긴 단(max) 의 cell 위치 어느 쪽에 정렬할지.
   *  - 'L': 부모코 오른쪽에 공백 (좁은 단을 max 의 좌측 끝에 정렬, 자식은 오른쪽으로 펼침)
   *  - 'R': 부모코 왼쪽에 공백 (좁은 단을 max 의 우측 끝에 정렬, 자식은 왼쪽으로 펼침)
   *  - 'C': 가운데 정렬. [3x] 같은 홀수 그룹에선 가운데 stitch 가 부모코 x 와 같음.
   */
  align?: 'L' | 'R' | 'C';
}

/** 부모 행의 슬롯 정보. 자식이 자기 부모 슬롯의 정확한 x 를 알 수 있게 한다. */
interface SlotInfo {
  stitchIdx: number;
  x: number;
}

export function layoutFlat(rounds: ExpandedRound[], opts: FlatOptions = {}): LayoutResult {
  const stitches: PositionedStitch[] = [];
  const roundMarkers: RoundMarker[] = [];
  const slotMapByRound = new Map<number, SlotInfo[]>();
  const align: 'L' | 'R' | 'C' = opts.align ?? 'L';

  // 모든 단의 cell 수 중 max — 차트 폭 기준. 좁은 단은 max 안에서 align 으로 정렬.
  const cellCounts = rounds.map((r) => r.ops.reduce((sum, op) => sum + visualClaimFor(op), 0));
  const maxCells = Math.max(0, ...cellCounts);

  // 1) 각 round 를 max 폭 안에서 align 따라 cell 기반 배치.
  for (let i = 0; i < rounds.length; i++) {
    const round = rounds[i]!;
    const y = -(round.index - 1) * FLAT_CELL_HEIGHT;
    const thisCells = cellCounts[i]!;
    placeRow(round, stitches, slotMapByRound, roundMarkers, y, thisCells, maxCells, align);
  }

  // 2) 부모를 자식 그룹 위치로 align (L/R/C). 큰 round 부터 cascade.
  alignParentToChildren(stitches, align);

  // 2.5) 각 단에서 op 순서대로 x 단조 증가 (인접 코끼리 W 간격 이상) 보정.
  enforceRowMonotonic(stitches);

  // 2) tc 세로 스택
  repositionTurningChainColumns(stitches);

  // 3) samehole 사슬 arc
  repositionChainArcs(stitches);

  // 4) roundMarker 위치 재계산 — stitch 이동이 완료된 뒤 참조 stitch 의 최종 x 로 맞춤
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
  slotMapByRound: Map<number, SlotInfo[]>,
  roundMarkers: RoundMarker[],
  y: number,
  thisCells: number,
  maxCells: number,
  align: 'L' | 'R' | 'C',
): void {
  const { index: roundIdx } = round;
  const W = FLAT_CELL_WIDTH;
  const direction: 1 | -1 = round.direction === 'reverse' ? -1 : 1;
  const angle = 0;

  const parentSlots = slotMapByRound.get(roundIdx - 1) ?? [];

  // 각 op 의 claim 합으로 행 폭 결정. align 에 따라 max 폭 안에서 위치.
  const claims = round.ops.map((op) => visualClaimFor(op));
  const cellSpacing = W;
  const chartLeft = -((maxCells - 1) * W) / 2;
  const chartRight = +((maxCells - 1) * W) / 2;
  let startX: number;
  if (thisCells <= 0) {
    startX = 0;
  } else if (align === 'L') {
    startX = chartLeft;
  } else if (align === 'R') {
    startX = chartRight - (thisCells - 1) * W;
  } else {
    startX = -((thisCells - 1) * W) / 2;
  }

  const thisStitchIndices: number[] = [];
  let parentCursor = 0;
  let cellCursor = 0;
  let lastGroupParents: number[] = [];

  function consumeParents(consume: number): number[] {
    const idxs: number[] = [];
    for (let k = 0; k < consume; k++) {
      const slot = parentSlots[parentCursor + k];
      if (slot !== undefined) idxs.push(slot.stitchIdx);
    }
    parentCursor += consume;
    return idxs;
  }

  /** claim 셀의 가운데 x (이 단의 stretched cellSpacing 기준) */
  function claimCenterX(claim: number): number {
    if (claim <= 0) return startX + cellCursor * cellSpacing;
    return startX + (cellCursor + (claim - 1) / 2) * cellSpacing;
  }

  function pushStitch(
    op: Op, position: Point, opAngle: number, parentIdxs: number[], exposedSlots: number,
  ): number {
    const idx = stitches.length;
    stitches.push({
      op, roundIndex: roundIdx, position, angle: opAngle,
      parentIndices: parentIdxs, exposedSlots,
    });
    thisStitchIndices.push(idx);
    return idx;
  }

  for (let opIdx = 0; opIdx < round.ops.length; opIdx++) {
    const op = round.ops[opIdx]!;
    const claim = claims[opIdx]!;

    // MAGIC: 행 위쪽에 고정 위치
    if (op.kind === 'MAGIC') {
      pushStitch(op, { x: 0, y: y + FLAT_CELL_HEIGHT }, 0, [], 0);
      continue;
    }

    // BRIDGE_ANCHOR: claim 가운데에 invisible 앵커, 직전 사슬 호로 재배치
    if (op.kind === 'BRIDGE_ANCHOR') {
      const parentIdxs = consumeParents(op.consume);
      const cx = claimCenterX(claim);
      const leftCellX = startX + cellCursor * cellSpacing;
      const rightCellX = startX + (cellCursor + claim - 1) * cellSpacing;
      const anchorIdx = pushStitch(op, { x: cx, y }, 0, parentIdxs, op.produce);
      placeBridgeChainsArc(stitches, thisStitchIndices, anchorIdx, leftCellX, rightCellX, parentIdxs, y);
      cellCursor += claim;
      continue;
    }

    // 부모 결정 — sameHoleContinuation 은 anchor 의 부모 재사용
    const parents = op.sameHoleContinuation ? lastGroupParents : consumeParents(op.consume);
    if (!op.sameHoleContinuation) lastGroupParents = parents;

    // SKIP(n): n cells 자리 차지 (시각 비표시). 다음 단에 n 개 슬롯 노출 (코 자리 통과).
    if (op.kind === 'SKIP') {
      pushStitch(op, { x: claimCenterX(claim), y }, angle, parents, op.produce);
      cellCursor += claim;
      continue;
    }

    // inBridge CHAIN: 임시 위치 (BRIDGE_ANCHOR 처리 시 호로 재배치). 셀 미차지.
    if (op.inBridge && op.kind === 'CHAIN') {
      pushStitch(op, { x: 0, y }, angle, [], 0);
      continue;
    }

    // 셀 미차지 op (samehole CHAIN / tc continuation) — 그룹 임시 위치, 후처리에서 호/스택 정렬
    if (claim === 0) {
      pushStitch(op, { x: claimCenterX(0), y }, angle, parents, op.produce);
      continue;
    }

    // 일반 visible op (SC/V/A/samehole anchor·continuation/HDC/...).
    // V (INC, produce>consume) 는 claim 의 왼쪽 셀에 배치하고 나머지 셀은 비워둠
    // (pre-refactor 의 alignParentRows 결과와 일치 — V 옆에 빈 코 자리).
    // DEC/BRIDGE_ANCHOR (consume>produce) 와 SC/samehole (claim=1) 은 claim 가운데.
    const stitchX =
      op.produce > op.consume && claim > 1
        ? startX + cellCursor * cellSpacing // 왼쪽 셀 중심
        : claimCenterX(claim);
    pushStitch(op, { x: stitchX, y }, angle, parents, op.produce);
    cellCursor += claim;
  }

  // 슬롯 맵 (per-slot x 포함) 빌드.
  // - V (claim=produce>1, 왼쪽 셀 배치): slot[k] = stitch.x + k*W (오른쪽으로 펼침)
  // - DEC / BRIDGE_ANCHOR (claim>produce, 단일 produce): slot at stitch.x
  // - SC/samehole 각 stitch (claim=1): slot at stitch.x
  const slotInfos: SlotInfo[] = [];
  for (const sIdx of thisStitchIndices) {
    const s = stitches[sIdx]!;
    const N = s.exposedSlots;
    if (N === 0) continue;
    const op = s.op;
    if (N > 1 && op.produce > op.consume) {
      // V — stitch.x 가 leftmost 셀 중심, slot 들은 오른쪽으로 N-1 셀 이어짐
      for (let k = 0; k < N; k++) {
        slotInfos.push({ stitchIdx: sIdx, x: s.position.x + k * cellSpacing });
      }
    } else if (N === 1) {
      slotInfos.push({ stitchIdx: sIdx, x: s.position.x });
    } else {
      // 일반화 fallback (현재 케이스 없음)
      for (let k = 0; k < N; k++) {
        slotInfos.push({ stitchIdx: sIdx, x: s.position.x + (k - (N - 1) / 2) * cellSpacing });
      }
    }
  }
  slotMapByRound.set(roundIdx, slotInfos);

  // 라운드 시작 마커
  const visibleIndices = thisStitchIndices.filter((i) => {
    const k = stitches[i]!.op.kind;
    return k !== 'MAGIC' && k !== 'SKIP' && k !== 'BRIDGE_ANCHOR';
  });
  if (visibleIndices.length > 0) {
    const startStitchIdx = direction === 1
      ? visibleIndices[0]!
      : visibleIndices[visibleIndices.length - 1]!;
    roundMarkers.push({
      roundIndex: roundIdx,
      position: { x: 0, y: 0 },
      direction: direction === 1 ? 'right' : 'left',
      _stitchIdx: startStitchIdx,
    } as RoundMarker & { _stitchIdx: number });
  }
}

/**
 * BRIDGE_ANCHOR 처리 직후, thisStitchIndices 끝에서 거슬러 올라가며 inBridge CHAIN 들을
 * anchor 의 *M cells (= consume = skip(M))* 폭에 호로 배치.
 *
 *  - 호 폭 = M cells (anchor 가 차지한 셀들의 좌/우 끝 사이).
 *  - 사슬 4개까지: 호 위에 균등 분포로 모두 표시.
 *  - 5개 이상: 첫 사슬 + (N) 라벨 + 마지막 사슬로 축약 (가운데는 hidden).
 *  - bulge 는 행 간격의 30% 이하로 캡 (너무 높지 않게).
 *  - 호의 정점은 부모 *반대* 방향 (위로 볼록).
 */
function placeBridgeChainsArc(
  stitches: PositionedStitch[],
  thisStitchIndices: number[],
  anchorIdx: number,
  leftCellX: number,
  rightCellX: number,
  parentIdxs: number[],
  y: number,
): void {
  const chainSlot: number[] = [];
  for (let j = thisStitchIndices.length - 2; j >= 0; j--) {
    const stIdx = thisStitchIndices[j]!;
    const stOp = stitches[stIdx]!.op;
    if (stOp.inBridge && stOp.kind === 'CHAIN') chainSlot.unshift(stIdx);
    else break;
  }
  const N = chainSlot.length;
  if (N === 0) return;

  const ABBREV_THRESHOLD = 5;
  const abbreviated = N >= ABBREV_THRESHOLD;

  // 호 폭 = anchor 의 M cells 영역. M=1 이면 1 cell 폭으로 fallback.
  const anchor = stitches[anchorIdx]!;
  const cellChord = Math.abs(rightCellX - leftCellX);
  const minChord = FLAT_CELL_WIDTH * 0.8;
  let leftX = leftCellX, rightX = rightCellX;
  if (cellChord < minChord) {
    const center = (leftCellX + rightCellX) / 2;
    leftX = center - minChord / 2;
    rightX = center + minChord / 2;
  }
  const left = { x: leftX, y };
  const right = { x: rightX, y };

  const parentY = parentIdxs.length > 0 ? stitches[parentIdxs[0]!]!.position.y : y - FLAT_CELL_HEIGHT;
  const bulge = Math.min(FLAT_CELL_HEIGHT * 0.3, Math.abs(rightX - leftX) * 0.2);

  const dirY = Math.sign(y - parentY) || -1; // 부모 반대 방향
  const cx = (left.x + right.x) / 2;
  const cy = y + 2 * bulge * dirY;

  // 좌표 계산 helper
  const evalAt = (t: number) => {
    const bx = bezierQuad(left.x, cx, right.x, t);
    const by = bezierQuad(left.y, cy, right.y, t);
    const tx = bezierQuadDeriv(left.x, cx, right.x, t);
    const ty = bezierQuadDeriv(left.y, cy, right.y, t);
    return { x: bx, y: by, angle: Math.atan2(ty, tx) };
  };

  if (abbreviated) {
    // 첫/마지막 사슬은 호의 양 끝 (chord 거의 끝) 에 표시. 가운데 자리에는 숫자 라벨.
    // 사슬 기호 사이 가용 폭에 맞춰 폰트 자동 축소.
    const firstP = evalAt(0.05);
    const lastP = evalAt(0.95);
    const firstSt = stitches[chainSlot[0]!]!;
    firstSt.position = { x: firstP.x, y: firstP.y };
    firstSt.angle = firstP.angle;
    const lastSt = stitches[chainSlot[N - 1]!]!;
    lastSt.position = { x: lastP.x, y: lastP.y };
    lastSt.angle = lastP.angle;
    // 가운데 사슬들 모두 hidden — 가운데 자리는 라벨로 대체.
    for (let k = 1; k < N - 1; k++) {
      const st = stitches[chainSlot[k]!]!;
      st.hidden = true;
      st.position = { x: anchor.position.x, y };
    }
    // 라벨 = N (괄호 없이 숫자만). 가운데 사슬 자리에 표시.
    const labelP = evalAt(0.5);
    anchor.position = { x: labelP.x, y: labelP.y };
    const labelText = String(N);
    anchor.labelText = labelText;
    // 가용 폭 = 첫/마지막 사슬 사이 안쪽 - 마진. 사슬 기호 반폭 5px, 마진 1px.
    const SYMBOL_HALF = 5;
    const MARGIN = 1;
    const available = Math.max(6, Math.abs(lastP.x - firstP.x) - 2 * SYMBOL_HALF - 2 * MARGIN);
    const CHAR_WIDTH_RATIO = 0.55;
    const idealSize = available / (labelText.length * CHAR_WIDTH_RATIO);
    anchor.labelFontSize = Math.max(7, Math.min(11, idealSize));
  } else {
    // 정상: 호 길이 기준으로 N 개 균등 배치.
    const arcWidth = Math.abs(right.x - left.x);
    const CHAIN_SPACING = arcWidth / Math.max(N + 1, 2);
    const tValues = sampleByArcLength(left, { x: cx, y: cy }, right, N, CHAIN_SPACING);
    for (let k = 0; k < N; k++) {
      const p = evalAt(tValues[k]!);
      const st = stitches[chainSlot[k]!]!;
      st.position = { x: p.x, y: p.y };
      st.angle = p.angle;
    }
  }
}


// ============================================================
// 부모 → 자식 그룹 정렬 (L: firstKid, R: lastKid, C: 평균).
// DEC/BRIDGE_ANCHOR 처럼 자식이 다중 부모 공유 시 이동 금지.
// 큰 round 부터 작은 순으로 내려가며 연쇄 적용.
// ============================================================

function alignParentToChildren(stitches: PositionedStitch[], align: 'L' | 'R' | 'C'): void {
  const childrenOf = new Map<number, number[]>();
  for (let i = 0; i < stitches.length; i++) {
    for (const pIdx of stitches[i]!.parentIndices) {
      const arr = childrenOf.get(pIdx) ?? [];
      arr.push(i);
      childrenOf.set(pIdx, arr);
    }
  }

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
      if (parent.op.kind === 'MAGIC') continue;
      const kids = childrenOf.get(pIdx);
      if (!kids || kids.length === 0) continue;
      const firstKid = stitches[kids[0]!]!;
      if (firstKid.parentIndices.length > 1) continue;
      let targetX: number;
      if (align === 'L') {
        targetX = firstKid.position.x;
      } else if (align === 'R') {
        targetX = stitches[kids[kids.length - 1]!]!.position.x;
      } else {
        let sum = 0;
        for (const k of kids) sum += stitches[k]!.position.x;
        targetX = sum / kids.length;
      }
      if (parent.position.x === targetX) continue;
      const dx = targetX - parent.position.x;
      parent.position = { x: targetX, y: parent.position.y };
      // BRIDGE_ANCHOR 가 이동하면 자기 호의 사슬들도 같은 dx 만큼 함께 이동.
      if (parent.op.kind === 'BRIDGE_ANCHOR') {
        for (let j = pIdx - 1; j >= 0; j--) {
          const t = stitches[j]!;
          if (t.roundIndex !== parent.roundIndex) break;
          if (!t.op.inBridge || t.op.kind !== 'CHAIN') break;
          t.position = { x: t.position.x + dx, y: t.position.y };
        }
      }
    }
  }
}

/**
 * 각 단에서 op 순서대로 인접 코의 x 가 단조 증가하도록 보정.
 * cascade 가 stitch 를 자식 위치로 끌어와 op 순서에 비해 너무 왼쪽이 되면 (= SKIP 위치 등에 겹침),
 * prev.x + W 까지 오른쪽으로 push. samehole continuation 은 anchor 와 함께 이동하므로 같이 push.
 * BRIDGE_ANCHOR 의 사슬도 anchor 와 함께 push.
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
      if (s.op.kind === 'MAGIC') continue; // MAGIC 은 별도 위치
      // bridge 사슬은 호로 그려져 cell 순서에 없음 — 단조 체크 skip.
      if (s.op.inBridge && s.op.kind === 'CHAIN') continue;
      const minX = prevX === -Infinity ? s.position.x : prevX + W;
      if (s.position.x < minX) {
        const dx = minX - s.position.x;
        s.position = { x: minX, y: s.position.y };
        // BRIDGE_ANCHOR 가 push 되면 자기 호의 사슬들도 같이 이동.
        if (s.op.kind === 'BRIDGE_ANCHOR') {
          for (let j = idx - 1; j >= 0; j--) {
            const t = stitches[j]!;
            if (t.roundIndex !== s.roundIndex) break;
            if (!t.op.inBridge || t.op.kind !== 'CHAIN') break;
            t.position = { x: t.position.x + dx, y: t.position.y };
          }
        }
      }
      prevX = s.position.x;
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
