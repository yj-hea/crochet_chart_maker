/**
 * Tokenizer — 입력 문자열을 토큰 스트림으로 변환.
 *
 * 별칭(예: `sc`, `sl`, `blo`)에 대해 longest-match 적용.
 * 숫자, 구조 문자(`,`, `(`, `)`, `*`, `^`), 공백, 알 수 없는 문자를 분류.
 */

import { ALIAS_MAP, ALIAS_KEYS_BY_LENGTH, type StitchKind, type ModifierKind } from '$lib/model/stitch';
import type { SourceRange } from '$lib/model/errors';

export type TokenType =
  | 'NUMBER'    // 숫자 (양의 정수)
  | 'STITCH'    // 코 기호 (@, X, V 등)
  | 'MODIFIER'  // 수식자 (blo 등)
  | 'COMMA'     // ,
  | 'LPAREN'    // (
  | 'RPAREN'    // )
  | 'LBRACKET'  // [ — 한 코에 여러 기호 적용 그룹 시작
  | 'RBRACKET'  // ] — 한 코 그룹 끝
  | 'STAR'      // *
  | 'CARET'     // ^
  | 'COLON'     // : (색상 주석 시작)
  | 'STRING'    // "..." (코 코멘트)
  | 'HEX_COLOR' // #rgb | #rrggbb 등
  | 'UNKNOWN';  // 별칭에 없는 문자

export interface Token {
  type: TokenType;
  range: SourceRange;
  text: string;
  /** NUMBER: 숫자값. STITCH/MODIFIER: 정규화된 kind. STRING: 내부 텍스트. 그 외: undefined */
  value?: number | StitchKind | ModifierKind | string;
}

const DIGIT = /[0-9]/;
const WHITESPACE = /[ \t\r\n]/;

/**
 * 입력 문자열을 토큰 배열로 변환.
 * 공백은 토큰에 포함되지 않음 (스킵).
 * 인식 불가 문자는 `UNKNOWN` 토큰으로 남겨 파서가 에러 처리.
 */
export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i]!;

    // 1) 공백 스킵
    if (WHITESPACE.test(ch)) {
      i++;
      continue;
    }

    // 2) 구조 문자
    const structural = tryStructural(ch);
    if (structural) {
      tokens.push({ type: structural, range: { start: i, end: i + 1 }, text: ch });
      i++;
      continue;
    }

    // 2.5) HEX 색상: # + hex digits
    if (ch === '#') {
      const start = i;
      i++;
      while (i < input.length && /[0-9a-fA-F]/.test(input[i]!)) i++;
      if (i - start > 1) {
        tokens.push({ type: 'HEX_COLOR', range: { start, end: i }, text: input.slice(start, i) });
      } else {
        tokens.push({ type: 'UNKNOWN', range: { start, end: i }, text: '#' });
      }
      continue;
    }

    // 2.6) 문자열: "..."
    if (ch === '"') {
      const start = i;
      i++;
      let value = '';
      let closed = false;
      while (i < input.length) {
        const c = input[i]!;
        if (c === '\\' && i + 1 < input.length) {
          value += input[i + 1]!;
          i += 2;
          continue;
        }
        if (c === '"') { i++; closed = true; break; }
        value += c;
        i++;
      }
      if (closed) {
        tokens.push({ type: 'STRING', range: { start, end: i }, text: input.slice(start, i), value });
      } else {
        // 닫히지 않음 → UNKNOWN
        tokens.push({ type: 'UNKNOWN', range: { start, end: i }, text: input.slice(start, i) });
      }
      continue;
    }

    // 3) 숫자
    if (DIGIT.test(ch)) {
      const start = i;
      while (i < input.length && DIGIT.test(input[i]!)) i++;
      const text = input.slice(start, i);
      tokens.push({
        type: 'NUMBER',
        range: { start, end: i },
        text,
        value: Number.parseInt(text, 10),
      });
      continue;
    }

    // 4) 별칭 longest-match
    const aliasMatch = tryAliasMatch(input, i);
    if (aliasMatch) {
      const { key, kind, length } = aliasMatch;
      const type: TokenType = kind === 'BLO' ? 'MODIFIER' : 'STITCH';
      tokens.push({
        type,
        range: { start: i, end: i + length },
        text: key,
        value: kind,
      });
      i += length;
      continue;
    }

    // 5) 알 수 없는 문자
    tokens.push({
      type: 'UNKNOWN',
      range: { start: i, end: i + 1 },
      text: ch,
    });
    i++;
  }

  return tokens;
}

function tryStructural(ch: string): TokenType | undefined {
  switch (ch) {
    case ',': return 'COMMA';
    case '(': return 'LPAREN';
    case ')': return 'RPAREN';
    case '[': return 'LBRACKET';
    case ']': return 'RBRACKET';
    case '*': return 'STAR';
    case '^': return 'CARET';
    case ':': return 'COLON';
    default:  return undefined;
  }
}

interface AliasMatch {
  key: string;
  kind: StitchKind | ModifierKind;
  length: number;
}

/**
 * 입력의 현재 위치에서 가장 긴 별칭 매칭을 시도.
 * ALIAS_KEYS_BY_LENGTH는 길이 내림차순 정렬되어 있으므로 첫 매칭이 곧 longest.
 */
function tryAliasMatch(input: string, start: number): AliasMatch | undefined {
  for (const key of ALIAS_KEYS_BY_LENGTH) {
    if (input.startsWith(key, start)) {
      // 다자 식별자 별칭(sc, hdc, blo 등)의 경우 뒤 문자가 또다른 알파벳이면
      // 부분 일치일 가능성이 있음 → 매칭 거부. 단일 문자 별칭(V, A, X, T, F, E 등)은
      // 연속 작성(VT, AF) 허용을 위해 거부하지 않음.
      const last = key[key.length - 1]!;
      if (key.length > 1 && /[A-Za-z]/.test(last)) {
        const next = input[start + key.length];
        if (next !== undefined && /[A-Za-z]/.test(next)) continue;
      }
      const kind = ALIAS_MAP[key];
      if (!kind) continue;
      return { key, kind, length: key.length };
    }
  }
  return undefined;
}
