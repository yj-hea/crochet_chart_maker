import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { pattern, createTab, setGauge, switchTab, workspace } from '../src/stores/tabs';
import { serialize, validate, validateWorkspace, serializeWorkspace } from '../src/lib/persistence';

describe('게이지 스토어', () => {
  it('설정한 게이지가 활성 탭에 유지된다', () => {
    createTab('knit');
    setGauge({ stitches: 22, rows: 30 });
    expect(get(pattern).gauge).toEqual({ stitches: 22, rows: 30 });
  });

  it('탭을 오가도 각 탭의 게이지가 보존된다', () => {
    const a = createTab('knit');
    setGauge({ stitches: 22, rows: 30 });
    const b = createTab('knit');
    setGauge({ stitches: 18, rows: 24 });

    switchTab(a);
    expect(get(pattern).gauge).toEqual({ stitches: 22, rows: 30 });
    switchTab(b);
    expect(get(pattern).gauge).toEqual({ stitches: 18, rows: 24 });
  });

  it('undefined 로 해제된다', () => {
    createTab('knit');
    setGauge({ stitches: 22, rows: 30 });
    setGauge(undefined);
    expect(get(pattern).gauge).toBeUndefined();
  });

  it('범위를 벗어난 값은 무시되어 기존 값이 남는다', () => {
    createTab('knit');
    setGauge({ stitches: 22, rows: 30 });
    setGauge({ stitches: 0, rows: 30 });
    expect(get(pattern).gauge).toEqual({ stitches: 22, rows: 30 });
  });

  it('워크스페이스 직렬화/복원에 게이지가 실린다', () => {
    createTab('knit');
    setGauge({ stitches: 28, rows: 36 });
    const ws = get(workspace);
    const saved = serializeWorkspace({
      tabs: ws.tabs.map((t) => ({
        id: t.id,
        name: t.name,
        craft: t.craft,
        ...(t.gauge ? { gauge: t.gauge } : {}),
        shape: t.shape,
        rounds: t.rounds.map((r) => ({ source: r.source })),
      })),
      activeTabId: ws.activeTabId,
    });
    const restored = validateWorkspace(JSON.parse(JSON.stringify(saved)));
    const active = restored.tabs.find((t) => t.id === ws.activeTabId)!;
    expect(active.gauge).toEqual({ stitches: 28, rows: 36 });
  });

  it('파일 포맷에도 게이지가 실리고, 없으면 undefined', () => {
    const withGauge = serialize({
      craft: 'knit',
      gauge: { stitches: 22, rows: 30 },
      shape: 'flat',
      rounds: [{ source: 'k4' }],
    });
    expect(validate(JSON.parse(JSON.stringify(withGauge))).gauge).toEqual({ stitches: 22, rows: 30 });

    const without = serialize({ craft: 'knit', shape: 'flat', rounds: [{ source: 'k4' }] });
    expect(validate(JSON.parse(JSON.stringify(without))).gauge).toBeUndefined();
  });
});
