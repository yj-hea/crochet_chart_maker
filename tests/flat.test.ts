import { describe, expect, it } from 'vitest';
import { parseRound } from '../src/lib/parser/parser';
import { expand } from '../src/lib/expand/expander';
import { layoutFlat } from '../src/lib/layout/flat';

function layoutFromSources(sources: string[]) {
  const expandedRounds = sources.map((src, i) => {
    const r = parseRound(i + 1, src);
    if (!r.body) throw new Error(`parse failed: ${JSON.stringify(r.errors)}`);
    return expand(r.body, i + 1);
  });
  return layoutFlat(expandedRounds);
}

describe('layoutFlat', () => {
  it('단 1의 사슬 10개: 중앙 정렬, 같은 y', () => {
    const result = layoutFromSources(['10O']);
    const chains = result.stitches.filter((s) => s.op.kind === 'CHAIN');
    expect(chains).toHaveLength(10);
    const ys = chains.map((s) => s.position.y);
    for (const y of ys) expect(y).toBe(ys[0]!);

    // 중앙 정렬: 첫 x + 마지막 x = 0
    const firstX = chains[0]!.position.x;
    const lastX = chains[chains.length - 1]!.position.x;
    expect(firstX + lastX).toBeCloseTo(0, 5);
  });

  it('단 2는 단 1보다 위쪽 (y가 더 작음)', () => {
    const result = layoutFromSources(['6O', '6X']);
    const r1 = result.stitches.filter((s) => s.roundIndex === 1)[0]!;
    const r2 = result.stitches.filter((s) => s.roundIndex === 2)[0]!;
    expect(r2.position.y).toBeLessThan(r1.position.y);
  });

  it('기호는 모든 단에서 angle=0 (짝수 단에서도 뒤집히지 않음)', () => {
    const result = layoutFromSources(['6O', '6X', '6X']);
    for (const s of result.stitches) {
      expect(s.angle).toBe(0);
    }
    // 작업 방향은 마커 direction으로 표현됨
    const markers = result.roundMarkers;
    expect(markers.find((m) => m.roundIndex === 1)?.direction).toBe('right');
    expect(markers.find((m) => m.roundIndex === 2)?.direction).toBe('left');
  });

  it('V는 1개의 stitch지만 2슬롯 차지', () => {
    const result = layoutFromSources(['6O', '6V']); // 단 2에 6V (slots 12, stitches 6)
    const r1 = result.stitches.filter((s) => s.roundIndex === 1);
    const r2 = result.stitches.filter((s) => s.roundIndex === 2);
    expect(r1).toHaveLength(6);
    expect(r2).toHaveLength(6);
    for (const s of r2) expect(s.exposedSlots).toBe(2);
    // 행 폭은 슬롯 수에 비례 — 12 슬롯 ≈ 11×CELL_WIDTH > 5×CELL_WIDTH
    const w1 = Math.abs(r1[0]!.position.x - r1[5]!.position.x);
    const w2 = Math.abs(r2[0]!.position.x - r2[5]!.position.x);
    expect(w2).toBeGreaterThan(w1);
  });

  it('다음 단이 V를 부모로 참조 시 V가 2번 등장', () => {
    const result = layoutFromSources(['6O', '6V', '12X']);
    const r3 = result.stitches.filter((s) => s.roundIndex === 3);
    expect(r3).toHaveLength(12);
    const counts = new Map<number, number>();
    for (const s of r3) {
      const p = s.parentIndices[0]!;
      counts.set(p, (counts.get(p) ?? 0) + 1);
    }
    for (const c of counts.values()) expect(c).toBe(2);
    expect(counts.size).toBe(6);
  });

  it('A: 1 stitch에 부모 2개', () => {
    const result = layoutFromSources(['6O', '3A']);
    const r2 = result.stitches.filter((s) => s.roundIndex === 2);
    expect(r2).toHaveLength(3);
    for (const s of r2) {
      expect(s.parentIndices).toHaveLength(2);
      expect(s.exposedSlots).toBe(1);
    }
  });

  it('빈 입력은 크래시하지 않음', () => {
    const result = layoutFlat([]);
    expect(result.stitches).toEqual([]);
    expect(result.bounds.width).toBeGreaterThan(0);
  });
});
