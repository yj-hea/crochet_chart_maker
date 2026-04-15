import { describe, expect, it } from 'vitest';
import { parseRound } from '../src/lib/parser/parser';
import { expand } from '../src/lib/expand/expander';
import { layoutCircular } from '../src/lib/layout/circular';
import { layoutFlat } from '../src/lib/layout/flat';
import { renderSvg } from '../src/lib/render/svg';

function render(sources: string[], shape: 'circular' | 'flat' = 'circular') {
  const rounds = sources.map((src, i) => {
    const r = parseRound(i + 1, src);
    if (!r.body) throw new Error(`parse failed: ${JSON.stringify(r.errors)}`);
    return expand(r.body, i + 1);
  });
  const layout = shape === 'circular' ? layoutCircular(rounds) : layoutFlat(rounds);
  return renderSvg({ layout });
}

describe('renderSvg', () => {
  it('유효한 SVG 루트 요소 생성', () => {
    const svg = render(['@, 6X']);
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(svg).toContain('</svg>');
    expect(svg).toContain('viewBox');
  });

  it('기호 정의 포함', () => {
    const svg = render(['@, 6X']);
    expect(svg).toContain('<defs>');
    expect(svg).toContain('id="sym-SC"');
    expect(svg).toContain('id="sym-MAGIC"');
  });

  it('단별 그룹 생성 with data-round', () => {
    const svg = render(['@, 6X', '6V', '(1X,1V)*6']);
    expect(svg).toContain('data-round="1"');
    expect(svg).toContain('data-round="2"');
    expect(svg).toContain('data-round="3"');
  });

  it('모든 단은 동일한 단색 사용 (per-round color 없음)', () => {
    const svg = render(['@, 6X', '6V']);
    // 단별 그룹은 모두 같은 STITCH_COLOR
    expect(svg).not.toMatch(/style="color: hsl/);
    const colorMatches = svg.match(/style="color: ([^"]+)"/g) ?? [];
    const uniqueColors = new Set(colorMatches);
    expect(uniqueColors.size).toBe(1);
  });

  it('showGrid 옵션 시 grid 그룹 출력', () => {
    const r = parseRound(1, '@, 6X');
    const exp = expand(r.body!, 1);
    const svg = renderSvg({ layout: layoutCircular([exp]), showGrid: true });
    expect(svg).toContain('class="grid"');
    expect(svg).not.toContain('class="grid"></g>'); // 비어있지 않아야
  });

  it('showGrid 기본값은 false', () => {
    const svg = render(['@, 6X']);
    expect(svg).not.toContain('class="grid"');
  });

  it('연결선 포함', () => {
    const svg = render(['@, 6X', '6V']);
    expect(svg).toContain('class="connections"');
    // 단 2의 각 스티치는 단 1에 부모를 가지므로 line이 있어야 함
    expect(svg.match(/<line /g)?.length).toBeGreaterThan(0);
  });

  it('각 스티치는 <use>로 참조', () => {
    const svg = render(['@, 6X']);
    const uses = svg.match(/<use /g) ?? [];
    // MAGIC(1) + SC(6) = 7
    expect(uses.length).toBe(7);
  });

  it('INC는 sym-INC로, DEC는 sym-DEC로 렌더링', () => {
    const svg = render(['@, 6X', '6V']);
    // round 1: MAGIC + 6 SC = 7 use, round 2: 6 INC = 6 use
    const incUses = svg.match(/href="#sym-INC"/g) ?? [];
    expect(incUses.length).toBe(6);
    const scUses = svg.match(/href="#sym-SC"/g) ?? [];
    expect(scUses.length).toBe(6);
  });

  it('평면 도안도 정상 렌더링', () => {
    const svg = render(['6O', '6X'], 'flat');
    expect(svg).toContain('data-round="1"');
    expect(svg).toContain('data-round="2"');
    expect(svg.match(/<use /g)?.length).toBe(12);
  });

  it('회전 변환 적용', () => {
    const svg = render(['@, 6X']);
    // 각 use는 rotate() transform을 가짐
    expect(svg).toMatch(/transform="rotate\(/);
  });

  it('빈 입력도 유효한 SVG 반환', () => {
    const svg = render(['']);
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });
});
