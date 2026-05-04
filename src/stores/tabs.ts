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
  type SavedComment,
  type SavedPattern,
  type SavedProgress,
} from '$lib/persistence';
import { serializeAsText, parseTextFormat } from '$lib/persistence-text';

export type ShapeKind = 'circular' | 'flat';

/** 'forward' = 기본 방향 (원형 CCW, 평면 LTR) / 'reverse' = 반대 */
export type RoundDirection = 'forward' | 'reverse';

/** 코멘트 대상 */
export type CommentTarget =
  | { kind: 'pattern' }
  | { kind: 'round'; roundId: string };

export interface Comment {
  id: string;
  text: string;         // markdown 원본
  color: string;        // CSS color (hex 또는 named)
  open?: boolean;       // 기본 펼침 상태
  target: CommentTarget;
}

export interface PatternRoundState {
  id: string;
  source: string;
  /** 이 단의 작업 방향. 미지정시 'forward' */
  direction?: RoundDirection;
  parsed?: ParsedRound;
  expanded?: ExpandedRound;
}

export type FlatAlign = 'L' | 'R' | 'C';

export interface Tab {
  id: string;
  name: string;
  shape: ShapeKind;
  rounds: PatternRoundState[];
  comments: Comment[];
  /** 평면 도안에서 단마다 코 수가 다를 때 max 단 기준 좁은 단의 정렬 방향. 기본 'L'. */
  flatAlign?: FlatAlign;
  /** Read 모드 진행 상태 — 파일에 포함해 다른 기기에서 이어보기 가능 */
  progress?: SavedProgress;
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

function reparse(idx: number, source: string, direction?: RoundDirection) {
  const parsed = parseRound(idx, source);
  const tree = parsed.body ?? parsed.lastValid;
  const expanded = tree ? expand(tree, idx) : undefined;
  if (expanded) expanded.direction = direction ?? 'forward';
  return { parsed, expanded };
}

function reparseAll(rounds: PatternRoundState[]): PatternRoundState[] {
  return rounds.map((r, i) => {
    const { parsed, expanded } = reparse(i + 1, r.source, r.direction);
    return { ...r, parsed, expanded };
  });
}

function makeCommentId(): string {
  idCounter++;
  return `cm${idCounter}_${Date.now().toString(36)}`;
}

function defaultTab(name = '도안 1'): Tab {
  return {
    id: makeTabId(),
    name,
    shape: 'circular',
    rounds: reparseAll([{ id: makeRoundId(), source: '' }]),
    comments: [],
  };
}

function tabFromSaved(saved: SavedWorkspaceTab): Tab {
  const newRoundIds: string[] = saved.rounds.map(() => makeRoundId());
  const rounds: PatternRoundState[] = saved.rounds.map((r, i) => ({
    id: newRoundIds[i]!,
    source: r.source,
    direction: r.direction,
  }));
  return {
    id: saved.id,
    name: saved.name,
    shape: saved.shape,
    rounds: reparseAll(rounds),
    comments: remapSavedComments(saved.comments ?? [], newRoundIds, false),
    ...(saved.flatAlign ? { flatAlign: saved.flatAlign } : {}),
    ...(saved.progress ? { progress: saved.progress } : {}),
  };
}

/**
 * 저장된 코멘트의 target 을 새 round ID 에 매핑.
 * dropKnownOrphans: true 면 매핑 실패 시 제외(파일 import), false 면 id 유지(workspace 로드).
 */
function remapSavedComments(
  saved: ReadonlyArray<SavedComment>,
  newRoundIds: readonly string[],
  dropKnownOrphans: boolean,
): Comment[] {
  const out: Comment[] = [];
  for (const c of saved) {
    if (c.target.kind === 'pattern') {
      out.push({
        // 저장된 open 플래그는 무시 — 로드 시 항상 닫힌 상태로 시작
        id: makeCommentId(), text: c.text, color: c.color,
        target: { kind: 'pattern' },
      });
      continue;
    }
    // round 대상: roundIndex 우선, 없으면 roundId (고아 가능)
    const idx = c.target.roundIndex;
    const mappedId = idx !== undefined && idx >= 0 && idx < newRoundIds.length
      ? newRoundIds[idx]
      : (c.target.roundId && newRoundIds.includes(c.target.roundId) ? c.target.roundId : undefined);
    if (!mappedId) {
      if (dropKnownOrphans) continue;
      // workspace 로드는 id 유지 (추후 저장 때 index 로 재정규화됨)
      if (c.target.roundId) {
        out.push({
          // 저장된 open 플래그는 무시 — 로드 시 항상 닫힌 상태로 시작
        id: makeCommentId(), text: c.text, color: c.color,
          target: { kind: 'round', roundId: c.target.roundId },
        });
      }
      continue;
    }
    out.push({
      id: makeCommentId(), text: c.text, color: c.color, open: c.open,
      target: { kind: 'round', roundId: mappedId },
    });
  }
  return out;
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
      rounds: t.rounds.map((r) => {
        const out: { source: string; direction?: RoundDirection } = { source: r.source };
        if (r.direction) out.direction = r.direction;
        return out;
      }),
      comments: t.comments,
      ...(t.progress ? { progress: t.progress } : {}),
      ...(t.flatAlign ? { flatAlign: t.flatAlign } : {}),
    })),
    activeTabId: ws.activeTabId,
  });
  lastSavedAt.set(new Date());
});

/** 지정한 탭의 progress 를 설정 (Read 모드 네비게이션 연동용) */
export function setTabProgress(id: string, progress: SavedProgress | undefined): void {
  workspace.update((ws) => ({
    ...ws,
    tabs: ws.tabs.map((t) => {
      if (t.id !== id) return t;
      const next = { ...t };
      if (progress) next.progress = progress;
      else delete next.progress;
      return next;
    }),
  }));
}

/** 활성 탭의 pattern 상태 (기존 pattern store 역할) */
export const pattern = derived(workspace, ($ws) => {
  const active = $ws.tabs.find((t) => t.id === $ws.activeTabId);
  if (active) {
    return { shape: active.shape, rounds: active.rounds, flatAlign: active.flatAlign ?? 'L' as FlatAlign };
  }
  return { shape: 'circular' as ShapeKind, rounds: [] as PatternRoundState[], flatAlign: 'L' as FlatAlign };
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
      comments: [],
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
    const current = t.rounds[idx]!;
    const { parsed, expanded } = reparse(idx + 1, source, current.direction);
    const newRounds = [...t.rounds];
    newRounds[idx] = { ...current, source, parsed, expanded };
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

export function setFlatAlign(align: FlatAlign): void {
  updateActiveTab((t) => ({ ...t, flatAlign: align }));
}

// ============================================================
// 코멘트 CRUD
// ============================================================

const DEFAULT_COMMENT_COLOR = '#FFE066'; // 노랑

export function addComment(target: CommentTarget, text = '', color = DEFAULT_COMMENT_COLOR): string {
  let newId = '';
  updateActiveTab((t) => {
    newId = makeCommentId();
    const newComment: Comment = { id: newId, target, text, color, open: true };
    return { ...t, comments: [...t.comments, newComment] };
  });
  return newId;
}

export function updateComment(id: string, patch: Partial<Pick<Comment, 'text' | 'color' | 'open'>>): void {
  updateActiveTab((t) => ({
    ...t,
    comments: t.comments.map((c) => (c.id === id ? { ...c, ...patch } : c)),
  }));
}

export function deleteComment(id: string): void {
  updateActiveTab((t) => ({
    ...t,
    comments: t.comments.filter((c) => c.id !== id),
  }));
}

export function setRoundDirection(id: string, direction: RoundDirection): void {
  updateActiveTab((t) => ({
    ...t,
    rounds: t.rounds.map((r) => {
      if (r.id !== id) return r;
      // expanded.direction 도 함께 갱신 (레이아웃이 이 값을 사용)
      const expanded = r.expanded ? { ...r.expanded, direction } : r.expanded;
      return { ...r, direction, expanded };
    }),
  }));
}

// ============================================================
// 파일 I/O (활성 탭 기준)
// ============================================================

export function exportToFile(): void {
  const ws = get(workspace);
  const active = ws.tabs.find((t) => t.id === ws.activeTabId);
  if (!active) return;
  downloadAsFile(
    {
      shape: active.shape,
      rounds: active.rounds.map((r) => ({ id: r.id, source: r.source, direction: r.direction })),
      comments: active.comments,
      ...(active.flatAlign ? { flatAlign: active.flatAlign } : {}),
      ...(active.progress ? { progress: active.progress } : {}),
    },
    active.name || 'pattern',
  );
}

/** 활성 탭을 텍스트 포맷(.txt)으로 내보내기 */
export function exportAsTextFile(): void {
  const ws = get(workspace);
  const active = ws.tabs.find((t) => t.id === ws.activeTabId);
  if (!active) return;
  const patternMemo = active.comments.find((c) => c.target.kind === 'pattern')?.text;
  const roundMemos = new Map<number, string>();
  for (const c of active.comments) {
    if (c.target.kind !== 'round') continue;
    const rid = c.target.roundId;
    const idx = active.rounds.findIndex((r) => r.id === rid);
    if (idx >= 0) roundMemos.set(idx, c.text);
  }
  const text = serializeAsText({
    name: active.name,
    shape: active.shape,
    rounds: active.rounds.map((r) => ({ source: r.source })),
    patternMemo,
    roundMemos,
    progress: active.progress,
    flatAlign: active.flatAlign,
  });
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `${active.name || 'pattern'}-${date}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** 파일에서 새 탭으로 불러오기 (현재 탭 덮어쓰지 않음) — .txt / .crochet.json 둘 다 처리 */
export async function importFromFile(file: File): Promise<void> {
  const isText = file.name.toLowerCase().endsWith('.txt');
  let saved: SavedPattern;
  let explicitName: string | undefined;
  if (isText) {
    const text = await file.text();
    const parsed = parseTextFormat(text);
    saved = parsed.saved;
    explicitName = parsed.name;
  } else {
    saved = await readFromFile(file);
  }
  workspace.update((ws) => {
    const tabId = makeTabId();
    const fallback = file.name
      .replace(/\.crochet\.json$/i, '')
      .replace(/\.json$/i, '')
      .replace(/\.txt$/i, '')
      .replace(/-\d{4}-\d{2}-\d{2}$/, ''); // 내보낼 때 붙인 날짜 suffix 제거
    const name = (explicitName || fallback || nextTabName(ws.tabs)).slice(0, 30);
    const newRoundIds: string[] = saved.rounds.map(() => makeRoundId());
    const newRounds = reparseAll(saved.rounds.map((r, i) => ({
      id: newRoundIds[i]!,
      source: r.source,
      direction: r.direction,
    })));
    const newComments = remapSavedComments(saved.comments ?? [], newRoundIds, true);
    const clampedProgress = clampProgress(saved.progress, newRounds);
    const newTab: Tab = {
      id: tabId,
      name,
      shape: saved.shape,
      rounds: newRounds,
      comments: newComments,
      ...(saved.flatAlign ? { flatAlign: saved.flatAlign } : {}),
      ...(clampedProgress ? { progress: clampedProgress } : {}),
    };
    return { tabs: [...ws.tabs, newTab], activeTabId: tabId };
  });
}

/** 저장된 progress 가 현재 단 수/코 수에 맞는지 clamp. 범위 밖이면 1단/stitch null. */
function clampProgress(
  progress: SavedProgress | undefined,
  rounds: PatternRoundState[],
): SavedProgress | undefined {
  if (!progress || rounds.length === 0) return undefined;
  const round = Math.min(Math.max(1, progress.round), rounds.length);
  const r = rounds[round - 1];
  const stitchTotal = r?.expanded?.ops.length ?? 0;
  const stitch =
    progress.stitch === null ? null
      : progress.stitch >= 0 && progress.stitch < stitchTotal ? progress.stitch
      : null;
  return { round, stitch };
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
