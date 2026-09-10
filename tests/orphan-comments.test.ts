import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import {
  workspace, createTab, addComment, addRoundAtEnd, orphanComments, reattachComment,
} from '../src/stores/tabs';

function activeTab() {
  const ws = get(workspace);
  return ws.tabs.find((t) => t.id === ws.activeTabId)!;
}

/** 예전 자동 저장이 남긴 형태 — 이 탭에 없는 런타임 단 id 를 가리킨다 */
const STALE_ROUND_ID = 'r5_mtv7d1nd';

describe('연결이 끊긴 메모', () => {
  it('없는 단을 가리키는 단 메모만 모은다', () => {
    createTab('knit');
    const first = activeTab().rounds[0]!.id;
    addComment({ kind: 'round', roundId: first }, '붙어 있는 메모');
    addComment({ kind: 'round', roundId: STALE_ROUND_ID }, '끊긴 메모');
    addComment({ kind: 'pattern' }, '도안 메모');

    expect(get(orphanComments).map((c) => c.text)).toEqual(['끊긴 메모']);
  });

  it('고른 단에 다시 붙이면 목록에서 빠진다', () => {
    createTab('knit');
    const second = addRoundAtEnd();
    const id = addComment({ kind: 'round', roundId: STALE_ROUND_ID }, '2단 주의');

    expect(reattachComment(id, second)).toBe('attached');
    expect(get(orphanComments)).toHaveLength(0);
    expect(activeTab().comments.find((c) => c.id === id)!.target)
      .toEqual({ kind: 'round', roundId: second });
  });

  it('이미 메모가 있는 단이면 내용을 이어 붙이고 끊긴 메모는 지운다', () => {
    createTab('knit');
    const first = activeTab().rounds[0]!.id;
    const kept = addComment({ kind: 'round', roundId: first }, '원래 메모');
    const orphan = addComment({ kind: 'round', roundId: STALE_ROUND_ID }, '끊겼던 메모');

    expect(reattachComment(orphan, first)).toBe('merged');
    const tab = activeTab();
    expect(tab.comments.some((c) => c.id === orphan)).toBe(false);
    expect(tab.comments.find((c) => c.id === kept)!.text).toBe('원래 메모\n\n끊겼던 메모');
    expect(get(orphanComments)).toHaveLength(0);
  });

  it('없는 단이나 없는 메모에는 아무것도 하지 않는다', () => {
    createTab('knit');
    const id = addComment({ kind: 'round', roundId: STALE_ROUND_ID }, '끊긴 메모');

    expect(reattachComment(id, '없는단')).toBeUndefined();
    expect(reattachComment('없는메모', activeTab().rounds[0]!.id)).toBeUndefined();
    expect(get(orphanComments)).toHaveLength(1);
  });
});
