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
  /**
   * 원형 chain samehole anchor 가 부모로부터 소비한 angular territory 의 양 끝 좌표.
   * 사슬 호 재배치 시 이 두 점을 bezier 의 좌/우 끝으로 사용 → 호가 부모 슬롯 폭만큼만
   * 펼쳐지고 인접 stitch territory 로 침범하지 않음.
   */
  chainArcBounds?: { left: Point; right: Point };
  /**
   * 격자 레이아웃(대바늘) 전용 — 이 코가 놓인 칸.
   *  - row: 위에서부터 0-based 행
   *  - col: 왼쪽부터 0-based 열 (cascade 로 폭이 달라지면 누적 단위 위치)
   *  - span: 차지하는 칸 수 (kfb 처럼 여러 코를 만드는 경우 > 1)
   */
  cell?: { row: number; col: number; span: number };
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
      /**
       * 가변 너비 셀 전용 — 세로 grid 라인의 x 좌표 배열 (left→right).
       * 존재하면 uniform cellWidth 대신 이 값으로 세로선 렌더.
       */
      verticalLines?: number[];
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
  /**
   * 격자 레이아웃(대바늘) 전용 — 셀 크기. 렌더러가 칸 테두리를 그리는 데 사용.
   */
  cellSize?: { width: number; height: number };
  /**
   * 격자 레이아웃(대바늘) 전용 — 코 없음(no stitch) 채움 칸.
   * 중심 좌표 + 폭(단위 칸 수). 실제 코가 아니므로 `stitches` 에 넣지 않는다
   * (진행 하이라이트 인덱스 보존).
   */
  fillerCells?: Array<{
    x: number;
    y: number;
    span: number;
    /**
     * 칸의 성격 (렌더는 동일하게 회색 채움 — 진단·테스트용 구분).
     * `hole` — 코막음 구멍·열 맞춤으로 생긴 자리
     * `pad`  — 행이 차트 폭보다 좁아 남는 좌우 여백
     */
    kind?: 'hole' | 'pad';
  }>;
}
