<script lang="ts">
  import { onMount } from 'svelte';
  import {
    workspaceList,
    activeWorkspaceId,
    syncStatus,
    refreshWorkspaceList,
    switchWorkspace,
    createWorkspace,
    renameWorkspace,
    deleteWorkspace,
  } from '$stores/dropboxWorkspace';
  import { dropboxConnected } from '$stores/dropbox';
  import { placeDropdown } from '$lib/dropdown-place';

  let open = $state(false);
  let button: HTMLButtonElement | undefined = $state();
  let menu: HTMLDivElement | undefined = $state();
  let busy = $state(false);

  $effect(() => {
    if (!open) return;
    queueMicrotask(() => placeDropdown(button, menu, 'left'));
    const reflow = () => placeDropdown(button, menu, 'left');
    window.addEventListener('resize', reflow);
    window.addEventListener('scroll', reflow, true);
    return () => {
      window.removeEventListener('resize', reflow);
      window.removeEventListener('scroll', reflow, true);
    };
  });

  onMount(() => {
    const handleClick = (e: MouseEvent) => {
      if (!open) return;
      const t = e.target as Node;
      if (button?.contains(t) || menu?.contains(t)) return;
      open = false;
    };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  });

  async function handleOpen() {
    if (!$dropboxConnected) {
      open = false;
      return;
    }
    if (!open) {
      try { await refreshWorkspaceList(); } catch { /* ignore */ }
    }
    open = !open;
  }

  async function handleSwitch(id: string) {
    if (id === $activeWorkspaceId) { open = false; return; }
    open = false;
    busy = true;
    try { await switchWorkspace(id); }
    catch (err) { alert(`전환 실패: ${err instanceof Error ? err.message : err}`); }
    finally { busy = false; }
  }

  async function handleCreate(source: 'current' | 'empty') {
    open = false;
    const name = prompt(source === 'current' ? '현재 워크스페이스 사본 이름:' : '새 워크스페이스 이름:');
    if (!name) return;
    busy = true;
    try { await createWorkspace({ name, source }); }
    catch (err) { alert(`생성 실패: ${err instanceof Error ? err.message : err}`); }
    finally { busy = false; }
  }

  async function handleRename() {
    open = false;
    const id = $activeWorkspaceId;
    if (!id) return;
    const cur = $workspaceList.find((w) => w.id === id);
    const name = prompt('새 이름:', cur?.name ?? '');
    if (!name || name === cur?.name) return;
    busy = true;
    try { await renameWorkspace(id, name); }
    catch (err) { alert(`이름 변경 실패: ${err instanceof Error ? err.message : err}`); }
    finally { busy = false; }
  }

  async function handleDelete(id: string, name: string) {
    open = false;
    if (!confirm(`'${name}' 워크스페이스를 삭제할까요? 되돌릴 수 없습니다.`)) return;
    busy = true;
    try { await deleteWorkspace(id); await refreshWorkspaceList(); }
    catch (err) { alert(`삭제 실패: ${err instanceof Error ? err.message : err}`); }
    finally { busy = false; }
  }

  let activeName = $derived(
    $activeWorkspaceId
      ? $workspaceList.find((w) => w.id === $activeWorkspaceId)?.name ?? '...'
      : '로컬',
  );
  let statusIcon = $derived(
    $syncStatus === 'syncing' ? 'fa-spinner fa-spin'
      : $syncStatus === 'error' ? 'fa-triangle-exclamation'
      : $syncStatus === 'offline' ? 'fa-cloud-slash'
      : 'fa-cloud',
  );
  let statusTitle = $derived(
    $syncStatus === 'syncing' ? '동기화 중...'
      : $syncStatus === 'error' ? '동기화 오류 (다시 변경 시 재시도)'
      : $syncStatus === 'offline' ? 'Dropbox 미연결'
      : '동기화됨',
  );
</script>

{#if $dropboxConnected}
  <div class="workspace-menu">
    <button
      type="button"
      class="ws-btn"
      onclick={handleOpen}
      bind:this={button}
      title={statusTitle}
      aria-haspopup="true"
      aria-expanded={open}
      disabled={busy}
    >
      <i class="fa-solid {statusIcon} status-icon" class:err={$syncStatus === 'error'}></i>
      <span class="ws-name">{activeName}</span>
      <i class="fa-solid fa-caret-down"></i>
    </button>
    {#if open}
      <div class="dropdown" bind:this={menu} role="menu">
        {#if $workspaceList.length === 0}
          <div class="empty">워크스페이스 없음</div>
        {:else}
          {#each $workspaceList as ws (ws.id)}
            <div class="row">
              <button
                type="button"
                class="item"
                class:active={ws.id === $activeWorkspaceId}
                onclick={() => handleSwitch(ws.id)}
                role="menuitem"
              >
                <i class="fa-solid fa-folder"></i> {ws.name}
                {#if ws.id === $activeWorkspaceId}<span class="badge">활성</span>{/if}
              </button>
              <button
                type="button"
                class="del-btn"
                onclick={() => handleDelete(ws.id, ws.name)}
                title="삭제"
                aria-label="워크스페이스 삭제"
              ><i class="fa-solid fa-trash"></i></button>
            </div>
          {/each}
        {/if}
        <div class="divider"></div>
        <button type="button" class="item" onclick={() => handleCreate('current')} role="menuitem">
          <i class="fa-solid fa-clone"></i> 현재 상태로 새 워크스페이스
        </button>
        <button type="button" class="item" onclick={() => handleCreate('empty')} role="menuitem">
          <i class="fa-solid fa-plus"></i> 빈 워크스페이스 만들기
        </button>
        {#if $activeWorkspaceId}
          <button type="button" class="item" onclick={handleRename} role="menuitem">
            <i class="fa-solid fa-pen"></i> 이름 변경
          </button>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .workspace-menu { position: relative; }
  .ws-btn {
    height: 30px;
    padding: 0 10px;
    border: 1px solid var(--border-light);
    border-radius: var(--radius-sm);
    background: transparent;
    font-size: 13px;
    cursor: pointer;
    display: flex; align-items: center; gap: 6px;
    color: var(--text-secondary);
    max-width: 220px;
  }
  .ws-btn:hover:not(:disabled) { background: var(--bg-hover); border-color: var(--border); }
  .ws-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .ws-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 140px; }
  .status-icon { font-size: 11px; color: #0061ff; }
  .status-icon.err { color: var(--danger, #d33); }
  .dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    min-width: 240px;
    max-width: calc(100vw - 24px);
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-md);
    padding: 4px;
    z-index: 100;
    display: flex; flex-direction: column;
  }
  .row { display: flex; align-items: stretch; }
  .item {
    text-align: left;
    padding: 7px 10px;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    font-size: 13px;
    color: var(--text);
    cursor: pointer;
    display: flex; align-items: center; gap: 8px;
    flex: 1;
  }
  .item:hover:not(:disabled) { background: var(--bg-hover); }
  .item.active { font-weight: 600; }
  .badge {
    font-size: 10px; padding: 1px 6px;
    background: var(--bg-warm); border-radius: 10px;
    margin-left: auto; color: var(--text-secondary);
  }
  .del-btn {
    background: transparent; border: none; padding: 0 8px;
    color: var(--text-muted); cursor: pointer; font-size: 12px;
    border-radius: var(--radius-sm);
  }
  .del-btn:hover { background: var(--bg-hover); color: var(--danger, #d33); }
  .empty {
    padding: 8px 10px; font-size: 12px; color: var(--text-muted);
  }
  .divider { height: 1px; background: var(--border-light); margin: 4px 2px; }
</style>
