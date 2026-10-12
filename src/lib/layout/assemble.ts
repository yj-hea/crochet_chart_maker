/**
 * 작품 한 장으로 조립하기 — 이어받기를 **끝까지** 따라간다.
 *
 * `compose.ts` 는 "몸통 + 그 몸통이 바로 이어 붙인 조각들" 한 겹을 합친다. 그런데
 * 조각은 또 자기 조각을 가질 수 있다:
 *
 *     배  ←(이어받기)  몸통  ←(조각 잇기)  다리 A · 다리 B
 *
 * 한 겹만 보면 배 도안에 몸통까지만 그려지고 **다리가 사라진다**. 여기서는 조각을
 * 레이아웃할 때 그 조각의 시작 방식도 다시 풀어, 아래로 달린 것을 전부 끌고 온다.
 *
 * 되돌아오는 관계(`hasCycle` 로 막는 것)가 데이터에 남아 있어도 여기서 멈춰야 하므로
 * 지나온 조각을 기억하며 걷는다.
 */

import type { PieceStart } from '$lib/model/pieces';
import type { LayoutResult } from './types';
import { composeWithPieces, type PieceLayout } from './compose';

/** 어디까지 끌고 올지 */
export type AssembleDepth =
  /** 바로 이어 붙인 조각까지만 */
  | 'direct'
  /** 조각의 조각까지 전부 */
  | 'all';

/** 조립에 필요한 조각 하나의 정보 */
export interface AssembleNode {
  name: string;
  /** 이 조각 **자신**의 레이아웃 (아래에 달린 조각은 빼고) */
  layout: LayoutResult;
  /** 이 조각이 어떻게 시작하는지 */
  start?: PieceStart;
}

/**
 * `id` 조각을 뿌리로 아래에 달린 것을 합친 레이아웃.
 *
 * 찾지 못한 조각은 건너뛴다 — 지워진 도안 하나 때문에 전체가 안 그려지면 안 된다.
 */
export function assemble(
  id: string,
  lookup: (id: string) => AssembleNode | undefined,
  depth: AssembleDepth = 'all',
  seen: ReadonlySet<string> = new Set(),
): LayoutResult | null {
  const node = lookup(id);
  if (!node) return null;
  if (!node.start || seen.has(id)) return node.layout;

  const start = node.start;
  const ids = start.kind === 'join' ? start.pieces : [start.piece];
  const below = new Set([...seen, id]);

  const pieces: PieceLayout[] = [];
  for (const childId of ids) {
    // 이미 지나온 조각을 다시 끌어오면 같은 그림이 겹쳐 쌓인다 — 거기서 끊는다
    if (below.has(childId)) continue;
    const child = lookup(childId);
    if (!child) continue;
    // 'all' 이면 조각의 조각까지 — 그 결과를 그대로 조각의 레이아웃으로 쓴다
    const layout = depth === 'all'
      ? assemble(childId, lookup, depth, below)
      : child.layout;
    if (!layout) continue;
    pieces.push({
      name: child.name,
      layout,
      ...(start.kind === 'from'
        ? { range: { at: start.at ?? 1, count: start.stitches ?? Number.MAX_SAFE_INTEGER } }
        : {}),
    });
  }

  return composeWithPieces(node.layout, pieces, {
    chain: start.kind === 'join' ? start.chain : 0,
  });
}

/**
 * 작품의 **뿌리** 조각들 — 아무도 이어받지 않는 도안.
 *
 * 조립도(작품 전체 보기)가 어디서부터 그려야 하는지 정하는 데 쓴다. 보통 몸통·배처럼
 * 가장 나중에 뜨는 조각 하나지만, 받침·뚜껑처럼 따로 뜨는 덩어리가 여럿일 수 있다.
 */
export function rootPieces(
  ids: ReadonlyArray<string>,
  startOf: (id: string) => PieceStart | undefined,
): string[] {
  const used = new Set<string>();
  for (const id of ids) {
    const start = startOf(id);
    if (!start) continue;
    for (const child of start.kind === 'join' ? start.pieces : [start.piece]) used.add(child);
  }
  return ids.filter((id) => !used.has(id));
}
