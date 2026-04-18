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
    // conflict — path_lookup/not_found 는 정상 (없음)
    const err = (await res.json().catch(() => null)) as { error?: { '.tag'?: string; path_lookup?: { '.tag'?: string } } } | null;
    const tag = err?.error?.path_lookup?.['.tag'];
    if (tag === 'not_found') return null;
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
