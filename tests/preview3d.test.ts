import { describe, expect, it } from 'vitest';
import { parseRound } from '../src/lib/crafts/crochet/parser';
import { expand } from '../src/lib/expand/expander';
import { layoutCircular } from '../src/lib/crafts/crochet/circular';
import { buildStitchGraph } from '../src/lib/preview3d/graph';
import type { StitchGraph, Vec3 } from '../src/lib/preview3d/graph';
import { relax } from '../src/lib/preview3d/relax';
import { stitchHeight, stitchTopWidth } from '../src/lib/preview3d/aspect';
import { axisymmetricSeed } from '../src/lib/preview3d/seed';

function graphFromSources(sources: string[]): StitchGraph {
  const rounds = sources.map((src, i) => {
    const r = parseRound(i + 1, src);
    if (!r.body) throw new Error(`parse failed: ${JSON.stringify(r.errors)}`);
    return expand(r.body, i + 1);
  });
  return buildStitchGraph(layoutCircular(rounds).stitches);
}

interface RoundStat {
  round: number;
  count: number;
  /** 단의 중심축에서 코까지의 평균 거리 */
  radius: number;
  /** 단 중심의 높이 */
  z: number;
}

/** 단별 반지름·높이. 축이 z 라고 가정한다 (원형 도안은 회전면 시드에서 그렇게 선다) */
function roundStats(graph: StitchGraph, positions: Vec3[]): RoundStat[] {
  const byRound = new Map<number, number[]>();
  graph.nodes.forEach((n, i) => {
    // 매직링은 단의 둘레에 있지 않고 축 위에 있어 반지름 통계를 흐린다
    if (n.kind === 'MAGIC') return;
    const list = byRound.get(n.roundIndex);
    if (list) list.push(i);
    else byRound.set(n.roundIndex, [i]);
  });

  return [...byRound.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([round, idxs]) => {
      let cx = 0, cy = 0, cz = 0;
      for (const i of idxs) {
        cx += positions[i]!.x; cy += positions[i]!.y; cz += positions[i]!.z;
      }
      cx /= idxs.length; cy /= idxs.length; cz /= idxs.length;
      let radius = 0;
      for (const i of idxs) radius += Math.hypot(positions[i]!.x - cx, positions[i]!.y - cy);
      return { round, count: idxs.length, radius: radius / idxs.length, z: cz };
    });
}

function zSpread(positions: readonly Vec3[]): number {
  const zs = positions.map((p) => p.z);
  return Math.max(...zs) - Math.min(...zs);
}

describe('코 비율 (aspect)', () => {
  const opOf = (src: string) => {
    const r = parseRound(1, src);
    if (!r.body) throw new Error('parse failed');
    return expand(r.body, 1).ops[0]!;
  };

  it('실을 감을수록 높이가 붙되 증가폭은 완만해진다', () => {
    const h = (src: string) => stitchHeight(opOf(src));
    expect(h('1X')).toBeCloseTo(1.0, 5);   // 짧은뜨기
    expect(h('1T')).toBeCloseTo(1.5, 5);   // 긴뜨기
    expect(h('1F')).toBeCloseTo(2.0, 5);   // 한길긴뜨기
    expect(h('1E')).toBeCloseTo(2.7, 5);   // 두길긴뜨기
    expect(h('1dtr')).toBeCloseTo(3.4, 5); // 세길긴뜨기

    // 기호 규격(1:2:3:4:5)과 달라야 한다 — 이게 이 표를 따로 두는 이유다
    expect(h('1F') / h('1X')).toBeLessThan(3);
  });

  it('V/A 는 바탕 코의 높이를 따른다', () => {
    expect(stitchHeight(opOf('1V'))).toBeCloseTo(stitchHeight(opOf('1X')), 5);
    expect(stitchHeight(opOf('1VF'))).toBeCloseTo(stitchHeight(opOf('1F')), 5);
  });

  it('윗변 폭은 늘림 수만큼 넓다 — 다음 단이 올라앉는 자리다', () => {
    expect(stitchTopWidth(opOf('1X'))).toBeCloseTo(1, 5);
    expect(stitchTopWidth(opOf('1V'))).toBeCloseTo(2, 5);
    expect(stitchTopWidth(opOf('1V^3'))).toBeCloseTo(3, 5);
    // 줄임은 두 구멍을 먹지만 위로는 한 코다
    expect(stitchTopWidth(opOf('1A'))).toBeCloseTo(1, 5);
  });
});

describe('코 그래프 (graph)', () => {
  it('부모-자식 세로 변의 길이는 자식의 키다', () => {
    const g = graphFromSources(['@, 6X', '6F']);
    const columns = g.edges.filter((e) => e.kind === 'column');
    const toRound2 = columns.filter((e) => g.nodes[e.b]!.roundIndex === 2);
    expect(toRound2.length).toBeGreaterThan(0);
    for (const e of toRound2) expect(e.rest).toBeCloseTo(2.0, 5); // 한길긴뜨기
  });

  it('원형이면 단이 고리로 닫힌다', () => {
    const g = graphFromSources(['@, 6X', '12X']);
    expect(g.closed).toBe(true);
    const round2 = g.nodes.filter((n) => n.roundIndex === 2);
    const rowsIn2 = g.edges.filter(
      (e) => e.kind === 'row' && g.nodes[e.a]!.roundIndex === 2 && g.nodes[e.b]!.roundIndex === 2,
    );
    // 고리가 닫히면 가로 변 수 = 코 수 (열려 있으면 코 수 - 1)
    expect(rowsIn2).toHaveLength(round2.length);
  });

  it('매직링은 1단 전부와 이어진다 — 아니면 외톨이로 날아간다', () => {
    const g = graphFromSources(['@, 6X', '6V']);
    const magic = g.nodes.findIndex((n) => n.kind === 'MAGIC');
    expect(magic).toBeGreaterThanOrEqual(0);
    const attached = g.edges.filter(
      (e) => e.kind === 'column' && (e.a === magic || e.b === magic),
    );
    expect(attached).toHaveLength(6);
  });

  it('마커·바늘비우기는 편물이 아니라 구슬이 되지 않는다', () => {
    const g = graphFromSources(['@, 6X', '(1X, pm, 1X)*3']);
    expect(g.nodes.some((n) => n.kind === 'MARKER')).toBe(false);
  });
});

describe('회전면 시드 (seed)', () => {
  it('반지름은 그 단의 둘레에서 나온다', () => {
    const g = graphFromSources(['@, 6X', '12X', '12X']);
    const stats = roundStats(g, axisymmetricSeed(g));
    // 12코 → 둘레 12 → 반지름 12/2π
    expect(stats[1]!.radius).toBeCloseTo(12 / (2 * Math.PI), 3);
    expect(stats[2]!.radius).toBeCloseTo(12 / (2 * Math.PI), 3);
  });

  it('늘림이 없으면 단 간격이 곧 코 높이 — 곧은 원통', () => {
    const g = graphFromSources(['@, 6X', '12X', '12X', '12X']);
    const stats = roundStats(g, axisymmetricSeed(g));
    expect(stats[2]!.z - stats[1]!.z).toBeCloseTo(1.0, 3);
    expect(stats[3]!.z - stats[2]!.z).toBeCloseTo(1.0, 3);
  });
});

describe('완화 솔버 (relax)', () => {
  it('같은 입력이면 같은 결과 — 난수를 쓰지 않는다', () => {
    const g = graphFromSources(['@, 6X', '6V', '(1X,1V)*6']);
    const a = relax(g);
    const b = relax(g);
    expect(a.positions).toEqual(b.positions);
  });

  it('매 단 6늘림은 평평한 원판이 된다', () => {
    const g = graphFromSources(['@, 6X', '6V', '(1X,1V)*6', '(2X,1V)*6', '(3X,1V)*6', '(4X,1V)*6']);
    const { positions, residual } = relax(g, { iterations: 500 });
    const stats = roundStats(g, positions);

    // 지름 11 짜리 원판인데 두께 방향으로는 1 도 안 된다
    expect(zSpread(positions)).toBeLessThan(1);
    expect(stats.at(-1)!.radius).toBeGreaterThan(5);
    // 단마다 반지름이 꾸준히 자란다 = 안으로 접히지 않았다
    for (let i = 1; i < stats.length; i++) {
      expect(stats[i]!.radius).toBeGreaterThan(stats[i - 1]!.radius);
    }
    expect(residual).toBeLessThan(0.02);
  });

  it('늘림 없이 이어 뜨면 곧은 원통이 된다', () => {
    const g = graphFromSources(['@, 6X', '6V', '12X', '12X', '12X', '12X', '12X', '12X']);
    const { positions, residual } = relax(g, { iterations: 500 });
    const stats = roundStats(g, positions).filter((s) => s.round >= 3);

    // 12코 원통의 반지름은 둘레/2π. 어느 단이나 같아야 한다.
    const expected = 12 / (2 * Math.PI);
    for (const s of stats) expect(s.radius).toBeCloseTo(expected, 1);
    // 단 간격은 짧은뜨기 키만큼
    for (let i = 1; i < stats.length; i++) {
      expect(stats[i]!.z - stats[i - 1]!.z).toBeCloseTo(1.0, 1);
    }
    expect(residual).toBeLessThan(0.02);
  });

  it('늘렸다 줄이면 공이 된다', () => {
    const g = graphFromSources(['@, 6X', '6V', '(1X,1V)*6', '18X', '18X', '(1X,1A)*6', '6A']);
    const stats = roundStats(g, relax(g, { iterations: 500 }).positions);

    const radii = stats.map((s) => s.radius);
    const widest = radii.indexOf(Math.max(...radii));
    // 가장 두꺼운 곳이 중간이고, 양 끝은 오므라들어 있다
    expect(widest).toBeGreaterThan(0);
    expect(widest).toBeLessThan(radii.length - 1);
    expect(radii.at(-1)!).toBeLessThan(Math.max(...radii) / 2);
    // 위아래로 부풀었다 — 원판이 아니다
    expect(stats.at(-1)!.z - stats[0]!.z).toBeGreaterThan(2);
  });

  it('평면에 들어갈 수 없을 만큼 늘리면 주름이 잡힌다', () => {
    const flat = graphFromSources(['@, 6X', '6V', '(1X,1V)*6', '(2X,1V)*6']);
    const ruffled = graphFromSources(['@, 6X', '6V', '12V', '24V']);

    const flatZ = zSpread(relax(flat, { iterations: 500 }).positions);
    const ruffledZ = zSpread(relax(ruffled, { iterations: 500 }).positions);

    // 같은 단 수인데 둘레가 훨씬 크다 — 남는 천이 물결이 되어 두께로 나타난다
    expect(ruffledZ).toBeGreaterThan(flatZ * 3);
  });

  it('줄임은 편물을 오므린다', () => {
    const g = graphFromSources(['@, 6X', '6V', '(1X,1V)*6', '18X', '(1X,1A)*6', '6A']);
    const stats = roundStats(g, relax(g, { iterations: 500 }).positions);
    for (let i = 4; i < stats.length; i++) {
      expect(stats[i]!.radius).toBeLessThan(stats[i - 1]!.radius);
    }
  });

  it('코가 없으면 빈 결과', () => {
    const g: StitchGraph = { nodes: [], edges: [], unit: 1, closed: false };
    expect(relax(g)).toEqual({ positions: [], residual: 0 });
  });
});
