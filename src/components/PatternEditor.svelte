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
  import RoundLine from './RoundLine.svelte';
  import ShapeSelector from './ShapeSelector.svelte';

  let focusTokens = $state<Record<string, number>>({});

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

  function bumpFocus(id: string) {
    focusTokens[id] = (focusTokens[id] ?? 0) + 1;
  }

  function handleEnter(roundId: string) {
    const newId = addRoundAfter(roundId);
    bumpFocus(newId);
  }

  function handleDelete(roundId: string) {
    const prevId = deleteRound(roundId);
    if (prevId) bumpFocus(prevId);
  }

  function handleAppend() {
    const newId = addRoundAtEnd();
    bumpFocus(newId);
  }

  function handleArrowUp(roundId: string) {
    const idx = $pattern.rounds.findIndex((r) => r.id === roundId);
    if (idx > 0) bumpFocus($pattern.rounds[idx - 1]!.id);
  }

  function handleArrowDown(roundId: string) {
    const idx = $pattern.rounds.findIndex((r) => r.id === roundId);
    if (idx >= 0 && idx < $pattern.rounds.length - 1) {
      bumpFocus($pattern.rounds[idx + 1]!.id);
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
      focusToken={focusTokens[round.id]}
      onChange={(s) => updateRoundSource(round.id, s)}
      onEnter={() => handleEnter(round.id)}
      onDelete={() => handleDelete(round.id)}
      onArrowUp={() => handleArrowUp(round.id)}
      onArrowDown={() => handleArrowDown(round.id)}
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
