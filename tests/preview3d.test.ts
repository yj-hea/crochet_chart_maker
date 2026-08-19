import { describe, expect, it } from 'vitest';
import { parseRound } from '../src/lib/crafts/crochet/parser';
import { expand } from '../src/lib/expand/expander';
import { layoutCircular } from '../src/lib/crafts/crochet/circular';
import { buildStitchGraph } from '../src/lib/preview3d/graph';
import type { StitchGraph, Vec3 } from '../src/lib/preview3d/graph';
import { relax } from '../src/lib/preview3d/relax';
import { stitchHeight, stitchTops, stitchWidth } from '../src/lib/preview3d/aspect';
import { axisymmetricSeed } from '../src/lib/preview3d/seed';

function graphFromSources(sources: string[], closed = true): StitchGraph {
  const rounds = sources.map((src, i) => {
    const r = parseRound(i + 1, src);
    if (!r.body) throw new Error(`parse failed: ${JSON.stringify(r.errors)}`);
    return expand(r.body, i + 1);
  });
  return buildStitchGraph(layoutCircular(rounds).stitches, { closed });
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
    const sc = h('1X');
    expect(h('1T') / sc).toBeCloseTo(1.5, 5);   // 긴뜨기
    expect(h('1F') / sc).toBeCloseTo(2.0, 5);   // 한길긴뜨기
    expect(h('1E') / sc).toBeCloseTo(2.7, 5);   // 두길긴뜨기
    expect(h('1dtr') / sc).toBeCloseTo(3.4, 5); // 세길긴뜨기

    // 기호 규격(1:2:3:4:5)과 달라야 한다 — 이게 이 표를 따로 두는 이유다
    expect(h('1F') / sc).toBeLessThan(3);
  });

  it('절대 높이는 늘림 경험칙에 맞춘다 — 6늘림 원판이 평평해지는 값', () => {
    // 단마다 반지름이 6/2π 씩 늘고 그게 곧 짧은뜨기 키여야 원판이 평평하다
    expect(stitchHeight(opOf('1X'))).toBeCloseTo(6 / (2 * Math.PI), 5);
    // 한길긴뜨기의 정석은 12 늘림
    expect(stitchHeight(opOf('1F'))).toBeCloseTo(12 / (2 * Math.PI), 5);
  });

  it('V/A 는 바탕 코의 높이를 따른다', () => {
    expect(stitchHeight(opOf('1V'))).toBeCloseTo(stitchHeight(opOf('1X')), 5);
    expect(stitchHeight(opOf('1VF'))).toBeCloseTo(stitchHeight(opOf('1F')), 5);
  });

  it('V 는 코 여러 개, A 는 한 개 — 폭은 어느 쪽이나 코 하나만큼', () => {
    expect(stitchTops(opOf('1X'))).toBe(1);
    expect(stitchTops(opOf('1V'))).toBe(2);
    expect(stitchTops(opOf('1V^3'))).toBe(3);
    // 줄임은 두 구멍을 먹지만 위로는 한 코다
    expect(stitchTops(opOf('1A'))).toBe(1);
    // 폭은 코 하나 기준이다 — V 는 구슬 두 개로 풀리므로 여기서 곱하지 않는다
    expect(stitchWidth(opOf('1V'))).toBeCloseTo(1, 5);
    expect(stitchWidth(opOf('1X'))).toBeCloseTo(1, 5);
  });
});

describe('코 그래프 (graph)', () => {
  it('부모-자식 세로 변의 길이는 자식의 키다', () => {
    const g = graphFromSources(['@, 6X', '6F']);
    const columns = g.edges.filter((e) => e.kind === 'column');
    const toRound2 = columns.filter((e) => g.nodes[e.b]!.roundIndex === 2);
    expect(toRound2.length).toBeGreaterThan(0);
    // 한길긴뜨기 — 12 늘림이 평평해지는 키
    for (const e of toRound2) expect(e.rest).toBeCloseTo(12 / (2 * Math.PI), 5);
  });

  it('V 는 구슬 두 개 — 만든 코마다 하나씩', () => {
    const plain = graphFromSources(['@, 6X', '12X']);
    const inc = graphFromSources(['@, 6X', '6V']);
    // 둘 다 2단이 12코다. 표기는 6개지만 구슬은 12개여야 한다.
    const count = (g: StitchGraph) => g.nodes.filter((n) => n.roundIndex === 2).length;
    expect(count(plain)).toBe(12);
    expect(count(inc)).toBe(12);
  });

  it('V 가 만든 두 코는 서로 가로로 이어진다 — 편물은 상하좌우로 붙어 있다', () => {
    const g = graphFromSources(['@, 6X', '6V']);
    const rows = g.edges.filter(
      (e) => e.kind === 'row' && g.nodes[e.a]!.roundIndex === 2 && g.nodes[e.b]!.roundIndex === 2,
    );
    // 12코가 고리로 닫히면 가로 변도 12개
    expect(rows).toHaveLength(12);
    // 그중 하나는 같은 V 에서 갈라져 나온 짝이다
    const sameStitch = rows.filter(
      (e) => g.nodes[e.a]!.stitchIndex === g.nodes[e.b]!.stitchIndex,
    );
    expect(sameStitch).toHaveLength(6);
  });

  it('V 위의 자식들은 서로 다른 윗변에 걸린다 — 한 점에 몰리지 않는다', () => {
    const g = graphFromSources(['@, 6X', '6V', '12X']);
    const round2 = g.nodes
      .map((n, i) => ({ n, i }))
      .filter(({ n }) => n.roundIndex === 2);
    // 2단 구슬 12개가 각각 3단 자식을 정확히 하나씩 받는다
    for (const { i } of round2) {
      const children = g.edges.filter(
        (e) => e.kind === 'column' && e.a === i && g.nodes[e.b]!.roundIndex === 3,
      );
      expect(children).toHaveLength(1);
    }
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

  it('평면이라고 알려주면 단이 띠로 열린다', () => {
    // 좌표만으로는 알 수 없다 — 평면 레이아웃도 `angle` 을 0 으로 채워 둔다
    const g = graphFromSources(['@, 6X', '12X'], false);
    expect(g.closed).toBe(false);
    const round2 = g.nodes.filter((n) => n.roundIndex === 2);
    const rowsIn2 = g.edges.filter(
      (e) => e.kind === 'row' && g.nodes[e.a]!.roundIndex === 2 && g.nodes[e.b]!.roundIndex === 2,
    );
    expect(rowsIn2).toHaveLength(round2.length - 1);
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
    const g = graphFromSources(['@, 6X', '6V', '12X']);
    const stats = roundStats(g, axisymmetricSeed(g));
    // 12코 → 둘레 12 → 반지름 12/2π
    expect(stats[1]!.radius).toBeCloseTo(12 / (2 * Math.PI), 3);
    expect(stats[2]!.radius).toBeCloseTo(12 / (2 * Math.PI), 3);
  });

  it('코는 제 부모 위에 선다 — 세로 변이 처음부터 코 키에 가깝다', () => {
    const g = graphFromSources(['@, 6X', '6V', '(1X,1V)*6', '(1X,1A)*6', '6A']);
    const seed = axisymmetricSeed(g);
    const errors = g.edges
      .filter((e) => e.kind === 'column')
      .map((e) => {
        const a = seed[e.a]!;
        const b = seed[e.b]!;
        return Math.abs(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) - e.rest) / e.rest;
      });
    // 부모를 보지 않고 단 안에서 균등하게만 나누면 여기가 17% 까지 벌어진다
    expect(Math.max(...errors)).toBeLessThan(0.1);
  });

  it('늘림이 없으면 단 간격이 곧 코 높이 — 곧은 원통', () => {
    const g = graphFromSources(['@, 6X', '6V', '12X', '12X']);
    const stats = roundStats(g, axisymmetricSeed(g));
    const h = stitchHeight(expand(parseRound(1, '1X').body!, 1).ops[0]!);
    expect(stats[2]!.z - stats[1]!.z).toBeCloseTo(h, 3);
    expect(stats[3]!.z - stats[2]!.z).toBeCloseTo(h, 3);
    // 반지름은 그대로다 — 늘어난 키가 통째로 높이로 간다
    expect(stats[3]!.radius).toBeCloseTo(stats[1]!.radius, 3);
  });
});

describe('완화 솔버 (relax)', () => {
  it('같은 입력이면 같은 결과 — 난수를 쓰지 않는다', () => {
    const g = graphFromSources(['@, 6X', '6V', '(1X,1V)*6']);
    const a = relax(g);
    const b = relax(g);
    expect(a.positions).toEqual(b.positions);
  });

  it('한 단 안에서 늘림과 보통 코가 같은 각도로 기운다', () => {
    // 좌우로 이어져 있으니 늘림 자리만 따로 눕거나 설 수 없다. 이 코들만 느슨하게
    // 뜨는 상황은 가정하지 않는다.
    const g = graphFromSources(['@, 6X', '6V', '(1X,1V)*6', '(1X,1A)*6', '6A']);
    const { positions } = relax(g, { iterations: 500 });


    const parentOf = new Map<number, number>();
    for (const e of g.edges) {
      if (e.kind === 'column' && !parentOf.has(e.b)) parentOf.set(e.b, e.a);
    }
    /** 부모에서 이 코까지 올라간 각도 — 편물이 얼마나 서 있는가 */
    const tilt = (i: number): number => {
      const p = positions[i]!;
      const q = positions[parentOf.get(i)!]!;
      const dr = Math.hypot(p.x, p.y) - Math.hypot(q.x, q.y);
      return (Math.atan2(p.z - q.z, dr) * 180) / Math.PI;
    };

    const inRound3 = g.nodes
      .map((n, i) => ({ n, i }))
      .filter(({ n, i }) => n.roundIndex === 3 && parentOf.has(i));
    const plain = inRound3.filter(({ n }) => n.kind === 'SC').map(({ i }) => tilt(i));
    const inc = inRound3.filter(({ n }) => n.kind === 'INC').map(({ i }) => tilt(i));
    expect(plain.length).toBe(6);
    expect(inc.length).toBe(12);

    // 늘림 두 코가 부모를 축 삼아 하나는 위로 하나는 아래로 돌아가면 여기서 벌어진다
    const spread = (a: number[]) => Math.max(...a) - Math.min(...a);
    expect(spread(inc)).toBeLessThan(5);
    // 늘림의 평균 각도도 보통 코와 크게 다르지 않다. 조금 눕는 건 실제로 그렇다 —
    // 한 구멍에서 갈라져 나오느라 옆으로 벌어진 만큼 덜 올라간다.
    const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    expect(Math.abs(mean(inc) - mean(plain))).toBeLessThan(8);
  });

  it('6코 뒤 6늘림은 평평하고 조금 넓어진 원 — 위로 서지 않는다', () => {
    const g = graphFromSources(['@, 6X', '6V']);
    // 솜은 끄고 본다. 아직 닫히지 않은 두 단짜리 조각은 부풀 속이 없어서, 압력을 주면
    // 부푸는 게 아니라 통째로 말려 올라간다.
    const stats = roundStats(g, relax(g, { iterations: 500, stuffing: 0 }).positions);
    // 둘레가 6 → 12 로 늘어난 만큼 반지름도 그만큼 커진다
    expect(stats[0]!.radius).toBeCloseTo(6 / (2 * Math.PI), 1);
    expect(stats[1]!.radius / stats[0]!.radius).toBeCloseTo(2, 1);
    // 늘어날 자리가 충분해 축 방향으로는 서지 않는다
    expect(Math.abs(stats[1]!.z - stats[0]!.z)).toBeLessThan(0.2);
    expect(zSpread(relax(g, { iterations: 500, stuffing: 0 }).positions)).toBeLessThan(0.2);
  });

  it('늘린 다음 그대로 뜨면 늘 곳이 없어 위로 선다', () => {
    const g = graphFromSources(['@, 6X', '6V', '12X', '12X', '12X']);
    const stats = roundStats(g, relax(g, { iterations: 500, stuffing: 0 }).positions);
    // 12코 단들은 둘레가 같으니 반지름도 같다
    for (let i = 3; i < stats.length; i++) {
      expect(stats[i]!.radius).toBeCloseTo(stats[2]!.radius, 1);
    }
    // 그 반지름은 둘레에서 나온 값에 가깝다
    expect(stats.at(-1)!.radius).toBeCloseTo(12 / (2 * Math.PI), 0);
    // 늘어난 키가 고스란히 높이로 간다
    for (let i = 3; i < stats.length; i++) {
      expect(stats[i]!.z - stats[i - 1]!.z).toBeCloseTo(1.0, 1);
    }
  });

  it('줄이면 올라가는 각도가 낮아진다 — 오므라들며 평평해진다', () => {
    const g = graphFromSources(['@, 6X', '6V', '(1X,1V)*6', '18X', '(1X,1A)*6', '6A']);
    const stats = roundStats(g, relax(g, { iterations: 500 }).positions);
    const rise = (i: number) => stats[i]!.z - stats[i - 1]!.z;
    const shrink = (i: number) => stats[i - 1]!.radius - stats[i]!.radius;
    // 줄임 단(5, 6)은 반지름이 크게 줄면서 높이는 조금밖에 안 오른다
    for (const i of [4, 5]) {
      expect(shrink(i)).toBeGreaterThan(0.5);
      expect(rise(i)).toBeLessThan(shrink(i));
    }
    // 늘림 없이 그대로 뜬 단(3)보다 훨씬 덜 오른다
    expect(rise(5)).toBeLessThan(rise(3) / 2);
  });

  it('매 단 6늘림은 평평한 원판이 된다', () => {
    const g = graphFromSources(['@, 6X', '6V', '(1X,1V)*6', '(2X,1V)*6', '(3X,1V)*6', '(4X,1V)*6']);
    // 솜을 넣으면 원판도 조금 부푼다 — 여기서 보는 건 편물 자체의 평평함이다
    const { positions, residual } = relax(g, { iterations: 500, stuffing: 0 });
    const stats = roundStats(g, positions);

    // 지름 11 짜리 원판인데 두께 방향으로는 0.2 도 안 된다
    expect(zSpread(positions)).toBeLessThan(0.2);
    expect(stats.at(-1)!.radius).toBeGreaterThan(5);
    // 단마다 반지름이 꾸준히 자란다 = 안으로 접히지 않았다
    for (let i = 1; i < stats.length; i++) {
      expect(stats[i]!.radius).toBeGreaterThan(stats[i - 1]!.radius);
    }
    expect(residual).toBeLessThan(0.01);
  });

  it('늘림 없이 이어 뜨면 곧은 원통이 된다', () => {
    const g = graphFromSources(['@, 6X', '6V', '12X', '12X', '12X', '12X', '12X', '12X']);
    const { positions, residual } = relax(g, { iterations: 500, stuffing: 0 });
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
    const stats = roundStats(g, relax(g, { iterations: 500, stuffing: 0 }).positions);

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

    const flatZ = zSpread(relax(flat, { iterations: 500, stuffing: 0 }).positions);
    const ruffledZ = zSpread(relax(ruffled, { iterations: 500, stuffing: 0 }).positions);

    // 같은 단 수인데 둘레가 훨씬 크다 — 남는 천이 물결이 되어 두께로 나타난다
    expect(ruffledZ).toBeGreaterThan(flatZ * 3);
  });

  it('줄임은 편물을 오므린다', () => {
    const g = graphFromSources(['@, 6X', '6V', '(1X,1V)*6', '18X', '(1X,1A)*6', '6A']);
    const stats = roundStats(g, relax(g, { iterations: 500, stuffing: 0 }).positions);
    for (let i = 4; i < stats.length; i++) {
      expect(stats[i]!.radius).toBeLessThan(stats[i - 1]!.radius);
    }
  });

  it('솜을 채우면 코가 허락하는 만큼 부푼다', () => {
    const g = graphFromSources(['@, 6X', '6V', '(1X,1V)*6', '18X', '18X', '(1X,1A)*6', '6A']);
    const height = (stuffing: number) => {
      const zs = relax(g, { iterations: 500, stuffing }).positions.map((p) => p.z);
      return Math.max(...zs) - Math.min(...zs);
    };
    // 안에서 바깥으로 밀리니 통통해진다
    expect(height(0.02)).toBeGreaterThan(height(0) * 1.1);
  });

  it('부풀려도 코 길이는 지켜진다 — 늘어난 게 아니라 부푼 것이다', () => {
    const g = graphFromSources(['@, 6X', '6V', '(1X,1V)*6', '18X', '18X', '(1X,1A)*6', '6A']);
    expect(relax(g, { iterations: 500, stuffing: 0.02 }).residual).toBeLessThan(0.04);
  });

  it('둘레에 여유가 없으면 밀어도 거의 안 부푼다', () => {
    // 12코 원통은 둘레가 코 수로 못박혀 있어 옆으로 벌어질 자리가 없다
    const g = graphFromSources(['@, 6X', '6V', '12X', '12X', '12X', '12X']);
    const width = (stuffing: number) => {
      const pos = relax(g, { iterations: 500, stuffing }).positions;
      return Math.max(...pos.map((p) => Math.hypot(p.x, p.y)));
    };
    expect(width(0.02)).toBeLessThan(width(0) * 1.1);
  });

  it('코가 없으면 빈 결과', () => {
    const g: StitchGraph = { nodes: [], edges: [], chains: [], unit: 1, closed: false };
    expect(relax(g)).toEqual({ positions: [], residual: 0 });
  });
});
