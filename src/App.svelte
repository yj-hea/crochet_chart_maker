<script lang="ts">
  import PatternEditor from './components/PatternEditor.svelte';
  import ChartViewer from './components/ChartViewer.svelte';
  import ShapeSelector from './components/ShapeSelector.svelte';
  import ModeToggle from './components/ModeToggle.svelte';
  import RoundNavigator from './components/RoundNavigator.svelte';
  import { mode } from './stores/mode';
  import { pattern, exportToFile, importFromFile, resetPattern, lastSavedAt } from './stores/pattern';

  let fileInput: HTMLInputElement;
  let savedFlash = $state(false);
  let flashTimer: ReturnType<typeof setTimeout> | undefined;

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
    try {
      await importFromFile(file);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`불러오기 실패: ${msg}`);
    }
  }

  function handleReset() {
    const ok = window.confirm(
      '현재 도안을 모두 지우고 새로 시작할까요?\n저장되지 않은 작업은 사라집니다.',
    );
    if (ok) resetPattern();
  }

  const validRoundCount = $derived(
    $pattern.rounds.filter((r) => r.expanded).length
  );
  const roundSources = $derived(
    $pattern.rounds.map((r) => r.source)
  );
</script>

<header class="app-header">
  <div class="header-left">
    <h1>코바늘 도안 생성기</h1>
    <ShapeSelector />
  </div>
  <div class="header-right">
    <span class="save-status" class:visible={savedFlash} aria-live="polite">저장됨</span>
    <button type="button" class="tool-btn" onclick={exportToFile} title="현재 도안을 파일로 다운로드">
      💾 저장
    </button>
    <button type="button" class="tool-btn" onclick={() => fileInput.click()} title=".crochet.json 파일에서 불러오기">
      📂 불러오기
    </button>
    <button type="button" class="tool-btn danger" onclick={handleReset} title="도안 비우고 새로 시작">
      🆕 새 도안
    </button>
    <ModeToggle />
    <input
      type="file"
      accept=".json,.crochet.json,application/json"
      bind:this={fileInput}
      onchange={handleImport}
      style="display:none"
    />
  </div>
</header>

{#if $mode === 'edit'}
  <main class="app-main edit-layout" style="grid-template-columns: {splitRatio}fr 6px {1 - splitRatio}fr;" class:resizing>
    <section class="pane editor-pane">
      <h2>입력</h2>
      <PatternEditor />
    </section>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="splitter" onmousedown={startResize} title="드래그하여 패널 크기 조절">
      <div class="splitter-handle"></div>
    </div>
    <section class="pane viewer-pane">
      <h2>미리보기</h2>
      <ChartViewer />
    </section>
  </main>
{:else}
  <main class="app-main read-layout">
    {#if validRoundCount > 0}
      <div class="read-nav">
        <RoundNavigator totalRounds={validRoundCount} {roundSources} />
      </div>
    {/if}
    <section class="read-viewer">
      <ChartViewer />
    </section>
    <details class="read-source">
      <summary>도안 텍스트 보기</summary>
      <ol class="source-list">
        {#each $pattern.rounds as round (round.id)}
          <li class:empty={!round.source}>{round.source || '(빈 단)'}</li>
        {/each}
      </ol>
    </details>
  </main>
{/if}

<style>
  .app-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 0.75rem 1.5rem;
    border-bottom: 1px solid #e0e0e0;
    background: white;
    flex-wrap: wrap;
  }
  .header-left {
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  .header-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  h1 {
    font-size: 1.4rem;
    margin: 0;
  }
  .save-status {
    font-size: 12px;
    color: #2a7a3a;
    margin-right: 4px;
    opacity: 0;
    transition: opacity 0.2s;
  }
  .save-status.visible {
    opacity: 1;
  }
  .tool-btn {
    padding: 6px 12px;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: white;
    font-size: 13px;
    cursor: pointer;
    color: #333;
  }
  .tool-btn:hover {
    background: #f0f0f0;
    border-color: #888;
  }
  .tool-btn.danger:hover {
    background: #fce4e4;
    border-color: #c0392b;
    color: #c0392b;
  }
  h2 {
    font-size: 0.9rem;
    margin: 0;
    color: #666;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* Edit layout — 3열 grid: editor | splitter | viewer */
  .edit-layout {
    display: grid;
    grid-template-rows: 1fr;
    /* grid-template-columns 는 inline style로 동적 지정 */
    padding: 16px 1.5rem;
    max-width: 1400px;
    margin: 0 auto;
    height: calc(100vh - 60px);
  }
  .edit-layout.resizing {
    user-select: none;
    cursor: col-resize;
  }
  .pane {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }
  .splitter {
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: col-resize;
    padding: 0 2px;
  }
  .splitter-handle {
    width: 4px;
    height: 40px;
    border-radius: 2px;
    background: #ccc;
    transition: background 0.15s;
  }
  .splitter:hover .splitter-handle,
  .edit-layout.resizing .splitter-handle {
    background: #888;
  }

  /* Read layout */
  .read-layout {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px 1.5rem;
    max-width: 1000px;
    margin: 0 auto;
  }
  .read-nav {
    text-align: center;
  }
  .read-viewer {
    flex: 1;
  }
  .read-source {
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    padding: 8px 12px;
    background: #fafafa;
    font-size: 13px;
  }
  .read-source summary {
    cursor: pointer;
    color: #666;
    font-weight: 500;
  }
  .source-list {
    margin: 8px 0 0;
    padding-left: 2em;
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    line-height: 1.6;
    color: #333;
  }
  .source-list li.empty {
    color: #bbb;
    font-style: italic;
  }

  @media (max-width: 800px) {
    .edit-layout {
      grid-template-columns: 1fr;
    }
  }
</style>
