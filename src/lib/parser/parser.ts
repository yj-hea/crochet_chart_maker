/**
 * Recursive descent parser — 토큰 스트림을 AST로 변환.
 *
 * 문법:
 *   sequence         ::= element ("," element)*
 *   element          ::= stitchElement | repeatElement | sameHoleElement
 *   stitchElement    ::= modifier? count? stitch expansion?
 *   repeatElement    ::= "(" sequence ")" "*" NUMBER
 *   sameHoleElement  ::= count? "[" sequence "]"     (안에 V/A/중첩[] 금지, () 허용)
 *   expansion        ::= "^" NUMBER                  (V/A에만 허용)
 *   count            ::= NUMBER
 *
 * 에러 처리: abort-on-first-error.
 *   오류 발생 시 해당 위치까지의 부분 AST + errors를 반환한다.
 *   (점진적 파싱에서 "그 뒤에 작성된 내용은 미리보기에 반영하지 않음" 동작과 일치)
 */

import { tokenize, type Token } from './tokenizer';
import type { ParseError, ParseErrorKind, SourceRange } from '$lib/model/errors';
import type { SequenceNode, StitchNode, RepeatNode, SameHoleGroupNode, SkipNode, TcNode, ElementNode, ParsedRound } from './ast';
import type { StitchKind, ModifierKind } from '$lib/model/stitch';
import { STITCH_META } from '$lib/model/stitch';
import { resolveColorValue } from '$lib/model/colors';

export interface ParseResult {
  body: SequenceNode;
  errors: ParseError[];
}

export function parseTokens(tokens: Token[]): ParseResult {
  const parser = new Parser(tokens);
  const body = parser.parseSequence('top');
  parser.reportLeftover();
  return { body, errors: parser.errors };
}

type SeqContext = 'top' | 'paren' | 'bracket';

export function parseRound(index: number, source: string): ParsedRound {
  const tokens = tokenize(source);
  const { body, errors } = parseTokens(tokens);
  return {
    index,
    source,
    body: errors.length === 0 ? body : undefined,
    lastValid: body,
    errors,
  };
}

class Parser {
  private pos = 0;
  public errors: ParseError[] = [];
  private aborted = false;

  constructor(private readonly tokens: Token[]) {}

  private peek(offset = 0): Token | undefined {
    return this.tokens[this.pos + offset];
  }

  private advance(): Token | undefined {
    return this.tokens[this.pos++];
  }

  private isAtEnd(): boolean {
    return this.pos >= this.tokens.length;
  }

  private eofRange(): SourceRange {
    const last = this.tokens[this.tokens.length - 1];
    const pos = last ? last.range.end : 0;
    return { start: pos, end: pos };
  }

  private error(kind: ParseErrorKind, range: SourceRange, message: string): void {
    this.errors.push({ kind, range, message });
    this.aborted = true;
  }

  /**
   * sequence ::= element ("," element)*
   * ctx 에 따라 허용되는 terminator가 다름:
   *   top     — 입력 끝만
   *   paren   — `)` 또는 끝
   *   bracket — `]` 또는 끝
   */
  parseSequence(ctx: SeqContext = 'top'): SequenceNode {
    const elements: ElementNode[] = [];
    const startPos = this.peek()?.range.start ?? 0;
    let endPos = startPos;

    while (!this.isAtEnd() && !this.aborted && !this.atSequenceTerminator(ctx)) {
      const element = this.parseElement();
      if (!element) break;
      elements.push(element);
      endPos = element.range.end;

      const comma = this.peek();
      if (comma?.type === 'COMMA') {
        this.advance();
        continue;
      }
      break;
    }

    return {
      type: 'sequence',
      elements,
      range: { start: startPos, end: endPos },
    };
  }

  private atSequenceTerminator(ctx: SeqContext): boolean {
    const t = this.peek()?.type;
    if (ctx === 'paren') return t === 'RPAREN';
    if (ctx === 'bracket') return t === 'RBRACKET';
    return false; // top: 입력 끝까지 계속 파싱
  }

  /** 파싱 후 남은 토큰이 있으면 (주로 짝 없는 `)` / `]`) 에러로 보고 */
  reportLeftover(): void {
    if (this.aborted) return;
    const t = this.peek();
    if (!t) return;
    if (t.type === 'RPAREN') {
      this.error('unopened_paren', t.range, '`)` 앞에 `(` 가 필요합니다');
    } else if (t.type === 'RBRACKET') {
      this.error('unopened_bracket', t.range, '`]` 앞에 `[` 가 필요합니다');
    } else {
      this.error('unexpected_token', t.range, `예기치 않은 토큰: "${t.text}"`);
    }
  }

  /**
   * element ::= stitchElement | repeatElement | sameHoleElement
   * 라우팅: `(` → repeat, `[` 또는 `NUMBER [` → samehole, 그 외 → stitch
   */
  private parseElement(): ElementNode | undefined {
    const token = this.peek();
    if (!token) return undefined;

    if (token.type === 'LPAREN') {
      return this.parseRepeatElement();
    }
    if (token.type === 'LBRACKET') {
      return this.parseSameHoleElement();
    }
    if (token.type === 'NUMBER' && this.peek(1)?.type === 'LBRACKET') {
      return this.parseSameHoleElement();
    }
    if (token.type === 'RBRACKET') {
      this.error('unopened_bracket', token.range, '`]` 앞에 `[` 가 필요합니다');
      return undefined;
    }
    if (token.type === 'STITCH' && token.value === 'SKIP') {
      return this.parseSkipElement();
    }
    if (token.type === 'STITCH' && token.value === 'TC') {
      return this.parseTcElement();
    }
    return this.parseStitchElement();
  }

  /**
   * tcElement ::= "tc" "(" sequence ")"
   */
  private parseTcElement(): TcNode | undefined {
    const tcTok = this.advance()!;
    const lparen = this.peek();
    if (!lparen || lparen.type !== 'LPAREN') {
      this.error('unexpected_token', lparen?.range ?? this.eofRange(), 'tc 뒤에는 `(...)` 가 필요합니다');
      return undefined;
    }
    this.advance();

    const body = this.parseSequence('paren');
    if (this.aborted) return undefined;

    const rparen = this.peek();
    if (!rparen || rparen.type !== 'RPAREN') {
      this.error('unclosed_paren', rparen?.range ?? this.eofRange(), 'tc( 에 대응하는 `)` 가 필요합니다');
      return undefined;
    }
    this.advance();

    if (body.elements.length === 0) {
      this.error('unexpected_token',
        { start: lparen.range.start, end: rparen.range.end },
        'tc(...) 가 비어 있습니다');
      return undefined;
    }

    const violation = findTcViolation(body);
    if (violation) {
      this.error(violation.kind, violation.range, violation.message);
      return undefined;
    }

    return {
      type: 'tc',
      body,
      range: { start: tcTok.range.start, end: rparen.range.end },
    };
  }

  /**
   * skipElement ::= "skip" "(" NUMBER ")"
   */
  private parseSkipElement(): SkipNode | undefined {
    const skipTok = this.advance()!;
    const lparen = this.peek();
    if (!lparen || lparen.type !== 'LPAREN') {
      this.error(
        'unexpected_token',
        lparen?.range ?? this.eofRange(),
        'skip 뒤에는 `(N)` 이 필요합니다',
      );
      return undefined;
    }
    this.advance();

    const numTok = this.peek();
    if (!numTok || numTok.type !== 'NUMBER') {
      this.error(
        'invalid_number',
        numTok?.range ?? this.eofRange(),
        'skip(N) 의 N (양의 정수) 이 필요합니다',
      );
      return undefined;
    }
    const count = numTok.value as number;
    if (count < 1) {
      this.error('invalid_number', numTok.range, 'skip(N) 의 N 은 1 이상이어야 합니다');
      return undefined;
    }
    this.advance();

    const rparen = this.peek();
    if (!rparen || rparen.type !== 'RPAREN') {
      this.error(
        'unclosed_paren',
        rparen?.range ?? this.eofRange(),
        'skip( 에 대응하는 `)` 가 필요합니다',
      );
      return undefined;
    }
    this.advance();

    return {
      type: 'skip',
      count,
      range: { start: skipTok.range.start, end: rparen.range.end },
    };
  }

  /**
   * stitchElement ::= modifier? count? stitch expansion?
   */
  private parseStitchElement(): StitchNode | undefined {
    const first = this.peek();
    if (!first) return undefined;
    const startPos = first.range.start;

    let modifier: ModifierKind | undefined;
    let count = 1;
    let expansion: number | undefined;

    // 선택적 modifier
    if (first.type === 'MODIFIER') {
      modifier = first.value as ModifierKind;
      this.advance();
    }

    // 선택적 count
    const maybeCount = this.peek();
    if (maybeCount?.type === 'NUMBER') {
      count = maybeCount.value as number;
      this.advance();
    }

    // 필수 stitch
    const stitchTok = this.peek();
    if (!stitchTok) {
      this.error(
        'unexpected_token',
        this.eofRange(),
        '코 기호가 필요합니다',
      );
      return undefined;
    }
    if (stitchTok.type === 'UNKNOWN') {
      this.error(
        'unknown_token',
        stitchTok.range,
        `알 수 없는 기호: "${stitchTok.text}"`,
      );
      return undefined;
    }
    if (stitchTok.type !== 'STITCH') {
      this.error(
        'unexpected_token',
        stitchTok.range,
        `코 기호가 필요합니다 ("${stitchTok.text}")`,
      );
      return undefined;
    }
    const kind = stitchTok.value as StitchKind;
    this.advance();

    // V/A 뒤에 선택적 base stitch (T/F/E/X/DTR): VT^2, AF^3, VDTR 등
    let baseKind: StitchKind | undefined;
    if (kind === 'INC' || kind === 'DEC') {
      const maybeBase = this.peek();
      if (maybeBase?.type === 'STITCH') {
        const bk = maybeBase.value as StitchKind;
        if (bk === 'SC' || bk === 'HDC' || bk === 'DC' || bk === 'TR' || bk === 'DTR') {
          baseKind = bk;
          this.advance();
        }
      }
    }

    // TR/DTR (혹은 V/A baseKind=TR/DTR) 뒤의 선택적 yarn-over 지정: `tr(N)` / `vtr(N)` 등.
    // N≥2 허용, N≥4 는 동적 렌더. N=2→TR, N=3→DTR 와 동일 외관.
    let yarnOverCount: number | undefined;
    const effectiveTallKind = (kind === 'TR' || kind === 'DTR') ? kind
      : (kind === 'INC' || kind === 'DEC') && (baseKind === 'TR' || baseKind === 'DTR') ? baseKind
      : undefined;
    if (effectiveTallKind && this.peek()?.type === 'LPAREN') {
      this.advance();
      const num = this.peek();
      if (!num || num.type !== 'NUMBER') {
        this.error('invalid_number', num?.range ?? this.eofRange(), '`tr( 뒤에는 yarn-over 수(≥2)가 필요합니다');
        return undefined;
      }
      const n = num.value as number;
      if (n < 2) {
        this.error('invalid_number', num.range, 'yarn-over 수는 2 이상이어야 합니다');
        return undefined;
      }
      this.advance();
      const rp = this.peek();
      if (!rp || rp.type !== 'RPAREN') {
        this.error('unclosed_paren', rp?.range ?? this.eofRange(), 'tr( 에 대응하는 `)` 가 필요합니다');
        return undefined;
      }
      this.advance();
      yarnOverCount = n;
    }

    // 선택적 expansion: ^NUMBER
    const caret = this.peek();
    if (caret?.type === 'CARET') {
      this.advance();
      const numTok = this.peek();
      if (!numTok || numTok.type !== 'NUMBER') {
        this.error(
          'invalid_number',
          numTok?.range ?? this.eofRange(),
          '`^` 뒤에는 확장 숫자가 필요합니다',
        );
        return undefined;
      }
      if (!STITCH_META[kind].expandable) {
        this.error(
          'invalid_expansion',
          { start: caret.range.start, end: numTok.range.end },
          `${STITCH_META[kind].korean}(${STITCH_META[kind].canonical})는 \`^N\` 확장을 사용할 수 없습니다`,
        );
        return undefined;
      }
      expansion = numTok.value as number;
      if (expansion < 1) {
        this.error(
          'invalid_number',
          numTok.range,
          '확장 숫자는 1 이상이어야 합니다',
        );
        return undefined;
      }
      this.advance();
    }

    // 선택적 annotation: STRING(코멘트) | COLON HEX_COLOR(색상). 순서 무관, 여러 개 가능
    let comment: string | undefined;
    let color: string | undefined;
    while (true) {
      const tok = this.peek();
      if (tok?.type === 'STRING') {
        comment = tok.value as string;
        this.advance();
        continue;
      }
      if (tok?.type === 'COLON') {
        this.advance();
        const val = this.peek();
        if (!val || (val.type !== 'HEX_COLOR' && val.type !== 'COLOR_VALUE')) {
          this.error(
            'unexpected_token',
            val?.range ?? this.eofRange(),
            '`:` 뒤에 색상이 필요합니다 (#RRGGBB / RRGGBB / red, gray 등)',
          );
          return undefined;
        }
        const resolved = resolveColorValue(val.text);
        if (!resolved) {
          this.error(
            'unexpected_token',
            val.range,
            `알 수 없는 색상: "${val.text}"`,
          );
          return undefined;
        }
        color = resolved;
        this.advance();
        continue;
      }
      break;
    }

    return {
      type: 'stitch',
      kind,
      count,
      expansion,
      modifier,
      baseKind,
      yarnOverCount,
      comment,
      color,
      range: { start: startPos, end: (this.peek(-1)?.range.end) ?? startPos },
    };
  }

  /**
   * sameHoleElement ::= count? "[" sequence "]"
   *
   * 제약 (파싱 후 검증):
   *   - `[...]` 안에 V/A 금지
   *   - `[...]` 중첩 금지
   *   - `(...)` 는 허용
   */
  private parseSameHoleElement(): SameHoleGroupNode | undefined {
    const startTok = this.peek();
    if (!startTok) return undefined;
    const startPos = startTok.range.start;

    let count = 1;
    if (startTok.type === 'NUMBER') {
      count = startTok.value as number;
      if (count < 1) {
        this.error('invalid_number', startTok.range, '그룹 앞 숫자는 1 이상이어야 합니다');
        return undefined;
      }
      this.advance();
    }

    const lbracket = this.peek();
    if (!lbracket || lbracket.type !== 'LBRACKET') {
      this.error('unexpected_token', lbracket?.range ?? this.eofRange(), '`[` 가 필요합니다');
      return undefined;
    }
    this.advance();

    const body = this.parseSequence('bracket');
    if (this.aborted) return undefined;

    const rbracket = this.peek();
    if (!rbracket || rbracket.type !== 'RBRACKET') {
      this.error(
        'unclosed_bracket',
        rbracket?.range ?? this.eofRange(),
        '`[` 에 대응하는 `]` 가 필요합니다',
      );
      return undefined;
    }
    this.advance();

    if (body.elements.length === 0) {
      this.error(
        'empty_samehole',
        { start: lbracket.range.start, end: rbracket.range.end },
        '`[...]` 그룹이 비어 있습니다',
      );
      return undefined;
    }

    // 내부 검증: V/A, 중첩 [] 금지
    const violation = findSameHoleViolation(body);
    if (violation) {
      this.error(violation.kind, violation.range, violation.message);
      return undefined;
    }

    return {
      type: 'samehole',
      body,
      count,
      range: { start: startPos, end: rbracket.range.end },
    };
  }

  /**
   * repeatElement ::= "(" sequence ")" "*" NUMBER
   */
  private parseRepeatElement(): RepeatNode | undefined {
    const lparen = this.peek();
    if (!lparen || lparen.type !== 'LPAREN') return undefined;
    const startPos = lparen.range.start;
    this.advance();

    const body = this.parseSequence('paren');
    if (this.aborted) return undefined;

    const rparen = this.peek();
    if (!rparen || rparen.type !== 'RPAREN') {
      this.error(
        'unclosed_paren',
        rparen?.range ?? this.eofRange(),
        '`(` 에 대응하는 `)` 가 필요합니다',
      );
      return undefined;
    }
    this.advance();

    // `*N` 생략 시 count=1 로 기본 처리
    const star = this.peek();
    if (!star || star.type !== 'STAR') {
      return {
        type: 'repeat',
        body,
        count: 1,
        range: { start: startPos, end: rparen.range.end },
      };
    }
    this.advance();

    const numTok = this.peek();
    if (!numTok || numTok.type !== 'NUMBER') {
      this.error(
        'missing_repeat_count',
        numTok?.range ?? this.eofRange(),
        '`*` 뒤에 반복 숫자가 필요합니다',
      );
      return undefined;
    }
    const count = numTok.value as number;
    if (count < 1) {
      this.error(
        'invalid_number',
        numTok.range,
        '반복 숫자는 1 이상이어야 합니다',
      );
      return undefined;
    }
    this.advance();

    return {
      type: 'repeat',
      body,
      count,
      range: { start: startPos, end: numTok.range.end },
    };
  }
}

/**
 * tc(...) body 의 재귀 검증. 허용: stitch, repeat. 금지: [...], skip, nested tc, V/A.
 */
function findTcViolation(
  seq: SequenceNode,
): { kind: ParseErrorKind; range: SourceRange; message: string } | undefined {
  for (const el of seq.elements) {
    if (el.type === 'stitch') {
      if (el.kind === 'INC' || el.kind === 'DEC') {
        return {
          kind: 'invalid_samehole',
          range: el.range,
          message: `tc(...) 안에는 V/A 를 사용할 수 없습니다`,
        };
      }
    } else if (el.type === 'samehole') {
      return {
        kind: 'invalid_samehole',
        range: el.range,
        message: 'tc(...) 안에 `[...]` 는 사용할 수 없습니다',
      };
    } else if (el.type === 'skip') {
      return {
        kind: 'invalid_samehole',
        range: el.range,
        message: 'tc(...) 안에서 skip 은 사용할 수 없습니다',
      };
    } else if (el.type === 'tc') {
      return {
        kind: 'invalid_samehole',
        range: el.range,
        message: 'tc(...) 는 중첩할 수 없습니다',
      };
    } else if (el.type === 'repeat') {
      const nested = findTcViolation(el.body);
      if (nested) return nested;
    }
  }
  return undefined;
}

/**
 * samehole body의 재귀 검증. V/A 또는 중첩 `[...]` 발견 시 첫 위반 반환.
 */
function findSameHoleViolation(
  seq: SequenceNode,
): { kind: ParseErrorKind; range: SourceRange; message: string } | undefined {
  for (const el of seq.elements) {
    if (el.type === 'stitch') {
      if (el.kind === 'INC' || el.kind === 'DEC') {
        return {
          kind: 'invalid_samehole',
          range: el.range,
          message: `\`[...]\` 안에는 V/A를 사용할 수 없습니다 ("${STITCH_META[el.kind].canonical}")`,
        };
      }
    } else if (el.type === 'samehole') {
      return {
        kind: 'invalid_samehole',
        range: el.range,
        message: '`[...]` 안에 다른 `[...]` 를 중첩할 수 없습니다',
      };
    } else if (el.type === 'skip') {
      return {
        kind: 'invalid_samehole',
        range: el.range,
        message: '`[...]` 안에서 skip 은 사용할 수 없습니다',
      };
    } else if (el.type === 'repeat') {
      const nested = findSameHoleViolation(el.body);
      if (nested) return nested;
    }
  }
  return undefined;
}
