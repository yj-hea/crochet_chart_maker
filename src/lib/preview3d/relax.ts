/**
 * 코 그래프를 3D 좌표로 푸는 완화 솔버.
 *
 * 변 길이 제약을 한 번에 정확히 푸는 건 비선형 연립방정식이라 어렵다. 대신
 * **Gauss-Seidel 투영**을 쓴다 — 변 하나씩 돌면서 "이 변이 목표 길이가 되도록"
 * 양 끝을 조금씩 당기는 걸 수백 번 반복하면 전체가 맞아 들어간다. 물리 엔진의
 * PBD(Position-Based Dynamics) 와 같은 방식이고, 외부 의존성이 필요 없다.
 *
 * 제약만으로는 답이 하나로 정해지지 않는다는 게 이 문제의 함정이다. 같은 변 길이를
 * 만족하는 배치가 여럿 있다 — 평평한 원판, 위로 부푼 그릇, 아래로 뒤집힌 그릇.
 * 그래서 두 가지를 더 넣는다:
 *
 *  - **속 채우기(stuffing)** — 모든 코를 중심에서 바깥으로 약하게 민다. 아미구루미에
 *    솜을 넣는 것과 같아서, 부풀 수 있는 형태는 부풀고 원판처럼 둘레가 모자란 형태는
 *    그대로 평평하게 남는다. 초반에 강하고 후반에 0 으로 줄여, 모양을 고른 뒤에는
 *    제약이 이기게 한다.
 *  - **밀어내기(repulsion)** — 변으로 이어지지 않은 코끼리 너무 가까워지면 밀어낸다.
 *    없으면 편물이 자기 자신을 뚫고 지나간다.
 *
 * 결정적이다 — 같은 입력이면 항상 같은 결과가 나온다. `Math.random` 대신 인덱스
 * 해시로 초기 흔들림을 준다.
 */

import type { StitchGraph, Vec3 } from './graph';
import { axisymmetricSeed } from './seed';

export interface RelaxOptions {
  /** 반복 횟수. 200 이면 수백 코짜리 도안이 대체로 수렴한다 */
  iterations?: number;
  /** 속 채우기 세기 (코 폭 단위/회). 0 이면 평면 해를 그대로 둔다 */
  stuffing?: number;
  /** 굽힘 저항 세기 (0~1). 크면 뻣뻣하고 각지게, 작으면 흐물흐물하게 나온다 */
  stiffness?: number;
  /** 이보다 가까운 남남끼리 밀어낸다 (코 폭 단위). 0 이면 밀어내기를 끈다 */
  repulsion?: number;
  /** 초기 z 흔들림 — 완전한 평면에서 시작하면 어느 쪽으로도 부풀지 못한다 */
  jitter?: number;
}

export interface RelaxResult {
  /** 노드 인덱스와 같은 순서의 3D 좌표 (코 폭 단위) */
  positions: Vec3[];
  /** 마지막 반복에서 남은 변 길이 오차의 제곱평균 — 수렴 판단용 */
  residual: number;
}

const DEFAULTS: Required<RelaxOptions> = {
  iterations: 200,
  stuffing: 0.02,
  stiffness: 0.08,
  repulsion: 0.7,
  jitter: 0.05,
};

/** 속 채우기를 하는 구간 — 전체 반복 중 앞쪽 이 비율까지만 */
const STUFFING_PHASE = 0.5;

/** 인덱스에서 [-1, 1) 을 뽑는 결정적 해시 — 재현 가능한 초기 흔들림용 */
function hashNoise(i: number): number {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return 2 * (x - Math.floor(x)) - 1;
}

export function relax(graph: StitchGraph, options: RelaxOptions = {}): RelaxResult {
  const opts = { ...DEFAULTS, ...options };
  const { nodes, edges } = graph;
  const n = nodes.length;
  if (n === 0) return { positions: [], residual: 0 };

  // 원형이면 회전면 가정으로 푼 3D 배치에서 시작한다 (`seed.ts`) — 답에 훨씬 가까워
  // 솔버가 엉뚱한 곳에 주저앉지 않는다. 왕복뜨기는 단이 띠라 회전면이 아니므로 2D
  // 레이아웃을 그대로 z=0 평면에 올린다.
  const start = graph.closed ? axisymmetricSeed(graph) : nodes.map((nd) => nd.seed);
  const px = new Float64Array(n);
  const py = new Float64Array(n);
  const pz = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    px[i] = start[i]!.x;
    py[i] = start[i]!.y;
    pz[i] = start[i]!.z + hashNoise(i) * opts.jitter;
  }

  // 변으로 이어진 짝은 밀어내기에서 뺀다 — 이웃끼리는 붙어 있는 게 정상이다
  const linked = new Set<number>();
  for (const e of edges) linked.add(pairKey(e.a, e.b));

  let residual = 0;
  for (let iter = 0; iter < opts.iterations; iter++) {
    // 속 채우기는 **앞쪽 절반에서만** 하고 완전히 끈다. 끝까지 조금씩이라도 밀면
    // 제약과 계속 밀당해서 수렴하지 못한다. 모양은 초반에 갈리고, 나머지 절반은
    // 그 모양에서 변 길이를 정확히 맞추는 데 쓴다.
    const phase = iter / opts.iterations;
    if (phase < STUFFING_PHASE) {
      applyStuffing(px, py, pz, n, opts.stuffing * (1 - phase / STUFFING_PHASE));
    }

    residual = projectEdges(px, py, pz, edges, opts.stiffness);

    if (opts.repulsion > 0) applyRepulsion(px, py, pz, n, opts.repulsion, linked);
  }

  recenter(px, py, pz, n);

  const positions: Vec3[] = new Array(n);
  for (let i = 0; i < n; i++) positions[i] = { x: px[i]!, y: py[i]!, z: pz[i]! };
  return { positions, residual };
}

/** 정렬된 두 인덱스를 하나의 수로 — 32비트 안이면 Set 조회가 문자열보다 훨씬 싸다 */
function pairKey(a: number, b: number): number {
  return a < b ? a * 65536 + b : b * 65536 + a;
}

/** 변 하나하나를 목표 길이로 당긴다. 돌려주는 값은 남은 오차의 제곱평균. */
function projectEdges(
  px: Float64Array,
  py: Float64Array,
  pz: Float64Array,
  edges: readonly StitchGraph['edges'][number][],
  stiffness: number,
): number {
  let sum = 0;
  let count = 0;
  for (const e of edges) {
    const dx = px[e.b]! - px[e.a]!;
    const dy = py[e.b]! - py[e.a]!;
    const dz = pz[e.b]! - pz[e.a]!;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-9) continue;

    // 굽힘 저항은 하한이다 — 목표보다 멀면 그대로 둔다. 등식으로 걸면 곡면이 못 나온다.
    if (e.minOnly && len >= e.rest) continue;

    const error = len - e.rest;
    if (e.kind !== 'stiff') {
      sum += error * error;
      count++;
    }

    const w = e.kind === 'stiff' ? stiffness : 1;
    // 양 끝이 절반씩 움직인다 (질량이 같다고 본다)
    const k = (error / len) * 0.5 * w;
    px[e.a] += dx * k; py[e.a] += dy * k; pz[e.a] += dz * k;
    px[e.b] -= dx * k; py[e.b] -= dy * k; pz[e.b] -= dz * k;
  }
  return count > 0 ? Math.sqrt(sum / count) : 0;
}

/**
 * 무게중심에서 바깥으로 미는 힘 — 부풀 수 있는 형태만 부푼다.
 *
 * 미는 양이 **중심에서 떨어진 거리에 비례**해야 한다. 거리와 무관하게 일정하게 밀면
 * 중심에 있는 코(매직링)가 방향도 없이 아무 쪽으로나 한 걸음씩 밀려나 결국 축 방향으로
 * 튀어나가고, 원통은 가운데를 기준으로 방사되어 바나나처럼 휜다. 거리에 비례시키면
 * 전체를 고르게 부풀리는 것과 같아서, 둘레에 여유가 있는 형태만 부풀고 원판처럼
 * 여유가 없는 형태는 변 길이에 막혀 그대로 평평하게 남는다.
 */
function applyStuffing(
  px: Float64Array,
  py: Float64Array,
  pz: Float64Array,
  n: number,
  amount: number,
): void {
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < n; i++) { cx += px[i]!; cy += py[i]!; cz += pz[i]!; }
  cx /= n; cy /= n; cz /= n;

  for (let i = 0; i < n; i++) {
    px[i] = cx + (px[i]! - cx) * (1 + amount);
    py[i] = cy + (py[i]! - cy) * (1 + amount);
    pz[i] = cz + (pz[i]! - cz) * (1 + amount);
  }
}

/**
 * 남남끼리 겹치지 않게 밀어낸다.
 *
 * 전부 대 전부로 보면 코 수의 제곱이라 큰 도안에서 느려진다. 격자 해시로 가까운
 * 칸만 훑어 사실상 선형으로 만든다.
 */
function applyRepulsion(
  px: Float64Array,
  py: Float64Array,
  pz: Float64Array,
  n: number,
  radius: number,
  linked: ReadonlySet<number>,
): void {
  const cell = radius;
  const buckets = new Map<string, number[]>();
  const keyOf = (i: number) =>
    `${Math.floor(px[i]! / cell)},${Math.floor(py[i]! / cell)},${Math.floor(pz[i]! / cell)}`;

  for (let i = 0; i < n; i++) {
    const k = keyOf(i);
    const b = buckets.get(k);
    if (b) b.push(i);
    else buckets.set(k, [i]);
  }

  for (let i = 0; i < n; i++) {
    const gx = Math.floor(px[i]! / cell);
    const gy = Math.floor(py[i]! / cell);
    const gz = Math.floor(pz[i]! / cell);
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        for (let oz = -1; oz <= 1; oz++) {
          const b = buckets.get(`${gx + ox},${gy + oy},${gz + oz}`);
          if (!b) continue;
          for (const j of b) {
            if (j <= i) continue;
            if (linked.has(pairKey(i, j))) continue;
            const dx = px[j]! - px[i]!;
            const dy = py[j]! - py[i]!;
            const dz = pz[j]! - pz[i]!;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 >= radius * radius || d2 < 1e-12) continue;
            const d = Math.sqrt(d2);
            const k = ((d - radius) / d) * 0.5;
            px[i] += dx * k; py[i] += dy * k; pz[i] += dz * k;
            px[j] -= dx * k; py[j] -= dy * k; pz[j] -= dz * k;
          }
        }
      }
    }
  }
}

/** 무게중심을 원점으로 — 완화 도중 전체가 떠내려가는 걸 막는다 */
function recenter(px: Float64Array, py: Float64Array, pz: Float64Array, n: number): void {
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < n; i++) { cx += px[i]!; cy += py[i]!; cz += pz[i]!; }
  cx /= n; cy /= n; cz /= n;
  for (let i = 0; i < n; i++) { px[i] -= cx; py[i] -= cy; pz[i] -= cz; }
}
