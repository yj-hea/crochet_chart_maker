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
import { NAMED_COLORS } from '$lib/model/colors';

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
