/**
 * Dropbox OAuth 2.0 PKCE (Proof Key for Code Exchange) flow.
 *
 * SPA 환경에서 client secret 없이 access + refresh token 을 얻는 표준 방식.
 *
 * 흐름:
 *   1. startLogin(): code_verifier 생성(localStorage), code_challenge 계산,
 *      Dropbox authorize URL 로 리다이렉트.
 *   2. 사용자가 Dropbox 에서 승인 → 앱으로 `?code=...` 파라미터와 함께 리다이렉트 복귀.
 *   3. completeLoginIfPending(): URL 에 code 있으면 /token 호출해 access + refresh
 *      token 교환, localStorage 저장, URL 정리.
 *   4. 이후 getAccessToken() 은 만료 시 refresh token 으로 자동 갱신.
 *
 * 저장:
 *   - `dropbox.tokens` : { access_token, refresh_token, expires_at(ms), account_id }
 *   - `dropbox.pkce_verifier` : PKCE code_verifier (임시, 로그인 flow 완료 시 삭제)
 */

import { DROPBOX_APP_KEY, getRedirectUri, isDropboxEnabled } from './config';

const AUTHORIZE_URL = 'https://www.dropbox.com/oauth2/authorize';
const TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token';
const REVOKE_URL = 'https://api.dropboxapi.com/2/auth/token/revoke';

const TOKENS_KEY = 'dropbox.tokens';
const VERIFIER_KEY = 'dropbox.pkce_verifier';

export interface DropboxTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number; // epoch ms
  account_id?: string;
  uid?: string;
}

/** 저장된 토큰 읽기. */
export function readTokens(): DropboxTokens | null {
  try {
    const raw = localStorage.getItem(TOKENS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DropboxTokens;
    if (!parsed.access_token || !parsed.refresh_token) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeTokens(tokens: DropboxTokens): void {
  localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
}

function clearTokens(): void {
  localStorage.removeItem(TOKENS_KEY);
}

/** 유효한 access_token 반환. 만료 임박이면 refresh 수행. */
export async function getAccessToken(): Promise<string | null> {
  const tokens = readTokens();
  if (!tokens) return null;
  // 만료 1분 전이면 미리 refresh
  if (Date.now() + 60_000 >= tokens.expires_at) {
    const refreshed = await refreshAccessToken(tokens.refresh_token);
    if (!refreshed) {
      clearTokens();
      return null;
    }
    return refreshed.access_token;
  }
  return tokens.access_token;
}

async function refreshAccessToken(refreshToken: string): Promise<DropboxTokens | null> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: DROPBOX_APP_KEY,
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
    // refresh token 은 reuse (Dropbox 는 rotation 안 함)
  };
  const tokens: DropboxTokens = {
    access_token: json.access_token,
    refresh_token: refreshToken,
    expires_at: Date.now() + json.expires_in * 1000,
  };
  writeTokens(tokens);
  return tokens;
}

// ============================================================
// PKCE helpers
// ============================================================

function base64UrlEncode(bytes: Uint8Array): string {
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256(input: string): Promise<Uint8Array> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return new Uint8Array(hash);
}

function randomVerifier(): string {
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

// ============================================================
// Login flow
// ============================================================

/** OAuth flow 시작 — Dropbox authorize URL 로 리다이렉트. */
export async function startLogin(): Promise<void> {
  if (!isDropboxEnabled()) throw new Error('Dropbox 통합 비활성 (App key 미설정)');
  const verifier = randomVerifier();
  const challenge = base64UrlEncode(await sha256(verifier));
  sessionStorage.setItem(VERIFIER_KEY, verifier);

  const params = new URLSearchParams({
    client_id: DROPBOX_APP_KEY,
    response_type: 'code',
    redirect_uri: getRedirectUri(),
    code_challenge: challenge,
    code_challenge_method: 'S256',
    token_access_type: 'offline', // refresh_token 발급
  });
  window.location.assign(`${AUTHORIZE_URL}?${params.toString()}`);
}

/** URL 에 code 가 있으면 토큰 교환 수행. 완료 시 URL 정리, 성공/실패 반환. */
export async function completeLoginIfPending(): Promise<'none' | 'ok' | 'error'> {
  if (typeof window === 'undefined') return 'none';
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  if (!code) return 'none';

  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  if (!verifier) {
    // session storage 비었으면 (새 탭 등) flow 복구 불가
    cleanupUrl(url);
    return 'error';
  }

  try {
    const body = new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      client_id: DROPBOX_APP_KEY,
      redirect_uri: getRedirectUri(),
      code_verifier: verifier,
    });
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('Dropbox token exchange failed:', res.status, errText);
      return 'error';
    }
    const json = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      account_id?: string;
      uid?: string;
    };
    writeTokens({
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      expires_at: Date.now() + json.expires_in * 1000,
      account_id: json.account_id,
      uid: json.uid,
    });
    return 'ok';
  } catch (err) {
    console.error('Dropbox OAuth complete error:', err);
    return 'error';
  } finally {
    sessionStorage.removeItem(VERIFIER_KEY);
    cleanupUrl(url);
  }
}

function cleanupUrl(url: URL): void {
  url.searchParams.delete('code');
  url.searchParams.delete('state');
  url.hash = '';
  window.history.replaceState({}, '', url.toString());
}

/** 로그아웃 — Dropbox 쪽 토큰 revoke 시도 + 로컬 저장소 삭제. */
export async function logout(): Promise<void> {
  const tokens = readTokens();
  if (tokens) {
    // best-effort revoke, 실패해도 로컬은 정리
    try {
      await fetch(REVOKE_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
    } catch {
      /* ignore */
    }
  }
  clearTokens();
}

/** 현재 연결 상태. */
export function isConnected(): boolean {
  return !!readTokens();
}
