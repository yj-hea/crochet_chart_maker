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
export const WORKSPACE_VERSION = 2;
export const FILE_EXTENSION = '.crochet.json';

export interface SavedRound {
  source: string;
  direction?: 'forward' | 'reverse';
}

export interface SavedComment {
  id: string;
  text: string;
  color: string;
  open?: boolean;
  target:
    | { kind: 'pattern' }
    /**
     * roundId 는 앱 런타임의 고유 ID. 다시 import 할 때 새 ID 가 발급되므로,
     * 추가로 `roundIndex` (0-based) 를 함께 기록해서 매핑을 끊기지 않게 한다.
     */
    | { kind: 'round'; roundId?: string; roundIndex?: number };
}

export interface SavedPattern {
  version: 1;
  savedAt: string;  // ISO 8601
  shape: ShapeKind;
  rounds: SavedRound[];
  comments?: SavedComment[];
}

export interface SerializeInput {
  shape: ShapeKind;
  /** id 는 옵션 — 코멘트의 round 참조를 직렬화 시 index 로 정규화하는 데 사용 */
  rounds: ReadonlyArray<{ id?: string; source: string; direction?: 'forward' | 'reverse' }>;
  comments?: ReadonlyArray<SavedComment>;
}

/** 현재 상태를 저장용 객체로 직렬화. id/parsed/expanded 등 파생값은 제외 */
export function serialize(state: SerializeInput): SavedPattern {
  const idToIndex = new Map<string, number>();
  state.rounds.forEach((r, i) => { if (r.id) idToIndex.set(r.id, i); });
  const normalizedComments = state.comments?.map((c) => {
    if (c.target.kind !== 'round') return c;
    const idx = c.target.roundId ? idToIndex.get(c.target.roundId) : c.target.roundIndex;
    return {
      ...c,
      target: { kind: 'round' as const, roundId: c.target.roundId, roundIndex: idx },
    };
  });
  return {
    version: FILE_VERSION,
    savedAt: new Date().toISOString(),
    shape: state.shape,
    rounds: state.rounds.map((r) => {
      const out: SavedRound = { source: r.source };
      if (r.direction) out.direction = r.direction;
      return out;
    }),
    ...(normalizedComments && normalizedComments.length > 0 ? { comments: normalizedComments } : {}),
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
  const rounds: SavedRound[] = d.rounds.map((r, i) => {
    if (!r || typeof r !== 'object' || typeof (r as Record<string, unknown>).source !== 'string') {
      throw new Error(`rounds[${i}]: source 문자열이 필요합니다`);
    }
    const rr = r as Record<string, unknown>;
    const out: SavedRound = { source: rr.source as string };
    if (rr.direction === 'forward' || rr.direction === 'reverse') {
      out.direction = rr.direction;
    }
    return out;
  });
  const comments = Array.isArray(d.comments) ? (d.comments as SavedComment[]) : undefined;
  return {
    version: 1,
    savedAt: typeof d.savedAt === 'string' ? d.savedAt : '',
    shape: d.shape,
    rounds,
    ...(comments ? { comments } : {}),
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

// ============================================================
// 워크스페이스 (다중 탭) localStorage — v2
// ============================================================

export interface SavedWorkspaceTab {
  id: string;
  name: string;
  shape: ShapeKind;
  rounds: SavedRound[];
  comments?: SavedComment[];
}

export interface SavedWorkspace {
  version: 2;
  savedAt: string;
  tabs: SavedWorkspaceTab[];
  activeTabId: string;
}

const WORKSPACE_KEY = 'crochet-chart:workspace';

export function serializeWorkspace(ws: { tabs: SavedWorkspaceTab[]; activeTabId: string }): SavedWorkspace {
  return {
    version: WORKSPACE_VERSION,
    savedAt: new Date().toISOString(),
    tabs: ws.tabs.map((t) => ({
      id: t.id,
      name: t.name,
      shape: t.shape,
      rounds: t.rounds.map((r) => {
        const out: SavedRound = { source: r.source };
        if (r.direction) out.direction = r.direction;
        return out;
      }),
      ...(t.comments && t.comments.length > 0 ? { comments: [...t.comments] } : {}),
    })),
    activeTabId: ws.activeTabId,
  };
}

export function validateWorkspace(data: unknown): SavedWorkspace {
  if (!data || typeof data !== 'object') throw new Error('잘못된 워크스페이스 형식');
  const d = data as Record<string, unknown>;
  if (d.version !== 2) throw new Error(`지원하지 않는 워크스페이스 버전: ${String(d.version)}`);
  if (!Array.isArray(d.tabs)) throw new Error('tabs 배열이 없습니다');
  const tabs: SavedWorkspaceTab[] = d.tabs.map((t, i) => {
    if (!t || typeof t !== 'object') throw new Error(`tabs[${i}]: 객체가 아님`);
    const tt = t as Record<string, unknown>;
    if (typeof tt.id !== 'string') throw new Error(`tabs[${i}].id 문자열 필요`);
    if (typeof tt.name !== 'string') throw new Error(`tabs[${i}].name 문자열 필요`);
    if (tt.shape !== 'circular' && tt.shape !== 'flat') throw new Error(`tabs[${i}].shape 잘못됨`);
    if (!Array.isArray(tt.rounds)) throw new Error(`tabs[${i}].rounds 배열 필요`);
    return {
      id: tt.id,
      name: tt.name,
      shape: tt.shape,
      rounds: tt.rounds.map((r, j) => {
        if (!r || typeof (r as Record<string, unknown>).source !== 'string') {
          throw new Error(`tabs[${i}].rounds[${j}].source 필요`);
        }
        const rr = r as Record<string, unknown>;
        const out: SavedRound = { source: rr.source as string };
        if (rr.direction === 'forward' || rr.direction === 'reverse') {
          out.direction = rr.direction;
        }
        return out;
      }),
      ...(Array.isArray(tt.comments) ? { comments: tt.comments as SavedComment[] } : {}),
    };
  });
  const activeTabId = typeof d.activeTabId === 'string' ? d.activeTabId : (tabs[0]?.id ?? '');
  return { version: 2, savedAt: String(d.savedAt ?? ''), tabs, activeTabId };
}

export function saveWorkspace(ws: { tabs: SavedWorkspaceTab[]; activeTabId: string }): void {
  if (!hasLocalStorage()) return;
  try {
    globalThis.localStorage.setItem(WORKSPACE_KEY, JSON.stringify(serializeWorkspace(ws)));
  } catch { /* ignore */ }
}

/** 워크스페이스 로드. 없으면 v1 단일 pattern을 한 탭으로 마이그레이션. */
export function loadWorkspace(): SavedWorkspace | null {
  if (!hasLocalStorage()) return null;
  try {
    const raw = globalThis.localStorage.getItem(WORKSPACE_KEY);
    if (raw) return validateWorkspace(JSON.parse(raw));
    // v1 마이그레이션
    const legacy = loadFromLocalStorage();
    if (legacy) {
      const tabId = `tab_${Date.now().toString(36)}`;
      return {
        version: 2,
        savedAt: new Date().toISOString(),
        tabs: [{ id: tabId, name: '도안 1', shape: legacy.shape, rounds: legacy.rounds }],
        activeTabId: tabId,
      };
    }
    return null;
  } catch (e) {
    console.warn('워크스페이스 복원 실패:', e);
    return null;
  }
}

export function clearWorkspace(): void {
  if (!hasLocalStorage()) return;
  globalThis.localStorage.removeItem(WORKSPACE_KEY);
}
