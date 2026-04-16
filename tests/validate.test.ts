import { describe, expect, it } from 'vitest';
import { parseRound } from '../src/lib/parser/parser';
import { expand } from '../src/lib/expand/expander';
import { validateRound } from '../src/lib/validate';
import type { ExpandedRound } from '../src/lib/expand/op';

function expandFrom(source: string, index: number): ExpandedRound {
  const r = parseRound(index, source);
  if (!r.body) throw new Error(`parse failed: ${JSON.stringify(r.errors)}`);
  return expand(r.body, index);
}

describe('validateRound', () => {
  it('코 수 일치 → 오류 없음', () => {
    const r1 = expandFrom('@, 6X', 1);   // produce = 6
    const r2 = expandFrom('6V', 2);       // consume = 6
    expect(validateRound(r2, r1)).toEqual([]);
  });

  it('초과 소비 → over_consumed', () => {
    const r1 = expandFrom('@, 6X', 1);    // produce = 6
    const r2 = expandFrom('8X', 2);        // consume = 8
    const errs = validateRound(r2, r1);
    expect(errs).toHaveLength(1);
    expect(errs[0]!.kind).toBe('over_consumed');
    expect(errs[0]!.expected).toBe(6);
    expect(errs[0]!.actual).toBe(8);
    expect(errs[0]!.offendingRange).toBeDefined();
    expect(errs[0]!.message).toMatch(/초과/);
  });

  it('부족 소비 → under_consumed', () => {
    const r1 = expandFrom('@, 6X', 1);    // produce = 6
    const r2 = expandFrom('4X', 2);        // consume = 4
    const errs = validateRound(r2, r1);
    expect(errs).toHaveLength(1);
    expect(errs[0]!.kind).toBe('under_consumed');
    expect(errs[0]!.expected).toBe(6);
    expect(errs[0]!.actual).toBe(4);
    expect(errs[0]!.message).toMatch(/부족/);
  });

  it('초과 시 offendingRange가 초과 유발 Op의 위치', () => {
    const r1 = expandFrom('3O', 1);        // produce = 3
    const r2 = expandFrom('2X, 2X', 2);    // consume = 4 → 4번째 코가 초과
    const errs = validateRound(r2, r1);
    expect(errs[0]!.offendingRange).toBeDefined();
    // 2X, 2X — 첫 2X가 2 소비, 두번째 2X의 첫번째가 3번째(3=limit) 소비,
    // 두번째 2X의 두번째가 4번째 소비 → 초과. sourceRange는 두번째 2X의 range.
  });

  it('V로 확장 후 다음 단 정상', () => {
    const r1 = expandFrom('@, 6X', 1);     // produce = 6
    const r2 = expandFrom('6V', 2);         // consume = 6, produce = 12
    const r3 = expandFrom('12X', 3);        // consume = 12
    expect(validateRound(r2, r1)).toEqual([]);
    expect(validateRound(r3, r2)).toEqual([]);
  });

  it('A(줄임) 후 다음 단 정상', () => {
    const r1 = expandFrom('12X', 1);        // produce = 12
    const r2 = expandFrom('6A', 2);          // consume = 12, produce = 6
    const r3 = expandFrom('6X', 3);          // consume = 6
    expect(validateRound(r2, r1)).toEqual([]);
    expect(validateRound(r3, r2)).toEqual([]);
  });

  it('samehole 그룹도 검증 통과', () => {
    const r1 = expandFrom('2O', 1);          // produce = 2
    const r2 = expandFrom('[F,T]', 2);       // consume = 1 → under
    const errs = validateRound(r2, r1);
    expect(errs).toHaveLength(1);
    expect(errs[0]!.kind).toBe('under_consumed');
    expect(errs[0]!.expected).toBe(2);
    expect(errs[0]!.actual).toBe(1);
  });
});
