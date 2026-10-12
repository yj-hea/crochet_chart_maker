/**
 * 프로젝트(= 작품) 스토어.
 *
 * `tabs.ts` 의 `workspace` 는 **지금 열어 둔 프로젝트의 도안들**이다. 그래서 탭 관련
 * 코드는 그대로 두고, 여기서 "어느 프로젝트를 열고 닫는가" 만 맡는다.
 *
 * 열어 둔 프로젝트가 없으면(`openProjectId === null`) 앱은 시작 화면을 보여 준다 —
 * 여는 순간이 곧 동기화를 결정하는 순간이라 사용자가 그 순간을 보고 있어야 한다.
 */

import { writable, get } from 'svelte/store';
import {
  loadProjectIndex,
  loadProject,
  saveProject,
  deleteProject as deleteProjectData,
  setOpenProject,
  addProjectMeta,
  renameProject as renameProjectMeta,
  makeProjectId,
  sortProjects,
  type ProjectMeta,
} from '$lib/projects';
import { workspace, applyWorkspace, toSavedTab, emptyWorkspace, withoutPersist } from './tabs';

/** 목록 (마지막으로 연 순) */
export const projects = writable<ProjectMeta[]>(sortProjects(loadProjectIndex().projects));
/** 열어 둔 프로젝트 id. null 이면 시작 화면 */
export const openProjectId = writable<string | null>(null);

function refresh(): void {
  projects.set(sortProjects(loadProjectIndex().projects));
}

/** 목록을 다시 읽는다 (동기화가 메타를 고친 뒤 부른다) */
export const refreshProjects = refresh;

/** 지금 열려 있는 내용을 그 프로젝트에 저장한다 (자동 저장이 부른다) */
export function persistOpenProject(): void {
  const id = get(openProjectId);
  if (!id) return;
  const ws = get(workspace);
  saveProject(id, { tabs: ws.tabs.map(toSavedTab), activeTabId: ws.activeTabId });
  refresh();
}

/**
 * 프로젝트 열기.
 *
 * 열려 있던 작품을 먼저 저장하고, **저장을 멈춘 채** 작업대를 갈아 끼운 뒤
 * 새 id 를 세운다 — 중간에 저장이 돌면 새 내용이 이전 작품에 쓰인다.
 */
export function openProject(id: string): boolean {
  const saved = loadProject(id);
  if (!saved) return false;
  // 같은 작품을 다시 여는 경우(동기화로 내용을 새로 받은 뒤)에는 저장하지 않는다 —
  // 메모리에 남은 낡은 내용이 방금 받은 것을 덮어쓴다.
  if (get(openProjectId) !== id) persistOpenProject();
  withoutPersist(() => {
    applyWorkspace(saved);
    openProjectId.set(id);
  });
  setOpenProject(id);
  refresh();
  return true;
}

/** 닫고 시작 화면으로 — 열어 둔 내용은 이미 저장돼 있다 */
export function closeProject(): void {
  persistOpenProject();
  withoutPersist(() => {
    openProjectId.set(null);
    workspace.set(emptyWorkspace());
  });
  setOpenProject(undefined);
  refresh();
}

/**
 * 새 작품. 지금 열린 도안을 가져오려면 `from: 'current'`.
 * 만든 뒤 바로 연다.
 */
export function createProject(name: string, opts: { from?: 'current' | 'empty' } = {}): string {
  // 지금 작품을 먼저 갈무리해 둔다 — 새 작품을 여는 과정에서 작업대가 갈린다
  persistOpenProject();
  const id = makeProjectId();
  const ws = opts.from === 'current' ? get(workspace) : emptyWorkspace();
  const payload = { tabs: ws.tabs.map(toSavedTab), activeTabId: ws.activeTabId };
  const updatedAt = saveProject(id, payload);
  addProjectMeta({ id, name: name.trim() || '새 작품', tabCount: payload.tabs.length, updatedAt });
  openProject(id);
  return id;
}

/** 복제 — 내용을 그대로 베낀 새 작품 */
export function duplicateProject(id: string, name?: string): string | undefined {
  const saved = loadProject(id);
  if (!saved) return undefined;
  const meta = get(projects).find((p) => p.id === id);
  const newId = makeProjectId();
  const updatedAt = saveProject(newId, { tabs: saved.tabs, activeTabId: saved.activeTabId });
  addProjectMeta({
    id: newId,
    name: name ?? copyName(meta?.name ?? '작품', get(projects).map((p) => p.name)),
    tabCount: saved.tabs.length,
    updatedAt,
  });
  refresh();
  return newId;
}

export function renameProject(id: string, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  renameProjectMeta(id, trimmed);
  refresh();
}

/** 삭제. 열어 둔 것을 지우면 시작 화면으로 돌아간다 */
export function removeProject(id: string): void {
  const wasOpen = get(openProjectId) === id;
  deleteProjectData(id);
  if (wasOpen) {
    withoutPersist(() => {
      openProjectId.set(null);
      workspace.set(emptyWorkspace());
    });
  }
  refresh();
}

/** 마지막으로 연 작품 (시작 화면에서 맨 위에 둔다) */
export function lastOpened(): ProjectMeta | undefined {
  return get(projects)[0];
}

function copyName(original: string, taken: ReadonlyArray<string>): string {
  const names = new Set(taken);
  const base = `${original} 사본`;
  if (!names.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base} ${n}`;
    if (!names.has(candidate)) return candidate;
  }
}

/**
 * 부팅 — 열어 둔 프로젝트가 기록돼 있어도 **자동으로 열지 않는다**.
 * 시작 화면에서 고르게 하고, 여기서는 목록만 채운다.
 */
export function initProjects(): void {
  refresh();
}
