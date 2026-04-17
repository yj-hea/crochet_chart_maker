/**
 * 탭 스토어 — 여러 도안 동시 작업.
 *
 * - 각 탭은 독립된 PatternState 를 가진다.
 * - 활성 탭이 기존 `pattern` derived 로 노출되어 기존 컴포넌트와 호환.
 * - localStorage 에 v2 워크스페이스 포맷으로 자동 저장.
 */

import { writable, derived, get } from 'svelte/store';
import { parseRound } from '$lib/parser/parser';
import { expand } from '$lib/expand/expander';
import type { ParsedRound } from '$lib/parser/ast';
import type { ExpandedRound } from '$lib/expand/op';
import {
  saveWorkspace,
  loadWorkspace,
  clearWorkspace,
  downloadAsFile,
  readFromFile,
  type SavedWorkspaceTab,
} from '$lib/persistence';

export type ShapeKind = 'circular' | 'flat';

export interface PatternRoundState {
  id: string;
  source: string;
  parsed?: ParsedRound;
  expanded?: ExpandedRound;
}

export interface Tab {
  id: string;
  name: string;
  shape: ShapeKind;
  rounds: PatternRoundState[];
}

export interface WorkspaceState {
  tabs: Tab[];
  activeTabId: string;
}

let idCounter = 0;
function makeRoundId(): string {
  idCounter++;
  return `r${idCounter}_${Date.now().toString(36)}`;
}
function makeTabId(): string {
  idCounter++;
  return `tab${idCounter}_${Date.now().toString(36)}`;
}

function reparse(idx: number, source: string) {
  const parsed = parseRound(idx, source);
  const tree = parsed.body ?? parsed.lastValid;
  const expanded = tree ? expand(tree, idx) : undefined;
  return { parsed, expanded };
}

function reparseAll(rounds: PatternRoundState[]): PatternRoundState[] {
  return rounds.map((r, i) => {
    const { parsed, expanded } = reparse(i + 1, r.source);
    return { ...r, parsed, expanded };
  });
}

function defaultTab(name = '도안 1'): Tab {
  return {
    id: makeTabId(),
    name,
    shape: 'circular',
    rounds: reparseAll([{ id: makeRoundId(), source: '' }]),
  };
}

function tabFromSaved(saved: SavedWorkspaceTab): Tab {
  const rounds = saved.rounds.map((r) => ({ id: makeRoundId(), source: r.source }));
  return {
    id: saved.id,
    name: saved.name,
    shape: saved.shape,
    rounds: reparseAll(rounds),
  };
}

function nextTabName(existing: Tab[]): string {
  const nums = existing
    .map((t) => {
      const m = /^도안\s+(\d+)$/.exec(t.name);
      return m ? parseInt(m[1]!, 10) : 0;
    })
    .filter((n) => n > 0);
  const next = nums.length > 0 ? Math.max(...nums) + 1 : existing.length + 1;
  return `도안 ${next}`;
}

function initialState(): WorkspaceState {
  const saved = loadWorkspace();
  if (saved && saved.tabs.length > 0) {
    const tabs = saved.tabs.map(tabFromSaved);
    const activeTabId = tabs.some((t) => t.id === saved.activeTabId)
      ? saved.activeTabId
      : tabs[0]!.id;
    return { tabs, activeTabId };
  }
  const t = defaultTab();
  return { tabs: [t], activeTabId: t.id };
}

export const workspace = writable<WorkspaceState>(initialState());
export const lastSavedAt = writable<Date | null>(null);

// 자동 저장 — 매 변경마다
workspace.subscribe((ws) => {
  saveWorkspace({
    tabs: ws.tabs.map((t) => ({
      id: t.id,
      name: t.name,
      shape: t.shape,
      rounds: t.rounds.map((r) => ({ source: r.source })),
    })),
    activeTabId: ws.activeTabId,
  });
  lastSavedAt.set(new Date());
});

/** 활성 탭의 pattern 상태 (기존 pattern store 역할) */
export const pattern = derived(workspace, ($ws) => {
  const active = $ws.tabs.find((t) => t.id === $ws.activeTabId);
  if (active) {
    return { shape: active.shape, rounds: active.rounds };
  }
  return { shape: 'circular' as ShapeKind, rounds: [] as PatternRoundState[] };
});

export const activeTabId = derived(workspace, ($ws) => $ws.activeTabId);

// ============================================================
// 탭 연산
// ============================================================

export function switchTab(id: string): void {
  workspace.update((ws) => {
    if (!ws.tabs.some((t) => t.id === id)) return ws;
    return { ...ws, activeTabId: id };
  });
}

export function createTab(): string {
  let newId = '';
  workspace.update((ws) => {
    const tab: Tab = {
      id: makeTabId(),
      name: nextTabName(ws.tabs),
      shape: 'circular',
      rounds: reparseAll([{ id: makeRoundId(), source: '' }]),
    };
    newId = tab.id;
    return { tabs: [...ws.tabs, tab], activeTabId: tab.id };
  });
  return newId;
}

export function closeTab(id: string): void {
  workspace.update((ws) => {
    if (ws.tabs.length <= 1) return ws; // 마지막 탭은 닫지 않음
    const idx = ws.tabs.findIndex((t) => t.id === id);
    if (idx < 0) return ws;
    const newTabs = ws.tabs.filter((t) => t.id !== id);
    const newActive = ws.activeTabId === id
      ? (newTabs[Math.max(0, idx - 1)]?.id ?? newTabs[0]!.id)
      : ws.activeTabId;
    return { tabs: newTabs, activeTabId: newActive };
  });
}

export function renameTab(id: string, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  workspace.update((ws) => ({
    ...ws,
    tabs: ws.tabs.map((t) => (t.id === id ? { ...t, name: trimmed } : t)),
  }));
}

// ============================================================
// 활성 탭의 pattern 조작
// ============================================================

function updateActiveTab(fn: (t: Tab) => Tab): void {
  workspace.update((ws) => ({
    ...ws,
    tabs: ws.tabs.map((t) => (t.id === ws.activeTabId ? fn(t) : t)),
  }));
}

export function updateRoundSource(id: string, source: string): void {
  updateActiveTab((t) => {
    const idx = t.rounds.findIndex((r) => r.id === id);
    if (idx < 0) return t;
    const { parsed, expanded } = reparse(idx + 1, source);
    const newRounds = [...t.rounds];
    newRounds[idx] = { ...newRounds[idx]!, source, parsed, expanded };
    return { ...t, rounds: newRounds };
  });
}

export function addRoundAfter(id: string): string {
  let newId = '';
  updateActiveTab((t) => {
    const idx = t.rounds.findIndex((r) => r.id === id);
    newId = makeRoundId();
    const newRounds = [...t.rounds];
    newRounds.splice(idx + 1, 0, { id: newId, source: '' });
    return { ...t, rounds: reparseAll(newRounds) };
  });
  return newId;
}

export function addRoundAtEnd(): string {
  let newId = '';
  updateActiveTab((t) => {
    newId = makeRoundId();
    const newRounds = [...t.rounds, { id: newId, source: '' }];
    return { ...t, rounds: reparseAll(newRounds) };
  });
  return newId;
}

export function deleteRound(id: string): string {
  let prevId = '';
  updateActiveTab((t) => {
    if (t.rounds.length <= 1) return t;
    const idx = t.rounds.findIndex((r) => r.id === id);
    if (idx < 0) return t;
    prevId = idx > 0 ? t.rounds[idx - 1]!.id : '';
    const newRounds = t.rounds.filter((r) => r.id !== id);
    return { ...t, rounds: reparseAll(newRounds) };
  });
  return prevId;
}

export function setShape(shape: ShapeKind): void {
  updateActiveTab((t) => ({ ...t, shape }));
}

// ============================================================
// 파일 I/O (활성 탭 기준)
// ============================================================

export function exportToFile(): void {
  const ws = get(workspace);
  const active = ws.tabs.find((t) => t.id === ws.activeTabId);
  if (!active) return;
  downloadAsFile({ shape: active.shape, rounds: active.rounds }, active.name || 'pattern');
}

/** 파일에서 새 탭으로 불러오기 (현재 탭 덮어쓰지 않음) */
export async function importFromFile(file: File): Promise<void> {
  const saved = await readFromFile(file);
  workspace.update((ws) => {
    const tabId = makeTabId();
    const name = (file.name.replace(/\.crochet\.json$/i, '').replace(/\.json$/i, '') || nextTabName(ws.tabs)).slice(0, 30);
    const newTab: Tab = {
      id: tabId,
      name,
      shape: saved.shape,
      rounds: reparseAll(saved.rounds.map((r) => ({ id: makeRoundId(), source: r.source }))),
    };
    return { tabs: [...ws.tabs, newTab], activeTabId: tabId };
  });
}

/** 현재 활성 탭을 빈 상태로 초기화 */
export function resetPattern(): void {
  updateActiveTab((t) => ({
    ...t,
    shape: 'circular',
    rounds: reparseAll([{ id: makeRoundId(), source: '' }]),
  }));
}

/** 모든 탭 삭제 + localStorage 초기화 */
export function resetAllTabs(): void {
  clearWorkspace();
  const t = defaultTab();
  workspace.set({ tabs: [t], activeTabId: t.id });
}
