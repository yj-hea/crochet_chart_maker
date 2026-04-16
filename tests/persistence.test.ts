import { describe, expect, it } from 'vitest';
import { serialize, validate, FILE_VERSION } from '../src/lib/persistence';

describe('serialize', () => {
  it('기본 상태를 저장용 객체로 직렬화', () => {
    const out = serialize({
      shape: 'circular',
      rounds: [{ source: '@, 6X' }, { source: '6V' }],
    });
    expect(out.version).toBe(FILE_VERSION);
    expect(out.shape).toBe('circular');
    expect(out.rounds).toEqual([{ source: '@, 6X' }, { source: '6V' }]);
    expect(out.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('id 등 파생 필드는 저장하지 않음', () => {
    const out = serialize({
      shape: 'flat',
      rounds: [{ source: 'X' } as any, { source: 'V' } as any],
    });
    expect((out.rounds[0] as any).id).toBeUndefined();
  });
});

describe('validate', () => {
  it('유효한 데이터 통과', () => {
    const data = {
      version: 1,
      savedAt: '2026-04-15T00:00:00Z',
      shape: 'circular',
      rounds: [{ source: '@, 6X' }],
    };
    const out = validate(data);
    expect(out.shape).toBe('circular');
    expect(out.rounds).toEqual([{ source: '@, 6X' }]);
  });

  it('객체 아님 → 에러', () => {
    expect(() => validate(null)).toThrow();
    expect(() => validate('hello')).toThrow();
    expect(() => validate(42)).toThrow();
  });

  it('버전 불일치 → 에러', () => {
    expect(() => validate({ version: 2, shape: 'circular', rounds: [] })).toThrow(/버전/);
  });

  it('알 수 없는 shape → 에러', () => {
    expect(() => validate({ version: 1, shape: 'triangle', rounds: [] })).toThrow(/도형/);
  });

  it('rounds 누락 → 에러', () => {
    expect(() => validate({ version: 1, shape: 'circular' })).toThrow(/rounds/);
  });

  it('rounds 항목에 source 누락 → 에러', () => {
    expect(() => validate({
      version: 1,
      shape: 'circular',
      rounds: [{ other: 'x' }],
    })).toThrow(/source/);
  });

  it('serialize → validate 왕복', () => {
    const original = {
      shape: 'flat' as const,
      rounds: [{ source: '6O' }, { source: '(1X,1V)*3' }],
    };
    const serialized = serialize(original);
    const restored = validate(JSON.parse(JSON.stringify(serialized)));
    expect(restored.shape).toBe(original.shape);
    expect(restored.rounds).toEqual(original.rounds);
  });
});
