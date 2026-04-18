/**
 * Dropbox Chooser 래퍼 — `.crochet.json` 파일을 사용자의 Dropbox 에서 고르게 한다.
 * OAuth 불필요 (dropins.js 가 Dropbox 자체 세션 사용).
 */

import { loadDropins, type DropinsFile } from './dropins';

export interface PickedFile {
  name: string;
  link: string;
  bytes: number;
}

/**
 * Dropbox 파일 선택 팝업 표시. 사용자가 파일을 고르면 resolve.
 * 취소하면 null.
 */
export async function pickFile(): Promise<PickedFile | null> {
  const Dropbox = await loadDropins();
  return new Promise<PickedFile | null>((resolve) => {
    Dropbox.choose({
      success: (files: DropinsFile[]) => {
        const f = files[0];
        if (!f) { resolve(null); return; }
        resolve({ name: f.name, link: f.link, bytes: f.bytes });
      },
      cancel: () => resolve(null),
      linkType: 'direct',
      multiselect: false,
      extensions: ['.json', '.crochet.json'],
      folderselect: false,
    });
  });
}

/** 선택된 파일의 내용을 텍스트로 다운로드. */
export async function fetchPickedFile(file: PickedFile): Promise<string> {
  const res = await fetch(file.link);
  if (!res.ok) throw new Error(`Dropbox 파일 다운로드 실패 (${res.status})`);
  return res.text();
}
