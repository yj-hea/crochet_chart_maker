/**
 * Edit / Read 모드 상태 + Read 모드 단 진행 추적.
 */

import { writable } from 'svelte/store';

export type AppMode = 'edit' | 'read';

export const mode = writable<AppMode>('edit');

/** Read 모드에서 현재 작업 중인 단 (1-based). */
export const currentRound = writable<number>(1);

/** 미리보기 그리드 표시 여부. 사용자가 토글 버튼으로 제어. */
export const showGrid = writable<boolean>(true);

const STORAGE_KEY = 'crochet-chart:read-progress';

interface ReadProgress {
  /** 도안 내용의 간단한 해시 — 도안이 바뀌면 진행 상태 무효화 */
  hash: string;
  round: number;
}

/** 도안 소스들의 간단한 해시. 내용이 바뀌면 다른 값. */
export function hashSources(sources: string[]): string {
  return sources.join('\n');
}

export function saveProgress(hash: string, round: number): void {
  try {
    const data: ReadProgress = { hash, round };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

export function loadProgress(hash: string, maxRound: number): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return 1;
    const data: ReadProgress = JSON.parse(raw);
    if (data.hash !== hash) return 1;
    return Math.min(Math.max(1, data.round), maxRound);
  } catch {
    return 1;
  }
}
