/**
 * Edit / Read 모드 상태 + Read 모드 단 진행 추적 + 미리보기 표시 옵션.
 *
 * 진행(round/stitch)은 활성 탭에 embed 됨 (tabs store). 여기 `currentRound`/`currentStitch` 는
 * UI 가 직접 다루는 writable 이고, `App.svelte` 에서 활성 탭 progress 와 양방향 동기화된다.
 *
 * 표시 옵션(그리드·연결선·정렬·cascade…)도 **활성 탭**에 저장된다.
 * 도형·기법에 따라 알맞은 표시가 다르므로 도안마다 따로 기억해야 하기 때문이다.
 * 여기 노출되는 스토어들은 활성 탭의 값을 읽고, 쓰면 그 탭에만 반영된다.
 */

import { writable, derived, get } from 'svelte/store';
import { viewOptions, setViewOption } from '$stores/tabs';
import type { ViewOptions, ViewOptionKey } from '$lib/model/view-options';

export type { FlatAlign, FlatVAlign, ColorMode } from '$lib/model/view-options';

export type AppMode = 'edit' | 'read';

export const mode = writable<AppMode>('edit');

/** Read 모드에서 현재 작업 중인 단 (1-based). */
export const currentRound = writable<number>(1);

/**
 * Read 모드에서 현재 작업 중인 코 (0-based, 현재 단 내 stitch 순서).
 * null = 단 전체 보기 (특정 코 하이라이트 없음).
 */
export const currentStitch = writable<number | null>(null);

/**
 * 활성 탭의 표시 옵션 하나를 읽고 쓰는 스토어.
 *
 * 읽기는 활성 탭에서 파생되므로 탭을 바꾸면 자동으로 그 탭의 값이 보이고,
 * 쓰기는 활성 탭에만 반영된다 — 다른 도안은 영향받지 않는다.
 */
function tabViewOption<K extends ViewOptionKey>(key: K) {
  const inner = derived(viewOptions, ($v) => $v[key]);
  const set = (value: ViewOptions[K]) => setViewOption(key, value);
  return {
    subscribe: inner.subscribe,
    set,
    update: (fn: (value: ViewOptions[K]) => ViewOptions[K]) => set(fn(get(inner))),
  };
}

/** 미리보기 그리드 표시 여부. 사용자가 토글 버튼으로 제어. */
export const showGrid = tabViewOption('showGrid');

/** 부모-자식 연결선 표시 여부. */
export const showConnections = tabViewOption('showConnections');

/** 평면 도안을 상하 반전해서 표시. 기본값 false (1단이 아래). */
export const flatFlipVertical = tabViewOption('flatFlipVertical');

/** 좁은 단을 max 폭 안에서 어디에 정렬할지 (L/R/C). */
export const flatAlign = tabViewOption('flatAlign');

/** 부모-자식 폭·위치 맞춤. */
export const flatCascade = tabViewOption('flatCascade');

/** 세로 정렬 모드 (same/even). */
export const flatVAlign = tabViewOption('flatVAlign');

/** 실 색을 기호에 칠할지, 코 자리를 채울지. */
export const colorMode = tabViewOption('colorMode');

/** 코 없는 자리·차트 바탕색. */
export const emptyColor = tabViewOption('emptyColor');
