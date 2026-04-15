/**
 * Recursive descent parser — 토큰 스트림을 AST로 변환.
 *
 * 문법:
 *   sequence       ::= element ("," element)*
 *   element        ::= stitchElement | repeatElement
 *   stitchElement  ::= modifier? count? stitch expansion?
 *   repeatElement  ::= "(" sequence ")" "*" NUMBER
 *   expansion      ::= "^" NUMBER           (V/A에만 허용)
 *   count          ::= NUMBER
 *
 * 에러 처리: abort-on-first-error.
 *   오류 발생 시 해당 위치까지의 부분 AST + errors를 반환한다.
 *   (점진적 파싱에서 "그 뒤에 작성된 내용은 미리보기에 반영하지 않음" 동작과 일치)
 */

import { tokenize, type Token } from './tokenizer';
import type { ParseError, ParseErrorKind, SourceRange } from '$lib/model/errors';
import type { SequenceNode, StitchNode, RepeatNode, ParsedRound } from './ast';
import type { StitchKind, ModifierKind } from '$lib/model/stitch';
import { STITCH_META } from '$lib/model/stitch';

export interface ParseResult {
  body: SequenceNode;
  errors: ParseError[];
}

export function parseTokens(tokens: Token[]): ParseResult {
  const parser = new Parser(tokens);
  const body = parser.parseSequence();
  return { body, errors: parser.errors };
}

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
   */
  parseSequence(): SequenceNode {
    const elements: Array<StitchNode | RepeatNode> = [];
    const startPos = this.peek()?.range.start ?? 0;
    let endPos = startPos;

    while (!this.isAtEnd() && !this.aborted && !this.atSequenceTerminator()) {
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

  /** `)` 또는 입력 끝에서 sequence 종료. */
  private atSequenceTerminator(): boolean {
    return this.peek()?.type === 'RPAREN';
  }

  /**
   * element ::= stitchElement | repeatElement
   */
  private parseElement(): StitchNode | RepeatNode | undefined {
    const token = this.peek();
    if (!token) return undefined;

    if (token.type === 'LPAREN') {
      return this.parseRepeatElement();
    }
    return this.parseStitchElement();
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

    return {
      type: 'stitch',
      kind,
      count,
      expansion,
      modifier,
      range: { start: startPos, end: (this.peek(-1)?.range.end) ?? startPos },
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

    const body = this.parseSequence();
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

    const star = this.peek();
    if (!star || star.type !== 'STAR') {
      this.error(
        'missing_repeat_count',
        star?.range ?? this.eofRange(),
        '`(...)` 뒤에는 `*N` 이 필요합니다',
      );
      return undefined;
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
