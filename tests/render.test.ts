import { describe, expect, it } from 'vitest';
import { parseRound } from '../src/lib/crafts/crochet/parser';
import { expand } from '../src/lib/expand/expander';
import { layoutCircular } from '../src/lib/crafts/crochet/circular';
import { layoutFlat } from '../src/lib/crafts/crochet/flat';
import { renderSvg, fanHalfWidth } from '../src/lib/crafts/crochet/svg';

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

  it('INC는 fan 형태(leg 다리 N개)로 렌더링', () => {
    const svg = render(['@, 6X', '6V']);
    // round 1: 6 SC 기호
    const scUses = svg.match(/href="#sym-SC"/g) ?? [];
    expect(scUses.length).toBe(6);
    // round 2: V^2 × 6 = leg-SC 12개
    const legUses = svg.match(/href="#leg-SC"/g) ?? [];
    expect(legUses.length).toBe(12);
  });

  it('평면 도안도 정상 렌더링', () => {
    const svg = render(['6O', '6X'], 'flat');
    expect(svg).toContain('data-round="1"');
    expect(svg).toContain('data-round="2"');
    expect(svg.match(/<use /g)?.length).toBe(12);
  });

  it('평면 도안의 짝수 단 기호는 회전되지 않는다', () => {
    // 짝수 단에 angle=π를 적용하면 rotate(180 ...)이 생성되어 기호가 뒤집혀 보인다.
    // 기호는 항상 위쪽이 위를 향해야 한다 (차트 관행).
    const svg = render(['6O', '6X', '6X'], 'flat');
    expect(svg).not.toMatch(/transform="rotate\(180/);
    expect(svg).not.toMatch(/transform="rotate\(-180/);
  });

  it('sym-INC는 Y자 꼬리가 없는 V 형태', () => {
    const svg = render(['@, 6X', '6V']);
    // sym-INC 정의를 추출해 수직선(x1=x2=0)이 없는지 확인
    const defMatch = svg.match(/<g id="sym-INC">([\s\S]*?)<\/g>/);
    expect(defMatch).not.toBeNull();
    const incDef = defMatch![1]!;
    expect(incDef).not.toMatch(/x1="0"[^/]*x2="0"/);
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

describe('V/A 부채 기호', () => {
  function fanAngles(src: string): number[] {
    const layout = layoutCircular(
      ['@, 12X', src].map((s, i) => {
        const r = parseRound(i + 1, s);
        if (!r.body) throw new Error(`parse: ${s}`);
        return expand(r.body, i + 1);
      }),
    );
    const svg = renderSvg({ layout });
    const rots = [...svg.matchAll(/rotate\((-?[\d.]+) 0 (-?[\d.]+)\)/g)].map((m) => Number(m[1]));
    return [...new Set(rots)].sort((a, b) => a - b);
  }

  it('키가 커도 팁 폭이 일정하다 — 각도는 그만큼 좁아진다', () => {
    // leg 는 바닥 끝을 중심으로 도므로 같은 각도면 키 큰 코일수록 팁이 멀리 벌어진다.
    // 각도가 아니라 팁 폭을 고정해야 V 모양이 일정하다.
    const spread = (a: number[]) => a[a.length - 1]! - a[0]!;
    const vx = spread(fanAngles('6vx'));
    const vt = spread(fanAngles('6vt'));
    const vf = spread(fanAngles('6vf'));
    const ve = spread(fanAngles('6ve'));
    expect(vx).toBeCloseTo(60, 1);        // 짧은뜨기는 기존 60° 그대로
    expect(vt).toBeLessThan(vx);
    expect(vf).toBeLessThan(vt);
    expect(ve).toBeLessThan(vf);
    // 팁 폭은 모두 코 한 칸(10px)
    for (const [src, base] of [['6vx', 'SC'], ['6vt', 'HDC'], ['6vf', 'DC'], ['6ve', 'TR']] as const) {
      const half = spread(fanAngles(src)) / 2;
      const legHalf = { SC: 5, HDC: 7, DC: 9, TR: 11 }[base];
      expect(2 * legHalf * Math.sin((half * Math.PI) / 180)).toBeCloseTo(5, 1);
    }
  });

  it('V^N 은 코 수만큼 넓어진다', () => {
    const spread = (a: number[]) => a[a.length - 1]! - a[0]!;
    // ve^3 은 팁이 2칸(20px) 벌어져야 한다 — 11px leg 기준 ±27°
    const half = spread(fanAngles('3ve^3')) / 2;
    expect(2 * 11 * Math.sin((half * Math.PI) / 180)).toBeCloseTo(10, 1);
  });

  it('fanHalfWidth 가 겹침 계산과 렌더를 같은 값으로 잇는다', () => {
    // 팁(5) + 긴뜨기 계열 상단 cap(4)
    expect(fanHalfWidth(2, 'SC')).toBeCloseTo(5, 1);
    expect(fanHalfWidth(2, 'DC')).toBeCloseTo(9, 1);
    expect(fanHalfWidth(2, 'TR')).toBeCloseTo(9, 1);
    expect(fanHalfWidth(3, 'TR')).toBeCloseTo(14, 1);
  });
});
