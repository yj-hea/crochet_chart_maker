<script lang="ts">
  import { currentRound, currentStitch } from '$stores/mode';
  import { workspace, type Comment } from '$stores/tabs';
  import { renderNarrative } from '$lib/narrative';
  import CommentPin from './CommentPin.svelte';

  interface Props {
    totalRounds: number;
  }
  let { totalRounds }: Props = $props();

  // 활성 탭과 현재 단의 parsed + 코멘트 조회
  const activeTab = $derived($workspace.tabs.find((t) => t.id === $workspace.activeTabId));
  const currentRoundData = $derived(activeTab?.rounds[$currentRound - 1]);
  // 현재 단의 stitch 개수 (op 기준, MAGIC 도 포함) — 코 네비게이션 총수
  const stitchCountByRound = $derived.by(() => {
    const counts: number[] = [];
    if (!activeTab) return counts;
    for (const r of activeTab.rounds) counts.push(r.expanded?.ops.length ?? 0);
    return counts;
  });
  const currentStitchTotal = $derived(stitchCountByRound[$currentRound - 1] ?? 0);
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

  // 단 수가 줄어든 경우 currentRound 가 범위 밖이면 clamp
  $effect(() => {
    const tr = totalRounds;
    if (tr <= 0) return;
    if ($currentRound > tr) currentRound.set(tr);
    else if ($currentRound < 1) currentRound.set(1);
  });

  function prev() { currentStitch.set(null); currentRound.update((r) => Math.max(1, r - 1)); }
  function next() { currentStitch.set(null); currentRound.update((r) => Math.min(totalRounds, r + 1)); }
  function goTo(n: number) { currentStitch.set(null); currentRound.set(Math.min(totalRounds, Math.max(1, n))); }

  /** 코 네비게이션: 현재 단 안에서 이동, 경계에서 인접 단으로 자동 롤오버 */
  function prevStitch() {
    const cs = $currentStitch;
    if (cs === null || cs <= 0) {
      // 현재 단 처음 / whole-round 상태 → 이전 단의 마지막 코로
      if ($currentRound > 1) {
        const prevTotal = stitchCountByRound[$currentRound - 2] ?? 0;
        currentRound.set($currentRound - 1);
        currentStitch.set(prevTotal > 0 ? prevTotal - 1 : null);
      }
      return;
    }
    currentStitch.set(cs - 1);
  }
  function nextStitch() {
    const cs = $currentStitch;
    const total = currentStitchTotal;
    if (cs === null) {
      currentStitch.set(0);
      return;
    }
    if (cs >= total - 1) {
      if ($currentRound < totalRounds) {
        currentRound.set($currentRound + 1);
        currentStitch.set(0);
      }
      return;
    }
    currentStitch.set(cs + 1);
  }
  function clearStitch() { currentStitch.set(null); }

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
  const currentText = $derived(currentRoundData?.source ?? '');
</script>

<svelte:window onkeydown={(e) => {
  if (editing) return;
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  // Shift + Arrow → 단 이동, 일반 Arrow → 코 이동 (경계에서 인접 단으로)
  if (e.shiftKey) {
    switch (e.key) {
      case 'ArrowUp': case 'ArrowRight': e.preventDefault(); next(); return;
      case 'ArrowDown': case 'ArrowLeft': e.preventDefault(); prev(); return;
    }
  } else {
    switch (e.key) {
      case 'ArrowRight': case 'ArrowDown': e.preventDefault(); nextStitch(); return;
      case 'ArrowLeft': case 'ArrowUp': e.preventDefault(); prevStitch(); return;
      case 'Escape': e.preventDefault(); clearStitch(); return;
    }
  }
  switch (e.key) {
    case 'Home': e.preventDefault(); goTo(1); break;
    case 'End': e.preventDefault(); goTo(totalRounds); break;
  }
}} />

<div class="round-nav">
  <button type="button" class="nav-btn" onclick={prev} disabled={$currentRound <= 1} aria-label="이전 단 (Shift+←)">◀</button>

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
      {$currentRound} / {totalRounds} 단
    </button>
  {/if}

  <button type="button" class="nav-btn" onclick={next} disabled={$currentRound >= totalRounds} aria-label="다음 단 (Shift+→)">▶</button>
</div>

{#if currentStitchTotal > 0}
  <div class="stitch-nav">
    <button
      type="button"
      class="stitch-btn"
      onclick={prevStitch}
      disabled={$currentStitch === null && $currentRound <= 1}
      aria-label="이전 코 (←)"
    >◀</button>
    <button
      type="button"
      class="stitch-display"
      class:active={$currentStitch !== null}
      onclick={clearStitch}
      title={$currentStitch !== null ? '코 강조 해제 (Esc)' : '←/→ 로 코 이동'}
    >
      {#if $currentStitch === null}
        — / {currentStitchTotal} 코
      {:else}
        {$currentStitch + 1} / {currentStitchTotal} 코
      {/if}
    </button>
    <button
      type="button"
      class="stitch-btn"
      onclick={nextStitch}
      disabled={$currentStitch !== null && $currentStitch >= currentStitchTotal - 1 && $currentRound >= totalRounds}
      aria-label="다음 코 (→)"
    >▶</button>
  </div>
{/if}

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
          <li><sup>*{i + 1}</sup> {c}</li>
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
  .stitch-nav {
    display: flex;
    align-items: center;
    gap: 6px;
    justify-content: center;
    margin-top: 6px;
  }
  .stitch-btn {
    width: 28px;
    height: 28px;
    border: 1px solid var(--border-light);
    border-radius: var(--radius-sm);
    background: var(--bg-card);
    font-size: 12px;
    cursor: pointer;
    color: var(--text-secondary);
    transition: all 0.15s;
  }
  .stitch-btn:hover:not(:disabled) {
    background: var(--bg-hover);
    border-color: var(--border);
    color: var(--text);
  }
  .stitch-btn:disabled { opacity: 0.3; cursor: not-allowed; }
  .stitch-display {
    min-width: 80px;
    padding: 4px 10px;
    border: 1px solid var(--border-light);
    border-radius: var(--radius-sm);
    background: var(--bg-card);
    font-size: 12px;
    font-family: var(--font-mono);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.15s;
  }
  .stitch-display.active {
    color: #e53935;
    border-color: #e53935;
    font-weight: 600;
  }
  .stitch-display:hover {
    background: var(--bg-hover);
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
