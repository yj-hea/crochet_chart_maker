<script lang="ts">
  import { pattern } from '$stores/pattern';
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
      svg: renderSvg({ layout, showGrid: true }),
      width: layout.bounds.width,
      height: layout.bounds.height,
    };
  });

  function clamp(v: number): number {
    return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v));
  }
  function zoomIn() { zoom = clamp(+(zoom + ZOOM_STEP).toFixed(2)); }
  function zoomOut() { zoom = clamp(+(zoom - ZOOM_STEP).toFixed(2)); }
  function zoomReset() { zoom = 1; }
</script>

<div class="chart-viewer">
  <div class="toolbar">
    <button type="button" onclick={zoomOut} disabled={zoom <= ZOOM_MIN} aria-label="축소">−</button>
    <button type="button" onclick={zoomReset} aria-label="원본 크기">{Math.round(zoom * 100)}%</button>
    <button type="button" onclick={zoomIn} disabled={zoom >= ZOOM_MAX} aria-label="확대">+</button>
  </div>
  <div class="scroll-area">
    {#if rendered}
      <div class="svg-wrap" style="width: {rendered.width * zoom}px; height: {rendered.height * zoom}px;">
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
