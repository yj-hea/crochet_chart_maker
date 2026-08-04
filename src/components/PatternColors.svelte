<script lang="ts">
  /**
   * 도안에 쓰인 색 목록 — 배색을 통째로 바꿔볼 때 쓴다.
   *
   * 색 하나를 클릭해 다른 색을 고르면 **도안 전체**에서 그 색으로 칠한 코가 한 번에
   * 바뀐다. 소스 텍스트를 직접 치환하므로 `:A` 같은 별칭 문법이 필요 없다.
   */
  import { usedColors, uncoloredCount, replaceColorEverywhere } from '$stores/tabs';
  import { mainColor, emptyColor } from '$stores/mode';
  import ColorPalette from './ColorPalette.svelte';
  import { DEFAULT_MAIN_COLOR, DEFAULT_EMPTY_COLOR } from '$lib/model/view-options';

  /**
   * 'main'  = 색을 지정하지 않은 코들의 기본색 (표시 옵션)
   * 'empty' = 코가 없는 자리의 색 (표시 옵션)
   * 'yarn'  = 본문에 `:색` 으로 적힌 실 색 (소스를 치환한다)
   */
  type Target = 'main' | 'empty' | 'yarn';
  let editing = $state<{ kind: Target; color: string; anchor: HTMLElement } | null>(null);
  const palette = $derived([$mainColor, $emptyColor, ...$usedColors.map((c) => c.color)]);

  function pick(hex: string) {
    if (!editing) return;
    if (editing.kind === 'main') mainColor.set(hex);
    else if (editing.kind === 'empty') emptyColor.set(hex);
    else replaceColorEverywhere(editing.color, hex);
    editing = null;
  }

  function clear() {
    if (!editing) return;
    // 메인·빈칸 색은 없앨 수 없다 — 기본값으로 되돌린다
    if (editing.kind === 'main') mainColor.set(DEFAULT_MAIN_COLOR);
    else if (editing.kind === 'empty') emptyColor.set(DEFAULT_EMPTY_COLOR);
    else replaceColorEverywhere(editing.color, undefined);
    editing = null;
  }
</script>

<div class="pattern-colors">
  <span class="label" title="도안에 쓰인 실 색. 클릭하면 그 색을 전부 바꿉니다">
    <i class="fa-solid fa-palette"></i> 배색
  </span>
  <!-- 메인 색 — 실 색을 따로 지정하지 않은 코들이 쓰는 기본색 -->
  <button
    type="button"
    class="chip main"
    onclick={(e) => (editing = { kind: 'main', color: $mainColor, anchor: e.currentTarget })}
    title="기본 색 ({$mainColor}) — 색을 지정하지 않은 {$uncoloredCount}코가 이 색으로 그려집니다"
  >
    <span class="dot" style="background: {$mainColor}"></span>
    <span class="count">기본 {$uncoloredCount}</span>
  </button>
  <!-- 빈칸 색 — 코가 없는 자리 -->
  <button
    type="button"
    class="chip main"
    onclick={(e) => (editing = { kind: 'empty', color: $emptyColor, anchor: e.currentTarget })}
    title="빈칸 색 ({$emptyColor}) — 코가 없는 자리 (대바늘 빈칸 / 코바늘 바탕)"
  >
    <span class="dot" style="background: {$emptyColor}"></span>
    <span class="count">빈칸</span>
  </button>
  {#each $usedColors as entry (entry.color)}
    <button
      type="button"
      class="chip"
      onclick={(e) => (editing = { kind: 'yarn', color: entry.color, anchor: e.currentTarget })}
      title="{entry.color} — {entry.count}코. 클릭하여 도안 전체에서 이 색 바꾸기"
    >
      <span class="dot" style="background: {entry.color}"></span>
      <span class="count">{entry.count}</span>
    </button>
  {/each}
</div>

{#if editing}
  <ColorPalette
    anchor={editing.anchor}
    current={editing.color}
    used={palette}
    onPick={pick}
    onClear={clear}
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
  .chip.main { border-style: dashed; }
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
