import { describe, expect, it } from 'vitest';
import { parseRound } from '../src/lib/crafts/crochet/parser';
import { expand } from '../src/lib/expand/expander';
import { layoutCircular } from '../src/lib/crafts/crochet/circular';

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

  it('standalone 사슬은 chain-as-parent 로 같은 단 다음 코의 부모가 됨', () => {
    // mr, 6x / 3ch, 5f : 3ch 가 큐에 추가되고 5f 의 처음 3개가 chain 부모, 나머지 2개는 prev 부모.
    const res = layoutFromSources(['mr, 6x', '3ch, 5f']);
    const r2 = res.stitches.filter((s) => s.roundIndex === 2);
    const chains = r2.filter((s) => s.op.kind === 'CHAIN');
    const fs = r2.filter((s) => s.op.kind === 'DC');
    expect(chains).toHaveLength(3);
    expect(fs).toHaveLength(5);
    // 모두 같은 반지름 (링 슬롯)
    const radii = chains.map((c) => Math.hypot(c.position.x, c.position.y));
    for (const r of radii) expect(r).toBeCloseTo(radii[0]!, 1);
    // 첫 3개의 DC 는 chain 부모, 마지막 2개는 prev (R1 SC) 부모.
    const chainIdxs = chains.map((c) => res.stitches.indexOf(c));
    for (let i = 0; i < 3; i++) {
      expect(fs[i]!.parentIndices).toEqual([chainIdxs[i]]);
    }
    for (let i = 3; i < 5; i++) {
      const pi = fs[i]!.parentIndices[0]!;
      expect(res.stitches[pi]!.roundIndex).toBe(1);
    }
  });

  it('samehole 사슬은 arc 로 클러스터 — CHAIN_SPACING=9 인접', () => {
    // [3ch, 1f] 의 chains 는 공유 부모 / 다음 non-chain 사이 arc 에 클러스터.
    // anchor t-swap 로 array 순서와 공간 순서가 달라지므로 angle 기준 정렬 후 검사.
    const res = layoutFromSources(['mr, 6x', '[3ch, 1f], 5f']);
    const chains = res.stitches.filter((s) => s.roundIndex === 2 && s.op.kind === 'CHAIN');
    expect(chains).toHaveLength(3);
    const sorted = [...chains].sort(
      (a, b) => Math.atan2(a.position.y, a.position.x) - Math.atan2(b.position.y, b.position.x),
    );
    for (let i = 1; i < sorted.length; i++) {
      const d = Math.hypot(
        sorted[i]!.position.x - sorted[i - 1]!.position.x,
        sorted[i]!.position.y - sorted[i - 1]!.position.y,
      );
      expect(d).toBeCloseTo(9, 0);
    }
  });

  it('samehole 에서 chain 의 공유 부모가 올바르게 할당됨 (첫 op 강제 consumer)', () => {
    // [3ch, 1f]: 첫 chain 이 anchor (consume=1)
    const res = layoutFromSources(['mr, 6x', '[3ch, 1f], 5f']);
    const ch1 = res.stitches.find((s) => s.roundIndex === 2 && s.op.kind === 'CHAIN')!;
    expect(ch1.parentIndices).toHaveLength(1);
  });

  it('samehole 내 두 chain run 이 서로 다른 위치에 배치됨', () => {
    // [2ch, 1f, 2ch]: 2 개의 chain run — F 좌우로 분리
    const res = layoutFromSources(['mr, 6x', '[2ch, 1f, 2ch], 4f']);
    const chains = res.stitches.filter((s) => s.roundIndex === 2 && s.op.kind === 'CHAIN');
    expect(chains).toHaveLength(4);
    // 첫 run 과 둘째 run 의 평균 위치가 달라야 함
    const run1Mid = {
      x: (chains[0]!.position.x + chains[1]!.position.x) / 2,
      y: (chains[0]!.position.y + chains[1]!.position.y) / 2,
    };
    const run2Mid = {
      x: (chains[2]!.position.x + chains[3]!.position.x) / 2,
      y: (chains[2]!.position.y + chains[3]!.position.y) / 2,
    };
    const separation = Math.hypot(run1Mid.x - run2Mid.x, run1Mid.y - run2Mid.y);
    expect(separation).toBeGreaterThan(20);
  });

  it('tc(...) 기둥코는 세로 스택 — 같은 각도, 반지름 증가', () => {
    const res = layoutFromSources(['mr, 6x', 'tc(3ch), 5f']);
    const chains = res.stitches.filter((s) => s.roundIndex === 2 && s.op.kind === 'CHAIN');
    expect(chains).toHaveLength(3);
    const angles = chains.map((c) => Math.atan2(c.position.y, c.position.x));
    // 모두 같은 각도
    for (const a of angles) expect(a).toBeCloseTo(angles[0]!, 2);
    // 반지름 증가 (세로 스택)
    const radii = chains.map((c) => Math.hypot(c.position.x, c.position.y));
    expect(radii[1]!).toBeGreaterThan(radii[0]!);
    expect(radii[2]!).toBeGreaterThan(radii[1]!);
  });

  it('SLIP 은 이제 코수에 포함 (produce=1)', () => {
    const res = layoutFromSources(['mr, 6x', '5x, 1sl']);
    const r2 = res.stitches.filter((s) => s.roundIndex === 2);
    expect(r2).toHaveLength(6);
    // 모두 링 반지름 상에 (각자 슬롯)
    const angles = r2.map((s) => Math.atan2(s.position.y, s.position.x));
    const sorted = [...angles].sort((a, b) => a - b);
    // 균등 간격
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i]! - sorted[i - 1]!).toBeCloseTo(2 * Math.PI / 6, 1);
    }
  });
});

describe('사슬 위 한 코 그룹', () => {
  /** 한 코 그룹 멤버들 사이의 최소 거리 */
  function minGroupDistance(layout: ReturnType<typeof layoutFromSources>, roundIndex: number): number {
    const row = layout.stitches.filter((s) => s.roundIndex === roundIndex && s.op.inSameHoleGroup);
    let min = Infinity;
    for (let i = 0; i < row.length; i++) {
      for (let j = i + 1; j < row.length; j++) {
        const a = row[i]!.position, b = row[j]!.position;
        min = Math.min(min, Math.hypot(a.x - b.x, a.y - b.y));
      }
    }
    return min;
  }

  it('사슬 위에 얹힌 그룹의 코들이 기호 폭 이상 벌어진다', () => {
    // `1ch` 위에 `[1f,2e]` — 예전에는 세 코가 모두 사슬 각도로 스냅되어 한 점에 겹쳤고,
    // 그룹 간격을 살린 뒤에도 사슬 한 칸의 폭이 좁아 6~7px 로 붙어 있었다.
    const layout = layoutFromSources([
      'mr, 10t',
      '10vt',
      '(1t, 1vt)*10',
      '10sl, 1ch, [1f, 2e], 1ch, 8sl',
    ]);
    // 기호 폭(약 10px) 보다 넓게
    expect(minGroupDistance(layout, 4)).toBeGreaterThan(12);
  });

  it('그룹 멤버는 부모 사슬 주변에 벌어져 배치된다', () => {
    const layout = layoutFromSources(['mr, 10t', '10sl, 1ch, [1f, 2e], 9sl']);
    const row = layout.stitches.filter((s) => s.roundIndex === 2);
    const group = row.filter((s) => s.op.inSameHoleGroup);
    expect(group).toHaveLength(3);
    const angles = group.map((s) => Math.atan2(s.position.y, s.position.x));
    // 세 각도가 모두 다르다
    expect(new Set(angles.map((a) => a.toFixed(4))).size).toBe(3);
  });

  it('사슬 위 단일 코는 사슬과 같은 각도를 유지한다', () => {
    const layout = layoutFromSources(['mr, 10t', '10sl, 1ch, 1x, 9sl']);
    const row = layout.stitches.filter((s) => s.roundIndex === 2);
    const chain = row.find((s) => s.op.kind === 'CHAIN')!;
    const sc = row.find((s) => s.op.kind === 'SC' && s.parentIndices.length > 0)!;
    const ca = Math.atan2(chain.position.y, chain.position.x);
    const sa = Math.atan2(sc.position.y, sc.position.x);
    expect(Math.abs(ca - sa)).toBeLessThan(1e-9);
  });
});
