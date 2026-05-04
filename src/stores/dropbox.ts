/**
 * Dropbox 연동 상태 + 액션 스토어.
 *
 * 모든 작업이 명시적 (자동 sync 없음):
 *   - openFromDropbox: Chooser 로 파일 선택 후 새 탭으로 import
 *   - saveToDropbox: 현재 활성 탭을 파일명 입력 모달 → API upload
 *   - connect / disconnect: OAuth PKCE 및 토큰 revoke
 */

import { writable, get } from 'svelte/store';
import {
  isConnected,
  startLogin,
  logout,
  completeLoginIfPending,
} from '$lib/dropbox/auth';
import { pickFile, fetchPickedFile } from '$lib/dropbox/chooser';
import { uploadFile, getFileRev, DropboxApiError } from '$lib/dropbox/api';
import { workspace } from './tabs';
import { serialize, FILE_EXTENSION } from '$lib/persistence';
import { parseRound } from '$lib/parser/parser';
import { expand } from '$lib/expand/expander';

/** 연결 상태. 초기값은 localStorage 토큰 존재 여부. */
export const dropboxConnected = writable<boolean>(false);

/** 마지막 저장된 파일 경로 (같은 이름 재저장 시 기본값으로 사용) */
export const lastSavedPath = writable<string | null>(null);

/** 저장 완료 플래시용 */
export const lastDropboxAction = writable<{ kind: 'save' | 'open'; name: string; at: number } | null>(null);

/**
 * 앱 부팅 시 호출. OAuth redirect 복귀 처리 + 연결 상태 반영.
 */
export async function initializeDropbox(): Promise<void> {
  const result = await completeLoginIfPending();
  if (result === 'error') {
    alert('Dropbox 로그인 실패. 다시 시도해 주세요.');
  }
  dropboxConnected.set(isConnected());
}

export async function connect(): Promise<void> {
  await startLogin(); // 리다이렉트 — 이후 코드는 실행되지 않음
}

export async function disconnect(): Promise<void> {
  await logout();
  dropboxConnected.set(false);
  lastSavedPath.set(null);
}

// ============================================================
// 불러오기 (Chooser, OAuth 불필요)
// ============================================================

/** Dropbox Chooser 를 열고 선택된 파일을 새 탭으로 import. 취소시 null. */
export async function openFromDropbox(): Promise<string | null> {
  const picked = await pickFile();
  if (!picked) return null;

  let text: string;
  try {
    text = await fetchPickedFile(picked);
  } catch (err) {
    throw new Error(`Dropbox 파일 다운로드 실패: ${errMsg(err)}`);
  }
  // 파일 내용을 File 로 감싸 기존 importFromFile 재사용
  const file = new File([text], picked.name, { type: 'application/json' });
  const { importFromFile } = await import('./tabs');
  await importFromFile(file);

  lastDropboxAction.set({ kind: 'open', name: picked.name, at: Date.now() });
  return picked.name;
}

// ============================================================
// 저장 (OAuth 필요)
// ============================================================

export interface SaveTarget {
  /** App folder 내 경로 (예: `/foo.crochet.json`). 사용자 입력. */
  path: string;
  /** 기존 파일이 있으면 rev. 덮어쓰기 확인에 사용. */
  existingRev: string | null;
}

/** 현재 활성 탭을 직렬화한 JSON 문자열. */
export function serializeActiveTab(): { name: string; content: string } | null {
  const ws = get(workspace);
  const active = ws.tabs.find((t) => t.id === ws.activeTabId);
  if (!active) return null;
  const data = serialize({
    shape: active.shape,
    rounds: active.rounds.map((r) => ({ id: r.id, source: r.source, direction: r.direction })),
    comments: active.comments,
    ...(active.progress ? { progress: active.progress } : {}),
    ...(active.flatAlign ? { flatAlign: active.flatAlign } : {}),
  });
  return { name: active.name, content: JSON.stringify(data, null, 2) };
}

/** 기본 파일명 — 탭 이름 (또는 기본값). 확장자는 자동 붙임. */
export function defaultSaveName(): string {
  const serialized = serializeActiveTab();
  const base = (serialized?.name ?? 'pattern').trim() || 'pattern';
  return base.endsWith(FILE_EXTENSION) ? base : `${base}${FILE_EXTENSION}`;
}

/** 확장자 없으면 자동 추가. 경로 정규화. */
export function normalizeSavePath(raw: string): string {
  let p = raw.trim();
  if (!p) p = 'pattern';
  if (!p.endsWith(FILE_EXTENSION) && !p.endsWith('.json')) p = `${p}${FILE_EXTENSION}`;
  if (!p.startsWith('/')) p = `/${p}`;
  return p;
}

/**
 * 저장 수행. path 가 이미 존재하면 overwrite 플래그로 덮어쓰기 여부 제어.
 * 반환: 저장된 파일 경로.
 */
export async function saveToDropbox(path: string, overwrite: boolean): Promise<string> {
  const serialized = serializeActiveTab();
  if (!serialized) throw new Error('저장할 활성 탭이 없습니다');
  const normalized = normalizeSavePath(path);

  const result = await uploadFile({
    path: normalized,
    content: serialized.content,
    mode: overwrite ? 'overwrite' : 'add',
  });
  lastSavedPath.set(result.path);
  lastDropboxAction.set({ kind: 'save', name: result.name, at: Date.now() });
  return result.path;
}

/** 주어진 경로에 파일이 이미 있는지 (rev 반환). */
export async function checkExisting(path: string): Promise<string | null> {
  return getFileRev(normalizeSavePath(path));
}

// ============================================================
// helpers
// ============================================================

function errMsg(err: unknown): string {
  if (err instanceof DropboxApiError) return `${err.status} ${err.detail}`;
  return err instanceof Error ? err.message : String(err);
}

// expander/parser 는 importFromFile 내부 reparseAll 에서 사용되므로 import 보장용
void parseRound;
void expand;
