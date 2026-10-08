/**
 * 프로젝트 ↔ Dropbox 동기화 — **열 때 한 번만 맞춘다**.
 *
 * 작업 도중에 묻지 않고, 자동으로 사본을 만들지 않는다는 것을 고정한다
 * (예전에 임시 워크스페이스가 쌓이던 경로).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

// ── Dropbox 흉내 ──────────────────────────────────────────
let connected = true;
/** 원격 파일: 경로 → { content, rev } */
const remote = new Map<string, { content: string; rev: string }>();
const uploads: Array<{ path: string; mode: unknown }> = [];

vi.mock('$lib/dropbox/auth', () => ({ isConnected: () => connected }));
vi.mock('$lib/dropbox/api', () => ({
  DropboxApiError: class extends Error {
    constructor(public status: number, public detail = '') { super(`${status}`); }
  },
  async downloadFile(path: string) {
    const f = remote.get(path);
    return f ? { content: f.content, rev: f.rev, name: path, path } : null;
  },
  async uploadFile(opts: { path: string; content: string; mode: unknown }) {
    uploads.push({ path: opts.path, mode: opts.mode });
    const rev = `rev${uploads.length}`;
    remote.set(opts.path, { content: opts.content, rev });
    return { rev, name: opts.path, path: opts.path };
  },
  async listFolder() {
    return [...remote.entries()].map(([path, f]) => ({
      name: path.split('/').pop()!,
      path,
      rev: f.rev,
      size: f.content.length,
      serverModified: '2026-10-07T00:00:00Z',
    }));
  },
  async deleteFile(path: string) { remote.delete(path); },
  async moveFile() { /* 안 씀 */ },
}));

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

function workspaceJson(opts: { savedAt: string; tabs: string[]; name?: string }): string {
  return JSON.stringify({
    version: 3,
    savedAt: opts.savedAt,
    workspaceId: 'p1',
    workspaceName: opts.name ?? '작품',
    tabs: opts.tabs.map((n, i) => ({
      id: `t${i}`, name: n, craft: 'crochet', shape: 'circular', rounds: [{ source: '@, 6X' }],
    })),
    activeTabId: 't0',
  });
}

async function fresh() {
  vi.resetModules();
  const projects = await import('../src/stores/projects');
  const sync = await import('../src/stores/projectSync');
  const tabs = await import('../src/stores/tabs');
  tabs.setWorkspacePersister(projects.persistOpenProject);
  projects.initProjects();
  return { projects, sync, tabs };
}

beforeEach(() => {
  connected = true;
  remote.clear();
  uploads.length = 0;
  mockStorage();
});

describe('열 때 한 번 맞추기', () => {
  it('원격에 없으면 그냥 연다 (다음 저장 때 올라간다)', async () => {
    const { projects, sync } = await fresh();
    const id = projects.createProject('토끼');
    expect(await sync.syncBeforeOpen(id)).toEqual({ kind: 'in-sync' });
    expect(uploads).toHaveLength(0);
  });

  it('이 기기에만 바뀌었으면 올린다', async () => {
    const { projects, sync, tabs } = await fresh();
    const id = projects.createProject('토끼');
    // 먼저 올려 둔 상태를 만든다
    await sync.pushOpen();
    expect(uploads).toHaveLength(1);

    // 로컬만 고치면
    tabs.updateRoundSource(get(tabs.workspace).tabs[0]!.rounds[0]!.id, '@, 8X');
    projects.persistOpenProject();
    expect(await sync.syncBeforeOpen(id)).toEqual({ kind: 'pushed' });
    expect(uploads).toHaveLength(2);
  });

  it('원격만 바뀌었으면 받아서 연다', async () => {
    const { projects, sync } = await fresh();
    const id = projects.createProject('토끼');
    await sync.pushOpen();

    // 다른 기기가 올린 셈 — rev 가 달라진다
    remote.set(`/workspaces/${id}.json`, {
      content: workspaceJson({ savedAt: '2026-10-07T10:00:00.000Z', tabs: ['머리', '몸통'] }),
      rev: 'remote-new',
    });
    expect(await sync.syncBeforeOpen(id)).toEqual({ kind: 'pulled' });

    projects.openProject(id);
    expect(get(projects.projects).find((p) => p.id === id)!.tabCount).toBe(2);
  });

  it('양쪽 다 바뀌었으면 묻는다 — 열지 않는다', async () => {
    const { projects, sync, tabs } = await fresh();
    const id = projects.createProject('토끼');
    await sync.pushOpen();

    tabs.updateRoundSource(get(tabs.workspace).tabs[0]!.rounds[0]!.id, '@, 8X');
    projects.persistOpenProject();
    remote.set(`/workspaces/${id}.json`, {
      content: workspaceJson({ savedAt: '2026-10-07T10:00:00.000Z', tabs: ['머리', '몸통'] }),
      rev: 'remote-new',
    });

    const result = await sync.syncBeforeOpen(id);
    expect(result.kind).toBe('conflict');
    expect(await sync.openProjectSynced(id)).toBe(false);
    expect(get(sync.pendingConflict)?.id).toBe(id);
  });

  it('Dropbox 에만 있는 작품은 받아서 목록에 더한다', async () => {
    const { projects, sync } = await fresh();
    remote.set('/workspaces/remote1.json', {
      content: workspaceJson({ savedAt: '2026-10-07T09:00:00.000Z', tabs: ['소매'], name: '스웨터' }),
      rev: 'r1',
    });
    expect(await sync.syncBeforeOpen('remote1')).toEqual({ kind: 'remote-only' });
    const meta = get(projects.projects).find((p) => p.id === 'remote1');
    expect(meta).toMatchObject({ name: '스웨터', tabCount: 1 });
  });

  it('연결돼 있지 않으면 아무것도 하지 않는다', async () => {
    connected = false;
    const { projects, sync } = await fresh();
    const id = projects.createProject('토끼');
    expect(await sync.syncBeforeOpen(id)).toEqual({ kind: 'offline' });
    expect(uploads).toHaveLength(0);
  });
});

describe('충돌 풀기', () => {
  async function conflicted() {
    const ctx = await fresh();
    const id = ctx.projects.createProject('토끼');
    await ctx.sync.pushOpen();
    ctx.tabs.updateRoundSource(get(ctx.tabs.workspace).tabs[0]!.rounds[0]!.id, '@, 8X');
    ctx.projects.persistOpenProject();
    remote.set(`/workspaces/${id}.json`, {
      content: workspaceJson({ savedAt: '2026-10-07T10:00:00.000Z', tabs: ['머리', '몸통'] }),
      rev: 'remote-new',
    });
    await ctx.sync.openProjectSynced(id);
    return { ...ctx, id };
  }

  it('원격으로 열기 — 이 기기 내용은 덮인다', async () => {
    const { projects, sync, id } = await conflicted();
    expect(await sync.resolveAndOpen(id, 'remote')).toBe(true);
    expect(get(projects.projects).find((p) => p.id === id)!.tabCount).toBe(2);
    expect(get(sync.pendingConflict)).toBeNull();
  });

  it('내 것으로 열기 — 원격에 올린다', async () => {
    const { sync, id } = await conflicted();
    const before = uploads.length;
    await sync.resolveAndOpen(id, 'local');
    expect(uploads.length).toBe(before + 1);
    // 원격 rev 를 base 로 올린다 (조건부)
    expect(uploads[uploads.length - 1]!.mode).toEqual({ update: 'remote-new' });
  });

  it('둘 다 두기 — 사본에 **이름을 받아** 새 작품으로 떼어 둔다', async () => {
    const { projects, sync, id } = await conflicted();
    await sync.resolveAndOpen(id, 'both', '토끼 (노트북)');
    const names = get(projects.projects).map((p) => p.name);
    expect(names).toContain('토끼 (노트북)');
    // 자동으로 `(사본)` 을 만들지 않는다
    expect(names.some((n) => n.includes('사본'))).toBe(false);
  });
});
