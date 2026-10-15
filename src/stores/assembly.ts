/**
 * 조립도 — 작품 **전체**를 한 장에 그리는 화면.
 *
 * 도안 탭 하나는 조각 하나라서, 어느 탭을 열어도 그 조각에서 내려다본 그림만 보인다.
 * 조립도는 반대로 **아무도 이어받지 않는 조각**(뿌리)부터 아래로 전부 펼쳐,
 * 작품이 어떻게 생겼는지 한 장으로 보여 준다.
 *
 * 글(단 입력)은 없다 — 조각의 자리만 손으로 다듬는 화면이다. 다듬은 값은 조각
 * (`Tab.assemblyAt`)에 쌓이므로 작품과 함께 저장되고 Dropbox 로도 따라간다.
 */

import { writable, derived } from 'svelte/store';
import { workspace } from './tabs';
import {
  showGrid, showConnections, colorMode, emptyColor, mainColor, symbolColor,
} from './mode';
import { assembleSheet, rootPieces, type AssembleNode } from '$lib/layout/assemble';
import { layoutOfTab } from './rendered';
import { getCraft } from '$lib/crafts';
import type { LayoutResult } from '$lib/layout/types';

/** 조립도 탭이 열려 있는지 — 화면 상태라 저장하지 않는다 */
export const assemblyOpen = writable(false);

/** 작품에 조각이 둘 이상 있고 이어지는 관계가 있을 때만 쓸모가 있다 */
export const assemblyAvailable = derived(workspace, ($ws) =>
  $ws.tabs.length > 1 && $ws.tabs.some((t) => t.startsFrom));

/**
 * 작품 전체를 조립한 레이아웃.
 *
 * 조각마다 **그 도안의 표시 옵션**으로 푼다 (`layoutOfTab`) — 표시 옵션은 탭 단위
 * 값이므로, 조립도가 자기 기준을 들이밀면 조각이 저 혼자 뒤집혀 보인다.
 */
export const assemblyLayout = derived(
  workspace,
  ($ws): LayoutResult | null => {
    const lookup = (id: string): AssembleNode | undefined => {
      const tab = $ws.tabs.find((t) => t.id === id);
      if (!tab) return undefined;
      const layout = layoutOfTab(tab);
      if (!layout) return undefined;
      return {
        name: tab.name,
        start: tab.startsFrom,
        ...(tab.assemblyAt ? { offset: tab.assemblyAt } : {}),
        layout,
      };
    };
    const roots = rootPieces($ws.tabs.map((t) => t.id), (id) =>
      $ws.tabs.find((t) => t.id === id)?.startsFrom);
    return assembleSheet(roots, lookup, 'all');
  },
);

export interface AssemblySheet {
  svg: string;
  width: number;
  height: number;
  /** 집어 옮길 수 있는 조각들 (도안 좌표) */
  pieces: Array<{ id?: string; name: string; bounds: LayoutResult['bounds'] }>;
}

/**
 * 조립도 SVG.
 *
 * 크래프트 렌더러는 조각마다 다를 수 있는데 한 장에 섞어 그릴 수는 없으므로,
 * **뿌리 조각의 기법**으로 그린다 (작품 하나가 코바늘·대바늘을 섞는 일은 드물다).
 */
export const assemblySheet = derived(
  [assemblyLayout, workspace, showGrid, showConnections, colorMode, emptyColor, mainColor, symbolColor],
  ([$layout, $ws, $showGrid, $showConnections,
    $colorMode, $emptyColor, $mainColor, $symbolColor]): AssemblySheet | null => {
    if (!$layout) return null;
    const roots = rootPieces($ws.tabs.map((t) => t.id), (id) =>
      $ws.tabs.find((t) => t.id === id)?.startsFrom);
    const craftId = $ws.tabs.find((t) => t.id === roots[0])?.craft ?? 'crochet';
    return {
      svg: getCraft(craftId).render($layout, {
        showGrid: $showGrid,
        showConnections: $showConnections,
        colorMode: $colorMode,
        emptyColor: $emptyColor,
        mainColor: $mainColor,
        symbolColor: $symbolColor,
      }),
      width: $layout.bounds.width,
      height: $layout.bounds.height,
      pieces: $layout.pieceBoxes ?? [],
    };
  },
);
