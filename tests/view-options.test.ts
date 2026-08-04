import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { createTab, switchTab, workspace, viewOptions, setViewOption } from '../src/stores/tabs';
import {
  showGrid,
  showConnections,
  flatAlign,
  flatCascade,
} from '../src/stores/mode';
import {
  normalizeViewOptions,
  DEFAULT_VIEW_OPTIONS,
  readViewSeed,
} from '../src/lib/model/view-options';
import { serialize, validate, validateWorkspace, serializeWorkspace } from '../src/lib/persistence';

describe('표시 옵션은 도안(탭)마다 따로', () => {
  it('한 탭에서 바꿔도 다른 탭은 그대로다', () => {
    const a = createTab('crochet');
    showGrid.set(true);
    flatAlign.set('L');

    const b = createTab('crochet');
    showGrid.set(false);
    flatAlign.set('R');

    switchTab(a);
    expect(get(showGrid)).toBe(true);
    expect(get(flatAlign)).toBe('L');

    switchTab(b);
    expect(get(showGrid)).toBe(false);
    expect(get(flatAlign)).toBe('R');
  });

  it('코바늘 탭과 대바늘 탭이 서로 영향을 주지 않는다', () => {
    const crochetTab = createTab('crochet');
    showConnections.set(true);
    flatCascade.set(true);

    const knitTab = createTab('knit');
    flatCascade.set(false);

    switchTab(crochetTab);
    expect(get(flatCascade)).toBe(true);
    expect(get(showConnections)).toBe(true);

    switchTab(knitTab);
    expect(get(flatCascade)).toBe(false);
  });

  it('update() 도 활성 탭에만 적용된다', () => {
    const a = createTab('crochet');
    showGrid.set(true);
    const b = createTab('crochet');
    showGrid.update((v) => !v);

    switchTab(a);
    expect(get(showGrid)).toBe(true);
    switchTab(b);
    expect(get(showGrid)).toBe(false);
  });

  it('새 탭은 마지막으로 쓴 설정을 물려받는다', () => {
    createTab('crochet');
    flatAlign.set('C');
    showGrid.set(false);

    const fresh = createTab('crochet');
    switchTab(fresh);
    expect(get(flatAlign)).toBe('C');
    expect(get(showGrid)).toBe(false);
    // seed 에도 반영돼 있다
    expect(readViewSeed().flatAlign).toBe('C');
  });

  it('setViewOption 은 활성 탭의 view 만 바꾼다', () => {
    const a = createTab('crochet');
    setViewOption('flatVAlign', 'even');
    const before = get(workspace).tabs.find((t) => t.id !== a);
    expect(get(viewOptions).flatVAlign).toBe('even');
    if (before?.view) expect(before.view.flatVAlign).not.toBe('even');
  });
});

describe('표시 옵션 정규화', () => {
  it('객체가 아니면 undefined', () => {
    expect(normalizeViewOptions(null)).toBeUndefined();
    expect(normalizeViewOptions('nope')).toBeUndefined();
    expect(normalizeViewOptions(undefined)).toBeUndefined();
  });

  it('모르는 값·잘못된 타입은 기본값으로 대체하고 나머지는 살린다', () => {
    const v = normalizeViewOptions({
      showGrid: false,
      flatAlign: 'Z',          // 잘못된 값
      flatCascade: 'yes',      // 잘못된 타입
      flatVAlign: 'even',
      unknownField: 1,         // 모르는 필드는 무시
    })!;
    expect(v.showGrid).toBe(false);
    expect(v.flatAlign).toBe(DEFAULT_VIEW_OPTIONS.flatAlign);
    expect(v.flatCascade).toBe(DEFAULT_VIEW_OPTIONS.flatCascade);
    expect(v.flatVAlign).toBe('even');
    expect(Object.keys(v)).not.toContain('unknownField');
  });
});

describe('표시 옵션 저장', () => {
  it('워크스페이스 직렬화/복원에 실린다', () => {
    const view = { ...DEFAULT_VIEW_OPTIONS, showGrid: false, flatAlign: 'R' as const };
    const saved = serializeWorkspace({
      tabs: [{
        id: 't1', name: '도안 1', craft: 'crochet', view,
        shape: 'flat', rounds: [{ source: '6x' }],
      }],
      activeTabId: 't1',
    });
    const restored = validateWorkspace(JSON.parse(JSON.stringify(saved)));
    expect(restored.tabs[0]!.view).toEqual(view);
  });

  it('파일 포맷에도 실리고, 없으면 undefined', () => {
    const view = { ...DEFAULT_VIEW_OPTIONS, flatVAlign: 'even' as const };
    const withView = serialize({ craft: 'knit', view, shape: 'flat', rounds: [{ source: 'k4' }] });
    expect(validate(JSON.parse(JSON.stringify(withView))).view).toEqual(view);

    const without = serialize({ craft: 'knit', shape: 'flat', rounds: [{ source: 'k4' }] });
    expect(validate(JSON.parse(JSON.stringify(without))).view).toBeUndefined();
  });

  it('구버전 데이터(view 없음)도 탭이 버려지지 않는다', () => {
    const restored = validateWorkspace({
      version: 3, savedAt: '', activeTabId: 't1',
      tabs: [{ id: 't1', name: '옛 도안', craft: 'crochet', shape: 'flat', rounds: [{ source: '6x' }] }],
    });
    expect(restored.tabs).toHaveLength(1);
    expect(restored.tabs[0]!.view).toBeUndefined();
  });
});
