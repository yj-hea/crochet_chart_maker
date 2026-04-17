<script lang="ts">
  import {
    pattern,
    addRoundAfter,
    addRoundAtEnd,
    deleteRound,
    updateRoundSource,
  } from '$stores/pattern';
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
</script>

<div class="pattern-editor">
  <div class="editor-header">
    <ShapeSelector />
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
      focusRequest={focusRequests[round.id]}
      onChange={(s) => updateRoundSource(round.id, s)}
      onEnter={() => handleEnter(round.id)}
      onShiftEnter={() => handleShiftEnter(round.id)}
      onDelete={() => handleDelete(round.id)}
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
    padding: 12px 14px;
    border-bottom: 1px solid var(--border, #e2e2e2);
    background: var(--bg, #f5f5f5);
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
