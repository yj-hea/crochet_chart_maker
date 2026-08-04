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

interface Opts { colorMode?: 'auto' | 'symbol' | 'fill'; emptyColor?: string; mainColor?: string }

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
  it('기호보다 약간 크고, 기호 높이를 따라간다', () => {
    // 짧은뜨기(반높이 3.5) ~ 세길긴뜨기(17.5) 까지 한 단에 늘어놓는다
    const rounds = ['6x', '1x, 1t, 1f, 1e, 1dtr, 1x'].map((s, i) =>
      expand(parseRound(i + 1, s).body!, i + 1));
    const svg = renderSvg({ layout: layoutCircular(rounds), colorMode: 'fill' });
    // `<defs>` 안의 기호 정의에도 ellipse 가 있으므로 코 바탕 그룹만 본다
    const sizes = [...colorworkGroup(svg).matchAll(/rx="([\d.]+)" ry="([\d.]+)"/g)]
      .map((m) => ({ rx: Number(m[1]), ry: Number(m[2]) }));

    // 기호 반높이 + 여유 — 짧은뜨기 6, 긴뜨기 9.5, 한길 13, 두길 16.5, 세길 20
    const rys = [...new Set(sizes.map((s) => s.ry))].sort((a, b) => a - b);
    expect(rys).toEqual([6, 9.5, 13, 16.5, 20]);
    // 가로는 이웃 코를 침범하지 않도록 묶어 둔다
    expect(Math.max(...sizes.map((s) => s.rx))).toBeLessThanOrEqual(7);
  });

  it('원형 도안에서는 기호와 같은 각도로 눕는다', () => {
    const rounds = ['6x', '6f'].map((s, i) => expand(parseRound(i + 1, s).body!, i + 1));
    const svg = renderSvg({ layout: layoutCircular(rounds), colorMode: 'fill' });
    const rotations = [...colorworkGroup(svg).matchAll(/transform="rotate\(([-\d.]+)/g)]
      .map((m) => Number(m[1]));
    // 6코가 60° 간격으로 돌아간다 — 서로 다른 각도가 여럿 나온다
    expect(new Set(rotations).size).toBeGreaterThan(1);
  });
});
