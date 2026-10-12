import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import {
  roundNumbers, formatRoundNumber, countRounds,
} from '../src/lib/model/round-numbers';
import {
  workspace, createTab, updateRoundSource, addRoundAtEnd, insertRoundsAfter,
  toggleRoundContinued, toSavedTab, applyWorkspace,
} from '../src/stores/tabs';
import { serializeWorkspace, validateWorkspace } from '../src/lib/persistence';

function activeTab() {
  const ws = get(workspace);
  return ws.tabs.find((t) => t.id === ws.activeTabId)!;
}

function labels(): Array<string | undefined> {
  return activeTab().rounds.map((r) => r.expanded?.label);
}

describe('표시용 단 번호', () => {
  it('이어지는 줄은 앞 줄과 번호를 나눠 쓴다', () => {
    const nums = roundNumbers([false, false, true, true, false]);
    expect(nums.map(formatRoundNumber)).toEqual(['1', '2-1', '2-2', '2-3', '3']);
    expect(countRounds([false, false, true, true, false])).toBe(3);
  });

  it('첫 줄은 이어질 앞 줄이 없어 새 단으로 센다', () => {
    expect(roundNumbers([true, true]).map(formatRoundNumber)).toEqual(['1-1', '1-2']);
  });

  it('한 줄짜리 단은 번호에 가지를 붙이지 않는다', () => {
    expect(formatRoundNumber({ number: 7, pass: 1, passes: 1, span: 1 })).toBe('7');
  });

  it('빈 도안은 0단', () => {
    expect(countRounds([])).toBe(0);
  });
});

describe('단 번호 — 스토어', () => {
  it('이어짐을 켜면 뒤 단 번호가 당겨진다', () => {
    createTab('knit');
    const first = activeTab().rounds[0]!.id;
    updateRoundSource(first, 'co19');
    const second = addRoundAtEnd();
    updateRoundSource(second, 'k11, wt');
    const third = addRoundAtEnd();
    updateRoundSource(third, 'p4, wt');
    const fourth = addRoundAtEnd();
    updateRoundSource(fourth, 'k12');

    expect(labels()).toEqual(['1', '2', '3', '4']);

    toggleRoundContinued(third);
    toggleRoundContinued(fourth);
    expect(labels()).toEqual(['1', '2-1', '2-2', '2-3']);

    toggleRoundContinued(third);
    expect(labels()).toEqual(['1', '2', '3-1', '3-2']);
  });

  it('첫 줄은 이어짐을 켤 수 없다', () => {
    createTab('knit');
    const first = activeTab().rounds[0]!.id;
    toggleRoundContinued(first);
    expect(activeTab().rounds[0]!.continued).toBeUndefined();
  });

  it('되돌아뜨기 묶음은 한 단으로 삽입된다', () => {
    createTab('knit');
    const first = activeTab().rounds[0]!.id;
    updateRoundSource(first, 'co19');
    insertRoundsAfter(first, ['k11, wt, unw7', 'unw7, p4, wt, unw7', 'unw7, k12'], { asOneRound: true });

    expect(activeTab().rounds.map((r) => r.continued === true))
      .toEqual([false, false, true, true]);
    expect(labels()).toEqual(['1', '2-1', '2-2', '2-3']);
  });

  it('이어짐은 저장 → 복원 뒤에도 남는다', () => {
    const id = createTab('knit');
    updateRoundSource(activeTab().rounds[0]!.id, 'co19');
    const second = addRoundAtEnd();
    updateRoundSource(second, 'k11, wt');
    const third = addRoundAtEnd();
    updateRoundSource(third, 'p4, wt');
    toggleRoundContinued(third);

    const ws = get(workspace);
    const wire = JSON.parse(JSON.stringify(
      serializeWorkspace({ tabs: ws.tabs.map(toSavedTab), activeTabId: ws.activeTabId }),
    ));
    applyWorkspace(validateWorkspace(wire));

    const tab = get(workspace).tabs.find((t) => t.id === id)!;
    expect(tab.rounds.map((r) => r.continued === true)).toEqual([false, false, true]);
    expect(tab.rounds.map((r) => r.expanded?.label)).toEqual(['1', '2-1', '2-2']);
  });
});

describe('미작업 코 자동 채우기 — 스토어', () => {
  it('unw 없이 적어도 단마다 코 수가 맞는다', () => {
    createTab('knit');
    updateRoundSource(activeTab().rounds[0]!.id, 'co19');
    for (const src of ['k11, wt', 'p4, wt', 'k12', 'p19']) {
      updateRoundSource(addRoundAtEnd(), src);
    }
    expect(activeTab().rounds.map((r) => r.expanded?.totalProduce))
      .toEqual([19, 19, 19, 19, 19]);
  });

  it('앞 단을 고치면 뒤 단의 미작업 코도 다시 계산된다', () => {
    createTab('knit');
    const first = activeTab().rounds[0]!.id;
    updateRoundSource(first, 'co19');
    const second = addRoundAtEnd();
    updateRoundSource(second, 'k11, wt');

    const held = () => activeTab().rounds[1]!.expanded!.ops.filter((o) => o.autoFilled).length;
    expect(held()).toBe(7);

    updateRoundSource(first, 'co25');
    expect(held()).toBe(13);
  });
});
