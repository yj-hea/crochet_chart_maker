/**
 * Dropbox HTTP API 래퍼 — 파일 존재 확인 + 업로드.
 *
 * App folder scope 기준: 경로는 `/` (app folder 루트) 부터 시작.
 * 예: `/my-pattern.crochet.json`
 */

import { getAccessToken } from './auth';

const CONTENT_URL = 'https://content.dropboxapi.com/2/files/upload';
const API_URL = 'https://api.dropboxapi.com/2/files';

export class DropboxApiError extends Error {
  constructor(public status: number, public detail: string) {
    super(`Dropbox API ${status}: ${detail}`);
    this.name = 'DropboxApiError';
  }
}

/** 경로 정규화 — 항상 `/` 로 시작하도록. */
function normalizePath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return '/';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

/**
 * 지정 경로에 파일이 존재하는지 확인. 존재 시 rev 반환, 없으면 null.
 */
export async function getFileRev(path: string): Promise<string | null> {
  const token = await getAccessToken();
  if (!token) throw new Error('Dropbox 로그인 필요');

  const res = await fetch(`${API_URL}/get_metadata`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ path: normalizePath(path) }),
  });
  if (res.status === 409) {
    // 파일 없음은 정상 응답 (null). 엔드포인트별로 에러 구조가 달라 여러 필드 체크.
    //   - /get_metadata: { error: { ".tag": "path", path: { ".tag": "not_found" } } }
    //   - /files/download 등: { error: { path_lookup: { ".tag": "not_found" } } }
    const err = (await res.json().catch(() => null)) as {
      error_summary?: string;
      error?: {
        '.tag'?: string;
        path?: { '.tag'?: string };
        path_lookup?: { '.tag'?: string };
      };
    } | null;
    const notFound =
      err?.error?.path?.['.tag'] === 'not_found' ||
      err?.error?.path_lookup?.['.tag'] === 'not_found' ||
      (err?.error_summary ?? '').startsWith('path/not_found');
    if (notFound) return null;
    throw new DropboxApiError(res.status, JSON.stringify(err));
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new DropboxApiError(res.status, txt);
  }
  const data = (await res.json()) as { rev?: string };
  return data.rev ?? null;
}

export interface UploadOptions {
  path: string;
  content: string;
  /**
   * 기존 파일 덮어쓰기 모드.
   *   - 'overwrite': 무조건 덮어씀
   *   - 'add': 존재하면 자동 이름 변경 (예: foo (1).json)
   *   - { update: rev }: rev 일치 시에만 덮어씀 (충돌 감지)
   */
  mode?: 'overwrite' | 'add' | { update: string };
}

export async function uploadFile(opts: UploadOptions): Promise<{ rev: string; name: string; path: string }> {
  const token = await getAccessToken();
  if (!token) throw new Error('Dropbox 로그인 필요');

  const mode = opts.mode ?? 'add';
  const apiArgs = {
    path: normalizePath(opts.path),
    mode: typeof mode === 'string' ? { '.tag': mode } : { '.tag': 'update', update: mode.update },
    autorename: mode === 'add',
    mute: true,
  };

  const res = await fetch(CONTENT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': JSON.stringify(apiArgs),
    },
    body: new TextEncoder().encode(opts.content),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new DropboxApiError(res.status, txt);
  }
  const data = (await res.json()) as { rev: string; name: string; path_display: string };
  return { rev: data.rev, name: data.name, path: data.path_display };
}

const DOWNLOAD_URL = 'https://content.dropboxapi.com/2/files/download';

export interface DownloadResult {
  content: string;
  rev: string;
  name: string;
  path: string;
}

/**
 * 지정 경로 파일 내용 다운로드. 없으면 null.
 */
export async function downloadFile(path: string): Promise<DownloadResult | null> {
  const token = await getAccessToken();
  if (!token) throw new Error('Dropbox 로그인 필요');

  const res = await fetch(DOWNLOAD_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Dropbox-API-Arg': JSON.stringify({ path: normalizePath(path) }),
    },
  });
  if (res.status === 409) {
    const body = await res.text().catch(() => '');
    if (body.includes('not_found') || body.includes('path/not_found')) return null;
    throw new DropboxApiError(res.status, body);
  }
  if (!res.ok) throw new DropboxApiError(res.status, await res.text().catch(() => ''));
  const meta = JSON.parse(res.headers.get('Dropbox-API-Result') ?? '{}') as {
    rev?: string; name?: string; path_display?: string;
  };
  const content = await res.text();
  return {
    content,
    rev: meta.rev ?? '',
    name: meta.name ?? '',
    path: meta.path_display ?? path,
  };
}

export interface FolderEntry {
  name: string;
  path: string;
  rev: string;
  size: number;
  serverModified: string;
}

/**
 * 폴더 내 파일 목록 (recursive=false). 폴더 자체가 없으면 빈 배열.
 */
export async function listFolder(path: string): Promise<FolderEntry[]> {
  const token = await getAccessToken();
  if (!token) throw new Error('Dropbox 로그인 필요');

  const entries: FolderEntry[] = [];
  let cursor: string | null = null;
  for (;;) {
    const url = cursor ? `${API_URL}/list_folder/continue` : `${API_URL}/list_folder`;
    const body = cursor
      ? { cursor }
      : { path: path === '/' ? '' : normalizePath(path), recursive: false, include_deleted: false };
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status === 409) {
      const txt = await res.text().catch(() => '');
      if (txt.includes('not_found') || txt.includes('path/not_found')) return entries;
      throw new DropboxApiError(res.status, txt);
    }
    if (!res.ok) throw new DropboxApiError(res.status, await res.text().catch(() => ''));
    const data = (await res.json()) as {
      entries: Array<{
        '.tag': string;
        name: string;
        path_display: string;
        rev?: string;
        size?: number;
        server_modified?: string;
      }>;
      cursor: string;
      has_more: boolean;
    };
    for (const e of data.entries) {
      if (e['.tag'] !== 'file') continue;
      entries.push({
        name: e.name,
        path: e.path_display,
        rev: e.rev ?? '',
        size: e.size ?? 0,
        serverModified: e.server_modified ?? '',
      });
    }
    if (!data.has_more) break;
    cursor = data.cursor;
  }
  return entries;
}

/** 파일 삭제. 없으면 에러. */
export async function deleteFile(path: string): Promise<void> {
  const token = await getAccessToken();
  if (!token) throw new Error('Dropbox 로그인 필요');

  const res = await fetch(`${API_URL}/delete_v2`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: normalizePath(path) }),
  });
  if (!res.ok) throw new DropboxApiError(res.status, await res.text().catch(() => ''));
}

/** 파일 이동 / 이름 변경. */
export async function moveFile(from: string, to: string): Promise<void> {
  const token = await getAccessToken();
  if (!token) throw new Error('Dropbox 로그인 필요');

  const res = await fetch(`${API_URL}/move_v2`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from_path: normalizePath(from),
      to_path: normalizePath(to),
      autorename: false,
    }),
  });
  if (!res.ok) throw new DropboxApiError(res.status, await res.text().catch(() => ''));
}
