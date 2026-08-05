<script lang="ts">
  /**
   * 도안 배색 목록.
   *
   * 두 묶음으로 나뉜다.
   *
   * **표시 색** (점선) — 실이 아니라 도안을 그리는 색. 본문을 건드리지 않는다:
   *   빈칸 — 코가 없는 자리
   *   칸   — 기호가 있는 모든 칸의 배경
   *   기호 — 실 색을 지정하지 않은 코를 그리는 잉크
   *
   * **배색** — 본문에 `:색` 으로 적힌 실 색들. 바꾸면 **도안 전체**에서 그 색으로
   * 칠한 코가 한 번에 바뀐다 (소스 텍스트를 직접 치환 — 별칭 문법 불필요).
   * 앞의 🪣 칩은 **아직 배색이 없는 코들**이고, 색을 고르면 그 코들에 한꺼번에
   * 배색이 붙어 이 목록에 칩이 하나 생긴다.
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

  /** 실이 아니라 도안을 그리는 색 — 본문을 건드리지 않는다 */
  const displayChips = $derived([
    {
      kind: 'empty' as const, label: '빈칸', color: $emptyColor,
      title: `빈칸 색 (${$emptyColor}) — 코가 없는 자리 (대바늘 빈칸 / 코바늘 바탕)`,
    },
    {
      kind: 'main' as const, label: '칸', color: $mainColor,
      title: `칸 색 (${$mainColor}) — 기호가 있는 모든 칸의 배경`,
    },
    {
      kind: 'symbol' as const, label: '기호', color: $symbolColor,
      title: `기호 색 (${$symbolColor}) — 실 색을 지정하지 않은 코를 그리는 잉크`,
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
  <!-- 표시 색 — 빈칸 / 칸 / 기호 -->
  {#each displayChips as chip (chip.kind)}
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

  <!-- 배색 — 아직 색이 없는 코들. 색을 고르면 목록에 칩이 하나 생긴다 -->
  {#if $uncoloredCount > 0}
    <button
      type="button"
      class="chip assign"
      onclick={(e) => (editing = { kind: 'assign', color: $symbolColor, anchor: e.currentTarget })}
      title="아직 배색이 없는 {$uncoloredCount}코 — 색을 고르면 한꺼번에 배색이 붙습니다"
    >
      <span class="dot empty-dot"></span>
      <span class="count">{$uncoloredCount}</span>
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
  /* 아직 배색이 없는 코들 — 색이 안 채워진 빈 동그라미.
     색을 고르면 이 자리가 채워진 원반으로 목록에 남는다. */
  .chip.assign { border-style: dashed; }
  .empty-dot {
    background: transparent;
    border-style: dashed;
    border-color: var(--text-muted, #999);
  }
  .chip.assign:hover .empty-dot { border-color: var(--text, #333); }
  .dot {
    width: 12px; height: 12px;
    border-radius: 50%;
    border: 1px solid rgba(0, 0, 0, 0.22);
    flex: none;
  }
  .count { font-variant-numeric: tabular-nums; }
</style>
