/**
 * localStorage 에 값을 유지하는 svelte writable.
 *
 * 표시 옵션(그리드/연결선/정렬 등)처럼 "마지막에 고른 상태"를 다시 열었을 때
 * 그대로 보여줘야 하는 값에 쓴다. 저장 실패(프라이빗 모드·용량 초과)는 무시하고
 * 메모리 값으로만 동작한다.
 */

import { writable, type Writable } from 'svelte/store';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): StorageLike | null {
  try {
    if (typeof globalThis === 'undefined' || !globalThis.localStorage) return null;
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

/**
 * @param key      localStorage 키
 * @param initial  저장된 값이 없거나 유효하지 않을 때 쓸 값
 * @param isValid  읽은 값 검증 — 잘못된 값이 화면을 깨뜨리지 않도록
 */
export function persisted<T>(
  key: string,
  initial: T,
  isValid: (v: unknown) => v is T,
  storage: StorageLike | null = defaultStorage(),
): Writable<T> {
  let start = initial;
  if (storage) {
    try {
      const raw = storage.getItem(key);
      if (raw !== null) {
        const parsed: unknown = JSON.parse(raw);
        if (isValid(parsed)) start = parsed;
      }
    } catch { /* 손상된 값은 무시하고 기본값 사용 */ }
  }

  const store = writable<T>(start);
  if (storage) {
    store.subscribe((v) => {
      try {
        storage.setItem(key, JSON.stringify(v));
      } catch { /* ignore */ }
    });
  }
  return store;
}

export const isBoolean = (v: unknown): v is boolean => typeof v === 'boolean';

export function isOneOf<T extends string>(...values: readonly T[]) {
  return (v: unknown): v is T => typeof v === 'string' && (values as readonly string[]).includes(v);
}
