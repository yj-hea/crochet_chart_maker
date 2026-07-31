import { describe, expect, it } from 'vitest';
import { evenIncDecKnit, type KnitIncMethod, type KnitDecMethod } from '../src/lib/eveninc';
import { parseKnitRound } from '../src/lib/crafts/knit/parser';
import { expandKnit } from '../src/lib/crafts/knit/expander';

/** 생성된 패턴을 실제 대바늘 파서로 돌려 소비/생성 코 수를 검증 */
function counts(pattern: string): { consume: number; produce: number } {
  const parsed = parseKnitRound(1, pattern);
  expect(parsed.errors, `파싱 실패: ${pattern}`).toEqual([]);
  const ex = expandKnit(parsed.body!, 1);
  return { consume: ex.totalConsume, produce: ex.totalProduce };
}

describe('대바늘 균등 증감', () => {
  it('m1 계열은 부모를 소비하지 않아 일반 코가 모두 남는다', () => {
    const r = evenIncDecKnit(10, 15, { inc: 'm1l' });
    expect(r.kind).toBe('increase');
    // 겉뜨기 10개 + m1l 5개
    expect(counts(r.pattern)).toEqual({ consume: 10, produce: 15 });
  });

  it('kfb 는 부모 1코를 소비한다 (코바늘 V 와 같은 구조)', () => {
    const r = evenIncDecKnit(10, 15, { inc: 'kfb' });
    expect(counts(r.pattern)).toEqual({ consume: 10, produce: 15 });
  });

  it('yo 로도 같은 코 수가 나온다', () => {
    const r = evenIncDecKnit(24, 30, { inc: 'yo' });
    expect(counts(r.pattern)).toEqual({ consume: 24, produce: 30 });
  });

  it('줄임은 2코를 1코로 모아 목표 코 수가 된다', () => {
    for (const dec of ['k2tog', 'ssk'] as KnitDecMethod[]) {
      const r = evenIncDecKnit(30, 24, { dec });
      expect(r.kind).toBe('decrease');
      expect(counts(r.pattern)).toEqual({ consume: 30, produce: 24 });
    }
  });

  it('안뜨기 기반 + m1p 도 코 수가 맞는다', () => {
    const r = evenIncDecKnit(20, 25, { base: 'p', inc: 'm1p' });
    expect(r.pattern).toContain('p');
    expect(r.pattern).toContain('m1p');
    expect(counts(r.pattern)).toEqual({ consume: 20, produce: 25 });
  });

  it('여러 조합에서 항상 코 수가 맞는다', () => {
    const cases: Array<[number, number, KnitIncMethod]> = [
      [8, 12, 'm1l'], [8, 12, 'kfb'], [33, 44, 'm1r'], [60, 61, 'yo'],
      [7, 9, 'm1l'], [100, 133, 'kfb'],
    ];
    for (const [from, to, inc] of cases) {
      const r = evenIncDecKnit(from, to, { inc });
      expect(r.kind, `${from}→${to} ${inc}`).toBe('increase');
      expect(counts(r.pattern), `${from}→${to} ${inc}: ${r.pattern}`)
        .toEqual({ consume: from, produce: to });
    }
  });

  it('감소 조합도 코 수가 맞는다', () => {
    for (const [from, to] of [[12, 8], [44, 33], [61, 60], [9, 5], [30, 15]] as Array<[number, number]>) {
      const r = evenIncDecKnit(from, to);
      expect(counts(r.pattern), `${from}→${to}: ${r.pattern}`)
        .toEqual({ consume: from, produce: to });
    }
  });

  it('같은 코 수면 일반 코만', () => {
    const r = evenIncDecKnit(20, 20, { base: 'p' });
    expect(r.kind).toBe('same');
    expect(r.pattern).toBe('p20');
    expect(counts(r.pattern)).toEqual({ consume: 20, produce: 20 });
  });

  it('불가능한 증감은 invalid', () => {
    // kfb 는 부모를 소비하므로 2배 초과 증가는 불가
    expect(evenIncDecKnit(10, 25, { inc: 'kfb' }).kind).toBe('invalid');
    // 절반 이하로 줄이는 것은 불가
    expect(evenIncDecKnit(10, 4, {}).kind).toBe('invalid');
    expect(evenIncDecKnit(0, 10, {}).kind).toBe('invalid');
  });
});

// 공통 코어(buildGroups)를 대바늘과 나눠 쓰므로, 코바늘 출력이 변하지 않는지 함께 고정한다
describe('코바늘 균등 증감 (회귀 방지)', () => {
  it('기존 표기를 그대로 유지', async () => {
    const { evenIncDec } = await import('../src/lib/eveninc');
    expect(evenIncDec(6, 12).pattern).toBe('(1v)*6');
    expect(evenIncDec(12, 18).pattern).toBe('(1x, 1v)*6');
    expect(evenIncDec(18, 24).pattern).toBe('(2x, 1v)*6');
    expect(evenIncDec(30, 24).pattern).toBe('(3x, 1a)*6');
    expect(evenIncDec(44, 33).pattern).toBe('(2x, 1a)*11');
    expect(evenIncDec(12, 18, 't').pattern).toBe('(1t, 1vt)*6');
  });
});
