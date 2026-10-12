/**
 * 패턴라이터 사용설명서(v2.0)의 작성 방법을 **우리 문법으로도 쓸 수 있는지** 확인한다.
 *
 * 조사 문서: `docs/pattern_writer_study.md`
 * 각 예제는 설명서의 장·절을 주석으로 달아 두었고, 되는 것은 실제로 파싱·검증까지
 * 돌려 본다. 아직 안 되는 것은 `미지원` 묶음에 **지금은 오류라는 사실**을 고정해
 * 두었다 — 나중에 지원하면 이 테스트가 깨지면서 문서를 함께 고치게 된다.
 */

import { describe, expect, it } from 'vitest';
import { parseRound } from '../src/lib/crafts/crochet/parser';
import { expand as expandOps } from '../src/lib/expand/expander';
import { validateRound } from '../src/lib/validate';
import { readRoundSpec, readRoundRepeat } from '../src/lib/model/round-spec';
import { uncountClosingSlip } from '../src/lib/crafts/crochet/count';
import type { ExpandedRound } from '../src/lib/expand/op';

/** 한 단을 적어 보고 (소비, 생성) 을 돌려준다. 오류가 있으면 실패 */
function round(index: number, src: string): ExpandedRound {
  const { masked } = readRoundSpec(src);
  const parsed = parseRound(index, masked);
  expect(parsed.errors.map((e) => e.message), src).toEqual([]);
  // 코 세는 보정(단 닫는 빼뜨기)까지 거친 실제 결과
  return uncountClosingSlip(expandOps(parsed.body!, index));
}

/** 이어지는 단들을 적어 보고 코 수 검증까지 통과하는지 */
function pattern(...sources: string[]): ExpandedRound[] {
  const rounds = sources.map((src, i) => round(i + 1, src));
  for (let i = 1; i < rounds.length; i++) {
    expect(validateRound(rounds[i]!, rounds[i - 1]!), sources[i]).toEqual([]);
  }
  return rounds;
}

/** 그 표기가 지금은 오류인지 (미지원 확인용) */
function fails(src: string): boolean {
  const { masked } = readRoundSpec(src);
  return parseRound(1, masked).errors.length > 0;
}

describe('패턴라이터 예제 — 쓸 수 있는 것', () => {
  it('1장: 원형코에서 시작하는 원형 도안', () => {
    // 짧은뜨기 6 / 짧은뜨기 2코 늘려뜨기 * 6 / (짧은뜨기, 짧은뜨기 2코 늘려뜨기) * 6
    const r = pattern('@, 6X', '6V', '(X, V)*6');
    expect(r.map((x) => x.totalProduce)).toEqual([6, 12, 18]);
  });

  it('2장: 한 단에 여러 가지 + 기둥코 1 (코로 세지 않는다)', () => {
    // 기둥코 1, 짧은뜨기 5, 짧은뜨기 2코 늘려뜨기, 짧은뜨기 6
    const r = pattern('@, 12X', 'tc(O), 5X, V, 6X');
    expect([r[1]!.totalConsume, r[1]!.totalProduce]).toEqual([12, 13]);
  });

  it('2장: 기둥코 코 수 규칙 (설명서 2장·11-2)', () => {
    const base = round(1, '16O');
    // 기둥코 1 — 코로 세지 않는다
    expect(validateRound(round(2, 'tc(O), 16X'), base)).toEqual([]);
    // 기둥코 2~5 — 아래 코 하나를 차지하고 1코로 센다
    expect(validateRound(round(2, 'tc(3O), 15F'), base)).toEqual([]);
    // 추가 기둥코 — 아래 코를 차지하지 않고 1코로 센다 (16코 → 17코)
    const added = round(2, 'tc+(3O), 16F');
    expect([added.totalConsume, added.totalProduce]).toEqual([16, 17]);
    expect(validateRound(added, base)).toEqual([]);
  });

  it('2장: 단을 닫는 빼뜨기는 코 수에서 뺀다 (중간 빼뜨기는 센다)', () => {
    expect(round(1, '10O, sl').totalProduce).toBe(10);
    const r = pattern('10O, sl', 'tc(O), 10X, sl');
    expect(r[1]!.totalProduce).toBe(10);
    // 단 중간의 빼뜨기는 그대로 1코
    expect(round(2, 'sl, 5X').totalProduce).toBe(6);
  });

  it('2장: 묶음 반복 (짧은뜨기 4, 짧은뜨기 2코 모아뜨기) * 2', () => {
    const r = pattern('@, 12X', '(4X, A)*2');
    expect([r[1]!.totalConsume, r[1]!.totalProduce]).toEqual([12, 10]);
  });

  it('2장: 같은 단이 이어질 때 중략 (11~25단: 짧은뜨기 30)', () => {
    expect(readRoundSpec('11~25단: 30X').spec).toMatchObject({ span: 15 });
    expect(round(11, '11~25단: 30X').totalProduce).toBe(30);
  });

  it('2장: 앞의 여러 단을 통째로 되풀이 (1~2단 반복*3)', () => {
    expect(readRoundRepeat('1~2단 반복*3')).toMatchObject({ from: 1, to: 2, times: 3 });
  });

  it('3장: 왕복 평면 (사슬코 16 위에 쌓기)', () => {
    pattern('16O', '16X', '16X');
  });

  it('4장: 같은코 — 조개무늬 (한 코에 여러 코)', () => {
    // 같은코(한길긴뜨기 3코, 사이사슬코 2, 한길긴뜨기 3코)
    const r = round(2, '[3F, 2O, 3F]');
    // 한 코에서 8개가 나오지만 **사이의 사슬은 코 수에 들어가지 않는다**
    // (설명서의 "사이사슬코는 카운트되지 않아요" 와 같은 셈법)
    expect([r.totalConsume, r.totalProduce]).toEqual([1, 6]);
  });

  it('4장: 스킵 — 건너뛰며 뜨기', () => {
    // 기둥코 3, 한길긴뜨기, 1코 스킵, (한길긴뜨기 2, 1코 스킵)*9, 한길긴뜨기 2
    const r = pattern('32O', 'tc(3O), F, skip(1), (2F, skip(1))*9, 2F');
    expect(r[1]!.totalConsume).toBe(32);
    // 스킵한 코는 다음 단 부모로 남지 않는다 — 22코가 된다
    expect(r[1]!.totalProduce).toBe(22);
  });



  it('4장: 사이사슬 — 코 수에 들어가지 않는 아치', () => {
    // 짧은뜨기, 사이사슬코 2, 1코 스킵 … (그물뜨기)
    const r = pattern('12O', '(1X, 2cs, skip(1))*6');
    expect([r[1]!.totalConsume, r[1]!.totalProduce]).toEqual([12, 6]);
  });

  it('4장: 연결사슬 — 코 수에 들어가고 아래 코를 건너뛴다', () => {
    const r = pattern('12O', '(2F, 2lc)*3');
    expect([r[1]!.totalConsume, r[1]!.totalProduce]).toEqual([12, 12]);
  });

  it('4장: 사이사슬 아치 (설명서 4-1 모양)', () => {
    const r = pattern('12O', 'tc(O), 3X, 2cs, skip(2), 3X, 2cs, skip(2), 2X');
    expect(r[1]!.totalConsume).toBe(12);
  });

  it('4장: 걸어뜨기 — 골지무늬', () => {
    const r = pattern('@, 12X', '12F', '(fpF, bpF)*6');
    expect(r[2]!.ops.map((o) => o.modifier)).toEqual(
      ['FP', 'BP', 'FP', 'BP', 'FP', 'BP', 'FP', 'BP', 'FP', 'BP', 'FP', 'BP'],
    );
  });

  it('4장: 뒤이랑뜨기 (이랑 아래)', () => {
    const r = pattern('@, 12X', 'blo 12X');
    expect(r[1]!.ops.every((o) => o.modifier === 'BLO')).toBe(true);
  });

  it('8장: 코마다 실 색 지정 (배색)', () => {
    const r = round(2, '2X:navy, (2X:cream, 2X:navy)*2');
    expect(new Set(r.ops.map((o) => o.color)).size).toBe(2);
  });

  it('부록: 늘림·줄임 확장 표기', () => {
    expect([round(2, 'V^3').totalConsume, round(2, 'V^3').totalProduce]).toEqual([1, 3]);
    expect([round(2, 'A^3').totalConsume, round(2, 'A^3').totalProduce]).toEqual([3, 1]);
  });
});

describe('아직 셈법이 다른 것 (지금 동작을 고정해 둔다)', () => {
  it('보통 사슬(`O`) 뒤의 스킵은 그 사슬을 건너뛴다 — 옛 표기 그대로', () => {
    // 같은 단에서 만든 사슬을 부모로 쓸 수 있게 둔 설계(그물뜨기)라 스킵이 그 사슬을 먼저 먹는다.
    // 설명서의 `사이사슬코 2, 2코 스킵` 은 이제 `2cs, skip(2)` 로 정확히 적을 수 있다.
    const base = round(1, '12O');
    const arch = round(2, 'tc(O), 3X, 2O, skip(2), 3X, 2O, skip(2), X');
    expect(arch.totalConsume).toBe(11);
    expect(validateRound(arch, base).map((e) => e.kind)).toEqual(['under_consumed']);
  });

  it('같은코 안의 사슬은 코 수에 들어가지 않는다 — 설명서와 같은 셈법', () => {
    expect(round(2, '[3F, 2O, 3F]').totalProduce).toBe(6);
  });
});

describe('패턴라이터 예제 — 아직 못 쓰는 것 (지원하면 이 테스트가 깨진다)', () => {
  it('4장: 코 아래에 뜨기 (아래 사슬을 통째로 감싸기)', () => {
    expect(fails('under 3F')).toBe(true);
    expect(fails('3F 코아래')).toBe(true);
  });

  it('4장: 피코 · 코너 · 돌기 · 시작코', () => {
    for (const src of ['picot5', '코너(2O)', '^(4O)', 'V(시작코)']) {
      expect(fails(src), src).toBe(true);
    }
  });

  it('4장: 교차뜨기 (코바늘)', () => {
    expect(fails('2/2rc')).toBe(true);
  });

  it('5장: 조각 · 잇기 · 나누기', () => {
    for (const src of ['잇기 4O', '나누기 2', '다리 B']) {
      expect(fails(src), src).toBe(true);
    }
  });

  it('6장: 파트 · 테두리', () => {
    for (const src of ['파트 2', '테두리 아래: X']) {
      expect(fails(src), src).toBe(true);
    }
  });

  it('2장: 다른 단에 걸어 뜨기 ([16단])', () => {
    expect(fails('[16단] 48X')).toBe(true);
  });
});
