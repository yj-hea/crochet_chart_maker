/**
 * Dropbox Chooser/Saver (dropins.js) 동적 로더.
 *
 * 앱 키가 있을 때만 스크립트를 주입하여 window.Dropbox 를 사용할 수 있게 한다.
 */

import { DROPBOX_APP_KEY, isDropboxEnabled } from './config';

declare global {
  interface Window {
    Dropbox?: DropboxDropins;
  }
}

/** Chooser 에 필요한 최소 타입만 정의 — 공식 타입 없음 */
export interface DropboxDropins {
  choose: (opts: ChooseOptions) => void;
  /** Saver 는 사용하지 않지만 인터페이스만 둠 */
  save?: (opts: unknown) => void;
}

export interface ChooseOptions {
  success: (files: DropinsFile[]) => void;
  cancel?: () => void;
  linkType?: 'preview' | 'direct';
  multiselect?: boolean;
  extensions?: string[];
  folderselect?: boolean;
}

export interface DropinsFile {
  id: string;
  name: string;
  link: string;
  bytes: number;
  icon: string;
  thumbnailLink?: string;
  isDir: boolean;
}

let loadPromise: Promise<DropboxDropins> | null = null;

export function loadDropins(): Promise<DropboxDropins> {
  if (!isDropboxEnabled()) {
    return Promise.reject(new Error('Dropbox 통합이 비활성화됨 (VITE_DROPBOX_APP_KEY 미설정)'));
  }
  if (window.Dropbox) return Promise.resolve(window.Dropbox);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://www.dropbox.com/static/api/2/dropins.js';
    script.id = 'dropboxjs';
    script.setAttribute('data-app-key', DROPBOX_APP_KEY);
    script.onload = () => {
      if (window.Dropbox) resolve(window.Dropbox);
      else reject(new Error('Dropbox dropins.js 로드 실패'));
    };
    script.onerror = () => reject(new Error('Dropbox dropins.js 네트워크 오류'));
    document.head.appendChild(script);
  });
  return loadPromise;
}
