import { describe, expect, it } from 'vitest';
import { tokenize } from '../src/lib/parser/tokenizer';

describe('tokenize', () => {
  it('매직링과 짧은뜨기 반복', () => {
    const tokens = tokenize('@, 6X');
    expect(tokens.map((t) => [t.type, t.value ?? t.text])).toEqual([
      ['STITCH', 'MAGIC'],
      ['COMMA', ','],
      ['NUMBER', 6],
      ['STITCH', 'SC'],
    ]);
  });

  it('괄호 반복 패턴', () => {
    const tokens = tokenize('(1X, 1V) * 3');
    expect(tokens.map((t) => t.type)).toEqual([
      'LPAREN', 'NUMBER', 'STITCH', 'COMMA', 'NUMBER', 'STITCH', 'RPAREN', 'STAR', 'NUMBER',
    ]);
  });

  it('대괄호 한 코 그룹', () => {
    const tokens = tokenize('3[F,T]');
    expect(tokens.map((t) => t.type)).toEqual([
      'NUMBER', 'LBRACKET', 'STITCH', 'COMMA', 'STITCH', 'RBRACKET',
    ]);
  });

  it('V^N 확장', () => {
    const tokens = tokenize('2V^3');
    expect(tokens.map((t) => [t.type, t.value ?? t.text])).toEqual([
      ['NUMBER', 2],
      ['STITCH', 'INC'],
      ['CARET', '^'],
      ['NUMBER', 3],
    ]);
  });

  it('blo 수식자', () => {
    const tokens = tokenize('blo X');
    expect(tokens.map((t) => [t.type, t.value ?? t.text])).toEqual([
      ['MODIFIER', 'BLO'],
      ['STITCH', 'SC'],
    ]);
  });

  it('영문 별칭 (mr, sc)', () => {
    const tokens = tokenize('mr, 6sc');
    expect(tokens.map((t) => t.value ?? t.text)).toEqual(['MAGIC', ',', 6, 'SC']);
  });

  it('모든 case variants', () => {
    const inputs = ['6X', '6x', '6sc', '6SC', '6Sc'];
    for (const input of inputs) {
      const tokens = tokenize(input);
      expect(tokens[1]!.value).toBe('SC');
    }
  });

  it('슬립 스티치 별칭: sl, slst, _ 인식', () => {
    expect(tokenize('sl')[0]!.value).toBe('SLIP');
    expect(tokenize('slst')[0]!.value).toBe('SLIP');
    expect(tokenize('_')[0]!.value).toBe('SLIP');
  });

  it('단일 대문자 S 는 SLIP 으로 인식되지 않음', () => {
    const tokens = tokenize('S,');
    expect(tokens[0]!.type).toBe('UNKNOWN');
  });

  it('단일 소문자 s는 SLIP으로 인식되지 않음 (UNKNOWN)', () => {
    // `s` 단독은 알려진 별칭이 아니므로 UNKNOWN이어야 함
    const tokens = tokenize('s,');
    expect(tokens[0]!.type).toBe('UNKNOWN');
    expect(tokens[0]!.text).toBe('s');
  });

  it('sc는 단일 토큰으로 매칭 (s+c 분리되지 않음)', () => {
    const tokens = tokenize('sc');
    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.value).toBe('SC');
  });

  it('식별자 경계: 뒤이어 다른 알파벳이 있으면 매칭 거부', () => {
    // `scz` → sc로 매칭되면 안됨 (scz라는 알 수 없는 식별자)
    const tokens = tokenize('scz');
    // 'sc'로 매칭하지 않고 각 글자를 UNKNOWN 처리 혹은 매칭 실패하여 둘 중 하나
    // 구현은 longest-match 순회하며 모든 후보 거부하므로 's', 'c', 'z'가 각각 UNKNOWN
    expect(tokens.every((t) => t.type === 'UNKNOWN')).toBe(true);
  });

  it('알 수 없는 문자', () => {
    const tokens = tokenize('Q');
    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.type).toBe('UNKNOWN');
  });

  it('공백은 무시됨', () => {
    const tokens = tokenize('  6X  ,  1V  ');
    expect(tokens.map((t) => t.type)).toEqual(['NUMBER', 'STITCH', 'COMMA', 'NUMBER', 'STITCH']);
  });

  it('소스 위치 보존 (공백은 스킵되어 인덱스에 포함되지 않음)', () => {
    const tokens = tokenize('6X, 1V');
    // "6X, 1V" → 6(0) X(1) ,(2) [공백3] 1(4) V(5)
    expect(tokens[0]!.range).toEqual({ start: 0, end: 1 });  // '6'
    expect(tokens[1]!.range).toEqual({ start: 1, end: 2 });  // 'X'
    expect(tokens[2]!.range).toEqual({ start: 2, end: 3 });  // ','
    expect(tokens[3]!.range).toEqual({ start: 4, end: 5 });  // '1'
    expect(tokens[4]!.range).toEqual({ start: 5, end: 6 });  // 'V'
  });

  it('복합 반복 + 확장', () => {
    const tokens = tokenize('(1X, 2V^3) * 2');
    const types = tokens.map((t) => t.type);
    expect(types).toEqual([
      'LPAREN', 'NUMBER', 'STITCH',
      'COMMA', 'NUMBER', 'STITCH', 'CARET', 'NUMBER',
      'RPAREN', 'STAR', 'NUMBER',
    ]);
  });
});

describe('tokenize — stitch annotations', () => {
  it('STRING 토큰: "..."', () => {
    const tokens = tokenize('X"hello"');
    expect(tokens.map((t: any) => t.type)).toEqual(['STITCH', 'STRING']);
    expect(tokens[1].value).toBe('hello');
  });

  it('COLON + HEX_COLOR', () => {
    const tokens = tokenize('X:#ededed');
    expect(tokens.map((t: any) => t.type)).toEqual(['STITCH', 'COLON', 'HEX_COLOR']);
    expect(tokens[2].text).toBe('#ededed');
  });

  it('unclosed string → UNKNOWN', () => {
    const tokens = tokenize('X"oops');
    expect(tokens.map((t: any) => t.type)).toEqual(['STITCH', 'UNKNOWN']);
  });
});
