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
