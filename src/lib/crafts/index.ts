/**
 * 크래프트 레지스트리.
 *
 * 탭 하나 = 크래프트 하나. 앱 셸은 `CRAFTS[tab.craft]` 로만 크래프트에 접근한다.
 */

import type { CraftDefinition, CraftId } from './types';
import { crochet } from './crochet';

/** 등록된 크래프트. `knit` 은 Phase 1 에서 채워진다. */
export const CRAFTS: Partial<Record<CraftId, CraftDefinition>> = {
  crochet,
};

export const DEFAULT_CRAFT: CraftId = 'crochet';

/** 미등록 크래프트면 기본(코바늘)으로 폴백한다. */
export function getCraft(id: CraftId | undefined): CraftDefinition {
  return CRAFTS[id ?? DEFAULT_CRAFT] ?? crochet;
}

export function isCraftAvailable(id: CraftId): boolean {
  return CRAFTS[id] !== undefined;
}

export type { CraftDefinition, CraftId, ShapeOption, CraftLayoutOptions, CraftRenderOptions } from './types';
