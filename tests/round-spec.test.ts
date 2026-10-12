import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import {
  readRoundSpec, readRoundRepeat, rewriteSpec, spanOf, isFolded,
} from '../src/lib/model/round-spec';
import { planRounds } from '../src/lib/model/round-plan';
import { roundNumbers, formatRoundNumber, countRounds } from '../src/lib/model/round-numbers';
import { validateRoundSpec, validateRoundRepeat } from '../src/lib/validate';
import { parseKnitRound } from '../src/lib/crafts/knit/parser';
import { expandKnit } from '../src/lib/crafts/knit/expander';
import { layoutKnitGrid } from '../src/lib/crafts/knit/grid';
import { renderKnitSvg } from '../src/lib/crafts/knit/svg';
import { applyAdjustments } from '../src/lib/layout/adjust';
import {
  workspace, createTab, updateRoundSource, addRoundAtEnd,
} from '../src/stores/tabs';
import { chartRows } from '../src/stores/rendered';

function activeTab() {
  const ws = get(workspace);
  return ws.tabs.find((t) => t.id === ws.activeTabId)!;
}

function expandMasked(index: number, source: string) {
  const { masked, spec } = readRoundSpec(source);
  const parsed = parseKnitRound(index, masked);
  expect(parsed.errors, source).toEqual([]);
  return { expanded: expandKnit(parsed.body!, index), spec };
}

describe('단 접두어 읽기', () => {
  it('범위를 읽고 단 수를 센다', () => {
    const { spec } = readRoundSpec('11~25단: k30');
    expect(spec).toMatchObject({ from: 11, to: 25, span: 15 });
    expect(isFolded(spec)).toBe(true);
  });

  it('번호 하나만 적으면 한 단', () => {
    expect(readRoundSpec('7단: k30').spec).toMatchObject({ from: 7, to: 7, span: 1 });
    expect(readRoundSpec('7: k30').spec).toMatchObject({ from: 7, span: 1 });
    expect(isFolded(readRoundSpec('7단: k30').spec)).toBe(false);
  });

  it('하이픈·공백·단 생략을 모두 받는다', () => {
    for (const src of ['11-25단: k30', '11 ~ 25 단 : k30', '11~25: k30']) {
      expect(spanOf(readRoundSpec(src).spec), src).toBe(15);
    }
  });

  it('접두어가 아니면 건드리지 않는다', () => {
    for (const src of ['k30', 'k2:navy, k3', '3k, p2']) {
      const r = readRoundSpec(src);
      expect(r.spec, src).toBeUndefined();
      expect(r.masked).toBe(src);
    }
  });

  it('접두어를 공백으로 덮어 코의 자리를 지킨다', () => {
    const src = '11~25단: k30';
    const { masked } = readRoundSpec(src);
    expect(masked).toBe(' '.repeat(src.indexOf('k30')) + 'k30');
    // 그래서 파서가 보는 위치가 원본과 같다
    const parsed = parseKnitRound(11, masked);
    expect(parsed.errors).toEqual([]);
    expect(src.slice(parsed.body!.elements[0]!.range.start, parsed.body!.elements[0]!.range.end))
      .toBe('k30');
  });

  it('거꾸로 된 범위는 한 단으로 보고 표시해 둔다', () => {
    const { spec } = readRoundSpec('25~11단: k30');
    expect(spec).toMatchObject({ span: 1, reversed: true });
  });

  it('계산한 번호로 접두어를 다시 쓴다', () => {
    expect(rewriteSpec('11~25단: k30', 9)).toBe('9~23단: k30');
    expect(rewriteSpec('11단: k30', 9)).toBe('9단: k30');
    expect(rewriteSpec('k30', 9)).toBe('k30');
  });
});

describe('접은 줄의 단 번호', () => {
  it('뒤 단 번호가 접은 수만큼 밀린다', () => {
    const nums = roundNumbers([{}, { span: 15 }, {}]);
    expect(nums.map((n) => n.number)).toEqual([1, 2, 17]);
    expect(nums.map(formatRoundNumber)).toEqual(['1', '2~16', '17']);
  });

  it('전체 단 수도 접은 수만큼 센다', () => {
    expect(countRounds([{}, { span: 15 }, {}])).toBe(17);
  });

  it('되돌아뜨기 이어짐과 섞여도 번호가 맞는다', () => {
    const nums = roundNumbers([{}, {}, { continued: true }, { span: 10 }, {}]);
    expect(nums.map(formatRoundNumber)).toEqual(['1', '2-1', '2-2', '3~12', '13']);
  });
});

describe('접은 줄 검증', () => {
  it('코 수가 변하면 접을 수 없다', () => {
    const { expanded, spec } = expandMasked(2, '11~25단: k28, k2tog');
    const errors = validateRoundSpec(expanded, spec, 11);
    expect(errors.map((e) => e.kind)).toContain('folded_changed');
  });

  it('코 수가 그대로면 통과한다', () => {
    const { expanded, spec } = expandMasked(2, '11~25단: k30');
    expect(validateRoundSpec(expanded, spec, 11)).toEqual([]);
  });

  it('적어 둔 번호가 실제와 다르면 안내한다 (도안은 그대로 그린다)', () => {
    const { expanded, spec } = expandMasked(2, '11~25단: k30');
    const [warn] = validateRoundSpec(expanded, spec, 9);
    expect(warn).toMatchObject({ kind: 'number_mismatch', warning: true });
    expect(warn!.message).toContain('9~23단');
  });
});

describe('도안 — 접은 줄', () => {
  it('번호가 범위로 나오고 물결선이 그려진다', () => {
    const rows = ['co30', 'k30', '3~17단: k30'].map((src, i) => {
      const { masked } = readRoundSpec(src);
      const parsed = parseKnitRound(i + 1, masked);
      const e = expandKnit(parsed.body!, i + 1);
      if (i === 2) e.label = '3~17';
      return e;
    });
    const layout = applyAdjustments(layoutKnitGrid(rows, { shape: 'flat' }));
    const svg = renderKnitSvg({ layout, showGrid: true });
    expect(svg).toContain('>3~17<');
    expect(svg).toContain('class="fold-marks"');
  });
});

describe('접은 줄 — 스토어', () => {
  it('접두어를 적으면 뒤 단 번호가 밀린다', () => {
    createTab('knit');
    updateRoundSource(activeTab().rounds[0]!.id, 'co30');
    const second = addRoundAtEnd();
    updateRoundSource(second, '2~16단: k30');
    const third = addRoundAtEnd();
    updateRoundSource(third, 'k30');

    const t = activeTab();
    expect(t.rounds.map((r) => r.expanded?.label)).toEqual(['1', '2~16', '17']);
    expect(t.rounds[1]!.spec?.span).toBe(15);
    // 접두어는 코로 읽히지 않는다
    expect(t.rounds[1]!.expanded?.totalProduce).toBe(30);
    expect(t.rounds[1]!.parsed?.errors).toEqual([]);
  });

  it('접두어는 소스에만 있고 저장 포맷에 따로 들어가지 않는다', () => {
    createTab('knit');
    updateRoundSource(activeTab().rounds[0]!.id, '1~5단: co30');
    const saved = activeTab().rounds[0]!;
    expect(saved.source).toBe('1~5단: co30');
    expect(saved.spec?.span).toBe(5);
  });
});

describe('앞 단 되풀이 (1~2단 반복*3)', () => {
  it('지시문을 읽는다', () => {
    expect(readRoundRepeat('1~2단 반복*3')).toMatchObject({ from: 1, to: 2, times: 3 });
    expect(readRoundRepeat('1~2단 반복')).toMatchObject({ from: 1, to: 2, times: 1 });
    expect(readRoundRepeat('5단 반복 × 2')).toMatchObject({ from: 5, to: 5, times: 2 });
    expect(readRoundRepeat('k30')).toBeUndefined();
    expect(readRoundRepeat('1~2단: k30')).toBeUndefined();
  });

  it('앞 단을 복사해 도안 행으로 펼친다', () => {
    createTab('knit');
    updateRoundSource(activeTab().rounds[0]!.id, 'co12');
    updateRoundSource(addRoundAtEnd(), 'k2, (p2, k2)*2, p2');
    updateRoundSource(addRoundAtEnd(), 'p2, (k2, p2)*2, k2');
    updateRoundSource(addRoundAtEnd(), '2~3단 반복*3');

    const t = activeTab();
    expect(t.rounds.map((r) => r.expanded?.label)).toEqual(['1', '2', '3', '4~9']);

    const plan = planRounds(t.rounds);
    // 1단 + 2단 + 3단 + (2·3단) × 3 = 9행
    expect(plan.chart).toHaveLength(9);
    expect(plan.chart.map((r) => r.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(plan.chart.map((r) => r.expanded.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    // 복사된 행은 원본과 같은 코 구성
    expect(plan.chart[3]!.expanded.ops.map((o) => o.kind))
      .toEqual(plan.chart[1]!.expanded.ops.map((o) => o.kind));
    expect(plan.chart[3]!.copyOf).toBe(1);
  });

  it('되풀이 뒤의 단 번호가 이어진다', () => {
    createTab('knit');
    updateRoundSource(activeTab().rounds[0]!.id, 'co12');
    updateRoundSource(addRoundAtEnd(), 'k12');
    updateRoundSource(addRoundAtEnd(), '1~2단 반복*2');
    updateRoundSource(addRoundAtEnd(), 'k12');
    expect(activeTab().rounds.map((r) => r.expanded?.label)).toEqual(['1', '2', '3~6', '7']);
  });

  it('찾지 못하는 단을 가리키면 알려 준다', () => {
    const repeat = readRoundRepeat('8~9단 반복*2')!;
    expect(validateRoundRepeat(repeat, 0, 3).map((e) => e.kind)).toEqual(['repeat_missing']);
    expect(validateRoundRepeat(repeat, 4, 3)).toEqual([]);
  });

  it('접어 적기와 섞여도 번호가 맞는다', () => {
    createTab('knit');
    updateRoundSource(activeTab().rounds[0]!.id, 'co12');
    updateRoundSource(addRoundAtEnd(), '2~11단: k12');
    updateRoundSource(addRoundAtEnd(), '1단 반복*2');
    expect(activeTab().rounds.map((r) => r.expanded?.label)).toEqual(['1', '2~11', '12~13']);
  });
});

describe('읽기 모드 — 도안 행 단위', () => {
  it('되풀이로 펼쳐진 행까지 걷고, 글은 원본 줄에서 가져온다', () => {
    createTab('knit');
    updateRoundSource(activeTab().rounds[0]!.id, 'co12');
    const rib1 = addRoundAtEnd();
    updateRoundSource(rib1, 'k2, (p2, k2)*2, p2');
    const rib2 = addRoundAtEnd();
    updateRoundSource(rib2, 'p2, (k2, p2)*2, k2');
    updateRoundSource(addRoundAtEnd(), '2~3단 반복*3');

    const rows = get(chartRows);
    expect(rows).toHaveLength(9);
    expect(rows.map((r) => r.label)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9']);
    // 4번째 행은 2단의 복사본 — 글과 메모는 원본 줄에서
    expect(rows[3]!.sourceLineId).toBe(rib1);
    expect(rows[4]!.sourceLineId).toBe(rib2);
    expect(rows.every((r) => r.stitchCount === 12)).toBe(true);
  });

  it('접어 적은 줄은 한 행으로 센다', () => {
    createTab('knit');
    updateRoundSource(activeTab().rounds[0]!.id, 'co12');
    updateRoundSource(addRoundAtEnd(), '2~16단: k12');
    const rows = get(chartRows);
    expect(rows.map((r) => r.label)).toEqual(['1', '2~16']);
  });
});
