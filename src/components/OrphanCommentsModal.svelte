<script lang="ts">
  /**
   * 단과의 연결이 끊긴 메모를 골라 다시 붙이는 창.
   *
   * 원래 어느 단에 붙어 있었는지는 저장돼 있지 않아서 자동으로 붙이지 않는다 —
   * 메모마다 붙일 단을 고르거나, 필요 없으면 지운다. 목록이 비면 스스로 닫힌다.
   */
  import { onMount } from 'svelte';
  import { orphanComments, reattachComment, deleteComment, workspace } from '$stores/tabs';

  interface Props {
    onClose: () => void;
  }
  let { onClose }: Props = $props();

  const activeTab = $derived($workspace.tabs.find((t) => t.id === $workspace.activeTabId));

  /** 이미 메모가 달린 단 — 고르면 그 메모 뒤에 이어 붙는다 */
  const roundsWithMemo = $derived(new Set(
    (activeTab?.comments ?? []).flatMap((c) => (c.target.kind === 'round' ? [c.target.roundId] : [])),
  ));

  const roundOptions = $derived((activeTab?.rounds ?? []).map((r, i) => {
    const body = r.source.trim() ? ` — ${oneLine(r.source, 24)}` : '';
    const note = roundsWithMemo.has(r.id) ? ' (메모 있음 · 뒤에 이어 붙임)' : '';
    return { id: r.id, label: `${i + 1}단${body}${note}` };
  }));

  /** 메모마다 고른 단 id */
  let choice = $state<Record<string, string>>({});

  function oneLine(s: string, max: number): string {
    const flat = s.replace(/\s+/g, ' ').trim();
    return flat.length > max ? `${flat.slice(0, max)}…` : flat;
  }

  function attach(id: string) {
    const roundId = choice[id];
    if (roundId) reattachComment(id, roundId);
  }

  function remove(id: string, text: string) {
    const preview = text.trim() ? `\n\n${oneLine(text, 60)}` : '';
    if (window.confirm(`이 메모를 삭제할까요?${preview}`)) deleteComment(id);
  }

  // 전부 붙이거나 지우면 닫는다
  $effect(() => {
    if ($orphanComments.length === 0) onClose();
  });

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
  onMount(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="overlay" onclick={onClose} role="presentation">
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
    <header class="modal-header">
      <h2><i class="fa-solid fa-link-slash"></i> 연결이 끊긴 메모 {$orphanComments.length}개</h2>
      <button class="close-btn" onclick={onClose} aria-label="닫기"><i class="fa-solid fa-xmark"></i></button>
    </header>

    <div class="modal-body">
      <p class="hint">
        새로고침하면서 붙어 있던 단을 잃은 메모입니다. 원래 어느 단이었는지는 저장돼 있지 않아
        자동으로 붙이지 않았어요 — 메모마다 붙일 단을 골라 주세요.
      </p>

      <ul class="list">
        {#each $orphanComments as c (c.id)}
          <li class="item">
            <div class="text" class:empty={!c.text.trim()}>{c.text.trim() ? c.text : '(빈 메모)'}</div>
            <div class="actions">
              <select
                value={choice[c.id] ?? ''}
                onchange={(e) => (choice[c.id] = e.currentTarget.value)}
                aria-label="붙일 단"
              >
                <option value="" disabled>붙일 단 선택…</option>
                {#each roundOptions as o (o.id)}
                  <option value={o.id}>{o.label}</option>
                {/each}
              </select>
              <button class="btn btn-primary" disabled={!choice[c.id]} onclick={() => attach(c.id)}>
                <i class="fa-solid fa-link"></i> 붙이기
              </button>
              <button class="btn icon" onclick={() => remove(c.id, c.text)} title="메모 삭제" aria-label="메모 삭제">
                <i class="fa-regular fa-trash-can"></i>
              </button>
            </div>
          </li>
        {/each}
      </ul>
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
    max-width: 560px;
    width: 100%;
    max-height: calc(100vh - 40px);
    display: flex; flex-direction: column;
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
    padding: 14px 18px 18px;
    display: flex; flex-direction: column; gap: 12px;
    overflow-y: auto;
  }
  .hint {
    margin: 0;
    font-size: 12px;
    line-height: 1.55;
    color: var(--text-secondary, #666);
  }
  .list {
    list-style: none; margin: 0; padding: 0;
    display: flex; flex-direction: column; gap: 10px;
  }
  .item {
    border: 1px solid var(--border-light);
    border-radius: var(--radius-sm);
    padding: 10px 12px;
    display: flex; flex-direction: column; gap: 8px;
  }
  .text {
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 13px;
    line-height: 1.5;
    max-height: 7.5em;
    overflow-y: auto;
  }
  .text.empty { color: var(--text-secondary, #888); font-style: italic; }
  .actions {
    display: flex; align-items: center; gap: 6px;
  }
  select {
    flex: 1; min-width: 0;
    padding: 5px 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-card);
    color: var(--text);
    font-size: 13px;
  }
  .btn {
    padding: 6px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-card);
    color: var(--text);
    font-size: 13px;
    cursor: pointer;
    display: inline-flex; align-items: center; gap: 6px;
    white-space: nowrap;
  }
  .btn.icon { padding: 6px 9px; }
  .btn:hover:not(:disabled) { background: var(--bg-hover); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-primary {
    background: var(--accent);
    color: #fff;
    border-color: var(--accent);
  }
  .btn-primary:hover:not(:disabled) { background: var(--accent-hover); }
</style>
