<script lang="ts">
  import { currentRound, saveProgress, hashSources, loadProgress } from '$stores/mode';

  interface Props {
    totalRounds: number;
    roundSources: string[];
  }
  let { totalRounds, roundSources }: Props = $props();

  // 도안이 바뀌면 진행 상태 복원/clamp
  $effect(() => {
    const hash = hashSources(roundSources);
    const restored = loadProgress(hash, totalRounds);
    currentRound.set(restored);
  });

  // currentRound 변경 시 localStorage에 저장
  $effect(() => {
    const r = $currentRound;
    const hash = hashSources(roundSources);
    saveProgress(hash, r);
  });

  function prev() { currentRound.update((r) => Math.max(1, r - 1)); }
  function next() { currentRound.update((r) => Math.min(totalRounds, r + 1)); }
  function goTo(n: number) { currentRound.set(Math.min(totalRounds, Math.max(1, n))); }

  let editing = $state(false);
  let inputValue = $state('');
  let inputEl: HTMLInputElement | undefined = $state();

  function startEdit() {
    inputValue = String($currentRound);
    editing = true;
    requestAnimationFrame(() => inputEl?.select());
  }

  function commitEdit() {
    const n = parseInt(inputValue, 10);
    if (!isNaN(n)) goTo(n);
    editing = false;
  }

  // 현재 단의 소스 텍스트
  const currentText = $derived(roundSources[$currentRound - 1] ?? '');
</script>

<svelte:window onkeydown={(e) => {
  if (editing) return;
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  switch (e.key) {
    case 'ArrowUp': case 'ArrowRight': e.preventDefault(); next(); break;
    case 'ArrowDown': case 'ArrowLeft': e.preventDefault(); prev(); break;
    case 'Home': e.preventDefault(); goTo(1); break;
    case 'End': e.preventDefault(); goTo(totalRounds); break;
  }
}} />

<div class="round-nav">
  <button type="button" class="nav-btn" onclick={prev} disabled={$currentRound <= 1} aria-label="이전 단">◀</button>

  {#if editing}
    <input
      type="number"
      class="round-input"
      min="1"
      max={totalRounds}
      bind:this={inputEl}
      bind:value={inputValue}
      onblur={commitEdit}
      onkeydown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') { editing = false; } }}
    />
  {:else}
    <button type="button" class="round-display" onclick={startEdit} title="클릭하여 단 번호 직접 입력">
      {$currentRound} / {totalRounds}
    </button>
  {/if}

  <button type="button" class="nav-btn" onclick={next} disabled={$currentRound >= totalRounds} aria-label="다음 단">▶</button>
</div>

{#if currentText}
  <p class="current-text">{currentText}</p>
{/if}

<style>
  .round-nav {
    display: flex;
    align-items: center;
    gap: 8px;
    justify-content: center;
  }
  .nav-btn {
    width: 36px;
    height: 36px;
    border: 1px solid var(--border, #ddd9d2);
    border-radius: var(--radius-sm, 5px);
    background: var(--bg-card, #fff);
    font-size: 16px;
    cursor: pointer;
    color: var(--text-secondary, #7a756d);
    transition: all 0.15s;
  }
  .nav-btn:hover:not(:disabled) {
    background: var(--bg-hover, #f0eee9);
    border-color: var(--border-focus, #b0aa9f);
    color: var(--text, #3a3632);
  }
  .nav-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
  .round-display {
    min-width: 80px;
    padding: 6px 12px;
    border: 1px solid var(--border, #ddd9d2);
    border-radius: var(--radius-sm, 5px);
    background: var(--bg-card, #fff);
    font-size: 16px;
    font-weight: 600;
    font-family: var(--font-mono);
    text-align: center;
    cursor: pointer;
    color: var(--text, #3a3632);
    transition: all 0.15s;
  }
  .round-display:hover {
    background: var(--bg-hover, #f0eee9);
    border-color: var(--border-focus, #b0aa9f);
  }
  .round-input {
    width: 64px;
    padding: 6px 8px;
    border: 2px solid var(--accent, #5a554d);
    border-radius: var(--radius-sm, 5px);
    font-size: 16px;
    font-weight: 600;
    font-family: var(--font-mono);
    text-align: center;
    outline: none;
    color: var(--text, #3a3632);
  }
  .current-text {
    text-align: center;
    margin: 4px 0 0;
    font-size: 13px;
    font-family: var(--font-mono);
    color: var(--text-secondary, #7a756d);
  }
</style>
