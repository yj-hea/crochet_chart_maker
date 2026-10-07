import { describe, expect, it } from 'vitest';
import { parseKnitRound } from '../src/lib/crafts/knit/parser';
import { expandKnit } from '../src/lib/crafts/knit/expander';
import { fillUnworked } from '../src/lib/crafts/knit/unworked';
import { planShortRows } from '../src/lib/crafts/knit/shortrow';
import { validateRound } from '../src/lib/validate';
import type { ExpandedRound } from '../src/lib/expand/op';

function rounds(...sources: string[]): ExpandedRound[] {
  return sources.map((src, i) => {
    const parsed = parseKnitRound(i + 1, src);
    expect(parsed.errors, src).toEqual([]);
    return expandKnit(parsed.body!, i + 1);
  });
}

function fill(...sources: string[]): ExpandedRound[] {
  return fillUnworked(rounds(...sources)) as ExpandedRound[];
}

/** 각 단의 코를 `k,k,unw` 처럼 읽기 쉬운 문자열로 */
function shape(r: ExpandedRound): string {
  return r.ops.map((o) => (o.autoFilled ? `(${o.kind})` : o.kind)).join(',');
}
function counts(r: ExpandedRound): [number, number] {
  return [r.totalConsume, r.totalProduce];
}

describe('되돌아뜨기 미작업 코 자동 채우기', () => {
  it('끝까지 가지 않고 돌린 단은 뒤에 미작업 코가 붙는다', () => {
    const [, row2] = fill('k19', 'k11, wt');
    expect(counts(row2!)).toEqual([19, 19]);
    expect(row2!.ops.filter((o) => o.autoFilled)).toHaveLength(7);
    expect(row2!.ops.slice(12).every((o) => o.kind === 'UNWORKED')).toBe(true);
  });

  it('돌아온 단은 앞에도 미작업 코가 붙는다 (양 끝 모두)', () => {
    const [, , row3] = fill('k19', 'k11, wt', 'p4, wt');
    // unw7, p4, wt, unw7
    expect(counts(row3!)).toEqual([19, 19]);
    expect(shape(row3!)).toBe(
      `${'(UNWORKED),'.repeat(7)}PURL,PURL,PURL,PURL,WRAP_TURN,${'(UNWORKED),'.repeat(6)}(UNWORKED)`,
    );
  });

  it('남은 코를 되살리는 마무리 단은 앞쪽만 채운다', () => {
    const rows = fill('k19', 'k11, wt', 'p4, wt', 'k12', 'p19');
    const [row4, row5] = [rows[3]!, rows[4]!];
    expect(shape(row4!).startsWith('(UNWORKED)')).toBe(true);
    expect(row4.ops.filter((o) => o.autoFilled)).toHaveLength(7);
    expect(counts(row4)).toEqual([19, 19]);
    // 전체를 다 뜨는 단은 채울 것이 없다
    expect(row5.ops.some((o) => o.autoFilled)).toBe(false);
    expect(counts(row5)).toEqual([19, 19]);
  });

  it('채운 뒤에는 코 수 검증을 통과한다', () => {
    const rows = fill('k19', 'k11, wt', 'p4, wt', 'k12', 'p19');
    for (let i = 1; i < rows.length; i++) {
      expect(validateRound(rows[i]!, rows[i - 1]!), `${i + 1}번째 줄`).toEqual([]);
    }
  });

  it('손으로 적은 생성기 결과와 같은 모습이 된다', () => {
    const plan = planShortRows({ total: 19, step: 7, repeats: 1, side: 'both', turn: 'wt' });
    expect(plan.kind).toBe('ok');
    const written = plan.rows.map((r) => r.source);
    // unw 를 지운 손글씨가 생성기 결과와 같아지는지
    const withoutUnw = written.map((src) => src
      .split(', ')
      .filter((part) => !part.startsWith('unw'))
      .join(', '));
    const auto = fill('k19', ...withoutUnw).slice(1);
    const explicit = rounds('k19', ...written).slice(1);
    expect(auto.map((r) => r.ops.map((o) => o.kind)))
      .toEqual(explicit.map((r) => r.ops.map((o) => o.kind)));
  });

  it('독일식(ds)도 같은 방식으로 채운다', () => {
    const rows = fill('k19', 'k12, wt', 'ds, p4, wt');
    expect(counts(rows[1]!)).toEqual([19, 19]);
    expect(counts(rows[2]!)).toEqual([19, 19]);
  });

  it('unw 를 직접 적은 단은 손대지 않는다', () => {
    const rows = fill('k19', 'k11, wt, unw7', 'unw7, p4, wt, unw7');
    expect(rows.every((r) => r.ops.every((o) => !o.autoFilled))).toBe(true);
    expect(counts(rows[2]!)).toEqual([19, 19]);
  });

  it('되돌아뜨기 기호가 없으면 채우지 않는다 — 오타는 코 수 오류로 남는다', () => {
    const rows = fill('k19', 'k11');
    expect(rows[1]!.ops.some((o) => o.autoFilled)).toBe(false);
    expect(validateRound(rows[1]!, rows[0]!)[0]?.kind).toBe('under_consumed');
  });

  it('이미 남아 있던 코 안에서 끝나면 기호 없이도 채운다 (그냥 돌리기)', () => {
    // 2단이 7코를 남겼으니, 3단이 12코에서 끝나는 것은 돌린 자리와 같다
    const rows = fill('k19', 'k11, wt', 'p12');
    expect(rows[2]!.ops.filter((o) => o.autoFilled)).toHaveLength(7);
    expect(counts(rows[2]!)).toEqual([19, 19]);
  });

  it('여러 번 돌려도 바늘 양 끝의 코가 쌓인다', () => {
    const rows = fill('k30', 'k25, wt', 'p20, wt', 'k15, wt', 'p10, wt');
    expect(rows.map((r) => r.totalProduce)).toEqual([30, 30, 30, 30, 30]);
    // 4단: 앞 5코(3단이 남긴 것) + 뜬 16코(k15 + wt) + 뒤 9코
    expect(rows[3]!.ops.filter((o) => o.autoFilled)).toHaveLength(14);
    expect(rows[3]!.ops.slice(0, 5).every((o) => o.kind === 'UNWORKED')).toBe(true);
  });

  it('여러 번 돌려도 결과가 같다 (다시 계산해도 안전)', () => {
    const once = fill('k19', 'k11, wt', 'p4, wt', 'k12');
    const twice = fillUnworked(once) as ExpandedRound[];
    expect(twice.map(shape)).toEqual(once.map(shape));
    expect(twice.map(counts)).toEqual(once.map(counts));
  });

  it('첫 단과 파싱 안 된 단은 건드리지 않는다', () => {
    const [first] = fill('k11, wt');
    expect(first!.ops.some((o) => o.autoFilled)).toBe(false);

    const mixed = fillUnworked([rounds('k19')[0], undefined, rounds('k11, wt')[0]]);
    expect(mixed[1]).toBeUndefined();
    // 앞 단을 알 수 없으니 채우지 않는다
    expect(mixed[2]!.ops.some((o) => o.autoFilled)).toBe(false);
  });
});
