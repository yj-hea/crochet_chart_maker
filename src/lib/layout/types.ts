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
  /** 캔버스에서 이 코를 가리키는 키 (`layout/adjust`). 레이아웃 뒤에 채워진다 */
  key?: string;
  /** 손으로 다듬은 배치의 transform. 없으면 자동 배치 그대로 */
  transform?: string;
  /**
   * 합쳐 그릴 때 **끌어온 다른 조각의 코** (`layout/compose`).
   * 그림에만 쓰는 코라서, 이 레이아웃의 "첫 단·마지막 단" 을 찾을 때 세지 않는다 —
   * 안 그러면 조각의 단 번호가 몸통의 것과 섞여 잇는 자리가 엉킨다.
   */
  foreign?: true;
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
  cell?: { row: number; col: number; span: number } & ForeignCell;
}

/**
 * 합쳐 그릴 때 **끌어온 조각의 칸** 정보 (`layout/compose`).
 *
 * 격자 크래프트(대바늘)는 칸이 도안의 일부라서, 조각을 합쳐도 칸을 계속 그려야 한다.
 * 그런데 칸 크기는 조각의 게이지에서 나오고(`cellSize`) 조립도에서 조각을 돌릴 수도
 * 있으므로, 합칠 때 그 조각의 칸 크기와 회전을 코·빈칸마다 들려 보낸다.
 * 없으면 레이아웃 자신의 `cellSize` 를 쓴다.
 */
export interface ForeignCell {
  size?: { width: number; height: number };
  /** 조각을 돌려 놓은 각도(도) — 칸도 같이 돈다 */
  rot?: number;
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
  /** 캔버스 선택용 키 (`layout/adjust`) */
  key?: string;
  /** 손으로 다듬은 배치의 transform */
  transform?: string;
  /**
   * 번호 자리에 적을 글자. 되돌아뜨기로 한 단이 여러 줄이면 `12-2` 처럼 된다.
   * 없으면 `roundIndex` 를 그대로 적는다.
   */
  label?: string;
  position: Point;
  direction: 'right' | 'left';
}

/**
 * 편물 마커 (`pm`) — 코가 아니라 **코와 코 사이의 경계**를 가리킨다.
 *
 * 코를 소비/생성하지 않으므로 `stitches` 에 넣지 않고, 레이아웃이 이웃한 두 코의
 * 위치에서 경계 좌표를 따로 계산한다. 마커는 단마다 다시 적으므로 위 단으로
 * 자동 전파되지 않는다 — 각 단의 마커는 그 단에서만 표시된다.
 */
export interface PositionedMarker {
  roundIndex: number;
  /** 캔버스 선택용 키 (`layout/adjust`) */
  key?: string;
  /** 손으로 다듬은 배치의 transform */
  transform?: string;
  /** 경계의 중심 좌표 */
  position: Point;
  /**
   * 마커 눈금이 뻗는 방향(라디안). 원형은 반지름 방향, 격자·평면은 undefined(세로).
   */
  angle?: number;
  /** 사용자 지정 색 (`pm:#e91e63`) */
  color?: string;
  /** 사용자 지정 라벨 (`pm "옆선"`) */
  label?: string;
  /** 합쳐 그릴 때 끌어온 조각의 칸 (`layout/compose`) */
  foreign?: ForeignCell;
}

/**
 * 도안 위에 얹는 덧그림 — 조각을 합쳐 그릴 때의 연결선·이름표처럼
 * 코가 아닌 것들. 두 크래프트 렌더러가 똑같이 그린다.
 */
export type Decoration =
  | { kind: 'line'; from: Point; to: Point; dashed?: boolean; faint?: boolean }
  | { kind: 'label'; at: Point; text: string; align?: 'start' | 'middle' | 'end'; muted?: boolean };

export interface LayoutResult {
  stitches: PositionedStitch[];
  /** 코가 아닌 덧그림 (연결선·이름표) */
  decorations?: Decoration[];
  /**
   * 격자 안내선을 그리지 않는다 — 조각을 합쳐 그릴 때처럼 기준이 여럿이면
   * 격자가 어느 조각에도 맞지 않는다.
   */
  noGrid?: boolean;
  /**
   * 걸어뜨기를 **어느 코에 걸었는지** 잇는 선 (`layout/post-links.ts`).
   * 바로 아래 코에 건 보통 걸어뜨기는 선을 긋지 않는다.
   */
  postLinks?: Array<{ from: Point; to: Point }>;
  /** 범례를 손으로 옮겼을 때의 transform */
  legendTransform?: string;
  /**
   * 합쳐 그릴 때 끌어온 조각들이 **어디에 놓였는지** (`layout/compose`).
   * 조립도가 조각을 통째로 집어 옮기는 데 쓴다.
   */
  pieceBoxes?: Array<{ id?: string; name: string; bounds: LayoutBounds }>;
  /**
   * 조각을 **손으로 옮기기 전**의 경계 (`layout/compose`).
   *
   * 자동 배치는 이 값으로 잡는다 — 실제 경계로 잡으면 조각 하나를 끌 때마다 위쪽 배치가
   * 따라 움직여 끈 만큼 가지 않고 다른 조각까지 흔들린다.
   */
  baseBounds?: LayoutBounds;
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
  } & ForeignCell>;
  /** 편물 마커 (`pm`) — 코 사이 경계 위치 */
  stitchMarkers?: PositionedMarker[];
}
