<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import {
    planShortRows,
    type ShortRowTurn,
    type ShortRowSide,
  } from '$lib/crafts/knit/shortrow';
  import type { KnitBase } from '$lib/eveninc';

  interface Props {
    /** 기본값: 현재 활성 단의 totalProduce */
    defaultTotal?: number;
    onClose: () => void;
    /** 생성된 단들을 현재 포커스 단 아래에 차례로 삽입 */
    onInsert: (sources: string[]) => void;
  }
  let { defaultTotal, onClose, onInsert }: Props = $props();

  let total = $state<number>(untrack(() => defaultTotal ?? 20));
  let step = $state(3);
  let repeats = $state(3);
  let side = $state<ShortRowSide>('both');
  let turn = $state<ShortRowTurn>('wt');
  let base = $state<KnitBase>('k');
  let alternate = $state(true);
  let resolve = $state(true);
  let totalInput: HTMLInputElement | undefined = $state();

  const result = $derived(
    planShortRows({ total, step, repeats, side, turn, base, alternate, resolve }),
  );

  function handleKey(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
    if (e.key === 'Enter' && result.kind === 'ok') {
      e.preventDefault();
      handleInsert();
    }
  }

  onMount(() => {
    window.addEventListener('keydown', handleKey);
    tick().then(() => {
      totalInput?.focus();
      totalInput?.select();
    });
    return () => window.removeEventListener('keydown', handleKey);
  });

  function handleInsert() {
    if (result.kind !== 'ok') return;
    onInsert(result.rows.map((r) => r.source));
  }

  async function copyRows() {
    if (result.kind !== 'ok') return;
    try {
      await navigator.clipboard.writeText(result.rows.map((r) => r.source).join('\n'));
    } catch { /* ignore */ }
  }

  const SIDE_LABELS: Record<ShortRowSide, string> = {
    both: '양쪽 번갈아 — 뒷목 올리기, 힐, 요크',
    one: '한쪽만 — 어깨 경사',
  };
  const TURN_LABELS: Record<ShortRowTurn, string> = {
    wt: '감아 되돌리기 (w&t) — 감는 코가 그 단에 포함',
    ds: '독일식 (ds) — 다음 단 첫 코가 이중코',
    plain: '그냥 돌리기 — 기호 없이 unw 만',
  };
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="overlay" onclick={onClose} role="presentation">
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
    <header class="modal-header">
      <h2><i class="fa-solid fa-arrow-turn-down"></i> 되돌아뜨기 계산</h2>
      <button class="close-btn" onclick={onClose} aria-label="닫기"><i class="fa-solid fa-xmark"></i></button>
    </header>

    <div class="modal-body">
      <p class="lead">
        <code>unw</code> 는 <b>뜨는 순서</b> 기준으로 적습니다 —
        시작 전에 이미 지나온 코는 줄 앞, 끝까지 가지 않아 남긴 코는 줄 뒤.
        이 위치가 단마다 좌우로 바뀌므로 여기서 자동으로 계산합니다.
      </p>

      <div class="row">
        <label for="sr-total">전체 코수</label>
        <input id="sr-total" type="number" min="2" bind:value={total} bind:this={totalInput} />
      </div>
      <div class="row">
        <label for="sr-step">한 번에 남길 코</label>
        <input id="sr-step" type="number" min="1" bind:value={step} />
      </div>
      <div class="row">
        <label for="sr-repeats">되돌리는 횟수</label>
        <input id="sr-repeats" type="number" min="1" bind:value={repeats} />
      </div>
      <div class="row">
        <label for="sr-side">모양</label>
        <select id="sr-side" bind:value={side}>
          {#each Object.entries(SIDE_LABELS) as [k, label] (k)}
            <option value={k}>{label}</option>
          {/each}
        </select>
      </div>
      <div class="row">
        <label for="sr-turn">되돌리는 방법</label>
        <select id="sr-turn" bind:value={turn}>
          {#each Object.entries(TURN_LABELS) as [k, label] (k)}
            <option value={k}>{label}</option>
          {/each}
        </select>
      </div>
      <div class="row">
        <label for="sr-base">첫 단 기본 코</label>
        <select id="sr-base" bind:value={base}>
          <option value="k">겉뜨기 (k)</option>
          <option value="p">안뜨기 (p)</option>
        </select>
      </div>
      <div class="checks">
        <label class="check">
          <input type="checkbox" bind:checked={alternate} />
          단마다 겉/안 교대 (메리야스) — 끄면 모두 같은 코 (가터·원통)
        </label>
        <label class="check">
          <input type="checkbox" bind:checked={resolve} />
          되돌린 코를 되살리는 마무리 단 포함
        </label>
      </div>

      <div class="preview">
        <div class="summary" class:err={result.kind === 'invalid'}>{result.summary}</div>
        {#if result.warning}
          <div class="warn"><i class="fa-solid fa-triangle-exclamation"></i> {result.warning}</div>
        {/if}
        {#if result.kind === 'ok'}
          <div class="rows">
            {#each result.rows as row, i (i)}
              <div class="prow">
                <code>{row.source}</code>
                <span class="note">{row.note}</span>
              </div>
            {/each}
          </div>
          <button type="button" class="copy-btn" onclick={copyRows}>
            <i class="fa-regular fa-copy"></i> 전체 복사
          </button>
        {/if}
      </div>

      <div class="actions">
        <button type="button" class="btn" onclick={onClose}>닫기</button>
        <button
          type="button"
          class="btn btn-primary"
          disabled={result.kind !== 'ok'}
          onclick={handleInsert}
        >
          <i class="fa-solid fa-plus"></i> {result.rows.length}개 단으로 추가
        </button>
      </div>
    </div>
  </div>
</div>

<style>
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
    max-width: 520px;
    width: 100%;
    max-height: 90vh;
    display: flex; flex-direction: column;
    overflow: hidden;
  }
  .modal-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 18px;
    border-bottom: 1px solid var(--border-light);
    flex: none;
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
    display: flex; flex-direction: column; gap: 10px;
    overflow-y: auto;
  }
  .lead {
    margin: 0 0 4px;
    font-size: 12px; line-height: 1.6;
    color: var(--text-secondary);
  }
  .lead code {
    font-family: var(--font-mono);
    background: var(--bg-warm);
    padding: 0 3px; border-radius: 3px;
  }
  .row {
    display: grid;
    grid-template-columns: 110px 1fr;
    align-items: center;
    gap: 10px;
  }
  label { font-size: 13px; color: var(--text-secondary); }
  input[type='number'], select {
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: 14px;
    font-family: inherit;
    min-width: 0;
  }
  input:focus, select:focus {
    outline: 2px solid var(--border-focus);
    outline-offset: -1px;
  }
  .checks { display: flex; flex-direction: column; gap: 6px; }
  .check {
    display: flex; align-items: center; gap: 7px;
    font-size: 12px;
    cursor: pointer;
  }
  .preview {
    background: var(--bg-warm);
    border: 1px solid var(--border-light);
    border-radius: var(--radius-sm);
    padding: 10px 12px;
    display: flex; flex-direction: column; gap: 8px;
  }
  .summary { font-size: 12px; color: var(--text-secondary); }
  .summary.err { color: var(--danger, #c0392b); }
  .warn {
    font-size: 11.5px; line-height: 1.5;
    color: var(--danger, #c0392b);
  }
  .rows { display: flex; flex-direction: column; gap: 3px; }
  .prow {
    display: flex; align-items: baseline; gap: 10px;
    justify-content: space-between;
  }
  .prow code {
    font-family: var(--font-mono);
    font-size: 12.5px;
    color: var(--text);
    word-break: break-all;
  }
  .note {
    font-size: 11px;
    color: var(--text-secondary);
    white-space: nowrap;
    flex: none;
  }
  .copy-btn {
    align-self: flex-start;
    padding: 4px 10px;
    border: 1px solid var(--border-light);
    border-radius: var(--radius-sm);
    background: var(--bg-card);
    color: var(--text-secondary);
    font-size: 11.5px;
    cursor: pointer;
  }
  .copy-btn:hover { background: var(--bg-hover); color: var(--text); }
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
