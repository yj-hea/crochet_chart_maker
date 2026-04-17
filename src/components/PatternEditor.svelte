<script lang="ts">
  import {
    pattern,
    addRoundAfter,
    addRoundAtEnd,
    deleteRound,
    updateRoundSource,
  } from '$stores/pattern';
  import { setRoundDirection, addComment, workspace } from '$stores/tabs';
  import CommentPin from './CommentPin.svelte';
  import { validateRound } from '$lib/validate';
  import type { ValidationError } from '$lib/model/errors';
  import RoundLine, { type FocusRequest } from './RoundLine.svelte';
  import ShapeSelector from './ShapeSelector.svelte';

  let focusRequests = $state<Record<string, FocusRequest>>({});

  // 인접 단 간 의미 오류 계산 (부모 produce vs 현재 consume)
  const validationByRound = $derived.by(() => {
    const rounds = $pattern.rounds;
    const map = new Map<string, ValidationError[]>();
    for (let i = 0; i < rounds.length; i++) {
      const r = rounds[i]!;
      if (i === 0 || !r.expanded) { map.set(r.id, []); continue; }
      const prev = rounds[i - 1];
      if (!prev?.expanded) { map.set(r.id, []); continue; }
      map.set(r.id, validateRound(r.expanded, prev.expanded));
    }
    return map;
  });

  function bumpFocus(id: string, cursor?: 'start' | 'end' | number) {
    const prev = focusRequests[id]?.token ?? 0;
    focusRequests[id] = { token: prev + 1, cursor };
  }

  /** 일반 Enter: 다음 단으로 이동 (새 단 추가 안 함) */
  function handleEnter(roundId: string) {
    const idx = $pattern.rounds.findIndex((r) => r.id === roundId);
    if (idx < 0 || idx >= $pattern.rounds.length - 1) return;
    bumpFocus($pattern.rounds[idx + 1]!.id, 'start');
  }

  /** Shift+Enter: 새 단 추가 */
  function handleShiftEnter(roundId: string) {
    const newId = addRoundAfter(roundId);
    bumpFocus(newId);
  }

  function handleDelete(roundId: string) {
    const prevId = deleteRound(roundId);
    if (prevId) bumpFocus(prevId, 'end');
  }

  function handleAppend() {
    const newId = addRoundAtEnd();
    bumpFocus(newId);
  }

  function handleArrowUp(roundId: string, col: number) {
    const idx = $pattern.rounds.findIndex((r) => r.id === roundId);
    if (idx > 0) bumpFocus($pattern.rounds[idx - 1]!.id, col);
  }

  function handleArrowDown(roundId: string, col: number) {
    const idx = $pattern.rounds.findIndex((r) => r.id === roundId);
    if (idx >= 0 && idx < $pattern.rounds.length - 1) {
      bumpFocus($pattern.rounds[idx + 1]!.id, col);
    }
  }

  function handleArrowLeftBoundary(roundId: string) {
    const idx = $pattern.rounds.findIndex((r) => r.id === roundId);
    if (idx > 0) bumpFocus($pattern.rounds[idx - 1]!.id, 'end');
  }

  function handleArrowRightBoundary(roundId: string) {
    const idx = $pattern.rounds.findIndex((r) => r.id === roundId);
    if (idx >= 0 && idx < $pattern.rounds.length - 1) {
      bumpFocus($pattern.rounds[idx + 1]!.id, 'start');
    }
  }

  function handleToggleDirection(roundId: string) {
    const r = $pattern.rounds.find((r) => r.id === roundId);
    if (!r) return;
    const current = r.direction ?? 'forward';
    setRoundDirection(roundId, current === 'forward' ? 'reverse' : 'forward');
  }

  // 활성 탭의 코멘트 맵: round.id → Comment | undefined
  const activeTab = $derived($workspace.tabs.find((t) => t.id === $workspace.activeTabId));
  const roundCommentByRound = $derived.by(() => {
    const map = new Map<string, import('$stores/tabs').Comment>();
    if (!activeTab) return map;
    for (const c of activeTab.comments) {
      if (c.target.kind === 'round') map.set(c.target.roundId, c);
    }
    return map;
  });
  const patternComment = $derived(
    activeTab?.comments.find((c) => c.target.kind === 'pattern'),
  );

  function handleAddRoundComment(roundId: string) {
    addComment({ kind: 'round', roundId }, '');
  }

  function handleAddPatternComment() {
    addComment({ kind: 'pattern' }, '');
  }

  // 도형별 방향 아이콘/라벨
  const dirIcon = $derived($pattern.shape === 'circular'
    ? { forward: 'fa-solid fa-rotate-left', reverse: 'fa-solid fa-rotate-right' }
    : { forward: 'fa-solid fa-arrow-right', reverse: 'fa-solid fa-arrow-left' });
  const dirLabel = $derived($pattern.shape === 'circular'
    ? { forward: '반시계 방향 (클릭하여 시계 방향으로)', reverse: '시계 방향 (클릭하여 반시계 방향으로)' }
    : { forward: '왼→오 (클릭하여 오→왼으로)', reverse: '오→왼 (클릭하여 왼→오로)' });
</script>

<div class="pattern-editor">
  <div class="editor-header">
    <ShapeSelector />
    <div class="header-spacer"></div>
    {#if patternComment}
      <CommentPin comment={patternComment} />
    {:else}
      <button type="button" class="pattern-comment-btn" onclick={handleAddPatternComment} title="도안 메모 추가">
        <i class="fa-regular fa-comment"></i> 메모
      </button>
    {/if}
  </div>
  <div class="rounds-area">
  {#each $pattern.rounds as round, i (round.id)}
    <RoundLine
      source={round.source}
      index={i + 1}
      errors={round.parsed?.errors ?? []}
      validationErrors={validationByRound.get(round.id) ?? []}
      stitchCount={round.expanded?.totalProduce}
      canDelete={$pattern.rounds.length > 1}
      roundComment={roundCommentByRound.get(round.id)}
      direction={round.direction ?? 'forward'}
      directionIcon={dirIcon}
      directionLabel={dirLabel}
      focusRequest={focusRequests[round.id]}
      onChange={(s) => updateRoundSource(round.id, s)}
      onEnter={() => handleEnter(round.id)}
      onShiftEnter={() => handleShiftEnter(round.id)}
      onDelete={() => handleDelete(round.id)}
      onToggleDirection={() => handleToggleDirection(round.id)}
      onAddComment={() => handleAddRoundComment(round.id)}
      onArrowUp={(col) => handleArrowUp(round.id, col)}
      onArrowDown={(col) => handleArrowDown(round.id, col)}
      onArrowLeftBoundary={() => handleArrowLeftBoundary(round.id)}
      onArrowRightBoundary={() => handleArrowRightBoundary(round.id)}
    />
  {/each}
  </div>
  <button type="button" class="append-btn" onclick={handleAppend}>
    + 단 추가
  </button>
</div>

<style>
  .pattern-editor {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    background: var(--bg-card, #fff);
    border: 1px solid var(--border, #e2e2e2);
    border-radius: var(--radius, 8px);
    box-shadow: var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.06));
    overflow: hidden;
  }
  .editor-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 14px;
    border-bottom: 1px solid var(--border, #e2e2e2);
    background: var(--bg, #f5f5f5);
  }
  .header-spacer { flex: 1; }
  .pattern-comment-btn {
    padding: 4px 10px;
    border: 1px solid var(--border-light);
    border-radius: var(--radius-sm);
    background: var(--bg-card);
    color: var(--text-secondary);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .pattern-comment-btn:hover {
    background: var(--bg-hover);
    color: var(--text);
    border-color: var(--border);
  }
  .rounds-area {
    flex: 1;
    overflow-y: auto;
    padding: 8px 12px;
  }
  .append-btn {
    align-self: stretch;
    margin: 0;
    padding: 10px 14px;
    border: none;
    border-top: 1px solid var(--border, #e2e2e2);
    background: var(--bg, #f5f5f5);
    color: var(--text-secondary, #666);
    font-size: 13px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .append-btn:hover {
    background: var(--bg-hover, #f0f0f0);
    color: var(--text, #1a1a1a);
  }
</style>
