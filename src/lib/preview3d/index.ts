/**
 * 3D 미리보기 — 도안 레이아웃에서 편물의 입체 형태를 얻는다.
 *
 * 코를 구슬로, 코 사이 연결을 실로 보고(`graph.ts`), 회전면 가정으로 출발 위치를
 * 잡은 뒤(`seed.ts`), 변 길이 제약을 반복 투영해 푼다(`relax.ts`).
 */

export { buildStitchGraph } from './graph';
export type { StitchGraph, StitchNode, StitchEdge, EdgeKind, GraphOptions, Vec3 } from './graph';
export { relax } from './relax';
export type { RelaxOptions, RelaxResult } from './relax';
export { axisymmetricSeed } from './seed';
export { stitchHeight, stitchWidth, stitchTops, FABRIC_THICKNESS } from './aspect';

import type { PositionedStitch } from '$lib/layout/types';
import { buildStitchGraph } from './graph';
import type { GraphOptions, StitchGraph, Vec3 } from './graph';
import { relax } from './relax';
import type { RelaxOptions } from './relax';

export interface Preview3D {
  graph: StitchGraph;
  positions: Vec3[];
  /** 남은 변 길이 오차의 제곱평균. 크면 도안이 물리적으로 무리한 형태다 */
  residual: number;
}

/** 레이아웃 결과 → 3D 형태. 한 번에 하는 편의 함수. */
export function buildPreview3D(
  stitches: readonly PositionedStitch[],
  options: RelaxOptions & GraphOptions = {},
): Preview3D {
  const graph = buildStitchGraph(stitches, { closed: options.closed });
  const { positions, residual } = relax(graph, options);
  return { graph, positions, residual };
}
