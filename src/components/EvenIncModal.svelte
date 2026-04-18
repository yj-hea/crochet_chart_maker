<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { evenIncDec, type BaseStitch } from '$lib/eveninc';

  interface Props {
    /** 기본값: 현재 활성 단의 totalProduce */
    defaultFrom?: number;
    onClose: () => void;
    /** 생성된 패턴을 현재 포커스 단 아래에 새 단으로 삽입 */
    onInsert: (pattern: string) => void;
  }
  let { defaultFrom, onClose, onInsert }: Props = $props();

  // 초기값으로만 사용 (모달이 열릴 때 한 번) — 이후엔 사용자가 자유롭게 편집
  const initialFrom = untrack(() => defaultFrom ?? 6);
  let from = $state<number>(initialFrom);
  let to = $state<number>(initialFrom + 6);
  let base = $state<BaseStitch>('x');
  let fromInput: HTMLInputElement | undefined = $state();

  const result = $derived(evenIncDec(from, to, base));

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

  const BASE_LABELS: Record<BaseStitch, string> = {
    x: '짧은뜨기 (X)',
    t: '긴뜨기 (T)',
    f: '한길긴뜨기 (F)',
    e: '두길긴뜨기 (E)',
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
      <div class="row">
        <label for="base-select">기본 코</label>
        <select id="base-select" bind:value={base}>
          {#each Object.entries(BASE_LABELS) as [k, label]}
            <option value={k}>{label}</option>
          {/each}
        </select>
      </div>

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
