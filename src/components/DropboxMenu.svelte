<script lang="ts">
  import { onMount } from 'svelte';
  import {
    dropboxConnected,
    connect,
    disconnect,
    openFromDropbox,
  } from '$stores/dropbox';
  import { isDropboxEnabled } from '$lib/dropbox/config';
  import DropboxSaveModal from './DropboxSaveModal.svelte';

  let open = $state(false);
  let savedPath = $state<string | null>(null);
  let showSaveModal = $state(false);
  let button: HTMLButtonElement | undefined = $state();
  let menu: HTMLDivElement | undefined = $state();
  let busy = $state(false);

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
    open = false;
    if (busy) return;
    busy = true;
    try {
      const name = await openFromDropbox();
      if (name) savedPath = name;
    } catch (err) {
      alert(`Dropbox 불러오기 실패: ${err instanceof Error ? err.message : err}`);
    } finally {
      busy = false;
    }
  }

  async function handleSaveClick() {
    open = false;
    if (!$dropboxConnected) {
      // 연결 안 되어 있으면 OAuth 진행 (리다이렉트됨)
      if (confirm('Dropbox 에 저장하려면 연결이 필요합니다. 지금 연결할까요?')) {
        await connect();
      }
      return;
    }
    showSaveModal = true;
  }

  async function handleConnect() {
    open = false;
    await connect();
  }

  async function handleDisconnect() {
    open = false;
    if (!confirm('Dropbox 연결을 해제할까요?')) return;
    await disconnect();
    savedPath = null;
  }
</script>

{#if isDropboxEnabled()}
  <div class="dropbox-menu">
    <button
      type="button"
      class="icon-btn"
      class:connected={$dropboxConnected}
      onclick={() => (open = !open)}
      bind:this={button}
      title={$dropboxConnected ? 'Dropbox 연결됨' : 'Dropbox'}
      aria-haspopup="true"
      aria-expanded={open}
    >
      <i class="fa-brands fa-dropbox"></i>
    </button>
    {#if open}
      <div class="dropdown" bind:this={menu} role="menu">
        <button type="button" class="item" onclick={handleOpen} disabled={busy} role="menuitem">
          <i class="fa-solid fa-folder-open"></i> Dropbox 에서 불러오기
        </button>
        <button type="button" class="item" onclick={handleSaveClick} role="menuitem">
          <i class="fa-solid fa-cloud-arrow-up"></i> Dropbox 에 저장
        </button>
        <div class="divider"></div>
        {#if $dropboxConnected}
          <button type="button" class="item danger" onclick={handleDisconnect} role="menuitem">
            <i class="fa-solid fa-link-slash"></i> 연결 해제
          </button>
        {:else}
          <button type="button" class="item" onclick={handleConnect} role="menuitem">
            <i class="fa-solid fa-link"></i> 연결하기
          </button>
        {/if}
      </div>
    {/if}
  </div>
{/if}

{#if showSaveModal}
  <DropboxSaveModal
    onClose={() => (showSaveModal = false)}
    onSaved={(p) => { savedPath = p; showSaveModal = false; }}
  />
{/if}

{#if savedPath}
  <span class="saved-flash">✓ {savedPath}</span>
{/if}

<style>
  .dropbox-menu {
    position: relative;
  }
  .icon-btn {
    width: 34px;
    height: 30px;
    border: 1px solid var(--border-light);
    border-radius: var(--radius-sm);
    background: transparent;
    font-size: 15px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
    color: var(--text-secondary);
  }
  .icon-btn:hover {
    background: var(--bg-hover);
    border-color: var(--border);
  }
  .icon-btn.connected {
    color: #0061ff;
  }
  .dropdown {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    min-width: 200px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-md);
    padding: 4px;
    z-index: 100;
    display: flex; flex-direction: column;
  }
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
  }
  .item:hover:not(:disabled) { background: var(--bg-hover); }
  .item:disabled { opacity: 0.5; cursor: not-allowed; }
  .item.danger { color: var(--danger); }
  .divider {
    height: 1px;
    background: var(--border-light);
    margin: 4px 2px;
  }
  .saved-flash {
    font-size: 11px;
    color: var(--success);
    margin-left: 8px;
    animation: fade-in 0.2s ease-out;
  }
  @keyframes fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
</style>
