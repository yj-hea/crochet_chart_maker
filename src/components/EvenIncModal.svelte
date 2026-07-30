<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import {
    evenIncDec,
    evenIncDecKnit,
    type BaseStitch,
    type KnitBase,
    type KnitIncMethod,
    type KnitDecMethod,
  } from '$lib/eveninc';
  import type { CraftId } from '$lib/crafts';

  interface Props {
    /** 기본값: 현재 활성 단의 totalProduce */
    defaultFrom?: number;
    /** 탭의 기법 — 대바늘은 늘림/줄임 방식을 고른다 */
    craft?: CraftId;
    onClose: () => void;
    /** 생성된 패턴을 현재 포커스 단 아래에 새 단으로 삽입 */
    onInsert: (pattern: string) => void;
  }
  let { defaultFrom, craft = 'crochet', onClose, onInsert }: Props = $props();
  const isKnit = $derived(craft === 'knit');

  // 초기값으로만 사용 (모달이 열릴 때 한 번) — 이후엔 사용자가 자유롭게 편집
  const initialFrom = untrack(() => defaultFrom ?? 6);
  let from = $state<number>(initialFrom);
  let to = $state<number>(initialFrom + 6);
  let base = $state<BaseStitch>('x');
  // 대바늘 옵션
  let knitBase = $state<KnitBase>('k');
  let knitInc = $state<KnitIncMethod>('m1l');
  let knitDec = $state<KnitDecMethod>('k2tog');
  let fromInput: HTMLInputElement | undefined = $state();

  const result = $derived(
    isKnit
      ? evenIncDecKnit(from, to, { base: knitBase, inc: knitInc, dec: knitDec })
      : evenIncDec(from, to, base),
  );
  const isIncrease = $derived(to > from);

  function handleKey(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
    if (e.key === 'Enter' && result.pattern) {
      e.preventDefault();
      handleInsert();
    }
  }

  onMount(() => {
    window.addEventListener('keydown', handleKey);
    tick().then(() => {
      fromInput?.focus();
      fromInput?.select();
    });
    return () => window.removeEventListener('keydown', handleKey);
  });

  function handleInsert() {
    if (!result.pattern || result.kind === 'invalid') return;
    onInsert(result.pattern);
  }

  async function copyPattern() {
    if (!result.pattern) return;
    try { await navigator.clipboard.writeText(result.pattern); } catch { /* ignore */ }
  }

  const KNIT_BASE_LABELS: Record<KnitBase, string> = {
    k: '겉뜨기 (k)',
    p: '안뜨기 (p)',
  };
  const KNIT_INC_LABELS: Record<KnitIncMethod, string> = {
    m1l: '왼코 늘리기 (m1l) — 구멍 없음',
    m1r: '오른코 늘리기 (m1r) — 구멍 없음',
    m1p: '안뜨기 늘리기 (m1p)',
    yo: '바늘비우기 (yo) — 구멍 남음',
    kfb: '코늘리기 (kfb) — 한 코에 2번',
  };
  const KNIT_DEC_LABELS: Record<KnitDecMethod, string> = {
    k2tog: '왼코겹치기 (k2tog) — 오른쪽으로 기욺',
    ssk: '오른코겹치기 (ssk) — 왼쪽으로 기욺',
  };

  const BASE_LABELS: Record<BaseStitch, string> = {
    x: '짧은뜨기 (X)',
    t: '긴뜨기 (T)',
    f: '한길긴뜨기 (F)',
    e: '두길긴뜨기 (E)',
    dtr: '세길긴뜨기 (DTR)',
  };
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="overlay" onclick={onClose} role="presentation">
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
    <header class="modal-header">
      <h2><i class="fa-solid fa-calculator"></i> 균등 증감 계산</h2>
      <button class="close-btn" onclick={onClose} aria-label="닫기"><i class="fa-solid fa-xmark"></i></button>
    </header>

    <div class="modal-body">
      <div class="row">
        <label for="from-count">이전 단 코수</label>
        <input
          id="from-count"
          type="number"
          min="1"
          bind:value={from}
          bind:this={fromInput}
        />
      </div>
      <div class="row">
        <label for="to-count">목표 코수</label>
        <input
          id="to-count"
          type="number"
          min="1"
          bind:value={to}
        />
      </div>
      {#if isKnit}
        <div class="row">
          <label for="knit-base">기본 코</label>
          <select id="knit-base" bind:value={knitBase}>
            {#each Object.entries(KNIT_BASE_LABELS) as [k, label] (k)}
              <option value={k}>{label}</option>
            {/each}
          </select>
        </div>
        {#if isIncrease}
          <div class="row">
            <label for="knit-inc">늘림 방식</label>
            <select id="knit-inc" bind:value={knitInc}>
              {#each Object.entries(KNIT_INC_LABELS) as [k, label] (k)}
                <option value={k}>{label}</option>
              {/each}
            </select>
          </div>
          <p class="hint">
            {knitInc === 'kfb'
              ? 'kfb 는 부모 코 하나를 소비합니다 (1코 → 2코).'
              : '코와 코 사이에서 새 코를 만들어 부모 코를 소비하지 않습니다.'}
          </p>
        {:else}
          <div class="row">
            <label for="knit-dec">줄임 방식</label>
            <select id="knit-dec" bind:value={knitDec}>
              {#each Object.entries(KNIT_DEC_LABELS) as [k, label] (k)}
                <option value={k}>{label}</option>
              {/each}
            </select>
          </div>
          <p class="hint">좌우 대칭으로 줄일 때는 한쪽은 k2tog, 다른 쪽은 ssk 를 씁니다.</p>
        {/if}
      {:else}
        <div class="row">
          <label for="base-select">기본 코</label>
          <select id="base-select" bind:value={base}>
            {#each Object.entries(BASE_LABELS) as [k, label] (k)}
              <option value={k}>{label}</option>
            {/each}
          </select>
        </div>
      {/if}

      <div class="preview">
        <div class="summary">{result.summary}</div>
        {#if result.pattern}
          <div class="pattern">
            <code>{result.pattern}</code>
            <button type="button" class="icon-btn" onclick={copyPattern} title="복사">
              <i class="fa-regular fa-copy"></i>
            </button>
          </div>
        {/if}
      </div>

      <div class="actions">
        <button type="button" class="btn" onclick={onClose}>닫기</button>
        <button
          type="button"
          class="btn btn-primary"
          disabled={!result.pattern || result.kind === 'invalid'}
          onclick={handleInsert}
        >
          <i class="fa-solid fa-plus"></i> 새 단으로 추가
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  .hint {
    margin: -4px 0 10px;
    font-size: 11.5px;
    line-height: 1.5;
    color: var(--text-secondary, #666);
  }
  .overlay {
    position: fixed; inset: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 1100;
    display: flex; align-items: center; justify-content: center;
    padding: 20px;
  }
  .modal {
    background: var(--bg-card);
    border-radius: var(--radius);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    max-width: 480px;
    width: 100%;
    overflow: hidden;
  }
  .modal-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 18px;
    border-bottom: 1px solid var(--border-light);
  }
  .modal-header h2 {
    margin: 0; font-size: 1rem; font-weight: 600;
    display: flex; align-items: center; gap: 8px;
  }
  .close-btn {
    background: transparent; border: none;
    font-size: 18px; color: var(--text-secondary);
    padding: 4px 8px; border-radius: var(--radius-sm);
    cursor: pointer;
  }
  .close-btn:hover { background: var(--bg-hover); }

  .modal-body {
    padding: 16px 18px 18px;
    display: flex; flex-direction: column; gap: 12px;
  }
  .row {
    display: grid;
    grid-template-columns: 110px 1fr;
    align-items: center;
    gap: 10px;
  }
  label {
    font-size: 13px;
    color: var(--text-secondary);
  }
  input, select {
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: 14px;
    font-family: inherit;
  }
  input:focus, select:focus {
    outline: 2px solid var(--border-focus);
    outline-offset: -1px;
  }
  .preview {
    background: var(--bg-warm);
    border: 1px solid var(--border-light);
    border-radius: var(--radius-sm);
    padding: 10px 12px;
    display: flex; flex-direction: column; gap: 6px;
    min-height: 60px;
  }
  .summary {
    font-size: 12px;
    color: var(--text-secondary);
  }
  .pattern {
    display: flex; align-items: center; justify-content: space-between;
    gap: 8px;
  }
  .pattern code {
    font-family: var(--font-mono);
    font-size: 13px;
    color: var(--text);
    background: transparent;
    padding: 0;
    flex: 1;
    word-break: break-all;
  }
  .icon-btn {
    width: 28px; height: 26px;
    border: 1px solid var(--border-light);
    border-radius: var(--radius-sm);
    background: var(--bg-card);
    cursor: pointer;
    color: var(--text-secondary);
    display: flex; align-items: center; justify-content: center;
  }
  .icon-btn:hover {
    background: var(--bg-hover);
    color: var(--text);
  }
  .actions {
    display: flex; justify-content: flex-end; gap: 8px;
    margin-top: 4px;
  }
  .btn {
    padding: 6px 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-card);
    color: var(--text);
    font-size: 13px;
    cursor: pointer;
    display: inline-flex; align-items: center; gap: 6px;
  }
  .btn:hover:not(:disabled) { background: var(--bg-hover); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-primary {
    background: var(--accent);
    color: #fff;
    border-color: var(--accent);
  }
  .btn-primary:hover:not(:disabled) { background: var(--accent-hover); }
</style>
