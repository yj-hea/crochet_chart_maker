/**
 * 원형 도안 레이아웃.
 *
 * 핵심 원칙:
 *   - 각 Op은 정확히 1개의 PositionedStitch를 생성한다.
 *   - 단의 "슬롯"은 단의 totalProduce(생성 코 수)와 같다. 슬롯들은 원주에 균등 각도로 분포.
 *   - 일반 코(SC, HDC, DC, TR, CHAIN)는 1 슬롯을 차지하고 다음 단에 부모 슬롯 1개를 노출.
 *   - V(INC^N)는 1개의 PositionedStitch이지만 N개의 슬롯을 차지하며,
 *     다음 단에 부모 슬롯 N개를 노출 → N개의 자식이 모두 V를 부모로 가짐.
 *     V의 위치는 점유한 슬롯들의 각도 중간값.
 *   - A(DEC^N)는 1 슬롯을 차지하고 1 슬롯을 노출하며, 부모로 N개를 소비 → 자식 1개에 부모 N개.
 *   - MAGIC: 중심 (0,0). 슬롯 영향 없음.
 *   - SLIP: 부모 위에 작게 표시, 다음 단에 슬롯 노출 안 함.
 */

import type { ExpandedRound } from '$lib/expand/op';
import type { PositionedStitch, Point, LayoutResult, RoundMarker } from './types';
import { FIRST_RING_RADIUS, RING_SPACING } from './constants';
import { computeBounds, markerFarPoint } from './bounds';

const MARKER_SIDE_OFFSET = 11;  // 시작코 옆에서 마커 삼각형 중심까지의 수평 거리

const START_ANGLE = -Math.PI / 2;  // 12시 방향
const DIRECTION = -1;               // -1: 반시계방향(CCW). 12시 → 11시 → 10시 → ...

export interface CircularOptions {
  spacing?: 'uniform' | 'proportional';
  stitchArc?: number;
  minRadius?: number;
}

export function layoutCircular(
  rounds: ExpandedRound[],
  opts: CircularOptions = {},
): LayoutResult {
  const spacing = opts.spacing ?? 'uniform';
  const stitchArc = opts.stitchArc ?? 22;
  const minRadius = opts.minRadius ?? FIRST_RING_RADIUS;

  // 각 단의 totalProduce (= 슬롯 수). MAGIC/SLIP은 produce=0이라 자동 제외됨.
  const slotCountByRound = new Map<number, number>();
  for (const round of rounds) {
    const n = round.ops.reduce((sum, op) => sum + op.produce, 0);
    slotCountByRound.set(round.index, n);
  }

  function radiusFor(roundIdx: number): number {
    if (spacing === 'uniform') {
      return FIRST_RING_RADIUS + (roundIdx - 1) * RING_SPACING;
    }
    const n = slotCountByRound.get(roundIdx) ?? 0;
    if (n <= 0) return minRadius;
    return Math.max(minRadius, (stitchArc * n) / (2 * Math.PI));
  }

  const stitches: PositionedStitch[] = [];
  const roundMarkers: RoundMarker[] = [];
  // 각 단의 부모 슬롯 매핑: prevRound stitches에서 exposedSlots만큼 stitch 인덱스를 push.
  // 다음 단의 부모 인덱스는 이 매핑의 cursor에서 op.consume 만큼 가져감.
  const slotMapByRound = new Map<number, number[]>();

  for (const round of rounds) {
    placeRound(round, stitches, slotMapByRound, radiusFor, slotCountByRound, roundMarkers);
  }

  const bounds = computeBounds([
    ...stitches.map((s) => s.position),
    ...roundMarkers.map((m) => m.position),
    ...roundMarkers.map(markerFarPoint),
  ]);

  // 가이드: 동심원 반지름 (실제 stitch가 있는 단들), 방사선 개수 (첫 비-empty 단의 슬롯 수)
  const ringRadii: number[] = [];
  for (const round of rounds) {
    const n = slotCountByRound.get(round.index) ?? 0;
    if (n > 0) ringRadii.push(radiusFor(round.index));
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

function placeRound(
  round: ExpandedRound,
  stitches: PositionedStitch[],
  slotMapByRound: Map<number, number[]>,
  radiusFor: (idx: number) => number,
  slotCountByRound: Map<number, number>,
  roundMarkers: RoundMarker[],
): void {
  const { index: roundIdx } = round;
  const ringSlots = slotCountByRound.get(roundIdx) ?? 0;
  const radius = radiusFor(roundIdx);

  const parentSlotMap = slotMapByRound.get(roundIdx - 1) ?? [];
  const thisStitchIndices: number[] = [];
  let parentCursor = 0;
  let slotCursor = 0;

  for (const op of round.ops) {
    // MAGIC: 중심에 배치
    if (op.kind === 'MAGIC') {
      const idx = stitches.length;
      stitches.push({
        op,
        roundIndex: roundIdx,
        position: { x: 0, y: 0 },
        angle: 0,
        parentIndices: [],
        exposedSlots: 0,
      });
      thisStitchIndices.push(idx);
      continue;
    }

    // 부모 슬롯 소비
    const parents: number[] = [];
    for (let k = 0; k < op.consume; k++) {
      const p = parentSlotMap[parentCursor + k];
      if (p !== undefined) parents.push(p);
    }
    parentCursor += op.consume;

    // SLIP: 부모 위 또는 가까이에 작은 마커. 슬롯 점유 없음.
    if (op.kind === 'SLIP' || op.produce === 0) {
      const refStitch = parents.length > 0 ? stitches[parents[0]!] : undefined;
      const pos = refStitch ? refStitch.position : { x: 0, y: 0 };
      const idx = stitches.length;
      stitches.push({
        op,
        roundIndex: roundIdx,
        position: pos,
        angle: refStitch?.angle ?? 0,
        parentIndices: parents,
        exposedSlots: 0,
      });
      thisStitchIndices.push(idx);
      continue;
    }

    // 일반 코 + V/A:
    //   slotsOccupied = op.produce.
    //   V^N: N슬롯 차지, 1개의 PositionedStitch (위치=슬롯 중간 각도)
    //   기타: 1슬롯 차지, 1 PositionedStitch
    const slotsOccupied = op.produce;
    const startSlot = slotCursor;
    const endSlot = slotCursor + slotsOccupied - 1;
    const startAngle = angleAt(startSlot, ringSlots);
    const endAngle = angleAt(endSlot, ringSlots);
    const midAngle = (startAngle + endAngle) / 2;
    const pos = polarToCartesian(radius, midAngle);
    const symbolAngle = midAngle + Math.PI / 2;

    const idx = stitches.length;
    stitches.push({
      op,
      roundIndex: roundIdx,
      position: pos,
      angle: symbolAngle,
      parentIndices: parents,
      exposedSlots: slotsOccupied,
    });
    thisStitchIndices.push(idx);
    slotCursor += slotsOccupied;
  }

  // 다음 단을 위한 슬롯 매핑 빌드
  const slotMap: number[] = [];
  for (const sIdx of thisStitchIndices) {
    const s = stitches[sIdx]!;
    for (let k = 0; k < s.exposedSlots; k++) {
      slotMap.push(sIdx);
    }
  }
  slotMapByRound.set(roundIdx, slotMap);

  // 단 시작 마커: 첫 visible(MAGIC 제외) stitch 옆에 배치.
  // 원형은 반시계방향(CCW) 진행 — 시작코(12시)에서 좌측으로 진행.
  // 삼각형이 왼쪽(◀)을 가리켜 진행 방향을 표시, 마커는 시작코의 오른쪽에 위치.
  const firstVisible = thisStitchIndices.find(
    (i) => stitches[i]!.op.kind !== 'MAGIC' && stitches[i]!.op.produce > 0
  );
  if (firstVisible !== undefined) {
    const s = stitches[firstVisible]!;
    roundMarkers.push({
      roundIndex: roundIdx,
      position: { x: s.position.x + MARKER_SIDE_OFFSET, y: s.position.y },
      direction: 'left',
    });
  }
}

function angleAt(i: number, total: number): number {
  if (total <= 0) return START_ANGLE;
  return START_ANGLE + DIRECTION * ((2 * Math.PI * i) / total);
}

function polarToCartesian(r: number, angle: number): Point {
  return { x: r * Math.cos(angle), y: r * Math.sin(angle) };
}
