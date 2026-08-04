<script lang="ts">
  /**
   * 색 고르기 팝오버.
   *
   * 색 스와치 클릭·선택 범위 칠하기·팔레트 일괄 교체가 모두 이걸 쓴다.
   * "이 도안에서 쓴 색"을 먼저 보여줘야 배색 도안에서 같은 실을 다시 고르기 쉽다.
   */
  import { onMount, untrack } from 'svelte';
  import { NAMED_COLORS, resolveColorValue } from '$lib/model/colors';
  import { placeDropdown } from '$lib/dropdown-place';

  interface Props {
    /** 기준 요소 — 이 아래에 팝오버를 띄운다 */
    anchor: HTMLElement | undefined;
    /** 현재 선택된 색 (hex). 없으면 미지정 */
    current?: string;
    /** 이 도안에서 이미 쓰인 색 (많이 쓰인 순) */
    used?: readonly string[];
    /** '색 없음' 선택지를 보일지 */
    allowClear?: boolean;
    onPick: (hex: string) => void;
    onClear?: () => void;
    onClose: () => void;
  }
  let { anchor, current, used = [], allowClear = true, onPick, onClear, onClose }: Props = $props();

  let popover: HTMLDivElement | undefined = $state();
  // 팝오버는 열릴 때 한 번 뜨고 닫히므로 초기값만 반영하면 된다
  let hexInput = $state(untrack(() => current) ?? '');
  let hexError = $state(false);

  // 이름 있는 색 — grey 는 gray 와 같은 값이라 뺀다
  const NAMED = Object.entries(NAMED_COLORS).filter(([name]) => name !== 'grey');
  /** 이미 쓴 색 중 기본 팔레트에 없는 것만 따로 보여준다 (중복 방지) */
  const extraUsed = $derived(used.filter((c) => !NAMED.some(([, v]) => v === c)));

  function place() {
    placeDropdown(anchor, popover, 'left');
  }

  onMount(() => {
    queueMicrotask(place);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  });

  function submitHex() {
    const resolved = resolveColorValue(hexInput);
    if (!resolved) { hexError = true; return; }
    hexError = false;
    onPick(resolved);
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="backdrop" onclick={onClose} role="presentation"></div>
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="palette" bind:this={popover} onclick={(e) => e.stopPropagation()} role="dialog" tabindex="-1" aria-label="색 고르기">
  {#if extraUsed.length > 0}
    <div class="section-label">이 도안에서 쓴 색</div>
    <div class="swatches">
      {#each extraUsed as hex (hex)}
        <button
          type="button"
          class="swatch"
          class:selected={hex === current}
          style="background: {hex}"
          title={hex}
          aria-label={hex}
          onclick={() => onPick(hex)}
        ></button>
      {/each}
    </div>
  {/if}

  <div class="section-label">기본 색</div>
  <div class="swatches">
    {#each NAMED as [name, hex] (name)}
      <button
        type="button"
        class="swatch"
        class:selected={hex === current}
        style="background: {hex}"
        title="{name} ({hex})"
        aria-label={name}
        onclick={() => onPick(hex)}
      ></button>
    {/each}
  </div>

  <div class="custom">
    <input
      type="color"
      class="native"
      value={resolveColorValue(hexInput) ?? current ?? '#888888'}
      oninput={(e) => { hexInput = e.currentTarget.value; hexError = false; }}
      onchange={(e) => onPick(e.currentTarget.value)}
      aria-label="색 직접 고르기"
    />
    <input
      type="text"
      class="hex"
      class:err={hexError}
      bind:value={hexInput}
      placeholder="#aaccff / navy"
      onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitHex(); } }}
      aria-label="색 코드 입력"
    />
    <button type="button" class="apply" onclick={submitHex}>적용</button>
  </div>

  {#if allowClear && onClear}
    <button type="button" class="clear" onclick={onClear}>
      <i class="fa-solid fa-ban"></i> 색 없애기
    </button>
  {/if}
</div>

<style>
  .backdrop {
    position: fixed; inset: 0;
    z-index: 1190;
  }
  .palette {
    position: fixed;
    z-index: 1200;
    background: var(--bg-card, #fff);
    border: 1px solid var(--border, #e2e2e2);
    border-radius: var(--radius, 8px);
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.18);
    padding: 10px;
    width: 232px;
    display: flex; flex-direction: column; gap: 6px;
  }
  .section-label {
    font-size: 10.5px;
    color: var(--text-muted, #999);
    margin-top: 2px;
  }
  .swatches {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 4px;
  }
  .swatch {
    width: 100%;
    aspect-ratio: 1;
    border: 1px solid rgba(0, 0, 0, 0.18);
    border-radius: 4px;
    cursor: pointer;
    padding: 0;
  }
  .swatch:hover { transform: scale(1.12); }
  .swatch.selected {
    outline: 2px solid var(--accent, #7a5c3e);
    outline-offset: 1px;
  }
  .custom {
    display: flex; align-items: center; gap: 4px;
    margin-top: 4px;
  }
  .native {
    width: 26px; height: 26px;
    padding: 0; border: 1px solid var(--border, #e2e2e2);
    border-radius: 4px; background: none; cursor: pointer;
    flex: none;
  }
  .hex {
    flex: 1; min-width: 0;
    padding: 4px 6px;
    border: 1px solid var(--border, #e2e2e2);
    border-radius: 4px;
    font-size: 12px;
    font-family: var(--font-mono, monospace);
  }
  .hex.err { border-color: var(--danger, #c0392b); }
  .apply, .clear {
    padding: 4px 8px;
    border: 1px solid var(--border, #e2e2e2);
    border-radius: 4px;
    background: var(--bg-card, #fff);
    color: var(--text-secondary, #666);
    font-size: 11.5px;
    cursor: pointer;
    flex: none;
  }
  .apply:hover, .clear:hover { background: var(--bg-hover, #f4f1ec); color: var(--text, #333); }
  .clear {
    width: 100%;
    display: inline-flex; align-items: center; justify-content: center; gap: 5px;
    margin-top: 2px;
  }
</style>
