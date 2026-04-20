/**
 * 패턴 압축기 — 한 단의 source 텍스트를 run-length + 타일 탐지로 축약.
 *
 * 예) `x,x,x,v,v,x,x,x,v,v`        → `(3x, 2v)*2`
 *     `x,x,x,v,v,x,x,x:aaf,v,v`   → `3x, 2v, 2x, 1x:aaf, 2v`
 *
 * 동작:
 *   1) source 파싱 → top-level element 리스트.
 *   2) 연속된 동일 정체성의 단순 stitch 를 count 합산으로 병합.
 *      정체성 = modifier + kind + baseKind + yarnOver + expansion + color + comment.
 *      색상 텍스트는 source에서 원문 그대로 추출해 보존(`:aaf` → `:aaf`).
 *   3) 전체 병합 결과가 최소 주기 p (≥1, n/p ≥ 2 정수)로 타일링되면 `(block)*k` 로 감쌈.
 *   4) 복합 노드((…)*N, […], tc(…), skip(N))는 source slice 를 그대로 유지.
 *
 * 에러/미지원:
 *   - 파싱 실패 → source 원문 반환.
 *   - 빈 sequence → source 원문 반환.
 */

import { parseRound } from './parser/parser';
import { tokenize } from './parser/tokenizer';
import type { StitchNode } from './parser/ast';
import type { StitchKind } from './model/stitch';

const KIND_TO_LETTER: Record<StitchKind, string> = {
  MAGIC: '@', CHAIN: 'ch', SLIP: 'sl', SC: 'x', HDC: 't', DC: 'f',
  TR: 'e', DTR: 'dtr', INC: 'v', DEC: 'a', POPCORN: 'p', BUBBLE: 'b',
  SKIP: 'skip', TC: 'tc',
};

interface CompressElement {
  kind: 'stitch' | 'other';
  /** 합산된 반복 수 (stitch 만 유효; other 는 항상 1) */
  count: number;
  /** count 접두사를 뺀 단일 단위의 텍스트 */
  identity: string;
  /** count===1 일 때도 `1` 접두사를 붙일지 (색/코멘트/yarnOver 가 있을 때) */
  needsCountPrefix: boolean;
}

export function compressRoundSource(source: string): string {
  const parsed = parseRound(0, source);
  if (!parsed.body || parsed.errors.length > 0) return source;
  const elements = parsed.body.elements;
  if (elements.length === 0) return source;

  const flat: CompressElement[] = elements.map((el) => {
    if (el.type === 'stitch') {
      const { identity, needsCountPrefix } = stitchIdentity(source, el);
      return { kind: 'stitch', count: el.count, identity, needsCountPrefix };
    }
    return {
      kind: 'other',
      count: 1,
      identity: source.slice(el.range.start, el.range.end).trim(),
      needsCountPrefix: false,
    };
  });

  const merged: CompressElement[] = [];
  for (const el of flat) {
    const last = merged[merged.length - 1];
    if (last && last.kind === 'stitch' && el.kind === 'stitch' && last.identity === el.identity) {
      last.count += el.count;
    } else {
      merged.push({ ...el });
    }
  }

  const n = merged.length;
  let period: number | null = null;
  for (let p = 1; p <= Math.floor(n / 2); p++) {
    if (n % p !== 0) continue;
    let ok = true;
    for (let i = p; i < n; i++) {
      if (!elementEquals(merged[i]!, merged[i - p]!)) { ok = false; break; }
    }
    if (ok) { period = p; break; }
  }

  if (period !== null) {
    const k = n / period;
    const block = merged.slice(0, period).map(renderElement).join(', ');
    return `(${block})*${k}`;
  }
  return merged.map(renderElement).join(', ');
}

function elementEquals(a: CompressElement, b: CompressElement): boolean {
  return a.kind === b.kind && a.count === b.count && a.identity === b.identity;
}

function renderElement(el: CompressElement): string {
  if (el.kind === 'other') return el.identity;
  if (el.count === 1 && !el.needsCountPrefix) return el.identity;
  return `${el.count}${el.identity}`;
}

function stitchIdentity(source: string, node: StitchNode): { identity: string; needsCountPrefix: boolean } {
  const modifier = node.modifier === 'BLO' ? 'blo ' : '';
  const kind = KIND_TO_LETTER[node.kind];
  const base = node.baseKind ? KIND_TO_LETTER[node.baseKind] : '';
  const yarn = node.yarnOverCount !== undefined ? `(${node.yarnOverCount})` : '';
  const exp = node.expansion !== undefined ? `^${node.expansion}` : '';
  const rawColor = node.color !== undefined ? extractRawColor(source, node) : null;
  const color = rawColor !== null ? `:${rawColor}` : '';
  const comment = node.comment !== undefined ? ` "${escapeComment(node.comment)}"` : '';
  const identity = `${modifier}${kind}${base}${yarn}${exp}${color}${comment}`;
  // count=1 에서도 `1` 접두사를 유지해 시각적으로 구분되어야 하는 케이스
  const needsCountPrefix =
    node.color !== undefined || node.comment !== undefined || node.yarnOverCount !== undefined;
  return { identity, needsCountPrefix };
}

/**
 * source 에서 작성자가 쓴 색상 텍스트(키워드/헥스)를 그대로 추출.
 * 파서의 resolveColorValue 는 `#rrggbb` 로 정규화하지만, 압축 출력에서는
 * 원문을 유지해 `:aaf` / `:red` 를 보존한다.
 */
function extractRawColor(source: string, node: StitchNode): string | null {
  const slice = source.slice(node.range.start, node.range.end);
  const tokens = tokenize(slice);
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i]!.type === 'COLON') {
      const next = tokens[i + 1];
      if (next && (next.type === 'HEX_COLOR' || next.type === 'COLOR_VALUE')) {
        return next.text;
      }
    }
  }
  return null;
}

function escapeComment(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
