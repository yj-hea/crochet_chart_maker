/**
 * 대바늘 격자 레이아웃.
 *
 * 원통(round) / 평면(flat) 모두 **같은 격자**에 그린다 (docs/knit_symbol_system.md §6.1).
 * 도형이 바꾸는 것은 좌표가 아니라 각 단이 겉면인지 안면인지, 즉 방향·반전 규칙뿐이다.
 *
 * 규칙:
 *  - 1코 = 1칸. 1단이 맨 아래, 위로 쌓인다 (뜨개 차트 관행).
 *  - 단 번호는 겉면 단이면 오른쪽, 안면 단이면 왼쪽 → 방향을 번호 위치로 알 수 있다.
 *  - 차트 폭 = 가장 넓은 단. 모자란 칸은 no-stitch 로 채운다 (기본 가운데 정렬).
 *
 * Cascade (기본 ON):
 *  - 늘림(`kfb`)처럼 한 코가 여러 코를 만들면 **아래 단의 부모 칸이 그만큼 넓어져** 열이 맞는다.
 *  - 줄임(`k2tog`)은 반대로 자식 칸이 부모 둘의 폭만큼 넓어진다.
 *  - 부모가 없는 코(`yo`, `m1l`)는 아래 단에 같은 폭의 **no-stitch 칸**을 만들어 자리를 비운다.
 *  Cascade OFF 면 모든 칸이 1 단위 폭(늘림만 만든 코 수만큼)으로 균등 배치된다.
 */

import type { ExpandedRound, Op } from '$lib/expand/op';
import type { LayoutResult, PositionedStitch, RoundMarker } from '$lib/layout/types';
import { isRightSide, toDisplayOrder } from './flip';
import { cellRatio, type Gauge } from '$lib/model/gauge';

/**
 * 셀 크기.
 * 가로는 고정하고 세로만 게이지(코수/단수) 비율로 조정한다 —
 * 게이지를 바꿔도 차트 가로 폭이 출렁이지 않도록.
 */
export const KNIT_CELL_WIDTH = 20;
/** 게이지 미입력 시 세로 (가로:세로 = 1:0.7) */
export const KNIT_CELL_HEIGHT = 14;

/** 단 번호를 적을 좌우 여백 */
const NUMBER_GUTTER = 18;

/** 폭 전파 반복 상한 — 보통 2~3 회면 수렴한다 */
const WIDTH_PASSES = 8;

export interface KnitGridOptions {
  /** 'flat'(평면) | 'round'(원통) */
  shape?: string;
  /** 단마다 폭이 다를 때의 정렬 */
  align?: 'L' | 'R' | 'C';
  /** 안면 단 기호 반전. false 면 "뜨는 대로" 표시 */
  flipSymbols?: boolean;
  /** 상하 반전: true 면 1단이 위쪽 */
  flipVertical?: boolean;
  /** 부모-자식 폭 맞춤 (기본 true) */
  cascade?: boolean;
  /** 게이지 (10cm 당 코수/단수). 셀 세로 길이에 반영. 미입력이면 기본 비율 */
  gauge?: Gauge;
}

/** 표시용 한 칸. op 이 없으면 no-stitch (자동 채움) 칸. */
interface Cell {
  op?: Op;
  /** 단위 칸 수 */
  span: number;
}

/** 이 op 자체가 요구하는 최소 폭 — 만든 코 수(늘림)를 반영 */
function ownSpan(op: Op): number {
  if (op.kind === 'NO_STITCH') return 1;
  return Math.max(1, op.produce);
}

/**
 * 부모-자식 연결. 표시 순서(좌→우)에서 순차 매칭한다.
 *
 * 겉면 단은 오른쪽부터, 안면 단은 왼쪽부터 뜨지만 표시 순서로 바꾸고 나면
 * 두 경우 모두 아래 단과 같은 방향으로 나열되므로 순차 매칭이 성립한다.
 */
function computeParents(rows: Op[][]): number[][][] {
  const parents: number[][][] = rows.map((ops) => ops.map(() => []));
  for (let r = 1; r < rows.length; r++) {
    // 아래 단이 노출하는 슬롯 — op 인덱스를 produce 수만큼 반복
    const slots: number[] = [];
    rows[r - 1]!.forEach((op, i) => {
      for (let k = 0; k < op.produce; k++) slots.push(i);
    });
    let cursor = 0;
    rows[r]!.forEach((op, i) => {
      const taken: number[] = [];
      for (let k = 0; k < op.consume && cursor < slots.length; k++) {
        const p = slots[cursor++]!;
        if (!taken.includes(p)) taken.push(p);
      }
      parents[r]![i] = taken;
    });
  }
  return parents;
}

/**
 * 인접 두 단의 연결 그룹.
 * 부모 범위 [pStart, pEnd] 와 그에 걸린 자식들. 예)
 *  - 1:1        → 부모 1, 자식 1
 *  - 늘림(kfb)  → 부모 1, 자식 1 (자식이 여러 칸)
 *  - 줄임(k2tog)→ 부모 2, 자식 1
 */
interface LinkGroup {
  pStart: number;
  pEnd: number;
  children: number[];
}

function buildGroups(parentsOfRow: number[][]): LinkGroup[] {
  const groups: LinkGroup[] = [];
  let cur: LinkGroup | undefined;
  parentsOfRow.forEach((ps, childIdx) => {
    if (ps.length === 0) return; // 부모 없는 코(yo, m1l)는 아래 단에 빈 칸으로 처리
    const lo = Math.min(...ps);
    const hi = Math.max(...ps);
    if (cur && lo <= cur.pEnd) {
      cur.pEnd = Math.max(cur.pEnd, hi);
      cur.children.push(childIdx);
    } else {
      if (cur) groups.push(cur);
      cur = { pStart: lo, pEnd: hi, children: [childIdx] };
    }
  });
  if (cur) groups.push(cur);
  return groups;
}

/**
 * 각 코의 폭(단위 칸 수)을 계산.
 *
 * cascade ON 이면 인접 두 단의 연결 그룹마다
 * "부모들의 폭 합 == 자식들의 폭 합" 이 되도록 좁은 쪽을 넓힌다.
 *  - 늘림: 자식이 더 넓음 → 부모 칸이 넓어진다 (요청 동작)
 *  - 줄임: 부모가 더 넓음 → 자식 칸이 넓어진다
 * 아래 단이 넓어지면 그 아래 단에도 영향을 주므로 수렴할 때까지 반복한다.
 */
function computeSpans(rows: Op[][], parents: number[][][], cascade: boolean): number[][] {
  const spans = rows.map((ops) => ops.map(ownSpan));
  if (!cascade) return spans;

  const groupsByRow = rows.map((_, r) => (r === 0 ? [] : buildGroups(parents[r]!)));

  for (let pass = 0; pass < WIDTH_PASSES; pass++) {
    let changed = false;
    for (let r = rows.length - 1; r >= 1; r--) {
      for (const g of groupsByRow[r]!) {
        let pSum = 0;
        for (let p = g.pStart; p <= g.pEnd; p++) pSum += spans[r - 1]![p]!;
        const cSum = g.children.reduce((acc, c) => acc + spans[r]![c]!, 0);
        const width = Math.max(pSum, cSum);
        // 좁은 쪽의 첫 칸이 차이를 흡수한다
        if (pSum < width) { spans[r - 1]![g.pStart]! += width - pSum; changed = true; }
        if (cSum < width) { spans[r]![g.children[0]!]! += width - cSum; changed = true; }
      }
    }
    if (!changed) break;
  }
  return spans;
}

/**
 * 표시용 칸 배열을 만든다. cascade ON 이면 위 단부터 내려오며
 * 부모 없는 코(`yo`, `m1l`) 아래에 같은 폭의 no-stitch 칸을 끼워 넣는다.
 * (그 칸 자체도 부모가 없으므로 더 아래 단으로 계속 전파된다.)
 */
function buildCellRows(
  rows: Op[][],
  parents: number[][][],
  spans: number[][],
  cascade: boolean,
): Cell[][] {
  const cellRows: Cell[][] = rows.map((ops, r) =>
    ops.map((op, i) => ({ op, span: spans[r]![i]! })),
  );
  if (!cascade) return cellRows;

  for (let r = rows.length - 2; r >= 0; r--) {
    const above = cellRows[r + 1]!;
    const ops = rows[r]!;
    const out: Cell[] = [];
    let emitted = 0;       // 다음에 내보낼 이 단의 op 인덱스
    let aboveOpIdx = 0;    // above 에서 실제 op 인 칸의 인덱스

    for (const cell of above) {
      if (!cell.op) {
        // 위 단의 no-stitch 칸 → 아래로도 그대로 전파
        out.push({ span: cell.span });
        continue;
      }
      const ps = parents[r + 1]![aboveOpIdx++]!;
      if (ps.length === 0) {
        // 부모 없는 코 (yo, m1l …) → 아래 단에 빈 칸
        out.push({ span: cell.span });
        continue;
      }
      const lastParent = Math.max(...ps);
      while (emitted <= lastParent && emitted < ops.length) {
        out.push({ op: ops[emitted]!, span: spans[r]![emitted]! });
        emitted++;
      }
    }
    // 위 단이 소비하지 않은 나머지 코
    while (emitted < ops.length) {
      out.push({ op: ops[emitted]!, span: spans[r]![emitted]! });
      emitted++;
    }
    cellRows[r] = out;
  }
  return cellRows;
}

export function layoutKnitGrid(
  rounds: ExpandedRound[],
  opts: KnitGridOptions = {},
): LayoutResult {
  const shape = opts.shape ?? 'flat';
  const align = opts.align ?? 'C';
  const flipSymbols = opts.flipSymbols ?? true;
  const flipVertical = opts.flipVertical ?? false;
  const cascade = opts.cascade ?? true;
  const cellHeight = KNIT_CELL_WIDTH * cellRatio(opts.gauge);

  // 1) 단별 표시 ops (좌→우)
  const meta = rounds.map((round) => {
    const rightSide = isRightSide(shape, round.index, round.direction);
    return { round, ops: toDisplayOrder(round, rightSide, flipSymbols), rightSide };
  });
  const opRows = meta.map((m) => m.ops);

  // 2) 부모 연결 → 폭 전파 → 표시 칸 배열
  const parents = computeParents(opRows);
  const spans = computeSpans(opRows, parents, cascade);
  const cellRows = buildCellRows(opRows, parents, spans, cascade);

  const rowSpans = cellRows.map((cells) => cells.reduce((sum, c) => sum + c.span, 0));
  const chartSpan = rowSpans.reduce((max, s) => Math.max(max, s), 0);
  const rowCount = cellRows.length;

  const stitches: PositionedStitch[] = [];
  const fillerCells: Array<{ x: number; y: number; span: number }> = [];
  const roundMarkers: RoundMarker[] = [];

  for (let r = 0; r < rowCount; r++) {
    const cells = cellRows[r]!;
    // 1단이 아래 (y 는 아래로 증가하므로 뒤집어 배치)
    const rowFromTop = flipVertical ? r : rowCount - 1 - r;
    const yCenter = rowFromTop * cellHeight + cellHeight / 2;

    const pad = chartSpan - rowSpans[r]!;
    const leftPad = align === 'L' ? 0 : align === 'R' ? pad : Math.floor(pad / 2);
    const rightPad = pad - leftPad;

    let cursor = 0;
    const emitFiller = (span: number) => {
      fillerCells.push({ x: (cursor + span / 2) * KNIT_CELL_WIDTH, y: yCenter, span });
      cursor += span;
    };

    for (let c = 0; c < leftPad; c++) emitFiller(1);

    for (const cell of cells) {
      if (!cell.op) { emitFiller(cell.span); continue; }
      stitches.push({
        op: cell.op,
        roundIndex: meta[r]!.round.index,
        position: { x: (cursor + cell.span / 2) * KNIT_CELL_WIDTH, y: yCenter },
        parentIndices: [],
        exposedSlots: cell.op.produce,
        cell: { row: rowFromTop, col: cursor, span: cell.span },
      });
      cursor += cell.span;
    }

    for (let c = 0; c < rightPad; c++) emitFiller(1);

    // 단 번호 — 겉면은 오른쪽, 안면은 왼쪽
    roundMarkers.push({
      roundIndex: meta[r]!.round.index,
      position: meta[r]!.rightSide
        ? { x: chartSpan * KNIT_CELL_WIDTH + NUMBER_GUTTER / 2, y: yCenter }
        : { x: -NUMBER_GUTTER / 2, y: yCenter },
      direction: meta[r]!.rightSide ? 'right' : 'left',
    });
  }

  const width = chartSpan * KNIT_CELL_WIDTH;
  const height = rowCount * cellHeight;
  const minX = -NUMBER_GUTTER;
  const maxX = width + NUMBER_GUTTER;

  return {
    stitches,
    bounds: { minX, minY: 0, maxX, maxY: height, width: maxX - minX, height },
    gridGuide: {
      type: 'rect',
      cellWidth: KNIT_CELL_WIDTH,
      cellHeight,
      xOffset: 0,
      yOffset: 0,
    },
    roundMarkers,
    cellSize: { width: KNIT_CELL_WIDTH, height: cellHeight },
    fillerCells,
  };
}
