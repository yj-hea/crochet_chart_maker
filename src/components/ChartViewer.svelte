<script lang="ts">
  import { pattern } from '$stores/pattern';
  import { layoutCircular } from '$lib/layout/circular';
  import { layoutFlat } from '$lib/layout/flat';
  import { renderSvg } from '$lib/render/svg';
  import type { ExpandedRound } from '$lib/expand/op';

  const svg = $derived.by(() => {
    const validRounds: ExpandedRound[] = [];
    for (const r of $pattern.rounds) {
      if (r.expanded) validRounds.push(r.expanded);
      else break; // 이전 단이 미완성/오류면 다음 단은 그리지 않음
    }
    if (validRounds.length === 0) return '';
    const layout = $pattern.shape === 'circular'
      ? layoutCircular(validRounds)
      : layoutFlat(validRounds);
    return renderSvg({ layout, showGrid: true });
  });
</script>

<div class="chart-viewer">
  {#if svg}
    {@html svg}
  {:else}
    <p class="empty">도안 입력을 시작하세요</p>
  {/if}
</div>

<style>
  .chart-viewer {
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    padding: 16px;
    overflow: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 300px;
  }
  .chart-viewer :global(svg) {
    max-width: 100%;
    height: auto;
  }
  .empty {
    color: #999;
    font-size: 14px;
  }
</style>
