<script lang="ts">
  import {
    pattern,
    addRoundAfter,
    addRoundAtEnd,
    deleteRound,
    updateRoundSource,
  } from '$stores/pattern';
  import RoundLine from './RoundLine.svelte';

  let focusTokens = $state<Record<string, number>>({});

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
  {#each $pattern.rounds as round, i (round.id)}
    <RoundLine
      source={round.source}
      index={i + 1}
      errors={round.parsed?.errors ?? []}
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
  <button type="button" class="append-btn" onclick={handleAppend}>
    + 단 추가
  </button>
</div>

<style>
  .pattern-editor {
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 12px;
    background: #f8f8f8;
    border-radius: 6px;
    min-height: 200px;
  }
  .append-btn {
    align-self: flex-start;
    margin: 8px 0 0 36px;
    padding: 6px 14px;
    border: 1px dashed #aaa;
    border-radius: 4px;
    background: transparent;
    color: #555;
    font-size: 13px;
    cursor: pointer;
  }
  .append-btn:hover {
    background: #eee;
    border-color: #666;
    border-style: solid;
    color: #222;
  }
</style>
