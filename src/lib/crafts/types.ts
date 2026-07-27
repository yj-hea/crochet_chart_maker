/**
 * 크래프트(코바늘 / 대바늘) 정의.
 *
 * 앱의 셸(탭·저장·Dropbox 동기화·모드·네비게이터)은 크래프트를 모른다.
 * 크래프트마다 다른 것은 아래 4 축뿐이며, 이 인터페이스로 주입한다:
 *   1. 코 메타/별칭 테이블   2. 파싱     3. 레이아웃     4. 렌더링(심볼)
 *
 * 자세한 설계는 docs/architecture.md §10.5 참조.
 */

import type { ParsedRound, SequenceNode } from '$lib/parser/ast';
import type { ExpandedRound } from '$lib/expand/op';
import type { LayoutResult } from '$lib/layout/types';
import type { StitchKind, StitchMeta } from '$lib/model/stitch-kind';

export type CraftId = 'crochet' | 'knit';

/** 도형 선택지. id 는 크래프트마다 다르다 (코바늘: circular/flat, 대바늘: round/flat). */
export interface ShapeOption {
  id: string;
  label: string;
  /** Font Awesome 클래스 (도형 선택 버튼 아이콘) */
  iconClass: string;
}

/**
 * 레이아웃 옵션 — 모든 크래프트가 공유하는 표시 옵션 + 도형.
 * 각 크래프트는 자기가 쓰는 것만 해석한다.
 */
export interface CraftLayoutOptions {
  shape: string;
  flipVertical?: boolean;
  align?: 'L' | 'R' | 'C';
  cascade?: boolean;
  vAlign?: 'same' | 'even';
}

export interface CraftRenderOptions {
  showGrid?: boolean;
  showConnections?: boolean;
}

export interface CraftDefinition {
  id: CraftId;
  /** UI 표시용 이름 (예: '코바늘') */
  label: string;
  /** 이 크래프트가 지원하는 도형과 그 라벨 */
  shapes: ShapeOption[];
  defaultShape: string;
  /** 반복수 표기 위치 — 코바늘 `3X` (prefix) / 대바늘 `k3` (postfix) */
  countPosition: 'prefix' | 'postfix';

  parseRound(index: number, source: string): ParsedRound;
  expand(tree: SequenceNode, index: number): ExpandedRound;
  layout(rounds: ExpandedRound[], opts: CraftLayoutOptions): LayoutResult;
  render(layout: LayoutResult, opts: CraftRenderOptions): string;

  /** 코 메타 조회 (서술형 변환·도움말 등에서 사용). 모르는 코면 undefined */
  stitchMeta(kind: StitchKind): StitchMeta | undefined;
}
