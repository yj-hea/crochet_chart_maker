import { describe, expect, it } from 'vitest';
import { parseRound } from '../src/lib/crafts/crochet/parser';
import { expand as expandOps } from '../src/lib/expand/expander';
import { renderSvg } from '../src/lib/crafts/crochet/svg';
import { layoutFlat } from '../src/lib/crafts/crochet/flat';
import { validateRound } from '../src/lib/validate';
import { renderNarrative } from '../src/lib/narrative';
import type { ExpandedRound } from '../src/lib/expand/op';

function expand(index: number, src: string): ExpandedRound {
  const parsed = parseRound(index, src);
  expect(parsed.errors, src).toEqual([]);
  return expandOps(parsed.body!, index);
}

describe('걸어뜨기 (앞걸어·뒤걸어)', () => {
  it('fp/bp 는 코를 바꾸지 않는다 — 아래 코 하나를 그대로 쓴다', () => {
    const r = expand(2, 'fpF, bpF, fpF, bpF');
    expect(r.totalConsume).toBe(4);
    expect(r.totalProduce).toBe(4);
    expect(r.ops.map((o) => o.kind)).toEqual(['DC', 'DC', 'DC', 'DC']);
    expect(r.ops.map((o) => o.modifier)).toEqual(['FP', 'BP', 'FP', 'BP']);
  });

  it('코 수 검증을 그대로 통과한다 (골지무늬)', () => {
    const prev = expand(1, '12F');
    const rib = expand(2, '(fpF, bpF)*6');
    expect(rib.totalConsume).toBe(12);
    expect(validateRound(rib, prev)).toEqual([]);
  });

  it('반복수와 함께 쓸 수 있다 — 변형자 뒤에 숫자를 적는다', () => {
    expect(expand(2, 'fp3F').totalProduce).toBe(3);
    expect(expand(2, 'bp2T').ops.map((o) => [o.kind, o.modifier]))
      .toEqual([['HDC', 'BP'], ['HDC', 'BP']]);
  });

  it('짧은뜨기·긴뜨기·두길긴뜨기에도 붙는다', () => {
    for (const [src, kind] of [['fpX', 'SC'], ['bpT', 'HDC'], ['fpE', 'TR'], ['bpdtr', 'DTR']] as const) {
      const op = expand(2, src).ops[0]!;
      expect([op.kind, op.modifier], src).toEqual([kind, src.startsWith('fp') ? 'FP' : 'BP']);
    }
  });

  it('도안에 갈고리가 그려지고 앞뒤가 서로 거울상이다', () => {
    const rounds = [expand(1, '4F'), expand(2, 'fpF, bpF, fpF, bpF')];
    const layout = layoutFlat(rounds, {});
    const svg = renderSvg({ layout, showGrid: false, showConnections: false });
    // 앞걸어는 오른쪽(+4), 뒤걸어는 왼쪽(-4) 으로 굽는다
    expect(svg).toContain('q 0,3.50 4,3.50');
    expect(svg).toContain('q 0,3.50 -4,3.50');
    expect(svg.match(/q 0,3\.50 4,3\.50/g)).toHaveLength(2);
    expect(svg.match(/q 0,3\.50 -4,3\.50/g)).toHaveLength(2);
  });

  it('서술 도안에 그대로 나온다', () => {
    const parsed = parseRound(2, 'fpF, bpF');
    const { html } = renderNarrative(parsed, parsed.source, 'crochet');
    expect(html.replace(/<[^>]+>/g, '')).toContain('fp');
    expect(html.replace(/<[^>]+>/g, '')).toContain('bp');
  });

  it('지금까지 fp 는 오류였다 — 기존 도안을 바꾸지 않는다', () => {
    // f + p (쉼표 없이 붙여 쓴 두 코) 는 예전에도 오류였으므로 의미가 바뀐 도안이 없다
    const old = parseRound(1, 'F P');
    expect(old.errors.length).toBeGreaterThan(0);
  });
});
