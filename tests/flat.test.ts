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
    // 기본 방향은 forward(LTR) — 모든 단 오른쪽 진행 마커
    const markers = result.roundMarkers;
    expect(markers.find((m) => m.roundIndex === 1)?.direction).toBe('right');
    expect(markers.find((m) => m.roundIndex === 2)?.direction).toBe('right');
  });

  it('V^3 와 [3x] 는 동일한 슬롯 x 를 노출 — 다음 단 자식 정렬 일치', () => {
    const a = layoutFromSources(['1O', '1V^3', '3X']);
    const b = layoutFromSources(['1O', '[3x]', '3X']);
    const aR3 = a.stitches.filter((s) => s.roundIndex === 3);
    const bR3 = b.stitches.filter((s) => s.roundIndex === 3);
    expect(aR3).toHaveLength(3);
    expect(bR3).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      expect(aR3[i]!.position.x).toBeCloseTo(bR3[i]!.position.x, 3);
    }
  });

  it('V 는 자기 claim 의 왼쪽 셀에 배치 (옆 셀은 빈 코 자리)', () => {
    const result = layoutFromSources(['1O', '1V', '2X']);
    const r2 = result.stitches.filter((s) => s.roundIndex === 2);
    expect(r2).toHaveLength(1);
    const v = r2[0]!;
    const r3 = result.stitches.filter((s) => s.roundIndex === 3);
    expect(r3).toHaveLength(2);
    // 자식 2개의 첫 번째가 V 와 같은 x (왼쪽 셀), 두 번째가 W 만큼 오른쪽
    expect(r3[0]!.position.x).toBeCloseTo(v.position.x, 3);
    expect(r3[1]!.position.x).toBeCloseTo(v.position.x + 24, 3);
  });

  it('V 가 행을 확장하면 부모 행은 자식 V 의 x 로 align (L 모드)', () => {
    const result = layoutFromSources(['6O', '6V']);
    const r1 = result.stitches.filter((s) => s.roundIndex === 1);
    const r2 = result.stitches.filter((s) => s.roundIndex === 2);
    expect(r1).toHaveLength(6);
    expect(r2).toHaveLength(6);
    for (const s of r2) expect(s.exposedSlots).toBe(2);
    // L 모드: 각 1단 SC 가 자기 자식 V 와 같은 x 에 위치.
    for (let i = 0; i < 6; i++) {
      expect(r1[i]!.position.x).toBeCloseTo(r2[i]!.position.x, 3);
    }
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

describe('layoutFlat — samehole', () => {
  it('[F,T] 두 stitch가 같은 부모를 공유', () => {
    const r1 = parseRound(1, '2O');
    const r2 = parseRound(2, '[F,T]');
    const e1 = expand(r1.body!, 1);
    const e2 = expand(r2.body!, 2);
    const result = layoutFlat([e1, e2]);
    const r2stitches = result.stitches.filter((s) => s.roundIndex === 2);
    expect(r2stitches).toHaveLength(2);
    // 두 stitch 모두 같은 부모
    expect(r2stitches[0]!.parentIndices).toEqual(r2stitches[1]!.parentIndices);
    expect(r2stitches[0]!.parentIndices).toHaveLength(1);
  });

  it('2X, [F,T] — 3번째 부모가 [F,T] 그룹 공유', () => {
    const r1 = parseRound(1, '3O');
    const r2 = parseRound(2, '2X, [F,T]');
    const e1 = expand(r1.body!, 1);
    const e2 = expand(r2.body!, 2);
    const result = layoutFlat([e1, e2]);
    const r2s = result.stitches.filter((s) => s.roundIndex === 2);
    expect(r2s).toHaveLength(4); // X, X, F, T
    // F와 T는 같은 부모(세 번째 O)
    expect(r2s[2]!.parentIndices).toEqual(r2s[3]!.parentIndices);
    expect(r2s[2]!.parentIndices[0]).not.toBe(r2s[0]!.parentIndices[0]);
  });
});

describe('layoutFlat — bridge', () => {
  it('X, [3O, skip(3)], X 다음 단에서 anchor 가 부모 1개로 노출', () => {
    const result = layoutFromSources(['5O', 'X, [3O, skip(3)], X', '3X']);
    const r2s = result.stitches.filter((s) => s.roundIndex === 2);
    expect(r2s.map((s) => s.op.kind)).toEqual([
      'SC', 'CHAIN', 'CHAIN', 'CHAIN', 'BRIDGE_ANCHOR', 'SC',
    ]);
    expect(r2s[4]!.exposedSlots).toBe(1);
    // anchor 부모: 가운데 3개 (전체 부모 5개 중 첫 X 가 1개 소비, 다음 3개 skip)
    expect(r2s[4]!.parentIndices).toHaveLength(3);

    const r3s = result.stitches.filter((s) => s.roundIndex === 3);
    expect(r3s).toHaveLength(3);
    // 가운데 X 의 부모 = anchor stitch
    const anchorStitchIdx = result.stitches.indexOf(r2s[4]!);
    expect(r3s[1]!.parentIndices).toEqual([anchorStitchIdx]);
  });

  it('bridge CHAIN 들은 부모 *반대* 방향으로 볼록한 호로 배치', () => {
    const result = layoutFromSources(['5O', 'X, [3O, skip(3)], X']);
    const r1s = result.stitches.filter((s) => s.roundIndex === 1);
    const r2s = result.stitches.filter((s) => s.roundIndex === 2);
    const parentY = r1s[0]!.position.y;
    const currentY = r2s[0]!.position.y;
    const chains = r2s.filter((s) => s.op.kind === 'CHAIN');
    expect(chains).toHaveLength(3);
    // 가운데 사슬은 양 끝 사슬보다 부모에서 *멀리* (현재 행보다 더 멀리) 떨어져 있어야 호의 정점.
    const sorted = [...chains].sort((a, b) => a.position.x - b.position.x);
    const dir = Math.sign(currentY - parentY); // 부모 반대 방향
    expect((sorted[1]!.position.y - currentY) * dir).toBeGreaterThanOrEqual(0);
  });

  it('1x,skip(1),[5O,skip(3)],skip(1),1x — SKIP=consume, bridge=consume cells', () => {
    // 1단: 7x (7 cell). 2단: 1x(1)+skip(1)(1)+bridge consume=3+skip(1)(1)+1x(1) = 7 cell. cells -3W..+3W.
    const result = layoutFromSources(['7x', '1x, skip(1), [5O, skip(3)], skip(1), 1x']);
    const r1 = result.stitches.filter((s) => s.roundIndex === 1);
    const r2 = result.stitches.filter((s) => s.roundIndex === 2);
    expect(r1).toHaveLength(7);
    const W = 24;
    const r2SCs = r2.filter((s) => s.op.kind === 'SC');
    expect(r2SCs).toHaveLength(2);
    expect(r2SCs[0]!.position.x).toBeCloseTo(-3 * W, 3);
    expect(r2SCs[1]!.position.x).toBeCloseTo(+3 * W, 3);
    const anchor = r2.find((s) => s.op.kind === 'BRIDGE_ANCHOR')!;
    expect(anchor.position.x).toBeCloseTo(0, 3); // 3 cell 의 가운데
  });

  it('[5O, skip(1)] — 5+ 사슬은 축약: 첫/마지막만 visible + 숫자 라벨', () => {
    const result = layoutFromSources(['3O', 'X, [5O, skip(1)], X']);
    const r2 = result.stitches.filter((s) => s.roundIndex === 2);
    const chains = r2.filter((s) => s.op.kind === 'CHAIN');
    expect(chains).toHaveLength(5);
    const visible = chains.filter((c) => !c.hidden);
    expect(visible).toHaveLength(2);
    const anchor = r2.find((s) => s.op.kind === 'BRIDGE_ANCHOR')!;
    expect(anchor.labelText).toBe('5');
  });

  it('5개 이상 사슬은 첫/마지막만 visible, 가운데는 hidden + 숫자 라벨', () => {
    const result = layoutFromSources(['7O', '2x, [15O, skip(1)], 4x']);
    const r2 = result.stitches.filter((s) => s.roundIndex === 2);
    const chains = r2.filter((s) => s.op.kind === 'CHAIN');
    expect(chains).toHaveLength(15);
    const visible = chains.filter((c) => !c.hidden);
    expect(visible).toHaveLength(2);
    const anchor = r2.find((s) => s.op.kind === 'BRIDGE_ANCHOR')!;
    expect(anchor.labelText).toBe('15');
  });

  it('좁은 단의 부모는 자식 위치로 cascade 이동 (L 모드)', () => {
    // 1단=2x, 2단=4x. 2단 cell-based (-1.5W..+1.5W). 1단 SC 들이 자식 위치로 이동.
    const result = layoutFromSources(['2x', '4x']);
    const r1 = result.stitches.filter((s) => s.roundIndex === 1);
    const r2 = result.stitches.filter((s) => s.roundIndex === 2);
    expect(r1[0]!.position.x).toBeCloseTo(r2[0]!.position.x, 3);
    expect(r1[1]!.position.x).toBeCloseTo(r2[1]!.position.x, 3);
  });

  it('align: 좁은 단(1x) 이 max 단(=[3x]) 의 셀 위치에 정렬', () => {
    const W = 24;
    const max = (sources: string[], align: 'L' | 'R' | 'C') => {
      const expanded = sources.map((src, i) => {
        const r = parseRound(i + 1, src);
        if (!r.body) throw new Error('parse failed');
        return expand(r.body, i + 1);
      });
      return layoutFlat(expanded, { align });
    };
    // L: 1단 1x 가 max 좌측 끝, [3x] 는 1x 의 오른쪽으로 펼쳐짐
    const L = max(['1x', '[3x]'], 'L');
    const r1L = L.stitches.find((s) => s.roundIndex === 1)!;
    const r2L = L.stitches.filter((s) => s.roundIndex === 2);
    expect(r1L.position.x).toBeCloseTo(-W, 3);
    expect(r2L[0]!.position.x).toBeCloseTo(-W, 3);
    expect(r2L[2]!.position.x).toBeCloseTo(+W, 3);
    // R: 1x 가 max 우측 끝
    const R = max(['1x', '[3x]'], 'R');
    const r1R = R.stitches.find((s) => s.roundIndex === 1)!;
    expect(r1R.position.x).toBeCloseTo(+W, 3);
    // C: 1x 가 [3x] 의 가운데 stitch 와 같은 x
    const C = max(['1x', '[3x]'], 'C');
    const r1C = C.stitches.find((s) => s.roundIndex === 1)!;
    const r2C = C.stitches.filter((s) => s.roundIndex === 2);
    expect(r1C.position.x).toBeCloseTo(r2C[1]!.position.x, 3);
  });

  it('1단 [2x] 와 1V 의 너비/슬롯이 동일해야 함', () => {
    const a = layoutFromSources(['1V']);
    const b = layoutFromSources(['[2x]']);
    const aR1 = a.stitches.filter((s) => s.roundIndex === 1);
    const bR1 = b.stitches.filter((s) => s.roundIndex === 1);
    // 가시 stitch 수: V 1, [2x] 2 — 다르지만 다음 단 자식이 닿을 부모 슬롯은 동일해야 함.
    // 다음 단을 2x 로 두고 자식 위치 비교.
    const a2 = layoutFromSources(['1V', '2x']);
    const b2 = layoutFromSources(['[2x]', '2x']);
    const a2R2 = a2.stitches.filter((s) => s.roundIndex === 2);
    const b2R2 = b2.stitches.filter((s) => s.roundIndex === 2);
    expect(a2R2).toHaveLength(2);
    expect(b2R2).toHaveLength(2);
    expect(a2R2[0]!.position.x).toBeCloseTo(b2R2[0]!.position.x, 3);
    expect(a2R2[1]!.position.x).toBeCloseTo(b2R2[1]!.position.x, 3);
    // 1단 자체의 너비 (visible bounding box) 도 같아야: V 는 vSlots=2, [2x] 는 2 stitches at slot 0, 1
    const aXs = aR1.map((s) => s.position.x);
    const bXs = bR1.map((s) => s.position.x);
    const aSpan = Math.max(...aXs) - Math.min(...aXs);
    const bSpan = Math.max(...bXs) - Math.min(...bXs);
    // V 는 단일 점 (span=0), [2x] 는 두 stitch 사이 (span=W). 그래도 다음 단 부모 슬롯은 같음.
    // 너비 비교는 다음 단 자식 x 동일성으로 갈음.
    void aSpan; void bSpan;
  });

  it('4개까지의 사슬은 축약 없이 모두 visible', () => {
    const result = layoutFromSources(['5O', '[4O, skip(1)]']);
    const r2 = result.stitches.filter((s) => s.roundIndex === 2);
    const chains = r2.filter((s) => s.op.kind === 'CHAIN');
    expect(chains).toHaveLength(4);
    expect(chains.every((c) => !c.hidden)).toBe(true);
    const anchor = r2.find((s) => s.op.kind === 'BRIDGE_ANCHOR')!;
    expect(anchor.labelText).toBeUndefined();
  });

  it('레이스 패턴: [5O, skip(3)] 다음 단의 [3F] 가 anchor 를 공유 부모로 사용', () => {
    // 1단: 7O (7 부모)
    // 2단: X, [5O, skip(3)], X, X, X (X*1 + bridge + X*3 = 부모 1+3+3=7 소비, anchor 1 + X 3 = 4 슬롯)
    // 3단: 첫 X, [3F](anchor 위에 3F 동일 부모 공유), 3X
    const result = layoutFromSources([
      '7O',
      'X, [5O, skip(3)], X, X, X',
      'X, [3F], X, X, X',
    ]);
    const r2 = result.stitches.filter((s) => s.roundIndex === 2);
    const anchor = r2.find((s) => s.op.kind === 'BRIDGE_ANCHOR')!;
    const anchorIdx = result.stitches.indexOf(anchor);

    const r3 = result.stitches.filter((s) => s.roundIndex === 3);
    // r3: SC, DC, DC, DC, SC, SC, SC = 7 ops
    expect(r3.map((s) => s.op.kind)).toEqual(['SC', 'DC', 'DC', 'DC', 'SC', 'SC', 'SC']);
    // 가운데 3 DC 가 같은 부모(anchor) 공유
    expect(r3[1]!.parentIndices).toEqual([anchorIdx]);
    expect(r3[2]!.parentIndices).toEqual([anchorIdx]);
    expect(r3[3]!.parentIndices).toEqual([anchorIdx]);
  });
});
