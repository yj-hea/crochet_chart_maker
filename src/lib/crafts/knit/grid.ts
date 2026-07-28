/**
 * 대바늘 격자 레이아웃.
 *
 * 원통(round) / 평면(flat) 모두 **같은 격자**에 그린다 (docs/knit_symbol_system.md §6.1).
 * 도형이 바꾸는 것은 좌표가 아니라 각 단이 겉면인지 안면인지, 즉 방향·반전 규칙뿐이다.
 *
 * 규칙:
 *  - 1코 = 1칸. 한 단의 칸 수 = 그 단이 만든 코 수(totalProduce).
 *  - 차트 폭 = 모든 단의 최대 칸 수. 모자란 칸은 no-stitch 로 채운다 (기본 가운데 정렬).
 *  - 1단이 맨 아래. 위로 쌓인다 (뜨개 차트 관행).
 *  - 단 번호는 겉면 단이면 오른쪽, 안면 단이면 왼쪽에 표기 → 방향을 번호 위치로 알 수 있다.
 */

import type { ExpandedRound, Op } from '$lib/expand/op';
import type { LayoutResult, PositionedStitch, Point, RoundMarker } from '$lib/layout/types';
import { isRightSide, toDisplayOrder } from './flip';

/** 셀 크기 — 실제 뜨개 코 비율(가로:세로 ≈ 1:0.7) */
export const KNIT_CELL_WIDTH = 20;
export const KNIT_CELL_HEIGHT = 14;

/** 단 번호를 적을 좌우 여백 */
const NUMBER_GUTTER = 18;

export interface KnitGridOptions {
  /** 'flat'(평면) | 'round'(원통) */
  shape?: string;
  /** 단마다 칸 수가 다를 때의 정렬 */
  align?: 'L' | 'R' | 'C';
  /** 안면 단 기호 반전. false 면 "뜨는 대로" 표시 */
  flipSymbols?: boolean;
  /** 상하 반전: true 면 1단이 위쪽 */
  flipVertical?: boolean;
}

/** 이 op 가 차지하는 칸 수. 코 없음은 1칸, 그 외는 만든 코 수만큼. */
function cellClaim(op: Op): number {
  if (op.kind === 'NO_STITCH') return 1;
  return Math.max(1, op.produce);
}

export function layoutKnitGrid(
  rounds: ExpandedRound[],
  opts: KnitGridOptions = {},
): LayoutResult {
  const shape = opts.shape ?? 'flat';
  const align = opts.align ?? 'C';
  const flipSymbols = opts.flipSymbols ?? true;
  const flipVertical = opts.flipVertical ?? false;

  // 1) 단별 표시 ops (좌→우) 와 칸 수 계산
  const rows = rounds.map((round) => {
    const rightSide = isRightSide(shape, round.index, round.direction);
    const ops = toDisplayOrder(round, rightSide, flipSymbols);
    const width = ops.reduce((sum, op) => sum + cellClaim(op), 0);
    return { round, ops, width, rightSide };
  });

  const chartWidth = rows.reduce((max, r) => Math.max(max, r.width), 0);
  const rowCount = rows.length;

  const stitches: PositionedStitch[] = [];
  const fillerCells: Point[] = [];
  const roundMarkers: RoundMarker[] = [];

  for (let r = 0; r < rowCount; r++) {
    const row = rows[r]!;
    // 1단이 아래 (y 는 아래로 증가하므로 뒤집어 배치)
    const rowFromTop = flipVertical ? r : rowCount - 1 - r;
    const yTop = rowFromTop * KNIT_CELL_HEIGHT;
    const yCenter = yTop + KNIT_CELL_HEIGHT / 2;

    const pad = chartWidth - row.width;
    const leftPad = align === 'L' ? 0 : align === 'R' ? pad : Math.floor(pad / 2);
    const rightPad = pad - leftPad;

    // 왼쪽 no-stitch 채움
    for (let c = 0; c < leftPad; c++) {
      fillerCells.push({ x: c * KNIT_CELL_WIDTH + KNIT_CELL_WIDTH / 2, y: yCenter });
    }

    // 실제 코
    let col = leftPad;
    for (const op of row.ops) {
      const claim = cellClaim(op);
      stitches.push({
        op,
        roundIndex: row.round.index,
        position: { x: col * KNIT_CELL_WIDTH + KNIT_CELL_WIDTH / 2, y: yCenter },
        parentIndices: [],
        exposedSlots: op.produce,
        cell: { row: rowFromTop, col, span: claim },
      });
      // 한 op 가 여러 칸을 차지하면(kfb 등) 나머지 칸은 비워 둔다
      col += claim;
    }

    // 오른쪽 no-stitch 채움
    for (let c = 0; c < rightPad; c++) {
      const cc = col + c;
      fillerCells.push({ x: cc * KNIT_CELL_WIDTH + KNIT_CELL_WIDTH / 2, y: yCenter });
    }

    // 단 번호 — 겉면은 오른쪽, 안면은 왼쪽
    roundMarkers.push({
      roundIndex: row.round.index,
      position: row.rightSide
        ? { x: chartWidth * KNIT_CELL_WIDTH + NUMBER_GUTTER / 2, y: yCenter }
        : { x: -NUMBER_GUTTER / 2, y: yCenter },
      direction: row.rightSide ? 'right' : 'left',
    });
  }

  const width = chartWidth * KNIT_CELL_WIDTH;
  const height = rowCount * KNIT_CELL_HEIGHT;
  const minX = -NUMBER_GUTTER;
  const maxX = width + NUMBER_GUTTER;

  return {
    stitches,
    bounds: {
      minX,
      minY: 0,
      maxX,
      maxY: height,
      width: maxX - minX,
      height,
    },
    gridGuide: {
      type: 'rect',
      cellWidth: KNIT_CELL_WIDTH,
      cellHeight: KNIT_CELL_HEIGHT,
      xOffset: 0,
      yOffset: 0,
    },
    roundMarkers,
    cellSize: { width: KNIT_CELL_WIDTH, height: KNIT_CELL_HEIGHT },
    fillerCells,
  };
}
