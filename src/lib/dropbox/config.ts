/**
 * Dropbox 앱 설정.
 *
 * Vite env 변수 `VITE_DROPBOX_APP_KEY` 로 주입. 설정 안 된 경우 Dropbox 기능은
 * UI 에서 숨김 처리된다 (개발 환경에서 앱 키 없어도 앱이 동작하도록).
 */

const APP_KEY = (import.meta.env.VITE_DROPBOX_APP_KEY ?? '').trim();

export const DROPBOX_APP_KEY = APP_KEY;

/** Dropbox 통합 기능이 활성화된 상태인지 */
export function isDropboxEnabled(): boolean {
  return APP_KEY.length > 0;
}

/** OAuth redirect URI — 현재 origin + 경로 기반. Dropbox 앱 설정에 등록해야 함. */
export function getRedirectUri(): string {
  if (typeof window === 'undefined') return '';
  const { origin, pathname } = window.location;
  // pathname 에서 쿼리/해시 제외한 baseurl — `index.html` 나 `/` 로 정규화
  const base = pathname.endsWith('/') ? pathname : pathname.replace(/[^/]+$/, '');
  return `${origin}${base}`;
}

/** App folder 내 저장 경로 prefix. */
export const SAVE_PATH_PREFIX = '';
