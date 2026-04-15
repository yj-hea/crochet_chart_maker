/**
 * Layout 공용 타입.
 *
 * Layout 단계는 Op 리스트를 받아 각 스티치의 2D 좌표를 계산한다.
 * SVG 렌더러는 이 결과를 입력으로 받아 실제 SVG를 조립한다.
 */

import type { Op } from '$lib/expand/op';

export interface Point {
  x: number;
  y: number;
}

export interface PositionedStitch {
  op: Op;
  /** 1-based 단 번호 */
  roundIndex: number;
  position: Point;
  /** 원형: 각도(라디안). 평면: undefined. 기호 회전 용도 */
  angle?: number;
  /** 이 스티치가 소비한 부모 스티치들의 인덱스 (같은 배열 내). 중복 허용(같은 V를 여러 자식이 참조) */
  parentIndices: number[];
  /**
   * 다음 단에서 부모 슬롯으로 노출되는 수.
   * - 일반 코(SC, HDC, DC, TR, CHAIN): 1
   * - V(INC^N): N (한 V가 N개의 자식 슬롯을 만들어 다음 단에서 N번 참조됨)
   * - A(DEC), MAGIC, SLIP: 0~1 (다음 단 부모로 잘 사용 안 됨)
   */
  exposedSlots: number;
}

export interface LayoutBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

/**
 * 가이드 그리드 정보. 렌더러가 배경 그리드를 그리는 데 사용.
 *  - concentric: 원형 도안용. 동심원 + 방사선
 *  - rect: 평면 도안용. 사각 격자
 *    cell 하나에 stitch 하나가 (수직 중앙) 들어가도록 정렬.
 *    수평은 row 1의 코수 패리티에 맞춰 정렬되며 다른 row는 셀 경계에 올 수 있음.
 */
export type GridGuide =
  | { type: 'concentric'; ringRadii: number[]; sectorCount: number }
  | {
      type: 'rect';
      cellWidth: number;
      cellHeight: number;
      /** 수평 셀 경계의 x 오프셋 (라인 = xOffset + k*cellWidth). row 1 코수 패리티로 결정 */
      xOffset: number;
      /** 수직 셀 경계의 y 오프셋 (라인 = yOffset + k*cellHeight) */
      yOffset: number;
    };

/**
 * 단별 시작코 마커.
 *  - position: 삼각형 중심 위치
 *  - direction: 삼각형이 가리키는 방향 ('right' = ▶, 'left' = ◀).
 *    삼각형의 tip이 시작코 쪽을 향하고, 숫자는 반대쪽에 표기됨.
 */
export interface RoundMarker {
  roundIndex: number;
  position: Point;
  direction: 'right' | 'left';
}

export interface LayoutResult {
  stitches: PositionedStitch[];
  bounds: LayoutBounds;
  gridGuide?: GridGuide;
  roundMarkers: RoundMarker[];
}
