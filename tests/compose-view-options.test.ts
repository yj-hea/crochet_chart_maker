/**
 * 합쳐 그릴 때 조각은 **자기 표시 옵션**으로 풀린다.
 *
 * 표시 옵션은 도안마다 따로 기억하는 값이다. 대바늘의 읽는 방향(우→좌 / 좌→우)은
 * 차트를 좌우로 뒤집으므로, 보고 있는 도안의 설정으로 남의 조각을 풀면 그 조각만
 * 거울상으로 붙는다.
 */
import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import {
  workspace, createTab, switchTab, updateRoundSource, addRoundAtEnd, setViewOption, setTabStart,
} from '../src/stores/tabs';
import { composedLayout, layoutOfTab } from '../src/stores/rendered';

/** 단 두 개짜리 대바늘 도안 — 한쪽으로 치우쳐 좌우 반전이 눈에 보인다 */
function seedKnit(first: string, second: string): string {
  const id = createTab('knit');
  updateRoundSource(get(workspace).tabs.find((t) => t.id === id)!.rounds[0]!.id, first);
  updateRoundSource(addRoundAtEnd(), second);
  return id;
}

function xsOf(id: string): number[] {
  const tab = get(workspace).tabs.find((t) => t.id === id)!;
  return (layoutOfTab(tab)?.stitches ?? [])
    .filter((s) => s.roundIndex === 2)
    .map((s) => s.position.x);
}

describe('조각마다 자기 표시 옵션', () => {
  it('읽는 방향을 바꾸면 그 도안만 좌우가 뒤집힌다', () => {
    const id = seedKnit('co6', 'k2tog, k4');
    const right = xsOf(id);
    setViewOption('knitStartSide', 'L');
    const left = xsOf(id);
    expect(left).not.toEqual(right);
  });

  it('합쳐 그린 조각의 코는 그 조각의 설정대로 놓인다', () => {
    const legId = seedKnit('co6', 'k2tog, k4');
    setViewOption('knitStartSide', 'L');          // 조각은 좌→우
    const own = xsOf(legId);

    const bodyId = seedKnit('co5', 'k5');
    switchTab(bodyId);
    setViewOption('knitStartSide', 'R');          // 보고 있는 도안은 우→좌
    setTabStart(bodyId, { kind: 'from', piece: legId });

    const out = get(composedLayout)!;
    const foreign = out.stitches
      .filter((s) => s.foreign && s.roundIndex === 2)
      .map((s) => s.position.x);
    // 자리는 옮겨 붙지만 **모양**(코 사이 간격)은 조각 자신의 것이어야 한다
    const shift = foreign[0]! - own[0]!;
    expect(foreign.map((x) => x - shift)).toEqual(own);
  });
});
