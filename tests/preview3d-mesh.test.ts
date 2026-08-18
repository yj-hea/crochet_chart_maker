import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { parseRound } from '../src/lib/crafts/crochet/parser';
import { expand } from '../src/lib/expand/expander';
import { layoutCircular } from '../src/lib/crafts/crochet/circular';
import { buildPreview3D } from '../src/lib/preview3d';
import { buildStitchMesh } from '../src/lib/preview3d/mesh';

function layoutOf(sources: string[]) {
  const rounds = sources.map((src, i) => {
    const r = parseRound(i + 1, src);
    if (!r.body) throw new Error(`parse failed: ${JSON.stringify(r.errors)}`);
    return expand(r.body, i + 1);
  });
  return layoutCircular(rounds).stitches;
}

describe('3D 메시 (mesh)', () => {
  const stitches = layoutOf(['@, 6X', '6V', '(1X:navy,1V:navy)*6', '18X']);
  const solved = buildPreview3D(stitches, { iterations: 200 });

  it('매직링을 뺀 구슬마다 비즈 하나', () => {
    const mesh = buildStitchMesh(solved, stitches, false);
    const instanced = mesh.object.children.find(
      (c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh,
    );
    const expected = solved.graph.nodes.filter((n) => n.kind !== 'MAGIC').length;
    expect(instanced?.count).toBe(expected);
    mesh.dispose();
  });

  it('비즈의 세 축이 서로 직각이고 코 비율만큼 크다', () => {
    const mesh = buildStitchMesh(solved, stitches, false);
    const instanced = mesh.object.children.find(
      (c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh,
    )!;

    const m = new THREE.Matrix4();
    const side = new THREE.Vector3();
    const up = new THREE.Vector3();
    const normal = new THREE.Vector3();
    for (let i = 0; i < instanced.count; i++) {
      instanced.getMatrixAt(i, m);
      m.extractBasis(side, up, normal);
      // 찌그러지지 않았다 — 그람-슈미트로 직교화한 결과
      expect(side.dot(up)).toBeCloseTo(0, 5);
      expect(up.dot(normal)).toBeCloseTo(0, 5);
      expect(side.dot(normal)).toBeCloseTo(0, 5);
      // 두께는 어느 코나 같고, 폭·높이는 0 이 아니다
      expect(normal.length()).toBeCloseTo(0.5, 5);
      expect(side.length()).toBeGreaterThan(0.5);
      expect(up.length()).toBeGreaterThan(0.2);
    }
    mesh.dispose();
  });

  it('실 색을 지정한 코는 그 색으로 칠해진다', () => {
    const mesh = buildStitchMesh(solved, stitches, false);
    const instanced = mesh.object.children.find(
      (c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh,
    )!;
    // 이 프로젝트의 navy 는 CSS navy 가 아니라 팔레트 값이다
    const navy = new THREE.Color('#0d47a1');
    const colors = instanced.instanceColor!.array;
    let matched = 0;
    for (let i = 0; i < instanced.count; i++) {
      if (Math.abs(colors[i * 3]! - navy.r) < 1e-6 && Math.abs(colors[i * 3 + 2]! - navy.b) < 1e-6) {
        matched++;
      }
    }
    // 3단은 짧은뜨기 6 + 늘림 6(각각 두 코) = 비즈 18개
    expect(matched).toBe(18);
    mesh.dispose();
  });

  it('뼈대는 실에 해당하는 변만 그린다 — 굽힘 저항은 계산 장치다', () => {
    const mesh = buildStitchMesh(solved, stitches, true);
    const lines = mesh.object.children.find(
      (c): c is THREE.LineSegments => c instanceof THREE.LineSegments,
    );
    const yarnEdges = solved.graph.edges.filter((e) => e.kind !== 'stiff').length;
    expect(lines?.geometry.getAttribute('position').count).toBe(yarnEdges * 2);
    mesh.dispose();
  });

  it('카메라를 맞출 반지름을 알려준다', () => {
    const mesh = buildStitchMesh(solved, stitches, false);
    expect(mesh.radius).toBeGreaterThan(1);
    mesh.dispose();
  });
});
