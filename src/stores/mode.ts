/**
 * Edit / Read 모드 상태 + Read 모드 단 진행 추적.
 *
 * 진행(round/stitch)은 활성 탭에 embed 됨 (tabs store). 여기 `currentRound`/`currentStitch` 는
 * UI 가 직접 다루는 writable 이고, `App.svelte` 에서 활성 탭 progress 와 양방향 동기화된다.
 */

import { writable } from 'svelte/store';
import { persisted, isBoolean, isOneOf } from '$lib/persisted-store';

/**
 * 미리보기 표시 옵션은 마지막 설정을 기억한다 (localStorage).
 * 도안마다 다시 맞출 필요 없이 사용자가 쓰던 화면 그대로 열리도록.
 */
const PREFIX = 'crochet-chart:view.';

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
export const showGrid = persisted<boolean>(`${PREFIX}showGrid`, true, isBoolean);

/** 부모-자식 연결선 표시 여부. */
export const showConnections = persisted<boolean>(`${PREFIX}showConnections`, true, isBoolean);

/**
 * 평면 도안을 상하 반전해서 표시. 기본값 false (1단이 아래).
 * true 면 1단이 위, 이후 단이 아래로.
 */
export const flatFlipVertical = persisted<boolean>(`${PREFIX}flatFlipVertical`, false, isBoolean);

/**
 * 평면 도안에서 단마다 코 수가 다를 때 좁은 단을 max 폭 안에서 어디에 정렬할지.
 *  - 'L': 좌측 끝. 자식 그룹이 부모 우측으로 펼쳐짐.
 *  - 'R': 우측 끝. 자식 그룹이 부모 좌측으로 펼쳐짐.
 *  - 'C': 가운데.
 */
export type FlatAlign = 'L' | 'R' | 'C';
export const flatAlign = persisted<FlatAlign>(`${PREFIX}flatAlign`, 'L', isOneOf('L', 'R', 'C'));

/**
 * 평면 cascade — 부모 행을 자식 행의 첫 자식 x 로 이동시켜 정렬.
 * true (기본): cascade 적용. false: 각 단을 자기 cell 위치에 그대로 두고 연결선이 슬랜트.
 */
export const flatCascade = persisted<boolean>(`${PREFIX}flatCascade`, true, isBoolean);

/**
 * 평면 세로 정렬 모드.
 *  - 'same': 같은 단의 모든 코가 같은 y (현재 기본 동작).
 *  - 'even': 각 코가 부모 코로부터 일정 간격 떨어져 배치 — 부모/자기 높이 따라 같은 단도 다른 y 가능.
 */
export type FlatVAlign = 'same' | 'even';
export const flatVAlign = persisted<FlatVAlign>(`${PREFIX}flatVAlign`, 'same', isOneOf('same', 'even'));
