/**
 * 프로젝트 ↔ Dropbox 동기화.
 *
 * **프로젝트 1개 = 파일 1개** (`/workspaces/<프로젝트 id>.json`). 파일 이름이 곧
 * 프로젝트 id 라 "지금 로컬 내용이 어느 파일의 것인지" 를 잃을 수가 없다.
 *
 * ## 맞추는 일은 **열 때 한 번만**
 *
 * 예전에는 작업하는 내내 조건부 업로드로 충돌을 감지하고, 뜨다 말고 충돌 창이 떴다.
 * 그리고 "둘 다 두기" 가 자동으로 `(사본)` 워크스페이스를 만들어 임시 워크스페이스가
 * 쌓였다. 이제는 프로젝트를 **여는 순간** 한 번만 비교한다:
 *
 * | 상태 | 하는 일 |
 * |---|---|
 * | 원격에 없음 | 그냥 연다 (다음 저장 때 올라간다) |
 * | 받아 둔 rev 와 같고 로컬이 그대로 | 그냥 연다 |
 * | 받아 둔 rev 와 같고 로컬이 새것 | 열고 올린다 |
 * | rev 가 달라졌고 로컬은 그대로 | 받아서 연다 |
 * | **둘 다 바뀜** | 시작 화면에서 묻는다 (원격으로 / 내 것으로 / 둘 다 두기) |
 *
 * 작업 도중에는 묻지 않는다. 자동 업로드가 rev 불일치로 거부되면 상태만 `conflict`
 * 로 바꾸고 멈춘다 — 다음에 그 작품을 열 때 위 표대로 정리된다.
 */

import { writable, get } from 'svelte/store';
import {
  uploadFile, downloadFile, listFolder, deleteFile, DropboxApiError,
} from '$lib/dropbox/api';
import { isConnected } from '$lib/dropbox/auth';
import { validateWorkspace, type SavedWorkspace } from '$lib/persistence';
import {
  loadProject, saveProject, loadProjectIndex, saveProjectIndex, addProjectMeta,
  type ProjectMeta,
} from '$lib/projects';
import { workspace, toSavedTab } from './tabs';
import { openProjectId, projects, refreshProjects, openProject } from './projects';

export const WORKSPACE_FOLDER = '/workspaces';
const PUSH_DEBOUNCE_MS = 1500;

/** 파일 안에 함께 적는 이름 — 다른 기기에서 목록에 보여 준다 */
interface NamedWorkspace extends SavedWorkspace {
  workspaceId: string;
  workspaceName: string;
}

export interface RemoteProject {
  id: string;
  name: string;
  rev: string;
  updatedAt: string;
}

export type SyncStatus = 'offline' | 'idle' | 'syncing' | 'error' | 'conflict';

export const remoteProjects = writable<RemoteProject[]>([]);
export const syncStatus = writable<SyncStatus>('offline');
export const lastSyncAt = writable<Date | null>(null);
export const syncError = writable<string | null>(null);

function pathOf(id: string): string {
  return `${WORKSPACE_FOLDER}/${id}.json`;
}

function metaOf(id: string): ProjectMeta | undefined {
  return get(projects).find((p) => p.id === id);
}

function patchMeta(id: string, patch: Partial<ProjectMeta>): void {
  const index = loadProjectIndex();
  saveProjectIndex({
    ...index,
    projects: index.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)),
  });
  refreshProjects();
}

/** 원격 목록 — 연결돼 있지 않으면 빈 목록 */
export async function refreshRemote(): Promise<RemoteProject[]> {
  if (!isConnected()) {
    syncStatus.set('offline');
    remoteProjects.set([]);
    return [];
  }
  try {
    const entries = await listFolder(WORKSPACE_FOLDER);
    const list: RemoteProject[] = entries
      .filter((e) => e.name.endsWith('.json'))
      .map((e) => ({
        id: e.name.replace(/\.json$/, ''),
        name: e.name.replace(/\.json$/, ''),
        rev: e.rev,
        updatedAt: e.serverModified,
      }));
    remoteProjects.set(list);
    syncStatus.set('idle');
    return list;
  } catch (err) {
    syncStatus.set('error');
    syncError.set(err instanceof Error ? err.message : String(err));
    return [];
  }
}

/** 열 때 한 번 맞춘 결과 */
export type OpenSync =
  | { kind: 'offline' }
  | { kind: 'in-sync' }
  | { kind: 'pulled' }
  | { kind: 'pushed' }
  | { kind: 'remote-only' }
  | {
      kind: 'conflict';
      remote: { savedAt: string; tabNames: string[]; rev: string };
      local: { savedAt: string; tabNames: string[] };
    };

/**
 * 프로젝트를 열기 **직전에** 로컬과 원격을 맞춘다.
 * `conflict` 를 돌려주면 사용자가 고를 때까지 열지 않는다.
 */
export async function syncBeforeOpen(id: string): Promise<OpenSync> {
  if (!isConnected()) return { kind: 'offline' };
  const meta = metaOf(id);
  const local = loadProject(id);
  syncStatus.set('syncing');
  try {
    const remote = await downloadFile(pathOf(id));
    if (!remote) {
      // 원격에 없다 — 로컬이 원본이다. 열고 나서 자동 저장이 올린다.
      syncStatus.set('idle');
      return { kind: local ? 'in-sync' : 'offline' };
    }
    const parsed = parseRemote(remote.content);
    if (!local) {
      applyRemote(id, parsed.ws, remote.rev, nameOf(parsed, id));
      syncStatus.set('idle');
      return { kind: 'remote-only' };
    }

    const sameBase = meta?.rev === remote.rev;
    // 올린 내용의 저장 시각과 다르면 그 뒤에 고친 것이다 (저장 시각은 단조 증가한다)
    const localChanged = local.savedAt !== meta?.syncedAt;

    if (sameBase && !localChanged) { syncStatus.set('idle'); return { kind: 'in-sync' }; }
    if (sameBase && localChanged) {
      await push(id, local, remote.rev);
      return { kind: 'pushed' };
    }
    if (!localChanged) {
      applyRemote(id, parsed.ws, remote.rev, meta?.name ?? nameOf(parsed, id));
      syncStatus.set('idle');
      return { kind: 'pulled' };
    }
    syncStatus.set('conflict');
    return {
      kind: 'conflict',
      remote: { savedAt: parsed.ws.savedAt, tabNames: parsed.ws.tabs.map((t) => t.name), rev: remote.rev },
      local: { savedAt: local.savedAt, tabNames: local.tabs.map((t) => t.name) },
    };
  } catch (err) {
    syncStatus.set('error');
    syncError.set(err instanceof Error ? err.message : String(err));
    return { kind: 'offline' };
  }
}

/** 충돌을 사용자가 고른 대로 푼다 */
export async function resolveOpenConflict(
  id: string,
  choice: 'remote' | 'local' | 'both',
  copyName?: string,
): Promise<void> {
  const remote = await downloadFile(pathOf(id));
  if (!remote) return;
  const parsed = parseRemote(remote.content);

  if (choice === 'remote') {
    applyRemote(id, parsed.ws, remote.rev, metaOf(id)?.name ?? nameOf(parsed, id));
    syncStatus.set('idle');
    return;
  }

  if (choice === 'both') {
    // 로컬을 **새 작품으로 떼어 두고** 원격을 이 자리에 받는다.
    // 사본에는 사용자가 준 이름을 붙인다 — 이름 없는 임시 워크스페이스를 남기지 않는다.
    const local = loadProject(id);
    if (local) {
      const copyId = `${id}_copy_${Date.now().toString(36)}`;
      const updatedAt = saveProject(copyId, { tabs: local.tabs, activeTabId: local.activeTabId });
      addProjectMeta({
        id: copyId,
        name: copyName?.trim() || `${metaOf(id)?.name ?? '작품'} (이 기기)`,
        tabCount: local.tabs.length,
        updatedAt,
      });
    }
    applyRemote(id, parsed.ws, remote.rev, metaOf(id)?.name ?? nameOf(parsed, id));
    syncStatus.set('idle');
    return;
  }

  // 'local' — 내 것으로 덮어쓴다 (원격 rev 를 base 로 올린다)
  const local = loadProject(id);
  if (local) await push(id, local, remote.rev);
}

/** 원격 내용을 로컬 프로젝트에 적용 */
function applyRemote(id: string, parsed: SavedWorkspace, rev: string, name: string): void {
  const savedAt = saveProject(id, { tabs: parsed.tabs, activeTabId: parsed.activeTabId });
  if (!metaOf(id)) {
    addProjectMeta({ id, name, tabCount: parsed.tabs.length, updatedAt: savedAt });
  }
  patchMeta(id, { rev, syncedAt: savedAt, name });
}

/**
 * 원격 파일 읽기.
 * `workspaceName` 은 우리 확장 필드라 검증이 걸러낸다 — 원본에서 따로 집는다.
 */
function parseRemote(content: string): { ws: SavedWorkspace; name?: string } {
  const raw = JSON.parse(content) as Partial<NamedWorkspace>;
  return {
    ws: validateWorkspace(raw),
    ...(typeof raw.workspaceName === 'string' && raw.workspaceName ? { name: raw.workspaceName } : {}),
  };
}

function nameOf(parsed: { ws: SavedWorkspace; name?: string }, id: string): string {
  return parsed.name || parsed.ws.tabs[0]?.name || id;
}

/**
 * 올리기 (조건부 — 그 사이 원격이 바뀌었으면 거부된다).
 *
 * **저장된 내용 그대로** 올린다. 올릴 때 다시 직렬화하면 저장 시각이 달라져
 * "로컬이 그 뒤에 바뀌었다" 로 잘못 읽힌다.
 */
async function push(id: string, saved: SavedWorkspace, baseRev?: string): Promise<void> {
  const serialized = saved;
  const named: NamedWorkspace = {
    ...serialized,
    workspaceId: id,
    workspaceName: metaOf(id)?.name ?? id,
  };
  syncStatus.set('syncing');
  try {
    const up = await uploadFile({
      path: pathOf(id),
      content: JSON.stringify(named, null, 2),
      mode: baseRev ? { update: baseRev } : 'overwrite',
    });
    patchMeta(id, { rev: up.rev, syncedAt: serialized.savedAt });
    lastSyncAt.set(new Date());
    syncStatus.set('idle');
  } catch (err) {
    if (err instanceof DropboxApiError && err.status === 409) {
      // 다른 기기가 먼저 올렸다 — 작업을 막지 않고 멈춘다. 다음에 열 때 정리된다.
      syncStatus.set('conflict');
      return;
    }
    syncStatus.set('error');
    syncError.set(err instanceof Error ? err.message : String(err));
  }
}

// ── 자동 올리기 ────────────────────────────────────────────

let timer: ReturnType<typeof setTimeout> | null = null;
let unsubscribe: (() => void) | null = null;

/** 열어 둔 프로젝트의 변경을 debounce 해서 올린다 */
export function startAutoPush(): void {
  if (unsubscribe) return;
  let first = true;
  unsubscribe = workspace.subscribe(() => {
    if (first) { first = false; return; }   // 구독 즉시 한 번 호출되는 값은 무시
    schedule();
  });
}

export function stopAutoPush(): void {
  unsubscribe?.();
  unsubscribe = null;
  if (timer) { clearTimeout(timer); timer = null; }
}

function schedule(): void {
  if (!isConnected()) return;
  if (get(syncStatus) === 'conflict') return;   // 충돌 중에는 올리지 않는다
  const id = get(openProjectId);
  if (!id) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { void pushOpen(); }, PUSH_DEBOUNCE_MS);
}

/** 지금 열어 둔 작품을 올린다 */
export async function pushOpen(): Promise<void> {
  const id = get(openProjectId);
  if (!id || !isConnected()) return;
  // 먼저 로컬에 갈무리하고, **그 내용 그대로** 올린다
  const ws = get(workspace);
  saveProject(id, { tabs: ws.tabs.map(toSavedTab), activeTabId: ws.activeTabId });
  refreshProjects();
  const saved = loadProject(id);
  if (saved) await push(id, saved, metaOf(id)?.rev);
}

/** 원격 파일 지우기 (작품 삭제 시) */
export async function deleteRemote(id: string): Promise<void> {
  if (!isConnected()) return;
  try {
    await deleteFile(pathOf(id));
    remoteProjects.update((l) => l.filter((r) => r.id !== id));
  } catch { /* 없으면 그만 */ }
}

// ── 열기 (동기화 포함) ─────────────────────────────────────

/** 시작 화면이 띄울 충돌 — 사용자가 고를 때까지 그 작품은 열지 않는다 */
export const pendingConflict = writable<{
  id: string;
  remote: { savedAt: string; tabNames: string[] };
  local: { savedAt: string; tabNames: string[] };
} | null>(null);

/**
 * 원격과 한 번 맞춘 뒤 연다.
 * 둘 다 바뀌었으면 열지 않고 `pendingConflict` 를 세운다 (시작 화면이 묻는다).
 */
export async function openProjectSynced(id: string): Promise<boolean> {
  const result = await syncBeforeOpen(id);
  if (result.kind === 'conflict') {
    pendingConflict.set({ id, remote: result.remote, local: result.local });
    return false;
  }
  return openProject(id);
}

/** 충돌을 고르고 나서 연다 */
export async function resolveAndOpen(
  id: string,
  choice: 'remote' | 'local' | 'both',
  copyName?: string,
): Promise<boolean> {
  await resolveOpenConflict(id, choice, copyName);
  pendingConflict.set(null);
  return openProject(id);
}
