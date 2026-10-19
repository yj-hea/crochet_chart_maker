/**
 * Dropbox 작품 목록 파일 — `/workspaces/index.json`.
 *
 * ## 왜 두는가
 *
 * 폴더 목록(`listFolder`)은 **파일 이름**밖에 알려 주지 않는데, 파일 이름은 작품 id 다
 * (`pj_m2x…`). 작품 이름은 내용 파일 안(`workspaceName`)에 있어서, 다른 기기에서는
 * 내려받아 열어 보기 전까지 작품이 키 값으로만 보였다. 작품 수만큼 내려받아 이름을
 * 읽을 수는 없으니, **이름만 모아 둔 작은 파일**을 폴더에 하나 둔다.
 *
 * ## 무엇을 올리고 무엇을 안 올리는가
 *
 * 여기 올라가는 것은 **id → 이름**(과 눈대중용 도안 수·시각)뿐이다.
 * 열어 둠/치워 둠·순서·마지막 연 시각은 **기기마다 다른 것이 맞으므로** 올리지 않는다 —
 * 노트북에서 치워 둔 작품이 데스크톱에서도 사라지면 곤란하다.
 * 그 값들은 그대로 로컬 목록(`lib/projects.ts`)에 남는다.
 *
 * ## 고칠 때
 *
 * 작품 파일을 올린 뒤·이름을 바꾼 뒤·원격 파일을 지운 뒤에 이 파일의 그 줄만 고친다.
 * 두 기기가 동시에 고치면 rev 조건부 업로드가 거부되므로, 다시 읽어 한 번 더 시도한다.
 * 그래도 안 되면 조용히 포기한다 — 작품 내용은 이미 올라갔고, 이름은 다음 기회에 맞는다.
 */

import { uploadFile, downloadFile, DropboxApiError } from './api';

export const WORKSPACE_FOLDER = '/workspaces';
export const INDEX_NAME = 'index.json';
export const INDEX_PATH = `${WORKSPACE_FOLDER}/${INDEX_NAME}`;
export const WORKSPACE_INDEX_VERSION = 1;

export interface RemoteIndexEntry {
  id: string;
  name: string;
  /** 눈대중용 — 목록에 "도안 N개" 로 보여 준다 */
  tabCount?: number;
  /** 그 이름을 적은 때 (ISO) */
  updatedAt?: string;
}

export interface WorkspaceIndex {
  version: number;
  updatedAt: string;
  projects: RemoteIndexEntry[];
}

const EMPTY: WorkspaceIndex = { version: WORKSPACE_INDEX_VERSION, updatedAt: '', projects: [] };

/**
 * 마지막으로 읽거나 쓴 목록.
 * 올릴 때마다 내려받지 않으려고 둔다 — 바뀐 것이 없으면 왕복을 건너뛴다.
 */
let cached: WorkspaceIndex | null = null;

export function cachedIndex(): WorkspaceIndex | null {
  return cached;
}

/** 테스트·로그아웃용 — 기억해 둔 목록을 버린다 */
export function forgetIndex(): void {
  cached = null;
}

export function parseIndex(content: string): WorkspaceIndex {
  const raw = JSON.parse(content) as Partial<WorkspaceIndex>;
  const projects = Array.isArray(raw.projects)
    ? raw.projects.filter(isEntry).map((e) => ({
      id: e.id,
      name: e.name,
      ...(Number.isFinite(e.tabCount) ? { tabCount: e.tabCount } : {}),
      ...(typeof e.updatedAt === 'string' ? { updatedAt: e.updatedAt } : {}),
    }))
    : [];
  return {
    version: WORKSPACE_INDEX_VERSION,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
    projects,
  };
}

function isEntry(v: unknown): v is RemoteIndexEntry {
  return !!v && typeof v === 'object'
    && typeof (v as RemoteIndexEntry).id === 'string'
    && typeof (v as RemoteIndexEntry).name === 'string';
}

/** 목록 읽기. 파일이 없거나 깨졌으면 빈 목록 */
export async function readIndex(): Promise<{ index: WorkspaceIndex; rev?: string }> {
  const file = await downloadFile(INDEX_PATH);
  if (!file) {
    cached = { ...EMPTY };
    return { index: cached };
  }
  try {
    cached = parseIndex(file.content);
  } catch {
    // 깨진 목록은 빈 것으로 보고 다음 쓰기에서 새로 만든다 (내용 파일은 멀쩡하다)
    cached = { ...EMPTY };
  }
  return { index: cached, rev: file.rev };
}

/**
 * 목록의 한 줄만 고친다.
 *
 * `apply` 가 `null` 을 돌려주면 (고칠 것이 없으면) 아무것도 올리지 않는다.
 */
async function mutate(
  apply: (entries: RemoteIndexEntry[]) => RemoteIndexEntry[] | null,
): Promise<WorkspaceIndex | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { index, rev } = await readIndex();
    const next = apply(index.projects);
    if (!next) return index;
    const body: WorkspaceIndex = {
      version: WORKSPACE_INDEX_VERSION,
      updatedAt: new Date().toISOString(),
      projects: next,
    };
    try {
      await uploadFile({
        path: INDEX_PATH,
        content: JSON.stringify(body, null, 2),
        mode: rev ? { update: rev } : 'overwrite',
      });
      cached = body;
      return body;
    } catch (err) {
      // 그사이 다른 기기가 고쳤다 — 다시 읽어 한 번만 더 시도한다
      if (err instanceof DropboxApiError && err.status === 409 && attempt === 0) continue;
      throw err;
    }
  }
  return null;
}

/**
 * 작품 하나의 이름을 목록에 적는다 (없으면 더한다).
 * 적혀 있는 것과 같으면 올리지 않는다.
 */
export async function noteProject(entry: RemoteIndexEntry): Promise<void> {
  const known = cached?.projects.find((p) => p.id === entry.id);
  if (known && known.name === entry.name && known.tabCount === entry.tabCount) return;
  await mutate((entries) => {
    const prev = entries.find((p) => p.id === entry.id);
    if (prev && prev.name === entry.name && prev.tabCount === entry.tabCount) return null;
    const row: RemoteIndexEntry = { ...entry, updatedAt: new Date().toISOString() };
    return prev
      ? entries.map((p) => (p.id === entry.id ? { ...p, ...row } : p))
      : [...entries, row];
  });
}

/** 원격 파일을 지웠을 때 — 목록에서도 뺀다 */
export async function forgetProject(id: string): Promise<void> {
  await mutate((entries) => (entries.some((p) => p.id === id)
    ? entries.filter((p) => p.id !== id)
    : null));
}
