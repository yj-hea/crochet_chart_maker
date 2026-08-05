/**
 * 코 코멘트(`"..."`)를 소스 텍스트에서 찾는 도구.
 *
 * 색 표기와 마찬가지로, 에디터는 **타이핑 도중에도** 매 키 입력마다 판단해야 해서
 * AST 를 쓸 수 없다 (그 순간은 파싱이 실패해 AST 가 없다). 그래서 텍스트를 직접 훑는다.
 *
 * 토크나이저(`tokenizer.ts` 의 STRING 규칙)와 같은 규칙을 따른다 — `\` 이스케이프를
 * 인정하고, 닫는 따옴표가 없으면 문자열로 치지 않는다.
 */

/** 소스에서 찾은 코멘트 하나 */
export interface CommentToken {
  /** 여는 `"` 위치 */
  start: number;
  /** 닫는 `"` 다음 위치 (배타적). 닫히지 않았으면 문서 끝 */
  end: number;
  /** 따옴표를 벗기고 이스케이프를 푼 알맹이 */
  value: string;
  /** 닫는 따옴표가 있는가 — 없으면 아직 입력 중이다 */
  closed: boolean;
}

/** 소스를 훑어 코멘트를 모두 찾는다 */
export function scanComments(source: string): CommentToken[] {
  const out: CommentToken[] = [];
  let i = 0;
  while (i < source.length) {
    if (source[i] !== '"') { i++; continue; }
    const start = i;
    i++;
    let value = '';
    let closed = false;
    while (i < source.length) {
      const c = source[i]!;
      if (c === '\\' && i + 1 < source.length) {
        value += source[i + 1]!;
        i += 2;
        continue;
      }
      if (c === '"') { i++; closed = true; break; }
      value += c;
      i++;
    }
    out.push({ start, end: i, value, closed });
  }
  return out;
}

/**
 * 화면에서 쪽지 아이콘으로 접을 코멘트들.
 *
 * 색 표기와 같은 두 가지 예외를 둔다:
 *  - 아직 닫히지 않은 입력 중인 코멘트 — 글자가 보여야 마저 칠 수 있다
 *  - 커서·선택이 걸쳐 있는 코멘트 — 접혀 있으면 키보드로 고칠 수 없다
 *
 * 빈 코멘트(`""`)도 접는다 — 지우려면 아이콘을 눌러 커서를 넣으면 된다.
 */
export function foldableComments(
  source: string,
  selFrom: number,
  selTo: number,
): CommentToken[] {
  const from = Math.min(selFrom, selTo);
  const to = Math.max(selFrom, selTo);
  return scanComments(source).filter(
    (c) => c.closed && (to < c.start || from > c.end),
  );
}
