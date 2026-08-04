import { describe, expect, it } from 'vitest';
import { parseRound } from '../src/lib/crafts/crochet/parser';
import { expand } from '../src/lib/expand/expander';
import { layoutCircular } from '../src/lib/crafts/crochet/circular';
import { renderSvg } from '../src/lib/crafts/crochet/svg';
import { parseKnitRound } from '../src/lib/crafts/knit/parser';
import { expandKnit } from '../src/lib/crafts/knit/expander';
import { layoutKnitGrid } from '../src/lib/crafts/knit/grid';
import { renderKnitSvg } from '../src/lib/crafts/knit/svg';
import { normalizeViewOptions, DEFAULT_VIEW_OPTIONS } from '../src/lib/model/view-options';

const NAVY = '#0d47a1';

function crochetSvg(opts: { colorMode?: 'auto' | 'symbol' | 'fill'; emptyColor?: string } = {}) {
  const rounds = ['6x', '3x:navy, 3x:cream'].map((s, i) => expand(parseRound(i + 1, s).body!, i + 1));
  return renderSvg({ layout: layoutCircular(rounds), ...opts });
}

function knitSvg(opts: { colorMode?: 'auto' | 'symbol' | 'fill'; emptyColor?: string } = {}) {
  const rounds = ['co6', 'k3:navy, k3:cream'].map((s, i) =>
    expandKnit(parseKnitRound(i + 1, s).body!, i + 1));
  return renderKnitSvg({ layout: layoutKnitGrid(rounds, { shape: 'flat' }), ...opts });
}

/** 색 원반(코바늘) 개수 */
const discCount = (svg: string) => (svg.match(/<circle[^>]*class=|<g class="colorwork">/g) ?? []).length;

describe('실 색을 어디에 칠할지', () => {
  it('코바늘 기본은 기호 선 색 — 원반을 깔지 않는다', () => {
    for (const colorMode of ['auto', 'symbol'] as const) {
      const svg = crochetSvg({ colorMode });
      expect(svg, colorMode).not.toContain('class="colorwork"');
      expect(svg, colorMode).toContain(`color: ${NAVY}`);
    }
  });

  it('코바늘 배경색 모드는 기호 뒤에 실 색 원반을 깔고 기호를 대비색으로', () => {
    const svg = crochetSvg({ colorMode: 'fill' });
    expect(svg).toContain('class="colorwork"');
    expect(discCount(svg)).toBeGreaterThan(0);
    // navy 는 어두우므로 흰 기호, cream 은 밝으므로 어두운 기호
    expect(svg).toContain('color: #ffffff');
    expect(svg).not.toContain(`color: ${NAVY}`);
  });

  it('대바늘 기본은 칸 채우기 — 기호는 대비색', () => {
    for (const colorMode of ['auto', 'fill'] as const) {
      const svg = knitSvg({ colorMode });
      expect(svg, colorMode).toContain('class="colorwork"');
      expect(svg, colorMode).not.toContain(`color: ${NAVY}`);
    }
  });

  it('대바늘 기호색 모드는 칸을 채우지 않고 기호를 실 색으로', () => {
    const svg = knitSvg({ colorMode: 'symbol' });
    expect(svg).not.toContain('class="colorwork"');
    expect(svg).toContain(`color: ${NAVY}`);
  });
});

describe('빈칸·바탕색', () => {
  it('두 크래프트 모두 지정한 색이 바탕에 깔린다', () => {
    expect(crochetSvg({ emptyColor: '#223344' })).toContain('fill="#223344"');
    expect(knitSvg({ emptyColor: '#223344' })).toContain('fill="#223344"');
  });

  it('대바늘은 코 없는 칸도 같은 색으로 칠한다', () => {
    // 단마다 코 수가 달라 좌우 여백(코 없는 칸)이 생기는 도안
    const rounds = ['co8', 'k4'].map((s, i) => expandKnit(parseKnitRound(i + 1, s).body!, i + 1));
    const svg = renderKnitSvg({
      layout: layoutKnitGrid(rounds, { shape: 'flat' }),
      emptyColor: '#223344',
    });
    // 바탕 1개 + 여백 칸들
    expect((svg.match(/fill="#223344"/g) ?? []).length).toBeGreaterThan(1);
  });

  it('코바늘은 바탕색을 안 주면 칠하지 않는다 (기존 동작)', () => {
    expect(crochetSvg()).not.toContain('<rect');
  });
});

describe('표시 옵션 검증', () => {
  it('모르는 colorMode 는 auto 로', () => {
    expect(normalizeViewOptions({ colorMode: 'rainbow' })!.colorMode).toBe('auto');
    expect(normalizeViewOptions({ colorMode: 'fill' })!.colorMode).toBe('fill');
  });

  it('바탕색은 색 문법을 그대로 받아들이고, 이상하면 기본값', () => {
    expect(normalizeViewOptions({ emptyColor: 'aaf' })!.emptyColor).toBe('#aaf');
    expect(normalizeViewOptions({ emptyColor: 'navy' })!.emptyColor).toBe(NAVY);
    expect(normalizeViewOptions({ emptyColor: 'nope' })!.emptyColor)
      .toBe(DEFAULT_VIEW_OPTIONS.emptyColor);
    expect(normalizeViewOptions({})!.emptyColor).toBe(DEFAULT_VIEW_OPTIONS.emptyColor);
  });
});
