/**
 * 미리보기 표시 배율 계산.
 *
 * 기본은 contain-fit (도안 전체가 패널 안에 들어옴).
 * 다만 격자 도안(대바늘)은 가로로 길어서 좁은 화면에서 칸이 몇 px 로 줄어들고,
 * 그러면 격자선·기호가 sub-pixel 이 되어 사실상 보이지 않는다.
 * 칸이 `minCellPx` 보다 작아지면 축소를 멈추고 스크롤한다.
 */

export interface FitInput {
  /** 도안 크기 (SVG 사용자 단위) */
  chartWidth: number;
  chartHeight: number;
  /** 표시 영역 크기 (px, padding 제외) */
  availWidth: number;
  availHeight: number;
  /** 격자 칸 가로 (사용자 단위). 없으면 항상 contain-fit */
  cellWidth?: number;
  /** 칸의 최소 표시 크기 (px) */
  minCellPx?: number;
}

export interface FitResult {
  scale: number;
  width: number;
  height: number;
  /** true 면 패널보다 커서 스크롤이 필요 */
  scroll: boolean;
}

export function computeDisplayFit(input: FitInput): FitResult | null {
  const { chartWidth, chartHeight, availWidth, availHeight, cellWidth } = input;
  if (chartWidth <= 0 || chartHeight <= 0 || availWidth <= 0 || availHeight <= 0) return null;

  const fitScale = Math.min(availWidth / chartWidth, availHeight / chartHeight);
  const minCellPx = input.minCellPx ?? 12;
  const minScale = cellWidth && cellWidth > 0 ? minCellPx / cellWidth : 0;
  const scale = Math.max(fitScale, minScale);

  return {
    scale,
    width: chartWidth * scale,
    height: chartHeight * scale,
    scroll: scale > fitScale + 1e-6,
  };
}
