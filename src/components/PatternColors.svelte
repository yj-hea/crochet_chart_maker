<script lang="ts">
  /**
   * 도안 배색 목록.
   *
   * 앞쪽 세 칩은 **표시 옵션**이라 본문을 건드리지 않는다 (점선 테두리로 구분):
   *   빈칸 — 코가 없는 자리
   *   칸   — 코가 있는 자리의 배경 (실 색을 지정하지 않은 코)
   *   기호 — 실 색을 지정하지 않은 코의 기호 선
   *
   * 그 뒤는 본문에 `:색` 으로 적힌 실 색들이고, 색을 바꾸면 **도안 전체**에서
   * 그 색으로 칠한 코가 한 번에 바뀐다 (소스 텍스트를 직접 치환 — 별칭 문법 불필요).
   */
  import { usedColors, uncoloredCount, replaceColorEverywhere } from '$stores/tabs';
  import { mainColor, emptyColor, symbolColor } from '$stores/mode';
  import ColorPalette from './ColorPalette.svelte';
  import {
    DEFAULT_MAIN_COLOR,
    DEFAULT_EMPTY_COLOR,
    DEFAULT_SYMBOL_COLOR,
  } from '$lib/model/view-options';

  type Target = 'empty' | 'main' | 'symbol' | 'yarn';
  let editing = $state<{ kind: Target; color: string; anchor: HTMLElement } | null>(null);

  /** 표시 옵션 칩 — 배열 순서가 곧 화면 순서다 (빈칸이 항상 맨 앞) */
  const fixedChips = $derived([
    {
      kind: 'empty' as const, label: '빈칸', color: $emptyColor,
      title: `빈칸 색 (${$emptyColor}) — 코가 없는 자리 (대바늘 빈칸 / 코바늘 바탕)`,
    },
    {
      kind: 'main' as const, label: '칸', color: $mainColor,
      title: `칸 색 (${$mainColor}) — 실 색을 지정하지 않은 ${$uncoloredCount}코의 배경`,
    },
    {
      kind: 'symbol' as const, label: '기호', color: $symbolColor,
      title: `기호 색 (${$symbolColor}) — 실 색을 지정하지 않은 코의 기호 선`,
    },
  ]);

  const palette = $derived([
    $emptyColor, $mainColor, $symbolColor,
    ...$usedColors.map((c) => c.color),
  ]);

  const DEFAULTS: Record<Exclude<Target, 'yarn'>, string> = {
    empty: DEFAULT_EMPTY_COLOR,
    main: DEFAULT_MAIN_COLOR,
    symbol: DEFAULT_SYMBOL_COLOR,
  };
  const SETTERS = { empty: emptyColor, main: mainColor, symbol: symbolColor } as const;

  function pick(hex: string) {
    if (!editing) return;
    if (editing.kind === 'yarn') replaceColorEverywhere(editing.color, hex);
    else SETTERS[editing.kind].set(hex);
    editing = null;
  }

  function clear() {
    if (!editing) return;
    // 표시 옵션 색은 없앨 수 없다 — 기본값으로 되돌린다
    if (editing.kind === 'yarn') replaceColorEverywhere(editing.color, undefined);
    else SETTERS[editing.kind].set(DEFAULTS[editing.kind]);
    editing = null;
  }
</script>

<div class="pattern-colors">
  {#each fixedChips as chip (chip.kind)}
    <button
      type="button"
      class="chip fixed"
      onclick={(e) => (editing = { kind: chip.kind, color: chip.color, anchor: e.currentTarget })}
      title={chip.title}
    >
      <span class="dot" style="background: {chip.color}"></span>
      <span class="count">{chip.label}</span>
    </button>
  {/each}

  {#if $usedColors.length > 0}
    <span class="divider" aria-hidden="true"></span>
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
  {/if}
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
  .divider {
    width: 1px;
    align-self: stretch;
    margin: 2px 4px;
    background: var(--border-light, #eee);
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 7px 2px 3px;
    border: 1px solid var(--border-light, #eee);
    border-radius: 999px;
    background: var(--bg-card, #fff);
    cursor: pointer;
    font-size: 10.5px;
    color: var(--text-secondary, #666);
  }
  /* 표시 옵션 칩 — 본문을 고치지 않는다는 뜻으로 점선 */
  .chip.fixed { border-style: dashed; }
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
