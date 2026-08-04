import { describe, expect, it } from 'vitest';
import { parseRound } from '../src/lib/crafts/crochet/parser';
import { expand } from '../src/lib/expand/expander';
import { layoutCircular } from '../src/lib/crafts/crochet/circular';
import { layoutFlat } from '../src/lib/crafts/crochet/flat';
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

  it('최소 크기는 한 칸(24px) — 짧은뜨기만 있어도 칸을 꽉 채운다', () => {
    const [rx, ry] = discSizes(['6x', '12x'])[0]!.split('x').map(Number);
    // 짧은뜨기 반높이는 3.5 뿐이지만 칸 절반(12)이 바닥이 된다
    expect(rx).toBe(12);
    expect(ry).toBe(12);
  });

  it('그보다 긴 기호가 있으면 세로만 그만큼 늘어난다', () => {
    const sizeOf = (rows: string[]) => discSizes(rows)[0]!.split('x').map(Number);
    // 한길긴뜨기 10.5 / 세길긴뜨기 17.5 (+ 여유 2.5)
    expect(sizeOf(['6x', '6x, 6f'])).toEqual([12, 13]);
    expect(sizeOf(['6x', '6x, 6dtr'])).toEqual([12, 20]);
  });

  it('가로는 언제나 한 칸 — 이웃 코 바탕을 덮지 않는다', () => {
    for (const rows of [['6x', '12x'], ['6x', '6x, 6f'], ['6x', '6x, 6dtr']]) {
      expect(Number(discSizes(rows)[0]!.split('x')[0]), rows.join('/')).toBe(12);
    }
  });
});

describe('기본 기호 색', () => {
  it('실 색을 지정하지 않은 코는 기본 기호 색을 물려받는다', () => {
    const svg = crochetSvg({ symbolColor: '#3355ff' });
    expect(svg).toContain('color: #3355ff');
  });

  /**
   * 진행 하이라이트는 `g.round` 의 style.color 를 직접 지웠다 쓴다.
   * 기본 기호색을 거기 두면 Edit 모드에서 매번 지워져 미리보기에 반영되지 않는다.
   * 반드시 **루트**에 있어야 상속으로 살아남는다.
   */
  it('단(g.round) 이 아니라 SVG 루트에 얹힌다', () => {
    for (const svg of [crochetSvg({ symbolColor: '#3355ff' }), knitSvg({ symbolColor: '#3355ff' })]) {
      const root = svg.slice(0, svg.indexOf('>') + 1);
      expect(root).toContain('color: #3355ff');
      for (const g of svg.match(/<g class="round"[^>]*>/g) ?? []) {
        expect(g).not.toContain('color:');
      }
    }
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

describe('코바늘 평면 — 격자 칸 채우기', () => {
  /** 평면은 격자가 있으므로 타원이 아니라 칸(rect)을 채운다 */
  function flatCells(rows: string[]) {
    const rounds = rows.map((s, i) => expand(parseRound(i + 1, s).body!, i + 1));
    const layout = layoutFlat(rounds);
    const svg = renderSvg({ layout, colorMode: 'fill', mainColor: MAIN });
    const group = colorworkGroup(svg);
    const cells = [...group.matchAll(
      /x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)" fill="([^"]+)"/g,
    )].map((m) => ({
      x: Number(m[1]), y: Number(m[2]), w: Number(m[3]), h: Number(m[4]), fill: m[5]!,
    }));
    return { cells, ellipses: (group.match(/<ellipse/g) ?? []).length, layout };
  }

  it('타원 대신 칸을 채운다', () => {
    const { cells, ellipses } = flatCells(['6x', '3x:navy, 3x']);
    expect(ellipses).toBe(0);
    expect(cells).toHaveLength(12);
  });

  it('칸이 격자 크기 그대로라 서로 딱 붙는다', () => {
    const { cells, layout } = flatCells(['6x', '6x']);
    const guide = layout.gridGuide as { type: 'rect'; cellWidth: number; cellHeight: number };
    expect(cells.every((c) => c.w === guide.cellWidth && c.h === guide.cellHeight)).toBe(true);

    // 같은 행에서 한 칸의 오른쪽 끝 = 다음 칸의 왼쪽 끝 (틈도 겹침도 없다)
    const row = cells.filter((c) => c.y === cells[0]!.y).sort((a, b) => a.x - b.x);
    expect(row.length).toBeGreaterThan(1);
    for (let i = 1; i < row.length; i++) {
      expect(row[i]!.x).toBeCloseTo(row[i - 1]!.x + row[i - 1]!.w, 6);
    }
  });

  it('칸 중심이 코 위치와 일치한다', () => {
    const { cells, layout } = flatCells(['4x']);
    const xs = layout.stitches
      .filter((s) => s.roundIndex === 1)
      .map((s) => s.position.x)
      .sort((a, b) => a - b);
    const centers = cells.map((c) => c.x + c.w / 2).sort((a, b) => a - b);
    expect(centers).toEqual(xs);
  });

  it('V(늘림)도 기호가 놓인 한 칸만 칠한다', () => {
    // V 는 격자에서 2칸을 차지하지만 나머지 한 칸엔 코가 없다 —
    // 거기까지 칠하면 빈칸이 물든다
    for (const cascade of [true, false]) {
      const rounds = ['4x', '2x, 1v:red, 1x'].map((s, i) =>
        expand(parseRound(i + 1, s).body!, i + 1));
      const svg = renderSvg({ layout: layoutFlat(rounds, { cascade }), colorMode: 'fill' });
      const red = [...colorworkGroup(svg).matchAll(
        /x="([-\d.]+)" y="[-\d.]+" width="([\d.]+)"[^>]*fill="#e53935"/g,
      )];
      expect(red, `cascade=${cascade}`).toHaveLength(1);
      expect(Number(red[0]![2]), `cascade=${cascade}`).toBe(24); // 한 칸
    }
  });

  it('칠한 칸의 중심은 언제나 기호 위치다', () => {
    const rounds = ['4x', '2x, 1v, 1x'].map((s, i) =>
      expand(parseRound(i + 1, s).body!, i + 1));
    const layout = layoutFlat(rounds);
    const svg = renderSvg({ layout, colorMode: 'fill' });
    const centers = [...colorworkGroup(svg).matchAll(/x="([-\d.]+)" y="[-\d.]+" width="([\d.]+)"/g)]
      .map((m) => Number(m[1]) + Number(m[2]) / 2)
      .sort((a, b) => a - b);
    const xs = layout.stitches.map((s) => s.position.x).sort((a, b) => a - b);
    expect(centers).toEqual(xs);
  });

  it('원형은 그대로 타원을 쓴다', () => {
    const rounds = ['6x', '12x'].map((s, i) => expand(parseRound(i + 1, s).body!, i + 1));
    const group = colorworkGroup(renderSvg({ layout: layoutCircular(rounds), colorMode: 'fill' }));
    expect(group).toContain('<ellipse');
    expect(group).not.toContain('<rect');
  });
});

describe('칠하는 방식 전환 (칸 ↔ 기호 색 교환)', () => {
  async function setup(craft: 'crochet' | 'knit') {
    const { createTab, viewOptions } = await import('../src/stores/tabs');
    const mode = await import('../src/stores/mode');
    const { get } = await import('svelte/store');
    createTab(craft);
    return { mode, get, viewOptions };
  }

  it('전환하면 칸 색과 기호 색이 맞바뀐다', async () => {
    const { mode, get, viewOptions } = await setup('crochet');
    mode.mainColor.set('#ffffff');
    mode.symbolColor.set('#222222');
    expect(get(mode.fillMode)).toBe(false); // 코바늘 기본은 기호색

    mode.toggleColorMode();
    expect(get(mode.fillMode)).toBe(true);
    expect(get(viewOptions).mainColor).toBe('#222222');
    expect(get(viewOptions).symbolColor).toBe('#ffffff');
  });

  it('두 번 누르면 처음 상태로 정확히 돌아온다', async () => {
    const { mode, get, viewOptions } = await setup('crochet');
    mode.mainColor.set('#ffe0b2');
    mode.symbolColor.set('#3355ff');
    const before = { ...get(viewOptions) };

    mode.toggleColorMode();
    mode.toggleColorMode();
    const after = get(viewOptions);
    expect(after.colorMode).toBe(before.colorMode === 'auto' ? 'symbol' : before.colorMode);
    expect(after.mainColor).toBe(before.mainColor);
    expect(after.symbolColor).toBe(before.symbolColor);
  });

  it('대바늘은 반대 방향으로 시작한다 (기본이 칸 채우기)', async () => {
    const { mode, get } = await setup('knit');
    expect(get(mode.fillMode)).toBe(true);
    mode.toggleColorMode();
    expect(get(mode.fillMode)).toBe(false);
  });

  it('교환 뒤 기호가 칸 위에서 대비를 유지한다', async () => {
    // 흰 칸 + 검정 기호 → 검정 칸 + 흰 기호
    const before = crochetSvg({ colorMode: 'symbol', mainColor: '#ffffff', symbolColor: '#222222' });
    const after = crochetSvg({ colorMode: 'fill', mainColor: '#222222', symbolColor: '#ffffff' });
    expect(colorworkGroup(before)).toContain('#ffffff');
    expect(before.slice(0, before.indexOf('>'))).toContain('color: #222222');
    expect(colorworkGroup(after)).toContain('#222222');
    expect(after.slice(0, after.indexOf('>'))).toContain('color: #ffffff');
  });
});
