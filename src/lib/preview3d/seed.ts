/**
 * 완화 솔버의 출발 위치를 만든다.
 *
 * 출발 위치가 결과를 좌우한다. 제약을 만족하는 배치가 여럿이라, 솔버는 **출발점에서
 * 가장 가까운 답**으로 굴러간다. 2D 도안 좌표를 그대로 z=0 에 올려 쓰면 원판은 잘
 * 나오지만 원통이 엉킨다 — 도안은 모든 단을 한 평면의 동심원으로 그리는데, 원통은
 * 그 고리들을 축 방향으로 쌓아 올려야 해서 변형이 너무 크고, 솔버가 도중에 아무
 * 곳에나 주저앉는다.
 *
 * 그래서 답을 미리 반쯤 알려준다. 도안이 **회전 대칭**이라고 가정하면 3D 형태를 손으로
 * 풀 수 있다:
 *
 *  - 단의 반지름은 그 단의 둘레에서 나온다 — `R = 둘레 / 2π`
 *  - 단 사이의 축 방향 높이는 피타고라스로 나온다 — `dz = √(코높이² − ΔR²)`
 *  - 한 단 안에서 코의 각도는 **자기 부모를 따라간다**
 *
 * 반지름이 코 높이만큼 늘면 `dz = 0` 이라 평평한 원판, 전혀 안 늘면 `dz = 코높이` 라
 * 곧은 원통, 그 사이면 원뿔·공이 된다. 늘어나는 양이 코 높이를 넘으면 평면에
 * 들어가지 못하는데(주름), 이때는 `dz = 0` 으로 두고 남는 둘레를 완화 솔버가 물결로
 * 풀게 맡긴다.
 */

import type { StitchGraph, Vec3 } from './graph';

/**
 * 회전면 가정으로 푼 출발 위치.
 *
 * 각도를 **부모에서 물려받는 것**이 중요하다. 단 안에서 그냥 균등하게 나눠 놓으면,
 * 아래위 단의 코 수가 다를 때 코가 제 부모에서 옆으로 크게 벗어난다. 12코 위의 18코
 * 단은 각도 간격이 30° 와 20° 로 달라서 최대 15° — 반지름 2 에서 0.5 만큼 — 어긋나고,
 * 그러면 목표 1.00 인 세로 변이 1.17 이 된다. 솔버가 그 17% 를 밀어내느라 편물 전체를
 * 뒤트는데, 특히 `V` 의 두 코가 부모를 축으로 하나는 위로 하나는 아래로 돌아가 버린다.
 *
 * 부모 각도를 따라가면 세로 변이 처음부터 맞고, 솔버는 단 안의 간격을 고르게 펴는
 * 작고 얌전한 일만 남는다.
 */
export function axisymmetricSeed(graph: StitchGraph): Vec3[] {
  const { nodes } = graph;
  const out: Vec3[] = nodes.map(() => ({ x: 0, y: 0, z: 0 }));
  /** 코마다 배정된 각도 (라디안, 단 안에서 증가하도록 펼친 값) */
  const angles = new Float64Array(nodes.length);

  const parentsOf = new Map<number, number[]>();
  for (const e of graph.edges) {
    if (e.kind !== 'column') continue;
    const list = parentsOf.get(e.b);
    if (list) list.push(e.a);
    else parentsOf.set(e.b, [e.a]);
  }

  const byRound = new Map<number, number[]>();
  const magics: number[] = [];
  nodes.forEach((n, i) => {
    if (n.kind === 'MAGIC') { magics.push(i); return; }
    const list = byRound.get(n.roundIndex);
    if (list) list.push(i);
    else byRound.set(n.roundIndex, [i]);
  });

  const roundNumbers = [...byRound.keys()].sort((a, b) => a - b);
  let z = 0;
  let prevRadius = 0;
  let firstRadius = 0;
  let firstHeight = 1;
  let firstZ = 0;

  roundNumbers.forEach((round, order) => {
    const idxs = byRound.get(round)!;
    const circumference = idxs.reduce((s, i) => s + nodes[i]!.width, 0);
    const radius = circumference / (2 * Math.PI);

    // 이 단이 부모 단에서 얼마나 올라섰는가. 코 높이는 단 안에서 섞일 수 있어
    // 중앙값을 쓴다 — 한두 코가 유난히 긴 경우에 끌려가지 않는다.
    const heights = idxs.map((i) => nodes[i]!.height).sort((a, b) => a - b);
    const height = heights[heights.length >> 1] ?? 1;
    if (order === 0) {
      firstRadius = radius;
      firstHeight = height;
    } else {
      const dr = radius - prevRadius;
      // 반지름이 코 높이보다 더 벌어지면 평면에 못 들어간다 — 주름이므로 높이는 0
      z += Math.sqrt(Math.max(0, height * height - dr * dr));
    }

    assignAngles(idxs, order === 0, circumference, nodes, parentsOf, angles);
    for (const i of idxs) {
      out[i] = { x: radius * Math.cos(angles[i]!), y: radius * Math.sin(angles[i]!), z };
    }

    if (order === 0) firstZ = z;
    prevRadius = radius;
  });

  // 매직링은 1단이 모여드는 점 — 1단 원의 중심축에서, 1단 코 하나만큼 떨어진 곳.
  // 높이를 1 로 박아 두면 안 된다. 짧은뜨기 6코 원은 반지름이 마침 코 키와 같아서
  // 매직링이 1단과 같은 평면에 놓여야 하는데, 1 로 재면 0.3 만큼 아래로 처져
  // 평평해야 할 원판이 처음부터 휜 채로 출발한다.
  const drop = Math.sqrt(Math.max(0, firstHeight * firstHeight - firstRadius * firstRadius));
  for (const i of magics) out[i] = { x: 0, y: 0, z: firstZ - drop };

  return out;
}

/**
 * 한 단의 코마다 각도를 정한다.
 *
 * 첫 단은 기댈 부모가 없으니 폭에 비례해 고르게 나눈다. 그 뒤로는 부모 각도를 그대로
 * 물려받되, 한 부모에서 여러 코가 나오면(`V`) 부모를 가운데 두고 좌우로 갈라 세운다.
 */
function assignAngles(
  idxs: readonly number[],
  isFirstRound: boolean,
  circumference: number,
  nodes: StitchGraph['nodes'],
  parentsOf: ReadonlyMap<number, number[]>,
  angles: Float64Array,
): void {
  if (circumference <= 0) return;

  if (isFirstRound) {
    let walked = 0;
    for (const i of idxs) {
      const w = nodes[i]!.width;
      angles[i] = (2 * Math.PI * (walked + w / 2)) / circumference;
      walked += w;
    }
    return;
  }

  // 같은 부모에서 나온 코들은 줄에서 이어져 있다 — 묶어서 한꺼번에 벌려 세운다
  let k = 0;
  while (k < idxs.length) {
    const base = parentAngle(idxs[k]!, parentsOf, angles);
    let end = k + 1;
    while (
      end < idxs.length &&
      parentAngle(idxs[end]!, parentsOf, angles) === base
    ) end++;

    const group = end - k;
    for (let g = 0; g < group; g++) {
      const i = idxs[k + g]!;
      // 이 단에서 코 하나가 차지하는 각도만큼씩 벌린다
      const pitch = (2 * Math.PI * nodes[i]!.width) / circumference;
      angles[i] = base + (g - (group - 1) / 2) * pitch;
    }
    k = end;
  }

  // 줄을 따라 각도가 계속 커지도록 펼친다 — 한 바퀴를 넘어가는 지점에서 부모 각도가
  // 0 으로 되감기면 뒤 코들이 앞으로 튀어 순서가 뒤집힌다
  for (let j = 1; j < idxs.length; j++) {
    const prev = angles[idxs[j - 1]!]!;
    while (angles[idxs[j]!]! < prev) angles[idxs[j]!] += 2 * Math.PI;
  }

  evenOutGaps(idxs, angles);
}

/**
 * 코 간격을 고르게 편다. 부모에게서 물려받은 회전 위치는 유지한 채로.
 *
 * 부모 각도를 그대로 쓰면 **불균등이 단마다 쌓인다**. 늘림이 끼어들 때마다 그 부모의
 * 몫만 둘로 갈라지고 나머지는 부모 간격을 그대로 쓰기 때문이다. 6단쯤 가면 코 간격이
 * 1.5°~20° 로 벌어진다 (고르면 10°). 그 상태로는 가로 변이 목표의 0.15~2 배가 되고,
 * 솔버가 그걸 밀어내다 편물을 통째로 휘게 만든다.
 *
 * 이웃의 가운데로 조금씩 당기면 간격이 고르게 펴진다. 전체가 어느 쪽으로 돌아 있는지는
 * 이 연산이 바꾸지 않으므로, 부모 위에 선다는 성질은 그대로 남는다.
 */
function evenOutGaps(idxs: readonly number[], angles: Float64Array): void {
  const n = idxs.length;
  if (n < 3) return;

  // 고리이므로 **끝과 처음 사이도 이웃이다**. 양 끝을 고정하고 가운데만 펴면 남는 몫이
  // 전부 그 이음매로 몰려, 마지막 코와 첫 코가 겹치다시피 붙는다.
  const TWO_PI = 2 * Math.PI;
  for (let pass = 0; pass < EVEN_OUT_PASSES; pass++) {
    for (let j = 0; j < n; j++) {
      const before = j === 0 ? angles[idxs[n - 1]!]! - TWO_PI : angles[idxs[j - 1]!]!;
      const after = j === n - 1 ? angles[idxs[0]!]! + TWO_PI : angles[idxs[j + 1]!]!;
      angles[idxs[j]!] += ((before + after) / 2 - angles[idxs[j]!]!) * EVEN_OUT_RATE;
    }
  }
}

/**
 * 간격을 펴는 횟수와 세기.
 *
 * 양 끝은 고정하고 가운데만 당기므로, 많이 돌릴수록 완전히 고른 간격에 가까워진다.
 * 부모 정렬을 조금 남겨 두는 편이 세로 변에 유리해서 끝까지 밀지는 않는다.
 */
const EVEN_OUT_PASSES = 40;
const EVEN_OUT_RATE = 0.5;

/**
 * 부모의 각도. 부모가 둘이면(`A` 줄임) 가운데를 쓴다.
 * 한 바퀴 경계에서 두 부모가 0 과 2π 로 갈리면 평균이 반대쪽으로 튀므로, 가까운 쪽으로
 * 끌어당긴 뒤 평균한다.
 */
function parentAngle(
  node: number,
  parentsOf: ReadonlyMap<number, number[]>,
  angles: Float64Array,
): number {
  const parents = parentsOf.get(node);
  if (!parents || parents.length === 0) return angles[node] ?? 0;
  const first = angles[parents[0]!]!;
  let sum = first;
  for (let i = 1; i < parents.length; i++) {
    let a = angles[parents[i]!]!;
    while (a - first > Math.PI) a -= 2 * Math.PI;
    while (first - a > Math.PI) a += 2 * Math.PI;
    sum += a;
  }
  return sum / parents.length;
}
