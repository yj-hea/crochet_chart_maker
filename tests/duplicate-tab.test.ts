import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import {
  workspace, createTab, duplicateTab, switchTab, renameTab,
  setGauge, setViewOption, setShape, addComment, updateRoundSource, addRoundAtEnd,
} from '../src/stores/tabs';

function tabById(id: string) {
  return get(workspace).tabs.find((t) => t.id === id)!;
}

/** 단 3개짜리 대바늘 도안 하나를 만들고 탭 id 를 돌려준다 */
function seedTab(): string {
  const id = createTab('knit');
  const first = get(workspace).tabs.find((t) => t.id === id)!.rounds[0]!.id;
  updateRoundSource(first, 'co10');
  const second = addRoundAtEnd();
  updateRoundSource(second, 'k4, kfb, k5');
  return id;
}

describe('도안 복제', () => {
  it('내용을 그대로 복사하고 원본 바로 뒤에 놓는다', () => {
    const src = seedTab();
    setGauge({ stitches: 22, rows: 30 });
    setViewOption('flatCascade', false);
    setShape('round');

    const copyId = duplicateTab(src);
    const ws = get(workspace);
    const copy = tabById(copyId);

    expect(ws.tabs.findIndex((t) => t.id === copyId))
      .toBe(ws.tabs.findIndex((t) => t.id === src) + 1);
    expect(ws.activeTabId).toBe(copyId); // 복제하면 그 탭으로 옮겨 간다
    expect(copy.craft).toBe('knit');
    expect(copy.shape).toBe('round');
    expect(copy.gauge).toEqual({ stitches: 22, rows: 30 });
    expect(copy.view?.flatCascade).toBe(false);
    expect(copy.rounds.map((r) => r.source)).toEqual(tabById(src).rounds.map((r) => r.source));
    // 파싱까지 끝난 상태로 복사된다 — 열어 보면 바로 그려져야 한다
    expect(copy.rounds[1]!.expanded?.totalProduce).toBe(11);
  });

  it('사본이라는 것이 이름으로 드러나고, 거듭 복제해도 겹치지 않는다', () => {
    const src = seedTab();
    renameTab(src, '모자');
    const first = duplicateTab(src);
    const second = duplicateTab(src);
    expect(tabById(first).name).toBe('모자 사본');
    expect(tabById(second).name).toBe('모자 사본 2');
  });

  it('단·메모 id 를 새로 만들어 원본과 얽히지 않는다', () => {
    const src = seedTab();
    addComment({ kind: 'round', roundId: tabById(src).rounds[0]!.id }, '이 단 주의');
    addComment({ kind: 'pattern' }, '도안 메모');

    const copyId = duplicateTab(src);
    const original = tabById(src);
    const copy = tabById(copyId);

    const srcRoundIds = original.rounds.map((r) => r.id);
    expect(copy.rounds.every((r) => !srcRoundIds.includes(r.id))).toBe(true);
    expect(copy.comments.every((c) => !original.comments.some((o) => o.id === c.id))).toBe(true);

    // 단 메모는 사본의 단을 가리킨다
    const roundComment = copy.comments.find((c) => c.target.kind === 'round')!;
    expect(roundComment.target).toEqual({ kind: 'round', roundId: copy.rounds[0]!.id });
    expect(copy.comments.some((c) => c.target.kind === 'pattern')).toBe(true);
  });

  it('사본을 고쳐도 원본은 그대로다', () => {
    const src = seedTab();
    const copyId = duplicateTab(src);
    updateRoundSource(tabById(copyId).rounds[0]!.id, 'co40');
    setGauge({ stitches: 18, rows: 24 });

    switchTab(src);
    expect(tabById(src).rounds[0]!.source).toBe('co10');
    expect(tabById(src).gauge).toBeUndefined();
    expect(tabById(copyId).rounds[0]!.source).toBe('co40');
  });

  it('없는 탭 id 는 아무것도 하지 않는다', () => {
    const before = get(workspace).tabs.length;
    expect(duplicateTab('없는탭')).toBe('');
    expect(get(workspace).tabs).toHaveLength(before);
  });
});
