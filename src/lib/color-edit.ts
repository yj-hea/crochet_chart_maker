/**
 * 색 표기를 소스 텍스트에서 직접 고치는 도구.
 *
 * 도안은 텍스트가 원본이므로, 색을 바꾸는 UI(스와치 클릭·선택 범위 칠하기·팔레트
 * 일괄 변경)는 결국 **소스 문자열을 정확히 치환**하는 문제로 귀결된다.
 * 위치는 파서가 준 `StitchNode.colorRange` / `range` 를 쓴다 — 정규식으로 코 토큰을
 * 다시 찾으면 `[...]`·`tc(...)`·주석 문자열 안에서 오탐이 난다.
 *
 * 모든 함수는 순수 함수다: (소스, AST, 요청) → 새 소스.
 */

import type { ParsedRound, SequenceNode, StitchNode, AstNode } from '$lib/parser/ast';
import type { SourceRange } from '$lib/model/errors';
import { NAMED_COLORS, resolveColorValue } from '$lib/model/colors';

/** 소스에 적어 넣을 색 표기 — 이름이 있으면 이름이 읽기 좋다 */
export function colorLiteral(hex: string): string {
  const normalized = hex.toLowerCase();
  for (const [name, value] of Object.entries(NAMED_COLORS)) {
    // grey 는 gray 와 같은 값 — 먼저 나오는 gray 를 쓴다
    if (value === normalized && name !== 'grey') return name;
  }
  return normalized;
}

/** AST 를 훑어 모든 코 노드를 소스 순서대로 모은다 */
export function collectStitches(body: SequenceNode | undefined): StitchNode[] {
  const out: StitchNode[] = [];
  const walk = (node: AstNode): void => {
    if (node.type === 'stitch') { out.push(node); return; }
    if (node.type === 'sequence') { node.elements.forEach(walk); return; }
    if (node.type === 'repeat' || node.type === 'samehole' || node.type === 'tc') {
      walk(node.body);
    }
    // skip 노드는 코가 아니다
  };
  if (body) walk(body);
  return out.sort((a, b) => a.range.start - b.range.start);
}

/** 이 단에서 쓰인 색과 코 수 */
export function colorsInRound(parsed: ParsedRound | undefined): Map<string, number> {
  const counts = new Map<string, number>();
  for (const s of collectStitches(parsed?.body ?? parsed?.lastValid)) {
    if (!s.color) continue;
    counts.set(s.color, (counts.get(s.color) ?? 0) + s.count);
  }
  return counts;
}

// ============================================================
// 텍스트 스캔 — 에디터 표시용
// ============================================================

/**
 * 소스에서 찾은 색 표기 하나.
 *
 * AST 의 `colorRange` 와 달리 **입력 중인 미완성 색**(`:aa`)도 잡는다.
 * 에디터는 타이핑 도중에도 매 키 입력마다 판단해야 하는데, 그 순간은 파싱이
 * 실패해 AST 가 없기 때문이다.
 */
export interface ColorToken {
  /** `:` 위치 */
  start: number;
  /** 색 값의 끝 (배타적) */
  end: number;
  /** `:` 뒤의 원문 — `aaf`, `#aaccff`, `navy`, 입력 직후면 `` */
  raw: string;
  /** 정규화된 hex. 아직 유효하지 않으면 undefined */
  color?: string;
}

/**
 * 소스를 훑어 색 표기를 모두 찾는다.
 *
 * 주석 문자열(`"..."`) 안의 `:` 는 건너뛴다 — `2x "3:5 비율"` 의 `:5` 를
 * 색으로 오인하면 안 된다.
 */
export function scanColorTokens(source: string): ColorToken[] {
  const out: ColorToken[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i]!;
    if (ch === '"') {
      // 주석 문자열 통째로 건너뛰기 (닫는 따옴표가 없으면 끝까지)
      const close = source.indexOf('"', i + 1);
      i = close < 0 ? source.length : close + 1;
      continue;
    }
    if (ch !== ':') { i++; continue; }

    const start = i;
    let j = i + 1;
    if (source[j] === '#') j++;
    while (j < source.length && /[0-9a-zA-Z]/.test(source[j]!)) j++;
    const raw = source.slice(start + 1, j);
    out.push({ start, end: j, raw, color: resolveColorValue(raw) ?? undefined });
    i = j;
  }
  return out;
}

/** 이 위치를 품는 색 표기 (경계 포함 — 커서가 끝에 붙어 있어도 편집 중으로 본다) */
export function colorTokenAt(tokens: readonly ColorToken[], pos: number): ColorToken | undefined {
  return tokens.find((t) => t.start <= pos && pos <= t.end);
}

/**
 * 화면에서 동그라미로 접을 색 표기들.
 *
 * 두 가지는 접지 않는다:
 *  - 아직 유효하지 않은 입력 중인 색 (`:aa`) — 글자가 보여야 마저 칠 수 있다
 *  - 커서·선택이 걸쳐 있는 색 — 접혀 있으면 키보드로 고칠 수 없다
 */
export function foldableColorTokens(
  source: string,
  selFrom: number,
  selTo: number,
): ColorToken[] {
  const from = Math.min(selFrom, selTo);
  const to = Math.max(selFrom, selTo);
  return scanColorTokens(source).filter(
    (t) => t.color !== undefined && (to < t.start || from > t.end),
  );
}

/** 색 표기 하나를 다른 색으로 교체 (hex 가 undefined 면 제거) */
export function replaceColorToken(
  source: string,
  token: { start: number; end: number },
  hex: string | undefined,
): string {
  const text = hex === undefined ? '' : `:${colorLiteral(hex)}`;
  return source.slice(0, token.start) + text + source.slice(token.end);
}

/** 소스에 적용할 치환 하나 */
interface Edit {
  range: SourceRange;
  text: string;
}

/** 겹치지 않는 치환들을 뒤에서부터 적용 (앞선 치환이 뒤 위치를 밀지 않도록) */
function applyEdits(source: string, edits: Edit[]): string {
  const sorted = [...edits].sort((a, b) => b.range.start - a.range.start);
  let out = source;
  for (const e of sorted) {
    out = out.slice(0, e.range.start) + e.text + out.slice(e.range.end);
  }
  return out;
}

/**
 * 코 하나의 색을 바꾸거나(문자열) 지운다(undefined).
 *
 * - 이미 색이 있으면 그 표기를 통째로 갈아끼운다
 * - 없으면 코 끝에 `:색` 을 붙인다. 주석(`"..."`)이 있으면 주석 **앞**에 넣어
 *   `1v:navy "옆선"` 처럼 읽히게 한다
 */
function editFor(source: string, stitch: StitchNode, hex: string | undefined): Edit | undefined {
  if (stitch.colorRange) {
    if (hex === undefined) return { range: stitch.colorRange, text: '' };
    return { range: stitch.colorRange, text: `:${colorLiteral(hex)}` };
  }
  if (hex === undefined) return undefined; // 지울 색이 없다

  // 주석이 붙어 있으면 그 앞에 삽입 — 없으면 코 끝
  let at = stitch.range.end;
  if (stitch.comment !== undefined) {
    const quote = source.lastIndexOf('"', stitch.range.end - 1);
    const open = quote >= 0 ? source.lastIndexOf('"', quote - 1) : -1;
    if (open > stitch.range.start) at = open;
  }
  // 삽입 지점 앞의 공백은 남기지 않는다 (`1v :navy` 방지)
  while (at > stitch.range.start && /\s/.test(source[at - 1]!)) at--;
  return { range: { start: at, end: at }, text: `:${colorLiteral(hex)}` };
}

/**
 * 지정한 소스 범위와 겹치는 코들의 색을 한꺼번에 바꾼다.
 * `hex` 가 undefined 면 색을 제거한다. 겹치는 코가 없으면 원본 그대로.
 */
export function setColorInRange(
  source: string,
  parsed: ParsedRound | undefined,
  selection: SourceRange,
  hex: string | undefined,
): string {
  const from = Math.min(selection.start, selection.end);
  const to = Math.max(selection.start, selection.end);
  const edits: Edit[] = [];
  for (const s of collectStitches(parsed?.body ?? parsed?.lastValid)) {
    // 빈 선택(커서)이면 커서를 품은 코, 아니면 범위와 겹치는 코
    const hit = from === to
      ? s.range.start <= from && from <= s.range.end
      : s.range.start < to && from < s.range.end;
    if (!hit) continue;
    const edit = editFor(source, s, hex);
    if (edit) edits.push(edit);
  }
  return edits.length > 0 ? applyEdits(source, edits) : source;
}

/** 코 하나(정확히 이 노드)의 색만 바꾼다 — 스와치 클릭용 */
export function setColorAt(
  source: string,
  parsed: ParsedRound | undefined,
  stitchStart: number,
  hex: string | undefined,
): string {
  const target = collectStitches(parsed?.body ?? parsed?.lastValid)
    .find((s) => s.range.start === stitchStart);
  if (!target) return source;
  const edit = editFor(source, target, hex);
  return edit ? applyEdits(source, [edit]) : source;
}

/**
 * 실 색을 **지정하지 않은** 코들에만 `:색` 을 붙인다.
 *
 * "기본 코" 를 정식 실 색으로 승격시키는 동작이다. 표시 옵션(칸 색)으로 색을 입히면
 * 화면만 바뀌고 배색 목록에 실 색으로 잡히지 않는데, 이건 본문을 고치므로
 * 이후 다른 색으로 일괄 교체하는 것도 똑같이 된다.
 * 이미 색이 있는 코는 건드리지 않는다.
 */
export function assignColorToUncolored(
  source: string,
  parsed: ParsedRound | undefined,
  hex: string,
): string {
  const edits: Edit[] = [];
  for (const s of collectStitches(parsed?.body ?? parsed?.lastValid)) {
    if (s.color) continue;
    const edit = editFor(source, s, hex);
    if (edit) edits.push(edit);
  }
  return edits.length > 0 ? applyEdits(source, edits) : source;
}

/**
 * 이 단에서 `from` 색으로 칠해진 코를 모두 `to` 색으로 바꾼다 (배색 교체용).
 * `to` 가 undefined 면 그 색을 제거한다.
 */
export function replaceColorInRound(
  source: string,
  parsed: ParsedRound | undefined,
  from: string,
  to: string | undefined,
): string {
  const edits: Edit[] = [];
  for (const s of collectStitches(parsed?.body ?? parsed?.lastValid)) {
    if (s.color !== from || !s.colorRange) continue;
    edits.push({
      range: s.colorRange,
      text: to === undefined ? '' : `:${colorLiteral(to)}`,
    });
  }
  return edits.length > 0 ? applyEdits(source, edits) : source;
}
