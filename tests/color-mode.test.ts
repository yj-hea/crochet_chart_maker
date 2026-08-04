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
const EMPTY = '#e8e5e0';
const MAIN = '#ffffff';

interface Opts {
  colorMode?: 'auto' | 'symbol' | 'fill';
  emptyColor?: string;
  mainColor?: string;
  symbolColor?: string;
}

/** 1단 6코, 2단 = 네이비 3코 + 색 없는 3코 */
function crochetSvg(opts: Opts = {}) {
  const rounds = ['6x', '3x:navy, 3x'].map((s, i) => expand(parseRound(i + 1, s).body!, i + 1));
  return renderSvg({ layout: layoutCircular(rounds), emptyColor: EMPTY, mainColor: MAIN, ...opts });
}

/** 8코 코잡기 위에 네이비 3코 + 색 없는 3코 → 좌우에 빈칸 2개 */
function knitSvg(opts: Opts = {}) {
  const rounds = ['co8', 'k3:navy, k3'].map((s, i) =>
    expandKnit(parseKnitRound(i + 1, s).body!, i + 1));
  return renderKnitSvg({
    layout: layoutKnitGrid(rounds, { shape: 'flat' }),
    emptyColor: EMPTY, mainColor: MAIN, ...opts,
  });
}

const count = (svg: string, re: RegExp) => (svg.match(re) ?? []).length;

/** 코 바탕(colorwork) 그룹만 잘라낸다 — `<defs>` 의 기호 정의와 섞이지 않도록 */
function colorworkGroup(svg: string): string {
  const start = svg.indexOf('<g class="colorwork">');
  if (start < 0) return '';
  return svg.slice(start, svg.indexOf('</g>', start));
}

describe('코가 있는 자리 vs 없는 자리', () => {
  it('대바늘 — 색 없는 코는 메인 색, 빈칸만 빈칸 색', () => {
    const svg = knitSvg();
    // 코가 있는 칸은 16 중 14개(1단 8 + 2단 6). 그중 3개는 네이비를 지정했으므로
    // 메인 색(흰색)은 11개, 좌우 여백 2칸만 빈칸 색이다.
    expect(count(svg, /fill="#ffffff"/g)).toBe(11);
    expect(count(svg, new RegExp(`fill="${EMPTY}"`, 'g'))).toBe(2);
  });

  it('코바늘 — 코 자리엔 메인 색 바탕, 바탕만 빈칸 색', () => {
    const svg = crochetSvg();
    expect(count(svg, /<ellipse[^>]*fill="#ffffff"/g)).toBeGreaterThan(0);
    // 바탕은 rect 한 장
    expect(count(svg, new RegExp(`<rect[^>]*fill="${EMPTY}"`, 'g'))).toBe(1);
  });

  it('빈칸 색을 바꿔도 코가 있는 자리는 그대로 메인 색', () => {
    const svg = knitSvg({ emptyColor: '#223344' });
    expect(count(svg, /fill="#ffffff"/g)).toBe(11);
    expect(count(svg, /fill="#223344"/g)).toBe(2);
  });

  it('메인 색을 바꾸면 색 없는 코만 따라 바뀐다', () => {
    const svg = knitSvg({ mainColor: '#ffe0b2' });
    expect(count(svg, /fill="#ffe0b2"/g)).toBe(11);
    expect(svg).toContain(`fill="${NAVY}"`); // 지정한 실 색은 그대로
  });
});

describe('실 색을 어디에 칠할지', () => {
  it('코바늘 기본은 기호 선 색 — 코 바탕은 전부 메인 색', () => {
    for (const colorMode of ['auto', 'symbol'] as const) {
      const svg = crochetSvg({ colorMode });
      expect(svg, colorMode).toContain(`color: ${NAVY}`);
      expect(count(svg, new RegExp(`<ellipse[^>]*fill="${NAVY}"`, 'g')), colorMode).toBe(0);
    }
  });

  it('코바늘 배경색 모드는 코 바탕이 실 색, 기호는 대비색', () => {
    const svg = crochetSvg({ colorMode: 'fill' });
    expect(count(svg, new RegExp(`<ellipse[^>]*fill="${NAVY}"`, 'g'))).toBe(3);
    expect(svg).toContain('color: #ffffff');       // 어두운 네이비 위엔 흰 기호
    expect(svg).not.toContain(`color: ${NAVY}`);
  });

  it('대바늘 기본은 칸 채우기 — 기호는 대비색', () => {
    for (const colorMode of ['auto', 'fill'] as const) {
      const svg = knitSvg({ colorMode });
      expect(count(svg, new RegExp(`fill="${NAVY}"`, 'g')), colorMode).toBeGreaterThan(1);
      expect(svg, colorMode).not.toContain(`color: ${NAVY}`);
    }
  });

  it('대바늘 기호색 모드는 칸을 메인 색으로 두고 기호를 실 색으로', () => {
    const svg = knitSvg({ colorMode: 'symbol' });
    expect(svg).toContain(`color: ${NAVY}`);
    // 네이비 칸은 없고 (범례 견본만 남는다) 칸은 전부 흰색
    expect(count(svg, /fill="#ffffff"/g)).toBe(14);
  });
});

describe('표시 옵션 검증', () => {
  it('모르는 colorMode 는 auto 로', () => {
    expect(normalizeViewOptions({ colorMode: 'rainbow' })!.colorMode).toBe('auto');
    expect(normalizeViewOptions({ colorMode: 'fill' })!.colorMode).toBe('fill');
  });

  it('빈칸 색·메인 색은 색 문법을 그대로 받고, 이상하면 기본값', () => {
    expect(normalizeViewOptions({ emptyColor: 'aaf' })!.emptyColor).toBe('#aaf');
    expect(normalizeViewOptions({ mainColor: 'navy' })!.mainColor).toBe(NAVY);
    expect(normalizeViewOptions({ emptyColor: 'nope' })!.emptyColor)
      .toBe(DEFAULT_VIEW_OPTIONS.emptyColor);
    expect(normalizeViewOptions({})!.mainColor).toBe(DEFAULT_VIEW_OPTIONS.mainColor);
  });
});

describe('코바늘 코 바탕 크기', () => {
  /** 도안의 코 바탕 크기들 ("rx×ry" 문자열) */
  function discSizes(rows: string[]): string[] {
    const rounds = rows.map((s, i) => expand(parseRound(i + 1, s).body!, i + 1));
    const svg = renderSvg({ layout: layoutCircular(rounds), colorMode: 'fill' });
    return [...colorworkGroup(svg).matchAll(/rx="([\d.]+)" ry="([\d.]+)"/g)]
      .map((m) => `${m[1]}x${m[2]}`);
  }

  it('한 도안 안에서는 코 종류가 섞여도 모두 같은 크기다', () => {
    // 짧은뜨기(반높이 3.5) ~ 세길긴뜨기(17.5) 를 한 단에 늘어놓는다
    const sizes = discSizes(['6x', '1x, 1t, 1f, 1e, 1dtr, 1x']);
    expect(sizes.length).toBeGreaterThan(6);
    expect(new Set(sizes).size).toBe(1);
  });

  it('그 크기는 도안에서 가장 긴 기호를 따라간다', () => {
    const ryOf = (rows: string[]) => Number(discSizes(rows)[0]!.split('x')[1]);
    // 짧은뜨기 3.5 / 한길긴뜨기 10.5 / 세길긴뜨기 17.5 (+ 여유 2.5)
    expect(ryOf(['6x', '12x'])).toBe(6);
    expect(ryOf(['6x', '6x, 6f'])).toBe(13);
    expect(ryOf(['6x', '6x, 6dtr'])).toBe(20);
  });

  it('가로는 이웃 코 바탕을 덮지 않도록 묶는다', () => {
    const rxOf = (rows: string[]) => Number(discSizes(rows)[0]!.split('x')[0]);
    expect(rxOf(['6x', '6x, 6dtr'])).toBeLessThanOrEqual(12);
  });
});

describe('기본 기호 색', () => {
  it('실 색을 지정하지 않은 코는 기본 기호 색을 물려받는다', () => {
    const svg = crochetSvg({ symbolColor: '#3355ff' });
    expect(svg).toContain('color: #3355ff');
  });

  it('실 색을 지정한 코는 기본 기호 색을 덮어쓴다', () => {
    const svg = crochetSvg({ colorMode: 'symbol', symbolColor: '#3355ff' });
    expect(svg).toContain('color: #3355ff');   // 색 없는 코
    expect(svg).toContain(`color: ${NAVY}`);   // 색 지정한 코
  });

  it('대바늘도 같다', () => {
    const svg = knitSvg({ symbolColor: '#3355ff' });
    expect(svg).toContain('color: #3355ff');
  });
});
