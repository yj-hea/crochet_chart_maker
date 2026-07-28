/**
 * 게이지 (뜨개 밀도) — 10cm 당 코수 / 단수.
 *
 * 대바늘 격자 도안에서 두 가지에 쓰인다:
 *   1. 셀 종횡비 — 실제 코는 정사각형이 아니다 (가로가 넓고 세로가 짧음)
 *   2. 실측 치수 — "22코 ≈ 10.0cm" 처럼 완성 크기 안내
 *
 * 코바늘은 격자 도안이 아니라 좌표가 코 수에 직접 대응하지 않으므로 사용하지 않는다.
 */

export interface Gauge {
  /** 10cm 당 코 수 */
  stitches: number;
  /** 10cm 당 단 수 */
  rows: number;
}

/** 게이지 미입력 시 셀 세로/가로 비율 */
export const DEFAULT_CELL_RATIO = 0.7;

/** 입력값으로 쓸 수 있는 범위 (오타로 도안이 깨지지 않도록 clamp) */
export const GAUGE_MIN = 1;
export const GAUGE_MAX = 200;

export function isValidGauge(g: Gauge | undefined): g is Gauge {
  if (!g) return false;
  return (
    Number.isFinite(g.stitches) && Number.isFinite(g.rows) &&
    g.stitches >= GAUGE_MIN && g.stitches <= GAUGE_MAX &&
    g.rows >= GAUGE_MIN && g.rows <= GAUGE_MAX
  );
}

/**
 * 셀 세로/가로 비율.
 * 코 하나의 실제 너비 = 10/stitches cm, 높이 = 10/rows cm 이므로
 * 비율 = 높이/너비 = stitches/rows.
 */
export function cellRatio(gauge: Gauge | undefined): number {
  if (!isValidGauge(gauge)) return DEFAULT_CELL_RATIO;
  return gauge.stitches / gauge.rows;
}

/** 코 수 → cm */
export function stitchesToCm(count: number, gauge: Gauge): number {
  return (count / gauge.stitches) * 10;
}

/** 단 수 → cm */
export function rowsToCm(count: number, gauge: Gauge): number {
  return (count / gauge.rows) * 10;
}

/** 저장/입력값 정규화. 범위를 벗어나거나 숫자가 아니면 undefined */
export function normalizeGauge(raw: unknown): Gauge | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const g = raw as Record<string, unknown>;
  const stitches = Number(g.stitches);
  const rows = Number(g.rows);
  const candidate = { stitches, rows };
  return isValidGauge(candidate) ? candidate : undefined;
}
