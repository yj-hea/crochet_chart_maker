/**
 * 색상 팔레트.
 *
 * 단색 통일 — Read 모드에서 현재/과거/미래 단의 구분은 opacity로만 표현.
 * 단별 색 차이를 두지 않는다.
 */

/** 모든 코의 기본 색상 */
export const STITCH_COLOR = '#222';

/** 그리드 격자 색상 */
export const GRID_COLOR = '#b0b0b0';

/** 그리드 중앙 축선 색상 (격자보다 진함) */
export const GRID_AXIS_COLOR = '#808080';

/** 부모-자식 연결선 색상 (기호보다는 연하되 식별 가능한 회색, 점선) */
export const CONNECTION_COLOR = '#909090';
export const CONNECTION_DASHARRAY = '2 2';
export const CONNECTION_WIDTH = 0.8;
