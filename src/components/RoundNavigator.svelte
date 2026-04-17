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
    border: 1px solid #ccc;
    border-radius: 4px;
    background: white;
    font-size: 16px;
    cursor: pointer;
    color: #333;
  }
  .nav-btn:hover:not(:disabled) {
    background: #f0f0f0;
    border-color: #888;
  }
  .nav-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
  .round-display {
    min-width: 80px;
    padding: 6px 12px;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: white;
    font-size: 16px;
    font-weight: 600;
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    text-align: center;
    cursor: pointer;
    color: #333;
  }
  .round-display:hover {
    background: #f0f0f0;
    border-color: #888;
  }
  .round-input {
    width: 64px;
    padding: 6px 8px;
    border: 2px solid #4a90d9;
    border-radius: 4px;
    font-size: 16px;
    font-weight: 600;
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    text-align: center;
    outline: none;
  }
  .current-text {
    text-align: center;
    margin: 4px 0 0;
    font-size: 13px;
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    color: #555;
  }
</style>
