/**
 * 대바늘 크래프트 정의.
 *
 * 기호 체계·방향 규칙은 docs/knit_symbol_system.md 참조.
 * 원통/평면 모두 같은 격자 레이아웃을 쓰고, 도형은 겉면/안면 판정만 바꾼다.
 */

import type { CraftDefinition, CraftLayoutOptions, CraftRenderOptions } from '../types';
import type { ExpandedRound } from '$lib/expand/op';
import type { LayoutResult } from '$lib/layout/types';
import type { StitchKind } from '$lib/model/stitch-kind';
import { parseKnitRound } from './parser';
import { expandKnit } from './expander';
import { layoutKnitGrid } from './grid';
import { renderKnitSvg } from './svg';
import { KNIT_STITCH_META, knitCanonicalFor } from './stitch';

export const knit: CraftDefinition = {
  id: 'knit',
  label: '대바늘',
  icon: '🪡',
  shapes: [
    { id: 'flat', label: '평면', iconClass: 'fa-regular fa-square' },
    { id: 'round', label: '원통', iconClass: 'fa-solid fa-arrows-spin' },
  ],
  defaultShape: 'flat',
  countPosition: 'postfix',

  parseRound: parseKnitRound,
  expand: expandKnit,

  layout(rounds: ExpandedRound[], opts: CraftLayoutOptions): LayoutResult {
    return layoutKnitGrid(rounds, {
      shape: opts.shape,
      align: opts.align,
      flipVertical: opts.flipVertical,
      cascade: opts.cascade,
      gauge: opts.gauge,
    });
  },

  render(layout: LayoutResult, opts: CraftRenderOptions): string {
    // 대바늘은 격자가 도안의 일부 — showGrid 를 끄면 테두리만 감춘다.
    return renderKnitSvg({
      layout,
      showGrid: opts.showGrid ?? true,
      colorMode: opts.colorMode,
      emptyColor: opts.emptyColor,
      mainColor: opts.mainColor,
    });
  },

  stitchMeta(kind: StitchKind) {
    return KNIT_STITCH_META[kind];
  },

  canonicalFor: knitCanonicalFor,
};
