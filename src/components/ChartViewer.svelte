<script lang="ts">
  import { pattern } from '$stores/pattern';
  import { mode, currentRound, showGrid } from '$stores/mode';
  import { layoutCircular } from '$lib/layout/circular';
  import { layoutFlat } from '$lib/layout/flat';
  import { renderSvg } from '$lib/render/svg';
  import type { ExpandedRound } from '$lib/expand/op';

  const ZOOM_MIN = 0.25;
  const ZOOM_MAX = 4;
  const ZOOM_STEP = 0.25;

  let zoom = $state(1);

  const rendered = $derived.by(() => {
    const validRounds: ExpandedRound[] = [];
    for (const r of $pattern.rounds) {
      if (r.expanded) validRounds.push(r.expanded);
      else break;
    }
    if (validRounds.length === 0) return null;
    const layout = $pattern.shape === 'circular'
      ? layoutCircular(validRounds)
      : layoutFlat(validRounds);
    return {
      svg: renderSvg({ layout, showGrid: $showGrid }),
      width: layout.bounds.width,
      height: layout.bounds.height,
      totalRounds: validRounds.length,
    };
  });

  // SVG 컨테이너 ref — 렌더 후 g.round 요소에 직접 하이라이트 스타일 적용
  let svgWrap: HTMLDivElement | undefined = $state();
  const HIGHLIGHT_COLOR = '#2563eb';  // 현재 단 강조색 (파랑)

  $effect(() => {
    // 의존성 추적: rendered.svg(내용 변경), mode, currentRound
    void $mode;
    void $currentRound;
    void rendered?.svg;
    if (!svgWrap) return;
    const groups = svgWrap.querySelectorAll<SVGGElement>('g.round[data-round]');
    if ($mode !== 'read') {
      groups.forEach((g) => {
        g.style.opacity = '';
        g.style.strokeWidth = '';
        g.style.color = '';
      });
      return;
    }
    const cr = $currentRound;
    groups.forEach((g) => {
      const round = parseInt(g.dataset.round ?? '0', 10);
      if (round === cr) {
        g.style.opacity = '1';
        g.style.strokeWidth = '2.6';
        g.style.color = HIGHLIGHT_COLOR;
      } else if (round < cr) {
        g.style.opacity = '0.45';
        g.style.strokeWidth = '';
        g.style.color = '';
      } else {
        g.style.opacity = '0.18';
        g.style.strokeWidth = '';
        g.style.color = '';
      }
    });
  });

  function clamp(v: number): number {
    return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v));
  }
  function zoomIn() { zoom = clamp(+(zoom + ZOOM_STEP).toFixed(2)); }
  function zoomOut() { zoom = clamp(+(zoom - ZOOM_STEP).toFixed(2)); }
  function zoomReset() { zoom = 1; }

  function downloadSvg() {
    if (!rendered) return;
    const blob = new Blob([rendered.svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `crochet-chart-${new Date().toISOString().slice(0, 10)}.svg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
</script>

<div class="chart-viewer">
  <div class="toolbar">
    {#if $mode === 'read'}
      <button type="button" class="download-btn" onclick={downloadSvg} disabled={!rendered} aria-label="SVG 다운로드">
        📥 SVG 다운로드
      </button>
    {/if}
    <span class="spacer"></span>
    <button
      type="button"
      class="toggle-btn"
      class:active={$showGrid}
      onclick={() => showGrid.update((v) => !v)}
      aria-pressed={$showGrid}
      title={$showGrid ? '그리드 숨기기' : '그리드 표시'}
    >▦ 그리드</button>
    <span class="divider"></span>
    <button type="button" onclick={zoomOut} disabled={zoom <= ZOOM_MIN} aria-label="축소">−</button>
    <button type="button" onclick={zoomReset} aria-label="원본 크기">{Math.round(zoom * 100)}%</button>
    <button type="button" onclick={zoomIn} disabled={zoom >= ZOOM_MAX} aria-label="확대">+</button>
  </div>
  <div class="scroll-area">
    {#if rendered}
      <div
        class="svg-wrap"
        bind:this={svgWrap}
        style="width: {rendered.width * zoom}px; height: {rendered.height * zoom}px;"
      >
        {@html rendered.svg}
      </div>
    {:else}
      <p class="empty">도안 입력을 시작하세요</p>
    {/if}
  </div>
</div>

<style>
  .chart-viewer {
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    min-height: 300px;
  }
  .toolbar {
    display: flex;
    gap: 4px;
    padding: 6px 8px;
    border-bottom: 1px solid #eee;
    justify-content: flex-end;
    align-items: center;
  }
  .toolbar button {
    min-width: 32px;
    height: 26px;
    padding: 0 8px;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: white;
    font-size: 13px;
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    cursor: pointer;
    color: #333;
  }
  .toolbar button:hover:not(:disabled) {
    background: #f0f0f0;
    border-color: #888;
  }
  .toolbar button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .download-btn {
    font-family: system-ui, sans-serif !important;
  }
  .spacer {
    flex: 1;
  }
  .divider {
    width: 1px;
    height: 18px;
    background: #ddd;
    margin: 0 4px;
  }
  .toggle-btn {
    font-family: system-ui, sans-serif !important;
    min-width: auto !important;
    padding: 0 10px !important;
  }
  .toggle-btn.active {
    background: #e8f0ff !important;
    border-color: #6a98d9 !important;
    color: #2563eb !important;
  }
  .scroll-area {
    flex: 1;
    overflow: auto;
    padding: 16px;
    display: flex;
    align-items: flex-start;
    justify-content: center;
  }
  .svg-wrap :global(svg) {
    width: 100%;
    height: 100%;
    display: block;
  }
  .empty {
    color: #999;
    font-size: 14px;
    margin: auto;
  }
</style>
