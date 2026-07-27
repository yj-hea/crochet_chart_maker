/**
 * Dropbox 다중 워크스페이스 동기화.
 *
 *  - Dropbox App folder 의 `/workspaces/<id>.json` 에 각 워크스페이스 저장.
 *  - 활성 워크스페이스 ID 는 localStorage 에 저장.
 *  - 활성 워크스페이스의 변경은 debounced upload, 부팅/전환 시 fetch.
 */

import { writable, get } from 'svelte/store';
import {
  uploadFile,
  downloadFile,
  listFolder,
  deleteFile,
  moveFile,
  DropboxApiError,
} from '$lib/dropbox/api';
import { isConnected } from '$lib/dropbox/auth';
import {
  validateWorkspace,
  serializeWorkspace,
  type SavedWorkspaceTab,
  type SavedWorkspace,
} from '$lib/persistence';
import { workspace } from './tabs';

export const WORKSPACE_FOLDER = '/workspaces';
const ACTIVE_KEY = 'crochet-chart:dropbox-active-workspace';
const SYNC_DEBOUNCE_MS = 1500;

export interface NamedWorkspace extends SavedWorkspace {
  /** 사용자에게 보이는 이름 */
  workspaceName: string;
  /** 안정 ID (= 파일명 base). */
  workspaceId: string;
}

export interface WorkspaceListItem {
  id: string;
  name: string;
  rev: string;
  updatedAt: string;
}

export const workspaceList = writable<WorkspaceListItem[]>([]);
export const activeWorkspaceId = writable<string | null>(loadActiveId());
export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';
export const syncStatus = writable<SyncStatus>('offline');
export const lastSyncAt = writable<Date | null>(null);

function loadActiveId(): string | null {
  try {
    return globalThis.localStorage?.getItem(ACTIVE_KEY) ?? null;
  } catch {
    return null;
  }
}
function saveActiveId(id: string | null): void {
  try {
    if (id) globalThis.localStorage?.setItem(ACTIVE_KEY, id);
    else globalThis.localStorage?.removeItem(ACTIVE_KEY);
  } catch { /* ignore */ }
}

/** 워크스페이스 ID 생성. timestamp + random. */
function generateWorkspaceId(): string {
  const ts = Date.now().toString(36);
  const rnd = Math.floor(Math.random() * 0xffff).toString(36).padStart(3, '0');
  return `ws_${ts}_${rnd}`;
}

function workspacePath(id: string): string {
  return `${WORKSPACE_FOLDER}/${id}.json`;
}

// ============================================================
// 동기화 매니저
// ============================================================

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let pendingPush = false;

/** 활성 워크스페이스 변경 시 debounced upload 예약. */
function scheduleSync(): void {
  if (!isConnected()) return;
  const id = get(activeWorkspaceId);
  if (!id) return;
  pendingPush = true;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => { void runSync(); }, SYNC_DEBOUNCE_MS);
}

async function runSync(): Promise<void> {
  if (!pendingPush) return;
  pendingPush = false;
  const id = get(activeWorkspaceId);
  if (!id || !isConnected()) return;

  syncStatus.set('syncing');
  try {
    const ws = get(workspace);
    const tabs: SavedWorkspaceTab[] = ws.tabs.map((t) => ({
      id: t.id,
      name: t.name,
      craft: t.craft ?? 'crochet',
      shape: t.shape,
      rounds: t.rounds.map((r) => {
        const out: { source: string; direction?: 'forward' | 'reverse' } = { source: r.source };
        if (r.direction) out.direction = r.direction;
        return out;
      }),
      ...(t.progress ? { progress: t.progress } : {}),
    }));
    const list = get(workspaceList);
    const meta = list.find((w) => w.id === id);
    const named: NamedWorkspace = {
      ...serializeWorkspace({ tabs, activeTabId: ws.activeTabId }),
      workspaceId: id,
      workspaceName: meta?.name ?? id,
    };
    await uploadFile({
      path: workspacePath(id),
      content: JSON.stringify(named, null, 2),
      mode: 'overwrite',
    });
    lastSyncAt.set(new Date());
    syncStatus.set('idle');
    // 워크스페이스 list 의 updatedAt 갱신.
    workspaceList.update((l) =>
      l.map((w) => (w.id === id ? { ...w, updatedAt: named.savedAt } : w)),
    );
  } catch (err) {
    console.error('Dropbox sync 실패', err);
    syncStatus.set('error');
  }
}

// workspace 변경 → 자동 sync 예약.
let workspaceUnsub: (() => void) | null = null;
function startWorkspaceWatch(): void {
  if (workspaceUnsub) return;
  workspaceUnsub = workspace.subscribe(() => { scheduleSync(); });
}
function stopWorkspaceWatch(): void {
  if (workspaceUnsub) { workspaceUnsub(); workspaceUnsub = null; }
}

// ============================================================
// 액션 — 목록 / 로드 / 생성 / 이름변경 / 삭제 / 전환
// ============================================================

/** Dropbox 폴더에서 워크스페이스 목록 조회 (메타만). */
export async function refreshWorkspaceList(): Promise<WorkspaceListItem[]> {
  if (!isConnected()) {
    workspaceList.set([]);
    return [];
  }
  try {
    const entries = await listFolder(WORKSPACE_FOLDER);
    const items: WorkspaceListItem[] = [];
    for (const e of entries) {
      if (!e.name.endsWith('.json')) continue;
      const id = e.name.replace(/\.json$/, '');
      // name 은 파일 안에 있지만 일단 id 로 표기 — 필요 시 download 로 가져옴.
      items.push({ id, name: id, rev: e.rev, updatedAt: e.serverModified });
    }
    // 이름 fetch — 작은 메타라 병렬 download.
    const detailed = await Promise.all(items.map(async (it) => {
      try {
        const f = await downloadFile(workspacePath(it.id));
        if (!f) return it;
        const obj = JSON.parse(f.content) as Partial<NamedWorkspace>;
        return { ...it, name: typeof obj.workspaceName === 'string' ? obj.workspaceName : it.id };
      } catch { return it; }
    }));
    workspaceList.set(detailed);
    return detailed;
  } catch (err) {
    console.error('워크스페이스 목록 조회 실패', err);
    return [];
  }
}

/** 지정 워크스페이스 fetch + workspace store 에 적용 (전환). */
export async function switchWorkspace(id: string): Promise<void> {
  if (!isConnected()) throw new Error('Dropbox 로그인 필요');
  syncStatus.set('syncing');
  try {
    // 현재 활성 워크스페이스 즉시 push (debounce 우회).
    if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
    if (pendingPush) await runSync();

    const f = await downloadFile(workspacePath(id));
    if (!f) throw new Error('워크스페이스 파일이 없습니다');
    const data = JSON.parse(f.content) as NamedWorkspace;
    const validated = validateWorkspace(data);
    const { applyWorkspace } = await import('./tabs');
    applyWorkspace(validated);
    activeWorkspaceId.set(id);
    saveActiveId(id);
    syncStatus.set('idle');
    lastSyncAt.set(new Date());
  } catch (err) {
    syncStatus.set('error');
    throw err;
  }
}

/** 새 워크스페이스 생성. 현재 워크스페이스를 옮겨 담거나 빈 워크스페이스. */
export async function createWorkspace(opts: {
  name: string;
  source: 'current' | 'empty';
}): Promise<string> {
  if (!isConnected()) throw new Error('Dropbox 로그인 필요');
  const id = generateWorkspaceId();
  let tabs: SavedWorkspaceTab[];
  let activeTabId: string;
  if (opts.source === 'current') {
    const ws = get(workspace);
    tabs = ws.tabs.map((t) => ({
      id: t.id,
      name: t.name,
      craft: t.craft ?? 'crochet',
      shape: t.shape,
      rounds: t.rounds.map((r) => ({
        source: r.source,
        ...(r.direction ? { direction: r.direction } : {}),
      })),
      ...(t.progress ? { progress: t.progress } : {}),
    }));
    activeTabId = ws.activeTabId;
  } else {
    const tabId = `tab_${Date.now().toString(36)}`;
    tabs = [{ id: tabId, name: '도안', craft: 'crochet', shape: 'circular', rounds: [{ source: '' }] }];
    activeTabId = tabId;
  }
  const named: NamedWorkspace = {
    ...serializeWorkspace({ tabs, activeTabId }),
    workspaceId: id,
    workspaceName: opts.name.trim() || id,
  };
  await uploadFile({
    path: workspacePath(id),
    content: JSON.stringify(named, null, 2),
    mode: 'add',
  });
  await refreshWorkspaceList();
  // empty 면 자동 전환, current 면 그대로 활성.
  if (opts.source === 'empty') {
    await switchWorkspace(id);
  } else {
    activeWorkspaceId.set(id);
    saveActiveId(id);
  }
  return id;
}

/** 워크스페이스 이름 변경 (파일 내부 workspaceName 만 수정 — 파일명 = id 유지). */
export async function renameWorkspace(id: string, newName: string): Promise<void> {
  if (!isConnected()) throw new Error('Dropbox 로그인 필요');
  const f = await downloadFile(workspacePath(id));
  if (!f) throw new Error('워크스페이스 파일이 없습니다');
  const data = JSON.parse(f.content) as NamedWorkspace;
  data.workspaceName = newName.trim() || id;
  await uploadFile({
    path: workspacePath(id),
    content: JSON.stringify(data, null, 2),
    mode: 'overwrite',
  });
  workspaceList.update((l) => l.map((w) => (w.id === id ? { ...w, name: data.workspaceName } : w)));
}

/** 워크스페이스 삭제. 활성 중이면 먼저 다른 것으로 전환하거나 활성 해제. */
export async function deleteWorkspace(id: string): Promise<void> {
  if (!isConnected()) throw new Error('Dropbox 로그인 필요');
  await deleteFile(workspacePath(id));
  workspaceList.update((l) => l.filter((w) => w.id !== id));
  if (get(activeWorkspaceId) === id) {
    activeWorkspaceId.set(null);
    saveActiveId(null);
  }
}

void moveFile; // 추후 폴더 이동 등 확장 시.
void DropboxApiError;

// ============================================================
// 부팅 시 진입점
// ============================================================

/**
 * Dropbox 연결 후 호출. 활성 워크스페이스가 있으면 fetch 하여 적용.
 * 없으면 사용자에게 prompt 하도록 신호만 보낸다.
 */
export async function initializeWorkspaceSync(): Promise<{
  status: 'loaded' | 'no-active' | 'error';
  error?: string;
}> {
  if (!isConnected()) {
    syncStatus.set('offline');
    return { status: 'no-active' };
  }
  startWorkspaceWatch();
  await refreshWorkspaceList();
  const id = get(activeWorkspaceId);
  if (!id) {
    syncStatus.set('idle');
    return { status: 'no-active' };
  }
  // 활성 ID 가 현재 목록에 있는지 확인.
  const list = get(workspaceList);
  if (!list.find((w) => w.id === id)) {
    activeWorkspaceId.set(null);
    saveActiveId(null);
    syncStatus.set('idle');
    return { status: 'no-active' };
  }
  try {
    await switchWorkspace(id);
    return { status: 'loaded' };
  } catch (err) {
    syncStatus.set('error');
    return { status: 'error', error: err instanceof Error ? err.message : String(err) };
  }
}

/** 로그아웃 시 호출 — sync 중지 + 상태 초기화. */
export function disposeWorkspaceSync(): void {
  stopWorkspaceWatch();
  if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
  pendingPush = false;
  workspaceList.set([]);
  syncStatus.set('offline');
}
