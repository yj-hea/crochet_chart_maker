import { describe, expect, it } from 'vitest';
import { computeDisplayFit } from '../src/lib/render/fit';

// 60코 20단 대바늘 차트 ≈ 1236 × 280 (칸 20 × 14)
const KNIT_CHART = { chartWidth: 1236, chartHeight: 280, cellWidth: 20 };

describe('미리보기 표시 배율', () => {
  it('넓은 화면에서는 contain-fit (스크롤 없음)', () => {
    const fit = computeDisplayFit({ ...KNIT_CHART, availWidth: 1400, availHeight: 600 })!;
    expect(fit.scroll).toBe(false);
    expect(fit.width).toBeLessThanOrEqual(1400);
    expect(fit.height).toBeLessThanOrEqual(600);
  });

  it('좁은 화면에서는 최소 칸 크기를 지켜 스크롤한다', () => {
    // 모바일: 340×260 패널 → contain-fit 이면 칸이 4.9px 로 줄어 보이지 않는다
    const fit = computeDisplayFit({ ...KNIT_CHART, availWidth: 300, availHeight: 220, minCellPx: 12 })!;
    expect(fit.scroll).toBe(true);
    expect(fit.scale * KNIT_CHART.cellWidth).toBeGreaterThanOrEqual(12);
    expect(fit.width).toBeGreaterThan(300);
  });

  it('칸 크기를 모르면(코바늘) 항상 contain-fit', () => {
    const fit = computeDisplayFit({
      chartWidth: 1236, chartHeight: 280, availWidth: 300, availHeight: 220,
    })!;
    expect(fit.scroll).toBe(false);
    expect(fit.width).toBeLessThanOrEqual(300);
  });

  it('세로가 긴 차트는 높이에 맞춘다', () => {
    const fit = computeDisplayFit({
      chartWidth: 200, chartHeight: 2000, availWidth: 800, availHeight: 400, cellWidth: 20, minCellPx: 1,
    })!;
    expect(fit.height).toBeCloseTo(400, 5);
    expect(fit.scroll).toBe(false);
  });

  it('빈 크기는 null', () => {
    expect(computeDisplayFit({ chartWidth: 0, chartHeight: 0, availWidth: 100, availHeight: 100 })).toBeNull();
    expect(computeDisplayFit({ chartWidth: 100, chartHeight: 100, availWidth: 0, availHeight: 100 })).toBeNull();
  });
});
