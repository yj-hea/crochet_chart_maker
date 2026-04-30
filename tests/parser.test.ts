import { describe, expect, it } from 'vitest';
import { parseRound } from '../src/lib/parser/parser';

describe('parseRound', () => {
  it('단일 코', () => {
    const r = parseRound(1, '6X');
    expect(r.errors).toEqual([]);
    expect(r.body?.elements).toHaveLength(1);
    const el = r.body!.elements[0]!;
    expect(el.type).toBe('stitch');
    if (el.type === 'stitch') {
      expect(el.kind).toBe('SC');
      expect(el.count).toBe(6);
    }
  });

  it('매직링 + 반복', () => {
    const r = parseRound(1, '@, 6X');
    expect(r.errors).toEqual([]);
    expect(r.body?.elements.map((e) => e.type)).toEqual(['stitch', 'stitch']);
    expect((r.body!.elements[0] as any).kind).toBe('MAGIC');
    expect((r.body!.elements[1] as any).kind).toBe('SC');
  });

  it('V 기본 확장', () => {
    const r = parseRound(1, '6V');
    expect(r.errors).toEqual([]);
    const el = r.body!.elements[0] as any;
    expect(el.kind).toBe('INC');
    expect(el.count).toBe(6);
    expect(el.expansion).toBeUndefined();
  });

  it('V^3 확장', () => {
    const r = parseRound(1, '2V^3');
    expect(r.errors).toEqual([]);
    const el = r.body!.elements[0] as any;
    expect(el.kind).toBe('INC');
    expect(el.count).toBe(2);
    expect(el.expansion).toBe(3);
  });

  it('blo 수식자', () => {
    const r = parseRound(1, 'blo 6X');
    expect(r.errors).toEqual([]);
    const el = r.body!.elements[0] as any;
    expect(el.modifier).toBe('BLO');
    expect(el.kind).toBe('SC');
    expect(el.count).toBe(6);
  });

  it('반복 그룹', () => {
    const r = parseRound(1, '(1X, 1V) * 3');
    expect(r.errors).toEqual([]);
    const el = r.body!.elements[0] as any;
    expect(el.type).toBe('repeat');
    expect(el.count).toBe(3);
    expect(el.body.elements).toHaveLength(2);
  });

  it('복합: (1X, 2V^3) * 2', () => {
    const r = parseRound(1, '(1X, 2V^3) * 2');
    expect(r.errors).toEqual([]);
    const rep = r.body!.elements[0] as any;
    expect(rep.type).toBe('repeat');
    expect(rep.count).toBe(2);
    const [x, v] = rep.body.elements;
    expect(x.kind).toBe('SC');
    expect(v.kind).toBe('INC');
    expect(v.count).toBe(2);
    expect(v.expansion).toBe(3);
  });

  it('여러 요소 + 반복 혼합', () => {
    const r = parseRound(1, '1X, (1V, 1X) * 2, 1X');
    expect(r.errors).toEqual([]);
    const types = r.body!.elements.map((e) => e.type);
    expect(types).toEqual(['stitch', 'repeat', 'stitch']);
  });

  it('에러: 알 수 없는 기호', () => {
    const r = parseRound(1, '3X, Q');
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors[0]!.kind).toBe('unknown_token');
    // 첫 요소 3X는 lastValid에 포함
    expect(r.lastValid?.elements).toHaveLength(1);
    expect((r.lastValid!.elements[0] as any).kind).toBe('SC');
  });

  it('에러: 닫는 괄호 누락', () => {
    const r = parseRound(1, '(1X, 1V * 2');
    expect(r.errors.length).toBeGreaterThan(0);
    expect(['unclosed_paren', 'unexpected_token']).toContain(r.errors[0]!.kind);
  });

  it('에러: * 뒤 숫자 누락', () => {
    const r = parseRound(1, '(1X) *');
    expect(r.errors[0]!.kind).toBe('missing_repeat_count');
  });

  it('에러: 확장 불가능한 기호에 ^N', () => {
    const r = parseRound(1, 'X^3');
    expect(r.errors[0]!.kind).toBe('invalid_expansion');
  });

  it('에러: ^ 뒤 숫자 없음', () => {
    const r = parseRound(1, 'V^');
    expect(r.errors[0]!.kind).toBe('invalid_number');
  });

  it('에러: 반복 숫자 0', () => {
    const r = parseRound(1, '(1X) * 0');
    expect(r.errors[0]!.kind).toBe('invalid_number');
  });

  it('빈 입력', () => {
    const r = parseRound(1, '');
    expect(r.errors).toEqual([]);
    expect(r.body?.elements).toEqual([]);
  });

  it('후행 쉼표는 오류 아님 (다음 세그먼트 대기 상태)', () => {
    const r = parseRound(1, '3X,');
    expect(r.errors).toEqual([]);
    expect(r.body?.elements).toHaveLength(1);
    expect((r.body!.elements[0] as any).kind).toBe('SC');
  });

  it('연속된 쉼표는 에러 (빈 요소)', () => {
    const r = parseRound(1, '3X, , 1V');
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.lastValid?.elements).toHaveLength(1);
  });

  it('케이스 무관 입력 (대소문자 혼용)', () => {
    const r = parseRound(1, 'MR, 6sc, (1X, 1INC)*3');
    expect(r.errors).toEqual([]);
    expect((r.body!.elements[0] as any).kind).toBe('MAGIC');
    expect((r.body!.elements[1] as any).kind).toBe('SC');
    expect((r.body!.elements[2] as any).type).toBe('repeat');
  });

  it('에러 포함 시 lastValid는 에러 직전까지의 요소', () => {
    const r = parseRound(1, '3X, 2V, ??, 1X');
    expect(r.errors.length).toBeGreaterThan(0);
    // 에러 이후 1X는 포함되지 않아야 함
    expect(r.lastValid?.elements).toHaveLength(2);
  });
});

describe('parseRound — samehole [...]', () => {
  it('단순 [F,T]', () => {
    const r = parseRound(1, '[F,T]');
    expect(r.errors).toEqual([]);
    expect(r.body?.elements).toHaveLength(1);
    const el = r.body!.elements[0]!;
    expect(el.type).toBe('samehole');
    if (el.type === 'samehole') {
      expect(el.count).toBe(1);
      expect(el.body.elements).toHaveLength(2);
    }
  });

  it('prefix count: 3[F,T]', () => {
    const r = parseRound(1, '3[F,T]');
    expect(r.errors).toEqual([]);
    const el = r.body!.elements[0]!;
    if (el.type === 'samehole') {
      expect(el.count).toBe(3);
      expect(el.body.elements).toHaveLength(2);
    } else {
      throw new Error('expected samehole');
    }
  });

  it('[] 안에 V 금지', () => {
    const r = parseRound(1, '[F,V]');
    expect(r.body).toBeUndefined();
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors[0]!.kind).toBe('invalid_samehole');
  });

  it('[] 안에 A 금지', () => {
    const r = parseRound(1, '[A]');
    expect(r.body).toBeUndefined();
    expect(r.errors[0]!.kind).toBe('invalid_samehole');
  });

  it('[] 안에 () 허용', () => {
    const r = parseRound(1, '[(F,T)*2]');
    expect(r.errors).toEqual([]);
    const el = r.body!.elements[0]!;
    expect(el.type).toBe('samehole');
  });

  it('[] 중첩 금지', () => {
    const r = parseRound(1, '[F,[X,T]]');
    expect(r.body).toBeUndefined();
    expect(r.errors[0]!.kind).toBe('invalid_samehole');
  });

  it('빈 [] 오류', () => {
    const r = parseRound(1, '[]');
    expect(r.body).toBeUndefined();
    expect(r.errors[0]!.kind).toBe('empty_samehole');
  });

  it('닫히지 않은 [', () => {
    const r = parseRound(1, '[F,T');
    expect(r.body).toBeUndefined();
    expect(r.errors[0]!.kind).toBe('unclosed_bracket');
  });

  it('짝 없는 ]', () => {
    const r = parseRound(1, 'F]');
    expect(r.body).toBeUndefined();
    expect(r.errors.some((e) => e.kind === 'unopened_bracket')).toBe(true);
  });

  it('samehole은 sequence 안에서도 동작', () => {
    const r = parseRound(1, '2X, [F,T], 3X');
    expect(r.errors).toEqual([]);
    expect(r.body?.elements.map((e) => e.type)).toEqual(['stitch', 'samehole', 'stitch']);
  });

  it('groupKind=samehole 기본', () => {
    const r = parseRound(1, '[F,T]');
    const el = r.body!.elements[0]!;
    if (el.type !== 'samehole') throw new Error('expected samehole');
    expect(el.groupKind).toBe('samehole');
  });
});

describe('parseRound — bridge [...,skip(N)]', () => {
  it('[5O, skip(3)] 은 bridge 로 분류', () => {
    const r = parseRound(1, '[5O, skip(3)]');
    expect(r.errors).toEqual([]);
    const el = r.body!.elements[0]!;
    if (el.type !== 'samehole') throw new Error('expected samehole node');
    expect(el.groupKind).toBe('bridge');
    expect(el.body.elements).toHaveLength(2);
  });

  it('[skip(3), 5O] 도 bridge (순서 무관)', () => {
    const r = parseRound(1, '[skip(3), 5O]');
    expect(r.errors).toEqual([]);
    const el = r.body!.elements[0]!;
    if (el.type !== 'samehole') throw new Error('expected samehole');
    expect(el.groupKind).toBe('bridge');
  });

  it('bridge 안에 사슬 외 stitch 금지', () => {
    const r = parseRound(1, '[5O, X, skip(3)]');
    expect(r.body).toBeUndefined();
    expect(r.errors[0]!.kind).toBe('invalid_samehole');
  });

  it('bridge 안에 skip 2 개 금지', () => {
    const r = parseRound(1, '[2O, skip(1), 2O, skip(1)]');
    expect(r.body).toBeUndefined();
    expect(r.errors[0]!.kind).toBe('invalid_samehole');
  });

  it('bridge prefix count 허용', () => {
    const r = parseRound(1, '3[5O, skip(3)]');
    expect(r.errors).toEqual([]);
    const el = r.body!.elements[0]!;
    if (el.type !== 'samehole') throw new Error('expected samehole');
    expect(el.groupKind).toBe('bridge');
    expect(el.count).toBe(3);
  });

  it('bridge 안에 repeat/tc/중첩[] 금지', () => {
    const r = parseRound(1, '[(2O)*2, skip(3)]');
    expect(r.body).toBeUndefined();
    expect(r.errors[0]!.kind).toBe('invalid_samehole');
  });
});

describe('parseRound — stitch annotations', () => {
  it('X"comment" → comment attached', () => {
    const r = parseRound(1, 'X"주의"');
    expect(r.errors).toEqual([]);
    const el = r.body!.elements[0] as any;
    expect(el.type).toBe('stitch');
    expect(el.kind).toBe('SC');
    expect(el.comment).toBe('주의');
  });

  it('X:#ff0000 → color attached', () => {
    const r = parseRound(1, 'X:#ff0000');
    expect(r.errors).toEqual([]);
    const el = r.body!.elements[0] as any;
    expect(el.color).toBe('#ff0000');
  });

  it('X"a":#ff0000 → both', () => {
    const r = parseRound(1, 'X"hello":#ededed');
    expect(r.errors).toEqual([]);
    const el = r.body!.elements[0] as any;
    expect(el.comment).toBe('hello');
    expect(el.color).toBe('#ededed');
  });

  it('순서 무관: X:#abc"hi"', () => {
    const r = parseRound(1, 'X:#abc"hi"');
    expect(r.errors).toEqual([]);
    const el = r.body!.elements[0] as any;
    expect(el.color).toBe('#abc');
    expect(el.comment).toBe('hi');
  });

  it(': 뒤에 색상 없으면 오류', () => {
    const r = parseRound(1, 'X:');
    expect(r.body).toBeUndefined();
    expect(r.errors[0]!.kind).toBe('unexpected_token');
  });
});

import { expand as expandAst } from '../src/lib/expand/expander';

describe('expander — stitch annotations propagation', () => {
  it('2X:#ff0000 → 모든 op에 색상 전파', () => {
    const r = parseRound(1, '2X:#ff0000');
    const e = expandAst(r.body!, 1);
    expect(e.ops).toHaveLength(2);
    expect((e.ops[0] as any).color).toBe('#ff0000');
    expect((e.ops[1] as any).color).toBe('#ff0000');
  });

  it('X"comment" → op.comment', () => {
    const r = parseRound(1, 'X"note"');
    const e = expandAst(r.body!, 1);
    expect((e.ops[0] as any).comment).toBe('note');
  });
});
