<script lang="ts">
  import { onMount, tick } from 'svelte';
  import {
    defaultSaveName,
    saveToDropbox,
    checkExisting,
    normalizeSavePath,
  } from '$stores/dropbox';

  interface Props {
    onClose: () => void;
    onSaved: (path: string) => void;
  }
  let { onClose, onSaved }: Props = $props();

  const initialName = defaultSaveName();
  let filename = $state(initialName);
  let busy = $state(false);
  let error = $state<string | null>(null);
  let confirmOverwrite = $state<{ path: string } | null>(null);
  let inputEl: HTMLInputElement | undefined = $state();

  onMount(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', handleKey);
    // 파일명 앞부분(확장자 제외) 선택
    tick().then(() => {
      if (!inputEl) return;
      const dot = initialName.indexOf('.');
      inputEl.focus();
      inputEl.setSelectionRange(0, dot > 0 ? dot : initialName.length);
    });
    return () => window.removeEventListener('keydown', handleKey);
  });

  async function handleSubmit(e?: Event) {
    e?.preventDefault();
    if (busy) return;
    error = null;
    busy = true;
    try {
      const path = normalizeSavePath(filename);
      // 이름을 수정하지 않은 상태 & 기존 파일 존재 → 덮어쓰기 확인
      if (filename.trim() === initialName.trim()) {
        const rev = await checkExisting(path);
        if (rev) {
          confirmOverwrite = { path };
          busy = false;
          return;
        }
      } else {
        // 이름 수정된 경우에도 같은 이름 존재하면 확인
        const rev = await checkExisting(path);
        if (rev) {
          confirmOverwrite = { path };
          busy = false;
          return;
        }
      }
      const saved = await saveToDropbox(path, false);
      onSaved(saved);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      busy = false;
    }
  }

  async function confirmAndOverwrite() {
    if (!confirmOverwrite) return;
    busy = true;
    error = null;
    try {
      const saved = await saveToDropbox(confirmOverwrite.path, true);
      onSaved(saved);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      busy = false;
      confirmOverwrite = null;
    }
  }

  function cancelOverwrite() {
    confirmOverwrite = null;
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="overlay" onclick={() => (!busy ? onClose() : null)} role="presentation">
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="modal" role="dialog" aria-modal="true" tabindex="-1" onclick={(e) => e.stopPropagation()}>
    <header class="modal-header">
      <h2><i class="fa-brands fa-dropbox"></i> Dropbox 에 저장</h2>
      <button class="close-btn" onclick={onClose} aria-label="닫기" disabled={busy}>
        <i class="fa-solid fa-xmark"></i>
      </button>
    </header>

    {#if confirmOverwrite}
      <div class="modal-body">
        <p class="prompt">
          <strong>{confirmOverwrite.path}</strong> 파일이 이미 있습니다.<br />
          덮어쓸까요?
        </p>
        {#if error}<p class="error">{error}</p>{/if}
        <div class="actions">
          <button type="button" class="btn" onclick={cancelOverwrite} disabled={busy}>취소</button>
          <button type="button" class="btn btn-primary" onclick={confirmAndOverwrite} disabled={busy}>
            {#if busy}저장 중...{:else}덮어쓰기{/if}
          </button>
        </div>
      </div>
    {:else}
      <form class="modal-body" onsubmit={handleSubmit}>
        <label for="dropbox-filename">파일 이름</label>
        <input
          id="dropbox-filename"
          type="text"
          bind:value={filename}
          bind:this={inputEl}
          disabled={busy}
          autocomplete="off"
          spellcheck="false"
        />
        <p class="hint">App folder (<code>/Apps/CrochetChart/</code>) 안에 저장됩니다.</p>
        {#if error}<p class="error">{error}</p>{/if}
        <div class="actions">
          <button type="button" class="btn" onclick={onClose} disabled={busy}>취소</button>
          <button type="submit" class="btn btn-primary" disabled={busy || !filename.trim()}>
            {#if busy}확인 중...{:else}저장{/if}
          </button>
        </div>
      </form>
    {/if}
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
    max-width: 460px;
    width: 100%;
    overflow: hidden;
  }
  .modal-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 18px;
    border-bottom: 1px solid var(--border-light);
  }
  .modal-header h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    display: flex; align-items: center; gap: 8px;
  }
  .close-btn {
    background: transparent; border: none;
    font-size: 18px;
    color: var(--text-secondary);
    padding: 4px 8px;
    border-radius: var(--radius-sm);
    cursor: pointer;
  }
  .close-btn:hover { background: var(--bg-hover); }
  .modal-body {
    padding: 16px 18px 18px;
    display: flex; flex-direction: column; gap: 8px;
  }
  label {
    font-size: 13px;
    color: var(--text-secondary);
  }
  input {
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: 14px;
    font-family: var(--font-mono);
  }
  input:focus { outline: 2px solid var(--border-focus); outline-offset: -1px; }
  .hint {
    margin: 4px 0 0;
    font-size: 12px;
    color: var(--text-muted);
  }
  .hint code {
    font-family: var(--font-mono);
    background: var(--bg-hover);
    padding: 1px 4px;
    border-radius: 2px;
  }
  .prompt {
    margin: 0;
    font-size: 14px;
    line-height: 1.5;
  }
  .error {
    margin: 4px 0 0;
    padding: 6px 10px;
    background: var(--danger-light);
    color: var(--danger);
    border-radius: var(--radius-sm);
    font-size: 12px;
  }
  .actions {
    display: flex; justify-content: flex-end; gap: 8px;
    margin-top: 12px;
  }
  .btn {
    padding: 6px 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-card);
    color: var(--text);
    font-size: 13px;
    cursor: pointer;
  }
  .btn:hover:not(:disabled) { background: var(--bg-hover); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-primary {
    background: var(--accent);
    color: #fff;
    border-color: var(--accent);
  }
  .btn-primary:hover:not(:disabled) {
    background: var(--accent-hover);
  }
</style>
