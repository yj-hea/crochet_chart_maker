import { describe, expect, it } from 'vitest';
import { parseKnitRound } from '../src/lib/crafts/knit/parser';
import { expandKnit } from '../src/lib/crafts/knit/expander';
import { layoutKnitGrid } from '../src/lib/crafts/knit/grid';
import { flipOp } from '../src/lib/crafts/knit/flip';
import { validateRound } from '../src/lib/validate';
import { renderNarrative } from '../src/lib/narrative';

function parseExpand(index: number, src: string) {
  const parsed = parseKnitRound(index, src);
  expect(parsed.errors).toEqual([]);
  return expandKnit(parsed.body!, index);
}

function parseError(src: string) {
  const parsed = parseKnitRound(1, src);
  expect(parsed.body).toBeUndefined();
  return parsed.errors[0]!;
}

describe('대바늘 [...] — 한 코에 여러 번 뜨기', () => {
  it('[2k] 는 kfb 와 같은 1 → 2', () => {
    const r = parseExpand(2, '[2k]');
    expect(r.totalConsume).toBe(1);
    expect(r.totalProduce).toBe(2);
    expect(r.ops.map((o) => o.kind)).toEqual(['KNIT', 'KNIT']);
    // 첫 코만 부모를 소비하고, 나머지는 같은 코에서 이어 나온 코
    expect(r.ops.map((o) => o.consume)).toEqual([1, 0]);
    expect(r.ops.map((o) => o.sameHoleContinuation)).toEqual([false, true]);
  });

  it('[k, yo, k] 는 1 → 3, [k, p, k, p, k] 는 1 → 5', () => {
    expect(parseExpand(2, '[k, yo, k]').totalProduce).toBe(3);
    const bobble = parseExpand(2, '[k, p, k, p, k]');
    expect(bobble.totalConsume).toBe(1);
    expect(bobble.totalProduce).toBe(5);
  });

  it('yo 가 앞에 와도 코에 바늘을 넣는 첫 코가 부모를 소비한다', () => {
    const r = parseExpand(2, '[yo, k]');
    expect(r.ops.map((o) => [o.kind, o.consume])).toEqual([['YO', 0], ['KNIT', 1]]);
  });

  it('앞 숫자는 그룹을 다음 코마다 반복한다', () => {
    const r = parseExpand(2, '3[k, p]');
    expect(r.totalConsume).toBe(3);
    expect(r.totalProduce).toBe(6);
  });

  it('안에 반복 (...)*N 을 쓸 수 있다', () => {
    const r = parseExpand(2, '[(k, p)*2, k]');
    expect(r.totalConsume).toBe(1);
    expect(r.totalProduce).toBe(5);
  });

  it('주변 코와 섞어 코 수 검증을 통과한다', () => {
    const prev = parseExpand(1, 'k10');
    const next = parseExpand(2, 'k4, [k, yo, k], k5');
    expect(next.totalConsume).toBe(10);
    expect(next.totalProduce).toBe(12);
    expect(validateRound(next, prev)).toEqual([]);
  });

  describe('허용되지 않는 입력', () => {
    it('닫는 ] 가 없으면 오류', () => {
      expect(parseError('[k, p').kind).toBe('unclosed_bracket');
    });
    it('[ 없이 ] 만 있으면 오류', () => {
      expect(parseError('k2]').kind).toBe('unopened_bracket');
    });
    it('빈 그룹은 오류', () => {
      expect(parseError('[]').kind).toBe('empty_samehole');
    });
    it('중첩 그룹은 오류', () => {
      expect(parseError('[k, [p, k]]').kind).toBe('invalid_samehole');
    });
    it('늘림·줄임 기호는 넣을 수 없다', () => {
      for (const src of ['[kfb, k]', '[k, m1l]', '[k2tog, k]', '[k, lli]']) {
        expect(parseError(src).kind, src).toBe('invalid_samehole');
      }
    });
    it('yo 만으로는 한 코에 뜬 것이 아니다', () => {
      expect(parseError('[yo, yo]').kind).toBe('invalid_samehole');
    });
  });

  describe('격자', () => {
    it('코마다 한 칸 — 이어 나온 코 아래에는 빈칸이 생긴다', () => {
      const rounds = [parseExpand(1, 'k6'), parseExpand(2, 'k2, [k, yo, k], k3')];
      const layout = layoutKnitGrid(rounds, { shape: 'round' });
      const row2 = layout.stitches.filter((s) => s.roundIndex === 2);
      expect(row2).toHaveLength(8);
      expect(row2.every((s) => s.cell!.span === 1)).toBe(true);
      // 이어 나온 두 코만큼 아래 단에 빈칸
      const holes = (layout.fillerCells ?? []).filter((f) => f.kind === 'hole');
      expect(holes.reduce((n, f) => n + f.span, 0)).toBe(2);
    });

    it('안면 단에서는 그룹 안의 코도 겉면 모습으로 반전된다', () => {
      const r = parseExpand(2, '[p, k]');
      expect(r.ops.map((o) => flipOp(o).kind)).toEqual(['KNIT', 'PURL']);
    });
  });

  it('서술 도안에 그룹 그대로 표시된다', () => {
    const parsed = parseKnitRound(2, 'k4, 2[k, yo, k], k2');
    const { html } = renderNarrative(parsed, parsed.source, 'knit');
    const text = html.replace(/<[^>]+>/g, '');
    expect(text).toBe('k4, 2[k, yo, k], k2');
  });
});
