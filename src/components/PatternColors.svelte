<script lang="ts">
  /**
   * 도안에 쓰인 색 목록 — 배색을 통째로 바꿔볼 때 쓴다.
   *
   * 색 하나를 클릭해 다른 색을 고르면 **도안 전체**에서 그 색으로 칠한 코가 한 번에
   * 바뀐다. 소스 텍스트를 직접 치환하므로 `:A` 같은 별칭 문법이 필요 없다.
   */
  import { usedColors, replaceColorEverywhere } from '$stores/tabs';
  import ColorPalette from './ColorPalette.svelte';

  let editing = $state<{ color: string; anchor: HTMLElement } | null>(null);
  const palette = $derived($usedColors.map((c) => c.color));
</script>

{#if $usedColors.length > 0}
  <div class="pattern-colors">
    <span class="label" title="도안에 쓰인 실 색. 클릭하면 그 색을 전부 바꿉니다">
      <i class="fa-solid fa-palette"></i> 배색
    </span>
    {#each $usedColors as entry (entry.color)}
      <button
        type="button"
        class="chip"
        onclick={(e) => (editing = { color: entry.color, anchor: e.currentTarget })}
        title="{entry.color} — {entry.count}코. 클릭하여 도안 전체에서 이 색 바꾸기"
      >
        <span class="dot" style="background: {entry.color}"></span>
        <span class="count">{entry.count}</span>
      </button>
    {/each}
  </div>
{/if}

{#if editing}
  <ColorPalette
    anchor={editing.anchor}
    current={editing.color}
    used={palette}
    onPick={(hex) => { replaceColorEverywhere(editing!.color, hex); editing = null; }}
    onClear={() => { replaceColorEverywhere(editing!.color, undefined); editing = null; }}
    onClose={() => (editing = null)}
  />
{/if}

<style>
  .pattern-colors {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
  }
  .label {
    font-size: 11px;
    color: var(--text-muted, #999);
    margin-right: 2px;
    white-space: nowrap;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px 2px 3px;
    border: 1px solid var(--border-light, #eee);
    border-radius: 999px;
    background: var(--bg-card, #fff);
    cursor: pointer;
    font-size: 10.5px;
    color: var(--text-secondary, #666);
  }
  .chip:hover {
    background: var(--bg-hover, #f4f1ec);
    border-color: var(--border, #e2e2e2);
  }
  .dot {
    width: 12px; height: 12px;
    border-radius: 50%;
    border: 1px solid rgba(0, 0, 0, 0.22);
    flex: none;
  }
  .count { font-variant-numeric: tabular-nums; }
</style>
