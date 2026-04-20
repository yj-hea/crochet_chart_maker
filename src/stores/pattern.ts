/**
 * 기존 pattern store API 를 `tabs.ts` 로 프록시.
 * 이전 버전 호환을 위해 유지 — 새로운 코드는 `$stores/tabs` 를 직접 사용 권장.
 */

export type { ShapeKind, PatternRoundState } from './tabs';
export {
  pattern,
  lastSavedAt,
  updateRoundSource,
  addRoundAfter,
  addRoundAtEnd,
  deleteRound,
  setShape,
  exportToFile,
  exportAsTextFile,
  importFromFile,
  resetPattern,
} from './tabs';

import type { PatternRoundState, ShapeKind } from './tabs';
export interface PatternState {
  shape: ShapeKind;
  rounds: PatternRoundState[];
}
