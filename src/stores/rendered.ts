/**
 * 현재 활성 탭 + 표시 옵션으로부터 파생되는 SVG 렌더 결과.
 *
 * ChartViewer 가 이 store 를 읽어 화면에 그리고, App.svelte 의 내보내기 경로
 * (SVG/PNG) 도 같은 결과를 재사용한다. 기존에 ChartViewer 안의 $derived.by
 * 에 있던 로직을 이곳으로 옮겨 단일 출처로 만든 것.
 */

import { derived } from 'svelte/store';
import { pattern } from './tabs';
import { showGrid, showConnections, flatFlipVertical } from './mode';
import type { ExpandedRound } from '$lib/expand/op';
import { layoutCircular } from '$lib/layout/circular';
import { layoutFlat } from '$lib/layout/flat';
import { renderSvg } from '$lib/render/svg';

export interface RenderedChart {
  svg: string;
  width: number;
  height: number;
  totalRounds: number;
}

export const renderedChart = derived(
  [pattern, showGrid, showConnections, flatFlipVertical],
  ([$pattern, $showGrid, $showConnections, $flatFlipVertical]): RenderedChart | null => {
    const validRounds: ExpandedRound[] = [];
    for (const r of $pattern.rounds) {
      if (r.expanded) validRounds.push(r.expanded);
      else break;
    }
    if (validRounds.length === 0) return null;
    const layout = $pattern.shape === 'circular'
      ? layoutCircular(validRounds)
      : layoutFlat(validRounds, { flipVertical: $flatFlipVertical, align: $pattern.flatAlign });
    return {
      svg: renderSvg({ layout, showGrid: $showGrid, showConnections: $showConnections }),
      width: layout.bounds.width,
      height: layout.bounds.height,
      totalRounds: validRounds.length,
    };
  },
);
