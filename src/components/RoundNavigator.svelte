<script lang="ts">
  import { currentRound, saveProgress, hashSources, loadProgress } from '$stores/mode';
  import { workspace, type Comment } from '$stores/tabs';
  import { renderNarrative } from '$lib/narrative';
  import CommentPin from './CommentPin.svelte';

  interface Props {
    totalRounds: number;
    roundSources: string[];
  }
  let { totalRounds, roundSources }: Props = $props();

  // 활성 탭과 현재 단의 parsed + 코멘트 조회
  const activeTab = $derived($workspace.tabs.find((t) => t.id === $workspace.activeTabId));
  const currentRoundData = $derived(activeTab?.rounds[$currentRound - 1]);
  const narrative = $derived.by(() => {
    if (!currentRoundData) return { html: '', comments: [] as string[] };
    return renderNarrative(currentRoundData.parsed, currentRoundData.source);
  });
  const currentRoundComment = $derived.by<Comment | undefined>(() => {
    if (!activeTab || !currentRoundData) return undefined;
    return activeTab.comments.find(
      (c) => c.target.kind === 'round' && c.target.roundId === currentRoundData.id,
    );
  });

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

  // 현재 단의 원본 소스 (narrative 미적용 시 fallback)
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

{#if currentRoundComment}
  <div class="round-comment-row">
    <CommentPin comment={currentRoundComment} />
  </div>
{/if}

{#if currentText}
  <div class="current-narrative">
    <p class="narrative">{@html narrative.html}</p>
    {#if narrative.comments.length > 0}
      <ol class="footnotes">
        {#each narrative.comments as c, i (i)}
          <li><sup>{'*'.repeat(i + 1)}</sup> {c}</li>
        {/each}
      </ol>
    {/if}
  </div>
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
  .round-comment-row {
    margin-top: 6px;
    text-align: center;
  }
  .current-narrative {
    margin: 6px 0 0;
    text-align: center;
  }
  .current-narrative .narrative {
    margin: 0;
    font-size: 14px;
    font-family: var(--font-mono);
    color: var(--text);
  }
  .current-narrative .narrative :global(.stitch-token) {
    font-weight: 500;
  }
  .current-narrative .narrative :global(.footnote-marker) {
    font-size: 0.7em;
    color: var(--text-secondary);
  }
  .footnotes {
    margin: 6px 0 0;
    padding: 0;
    font-family: var(--font-sans);
    font-size: 12px;
    color: var(--text-secondary);
    line-height: 1.5;
    list-style: none;
    text-align: center;
  }
  .footnotes sup {
    margin-right: 4px;
  }
</style>
