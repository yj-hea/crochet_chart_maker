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
import type { ColorMode } from '$lib/model/view-options';
import type { LayoutResult } from '$lib/layout/types';
import type { StitchKind, StitchMeta } from '$lib/model/stitch-kind';
import type { Gauge } from '$lib/model/gauge';

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
  /** 게이지 (10cm 당 코수/단수). 격자 크래프트만 사용 */
  gauge?: Gauge;
  flipVertical?: boolean;
  align?: 'L' | 'R' | 'C';
  cascade?: boolean;
  vAlign?: 'same' | 'even';
}

export interface CraftRenderOptions {
  showGrid?: boolean;
  showConnections?: boolean;
  /** 실 색을 기호에 칠할지, 코 자리를 채울지 ('auto' = 크래프트 기본) */
  colorMode?: ColorMode;
  /** 코가 없는 자리의 색 */
  emptyColor?: string;
  /** 실 색을 지정하지 않은 코의 색 (도안 메인 컬러) */
  mainColor?: string;
}

export interface CraftDefinition {
  id: CraftId;
  /** UI 표시용 이름 (예: '코바늘') */
  label: string;
  /** 탭·메뉴에 표시할 이모지 아이콘 */
  icon: string;
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

  /**
   * 확장수를 포함한 정식 표기 (서술형 변환용).
   * 예: 대바늘 K2TOG + expansion 3 → `k3tog`.
   * 값을 돌려주면 `^N` 을 따로 붙이지 않는다. 미구현이면 `stitchMeta().canonical` + `^N`.
   */
  canonicalFor?(kind: StitchKind, expansion?: number): string | undefined;
}
