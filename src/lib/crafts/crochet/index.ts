/**
 * 코바늘 크래프트 정의.
 *
 * 기존 코바늘 파이프라인(파서 → 확장 → 원형/평면 레이아웃 → SVG)을
 * `CraftDefinition` 형태로 묶어 앱 셸에 노출한다. 동작은 이전과 동일하다.
 */

import type { CraftDefinition, CraftLayoutOptions, CraftRenderOptions } from '../types';
import type { ExpandedRound } from '$lib/expand/op';
import type { LayoutResult } from '$lib/layout/types';
import type { StitchKind } from '$lib/model/stitch-kind';
import { parseRound } from './parser';
import { expand } from '$lib/expand/expander';
import { layoutCircular } from './circular';
import { layoutFlat } from './flat';
import { renderSvg } from './svg';
import { STITCH_META } from './stitch';

export const crochet: CraftDefinition = {
  id: 'crochet',
  label: '코바늘',
  icon: '🧶',
  shapes: [
    { id: 'circular', label: '원형', iconClass: 'fa-regular fa-circle' },
    { id: 'flat', label: '평면', iconClass: 'fa-regular fa-square' },
  ],
  defaultShape: 'circular',
  countPosition: 'prefix',

  parseRound,
  expand,

  layout(rounds: ExpandedRound[], opts: CraftLayoutOptions): LayoutResult {
    if (opts.shape === 'circular') {
      return layoutCircular(rounds, { vAlign: opts.vAlign, cascade: opts.cascade });
    }
    return layoutFlat(rounds, {
      flipVertical: opts.flipVertical,
      align: opts.align,
      cascade: opts.cascade,
      vAlign: opts.vAlign,
    });
  },

  render(layout: LayoutResult, opts: CraftRenderOptions): string {
    return renderSvg({ layout, showGrid: opts.showGrid, showConnections: opts.showConnections });
  },

  stitchMeta(kind: StitchKind) {
    return STITCH_META[kind];
  },
};
