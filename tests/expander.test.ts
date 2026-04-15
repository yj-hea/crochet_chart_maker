import { describe, expect, it } from 'vitest';
import { parseRound } from '../src/lib/parser/parser';
import { expand } from '../src/lib/expand/expander';

function expandFrom(source: string) {
  const r = parseRound(1, source);
  if (!r.body) throw new Error(`parse failed: ${JSON.stringify(r.errors)}`);
  return expand(r.body, 1);
}

describe('expand', () => {
  it('매직링 + 6 short crochets', () => {
    const e = expandFrom('@, 6X');
    expect(e.ops.map((o) => o.kind)).toEqual([
      'MAGIC',
      'SC', 'SC', 'SC', 'SC', 'SC', 'SC',
    ]);
    expect(e.totalConsume).toBe(6); // MAGIC=0, SC*6=6
    expect(e.totalProduce).toBe(6); // MAGIC=0, SC*6=6
  });

  it('늘림 6회 → 12코 생성', () => {
    const e = expandFrom('6V');
    expect(e.ops).toHaveLength(6);
    expect(e.totalConsume).toBe(6);
    expect(e.totalProduce).toBe(12); // 각 V는 1→2
  });

  it('V^3: 한 코에 SC 3개', () => {
    const e = expandFrom('V^3');
    expect(e.ops).toHaveLength(1);
    expect(e.ops[0]!.consume).toBe(1);
    expect(e.ops[0]!.produce).toBe(3);
  });

  it('2V^3: V^3을 2회 (2코 소비, 6코 생성)', () => {
    const e = expandFrom('2V^3');
    expect(e.ops).toHaveLength(2);
    expect(e.totalConsume).toBe(2);
    expect(e.totalProduce).toBe(6);
  });

  it('A: 2코를 1코로', () => {
    const e = expandFrom('3A');
    expect(e.ops).toHaveLength(3);
    expect(e.totalConsume).toBe(6);
    expect(e.totalProduce).toBe(3);
  });

  it('A^3: 3코 모아뜨기', () => {
    const e = expandFrom('A^3');
    expect(e.ops[0]!.consume).toBe(3);
    expect(e.ops[0]!.produce).toBe(1);
  });

  it('반복 그룹: (1X, 1V)*6', () => {
    const e = expandFrom('(1X, 1V)*6');
    expect(e.ops).toHaveLength(12); // (1+1) × 6
    const kinds = e.ops.map((o) => o.kind);
    expect(kinds).toEqual([
      'SC', 'INC', 'SC', 'INC',
      'SC', 'INC', 'SC', 'INC',
      'SC', 'INC', 'SC', 'INC',
    ]);
    expect(e.totalConsume).toBe(12);
    expect(e.totalProduce).toBe(18); // SC=6*1 + INC=6*2
  });

  it('복합 반복 + 확장: (1X, 2V^3) * 2', () => {
    const e = expandFrom('(1X, 2V^3) * 2');
    // 안쪽 sequence: SC + INC + INC  → 3 ops per repetition
    // 2회 반복 → 6 ops
    expect(e.ops).toHaveLength(6);
    const produces = e.ops.map((o) => o.produce);
    expect(produces).toEqual([1, 3, 3, 1, 3, 3]);
    expect(e.totalConsume).toBe(6); // (1 + 1 + 1) × 2
    expect(e.totalProduce).toBe(14); // (1 + 3 + 3) × 2
  });

  it('blo 수식자 보존', () => {
    const e = expandFrom('blo 3X');
    expect(e.ops).toHaveLength(3);
    expect(e.ops.every((o) => o.modifier === 'BLO')).toBe(true);
    expect(e.ops.every((o) => o.kind === 'SC')).toBe(true);
  });

  it('사슬뜨기: consume=0, produce=1', () => {
    const e = expandFrom('10O');
    expect(e.ops).toHaveLength(10);
    expect(e.totalConsume).toBe(0);
    expect(e.totalProduce).toBe(10);
  });

  it('sourceRange 보존 — 같은 AST에서 확장된 Op는 동일 range 공유', () => {
    const e = expandFrom('3X');
    const ranges = e.ops.map((o) => o.sourceRange);
    expect(ranges[0]).toEqual(ranges[1]);
    expect(ranges[1]).toEqual(ranges[2]);
  });

  it('다단 예시 (도넛 6단)', () => {
    const rounds = [
      '@, 6X',
      '6V',
      '(1X,1V)*6',
      '(2X,1V)*6',
      '(3X,1V)*6',
      '24X',
    ];
    const expected_produce = [6, 12, 18, 24, 30, 24];
    rounds.forEach((src, i) => {
      const e = expandFrom(src);
      expect(e.totalProduce).toBe(expected_produce[i]);
    });
  });
});
