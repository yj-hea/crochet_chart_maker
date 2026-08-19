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
 *  - **속 채우기(stuffing)** — 편물을 **면에 수직인 방향으로** 민다. 아미구루미에 솜을
 *    넣는 것과 같다. 방향이 중요하다 — 중심에서 바깥으로 균일하게 확대하면 코 길이
 *    제약이 정면으로 막아 아무 일도 일어나지 않는다. 면에 수직인 방향은 코 길이를
 *    (1차적으로) 바꾸지 않아서, 굽으며 생기는 장력이 압력과 균형을 이룰 때까지
 *    실제로 부푼다.
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
  /** 속 채우기 압력 (코 폭 단위/회). 0 이면 부풀리지 않는다 */
  stuffing?: number;
  /**
   * 굽힘 저항 세기 (0~1). 크면 뻣뻣하고, 작으면 흐물흐물하게 나온다.
   * 너무 키우면 원래 휘어 있어야 할 고리까지 펴 버려 단이 쪼그라든다.
   */
  stiffness?: number;
  /** 이보다 가까운 남남끼리 밀어낸다 (코 폭 단위). 0 이면 밀어내기를 끈다 */
  repulsion?: number;
  /** 초기 z 흔들림 — 완전한 평면에서 시작하면 어느 쪽으로도 부풀지 못한다 */
  jitter?: number;
  /**
   * 눌리는 데 대한 저항 (0~1). 늘어나는 데 대한 저항을 1 로 본 상대값.
   *
   * 코는 제 길이보다 **길어질 수 없지만** 짧아지는 건 훨씬 자유롭다 — 코가 기울면
   * 이웃끼리 얼마든지 가까워진다. 그래서 양쪽을 같게 걸면 안 된다. 반대로 0 으로 두면
   * 압력이 편물을 풍선처럼 무한정 부풀린다 (평평한 원판이 지름의 절반 높이까지 솟았다).
   */
  compression?: number;
}

export interface RelaxResult {
  /** 노드 인덱스와 같은 순서의 3D 좌표 (코 폭 단위) */
  positions: Vec3[];
  /** 마지막 반복에서 남은 변 길이 오차의 제곱평균 — 수렴 판단용 */
  residual: number;
}

/** 한 반복에서 코 길이를 되잡는 횟수 */
const LENGTH_PASSES = 3;

const DEFAULTS: Required<RelaxOptions> = {
  iterations: 200,
  stuffing: 0.02,
  stiffness: 0.02,
  repulsion: 0.7,
  jitter: 0.05,
  compression: 0.05,
};

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

  const surface = buildSurfaceFrame(graph, n);
  orientSurface(px, py, pz, surface, n);

  // 변으로 이어진 짝은 밀어내기에서 뺀다 — 이웃끼리는 붙어 있는 게 정상이다
  const linked = new Set<number>();
  for (const e of edges) linked.add(pairKey(e.a, e.b));

  let residual = 0;
  for (let iter = 0; iter < opts.iterations; iter++) {
    // 압력은 끝까지 유지한다. 도중에 끄면 남은 반복 동안 제약이 도로 오므려서, 결국
    // 솜을 안 넣은 것과 같은 모양이 된다. 계속 밀어야 "코가 허락하는 만큼 부푼" 자리에서
    // 균형이 잡힌다.
    if (opts.stuffing !== 0) applyStuffing(px, py, pz, surface, opts.stuffing);

    applyBending(px, py, pz, graph.chains, surface, opts.stiffness);
    // 코 길이는 여러 번 되잡는다. 한 번만 하면 압력이 코를 늘인 채로 남아, 부푼 게
    // 아니라 **늘어난** 모양이 된다. 압력은 한 번, 되잡기는 여러 번이라야
    // "코가 허락하는 만큼만 부푼" 형태가 나온다.
    for (let pass = 0; pass < LENGTH_PASSES; pass++) {
      residual = projectEdges(px, py, pz, edges, opts.compression);
    }

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
  compression: number,
): number {
  let sum = 0;
  for (const e of edges) {
    const dx = px[e.b]! - px[e.a]!;
    const dy = py[e.b]! - py[e.a]!;
    const dz = pz[e.b]! - pz[e.a]!;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-9) continue;

    // 늘어나는 쪽과 눌리는 쪽을 다르게 건다. 코는 제 길이보다 길어질 수 없지만,
    // 짧아지는 건 훨씬 자유롭다 — 코가 기울면 이웃끼리 얼마든지 가까워진다.
    // 양쪽을 같게 걸면 편물을 억지로 펴는 힘이 생겨, 평평해야 할 원판이 반복이 쌓일수록
    // 점점 휘었다.
    const error = len - e.rest;
    if (error > 0) sum += error * error;

    // 양 끝이 절반씩 움직인다 (질량이 같다고 본다)
    const k = (error / len) * 0.5 * (error < 0 ? compression : 1);
    px[e.a] += dx * k; py[e.a] += dy * k; pz[e.a] += dz * k;
    px[e.b] -= dx * k; py[e.b] -= dy * k; pz[e.b] -= dz * k;
  }
  return edges.length > 0 ? Math.sqrt(sum / edges.length) : 0;
}

/**
 * 곡률이 **이웃과 다를 때만** 잡아 주는 굽힘 저항.
 *
 * 곡률을 그냥 0 으로 미는 흔한 방식(가운데 코를 양옆의 중간으로 당기기)은 여기서 못 쓴다.
 * 닫힌 단은 곡률이 0 일 수 없는데도 계속 펴려 들어, 둘레를 정하는 가로 변과 영원히
 * 싸우다 단을 쪼그라뜨린다.
 *
 * 대신 **곡률의 변화**를 잡는다. 고르게 휜 원은 이웃끼리 곡률이 같아 힘이 거의 0 이고
 * (18각형이면 6%), 번갈아 꺾이는 톱니는 이웃과 정반대라 힘이 두 배로 실린다. 걸러야
 * 할 것만 30배 세게 걸린다.
 *
 * 각 길마다 곡률을 먼저 다 구한 뒤 한꺼번에 적용한다 — 하나씩 고쳐 가며 계산하면
 * 앞쪽에서 바뀐 값이 뒤쪽 곡률에 섞여 톱니를 옆으로 밀고 다닌다.
 */
function applyBending(
  px: Float64Array,
  py: Float64Array,
  pz: Float64Array,
  chains: readonly StitchGraph['chains'][number][],
  f: SurfaceFrame,
  stiffness: number,
): void {
  if (stiffness <= 0) return;
  const nrm: Vec = { x: 0, y: 0, z: 0 };
  for (const chain of chains) {
    const ids = chain.nodes;
    const n = ids.length;
    if (n < 3) continue;

    // 곡률 — 가운데 코가 양옆의 중간에서 얼마나 벗어나 있는가.
    // 열린 길의 양 끝은 이웃이 한쪽뿐이라 곡률이 없다.
    const cx = new Float64Array(n);
    const cy = new Float64Array(n);
    const cz = new Float64Array(n);
    const has = new Uint8Array(n);
    for (let k = 0; k < n; k++) {
      if (!chain.closed && (k === 0 || k === n - 1)) continue;
      const a = ids[(k - 1 + n) % n]!;
      const m = ids[k]!;
      const b = ids[(k + 1) % n]!;
      cx[k] = (px[a]! + px[b]!) / 2 - px[m]!;
      cy[k] = (py[a]! + py[b]!) / 2 - py[m]!;
      cz[k] = (pz[a]! + pz[b]!) / 2 - pz[m]!;
      has[k] = 1;
    }

    for (let k = 0; k < n; k++) {
      if (!has[k]) continue;
      // 양옆의 곡률 평균 — 한쪽만 있으면 그쪽만 쓴다
      const prev = (k - 1 + n) % n;
      const next = (k + 1) % n;
      let sx = 0, sy = 0, sz = 0, count = 0;
      if (has[prev]) { sx += cx[prev]!; sy += cy[prev]!; sz += cz[prev]!; count++; }
      if (has[next]) { sx += cx[next]!; sy += cy[next]!; sz += cz[next]!; count++; }
      if (count === 0) continue;
      sx /= count; sy /= count; sz /= count;

      const a = ids[prev]!;
      const m = ids[k]!;
      const b = ids[next]!;

      // 이웃과 다른 만큼을, **면에 수직인 방향으로만** 되돌린다.
      //
      // 면 안에서 도는 곡률은 편물이 접힌 게 아니다 — 단이 축을 감고 도는 것뿐이라
      // 그건 코 수가 정하는 정상이다. 그것까지 펴려 들면 고리를 조금씩 조이게 되고,
      // 반복이 쌓이면서 원판이 점점 휘어 버린다 (실측: 반복 500 에서 z폭 1.18,
      // 2000 에서 2.05). 편물이 진짜로 접히는 건 면에 수직인 방향이다.
      if (!surfaceNormal(px, py, pz, f, m, nrm)) continue;
      const along = (cx[k]! - sx) * nrm.x + (cy[k]! - sy) * nrm.y + (cz[k]! - sz) * nrm.z;
      const dx = nrm.x * along * stiffness;
      const dy = nrm.y * along * stiffness;
      const dz = nrm.z * along * stiffness;
      px[m] += dx; py[m] += dy; pz[m] += dz;
      px[a] -= dx / 2; py[a] -= dy / 2; pz[a] -= dz / 2;
      px[b] -= dx / 2; py[b] -= dy / 2; pz[b] -= dz / 2;
    }
  }
}

/**
 * 편물의 면 방향 — 어느 쪽이 바깥인가.
 *
 * 코마다 가로(단을 따라)와 세로(기둥을 따라) 두 방향을 이웃에서 얻고, 그 외적이 면에
 * 수직인 방향이다. 단의 진행 방향과 단이 쌓이는 방향이 도안 전체에서 일관되므로 이
 * 외적도 전체에서 같은 쪽을 가리킨다 — 어느 코는 안쪽, 어느 코는 바깥쪽을 가리키는 일이
 * 없다. 전체가 어느 쪽인지만 마지막에 한 번 정하면 된다.
 */
interface SurfaceFrame {
  /** 단을 따라 앞·뒤 코. 방향이 도안 전체에서 일관되어야 한다 */
  rowPrev: Int32Array;
  rowNext: Int32Array;
  parents: number[][];
  children: number[][];
  /** 외적이 안쪽을 가리키면 -1 */
  sign: number;
}

function buildSurfaceFrame(graph: StitchGraph, n: number): SurfaceFrame {
  // 가로는 **사슬**에서 가져온다. 변 목록에서 이웃을 모으면 두 이웃의 순서가 변이 만들어진
  // 순서대로라 코마다 접선이 앞뒤로 뒤집히고, 그러면 면 방향이 무작위로 안팎을 오간다.
  const rowPrev = new Int32Array(n).fill(-1);
  const rowNext = new Int32Array(n).fill(-1);
  for (const chain of graph.chains) {
    if (chain.kind !== 'row') continue;
    const ids = chain.nodes;
    const len = ids.length;
    for (let k = 0; k < len; k++) {
      const i = ids[k]!;
      if (k > 0) rowPrev[i] = ids[k - 1]!;
      else if (chain.closed) rowPrev[i] = ids[len - 1]!;
      if (k < len - 1) rowNext[i] = ids[k + 1]!;
      else if (chain.closed) rowNext[i] = ids[0]!;
    }
  }

  // 세로는 **실제 부모·자식**에서 가져온다. 기둥 사슬은 한 부모에 자식 하나씩만 이어
  // 붙이므로, `V` 가 만든 두 코 중 하나는 부모와 이어지고 하나는 끊긴다. 그러면 둘이
  // 서로 다른 면 방향을 잡아 하나는 더 밀리고 하나는 덜 밀려 지그재그가 살아난다.
  const parents: number[][] = Array.from({ length: n }, () => []);
  const children: number[][] = Array.from({ length: n }, () => []);
  for (const e of graph.edges) {
    if (e.kind !== 'column') continue;
    parents[e.b]!.push(e.a);
    children[e.a]!.push(e.b);
  }

  return { rowPrev, rowNext, parents, children, sign: 1 };
}

interface Vec {
  x: number;
  y: number;
  z: number;
}

/** 여러 코의 평균 위치 */
function centroidOf(
  px: Float64Array, py: Float64Array, pz: Float64Array, ids: readonly number[], out: Vec,
): boolean {
  if (ids.length === 0) return false;
  let x = 0, y = 0, z = 0;
  for (const i of ids) { x += px[i]!; y += py[i]!; z += pz[i]!; }
  out.x = x / ids.length; out.y = y / ids.length; out.z = z / ids.length;
  return true;
}

const A: Vec = { x: 0, y: 0, z: 0 };
const B: Vec = { x: 0, y: 0, z: 0 };

/**
 * 코 하나의 면 방향. 방향을 정할 수 없으면 false.
 *
 * 가로는 양옆 이웃을 잇는 방향, 세로는 부모들에서 자식들로 가는 방향이다. 한쪽이
 * 없으면 자기 자리를 대신 쓴다 (첫 단, 마지막 단, 띠의 양 끝).
 */
function surfaceNormal(
  px: Float64Array, py: Float64Array, pz: Float64Array,
  f: SurfaceFrame, i: number, out: Vec,
): boolean {
  const before = f.rowPrev[i]! >= 0 ? f.rowPrev[i]! : i;
  const after = f.rowNext[i]! >= 0 ? f.rowNext[i]! : i;
  if (before === after) return false;
  const tx = px[after]! - px[before]!;
  const ty = py[after]! - py[before]!;
  const tz = pz[after]! - pz[before]!;

  const hasUp = centroidOf(px, py, pz, f.children[i]!, A);
  const hasDown = centroidOf(px, py, pz, f.parents[i]!, B);
  if (!hasUp && !hasDown) return false;
  const ux = (hasUp ? A.x : px[i]!) - (hasDown ? B.x : px[i]!);
  const uy = (hasUp ? A.y : py[i]!) - (hasDown ? B.y : py[i]!);
  const uz = (hasUp ? A.z : pz[i]!) - (hasDown ? B.z : pz[i]!);

  const x = ty * uz - tz * uy;
  const y = tz * ux - tx * uz;
  const z = tx * uy - ty * ux;
  const len = Math.sqrt(x * x + y * y + z * z);
  if (len < 1e-9) return false;
  out.x = x / len; out.y = y / len; out.z = z / len;
  return true;
}

/**
 * 전체 면 방향이 안쪽을 향하는지 바깥쪽을 향하는지 한 번만 정한다.
 * 무게중심에서 바깥으로 향하는 쪽이 이긴다.
 */
function orientSurface(
  px: Float64Array, py: Float64Array, pz: Float64Array, f: SurfaceFrame, n: number,
): void {
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < n; i++) { cx += px[i]!; cy += py[i]!; cz += pz[i]!; }
  cx /= n; cy /= n; cz /= n;

  const nrm: Vec = { x: 0, y: 0, z: 0 };
  let vote = 0;
  for (let i = 0; i < n; i++) {
    if (!surfaceNormal(px, py, pz, f, i, nrm)) continue;
    vote += nrm.x * (px[i]! - cx) + nrm.y * (py[i]! - cy) + nrm.z * (pz[i]! - cz);
  }
  f.sign = vote < 0 ? -1 : 1;
}

/**
 * 솜의 압력 — 편물을 면에 수직인 바깥 방향으로 민다.
 *
 * 중심에서 균일하게 확대하는 방식으로는 안 된다. 그건 코 길이 제약이 정면으로 막는
 * 방향이라, 밀자마자 그대로 되돌아온다 (실측: 공의 높이가 압력을 5배로 올려도 0.7%
 * 밖에 안 변했다). 면에 수직인 방향은 코 사이 거리를 1차적으로 바꾸지 않아서, 굽으며
 * 생기는 장력이 압력과 맞설 때까지 실제로 부푼다.
 *
 * 둘레에 여유가 없는 형태(팽팽한 원판)는 밀어도 거의 안 부푼다 — 부풀려면 어딘가는
 * 늘어나야 하는데 그럴 수 없기 때문이다. 저절로 그렇게 된다.
 */
function applyStuffing(
  px: Float64Array,
  py: Float64Array,
  pz: Float64Array,
  f: SurfaceFrame,
  pressure: number,
): void {
  const n = px.length;
  const nrm: Vec = { x: 0, y: 0, z: 0 };
  const amount = pressure * f.sign;
  for (let i = 0; i < n; i++) {
    if (!surfaceNormal(px, py, pz, f, i, nrm)) continue;
    px[i] += nrm.x * amount;
    py[i] += nrm.y * amount;
    pz[i] += nrm.z * amount;
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
