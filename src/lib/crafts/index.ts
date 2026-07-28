/**
 * 크래프트 레지스트리.
 *
 * 탭 하나 = 크래프트 하나. 앱 셸은 `CRAFTS[tab.craft]` 로만 크래프트에 접근한다.
 */

import type { CraftDefinition, CraftId } from './types';
import type { StitchKind, StitchMeta } from '$lib/model/stitch-kind';
import { crochet } from './crochet';
import { knit } from './knit';

export const CRAFTS: Partial<Record<CraftId, CraftDefinition>> = {
  crochet,
  knit,
};

/** UI 에서 고를 수 있는 크래프트 목록 (등록 순서) */
export const CRAFT_LIST: CraftDefinition[] = [crochet, knit];

export const DEFAULT_CRAFT: CraftId = 'crochet';

/** 크래프트를 가리지 않는 코 메타 조회 (서술형 변환·도움말 등 표시용) */
export function lookupStitchMeta(kind: StitchKind): StitchMeta | undefined {
  for (const craft of CRAFT_LIST) {
    const meta = craft.stitchMeta(kind);
    if (meta) return meta;
  }
  return undefined;
}

/** 미등록 크래프트면 기본(코바늘)으로 폴백한다. */
export function getCraft(id: CraftId | undefined): CraftDefinition {
  return CRAFTS[id ?? DEFAULT_CRAFT] ?? crochet;
}

export function isCraftAvailable(id: CraftId): boolean {
  return CRAFTS[id] !== undefined;
}

export type { CraftDefinition, CraftId, ShapeOption, CraftLayoutOptions, CraftRenderOptions } from './types';
