/**
 * 도안 텍스트 포맷 (.txt) 직렬화·파싱.
 *
 * 포맷:
 *   # 이름
 *   <tab name>               (optional, 없으면 파일명 사용)
 *
 *   # 도형
 *   circular                 (또는 flat / 원형 / 평면, 없으면 circular)
 *
 *   # 도안 메모
 *   <마크다운 본문>          (여러 줄, optional)
 *
 *   # 도안
 *   1단:: mr, 6x
 *   > 단별 메모 (optional, 여러 `>` 줄 가능)
 *   2단:: 6v
 *
 * 손실되는 정보 (JSON 포맷 대비):
 *   - 단 방향 (forward/reverse)
 *   - 코멘트 색상 · open 상태
 *   - 스티치 인라인 코멘트/색은 source 안의 `"..."`/`:색` 으로 표현되어 손실 없이 보존됨.
 */

import type { SavedPattern, SavedComment } from './persistence';
import type { ShapeKind } from '$stores/pattern';

const DEFAULT_COMMENT_COLOR = '#FFE066';

export interface TextSerializeInput {
  name: string;
  shape: ShapeKind;
  rounds: ReadonlyArray<{ source: string }>;
  /** 패턴 전체 메모 (마크다운). 비었으면 섹션 생략. */
  patternMemo?: string;
  /** 0-based round index → 마크다운 메모 텍스트. 없는 index 는 메모 없음. */
  roundMemos?: ReadonlyMap<number, string>;
}

export function serializeAsText(input: TextSerializeInput): string {
  const sections: string[] = [];
  if (input.name.trim()) sections.push(`# 이름\n${input.name.trim()}`);
  sections.push(`# 도형\n${input.shape}`);
  const memo = input.patternMemo?.trim();
  if (memo) sections.push(`# 도안 메모\n${memo}`);

  const lines: string[] = [];
  input.rounds.forEach((r, i) => {
    lines.push(`${i + 1}단:: ${r.source}`);
    const rm = input.roundMemos?.get(i)?.trim();
    if (rm) {
      for (const ml of rm.split('\n')) lines.push(`> ${ml}`);
    }
  });
  sections.push(`# 도안\n${lines.join('\n')}`);

  return sections.join('\n\n') + '\n';
}

export interface TextImportResult {
  saved: SavedPattern;
  /** 파일 내 `# 이름` 에서 추출한 탭 이름. 없으면 undefined 로 호출자가 파일명 fallback. */
  name?: string;
}

/**
 * 텍스트 포맷을 SavedPattern 형태로 변환 — 기존 import 파이프라인과 호환되도록 comments 는
 * roundIndex 만 지정한 SavedComment 형태로 빌드 (remapSavedComments 가 실제 roundId 로 연결).
 */
export function parseTextFormat(text: string): TextImportResult {
  const lines = text.split(/\r?\n/);
  type Section = { key: string; body: string[] };
  const sections: Section[] = [];
  let current: Section | null = null;
  for (const line of lines) {
    const h = line.match(/^#\s+(.+?)\s*$/);
    if (h) {
      current = { key: h[1]!, body: [] };
      sections.push(current);
      continue;
    }
    if (current) current.body.push(line);
    // 첫 헤더 전 줄들은 무시
  }

  let name: string | undefined;
  let shape: ShapeKind = 'circular';
  let patternMemo: string | undefined;
  const rounds: { source: string; memo?: string }[] = [];

  for (const sec of sections) {
    const joined = sec.body.join('\n').trim();
    switch (sec.key) {
      case '이름':
        if (joined) name = joined.split('\n')[0]!.trim();
        break;
      case '도형': {
        const v = (joined.split('\n')[0] ?? '').trim().toLowerCase();
        if (v === 'circular' || v === '원형') shape = 'circular';
        else if (v === 'flat' || v === '평면') shape = 'flat';
        break;
      }
      case '도안 메모':
        if (joined) patternMemo = joined;
        break;
      case '도안': {
        let active: { source: string; memo?: string } | null = null;
        for (const raw of sec.body) {
          const rm = raw.match(/^\s*(\d+)\s*단\s*::\s*(.*)$/);
          if (rm) {
            active = { source: rm[2]!.trim() };
            rounds.push(active);
            continue;
          }
          const mm = raw.match(/^\s*>\s?(.*)$/);
          if (mm && active) {
            active.memo = active.memo === undefined
              ? mm[1]!
              : `${active.memo}\n${mm[1]!}`;
            continue;
          }
          // 그 밖의 줄(빈 줄 등)은 무시
        }
        break;
      }
    }
  }

  const comments: SavedComment[] = [];
  if (patternMemo?.trim()) {
    comments.push({
      id: 'txt-pattern-memo',
      text: patternMemo,
      color: DEFAULT_COMMENT_COLOR,
      open: true,
      target: { kind: 'pattern' },
    });
  }
  rounds.forEach((r, i) => {
    const m = r.memo?.trim();
    if (!m) return;
    comments.push({
      id: `txt-round-memo-${i}`,
      text: m,
      color: DEFAULT_COMMENT_COLOR,
      open: true,
      target: { kind: 'round', roundIndex: i },
    });
  });

  const saved: SavedPattern = {
    version: 1,
    savedAt: '',
    shape,
    rounds: rounds.map((r) => ({ source: r.source })),
    ...(comments.length > 0 ? { comments } : {}),
  };
  return { saved, name };
}
