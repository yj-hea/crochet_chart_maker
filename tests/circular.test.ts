import { describe, expect, it } from 'vitest';
import { parseRound } from '../src/lib/parser/parser';
import { expand } from '../src/lib/expand/expander';
import { layoutCircular } from '../src/lib/layout/circular';

function layoutFromSources(sources: string[]) {
  const expandedRounds = sources.map((src, i) => {
    const r = parseRound(i + 1, src);
    if (!r.body) throw new Error(`parse failed: ${JSON.stringify(r.errors)}`);
    return expand(r.body, i + 1);
  });
  return layoutCircular(expandedRounds);
}

describe('layoutCircular', () => {
  it('MAGIC은 중심 (0,0)에 위치', () => {
    const result = layoutFromSources(['@, 6X']);
    const magic = result.stitches.find((s) => s.op.kind === 'MAGIC')!;
    expect(magic.position).toEqual({ x: 0, y: 0 });
  });

  it('단 1의 6X는 균등 각도, 같은 반지름', () => {
    const result = layoutFromSources(['@, 6X']);
    const scs = result.stitches.filter((s) => s.op.kind === 'SC');
    expect(scs).toHaveLength(6);
    const radii = scs.map((s) => Math.hypot(s.position.x, s.position.y));
    for (const r of radii) expect(r).toBeCloseTo(radii[0]!, 5);
  });

  it('단 1의 첫 스티치는 12시 방향', () => {
    const result = layoutFromSources(['@, 6X']);
    const first = result.stitches.filter((s) => s.op.kind === 'SC')[0]!;
    expect(first.position.x).toBeCloseTo(0, 5);
    expect(first.position.y).toBeLessThan(0); // y가 음수(SVG에선 위쪽)
  });

  it('단 2의 반지름 > 단 1', () => {
    const result = layoutFromSources(['@, 6X', '6V']);
    const r1 = result.stitches.find((s) => s.roundIndex === 1 && s.op.kind === 'SC')!;
    const r2 = result.stitches.find((s) => s.roundIndex === 2)!;
    const rad1 = Math.hypot(r1.position.x, r1.position.y);
    const rad2 = Math.hypot(r2.position.x, r2.position.y);
    expect(rad2).toBeGreaterThan(rad1);
  });

  it('단 2의 V 6회 → 6 스티치 (각 V는 1개의 PositionedStitch, 슬롯 2씩 차지)', () => {
    const result = layoutFromSources(['@, 6X', '6V']);
    const r2stitches = result.stitches.filter((s) => s.roundIndex === 2);
    expect(r2stitches).toHaveLength(6);
    // 각 V는 exposedSlots = 2
    for (const s of r2stitches) {
      expect(s.exposedSlots).toBe(2);
      expect(s.op.kind).toBe('INC');
    }
  });

  it('단 3가 단 2의 V를 부모로 사용 시 V는 2번 참조됨', () => {
    // 단 1: 6X (6 슬롯), 단 2: 6V (6 stitches, 12 슬롯), 단 3: 12X (12 stitches)
    const result = layoutFromSources(['@, 6X', '6V', '12X']);
    const r3 = result.stitches.filter((s) => s.roundIndex === 3);
    expect(r3).toHaveLength(12);
    // r3의 각 X는 V를 부모로 가지며, 같은 V가 2개의 자식에게서 참조됨
    const parentIds = r3.map((s) => s.parentIndices[0]!);
    const counts = new Map<number, number>();
    for (const p of parentIds) counts.set(p, (counts.get(p) ?? 0) + 1);
    // 각 V(6개)가 정확히 2번씩 참조되어야 함
    for (const c of counts.values()) expect(c).toBe(2);
    expect(counts.size).toBe(6);
  });

  it('A: 2 부모 → 1 자식 (PositionedStitch 1개, parents 2개)', () => {
    const result = layoutFromSources(['@, 4X', '2A']);
    const r2stitches = result.stitches.filter((s) => s.roundIndex === 2);
    expect(r2stitches).toHaveLength(2);
    for (const s of r2stitches) {
      expect(s.parentIndices).toHaveLength(2);
      expect(s.exposedSlots).toBe(1);
    }
  });

  it('Bounds는 가장 바깥 단을 포함', () => {
    const result = layoutFromSources(['@, 6X', '6V', '(1X, 1V)*6']);
    const maxRadius = Math.max(
      ...result.stitches.map((s) => Math.hypot(s.position.x, s.position.y))
    );
    expect(result.bounds.width).toBeGreaterThan(maxRadius * 2);
    expect(result.bounds.height).toBeGreaterThan(maxRadius * 2);
  });

  it('빈 단(패턴 없음)은 크래시하지 않음', () => {
    const result = layoutCircular([]);
    expect(result.stitches).toEqual([]);
    expect(result.bounds.width).toBeGreaterThan(0);
  });
});
