import { describe, expect, it } from 'vitest';
import { planShortRows, type ShortRowOptions } from '../src/lib/crafts/knit/shortrow';
import { parseKnitRound } from '../src/lib/crafts/knit/parser';
import { expandKnit } from '../src/lib/crafts/knit/expander';

/** 생성된 단들을 실제 파서로 돌려 모든 단의 코 수가 total 로 유지되는지 확인 */
function assertStable(opts: ShortRowOptions) {
  const r = planShortRows(opts);
  expect(r.kind, r.summary).toBe('ok');
  for (const row of r.rows) {
    const parsed = parseKnitRound(1, row.source);
    expect(parsed.errors, `파싱 실패: ${row.source}`).toEqual([]);
    const ex = expandKnit(parsed.body!, 1);
    expect(ex.totalConsume, `소비: ${row.source}`).toBe(opts.total);
    expect(ex.totalProduce, `생성: ${row.source}`).toBe(opts.total);
  }
  return r;
}

describe('되돌아뜨기 자동 배치', () => {
  it('기존 문서 예시와 같은 표기를 만든다 (한쪽·wt)', () => {
    const r = planShortRows({ total: 20, step: 7, repeats: 1, side: 'one', resolve: false });
    expect(r.rows.map((x) => x.source)).toEqual(['k12, wt, unw7', 'unw7, p13']);
  });

  it('남긴 코는 가는 단에서 뒤, 오는 단에서 앞에 온다', () => {
    const r = planShortRows({ total: 20, step: 4, repeats: 1, side: 'one', resolve: false });
    expect(r.rows[0]!.source).toMatch(/unw4$/);   // 아직 못 간 코 → 뒤
    expect(r.rows[1]!.source).toMatch(/^unw4/);   // 이미 지나온 코 → 앞
  });

  it('양쪽 모드는 매 단 돌리고 남긴 코가 쌓인다', () => {
    const r = planShortRows({ total: 24, step: 3, repeats: 2, side: 'both', resolve: false });
    expect(r.rows.map((x) => x.source)).toEqual([
      'k20, wt, unw3',
      'unw3, p17, wt, unw3',
      'unw3, k14, wt, unw6',
      'unw6, p11, wt, unw6',
    ]);
  });

  it('마무리 단이 되돌린 코를 모두 되살린다', () => {
    const r = planShortRows({ total: 24, step: 3, repeats: 2, side: 'both' });
    expect(r.rows.slice(-2).map((x) => x.source)).toEqual(['unw6, k18', 'p24']);
  });

  it('한쪽 모드 마무리는 한 단이면 충분하다', () => {
    const r = planShortRows({ total: 20, step: 5, repeats: 2, side: 'one' });
    expect(r.rows).toHaveLength(5);
    expect(r.rows.at(-1)!.source).toBe('k20');
  });

  it('독일식은 돌린 다음 단 첫 코가 ds', () => {
    const r = planShortRows({ total: 20, step: 4, repeats: 1, side: 'one', turn: 'ds' });
    expect(r.rows.map((x) => x.source)).toEqual(['k16, unw4', 'unw4, ds, p15', 'k20']);
  });

  it('그냥 돌리기는 기호 없이 unw 만', () => {
    const r = planShortRows({ total: 12, step: 3, repeats: 1, side: 'one', turn: 'plain', resolve: false });
    expect(r.rows.map((x) => x.source)).toEqual(['k9, unw3', 'unw3, p9']);
  });

  it('교대를 끄면 모든 단이 같은 코 (가터·원통)', () => {
    const r = planShortRows({ total: 12, step: 3, repeats: 1, side: 'one', alternate: false, resolve: false });
    expect(r.rows.every((x) => !x.source.includes('p'))).toBe(true);
  });

  it('안뜨기로 시작할 수도 있다', () => {
    const r = planShortRows({ total: 12, step: 3, repeats: 1, side: 'one', base: 'p', resolve: false });
    expect(r.rows[0]!.source).toContain('p');
    expect(r.rows[1]!.source).toContain('k');
  });

  it('모든 조합에서 단마다 코 수가 보존된다', () => {
    for (const side of ['one', 'both'] as const) {
      for (const turn of ['wt', 'ds', 'plain'] as const) {
        for (const resolve of [true, false]) {
          assertStable({ total: 40, step: 3, repeats: 4, side, turn, resolve });
          assertStable({ total: 17, step: 1, repeats: 2, side, turn, resolve });
        }
      }
    }
  });

  it('코가 모자라면 invalid', () => {
    expect(planShortRows({ total: 10, step: 4, repeats: 3, side: 'both' }).kind).toBe('invalid');
    expect(planShortRows({ total: 1, step: 1, repeats: 1 }).kind).toBe('invalid');
    expect(planShortRows({ total: 20, step: 0, repeats: 2 }).kind).toBe('invalid');
    expect(planShortRows({ total: 20, step: 2, repeats: 0 }).kind).toBe('invalid');
  });

  it('독일식인데 마무리를 빼면 경고를 남긴다', () => {
    expect(planShortRows({ total: 20, step: 4, repeats: 1, turn: 'ds', resolve: false }).warning)
      .toContain('ds');
    expect(planShortRows({ total: 20, step: 4, repeats: 1, turn: 'ds' }).warning).toBeUndefined();
  });
});
