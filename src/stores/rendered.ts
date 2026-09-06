/**
 * 현재 활성 탭 + 표시 옵션으로부터 파생되는 레이아웃·SVG 렌더 결과.
 *
 * ChartViewer 가 이 store 를 읽어 화면에 그리고, App.svelte 의 내보내기 경로
 * (SVG/PNG) 도 같은 결과를 재사용한다. 기존에 ChartViewer 안의 $derived.by
 * 에 있던 로직을 이곳으로 옮겨 단일 출처로 만든 것.
 *
 * 레이아웃과 렌더를 두 단계로 나눠 둔다 — 3D 미리보기는 SVG 가 아니라 **좌표**가
 * 필요해서, 색·기호 같은 렌더 옵션만 바뀔 때 레이아웃을 다시 풀 이유가 없다.
 */

import { derived } from 'svelte/store';
import { pattern } from './tabs';
import {
  showGrid, showConnections, flatFlipVertical, flatAlign, flatCascade, flatCompact, flatVAlign,
  colorMode, emptyColor, mainColor, symbolColor,
} from './mode';
import type { ExpandedRound } from '$lib/expand/op';
import type { LayoutResult } from '$lib/layout/types';
import { getCraft, type CraftId } from '$lib/crafts';

export interface RenderedChart {
  svg: string;
  width: number;
  height: number;
  totalRounds: number;
  /** 격자 크래프트(대바늘) 의 칸 크기. 최소 가독 크기 계산에 사용 */
  cellWidth?: number;
  cellHeight?: number;
}

/** 레이아웃 단계 결과 — 코마다의 좌표와 부모 관계 */
export interface ChartLayout {
  craft: CraftId;
  layout: LayoutResult;
  totalRounds: number;
}

export const chartLayout = derived(
  [pattern, flatFlipVertical, flatAlign, flatCascade, flatCompact, flatVAlign],
  ([$pattern, $flatFlipVertical, $flatAlign, $flatCascade, $flatCompact,
    $flatVAlign]): ChartLayout | null => {
    const validRounds: ExpandedRound[] = [];
    for (const r of $pattern.rounds) {
      if (!r.expanded) break;
      // 빈 단(코가 하나도 없는 단)은 그리지 않는다 — 도안 전체가 비면 안내 문구를 띄운다
      if (r.expanded.ops.length === 0) continue;
      validRounds.push(r.expanded);
    }
    if (validRounds.length === 0) return null;
    const craft = getCraft($pattern.craft);
    return {
      craft: $pattern.craft,
      layout: craft.layout(validRounds, {
        shape: $pattern.shape,
        gauge: $pattern.gauge,
        flipVertical: $flatFlipVertical,
        align: $flatAlign,
        cascade: $flatCascade,
        compact: $flatCompact,
        vAlign: $flatVAlign,
      }),
      totalRounds: validRounds.length,
    };
  },
);

export const renderedChart = derived(
  [chartLayout, showGrid, showConnections, colorMode, emptyColor, mainColor, symbolColor],
  ([$chartLayout, $showGrid, $showConnections,
    $colorMode, $emptyColor, $mainColor, $symbolColor]): RenderedChart | null => {
    if (!$chartLayout) return null;
    const { layout, totalRounds } = $chartLayout;
    const craft = getCraft($chartLayout.craft);
    return {
      svg: craft.render(layout, {
        showGrid: $showGrid,
        showConnections: $showConnections,
        colorMode: $colorMode,
        emptyColor: $emptyColor,
        mainColor: $mainColor,
        symbolColor: $symbolColor,
      }),
      width: layout.bounds.width,
      height: layout.bounds.height,
      totalRounds,
      ...(layout.cellSize
        ? { cellWidth: layout.cellSize.width, cellHeight: layout.cellSize.height }
        : {}),
    };
  },
);
