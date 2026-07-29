<script lang="ts">
  /**
   * Dropbox 동기화 충돌 해결.
   *
   * 다른 기기가 같은 워크스페이스를 먼저 저장했을 때, 어느 버전을 남길지 사용자가 고른다.
   * 해결 전까지 자동 업로드는 멈춰 있으므로 서두를 필요가 없다.
   */
  import { onMount } from 'svelte';
  import { syncConflict, resolveConflict } from '$stores/dropboxWorkspace';

  const conflict = $derived($syncConflict);
  let busy = $state(false);
  let error = $state('');

  async function choose(choice: 'local' | 'remote' | 'keep-both') {
    if (busy) return;
    busy = true;
    error = '';
    try {
      await resolveConflict(choice);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  function when(iso: string): string {
    if (!iso) return '알 수 없음';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '알 수 없음';
    return d.toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });
  }

  function tabSummary(names: string[]): string {
    if (names.length === 0) return '탭 없음';
    const head = names.slice(0, 4).join(', ');
    return names.length > 4 ? `${head} 외 ${names.length - 4}개` : head;
  }

  onMount(() => {
    // 실수로 닫히지 않도록 Escape 무시 — 반드시 하나를 골라야 한다
    const block = (e: KeyboardEvent) => { if (e.key === 'Escape') e.stopPropagation(); };
    window.addEventListener('keydown', block, true);
    return () => window.removeEventListener('keydown', block, true);
  });
</script>

{#if conflict}
  <div class="overlay" role="presentation">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="conflict-title" tabindex="-1">
      <header>
        <h2 id="conflict-title"><i class="fa-solid fa-code-branch"></i> 동기화 충돌</h2>
      </header>

      <p class="lead">
        <b>{conflict.workspaceName}</b> 워크스페이스를 다른 기기가 먼저 저장했습니다.
        어느 버전을 남길지 골라주세요. 고르기 전까지 자동 저장은 멈춰 있습니다.
      </p>

      <div class="sides">
        <section class="side">
          <h3><i class="fa-solid fa-mobile-screen"></i> 이 기기의 변경</h3>
          <p class="time">{when(conflict.local.savedAt)}</p>
          <p class="tabs">탭 {conflict.local.tabNames.length}개 — {tabSummary(conflict.local.tabNames)}</p>
        </section>
        <section class="side">
          <h3><i class="fa-brands fa-dropbox"></i> Dropbox 에 있는 버전</h3>
          <p class="time">{when(conflict.remote.savedAt)}</p>
          <p class="tabs">탭 {conflict.remote.tabNames.length}개 — {tabSummary(conflict.remote.tabNames)}</p>
        </section>
      </div>

      {#if error}
        <p class="error">{error}</p>
      {/if}

      <div class="actions">
        <button type="button" class="btn primary" disabled={busy} onclick={() => choose('keep-both')}>
          <b>둘 다 보관</b>
          <span>Dropbox 버전은 그대로 두고, 이 기기 내용을 새 워크스페이스(사본)로 저장</span>
        </button>
        <button type="button" class="btn" disabled={busy} onclick={() => choose('local')}>
          <b>이 기기 것으로 덮어쓰기</b>
          <span>Dropbox 버전은 사라집니다 (Dropbox 버전 기록에서 복구 가능)</span>
        </button>
        <button type="button" class="btn" disabled={busy} onclick={() => choose('remote')}>
          <b>Dropbox 것 불러오기</b>
          <span>이 기기에서 방금 한 변경은 버립니다</span>
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 300;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }
  .modal {
    width: min(560px, 100%);
    max-height: 90vh;
    overflow-y: auto;
    background: var(--bg-card, #fff);
    border-radius: var(--radius, 8px);
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
    padding: 20px;
  }
  h2 {
    margin: 0 0 12px;
    font-size: 17px;
    color: var(--text, #202124);
  }
  .lead {
    margin: 0 0 16px;
    font-size: 13px;
    line-height: 1.6;
    color: var(--text-secondary, #666);
  }
  .sides {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 16px;
  }
  .side {
    flex: 1 1 220px;
    border: 1px solid var(--border, #e2e2e2);
    border-radius: var(--radius-sm, 5px);
    padding: 10px 12px;
    background: var(--bg, #fafafa);
  }
  .side h3 {
    margin: 0 0 6px;
    font-size: 13px;
    color: var(--text, #202124);
  }
  .time {
    margin: 0 0 4px;
    font-size: 12px;
    color: var(--text-secondary, #666);
  }
  .tabs {
    margin: 0;
    font-size: 12px;
    color: var(--text-secondary, #666);
    word-break: break-all;
  }
  .actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .btn {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 12px;
    border: 1px solid var(--border, #e2e2e2);
    border-radius: var(--radius-sm, 5px);
    background: var(--bg-card, #fff);
    text-align: left;
    cursor: pointer;
    color: var(--text, #202124);
  }
  .btn:hover:not(:disabled) {
    background: var(--bg-hover, #f1f3f4);
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: progress;
  }
  .btn b {
    font-size: 13px;
  }
  .btn span {
    font-size: 11.5px;
    color: var(--text-secondary, #666);
  }
  .btn.primary {
    border-color: #4caf50;
    background: #f3faf3;
  }
  .error {
    margin: 0 0 12px;
    font-size: 12px;
    color: #d32f2f;
  }
</style>
