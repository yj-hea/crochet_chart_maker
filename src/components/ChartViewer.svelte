<script lang="ts">
  import { pattern } from '$stores/pattern';
  import { mode, currentRound, showGrid } from '$stores/mode';
  import { layoutCircular } from '$lib/layout/circular';
  import { layoutFlat } from '$lib/layout/flat';
  import { renderSvg } from '$lib/render/svg';
  import type { ExpandedRound } from '$lib/expand/op';
  import ZoomModal from './ZoomModal.svelte';

  let modalOpen = $state(false);

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
  const HIGHLIGHT_COLOR = '#2563eb';

  $effect(() => {
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
      <button type="button" class="tool-btn download-btn" onclick={downloadSvg} disabled={!rendered}>
        📥 SVG 다운로드
      </button>
    {/if}
    <span class="spacer"></span>
    <button
      type="button"
      class="tool-btn toggle-btn"
      class:active={$showGrid}
      onclick={() => showGrid.update((v) => !v)}
      aria-pressed={$showGrid}
      title={$showGrid ? '그리드 숨기기' : '그리드 표시'}
    >▦ 그리드</button>
  </div>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="scroll-area"
    ondblclick={() => { if (rendered) modalOpen = true; }}
    title={rendered ? '더블클릭으로 확대' : ''}
  >
    {#if rendered}
      <div class="svg-wrap" bind:this={svgWrap}>
        {@html rendered.svg}
      </div>
    {:else}
      <p class="empty">도안 입력을 시작하세요</p>
    {/if}
  </div>
</div>

{#if modalOpen && rendered}
  <ZoomModal
    svg={rendered.svg}
    svgWidth={rendered.width}
    svgHeight={rendered.height}
    onClose={() => { modalOpen = false; }}
  />
{/if}

<style>
  .chart-viewer {
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    min-height: 300px;
    flex: 1;           /* 부모 pane 안에서 남은 공간 채움 */
    min-height: 0;     /* flex shrink 허용 */
  }
  .toolbar {
    display: flex;
    gap: 4px;
    padding: 6px 8px;
    border-bottom: 1px solid #eee;
    justify-content: flex-end;
    align-items: center;
  }
  .tool-btn {
    height: 26px;
    padding: 0 10px;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: white;
    font-size: 13px;
    cursor: pointer;
    color: #333;
  }
  .tool-btn:hover:not(:disabled) {
    background: #f0f0f0;
    border-color: #888;
  }
  .tool-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .download-btn {
    font-family: system-ui, sans-serif;
  }
  .spacer {
    flex: 1;
  }
  .toggle-btn {
    font-family: system-ui, sans-serif;
  }
  .toggle-btn.active {
    background: #e8f0ff;
    border-color: #6a98d9;
    color: #2563eb;
  }
  .scroll-area {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    padding: 16px;
    position: relative;
    cursor: zoom-in;
  }
  .svg-wrap {
    position: absolute;
    inset: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .svg-wrap :global(svg) {
    max-width: 100%;
    max-height: 100%;
    display: block;
  }
  .empty {
    color: #999;
    font-size: 14px;
    margin: auto;
    cursor: default;
  }
</style>
