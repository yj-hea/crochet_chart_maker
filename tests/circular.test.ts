import { describe, expect, it } from 'vitest';
import { parseRound } from '../src/lib/crafts/crochet/parser';
import { expand } from '../src/lib/expand/expander';
import { layoutCircular } from '../src/lib/crafts/crochet/circular';
import { STITCH_META } from '../src/lib/crafts/crochet/stitch';

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
    // 기호 폭(약 10px) 보다 넓게 — 겹침 재배치를 거친 뒤 값
    expect(minGroupDistance(layout, 4)).toBeGreaterThan(10.5);
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

describe('독립 사슬 재배치', () => {
  it('사슬이 양옆 코 중심 반경의 평균에 놓인다', () => {
    // 4X, 3ch, 5F, 4X — 사슬 양옆은 SC(안쪽)와 DC(바깥쪽)
    const res = layoutFromSources(['@, 12X', '4X, 3ch, 5F, 4X']);
    const r2 = res.stitches.filter((s) => s.roundIndex === 2);
    const rad = (s: (typeof r2)[number]) => Math.hypot(s.position.x, s.position.y);
    const chains = r2.filter((s) => s.op.kind === 'CHAIN');
    const sc = r2.filter((s) => s.op.kind === 'SC');
    // 사슬 위에 얹히지 않은 DC (= 이전 단을 부모로 갖는 DC)
    const chainIdx = new Set(res.stitches.map((s, i) => [s, i] as const)
      .filter(([s]) => s.op.kind === 'CHAIN' && s.roundIndex === 2).map(([, i]) => i));
    const groundDc = r2.filter(
      (s) => s.op.kind === 'DC' && !s.parentIndices.some((p) => chainIdx.has(p)),
    );
    expect(chains).toHaveLength(3);
    expect(groundDc.length).toBeGreaterThan(0);
    const expected = (rad(sc[sc.length - 1]!) + rad(groundDc[0]!)) / 2;
    for (const c of chains) expect(rad(c)).toBeCloseTo(expected, 3);
  });

  it('사슬 위에 얹힌 코는 사슬을 따라 같이 움직인다', () => {
    const res = layoutFromSources(['@, 12X', '4X, 3ch, 5F, 4X']);
    const r2 = res.stitches.filter((s) => s.roundIndex === 2);
    const chains = r2.filter((s) => s.op.kind === 'CHAIN');
    const ang = (s: (typeof r2)[number]) => Math.atan2(s.position.y, s.position.x);
    const chainIdxSet = new Set(res.stitches.map((s, i) => [s, i] as const)
      .filter(([s]) => s.op.kind === 'CHAIN' && s.roundIndex === 2).map(([, i]) => i));
    const riders = r2.filter((s) => s.parentIndices.some((p) => chainIdxSet.has(p)));
    expect(riders).toHaveLength(3);
    // 각 사슬과 그 위 코의 각도가 일치 (연결선이 비스듬해지지 않음)
    for (let i = 0; i < 3; i++) expect(ang(riders[i]!)).toBeCloseTo(ang(chains[i]!), 6);
  });

  it('`1ch, skip(1)` 의 사슬이 이웃 기호와 겹치지 않는다', () => {
    const res = layoutFromSources([
      '@, 12X',
      '12X',
      '3X, 1ch, skip(1), 4F, 1ch, skip(1), 3X',
    ]);
    const r3 = res.stitches.filter((s) => s.roundIndex === 3 && s.op.kind !== 'MAGIC');
    // 기호 반폭 (SVG 정의 기준) — 접선 방향 최소 간격
    const halfW: Record<string, number> = { CHAIN: 5, SKIP: 5, SC: 5, DC: 5 };
    for (let i = 0; i < r3.length; i++) {
      for (let j = i + 1; j < r3.length; j++) {
        const A = r3[i]!, B = r3[j]!;
        const dx = B.position.x - A.position.x, dy = B.position.y - A.position.y;
        const ra = Math.hypot(A.position.x, A.position.y);
        const dTan = Math.abs((dx * -A.position.y + dy * A.position.x) / ra);
        const dRad = Math.abs((dx * A.position.x + dy * A.position.y) / ra);
        const needTan = (halfW[A.op.kind] ?? 5) + (halfW[B.op.kind] ?? 5);
        const needRad = STITCH_META[A.op.kind].symbolHalfHeight
          + STITCH_META[B.op.kind].symbolHalfHeight;
        // 접선·반경 두 방향 모두 겹치면 기호가 실제로 포개진다
        expect(
          dTan >= needTan || dRad >= needRad,
          `${A.op.kind}[${i}] ↔ ${B.op.kind}[${j}] tan=${dTan.toFixed(1)}/${needTan} rad=${dRad.toFixed(1)}/${needRad}`,
        ).toBe(true);
      }
    }
  });
});

describe('사슬 위 SKIP', () => {
  it('SKIP 기호가 그 사슬에 붙어 있다', () => {
    const res = layoutFromSources(['@, 12X', '12X', '3X, 1ch, skip(1), 4F, 3X']);
    const skip = res.stitches.find((s) => s.op.kind === 'SKIP' && s.roundIndex === 3)!;
    const chainIdx = skip.parentIndices.find((p) => res.stitches[p]!.op.kind === 'CHAIN')!;
    const chain = res.stitches[chainIdx]!;
    const d = Math.hypot(skip.position.x - chain.position.x, skip.position.y - chain.position.y);
    const minGap = STITCH_META['CHAIN'].symbolHalfHeight + STITCH_META['SKIP'].symbolHalfHeight;
    expect(d).toBeGreaterThanOrEqual(minGap); // 기호끼리 포개지지는 않고
    expect(d).toBeLessThan(minGap + 5);       // 어느 사슬인지 읽힐 만큼 붙어 있다
  });
});

describe('각도 완화 (겹침 해소)', () => {
  /** 기호 반폭 — symbols.ts 의 SVG 정의 기준 */
  const HALF_W: Record<string, number> = {
    MAGIC: 7, CHAIN: 5, SLIP: 2.2, SC: 5, HDC: 5, DC: 5, TR: 5, DTR: 5,
    INC: 5, DEC: 5, POPCORN: 7, BUBBLE: 7, SKIP: 5, TC: 0,
  };

  /** 기호가 실제로 포개진 쌍 — 접선·반경 두 방향 모두 걸릴 때만 겹침이다 */
  function overlappingPairs(res: ReturnType<typeof layoutFromSources>): string[] {
    const all = res.stitches.filter((s) => s.op.kind !== 'MAGIC' && s.op.kind !== 'TC');
    const hits: string[] = [];
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const A = all[i]!, B = all[j]!;
        if (A.roundIndex !== B.roundIndex) continue;
        const dx = B.position.x - A.position.x, dy = B.position.y - A.position.y;
        const ra = Math.hypot(A.position.x, A.position.y);
        if (ra < 1) continue;
        const dTan = Math.abs((dx * -A.position.y + dy * A.position.x) / ra);
        const dRad = Math.abs((dx * A.position.x + dy * A.position.y) / ra);
        const needTan = (HALF_W[A.op.kind] ?? 5) + (HALF_W[B.op.kind] ?? 5);
        const needRad = STITCH_META[A.op.kind].symbolHalfHeight
          + STITCH_META[B.op.kind].symbolHalfHeight;
        if (dTan < needTan && dRad < needRad) {
          hits.push(`R${A.roundIndex} ${A.op.kind}↔${B.op.kind} tan=${dTan.toFixed(1)}/${needTan}`);
        }
      }
    }
    return hits;
  }

  const CASES: Record<string, string[]> = {
    '사슬 + skip': ['@, 12X', '12X', '3X, 1ch, skip(1), 4F, 1ch, skip(1), 3X'],
    '사슬 브릿지': ['@, 12X', '4X, 3ch, 5F, 4X', '12X'],
    '사슬망': ['@, 12X', '(1X, 2ch, skip(1))*6', '(1X, 2ch, skip(1))*6'],
    '한 코 그룹': ['@, 12X', '(1X, [3F], 1X)*4'],
    '키 큰 코 + 사슬': [
      '@, 12X', '12X',
      '2X, [1F, 1E], 1ch, skip(1), [1E, 1F], 2X, 4sl',
    ],
  };

  for (const [name, src] of Object.entries(CASES)) {
    for (const vAlign of ['same', 'even'] as const) {
      it(`${name} — 기호가 겹치지 않는다 (${vAlign})`, () => {
        const res = layoutCircular(
          src.map((s, i) => {
            const r = parseRound(i + 1, s);
            if (!r.body) throw new Error(`parse: ${s}`);
            return expand(r.body, i + 1);
          }),
          { vAlign, cascade: true },
        );
        expect(overlappingPairs(res)).toEqual([]);
      });
    }
  }

  it('겹치지 않는 도안은 한 코도 움직이지 않는다', () => {
    // 완화 패스는 제약이 걸린 구간에만 개입한다. 여유가 있으면 cascade 결과 그대로 —
    // 즉 1:1 코는 부모 각도에 **정확히** 남아 있어야 한다.
    const res = layoutFromSources(['@, 6X', '6V', '12X', '12X', '12X']);
    expect(overlappingPairs(res)).toEqual([]); // 전제: 애초에 겹침이 없는 도안
    const ang = (i: number) => {
      const s = res.stitches[i]!;
      return Math.atan2(s.position.y, s.position.x);
    };
    let checked = 0;
    for (let i = 0; i < res.stitches.length; i++) {
      const s = res.stitches[i]!;
      if (s.op.produce !== 1 || s.op.consume !== 1) continue;
      if (s.parentIndices.length !== 1) continue;
      // 부모가 V 면 자식은 부모 기호가 아니라 그 하위 슬롯에 놓인다 — 비교 대상이 아니다
      if (res.stitches[s.parentIndices[0]!]!.op.produce !== 1) continue;
      expect(ang(i)).toBeCloseTo(ang(s.parentIndices[0]!), 9);
      checked++;
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('원주에 담을 수 없는 단은 손대지 않는다', () => {
    // 반지름에 비해 코가 지나치게 많으면 밀어봐야 순서만 뒤집힌다 — 그대로 둔다.
    const res = layoutFromSources(['@, 6X', '6V^12']);
    expect(res.stitches.filter((s) => s.roundIndex === 2).length).toBeGreaterThan(0);
    expect(res.bounds.width).toBeGreaterThan(0);
  });
});
