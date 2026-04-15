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
 * 방향: 홀수 단 L→R (angle 0), 짝수 단 R→L (angle π).
 *
 * MAGIC은 단의 가운데 약간 아래에 배치 (참고용).
 */

import type { ExpandedRound } from '$lib/expand/op';
import type { PositionedStitch, Point, LayoutResult, RoundMarker } from './types';
import { FLAT_CELL_WIDTH, FLAT_CELL_HEIGHT } from './constants';
import { computeBounds, markerFarPoint } from './bounds';

const MARKER_SIDE_OFFSET = 16;  // 시작코 가장자리에서 마커 삼각형 중심까지의 거리

export function layoutFlat(rounds: ExpandedRound[]): LayoutResult {
  const stitches: PositionedStitch[] = [];
  const roundMarkers: RoundMarker[] = [];
  const slotMapByRound = new Map<number, number[]>();

  for (const round of rounds) {
    placeRow(round, stitches, slotMapByRound, roundMarkers);
  }

  const bounds = computeBounds([
    ...stitches.map((s) => s.position),
    ...roundMarkers.map((m) => m.position),
    ...roundMarkers.map(markerFarPoint),
  ]);

  // row 1의 코 수 패리티에 맞춰 수평 셀 경계 오프셋 결정.
  // odd N: stitches at multiples of cellWidth → 셀 경계 at +/- cellWidth/2 → xOffset = cellWidth/2
  // even N: stitches at multiples of cellWidth + cellWidth/2 → 셀 경계 at multiples of cellWidth → xOffset = 0
  const round1 = rounds[0];
  const round1Slots = round1
    ? round1.ops.reduce((sum, op) => sum + op.produce, 0)
    : 0;
  const xOffset = round1Slots % 2 === 0 ? 0 : FLAT_CELL_WIDTH / 2;
  // row 1 stitch가 y=0에 있으므로 셀 vertical center는 0, 셀 경계는 y = ±cellHeight/2
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
  const rowSlots = round.ops.reduce((sum, op) => sum + op.produce, 0);

  const y = -(roundIdx - 1) * FLAT_CELL_HEIGHT;
  const startX = -((rowSlots - 1) * FLAT_CELL_WIDTH) / 2;
  const direction: 1 | -1 = roundIdx % 2 === 1 ? 1 : -1;
  const angle = direction === 1 ? 0 : Math.PI;

  const parentSlotMap = slotMapByRound.get(roundIdx - 1) ?? [];
  const thisStitchIndices: number[] = [];
  let parentCursor = 0;
  let slotCursor = 0;

  for (const op of round.ops) {
    if (op.kind === 'MAGIC') {
      const idx = stitches.length;
      stitches.push({
        op,
        roundIndex: roundIdx,
        position: { x: 0, y: y + FLAT_CELL_HEIGHT / 2 },
        angle: 0,
        parentIndices: [],
        exposedSlots: 0,
      });
      thisStitchIndices.push(idx);
      continue;
    }

    const parents: number[] = [];
    for (let k = 0; k < op.consume; k++) {
      const p = parentSlotMap[parentCursor + k];
      if (p !== undefined) parents.push(p);
    }
    parentCursor += op.consume;

    if (op.kind === 'SLIP' || op.produce === 0) {
      const refStitch = parents.length > 0 ? stitches[parents[0]!] : undefined;
      const pos = refStitch ? refStitch.position : { x: 0, y };
      const idx = stitches.length;
      stitches.push({
        op,
        roundIndex: roundIdx,
        position: pos,
        angle,
        parentIndices: parents,
        exposedSlots: 0,
      });
      thisStitchIndices.push(idx);
      continue;
    }

    const slotsOccupied = op.produce;
    const startSlotX = startX + slotCursor * FLAT_CELL_WIDTH;
    const endSlotX = startX + (slotCursor + slotsOccupied - 1) * FLAT_CELL_WIDTH;
    const midX = (startSlotX + endSlotX) / 2;
    const pos: Point = { x: midX, y };

    const idx = stitches.length;
    stitches.push({
      op,
      roundIndex: roundIdx,
      position: pos,
      angle,
      parentIndices: parents,
      exposedSlots: slotsOccupied,
    });
    thisStitchIndices.push(idx);
    slotCursor += slotsOccupied;
  }

  const slotMap: number[] = [];
  for (const sIdx of thisStitchIndices) {
    const s = stitches[sIdx]!;
    for (let k = 0; k < s.exposedSlots; k++) {
      slotMap.push(sIdx);
    }
  }
  slotMapByRound.set(roundIdx, slotMap);

  // 시작 마커:
  //   L→R(direction=+1): array[0] 시작 → 마커는 왼쪽, 삼각형이 오른쪽(▶)
  //   R→L(direction=-1): array[last] 시작 → 마커는 오른쪽, 삼각형이 왼쪽(◀)
  const visibleIndices = thisStitchIndices.filter(
    (i) => stitches[i]!.op.kind !== 'MAGIC' && stitches[i]!.op.kind !== 'SLIP'
  );
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
