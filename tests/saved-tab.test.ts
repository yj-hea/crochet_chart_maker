import { describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { createTab, workspace, toSavedTab, addComment, setGauge, setViewOption } from '../src/stores/tabs';
import { serializeWorkspace, validateWorkspace } from '../src/lib/persistence';
import { normalizeViewOptions, DEFAULT_VIEW_OPTIONS } from '../src/lib/model/view-options';

function activeTab() {
  const ws = get(workspace);
  return ws.tabs.find((t) => t.id === ws.activeTabId)!;
}

/**
 * localStorage 자동 저장과 Dropbox 업로드가 서로 다른 직렬화를 쓰던 시절,
 * Dropbox 쪽에 comments/view 가 빠져 기기 간 동기화에서 메모와 표시 옵션이 사라졌다.
 * 저장 경로가 하나뿐인지, 그리고 모든 필드가 실리는지 고정한다.
 */
describe('탭 저장 직렬화 (toSavedTab)', () => {
  it('메모·게이지·표시 옵션이 모두 실린다', () => {
    createTab('knit');
    setGauge({ stitches: 22, rows: 30 });
    setViewOption('showGrid', false);
    setViewOption('flatAlign', 'R');
    addComment({ kind: 'pattern' }, '이 도안 메모');

    const saved = toSavedTab(activeTab());
    expect(saved.gauge).toEqual({ stitches: 22, rows: 30 });
    expect(saved.view?.showGrid).toBe(false);
    expect(saved.view?.flatAlign).toBe('R');
    expect(saved.comments).toHaveLength(1);
    expect(saved.comments![0]!.text).toBe('이 도안 메모');
  });

  it('저장 → 복원 왕복에서 값이 유지된다 (동기화 경로)', () => {
    createTab('crochet');
    setViewOption('flatCascade', false);
    addComment({ kind: 'pattern' }, '메모 유지');
    const id = activeTab().id;

    const ws = get(workspace);
    const wire = JSON.parse(JSON.stringify(
      serializeWorkspace({ tabs: ws.tabs.map(toSavedTab), activeTabId: ws.activeTabId }),
    ));
    const restored = validateWorkspace(wire);
    const tab = restored.tabs.find((t) => t.id === id)!;

    expect(tab.view?.flatCascade).toBe(false);
    expect(tab.comments?.some((c) => c.text === '메모 유지')).toBe(true);
  });

  it('메모가 없으면 comments 를 넣지 않는다 (저장 크기)', () => {
    createTab('crochet');
    expect(toSavedTab(activeTab()).comments).toBeUndefined();
  });
});

describe('구버전 표시 옵션 이관', () => {
  it('전역 키로 저장돼 있던 설정을 seed 로 옮긴다', async () => {
    // 표시 옵션이 전역이던 시절의 키를 심어 둔다
    const map = new Map<string, string>([
      ['crochet-chart:view.showGrid', 'false'],
      ['crochet-chart:view.flatAlign', '"C"'],
      ['crochet-chart:view.flatVAlign', '"even"'],
    ]);
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => { map.set(k, v); },
      removeItem: (k: string) => { map.delete(k); },
      clear: () => map.clear(),
      key: (i: number) => [...map.keys()][i] ?? null,
      get length() { return map.size; },
    } as Storage;

    // seedCache 가 비어 있는 상태(= 새 세션)로 다시 읽는다
    vi.resetModules();
    const { readViewSeed } = await import('../src/lib/model/view-options');
    const seed = readViewSeed();

    expect(seed.showGrid).toBe(false);
    expect(seed.flatAlign).toBe('C');
    expect(seed.flatVAlign).toBe('even');
    // 지정하지 않은 값은 기본값
    expect(seed.flatCascade).toBe(DEFAULT_VIEW_OPTIONS.flatCascade);
    // 새 키로 옮겨져 다음부터는 여기서 읽힌다
    expect(normalizeViewOptions(JSON.parse(map.get('crochet-chart:view.seed')!))!.flatAlign).toBe('C');

    delete (globalThis as unknown as { localStorage?: Storage }).localStorage;
  });
});
