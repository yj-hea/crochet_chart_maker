/**
 * 푼 좌표를 three.js 장면으로 바꾼다.
 *
 * 코 하나가 육면체 비즈 하나다. 어느 방향으로 세울지는 이웃이 정해 준다 —
 * **위**는 부모에서 자신으로 오는 방향(코가 자란 방향), **옆**은 같은 단 이웃을 잇는
 * 방향, 그 둘의 외적이 편물의 **면 방향**이다. 이 세 축으로 비즈를 눕히면 편물의
 * 결이 그대로 드러난다.
 *
 * 코가 수백~수천 개라 InstancedMesh 로 한 번에 그린다.
 */

import * as THREE from 'three';
import type { PositionedStitch } from '$lib/layout/types';
import type { Preview3D } from './index';
import { FABRIC_THICKNESS } from './aspect';

export interface StitchMesh {
  object: THREE.Object3D;
  /** 원점에서 가장 먼 코까지의 거리 — 카메라를 맞추는 데 쓴다 */
  radius: number;
  dispose: () => void;
}

/** 실 색을 지정하지 않은 코의 기본 색 — 표백하지 않은 면사 느낌 */
const DEFAULT_YARN = 0xd8c7a8;

/**
 * 비즈를 제 크기의 몇 배로 그릴 것인가.
 *
 * 1.0 이면 이웃과 정확히 맞닿는데, 편물은 곡면이라 딱 맞는 육면체들은 모서리에서
 * 서로 파고들어 어느 게 어느 코인지 알아볼 수 없게 된다. 조금 줄이면 코 사이에
 * 실금이 생겨 한 코 한 코가 눈에 들어온다.
 */
const BEAD_FILL = 0.88;

export function buildStitchMesh(
  solved: Preview3D,
  stitches: readonly PositionedStitch[],
  wireframe: boolean,
): StitchMesh {
  const { graph, positions } = solved;
  const group = new THREE.Group();
  const disposables: { dispose: () => void }[] = [];

  const frames = buildFrames(graph, positions);

  const geometry = new THREE.BoxGeometry(1, 1, 1);
  // `vertexColors` 를 켜면 안 된다 — 그건 지오메트리의 정점 색 속성을 찾으라는 뜻이라
  // BoxGeometry 처럼 색 속성이 없는 도형은 통째로 검게 나온다. InstancedMesh 의
  // `setColorAt` 색은 그런 설정 없이도 알아서 실린다.
  const material = new THREE.MeshLambertMaterial();
  disposables.push(geometry, material);

  const drawn = graph.nodes
    .map((n, i) => ({ n, i }))
    .filter(({ n }) => n.kind !== 'MAGIC' && n.width > 0);

  const mesh = new THREE.InstancedMesh(geometry, material, drawn.length);
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();

  drawn.forEach(({ n, i }, slot) => {
    const frame = frames[i]!;
    const p = positions[i]!;

    // 좌표가 가리키는 곳은 코의 윗변 가운데이므로, 비즈의 한가운데는 키의 절반만큼 아래다
    matrix.makeBasis(
      frame.side.clone().multiplyScalar(n.width * BEAD_FILL),
      frame.up.clone().multiplyScalar(n.height * BEAD_FILL),
      frame.normal.clone().multiplyScalar(FABRIC_THICKNESS),
    );
    matrix.setPosition(
      p.x - frame.up.x * (n.height / 2),
      p.y - frame.up.y * (n.height / 2),
      p.z - frame.up.z * (n.height / 2),
    );
    mesh.setMatrixAt(slot, matrix);
    mesh.setColorAt(slot, color.set(stitches[n.stitchIndex]?.op.color ?? DEFAULT_YARN));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  group.add(mesh);

  // 뼈대 모드에서는 비즈를 반투명하게 낮춰 실 연결이 들여다보이게 한다.
  // 실선을 비즈 위에 얹어 봐야 육면체 속에 파묻혀 하나도 안 보인다.
  if (wireframe) {
    material.transparent = true;
    material.opacity = 0.25;
    material.depthWrite = false;
    const wire = buildWireframe(graph, positions);
    group.add(wire.object);
    disposables.push(...wire.disposables);
  }

  let radius = 1;
  for (const p of positions) radius = Math.max(radius, Math.hypot(p.x, p.y, p.z));

  return {
    object: group,
    radius,
    dispose: () => {
      mesh.dispose();
      for (const d of disposables) d.dispose();
    },
  };
}

interface Frame {
  /** 코가 자란 방향 (부모 → 자신) */
  up: THREE.Vector3;
  /** 같은 단에서 옆으로 가는 방향 */
  side: THREE.Vector3;
  /** 편물의 면 방향 */
  normal: THREE.Vector3;
}

/**
 * 코마다 세 축을 정한다.
 *
 * 축은 이웃에서 얻는다. 다만 실제 편물은 완벽하지 않아 위·옆이 정확히 직각은 아니므로,
 * 면 방향을 먼저 외적으로 구하고 그걸 기준으로 위를 다시 직각으로 세운다
 * (그람-슈미트). 이렇게 해야 비즈가 찌그러지지 않는다.
 */
function buildFrames(graph: Preview3D['graph'], positions: Preview3D['positions']): Frame[] {
  const n = graph.nodes.length;
  /** 부모에서 나를 향하는 방향 — 이 코가 실제로 자란 방향 */
  const grown: THREE.Vector3[] = Array.from({ length: n }, () => new THREE.Vector3());
  /** 나에게서 자식을 향하는 방향 — 부모가 없는 1단이 쓸 대타 */
  const toward: THREE.Vector3[] = Array.from({ length: n }, () => new THREE.Vector3());
  const side: THREE.Vector3[] = Array.from({ length: n }, () => new THREE.Vector3());

  const at = (i: number) => new THREE.Vector3(positions[i]!.x, positions[i]!.y, positions[i]!.z);

  for (const e of graph.edges) {
    const d = at(e.b).sub(at(e.a));
    if (e.kind === 'column') {
      grown[e.b]!.add(d);
      toward[e.a]!.add(d);
    } else if (e.kind === 'row') {
      side[e.a]!.add(d);
      side[e.b]!.add(d);
    }
  }

  return graph.nodes.map((_, i) => {
    // 자기가 자란 방향이 우선이다. 둘을 섞으면 위아래 단의 방향이 평균 나서
    // 비즈가 엉뚱하게 기운다.
    const u = grown[i]!.lengthSq() > 1e-12 ? grown[i]! : toward[i]!;
    const s = side[i]!;
    // 이웃이 없어 방향을 못 정한 코는 바깥쪽·위쪽으로 둔다
    if (u.lengthSq() < 1e-12) u.set(0, 0, 1);
    if (s.lengthSq() < 1e-12) s.set(1, 0, 0);
    u.normalize();
    s.normalize();

    const normal = new THREE.Vector3().crossVectors(s, u);
    if (normal.lengthSq() < 1e-12) {
      // 위와 옆이 나란하면 면을 정할 수 없다 — 아무 직각 방향이나 쓴다
      normal.set(0, 0, 1).cross(u);
      if (normal.lengthSq() < 1e-12) normal.set(1, 0, 0);
    }
    normal.normalize();
    // 면 방향을 기준으로 위를 다시 직각으로 세운다
    const orthoUp = new THREE.Vector3().crossVectors(normal, s).normalize();
    return { up: orthoUp, side: s, normal };
  });
}

/** 구슬을 꿴 실 — 어느 코가 어느 코에 걸렸는지 보여 준다 */
function buildWireframe(
  graph: Preview3D['graph'],
  positions: Preview3D['positions'],
): { object: THREE.Object3D; disposables: { dispose: () => void }[] } {
  const points: number[] = [];
  for (const e of graph.edges) {
    // 굽힘 저항은 실이 아니라 계산 장치라 그리지 않는다
    if (e.kind === 'stiff') continue;
    const a = positions[e.a]!;
    const b = positions[e.b]!;
    points.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  const material = new THREE.LineBasicMaterial({ color: 0x3355aa, transparent: true, opacity: 0.5 });
  return { object: new THREE.LineSegments(geometry, material), disposables: [geometry, material] };
}
