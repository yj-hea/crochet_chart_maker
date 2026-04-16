/**
 * 도안 저장/불러오기.
 *
 * - localStorage 자동 저장/복원 (excalidraw 스타일)
 * - 파일 export/import (.crochet.json)
 *
 * 파일 포맷은 version 필드로 관리. v1 기준 스키마는 아래 SavedPattern 참조.
 */

import type { ShapeKind } from '$stores/pattern';

export const LOCALSTORAGE_KEY = 'crochet-chart:pattern';
export const FILE_VERSION = 1;
export const FILE_EXTENSION = '.crochet.json';

export interface SavedPattern {
  version: 1;
  savedAt: string;  // ISO 8601
  shape: ShapeKind;
  rounds: Array<{ source: string }>;
}

export interface SerializeInput {
  shape: ShapeKind;
  rounds: ReadonlyArray<{ source: string }>;
}

/** 현재 상태를 저장용 객체로 직렬화. id/parsed/expanded 등 파생값은 제외 */
export function serialize(state: SerializeInput): SavedPattern {
  return {
    version: FILE_VERSION,
    savedAt: new Date().toISOString(),
    shape: state.shape,
    rounds: state.rounds.map((r) => ({ source: r.source })),
  };
}

/**
 * 외부 데이터(localStorage 문자열 또는 업로드 파일 내용)를 검증하여 SavedPattern 으로 변환.
 * 유효하지 않으면 한글 메시지를 담은 Error 를 throw.
 */
export function validate(data: unknown): SavedPattern {
  if (!data || typeof data !== 'object') {
    throw new Error('잘못된 파일 형식입니다 (객체가 아님)');
  }
  const d = data as Record<string, unknown>;
  if (d.version !== 1) {
    throw new Error(`지원하지 않는 파일 버전: ${String(d.version)}`);
  }
  if (d.shape !== 'circular' && d.shape !== 'flat') {
    throw new Error(`알 수 없는 도형 값: ${String(d.shape)}`);
  }
  if (!Array.isArray(d.rounds)) {
    throw new Error('rounds 배열이 없습니다');
  }
  const rounds: Array<{ source: string }> = d.rounds.map((r, i) => {
    if (!r || typeof r !== 'object' || typeof (r as Record<string, unknown>).source !== 'string') {
      throw new Error(`rounds[${i}]: source 문자열이 필요합니다`);
    }
    return { source: (r as { source: string }).source };
  });
  return {
    version: 1,
    savedAt: typeof d.savedAt === 'string' ? d.savedAt : '',
    shape: d.shape,
    rounds,
  };
}

function hasLocalStorage(): boolean {
  return typeof globalThis !== 'undefined'
    && typeof (globalThis as { localStorage?: Storage }).localStorage !== 'undefined';
}

export function saveToLocalStorage(state: SerializeInput): void {
  if (!hasLocalStorage()) return;
  try {
    const data = serialize(state);
    globalThis.localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(data));
  } catch {
    // 쿼터 초과 등은 조용히 무시 (작업 흐름을 끊지 않는다)
  }
}

export function loadFromLocalStorage(): SavedPattern | null {
  if (!hasLocalStorage()) return null;
  try {
    const raw = globalThis.localStorage.getItem(LOCALSTORAGE_KEY);
    if (!raw) return null;
    return validate(JSON.parse(raw));
  } catch (e) {
    console.warn('localStorage에서 도안 복원 실패:', e);
    return null;
  }
}

export function clearLocalStorage(): void {
  if (!hasLocalStorage()) return;
  globalThis.localStorage.removeItem(LOCALSTORAGE_KEY);
}

/** Blob 다운로드. 브라우저 환경에서만 동작. */
export function downloadAsFile(state: SerializeInput, filenameBase = 'pattern'): void {
  const data = serialize(state);
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `${filenameBase}-${date}${FILE_EXTENSION}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** File 객체에서 SavedPattern 으로 파싱 (검증 포함). */
export async function readFromFile(file: File): Promise<SavedPattern> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('파일이 유효한 JSON이 아닙니다');
  }
  return validate(parsed);
}
