<script lang="ts">
  import PatternEditor from './components/PatternEditor.svelte';
  import ChartViewer from './components/ChartViewer.svelte';
  import ModeToggle from './components/ModeToggle.svelte';
  import RoundNavigator from './components/RoundNavigator.svelte';
  import TabBar from './components/TabBar.svelte';
  import HelpModal from './components/HelpModal.svelte';
  import { mode } from './stores/mode';
  import { pattern, exportToFile, importFromFile, resetPattern, lastSavedAt } from './stores/pattern';
  import { workspace } from './stores/tabs';
  import { renderNarrative } from './lib/narrative';
  import { marked } from 'marked';

  let fileInput: HTMLInputElement;
  let savedFlash = $state(false);
  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  let helpOpen = $state(false);

  // ---- 패널 리사이즈 ----
  const SPLIT_STORAGE_KEY = 'crochet-chart:split-ratio';
  const DEFAULT_RATIO = 0.42;

  function loadSplitRatio(): number {
    try {
      const v = localStorage.getItem(SPLIT_STORAGE_KEY);
      if (v) { const n = parseFloat(v); if (n > 0.15 && n < 0.85) return n; }
    } catch {}
    return DEFAULT_RATIO;
  }

  let splitRatio = $state(loadSplitRatio());
  let resizing = $state(false);

  function startResize(e: MouseEvent) {
    e.preventDefault();
    resizing = true;
    const onMove = (ev: MouseEvent) => {
      const container = document.querySelector('.edit-layout') as HTMLElement | null;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const ratio = (ev.clientX - rect.left) / rect.width;
      splitRatio = Math.min(0.8, Math.max(0.2, ratio));
    };
    const onUp = () => {
      resizing = false;
      try { localStorage.setItem(SPLIT_STORAGE_KEY, String(splitRatio)); } catch {}
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  $effect(() => {
    void $lastSavedAt;
    if (!$lastSavedAt) return;
    savedFlash = true;
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { savedFlash = false; }, 1200);
  });

  async function handleImport(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try { await importFromFile(file); }
    catch (err) { alert(`불러오기 실패: ${err instanceof Error ? err.message : String(err)}`); }
  }

  function handleReset() {
    if (window.confirm('현재 도안을 모두 지우고 새로 시작할까요?\n저장되지 않은 작업은 사라집니다.'))
      resetPattern();
  }

  const validRoundCount = $derived($pattern.rounds.filter((r) => r.expanded).length);
  const roundSources = $derived($pattern.rounds.map((r) => r.source));

  // Read 모드 서술 도안 — 활성 탭의 코멘트 조회
  const activeTab = $derived($workspace.tabs.find((t) => t.id === $workspace.activeTabId));
  const patternComment = $derived(activeTab?.comments.find((c) => c.target.kind === 'pattern'));
  const roundCommentMap = $derived.by(() => {
    const map = new Map<string, import('./stores/tabs').Comment>();
    if (!activeTab) return map;
    for (const c of activeTab.comments) {
      if (c.target.kind === 'round') map.set(c.target.roundId, c);
    }
    return map;
  });

  function renderMarkdown(text: string): string {
    return marked.parse(text || '', { async: false, breaks: true }) as string;
  }
</script>

<!-- ===== Header ===== -->
<header class="header">
  <div class="header-brand">
    <i class="fa-solid fa-circle-nodes header-icon"></i>
    <h1>코바늘 도안</h1>
  </div>

  <div class="header-actions">
    {#if savedFlash}
      <span class="save-badge">✓ 저장됨</span>
    {/if}

    <div class="btn-group">
      <button type="button" class="icon-btn" onclick={exportToFile} title="파일로 저장 (.crochet.json)"><i class="fa-solid fa-download"></i></button>
      <button type="button" class="icon-btn" onclick={() => fileInput.click()} title="파일에서 불러오기"><i class="fa-solid fa-folder-open"></i></button>
      <button type="button" class="icon-btn" onclick={handleReset} title="새 도안"><i class="fa-solid fa-file-circle-plus"></i></button>
      <button type="button" class="icon-btn" onclick={() => (helpOpen = true)} title="도안 작성 가이드"><i class="fa-solid fa-circle-question"></i></button>
    </div>

    <div class="header-divider"></div>
    <ModeToggle />

    <!-- 모바일 파일 탐색기는 accept 의 커스텀 확장자(.crochet.json)를 무시하거나 걸러내므로
         .json 과 application/json 만 두어 파일 선택이 확실히 되도록 함 -->
    <input type="file" accept=".json,application/json" bind:this={fileInput} onchange={handleImport} style="display:none" />
  </div>
</header>

<TabBar />

{#if helpOpen}
  <HelpModal onClose={() => (helpOpen = false)} />
{/if}

<!-- ===== Edit Mode ===== -->
{#if $mode === 'edit'}
  <main class="edit-layout" style="grid-template-columns: {splitRatio}fr 8px {1 - splitRatio}fr;" class:resizing>
    <section class="panel editor-panel">
      <PatternEditor />
    </section>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="splitter" onmousedown={startResize}>
      <div class="splitter-line"></div>
    </div>
    <section class="panel viewer-panel">
      <ChartViewer />
    </section>
  </main>

<!-- ===== Preview / Read Mode ===== -->
{:else}
  <main class="read-layout">
    {#if validRoundCount > 0}
      <div class="read-nav-bar">
        <RoundNavigator totalRounds={validRoundCount} {roundSources} />
      </div>
    {/if}
    <section class="read-viewer">
      <ChartViewer />
    </section>
    <details class="read-source-panel">
      <summary><i class="fa-solid fa-list-ol"></i> 도안 텍스트 보기</summary>

      {#if patternComment}
        <div class="pattern-callout" style="border-left-color: {patternComment.color}; background: {patternComment.color}22;">
          <div class="markdown">{@html renderMarkdown(patternComment.text)}</div>
        </div>
      {/if}

      <ol class="source-list">
        {#each $pattern.rounds as round (round.id)}
          {@const narr = renderNarrative(round.parsed, round.source)}
          {@const rc = roundCommentMap.get(round.id)}
          <li class:empty={!round.source}>
            {#if !round.source}
              (빈 단)
            {:else}
              <div class="narrative">{@html narr.html}</div>
              {#if narr.comments.length > 0}
                <ol class="footnotes">
                  {#each narr.comments as c, i (i)}
                    <li><sup>{'*'.repeat(i + 1)}</sup> {c}</li>
                  {/each}
                </ol>
              {/if}
              {#if rc}
                <div class="round-note" style="background: {rc.color}4D;">
                  - 참고: <span class="round-note-text markdown">{@html renderMarkdown(rc.text)}</span>
                </div>
              {/if}
            {/if}
          </li>
        {/each}
      </ol>
    </details>
  </main>
{/if}

<style>
  /* ===== Header ===== */
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 20px;
    min-height: 50px;
    background: var(--bg-card);
    border-bottom: 1px solid var(--border);
    position: relative;
    z-index: 10;
    gap: 8px;
  }
  .header-brand {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    white-space: nowrap;
  }
  .header-icon {
    font-size: 18px;
    color: var(--text-secondary);
  }
  h1 {
    font-size: 1rem;
    font-weight: 600;
    margin: 0;
    color: var(--text);
    letter-spacing: -0.01em;
    white-space: nowrap;
  }
  .header-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  /* 좁은 화면: 타이틀은 한 줄, 메뉴는 아래 줄로 */
  @media (max-width: 640px) {
    .header {
      flex-direction: column;
      align-items: stretch;
      padding: 8px 16px;
      gap: 8px;
    }
    .header-brand {
      justify-content: flex-start;
    }
    .header-actions {
      justify-content: flex-start;
    }
  }
  .save-badge {
    font-size: 11px;
    color: var(--success);
    margin-right: 6px;
    font-weight: 500;
    animation: fade-in 0.2s ease-out;
  }
  @keyframes fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  .btn-group {
    display: flex;
    gap: 1px;
  }
  .icon-btn {
    width: 34px;
    height: 30px;
    border: 1px solid var(--border-light);
    border-radius: var(--radius-sm);
    background: transparent;
    font-size: 15px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
    color: var(--text-secondary);
  }
  .icon-btn:hover {
    background: var(--bg-hover);
    border-color: var(--border);
  }
  .header-divider {
    width: 1px;
    height: 22px;
    background: var(--border-light);
    margin: 0 8px;
  }

  /* ===== Edit Layout ===== */
  .edit-layout {
    display: grid;
    grid-template-rows: 1fr;
    flex: 1;
    min-height: 0;
    padding: 12px 16px;
    gap: 0;
  }
  .edit-layout.resizing {
    user-select: none;
    cursor: col-resize;
  }
  .panel {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  /* ===== Splitter ===== */
  .splitter {
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: col-resize;
    transition: opacity 0.15s;
  }
  .splitter-line {
    width: 3px;
    height: 48px;
    border-radius: 2px;
    background: var(--border);
    transition: all 0.15s;
  }
  .splitter:hover .splitter-line,
  .edit-layout.resizing .splitter-line {
    background: var(--accent);
    height: 64px;
  }

  /* ===== Read Layout ===== */
  .read-layout {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    padding: 12px 16px;
    max-width: 1000px;
    margin: 0 auto;
    gap: 12px;
    width: 100%;
    overflow: auto;
  }
  .read-nav-bar {
    text-align: center;
    padding: 8px;
    background: var(--bg-card);
    border: 1px solid var(--border-light);
    border-radius: var(--radius);
    box-shadow: var(--shadow-sm);
  }
  .read-viewer {
    flex: 1;
    min-height: 400px;
    display: flex;
    flex-direction: column;
  }
  .read-source-panel {
    border: 1px solid var(--border-light);
    border-radius: var(--radius);
    padding: 10px 14px;
    background: var(--bg-card);
    font-size: 13px;
    box-shadow: var(--shadow-sm);
  }
  .read-source-panel summary {
    cursor: pointer;
    color: var(--text-secondary);
    font-weight: 500;
    user-select: none;
  }
  .source-list {
    margin: 8px 0 0;
    padding-left: 2em;
    font-family: var(--font-mono);
    line-height: 1.7;
    color: var(--text);
  }
  .source-list > li {
    margin-bottom: 6px;
  }
  .source-list li.empty {
    color: var(--text-muted);
    font-style: italic;
  }
  .source-list .narrative :global(.stitch-token) {
    font-weight: 500;
  }
  .source-list .narrative :global(.footnote-marker) {
    font-size: 0.7em;
    color: var(--text-secondary);
    margin-left: 1px;
  }
  .pattern-callout {
    margin: 8px 0 12px;
    padding: 10px 14px;
    border-left: 4px solid;
    border-radius: 4px;
    font-family: var(--font-sans);
    font-size: 13px;
  }
  .markdown :global(p) { margin: 0 0 6px; }
  .markdown :global(p:last-child) { margin-bottom: 0; }
  .markdown :global(ul), .markdown :global(ol) { margin: 4px 0; padding-left: 1.4em; }
  .markdown :global(code) {
    background: rgba(0,0,0,0.08);
    padding: 1px 4px;
    border-radius: 3px;
    font-family: var(--font-mono);
    font-size: 12px;
  }
  .markdown :global(img) {
    max-width: 100%;
    height: auto;
    border-radius: 4px;
    margin: 4px 0;
  }
  .round-note {
    display: inline-block;
    margin: 4px 0 0 0;
    padding: 2px 8px;
    border-radius: 3px;
    font-family: var(--font-sans);
    font-size: 12px;
    line-height: 1.5;
    color: var(--text);
  }
  .round-note .round-note-text :global(p) {
    display: inline;
    margin: 0;
  }
  .footnotes {
    margin: 4px 0 0 0;
    padding-left: 2em;
    font-family: var(--font-sans);
    font-size: 12px;
    color: var(--text-secondary);
    line-height: 1.5;
    list-style: none;
  }
  .footnotes li {
    margin-bottom: 2px;
  }
  .footnotes sup {
    margin-right: 4px;
  }

  @media (max-width: 800px) {
    .edit-layout {
      display: flex;
      flex-direction: column;
      height: auto;
    }
    .splitter { display: none; }
    .panel { min-height: 300px; }
  }
</style>
