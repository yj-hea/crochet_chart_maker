<script lang="ts">
  import { onMount } from 'svelte';
  import PatternEditor from './components/PatternEditor.svelte';
  import ChartViewer from './components/ChartViewer.svelte';
  import ModeToggle from './components/ModeToggle.svelte';
  import RoundNavigator from './components/RoundNavigator.svelte';
  import TabBar from './components/TabBar.svelte';
  import HelpModal from './components/HelpModal.svelte';
  import DropboxMenu from './components/DropboxMenu.svelte';
  import { initializeDropbox, lastDropboxAction } from './stores/dropbox';
  import { mode, currentRound, currentStitch } from './stores/mode';
  import { setTabProgress } from './stores/tabs';
  import { renderedChart } from './stores/rendered';
  import { placeDropdown } from './lib/dropdown-place';
  import { pattern, exportToFile, exportAsTextFile, importFromFile, resetPattern, lastSavedAt } from './stores/pattern';
  import { workspace } from './stores/tabs';
  import { renderNarrative } from './lib/narrative';
  import { marked } from 'marked';

  let fileInput: HTMLInputElement;
  let savedFlash = $state(false);
  let flashMessage = $state('✓ 저장됨');
  let flashTimer: ReturnType<typeof setTimeout> | undefined;

  function showFlash(msg: string, duration = 1400) {
    flashMessage = msg;
    savedFlash = true;
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { savedFlash = false; }, duration);
  }
  let helpOpen = $state(false);
  let exportMenuOpen = $state(false);
  let exportMenuRoot: HTMLDivElement | undefined = $state();
  let exportMenuTrigger: HTMLButtonElement | undefined = $state();
  let exportMenuEl: HTMLDivElement | undefined = $state();

  // Dropbox OAuth redirect 복귀 처리 + 연결 상태 초기화
  onMount(() => { void initializeDropbox(); });

  // 내보내기 드롭다운 바깥 클릭 시 닫기
  onMount(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!exportMenuOpen) return;
      if (exportMenuRoot && exportMenuRoot.contains(e.target as Node)) return;
      exportMenuOpen = false;
    };
    window.addEventListener('click', onDocClick);
    return () => window.removeEventListener('click', onDocClick);
  });

  // 드롭다운을 뷰포트 안에 clamp (모바일 등 좁은 화면에서 창 밖으로 나가지 않도록)
  $effect(() => {
    if (!exportMenuOpen) return;
    // DOM 장착 직후 한 번, 그리고 viewport resize/scroll 에 반응
    queueMicrotask(() => placeDropdown(exportMenuTrigger, exportMenuEl, 'right'));
    const reflow = () => placeDropdown(exportMenuTrigger, exportMenuEl, 'right');
    window.addEventListener('resize', reflow);
    window.addEventListener('scroll', reflow, true);
    return () => {
      window.removeEventListener('resize', reflow);
      window.removeEventListener('scroll', reflow, true);
    };
  });

  function chooseExportJson() {
    exportMenuOpen = false;
    exportToFile();
  }
  function chooseExportText() {
    exportMenuOpen = false;
    exportAsTextFile();
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function activeBaseName(): string {
    const ws = $workspace;
    const active = ws.tabs.find((t) => t.id === ws.activeTabId);
    return (active?.name || 'pattern').trim() || 'pattern';
  }

  function chooseExportSvg() {
    exportMenuOpen = false;
    const r = $renderedChart;
    if (!r) return;
    // viewBox 기반 SVG 에 width/height 를 명시해 다른 뷰어에서 자연 크기로 열리도록 보정
    const sized = r.svg.replace(
      /<svg ([^>]*viewBox="[^"]+")/,
      `<svg $1 width="${r.width}" height="${r.height}"`,
    );
    const date = new Date().toISOString().slice(0, 10);
    downloadBlob(new Blob([sized], { type: 'image/svg+xml;charset=utf-8' }), `${activeBaseName()}-${date}.svg`);
  }

  async function chooseExportPng() {
    exportMenuOpen = false;
    const r = $renderedChart;
    if (!r) return;
    const scale = 2;  // 레티나 대응
    const sized = r.svg.replace(
      /<svg ([^>]*viewBox="[^"]+")/,
      `<svg $1 width="${r.width}" height="${r.height}"`,
    );
    const svgBlob = new Blob([sized], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);
    try {
      const img = new Image();
      img.src = svgUrl;
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error('SVG 이미지 로드 실패'));
      });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil(r.width * scale));
      canvas.height = Math.max(1, Math.ceil(r.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const date = new Date().toISOString().slice(0, 10);
      await new Promise<void>((res) => canvas.toBlob((b) => {
        if (b) downloadBlob(b, `${activeBaseName()}-${date}.png`);
        res();
      }, 'image/png'));
    } catch (err) {
      alert(`PNG 내보내기 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      URL.revokeObjectURL(svgUrl);
    }
  }

  // ---- 패널 리사이즈 ----
  const SPLIT_H_KEY = 'crochet-chart:split-ratio';
  const SPLIT_V_KEY = 'crochet-chart:split-ratio-v';
  const DEFAULT_RATIO_H = 0.42;
  const DEFAULT_RATIO_V = 0.5;

  function loadRatio(key: string, fallback: number): number {
    try {
      const v = localStorage.getItem(key);
      if (v) { const n = parseFloat(v); if (n > 0.15 && n < 0.85) return n; }
    } catch {}
    return fallback;
  }

  let splitRatio = $state(loadRatio(SPLIT_H_KEY, DEFAULT_RATIO_H));
  let splitRatioV = $state(loadRatio(SPLIT_V_KEY, DEFAULT_RATIO_V));
  let resizing = $state(false);
  // 좁은 화면(세로 배치) 여부 — matchMedia 로 추적해 분할 방향을 전환
  let narrow = $state(false);

  onMount(() => {
    const mq = window.matchMedia('(max-width: 800px)');
    narrow = mq.matches;
    const handler = (e: MediaQueryListEvent) => { narrow = e.matches; };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  });

  function startResize(e: MouseEvent | TouchEvent, orientation: 'h' | 'v') {
    e.preventDefault();
    resizing = true;
    const isTouch = 'touches' in e;
    const getXY = (ev: MouseEvent | TouchEvent): { x: number; y: number } | null => {
      if ('touches' in ev) {
        const t = ev.touches[0] ?? ev.changedTouches[0];
        return t ? { x: t.clientX, y: t.clientY } : null;
      }
      return { x: ev.clientX, y: ev.clientY };
    };
    const onMove = (ev: MouseEvent | TouchEvent) => {
      const container = document.querySelector('.edit-layout') as HTMLElement | null;
      if (!container) return;
      const xy = getXY(ev);
      if (!xy) return;
      const rect = container.getBoundingClientRect();
      if (orientation === 'h') {
        const ratio = (xy.x - rect.left) / rect.width;
        splitRatio = Math.min(0.8, Math.max(0.2, ratio));
      } else {
        const ratio = (xy.y - rect.top) / rect.height;
        splitRatioV = Math.min(0.8, Math.max(0.2, ratio));
      }
    };
    const onUp = () => {
      resizing = false;
      try {
        localStorage.setItem(orientation === 'h' ? SPLIT_H_KEY : SPLIT_V_KEY,
          String(orientation === 'h' ? splitRatio : splitRatioV));
      } catch {}
      if (isTouch) {
        window.removeEventListener('touchmove', onMove);
        window.removeEventListener('touchend', onUp);
        window.removeEventListener('touchcancel', onUp);
      } else {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      }
    };
    if (isTouch) {
      window.addEventListener('touchmove', onMove, { passive: false });
      window.addEventListener('touchend', onUp);
      window.addEventListener('touchcancel', onUp);
    } else {
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    }
  }

  $effect(() => {
    void $lastSavedAt;
    if (!$lastSavedAt) return;
    showFlash('✓ 저장됨', 1200);
  });

  // Dropbox 저장/불러오기 결과 — save 알림과 같은 자리에 잠깐 표시
  let lastSeenDropboxAt: number | undefined;
  $effect(() => {
    const action = $lastDropboxAction;
    if (!action || action.at === lastSeenDropboxAt) return;
    lastSeenDropboxAt = action.at;
    const verb = action.kind === 'save' ? '저장' : '불러오기';
    showFlash(`✓ ${action.name} ${verb}`, 2200);
  });

  // ---- Read 모드 진행 상태(단·코) 를 활성 탭에 양방향 동기화 ----
  let lastSyncedTabId: string | undefined;
  $effect(() => {
    const id = $workspace.activeTabId;
    if (id === lastSyncedTabId) return;
    lastSyncedTabId = id;
    const tab = $workspace.tabs.find((t) => t.id === id);
    const p = tab?.progress;
    currentRound.set(p?.round ?? 1);
    currentStitch.set(p?.stitch ?? null);
  });

  $effect(() => {
    const r = $currentRound;
    const s = $currentStitch;
    const id = $workspace.activeTabId;
    // 활성 탭이 바뀌는 순간(복원) 에 stores 가 set 되는데, 아직 lastSyncedTabId 가 갱신되기 전이면
    // 새 탭의 progress 가 아닌 이전 값이 쓰일 수 있음 → 같은 tick 에서 첫 effect 가 이미 동기화하므로
    // progress 를 update 하는 건 안전하게 항상 수행.
    if (!id) return;
    const tab = $workspace.tabs.find((t) => t.id === id);
    if (!tab) return;
    const prev = tab.progress;
    if (prev?.round === r && prev?.stitch === s) return;  // no-op
    setTabProgress(id, { round: r, stitch: s });
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
    if (window.confirm('현재 도안을 비울까요?\n저장되지 않은 작업은 사라집니다.'))
      resetPattern();
  }

  const validRoundCount = $derived($pattern.rounds.filter((r) => r.expanded).length);

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

  <div class="notification-slot" aria-live="polite">
    {#if savedFlash}
      <span class="save-badge">{flashMessage}</span>
    {/if}
  </div>

  <div class="header-actions">
    <div class="btn-group">
      <DropboxMenu />
      <button type="button" class="icon-btn" onclick={handleReset} title="도안 비우기"><i class="fa-solid fa-eraser"></i></button>
      <button type="button" class="icon-btn" onclick={() => fileInput.click()} title="파일에서 불러오기 (.crochet.json / .txt)"><i class="fa-solid fa-folder-open"></i></button>
      <div class="export-menu" bind:this={exportMenuRoot}>
        <button
          type="button"
          class="icon-btn"
          onclick={() => (exportMenuOpen = !exportMenuOpen)}
          bind:this={exportMenuTrigger}
          aria-haspopup="true"
          aria-expanded={exportMenuOpen}
          title="내보내기"
        >
          <i class="fa-solid fa-download"></i>
        </button>
        {#if exportMenuOpen}
          <div class="dropdown" role="menu" bind:this={exportMenuEl}>
            <button type="button" class="item" onclick={chooseExportJson} role="menuitem">
              <i class="fa-solid fa-file-code"></i> 크로셰 JSON (.crochet.json)
            </button>
            <button type="button" class="item" onclick={chooseExportText} role="menuitem">
              <i class="fa-solid fa-file-lines"></i> 텍스트 (.txt)
            </button>
            <button type="button" class="item" onclick={chooseExportSvg} role="menuitem" disabled={!$renderedChart}>
              <i class="fa-solid fa-file-image"></i> 이미지 SVG (.svg)
            </button>
            <button type="button" class="item" onclick={chooseExportPng} role="menuitem" disabled={!$renderedChart}>
              <i class="fa-solid fa-image"></i> 이미지 PNG (.png)
            </button>
          </div>
        {/if}
      </div>
      <button type="button" class="icon-btn" onclick={() => (helpOpen = true)} title="도안 작성 가이드"><i class="fa-solid fa-circle-question"></i></button>
    </div>

    <div class="header-divider"></div>
    <div class="flex-break"></div>
    <ModeToggle />

    <!-- 모바일 파일 탐색기는 accept 의 커스텀 확장자(.crochet.json)를 무시하거나 걸러내므로
         표준 확장자 기반으로 둠. .txt 는 텍스트 포맷 import 용. -->
    <input type="file" accept=".json,.txt,application/json,text/plain" bind:this={fileInput} onchange={handleImport} style="display:none" />
  </div>
</header>

<TabBar />

{#if helpOpen}
  <HelpModal onClose={() => (helpOpen = false)} />
{/if}

<!-- ===== Edit Mode ===== -->
{#if $mode === 'edit'}
  <main
    class="edit-layout"
    class:resizing
    class:stacked={narrow}
    style={narrow
      ? `grid-template-rows: ${splitRatioV}fr 8px ${1 - splitRatioV}fr;`
      : `grid-template-columns: ${splitRatio}fr 8px ${1 - splitRatio}fr;`}
  >
    <section class="panel editor-panel">
      <PatternEditor />
    </section>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="splitter {narrow ? 'splitter-v' : 'splitter-h'}"
      onmousedown={(e) => startResize(e, narrow ? 'v' : 'h')}
      ontouchstart={(e) => startResize(e, narrow ? 'v' : 'h')}
    >
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
        <RoundNavigator totalRounds={validRoundCount} />
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
                    <li><sup>*{i + 1}</sup> {c}</li>
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
  /* 넓은 화면: 2×2 그리드. 로고가 왼쪽에서 2행을 차지하고, 오른쪽 위는 알림 영역,
     오른쪽 아래는 아이콘 버튼 행. 알림이 떠도 아이콘 위치를 흔들지 않음. */
  .header {
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-rows: auto auto;
    column-gap: 16px;
    row-gap: 2px;
    align-items: center;
    padding: 8px 20px;
    background: var(--bg-card);
    border-bottom: 1px solid var(--border);
    position: relative;
    z-index: 10;
  }
  .header-brand {
    grid-column: 1;
    grid-row: 1 / span 2;
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
    white-space: nowrap;
  }
  .header-icon {
    font-size: 24px;
    color: var(--text-secondary);
  }
  h1 {
    font-size: 1.15rem;
    font-weight: 600;
    margin: 0;
    color: var(--text);
    letter-spacing: -0.01em;
    white-space: nowrap;
  }
  .notification-slot {
    grid-column: 2;
    grid-row: 1;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    /* 배지가 떠도 행 높이가 변하지 않도록 배지 full height 와 맞춘 min-height 고정 */
    min-height: 24px;
  }
  .header-actions {
    grid-column: 2;
    grid-row: 2;
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  /* 좁은 화면: 타이틀 한 줄, 메뉴 한 줄. 알림은 absolute 로 띄워 레이아웃에 끼지 않음. */
  @media (max-width: 640px) {
    .header {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      padding: 8px 16px;
      gap: 8px;
    }
    .header-icon { font-size: 18px; }
    h1 { font-size: 1rem; }
    .header-brand { justify-content: flex-start; }
    .header-actions { justify-content: flex-start; }
    .notification-slot {
      position: absolute;
      top: 6px;
      right: 12px;
      min-height: 0;
    }
  }
  .save-badge {
    padding: 2px 8px;
    font-size: 11px;
    font-weight: 500;
    line-height: 16px;
    color: var(--success);
    background: rgba(67, 160, 71, 0.14);
    border-radius: 10px;
    animation: fade-in 0.2s ease-out;
    pointer-events: none;
  }
  .flex-break { display: none; }
  /* 좁은 화면: ModeToggle 앞에 flex-break 가 활성화되어 자동으로 줄바꿈 */
  @media (max-width: 640px) {
    .flex-break {
      display: block;
      flex-basis: 100%;
      height: 0;
    }
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
  .export-menu { position: relative; }
  .export-menu .dropdown {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    min-width: 220px;
    max-width: calc(100vw - 24px);
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-md);
    padding: 4px;
    z-index: 100;
    display: flex;
    flex-direction: column;
  }
  .export-menu .item {
    text-align: left;
    padding: 7px 10px;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    font-size: 13px;
    color: var(--text);
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .export-menu .item:hover:not(:disabled) { background: var(--bg-hover); }
  .export-menu .item:disabled { opacity: 0.4; cursor: not-allowed; }
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
  .edit-layout.resizing.stacked {
    cursor: row-resize;
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
    transition: opacity 0.15s;
  }
  .splitter-h { cursor: col-resize; }
  .splitter-v { cursor: row-resize; }
  .splitter-line {
    border-radius: 2px;
    background: var(--border);
    transition: all 0.15s;
  }
  .splitter-h .splitter-line {
    width: 3px;
    height: 48px;
  }
  .splitter-v .splitter-line {
    width: 48px;
    height: 3px;
  }
  .splitter:hover .splitter-line,
  .edit-layout.resizing .splitter-line {
    background: var(--accent);
  }
  .splitter-h:hover .splitter-line,
  .edit-layout.resizing .splitter-h .splitter-line {
    height: 64px;
  }
  .splitter-v:hover .splitter-line,
  .edit-layout.resizing .splitter-v .splitter-line {
    width: 64px;
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
    .edit-layout.stacked {
      grid-template-columns: 1fr;
    }
  }
</style>
