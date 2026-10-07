import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import {
  applyAdjustments, adjustTransform, mergeAdjust, isEmptyAdjust,
  stitchKey, numberKey, markerKey, describeKey, elementKind,
} from '../src/lib/layout/adjust';
import { parseKnitRound } from '../src/lib/crafts/knit/parser';
import { expandKnit } from '../src/lib/crafts/knit/expander';
import { layoutKnitGrid } from '../src/lib/crafts/knit/grid';
import { renderKnitSvg } from '../src/lib/crafts/knit/svg';
import {
  workspace, createTab, updateRoundSource, addRoundAtEnd, toSavedTab, applyWorkspace,
  nudgeElements, resetAdjustments, undoAdjust, adjustments, adjustCount,
} from '../src/stores/tabs';
import { serializeWorkspace, validateWorkspace } from '../src/lib/persistence';

function layout(...srcs: string[]) {
  const rounds = srcs.map((src, i) => {
    const parsed = parseKnitRound(i + 1, src);
    expect(parsed.errors, src).toEqual([]);
    return expandKnit(parsed.body!, i + 1);
  });
  return layoutKnitGrid(rounds, { shape: 'flat' });
}

/** SVG 가 쓰는 숫자 표기 (정수는 그대로, 아니면 소수점 2자리) */
function num(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function activeTab() {
  const ws = get(workspace);
  return ws.tabs.find((t) => t.id === ws.activeTabId)!;
}

describe('보정값', () => {
  it('빈 보정은 transform 을 만들지 않는다', () => {
    expect(isEmptyAdjust(undefined)).toBe(true);
    expect(isEmptyAdjust({ dx: 0, dy: 0, scale: 1, rot: 0 })).toBe(true);
    expect(adjustTransform({ dx: 0, dy: 0 }, 5, 5)).toBeUndefined();
  });

  it('옮기기·회전·확대를 중심 기준으로 쓴다', () => {
    expect(adjustTransform({ dx: 3, dy: -2 }, 10, 20)).toBe('translate(3 -2)');
    expect(adjustTransform({ rot: 90 }, 10, 20)).toBe('rotate(90 10 20)');
    expect(adjustTransform({ scale: 2 }, 10, 20))
      .toBe('translate(10 20) scale(2) translate(-10 -20)');
  });

  it('보정을 합치면 이동은 더하고 배율은 곱한다', () => {
    expect(mergeAdjust({ dx: 2, scale: 2 }, { dx: 3, scale: 1.5, rot: 10 }))
      .toEqual({ dx: 5, dy: 0, scale: 3, rot: 10 });
  });

  it('키로 종류와 이름을 알 수 있다', () => {
    expect(elementKind(stitchKey(3, 5))).toBe('stitch');
    expect(elementKind(numberKey(3))).toBe('number');
    expect(elementKind(markerKey(3, 0))).toBe('marker');
    expect(describeKey(stitchKey(3, 5))).toBe('3단 6번째 코');
    expect(describeKey(numberKey(2))).toBe('2단 번호');
  });
});

describe('레이아웃에 보정 입히기', () => {
  it('보정이 없어도 키는 모두 붙는다 — 고르려면 식별자가 필요하다', () => {
    const out = applyAdjustments(layout('co4', 'k4'));
    expect(out.stitches.map((s) => s.key))
      .toEqual(['s:1:0', 's:1:1', 's:1:2', 's:1:3', 's:2:0', 's:2:1', 's:2:2', 's:2:3']);
    expect(out.roundMarkers.map((m) => m.key)).toEqual(['n:1', 'n:2']);
    expect(out.stitches.every((s) => s.transform === undefined)).toBe(true);
  });

  it('보정한 요소에만 transform 이 붙는다', () => {
    const out = applyAdjustments(layout('co4', 'k4'), { 's:2:1': { dx: 5, dy: -3 } });
    const moved = out.stitches.find((s) => s.key === 's:2:1')!;
    expect(moved.transform).toBe('translate(5 -3)');
    expect(out.stitches.filter((s) => s.transform).length).toBe(1);
    // 좌표 자체는 그대로 — 3D·게이지 계산은 자동 배치를 본다
    const before = layout('co4', 'k4').stitches[5]!;
    expect(moved.position).toEqual(before.position);
  });

  it('도안 밖으로 옮겨도 잘리지 않도록 경계를 넓힌다', () => {
    const base = layout('co4', 'k4');
    const out = applyAdjustments(base, { 's:2:0': { dx: 200, dy: -200 } });
    expect(out.bounds.maxX).toBeGreaterThan(base.bounds.maxX);
    expect(out.bounds.minY).toBeLessThan(base.bounds.minY);
  });

  it('렌더러가 키·중심·transform 을 SVG 에 싣는다', () => {
    const base = layout('co4', 'k4');
    const out = applyAdjustments(base, { 's:2:1': { dx: 5, dy: -3 } });
    const svg = renderKnitSvg({ layout: out, showGrid: true });
    expect(svg).toContain('data-el="s:1:0"');
    expect(svg).toContain('data-el="n:2"');
    // 크기·회전의 기준점 — 잉크 경계가 아니라 코의 자리를 그대로 싣는다
    const moved = base.stitches[5]!;
    expect(svg).toContain(
      `<g data-el="s:2:1" data-cx="${num(moved.position.x)}" data-cy="${num(moved.position.y)}" transform="translate(5 -3)">`,
    );
  });

  it('모든 코와 단 번호가 중심을 싣는다', () => {
    const svg = renderKnitSvg({ layout: applyAdjustments(layout('co4', 'k4')), showGrid: true });
    const withCenter = svg.match(/data-el="[^"]+" data-cx="/g) ?? [];
    expect(withCenter.length).toBe(8 + 2); // 코 8 + 단 번호 2
  });
});

describe('보정 스토어', () => {
  it('옮긴 값이 쌓이고 개수가 센다', () => {
    createTab('knit');
    updateRoundSource(activeTab().rounds[0]!.id, 'co4');
    nudgeElements(['s:1:0'], { dx: 4 });
    nudgeElements(['s:1:0'], { dx: 2, dy: 1 });
    expect(get(adjustments)['s:1:0']).toEqual({ dx: 6, dy: 1, scale: 1, rot: 0 });
    expect(get(adjustCount)).toBe(1);
  });

  it('되돌리기는 직전 상태로 돌아간다', () => {
    createTab('knit');
    updateRoundSource(activeTab().rounds[0]!.id, 'co4');
    nudgeElements(['s:1:0'], { dx: 4 });
    nudgeElements(['s:1:1'], { dy: 3 });
    expect(get(adjustCount)).toBe(2);

    expect(undoAdjust()).toBe(true);
    expect(get(adjustCount)).toBe(1);
    expect(undoAdjust()).toBe(true);
    expect(get(adjustCount)).toBe(0);
    expect(undoAdjust()).toBe(false);
  });

  it('고른 것만 또는 전체를 초기화한다', () => {
    createTab('knit');
    updateRoundSource(activeTab().rounds[0]!.id, 'co4');
    nudgeElements(['s:1:0', 's:1:1'], { dx: 4 });
    resetAdjustments(['s:1:0']);
    expect(Object.keys(get(adjustments))).toEqual(['s:1:1']);
    resetAdjustments();
    expect(get(adjustCount)).toBe(0);
    expect(activeTab().adjust).toBeUndefined();
  });

  it('저장 → 복원 뒤에도 남는다', () => {
    const id = createTab('knit');
    updateRoundSource(activeTab().rounds[0]!.id, 'co4');
    updateRoundSource(addRoundAtEnd(), 'k4');
    nudgeElements(['s:2:2'], { dx: 7, dy: -2 });

    const ws = get(workspace);
    const wire = JSON.parse(JSON.stringify(
      serializeWorkspace({ tabs: ws.tabs.map(toSavedTab), activeTabId: ws.activeTabId }),
    ));
    applyWorkspace(validateWorkspace(wire));

    const tab = get(workspace).tabs.find((t) => t.id === id)!;
    expect(tab.adjust).toEqual({ 's:2:2': { dx: 7, dy: -2, scale: 1, rot: 0 } });
  });

  it('이상한 값이 섞인 파일을 읽어도 도안을 버리지 않는다', () => {
    const restored = validateWorkspace({
      version: 3,
      tabs: [{
        id: 't1', name: '도안', craft: 'knit', shape: 'flat',
        rounds: [{ source: 'co4' }],
        adjust: {
          's:1:0': { dx: 3 },
          's:1:1': { dx: 'nope', dy: null },
          's:1:2': 'garbage',
          's:1:3': { dx: 0, dy: 0 },
        },
      }],
      activeTabId: 't1',
    });
    expect(restored.tabs[0]!.adjust).toEqual({ 's:1:0': { dx: 3 } });
  });
});
