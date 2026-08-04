<script lang="ts">
  /**
   * 도안 배색 목록.
   *
   * 두 묶음으로 나뉜다.
   *
   * **기본 배경색** — 코를 칠하는 색이 아니라 도안의 바탕:
   *   빈칸 — 코가 없는 자리
   *   칸   — 기호가 있는 모든 칸의 배경
   *
   * **배색** — 실 색:
   *   기호 — 실 색을 지정하지 않은 코의 색 (= 기본 실 색)
   *   그 뒤 — 본문에 `:색` 으로 적힌 실 색들. 바꾸면 **도안 전체**에서 그 색으로
   *           칠한 코가 한 번에 바뀐다 (소스 텍스트를 직접 치환 — 별칭 문법 불필요)
   *
   * 점선 테두리 = 표시 옵션이라 본문을 건드리지 않는다는 뜻.
   */
  import {
    usedColors,
    uncoloredCount,
    replaceColorEverywhere,
    assignDefaultColorEverywhere,
  } from '$stores/tabs';
  import { mainColor, emptyColor, symbolColor } from '$stores/mode';
  import ColorPalette from './ColorPalette.svelte';
  import {
    DEFAULT_MAIN_COLOR,
    DEFAULT_EMPTY_COLOR,
    DEFAULT_SYMBOL_COLOR,
  } from '$lib/model/view-options';

  /**
   * 'assign' 은 색을 고르는 대상이 아니라 **동작**이다 —
   * 실 색을 지정하지 않은 코 전부에 `:색` 을 본문에 넣어 정식 실 색으로 승격시킨다.
   */
  type Target = 'empty' | 'main' | 'symbol' | 'yarn' | 'assign';
  let editing = $state<{ kind: Target; color: string; anchor: HTMLElement } | null>(null);

  /** 도안의 바탕 — 코를 칠하는 색이 아니다 */
  const backgroundChips = $derived([
    {
      kind: 'empty' as const, label: '빈칸', color: $emptyColor,
      title: `빈칸 색 (${$emptyColor}) — 코가 없는 자리 (대바늘 빈칸 / 코바늘 바탕)`,
    },
    {
      kind: 'main' as const, label: '칸', color: $mainColor,
      title: `칸 색 (${$mainColor}) — 기호가 있는 모든 칸의 배경`,
    },
  ]);

  const palette = $derived([
    $emptyColor, $mainColor, $symbolColor,
    ...$usedColors.map((c) => c.color),
  ]);

  /** 표시 옵션 색의 기본값 — 'yarn'(본문 색) 과 'assign'(동작) 은 대상이 아니다 */
  const DEFAULTS: Record<'empty' | 'main' | 'symbol', string> = {
    empty: DEFAULT_EMPTY_COLOR,
    main: DEFAULT_MAIN_COLOR,
    symbol: DEFAULT_SYMBOL_COLOR,
  };
  const SETTERS = { empty: emptyColor, main: mainColor, symbol: symbolColor } as const;

  function pick(hex: string) {
    if (!editing) return;
    if (editing.kind === 'assign') assignDefaultColorEverywhere(hex);
    else if (editing.kind === 'yarn') replaceColorEverywhere(editing.color, hex);
    else SETTERS[editing.kind as keyof typeof SETTERS].set(hex);
    editing = null;
  }

  function clear() {
    if (!editing) return;
    if (editing.kind === 'assign') { editing = null; return; } // 지울 대상이 없다
    // 표시 옵션 색은 없앨 수 없다 — 기본값으로 되돌린다
    if (editing.kind === 'yarn') replaceColorEverywhere(editing.color, undefined);
    else {
      const key = editing.kind as keyof typeof SETTERS;
      SETTERS[key].set(DEFAULTS[key]);
    }
    editing = null;
  }
</script>

<div class="pattern-colors">
  <!-- 기본 배경색 -->
  {#each backgroundChips as chip (chip.kind)}
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

  <span class="divider" aria-hidden="true"></span>

  <!-- 배색 — 기본 실 색(기호) 부터 -->
  <button
    type="button"
    class="chip fixed"
    onclick={(e) => (editing = { kind: 'symbol', color: $symbolColor, anchor: e.currentTarget })}
    title="기본 실 색 ({$symbolColor}) — 실 색을 지정하지 않은 {$uncoloredCount}코"
  >
    <span class="dot" style="background: {$symbolColor}"></span>
    <span class="count">기호 {$uncoloredCount}</span>
  </button>
  {#if $uncoloredCount > 0}
    <button
      type="button"
      class="assign-btn"
      onclick={(e) => (editing = { kind: 'assign', color: $symbolColor, anchor: e.currentTarget })}
      title="색 없는 {$uncoloredCount}코에 실 색 지정 — 본문에 :색 을 넣어 정식 실 색으로 만듭니다"
      aria-label="색 없는 코에 실 색 지정"
    >
      <i class="fa-solid fa-fill-drip"></i>
    </button>
  {/if}
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
  /* 색 없는 코에 실 색을 넣는 동작 — 색을 고르는 칩이 아니라 버튼이다 */
  .assign-btn {
    display: inline-flex; align-items: center; justify-content: center;
    width: 20px; height: 20px;
    margin-left: -2px;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--text-muted, #999);
    font-size: 10px;
    cursor: pointer;
  }
  .assign-btn:hover { background: var(--bg-hover, #f4f1ec); color: var(--text, #333); }
  .dot {
    width: 12px; height: 12px;
    border-radius: 50%;
    border: 1px solid rgba(0, 0, 0, 0.22);
    flex: none;
  }
  .count { font-variant-numeric: tabular-nums; }
</style>
