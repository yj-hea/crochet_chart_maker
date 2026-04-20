/**
 * Edit / Read 모드 상태 + Read 모드 단 진행 추적.
 *
 * 진행(round/stitch)은 활성 탭에 embed 됨 (tabs store). 여기 `currentRound`/`currentStitch` 는
 * UI 가 직접 다루는 writable 이고, `App.svelte` 에서 활성 탭 progress 와 양방향 동기화된다.
 */

import { writable } from 'svelte/store';

export type AppMode = 'edit' | 'read';

export const mode = writable<AppMode>('edit');

/** Read 모드에서 현재 작업 중인 단 (1-based). */
export const currentRound = writable<number>(1);

/**
 * Read 모드에서 현재 작업 중인 코 (0-based, 현재 단 내 stitch 순서).
 * null = 단 전체 보기 (특정 코 하이라이트 없음).
 */
export const currentStitch = writable<number | null>(null);

/** 미리보기 그리드 표시 여부. 사용자가 토글 버튼으로 제어. */
export const showGrid = writable<boolean>(true);

/** 부모-자식 연결선 표시 여부. */
export const showConnections = writable<boolean>(true);

/**
 * 평면 도안을 상하 반전해서 표시. 기본값 false (1단이 아래).
 * true 면 1단이 위, 이후 단이 아래로.
 */
export const flatFlipVertical = writable<boolean>(false);
