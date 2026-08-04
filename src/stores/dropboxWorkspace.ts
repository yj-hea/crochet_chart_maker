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
import { workspace, toSavedTab } from './tabs';

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
export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline' | 'conflict';
export const syncStatus = writable<SyncStatus>('offline');
export const lastSyncAt = writable<Date | null>(null);

/** 충돌한 버전의 요약 — 사용자가 어느 쪽을 남길지 고를 때 보여준다 */
export interface ConflictSide {
  savedAt: string;
  tabNames: string[];
}
export interface SyncConflict {
  workspaceId: string;
  workspaceName: string;
  /** 이 기기의 변경 */
  local: ConflictSide;
  /** Dropbox 에 이미 올라와 있는 다른 기기의 변경 */
  remote: ConflictSide;
}
/** null 이 아니면 충돌 미해결 — 해결 전까지 자동 업로드를 멈춘다 */
export const syncConflict = writable<SyncConflict | null>(null);

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
/**
 * 원격을 한 번 받아오기 전에는 절대 push 하지 않는다.
 *
 * `workspace.subscribe` 는 구독 즉시 현재 값으로 한 번 호출된다.
 * 이 때 push 를 예약하면 **부팅하자마자 그 기기의 (오래된) 로컬 워크스페이스가
 * 원격을 덮어써서**, 다른 기기에서 새로 만든 탭이 사라진다.
 */
let watchReady = false;
/** 마지막으로 확인한 원격 파일 rev — 이 값으로 조건부 업로드해 충돌을 감지한다 */
let lastKnownRev: string | null = null;
/** 충돌 시 보류된 로컬 스냅샷 (사용자가 "내 것 유지"를 고르면 이 내용을 올린다) */
let pendingLocal: NamedWorkspace | null = null;
/** 원격 적용으로 인한 store 변경은 다시 push 하지 않는다 (에코 방지) */
let applyingRemote = false;

/** 활성 워크스페이스 변경 시 debounced upload 예약. */
function scheduleSync(): void {
  if (!isConnected()) return;
  // 충돌이 해결될 때까지 자동 업로드 중단 — 사용자가 고른 뒤 재개
  if (get(syncConflict)) return;
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
    // 자동 저장과 **같은** 직렬화를 쓴다 — 따로 만들면 필드가 조용히 누락된다
    const tabs: SavedWorkspaceTab[] = ws.tabs.map(toSavedTab);
    const list = get(workspaceList);
    const meta = list.find((w) => w.id === id);
    const named: NamedWorkspace = {
      ...serializeWorkspace({ tabs, activeTabId: ws.activeTabId }),
      workspaceId: id,
      workspaceName: meta?.name ?? id,
    };
    try {
      const up = await uploadFile({
        path: workspacePath(id),
        content: JSON.stringify(named, null, 2),
        // 마지막으로 본 rev 기준 조건부 업로드 — 그 사이 다른 기기가 올렸으면 실패한다
        mode: lastKnownRev ? { update: lastKnownRev } : 'overwrite',
      });
      lastKnownRev = up.rev;
    } catch (err) {
      if (isConflictError(err)) {
        await enterConflict(id, named);
        return;
      }
      throw err;
    }
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

/** update 모드 업로드가 rev 불일치로 거부됐는지 */
function isConflictError(err: unknown): boolean {
  if (!(err instanceof DropboxApiError)) return false;
  return err.status === 409 && err.detail.includes('conflict');
}

function summarize(ws: SavedWorkspace): ConflictSide {
  return {
    savedAt: ws.savedAt,
    tabNames: ws.tabs.map((t) => t.name),
  };
}

/**
 * 충돌 진입 — 원격 내용을 받아 두 버전을 요약해 사용자에게 선택을 요청한다.
 * 해결 전까지 자동 업로드는 멈춘다 (`scheduleSync` 가 conflict 를 확인).
 */
async function enterConflict(id: string, local: NamedWorkspace): Promise<void> {
  pendingLocal = local;
  let remote: NamedWorkspace | null = null;
  try {
    const f = await downloadFile(workspacePath(id));
    if (f) {
      remote = JSON.parse(f.content) as NamedWorkspace;
      lastKnownRev = f.rev;
    }
  } catch (err) {
    console.error('충돌 원격 조회 실패', err);
  }
  syncConflict.set({
    workspaceId: id,
    workspaceName: local.workspaceName,
    local: summarize(local),
    remote: remote
      ? summarize(validateWorkspace(remote))
      : { savedAt: '', tabNames: [] },
  });
  syncStatus.set('conflict');
}

/**
 * 충돌 해결.
 *  - `local`     : 이 기기 내용으로 원격을 덮어쓴다
 *  - `remote`    : 원격을 받아와 이 기기에 적용한다 (이 기기의 변경은 버림)
 *  - `keep-both` : 원격은 그대로 두고, 이 기기 내용을 **새 워크스페이스**로 저장한다
 */
export async function resolveConflict(choice: 'local' | 'remote' | 'keep-both'): Promise<void> {
  const conflict = get(syncConflict);
  if (!conflict) return;
  const id = conflict.workspaceId;
  syncStatus.set('syncing');
  try {
    if (choice === 'local') {
      if (!pendingLocal) throw new Error('보류된 로컬 내용이 없습니다');
      const up = await uploadFile({
        path: workspacePath(id),
        content: JSON.stringify(pendingLocal, null, 2),
        mode: 'overwrite',
      });
      lastKnownRev = up.rev;
      syncConflict.set(null);
      pendingLocal = null;
      lastSyncAt.set(new Date());
      syncStatus.set('idle');
      return;
    }

    if (choice === 'remote') {
      syncConflict.set(null);
      pendingLocal = null;
      await switchWorkspace(id);
      return;
    }

    // keep-both — 이 기기 내용을 새 파일로. 원격은 건드리지 않는다.
    if (!pendingLocal) throw new Error('보류된 로컬 내용이 없습니다');
    const newId = generateWorkspaceId();
    const copy: NamedWorkspace = {
      ...pendingLocal,
      workspaceId: newId,
      workspaceName: `${conflict.workspaceName} (사본)`,
    };
    const up = await uploadFile({
      path: workspacePath(newId),
      content: JSON.stringify(copy, null, 2),
      mode: 'add',
    });
    lastKnownRev = up.rev;
    activeWorkspaceId.set(newId);
    saveActiveId(newId);
    syncConflict.set(null);
    pendingLocal = null;
    await refreshWorkspaceList();
    lastSyncAt.set(new Date());
    syncStatus.set('idle');
  } catch (err) {
    syncStatus.set('error');
    throw err;
  }
}

// workspace 변경 → 자동 sync 예약.
let workspaceUnsub: (() => void) | null = null;
function startWorkspaceWatch(): void {
  if (workspaceUnsub) return;
  workspaceUnsub = workspace.subscribe(() => {
    if (!watchReady || applyingRemote) return;
    scheduleSync();
  });
}
function stopWorkspaceWatch(): void {
  if (workspaceUnsub) { workspaceUnsub(); workspaceUnsub = null; }
  watchReady = false;
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
    // 이 세션에서 실제로 변경한 내용이 있으면 전환 전에 push (debounce 우회).
    // 아직 원격을 받아오지 않았다면(부팅 중) push 하지 않는다 — 오래된 로컬로 덮어쓰지 않도록.
    if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
    if (watchReady && pendingPush) await runSync();
    else pendingPush = false;

    const f = await downloadFile(workspacePath(id));
    if (!f) throw new Error('워크스페이스 파일이 없습니다');
    lastKnownRev = f.rev;
    const data = JSON.parse(f.content) as NamedWorkspace;
    const validated = validateWorkspace(data);
    const { applyWorkspace } = await import('./tabs');
    applyingRemote = true;
    try {
      applyWorkspace(validated);
    } finally {
      applyingRemote = false;
    }
    // 원격을 받아온 뒤부터 로컬 변경을 push 한다
    watchReady = true;
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
    tabs = ws.tabs.map(toSavedTab);
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
  const created = await uploadFile({
    path: workspacePath(id),
    content: JSON.stringify(named, null, 2),
    mode: 'add',
  });
  lastKnownRev = created.rev;
  await refreshWorkspaceList();
  // empty 면 자동 전환, current 면 그대로 활성.
  if (opts.source === 'empty') {
    await switchWorkspace(id);
  } else {
    // 현재 작업을 그대로 새 워크스페이스로 올렸으므로 이후 변경부터 push
    activeWorkspaceId.set(id);
    saveActiveId(id);
    watchReady = true;
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
  // 원격을 받아오기 전까지는 push 금지 (아래 switchWorkspace 성공 시 해제)
  watchReady = false;
  startWorkspaceWatch();
  await refreshWorkspaceList();
  const id = get(activeWorkspaceId);
  if (!id) {
    // 붙일 원격 워크스페이스가 없다 — 이후 사용자가 만들면 그 때부터 push
    watchReady = true;
    syncStatus.set('idle');
    return { status: 'no-active' };
  }
  // 활성 ID 가 현재 목록에 있는지 확인.
  const list = get(workspaceList);
  if (!list.find((w) => w.id === id)) {
    activeWorkspaceId.set(null);
    saveActiveId(null);
    watchReady = true;
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
  pendingLocal = null;
  lastKnownRev = null;
  syncConflict.set(null);
  workspaceList.set([]);
  syncStatus.set('offline');
}
