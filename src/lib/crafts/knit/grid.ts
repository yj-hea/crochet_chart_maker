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
import { splitMarkers } from '$lib/layout/markers';
import type { PositionedMarker } from '$lib/layout/types';
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
  /** 이 칸이 온 op 의 인덱스 (마커 경계 좌표 계산용) */
  opIndex?: number;
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
 * 칸 계획 — 모든 칸은 **1 단위 폭**이고, 열은 빈 칸으로만 맞춘다.
 *
 * 1. **구멍** (양 모드 공통): 단 중간 코막음으로 편물에 뚫린 자리는 위 단들로 계속 이어진다.
 * 2. **열 맞춤** (cascade ON 에서만): 늘림·줄임으로 코 수가 달라진 만큼
 *    늘림 코 아래 / 줄임 코 옆에 빈 칸을 넣어 열을 맞춘다.
 *    OFF 면 이 빈 칸을 넣지 않아 코가 서로 붙어 보이고, 폭 차이는 정렬 옵션으로만 처리한다.
 *
 * 코 수가 변하지 않는 단(레이스의 `yo`+`ssk`)은 어느 모드에서도 격자를 건드리지 않는다.
 */
interface RowPlan {
  /** op 별 칸 폭 — 그 코가 만드는 코 수 (kfb=2). 열 맞춤으로 넓히지 않는다. */
  spans: number[];
  /** op 앞에 끼워 넣을 빈 칸들의 폭 (key = op 인덱스, ops.length = 행 끝) */
  gapsBefore: Map<number, number[]>;
}

function sum(ns: readonly number[]): number {
  return ns.reduce((a, b) => a + b, 0);
}

function planRows(rows: Op[][], parents: number[][][], cascade: boolean): RowPlan[] {
  const plans: RowPlan[] = rows.map((ops) => ({
    spans: ops.map(ownSpan),
    gapsBefore: new Map<number, number[]>(),
  }));

  const children: number[][][] = rows.map((ops) => ops.map(() => []));
  for (let r = 1; r < rows.length; r++) {
    parents[r]!.forEach((ps, childIdx) => {
      for (const p of ps) children[r - 1]![p]!.push(childIdx);
    });
  }

  const addGap = (plan: RowPlan, at: number, span: number) => {
    const list = plan.gapsBefore.get(at) ?? [];
    list.push(span);
    plan.gapsBefore.set(at, list);
  };
  const gapUnits = (plan: RowPlan): number =>
    [...plan.gapsBefore.values()].reduce((acc, l) => acc + sum(l), 0);
  const rowUnits = (r: number): number => sum(plans[r]!.spans) + gapUnits(plans[r]!);

  // 1) 구멍 — 단 중간 코막음 자리는 위 단으로 계속 이어진다
  for (let r = 1; r < rows.length; r++) {
    // 이 단에서 부모 없이 새로 만든 코(감아코·m1·yo)는 아래 구멍을 메운다
    let absorb = 0;
    for (let i = 0; i < rows[r]!.length; i++) {
      if (parents[r]![i]!.length === 0) absorb += plans[r]!.spans[i]!;
    }
    // 아래 단의 구멍을 이 단으로 전파 (메워진 만큼 제외)
    for (const [g, spans] of [...plans[r - 1]!.gapsBefore.entries()].sort((a, b) => a[0] - b[0])) {
      const at = childIndexForParent(parents[r]!, g);
      for (const span of spans) {
        const covered = Math.min(absorb, span);
        absorb -= covered;
        if (span - covered > 0) addGap(plans[r]!, at, span - covered);
      }
    }
    // 이 단이 소비하지 않은 코막음 코 → 바로 위에 구멍 (새로 만든 코가 메우면 제외)
    for (let p = 0; p < rows[r - 1]!.length; p++) {
      if (children[r - 1]![p]!.length > 0) continue;
      if (rows[r - 1]![p]!.kind !== 'BIND_OFF') continue;
      const span = plans[r - 1]!.spans[p]!;
      const covered = Math.min(absorb, span);
      absorb -= covered;
      if (span - covered > 0) {
        addGap(plans[r]!, firstChildIndexAfter(parents[r]!, p), span - covered);
      }
    }
  }

  if (!cascade) return plans;

  // 2) 열 맞춤 — 늘림/줄임으로 생긴 코 수 차이만큼 빈 칸을 넣는다
  for (let pass = 0; pass < WIDTH_PASSES; pass++) {
    let changed = false;

    for (let r = 1; r < rows.length; r++) {
      const parentPlan = plans[r - 1]!;
      const childPlan = plans[r]!;
      let diff = rowUnits(r - 1) - rowUnits(r);

      if (diff > 0) {
        // 자식 단이 좁다 — 소비되지 않은 코 위, 그리고 줄임 코 옆에 빈 칸
        for (let p = 0; p < rows[r - 1]!.length && diff > 0; p++) {
          if (children[r - 1]![p]!.length > 0) continue;
          if (rows[r - 1]![p]!.kind === 'BIND_OFF') continue; // 구멍은 위에서 처리됨
          const span = Math.min(diff, parentPlan.spans[p]!);
          addGap(childPlan, firstChildIndexAfter(parents[r]!, p), span);
          diff -= span;
          changed = true;
        }
        for (let i = 0; i < rows[r]!.length && diff > 0; i++) {
          const ps = parents[r]![i]!;
          if (ps.length <= 1) continue;
          const room = sum(ps.map((p) => parentPlan.spans[p]!)) - childPlan.spans[i]!;
          const span = Math.min(diff, room);
          if (span > 0) { addGap(childPlan, i, span); diff -= span; changed = true; }
        }
      } else if (diff < 0) {
        // 부모 단이 좁다 — 부모 없는 코 아래, 그리고 늘림 부모 옆에 빈 칸
        let need = -diff;
        for (let i = 0; i < rows[r]!.length && need > 0; i++) {
          if (parents[r]![i]!.length > 0) continue;
          const at = lastParentIndexBefore(parents[r]!, i) + 1;
          const span = Math.min(need, childPlan.spans[i]!);
          addGap(parentPlan, at, span);
          need -= span;
          changed = true;
        }
        for (let p = 0; p < rows[r - 1]!.length && need > 0; p++) {
          const kids = children[r - 1]![p]!;
          if (kids.length === 0) continue;
          const room = sum(kids.map((c) => childPlan.spans[c]!)) - parentPlan.spans[p]!;
          const span = Math.min(need, room);
          if (span > 0) { addGap(parentPlan, p + 1, span); need -= span; changed = true; }
        }
      }
    }
    if (!changed) break;
  }
  return plans;
}

/** 부모 인덱스 p 위에 오는 자식 위치 — p 를 소비하는 첫 자식 (없으면 행 끝) */
function childIndexForParent(parentsOfRow: number[][], p: number): number {
  for (let i = 0; i < parentsOfRow.length; i++) {
    if (parentsOfRow[i]!.includes(p)) return i;
  }
  return firstChildIndexAfter(parentsOfRow, p);
}

/** 부모 인덱스 p 바로 위 위치 — p 이후를 처음 소비하는 자식의 인덱스 */
function firstChildIndexAfter(parentsOfRow: number[][], p: number): number {
  for (let i = 0; i < parentsOfRow.length; i++) {
    const ps = parentsOfRow[i]!;
    if (ps.length > 0 && Math.max(...ps) > p) return i;
  }
  return parentsOfRow.length;
}

/** 자식 인덱스 i 바로 아래 위치 — i 이전 자식들이 소비한 마지막 부모 */
function lastParentIndexBefore(parentsOfRow: number[][], i: number): number {
  let last = -1;
  for (let k = 0; k < i; k++) {
    const ps = parentsOfRow[k]!;
    if (ps.length > 0) last = Math.max(last, Math.max(...ps));
  }
  return last;
}

/** 계획을 실제 칸 배열로 펼친다 */
function toCells(ops: Op[], plan: RowPlan): Cell[] {
  const out: Cell[] = [];
  for (let i = 0; i <= ops.length; i++) {
    for (const span of plan.gapsBefore.get(i) ?? []) out.push({ span });
    if (i < ops.length) out.push({ op: ops[i]!, span: plan.spans[i]!, opIndex: i });
  }
  return out;
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
  //    마커는 표시 순서로 뒤집은 **뒤에** 분리한다 — 겉면 단은 순서가 반전되므로
  //    "앞에 몇 코" 도 함께 뒤집혀야 화면상 위치가 맞는다.
  const meta = rounds.map((round) => {
    const rightSide = isRightSide(shape, round.index, round.direction);
    const display = toDisplayOrder(round, rightSide, flipSymbols);
    const { ops, markers } = splitMarkers(display, round.index);
    return { round, ops, markers, rightSide };
  });
  const opRows = meta.map((m) => m.ops);

  // 2) 부모 연결 → 칸 계획(순 증감분만 조정) → 표시 칸 배열
  const parents = computeParents(opRows);
  const plans = planRows(opRows, parents, cascade);
  const cellRows = opRows.map((ops, r) => toCells(ops, plans[r]!));

  const rowSpans = cellRows.map((cells) => cells.reduce((sum, c) => sum + c.span, 0));
  const chartSpan = rowSpans.reduce((max, s) => Math.max(max, s), 0);
  const rowCount = cellRows.length;

  const stitches: PositionedStitch[] = [];
  const fillerCells: NonNullable<LayoutResult['fillerCells']> = [];
  const roundMarkers: RoundMarker[] = [];
  const stitchMarkers: PositionedMarker[] = [];

  for (let r = 0; r < rowCount; r++) {
    const cells = cellRows[r]!;
    // 1단이 아래 (y 는 아래로 증가하므로 뒤집어 배치)
    const rowFromTop = flipVertical ? r : rowCount - 1 - r;
    const yCenter = rowFromTop * cellHeight + cellHeight / 2;

    const pad = chartSpan - rowSpans[r]!;
    const leftPad = align === 'L' ? 0 : align === 'R' ? pad : Math.floor(pad / 2);
    const rightPad = pad - leftPad;

    let cursor = 0;
    // 정렬용 좌우 여백 — 격자만 그리고 회색으로 채우지 않는다 (코가 없는 자리일 뿐)
    const emitFiller = (span: number) => {
      fillerCells.push({ x: (cursor + span / 2) * KNIT_CELL_WIDTH, y: yCenter, span, kind: 'pad' });
      cursor += span;
    };
    // 행 안쪽의 빈 칸 — 구멍·열 맞춤. 회색으로 채운다
    const emitGap = (span: number) => {
      fillerCells.push({ x: (cursor + span / 2) * KNIT_CELL_WIDTH, y: yCenter, span, kind: 'hole' });
      cursor += span;
    };

    for (let c = 0; c < leftPad; c++) emitFiller(1);

    // op 인덱스 i 의 **왼쪽 경계** x 좌표 (단위). 마커를 여기에 놓는다.
    const boundary = new Array<number>(opRows[r]!.length + 1).fill(cursor);

    for (const cell of cells) {
      if (!cell.op) { emitGap(cell.span); continue; }
      if (cell.opIndex !== undefined) boundary[cell.opIndex] = cursor;
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

    // 단 맨 뒤 경계 — 마지막 코의 오른쪽 끝 (좌우 여백 앞)
    boundary[opRows[r]!.length] = cursor;
    for (const m of meta[r]!.markers) {
      const at = boundary[Math.min(m.before, boundary.length - 1)] ?? cursor;
      stitchMarkers.push({
        roundIndex: m.roundIndex,
        position: { x: at * KNIT_CELL_WIDTH, y: yCenter },
        color: m.op.color,
        label: m.op.comment,
      });
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
    stitchMarkers,
  };
}
