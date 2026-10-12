/**
 * 프로젝트 저장소 — **작품 하나 = 프로젝트 하나**.
 *
 * 한 프로젝트 안의 도안 탭들은 그 작품을 만드는 데 필요한 조각들이다
 * (인형: 머리·몸통·다리 A/B · 옷: 앞판·뒤판·소매).
 *
 * ## 왜 쪼개는가
 *
 * 예전에는 로컬에 **열려 있는 워크스페이스 하나**(`crochet-chart:workspace`)만 있었고,
 * Dropbox 쪽은 따로 여러 워크스페이스를 가리키고 있었다. 그래서 "지금 로컬 내용이 어느
 * 프로젝트의 것인지" 를 잃어버려 엉뚱한 파일을 덮어쓰거나 사본이 쌓였다.
 * 이제 로컬도 프로젝트별로 나눠 담고, 무엇을 열어 두었는지 명시한다.
 *
 * ```
 * crochet-chart:projects        목록(메타) + 열어 둔 프로젝트 id
 * crochet-chart:project.<id>    프로젝트 내용 (= 예전 워크스페이스 한 벌)
 * crochet-chart:workspace       예전 키 — 마이그레이션 뒤에도 백업으로 남겨 둔다
 * ```
 */

import {
  serializeWorkspace,
  validateWorkspace,
  type SavedWorkspace,
  type SavedWorkspaceTab,
} from './persistence';

const LIST_KEY = 'crochet-chart:projects';
const PROJECT_PREFIX = 'crochet-chart:project.';
/** 예전 단일 워크스페이스 키 — 마이그레이션 원본 */
const LEGACY_KEY = 'crochet-chart:workspace';

export const PROJECT_LIST_VERSION = 1;

export interface ProjectMeta {
  id: string;
  name: string;
  /** 도안 수 — 목록에 보여 준다 */
  tabCount: number;
  /** 마지막으로 저장된 시각 (ISO) */
  updatedAt: string;
  /** 마지막으로 연 시각 (ISO) — 목록 정렬에 쓴다 */
  openedAt?: string;
  /** 마지막으로 주고받은 Dropbox rev — 열 때 어느 쪽이 새것인지 가린다 */
  rev?: string;
  /** 그 rev 와 같은 내용의 `savedAt` — 이 뒤에 고쳤으면 로컬이 새것이다 */
  syncedAt?: string;
}

export interface ProjectIndex {
  version: number;
  projects: ProjectMeta[];
  /** 열어 둔 프로젝트. 없으면 시작 화면 */
  openId?: string;
}

const EMPTY: ProjectIndex = { version: PROJECT_LIST_VERSION, projects: [] };

function hasStorage(): boolean {
  try {
    return typeof globalThis.localStorage !== 'undefined' && globalThis.localStorage !== null;
  } catch {
    return false;
  }
}

function read(key: string): string | null {
  if (!hasStorage()) return null;
  try {
    return globalThis.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  if (!hasStorage()) return;
  try {
    globalThis.localStorage.setItem(key, value);
  } catch { /* 용량 초과 등 — 조용히 넘어간다 */ }
}

function remove(key: string): void {
  if (!hasStorage()) return;
  try {
    globalThis.localStorage.removeItem(key);
  } catch { /* ignore */ }
}

export function makeProjectId(): string {
  return `pj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** 목록을 읽는다. 예전 단일 워크스페이스가 있으면 프로젝트 하나로 옮긴다 */
export function loadProjectIndex(): ProjectIndex {
  const raw = read(LIST_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<ProjectIndex>;
      const projects = Array.isArray(parsed.projects)
        ? parsed.projects.filter(isMeta).map(normalizeMeta)
        : [];
      return {
        version: PROJECT_LIST_VERSION,
        projects,
        ...(typeof parsed.openId === 'string' && projects.some((p) => p.id === parsed.openId)
          ? { openId: parsed.openId }
          : {}),
      };
    } catch {
      // 목록이 깨졌으면 아래 마이그레이션으로 떨어진다 (내용 파일은 그대로 남아 있다)
    }
  }
  return migrateLegacy();
}

function isMeta(v: unknown): v is ProjectMeta {
  return !!v && typeof v === 'object'
    && typeof (v as ProjectMeta).id === 'string'
    && typeof (v as ProjectMeta).name === 'string';
}

function normalizeMeta(m: ProjectMeta): ProjectMeta {
  return {
    id: m.id,
    name: m.name || '이름 없는 작품',
    tabCount: Number.isFinite(m.tabCount) ? m.tabCount : 0,
    updatedAt: typeof m.updatedAt === 'string' ? m.updatedAt : '',
    ...(typeof m.openedAt === 'string' ? { openedAt: m.openedAt } : {}),
    ...(typeof m.rev === 'string' ? { rev: m.rev } : {}),
    ...(typeof m.syncedAt === 'string' ? { syncedAt: m.syncedAt } : {}),
  };
}

/**
 * 예전 워크스페이스 하나 → 프로젝트 하나.
 * 원본 키는 지우지 않는다 (되돌릴 수 있게).
 */
function migrateLegacy(): ProjectIndex {
  const raw = read(LEGACY_KEY);
  if (!raw) return { ...EMPTY };
  let saved: SavedWorkspace;
  try {
    saved = validateWorkspace(JSON.parse(raw));
  } catch {
    return { ...EMPTY };
  }
  const id = makeProjectId();
  const name = saved.tabs[0]?.name || '내 작품';
  write(projectKey(id), JSON.stringify(saved));
  const index: ProjectIndex = {
    version: PROJECT_LIST_VERSION,
    projects: [{
      id,
      name,
      tabCount: saved.tabs.length,
      updatedAt: saved.savedAt || new Date().toISOString(),
    }],
  };
  saveProjectIndex(index);
  return index;
}

export function saveProjectIndex(index: ProjectIndex): void {
  write(LIST_KEY, JSON.stringify({ ...index, version: PROJECT_LIST_VERSION }));
}

function projectKey(id: string): string {
  return `${PROJECT_PREFIX}${id}`;
}

/** 프로젝트 내용 읽기. 없거나 깨졌으면 null */
export function loadProject(id: string): SavedWorkspace | null {
  const raw = read(projectKey(id));
  if (!raw) return null;
  try {
    return validateWorkspace(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** 프로젝트 내용 저장 (목록의 메타도 함께 갱신) */
export function saveProject(
  id: string,
  ws: { tabs: SavedWorkspaceTab[]; activeTabId: string },
): string {
  const index = loadProjectIndex();
  const prev = index.projects.find((p) => p.id === id);
  const base = serializeWorkspace(ws);
  // 저장 시각은 **반드시 커진다** — 같은 밀리초에 두 번 저장해도 "고쳤다" 를 놓치지 않는다
  // (동기화가 로컬이 새것인지 이 값으로 가린다)
  const savedAt = prev?.updatedAt && base.savedAt <= prev.updatedAt
    ? new Date(Date.parse(prev.updatedAt) + 1).toISOString()
    : base.savedAt;
  const serialized = { ...base, savedAt };
  write(projectKey(id), JSON.stringify(serialized));
  saveProjectIndex({
    ...index,
    projects: index.projects.map((p) => (p.id === id
      ? { ...p, tabCount: ws.tabs.length, updatedAt: savedAt }
      : p)),
  });
  return savedAt;
}

export function deleteProject(id: string): void {
  remove(projectKey(id));
  const index = loadProjectIndex();
  saveProjectIndex({
    ...index,
    projects: index.projects.filter((p) => p.id !== id),
    ...(index.openId === id ? { openId: undefined } : {}),
  });
}

/**
 * 열어 둔 프로젝트 기록 (없으면 시작 화면).
 * 같은 밀리초에 연속으로 열어도 순서가 뒤집히지 않도록 **단조 증가**시킨다.
 */
export function setOpenProject(id: string | undefined): void {
  const index = loadProjectIndex();
  const latest = index.projects.reduce(
    (max, p) => (p.openedAt && p.openedAt > max ? p.openedAt : max),
    '',
  );
  const now = new Date().toISOString();
  const openedAt = latest && now <= latest
    ? new Date(Date.parse(latest) + 1).toISOString()
    : now;
  saveProjectIndex({
    ...index,
    projects: id
      ? index.projects.map((p) => (p.id === id ? { ...p, openedAt } : p))
      : index.projects,
    ...(id ? { openId: id } : { openId: undefined }),
  });
}

/** 목록에 새 프로젝트를 더한다 (내용은 따로 저장한다) */
export function addProjectMeta(meta: Omit<ProjectMeta, 'updatedAt'> & { updatedAt?: string }): ProjectMeta {
  const index = loadProjectIndex();
  const full: ProjectMeta = {
    ...meta,
    updatedAt: meta.updatedAt ?? new Date().toISOString(),
  };
  saveProjectIndex({ ...index, projects: [...index.projects, full] });
  return full;
}

export function renameProject(id: string, name: string): void {
  const index = loadProjectIndex();
  saveProjectIndex({
    ...index,
    projects: index.projects.map((p) => (p.id === id ? { ...p, name } : p)),
  });
}

/** 목록 정렬 — 마지막으로 연 순, 그다음 수정 순 */
export function sortProjects(projects: ReadonlyArray<ProjectMeta>): ProjectMeta[] {
  return [...projects].sort((a, b) => {
    const at = a.openedAt ?? a.updatedAt ?? '';
    const bt = b.openedAt ?? b.updatedAt ?? '';
    return bt.localeCompare(at);
  });
}
