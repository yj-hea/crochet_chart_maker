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
 *
 * 반지름이 코 높이만큼 늘면 `dz = 0` 이라 평평한 원판, 전혀 안 늘면 `dz = 코높이` 라
 * 곧은 원통, 그 사이면 원뿔·공이 된다. 늘어나는 양이 코 높이를 넘으면 평면에
 * 들어가지 못하는데(주름), 이때는 `dz = 0` 으로 두고 남는 둘레를 완화 솔버가 물결로
 * 풀게 맡긴다.
 *
 * 회전 대칭이 아닌 도안(한쪽만 늘리는 등)에서도 나쁘지 않은 출발점이다 — 어차피
 * 솔버가 이어받아 비대칭을 잡는다.
 */

import type { StitchGraph, Vec3 } from './graph';

/**
 * 회전면 가정으로 푼 출발 위치.
 *
 * 단 번호 순서대로 쌓고, 한 단 안에서는 각 코가 차지하는 **폭에 비례해** 각도를
 * 나눠 준다 (V 는 두 칸, 보통 코는 한 칸). 매직링은 1단 원의 중심축 아래에 둔다.
 */
export function axisymmetricSeed(graph: StitchGraph): Vec3[] {
  const { nodes } = graph;
  const out: Vec3[] = nodes.map(() => ({ x: 0, y: 0, z: 0 }));

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
    } else {
      const dr = radius - prevRadius;
      // 반지름이 코 높이보다 더 벌어지면 평면에 못 들어간다 — 주름이므로 높이는 0
      z += Math.sqrt(Math.max(0, height * height - dr * dr));
    }

    // 각 코에 자기 폭만큼의 각도를 준다
    let walked = 0;
    for (const i of idxs) {
      const w = nodes[i]!.width;
      const angle = circumference > 0 ? (2 * Math.PI * (walked + w / 2)) / circumference : 0;
      walked += w;
      out[i] = { x: radius * Math.cos(angle), y: radius * Math.sin(angle), z };
    }

    if (order === 0) firstZ = z;
    prevRadius = radius;
  });

  // 매직링은 1단이 모여드는 점 — 1단 원의 중심에서 코 높이만큼 아래
  const drop = Math.sqrt(Math.max(0, 1 - firstRadius * firstRadius));
  for (const i of magics) out[i] = { x: 0, y: 0, z: firstZ - drop };

  return out;
}
