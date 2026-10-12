/**
 * 프로젝트(= 작품) 저장소.
 *
 * 스토어가 import 시점에 목록을 읽으므로, 테스트마다 localStorage 를 심은 뒤
 * 모듈을 새로 불러온다.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

function mockStorage(seed: Record<string, string> = {}): Map<string, string> {
  const map = new Map(Object.entries(seed));
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  } as Storage;
  return map;
}

const LEGACY = JSON.stringify({
  version: 3,
  savedAt: '2026-10-01T00:00:00.000Z',
  tabs: [
    { id: 't1', name: '토끼 머리', craft: 'crochet', shape: 'circular', rounds: [{ source: '@, 6X' }] },
    { id: 't2', name: '토끼 몸통', craft: 'crochet', shape: 'circular', rounds: [{ source: '@, 8X' }] },
  ],
  activeTabId: 't1',
});

/** 모듈을 새로 불러온다 (스토어 초기 상태를 다시 만든다) */
async function fresh() {
  vi.resetModules();
  const projects = await import('../src/stores/projects');
  const tabs = await import('../src/stores/tabs');
  tabs.setWorkspacePersister(projects.persistOpenProject);
  projects.initProjects();
  // 스토어 쪽 함수만 쓴다 — `lib/projects` 에 같은 이름의 저수준 함수가 있다
  return { ...projects, tabs };
}

beforeEach(() => { mockStorage(); });

describe('프로젝트 마이그레이션', () => {
  it('예전 워크스페이스 하나를 프로젝트 하나로 옮긴다', async () => {
    const store = mockStorage({ 'crochet-chart:workspace': LEGACY });
    const p = await fresh();
    const list = get(p.projects);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: '토끼 머리', tabCount: 2 });
    // 원본 키는 백업으로 남겨 둔다
    expect(store.has('crochet-chart:workspace')).toBe(true);
    expect([...store.keys()].some((k) => k.startsWith('crochet-chart:project.'))).toBe(true);
  });

  it('옮긴 프로젝트를 열면 도안이 그대로 나온다', async () => {
    mockStorage({ 'crochet-chart:workspace': LEGACY });
    const p = await fresh();
    const id = get(p.projects)[0]!.id;
    expect(p.openProject(id)).toBe(true);
    const ws = get(p.tabs.workspace);
    expect(ws.tabs.map((t) => t.name)).toEqual(['토끼 머리', '토끼 몸통']);
    expect(ws.tabs[0]!.rounds[0]!.source).toBe('@, 6X');
  });

  it('아무것도 없으면 빈 목록 — 자동으로 열지 않는다', async () => {
    const p = await fresh();
    expect(get(p.projects)).toEqual([]);
    expect(get(p.openProjectId)).toBeNull();
  });
});

describe('프로젝트 전환', () => {
  it('작품끼리 내용이 섞이지 않는다', async () => {
    mockStorage({ 'crochet-chart:workspace': LEGACY });
    const p = await fresh();
    const rabbit = get(p.projects)[0]!.id;
    p.openProject(rabbit);

    // 새 작품을 만들면 빈 작업대로 열린다
    const sweater = p.createProject('라글란 스웨터');
    expect(get(p.openProjectId)).toBe(sweater);
    expect(get(p.tabs.workspace).tabs).toHaveLength(1);

    // 새 작품에서 도안을 고쳐도
    p.tabs.updateRoundSource(get(p.tabs.workspace).tabs[0]!.rounds[0]!.id, 'co60');
    expect(get(p.tabs.workspace).tabs[0]!.rounds[0]!.source).toBe('co60');

    // 토끼 작품은 그대로다
    p.openProject(rabbit);
    const ws = get(p.tabs.workspace);
    expect(ws.tabs.map((t) => t.name)).toEqual(['토끼 머리', '토끼 몸통']);
    expect(ws.tabs[0]!.rounds[0]!.source).toBe('@, 6X');

    // 돌아가면 새 작품의 내용도 남아 있다
    p.openProject(sweater);
    expect(get(p.tabs.workspace).tabs[0]!.rounds[0]!.source).toBe('co60');
  });

  it('작품 목록으로 나가면 저장되고 시작 화면 상태가 된다', async () => {
    const p = await fresh();
    const id = p.createProject('수세미');
    p.tabs.updateRoundSource(get(p.tabs.workspace).tabs[0]!.rounds[0]!.id, '@, 6X');
    p.closeProject();
    expect(get(p.openProjectId)).toBeNull();

    p.openProject(id);
    expect(get(p.tabs.workspace).tabs[0]!.rounds[0]!.source).toBe('@, 6X');
  });

  it('아무 작품도 열지 않은 동안에는 저장하지 않는다', async () => {
    const store = mockStorage();
    const p = await fresh();
    // 작업대를 건드려도 프로젝트 파일이 생기지 않는다
    p.tabs.addRoundAtEnd();
    expect([...store.keys()].some((k) => k.startsWith('crochet-chart:project.'))).toBe(false);
  });
});

describe('프로젝트 관리', () => {
  it('이름 바꾸기 · 복제 · 삭제', async () => {
    const p = await fresh();
    const id = p.createProject('토끼 인형');
    p.tabs.updateRoundSource(get(p.tabs.workspace).tabs[0]!.rounds[0]!.id, '@, 6X');

    p.renameProject(id, '곰 인형');
    expect(get(p.projects).find((x) => x.id === id)!.name).toBe('곰 인형');

    const copy = p.duplicateProject(id)!;
    expect(get(p.projects)).toHaveLength(2);
    expect(get(p.projects).find((x) => x.id === copy)!.name).toBe('곰 인형 사본');
    p.openProject(copy);
    expect(get(p.tabs.workspace).tabs[0]!.rounds[0]!.source).toBe('@, 6X');

    p.removeProject(copy);
    expect(get(p.projects).map((x) => x.id)).toEqual([id]);
    expect(get(p.openProjectId)).toBeNull(); // 열어 둔 것을 지우면 시작 화면으로
  });

  it('목록은 마지막으로 연 순', async () => {
    const p = await fresh();
    const a = p.createProject('가');
    const b = p.createProject('나');
    expect(get(p.projects)[0]!.id).toBe(b);
    p.openProject(a);
    expect(get(p.projects)[0]!.id).toBe(a);
  });

  it('도안 수가 목록에 반영된다', async () => {
    const p = await fresh();
    const id = p.createProject('작품');
    p.tabs.createTab('knit');
    p.persistOpenProject();
    expect(get(p.projects).find((x) => x.id === id)!.tabCount).toBe(2);
  });
});
