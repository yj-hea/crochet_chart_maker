/**
 * 대바늘 파서 — 토큰 스트림을 AST 로 변환.
 *
 * 문법:
 *   sequence      ::= element ("," element)*
 *   element       ::= repeatElement | sameStitch | stitchElement
 *   repeatElement ::= "(" sequence ")" "*" NUMBER
 *   sameStitch    ::= NUMBER? "[" sequence "]"   (한 코에 여러 번 뜨기)
 *   stitchElement ::= count? stitch count? expansion? annotation*
 *   expansion     ::= "^" NUMBER          (늘림/줄임 코에만)
 *   annotation    ::= STRING | ":" color
 *   count         ::= NUMBER
 *
 * 코바늘과 다른 점:
 *   - 반복수는 코 **뒤**가 기본 (`k3`). 앞자리(`3k`)도 받아준다.
 *   - `blo`, `tc()`, `skip()`, `tog/in` 문법 없음.
 *   - `[...]` 는 "한 코에 여러 번 뜨기" (`[k, yo, k]` = (k1, yo, k1) in next st).
 *     안에는 겉/안/꼬아뜨기와 `yo` 만 — 늘림·줄임 기호는 이미 한 동작이라 넣을 수 없다.
 *   - 코 이름 자체에 숫자가 들어감 (`k2tog`) — 토크나이저 longest-match 로 분리 방지.
 *
 * 에러 처리는 코바늘과 동일하게 abort-on-first-error.
 */

import { tokenize, type Token, type TokenizerConfig } from '$lib/parser/tokenizer';
import type { ParseError, ParseErrorKind, SourceRange } from '$lib/model/errors';
import type {
  SequenceNode, StitchNode, RepeatNode, SameHoleGroupNode, ElementNode, ParsedRound,
} from '$lib/parser/ast';
import type { StitchKind } from '$lib/model/stitch-kind';
import { resolveColorValue } from '$lib/model/colors';
import {
  KNIT_ALIAS_MAP,
  KNIT_ALIAS_KEYS_BY_LENGTH,
  KNIT_STITCH_META,
  aliasExpansion,
} from './stitch';

const KNIT_TOKENIZER: TokenizerConfig = {
  aliasMap: KNIT_ALIAS_MAP,
  aliasKeys: KNIT_ALIAS_KEYS_BY_LENGTH,
};

export function parseKnitRound(index: number, source: string): ParsedRound {
  const tokens = tokenize(source, KNIT_TOKENIZER);
  const parser = new KnitParser(tokens);
  const body = parser.parseSequence('top');
  parser.reportLeftover();
  return {
    index,
    source,
    body: parser.errors.length === 0 ? body : undefined,
    lastValid: body,
    errors: parser.errors,
  };
}

type SeqContext = 'top' | 'paren' | 'bracket';

/**
 * `[...]` 안에 들어갈 수 있는 코 — 한 코에 **바늘을 넣어 뜨는** 동작과 `yo` 뿐.
 * `kfb`·`m1l` 같은 늘림, `k2tog` 같은 줄임은 그 자체로 코 수를 바꾸는 한 동작이라
 * 그룹 안에서는 뜻이 겹친다 (코바늘 `[...]` 안의 V/A 금지와 같은 이유).
 */
const SAME_STITCH_ALLOWED: ReadonlySet<StitchKind> = new Set<StitchKind>([
  'KNIT', 'PURL', 'KTBL', 'PTBL', 'YO',
]);

class KnitParser {
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

  parseSequence(ctx: SeqContext = 'top'): SequenceNode {
    const elements: ElementNode[] = [];
    const startPos = this.peek()?.range.start ?? 0;
    let endPos = startPos;

    const closer = ctx === 'paren' ? 'RPAREN' : ctx === 'bracket' ? 'RBRACKET' : undefined;
    while (!this.isAtEnd() && !this.aborted && !(closer && this.peek()?.type === closer)) {
      const element = this.parseElement();
      if (!element) break;
      elements.push(element);
      endPos = element.range.end;

      if (this.peek()?.type === 'COMMA') {
        this.advance();
        continue;
      }
      break;
    }

    return { type: 'sequence', elements, range: { start: startPos, end: endPos } };
  }

  /** 파싱 후 남은 토큰이 있으면 에러 (닫히지 않은 괄호 등) */
  reportLeftover(): void {
    if (this.aborted || this.isAtEnd()) return;
    const tok = this.peek()!;
    if (tok.type === 'RPAREN') {
      this.error('unopened_paren', tok.range, '`(` 없이 `)` 가 나왔습니다');
      return;
    }
    if (tok.type === 'RBRACKET') {
      this.error('unopened_bracket', tok.range, '`[` 없이 `]` 가 나왔습니다');
      return;
    }
    this.error('unexpected_token', tok.range, `예상치 못한 토큰: "${tok.text}"`);
  }

  private parseElement(): ElementNode | undefined {
    const tok = this.peek();
    if (!tok) return undefined;

    if (tok.type === 'LPAREN') return this.parseRepeat();
    if (tok.type === 'LBRACKET') return this.parseSameStitch();
    if (tok.type === 'NUMBER' && this.peek(1)?.type === 'LBRACKET') return this.parseSameStitch();
    if (tok.type === 'NUMBER' && this.peek(1)?.type === 'LPAREN') {
      // `3(k2,p2)` 처럼 앞자리 반복은 미지원 — `(k2,p2)*3` 로 안내
      this.error('unexpected_token', tok.range, '반복은 `(...)*N` 형태로 써 주세요');
      return undefined;
    }
    if (tok.type === 'STITCH' || tok.type === 'NUMBER') return this.parseStitch();

    if (tok.type === 'UNKNOWN') {
      this.error('unknown_token', tok.range, `알 수 없는 기호: "${tok.text}"`);
      return undefined;
    }
    this.error('unexpected_token', tok.range, `예상치 못한 토큰: "${tok.text}"`);
    return undefined;
  }

  /**
   * sameStitch ::= NUMBER? "[" sequence "]"
   *
   * 한 코에 여러 번 뜨기. `3[k, p]` 는 다음 세 코 각각에 `[k, p]`.
   */
  private parseSameStitch(): SameHoleGroupNode | undefined {
    const startPos = this.peek()!.range.start;

    let count = 1;
    if (this.peek()?.type === 'NUMBER') {
      const numTok = this.advance()!;
      count = numTok.value as number;
      if (count < 1) {
        this.error('invalid_number', numTok.range, '그룹 앞 숫자는 1 이상이어야 합니다');
        return undefined;
      }
    }

    const lbracket = this.advance()!;
    const body = this.parseSequence('bracket');
    if (this.aborted) return undefined;

    const rbracket = this.peek();
    if (rbracket?.type !== 'RBRACKET') {
      this.error('unclosed_bracket', rbracket?.range ?? this.eofRange(), '`[` 에 대응하는 `]` 가 필요합니다');
      return undefined;
    }
    this.advance();

    const range = { start: lbracket.range.start, end: rbracket.range.end };
    if (body.elements.length === 0) {
      this.error('empty_samehole', range, '`[...]` 그룹이 비어 있습니다');
      return undefined;
    }

    const violation = findSameStitchViolation(body);
    if (violation) {
      this.error('invalid_samehole', violation.range, violation.message);
      return undefined;
    }
    // `[yo, yo]` 처럼 코에 바늘을 한 번도 넣지 않으면 "한 코에" 뜬 것이 아니다
    if (!containsWorkedStitch(body)) {
      this.error('invalid_samehole', range, '`[...]` 안에는 코에 뜨는 기호(k, p 등)가 하나 이상 있어야 합니다');
      return undefined;
    }

    return { type: 'samehole', body, count, range: { start: startPos, end: rbracket.range.end } };
  }

  /** repeatElement ::= "(" sequence ")" "*" NUMBER */
  private parseRepeat(): RepeatNode | undefined {
    const lparen = this.advance()!;
    const body = this.parseSequence('paren');
    if (this.aborted) return undefined;

    const rparen = this.peek();
    if (rparen?.type !== 'RPAREN') {
      this.error('unclosed_paren', this.eofRange(), '`)` 가 필요합니다');
      return undefined;
    }
    this.advance();

    const star = this.peek();
    if (star?.type !== 'STAR') {
      this.error('missing_repeat_count', star?.range ?? this.eofRange(), '`)` 뒤에 `*N` 이 필요합니다');
      return undefined;
    }
    this.advance();

    const num = this.peek();
    if (num?.type !== 'NUMBER') {
      this.error('missing_repeat_count', num?.range ?? this.eofRange(), '`*` 뒤에 반복 횟수가 필요합니다');
      return undefined;
    }
    const count = num.value as number;
    if (count < 1) {
      this.error('invalid_number', num.range, '반복 횟수는 1 이상이어야 합니다');
      return undefined;
    }
    this.advance();

    return {
      type: 'repeat',
      body,
      count,
      range: { start: lparen.range.start, end: num.range.end },
    };
  }

  /** stitchElement ::= count? stitch count? expansion? annotation* */
  private parseStitch(): StitchNode | undefined {
    const startPos = this.peek()!.range.start;

    // 선행 반복수 (코바늘식 `3k` 호환)
    let prefixCount: number | undefined;
    if (this.peek()?.type === 'NUMBER') {
      const numTok = this.advance()!;
      prefixCount = numTok.value as number;
      if (prefixCount < 1) {
        this.error('invalid_number', numTok.range, '반복 횟수는 1 이상이어야 합니다');
        return undefined;
      }
    }

    const stitchTok = this.peek();
    if (stitchTok?.type !== 'STITCH') {
      if (stitchTok?.type === 'UNKNOWN') {
        this.error('unknown_token', stitchTok.range, `알 수 없는 기호: "${stitchTok.text}"`);
      } else {
        this.error('unexpected_token', stitchTok?.range ?? this.eofRange(), '코 기호가 필요합니다');
      }
      return undefined;
    }
    this.advance();
    const kind = stitchTok.value as StitchKind;

    // 후행 반복수 (대바늘 기본 표기 `k3`)
    let postfixCount: number | undefined;
    if (this.peek()?.type === 'NUMBER') {
      const numTok = this.advance()!;
      postfixCount = numTok.value as number;
      if (postfixCount < 1) {
        this.error('invalid_number', numTok.range, '반복 횟수는 1 이상이어야 합니다');
        return undefined;
      }
    }

    if (prefixCount !== undefined && postfixCount !== undefined) {
      this.error(
        'unexpected_token',
        stitchTok.range,
        '반복수는 코 앞뒤 중 한 곳에만 쓸 수 있습니다',
      );
      return undefined;
    }
    const count = postfixCount ?? prefixCount ?? 1;

    // 별칭 자체가 코 수를 담는 경우 (k3tog, sssk, kfbf …)
    let expansion = aliasExpansion(stitchTok.text);

    // 명시적 `^N`
    if (this.peek()?.type === 'CARET') {
      const caret = this.advance()!;
      const meta = KNIT_STITCH_META[kind];
      if (!meta?.expandable) {
        this.error(
          'invalid_expansion',
          caret.range,
          `${meta?.korean ?? kind}(${meta?.canonical ?? ''})는 \`^N\` 확장을 쓸 수 없습니다`,
        );
        return undefined;
      }
      const numTok = this.peek();
      if (numTok?.type !== 'NUMBER') {
        this.error('invalid_number', numTok?.range ?? this.eofRange(), '`^` 뒤에 숫자가 필요합니다');
        return undefined;
      }
      const value = numTok.value as number;
      if (value < 2) {
        this.error('invalid_number', numTok.range, '확장 숫자는 2 이상이어야 합니다');
        return undefined;
      }
      this.advance();
      expansion = value;
    }

    // 주석 / 색상
    let comment: string | undefined;
    let color: string | undefined;
    let colorRange: SourceRange | undefined;
    while (true) {
      const tok = this.peek();
      if (tok?.type === 'STRING') {
        comment = tok.value as string;
        this.advance();
        continue;
      }
      if (tok?.type === 'COLON') {
        const colonStart = tok.range.start;
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
          this.error('unexpected_token', val.range, `알 수 없는 색상: "${val.text}"`);
          return undefined;
        }
        color = resolved;
        colorRange = { start: colonStart, end: val.range.end };
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
      comment,
      color,
      colorRange,
      range: { start: startPos, end: this.peek(-1)?.range.end ?? startPos },
    };
  }
}

/** `[...]` 안에서 허용되지 않는 요소를 찾는다 (중첩 그룹, 늘림·줄임 등) */
function findSameStitchViolation(seq: SequenceNode): { range: SourceRange; message: string } | undefined {
  for (const el of seq.elements) {
    if (el.type === 'samehole') {
      return { range: el.range, message: '`[...]` 안에 다른 `[...]` 를 중첩할 수 없습니다' };
    }
    if (el.type === 'repeat') {
      const nested = findSameStitchViolation(el.body);
      if (nested) return nested;
      continue;
    }
    if (el.type === 'stitch' && !SAME_STITCH_ALLOWED.has(el.kind)) {
      const meta = KNIT_STITCH_META[el.kind];
      return {
        range: el.range,
        message: `\`[...]\` 안에는 ${meta?.korean ?? el.kind}(${meta?.canonical ?? ''})를 쓸 수 없습니다 — k, p, ktbl, ptbl, yo 만 가능`,
      };
    }
  }
  return undefined;
}

/** 코에 바늘을 넣어 뜨는 기호가 있는지 (yo 만으로는 부족) */
function containsWorkedStitch(seq: SequenceNode): boolean {
  return seq.elements.some((el) =>
    (el.type === 'stitch' && el.kind !== 'YO')
    || (el.type === 'repeat' && containsWorkedStitch(el.body)));
}
