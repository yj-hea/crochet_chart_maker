<script lang="ts">
  import { tick } from 'svelte';
  import { workspace, switchTab, createTab, closeTab, renameTab } from '$stores/tabs';

  let editingId = $state<string | null>(null);
  let editingValue = $state('');
  let inputEl: HTMLInputElement | undefined = $state();

  function startEdit(id: string, currentName: string) {
    editingId = id;
    editingValue = currentName;
    tick().then(() => {
      inputEl?.focus();
      inputEl?.select();
    });
  }

  function commitEdit() {
    if (editingId) {
      renameTab(editingId, editingValue);
    }
    editingId = null;
  }

  function cancelEdit() {
    editingId = null;
  }

  function handleClose(e: MouseEvent, id: string) {
    e.stopPropagation();
    const tab = $workspace.tabs.find((t) => t.id === id);
    if (!tab) return;
    if ($workspace.tabs.length <= 1) return; // 마지막 탭은 닫기 불가 (store에서도 가드됨)
    const ok = window.confirm(`"${tab.name}" 탭을 닫을까요?\n이 도안은 삭제됩니다.`);
    if (ok) closeTab(id);
  }
</script>

<div class="tab-bar" role="tablist">
  {#each $workspace.tabs as tab (tab.id)}
    {@const isActive = tab.id === $workspace.activeTabId}
    {@const canClose = $workspace.tabs.length > 1}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="tab"
      class:active={isActive}
      role="tab"
      tabindex="0"
      aria-selected={isActive}
      onclick={() => switchTab(tab.id)}
      ondblclick={() => startEdit(tab.id, tab.name)}
    >
      {#if editingId === tab.id}
        <input
          type="text"
          class="tab-input"
          bind:this={inputEl}
          bind:value={editingValue}
          onblur={commitEdit}
          onkeydown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
            if (e.key === 'Escape') { cancelEdit(); }
          }}
          onclick={(e) => e.stopPropagation()}
        />
      {:else}
        <span class="tab-name" title="더블클릭하여 이름 변경">{tab.name}</span>
        {#if canClose}
          <button
            type="button"
            class="tab-close"
            onclick={(e) => handleClose(e, tab.id)}
            aria-label="탭 닫기"
            title="탭 닫기"
          >×</button>
        {/if}
      {/if}
    </div>
  {/each}
  <button
    type="button"
    class="tab-add"
    onclick={() => createTab()}
    title="새 탭 추가"
    aria-label="새 탭 추가"
  >+</button>
</div>

<style>
  .tab-bar {
    display: flex;
    align-items: flex-end;
    gap: 1px;
    padding: 0 16px;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
    overflow-x: auto;
    overflow-y: hidden;
    min-height: 36px;
  }
  .tab {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 10px 6px 14px;
    min-width: 90px;
    max-width: 200px;
    height: 32px;
    border: 1px solid transparent;
    border-bottom: none;
    border-radius: var(--radius-sm) var(--radius-sm) 0 0;
    background: transparent;
    color: var(--text-secondary);
    font-size: 13px;
    cursor: pointer;
    user-select: none;
    transition: background 0.15s, color 0.15s;
    position: relative;
    top: 1px;
  }
  .tab:hover:not(.active) {
    background: var(--bg-hover);
    color: var(--text);
  }
  .tab.active {
    background: var(--bg-card);
    color: var(--text);
    border-color: var(--border);
    font-weight: 600;
  }
  .tab-name {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tab-close {
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    padding: 0;
    border: none;
    border-radius: 3px;
    background: transparent;
    color: var(--text-muted);
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .tab-close:hover {
    background: var(--danger-light);
    color: var(--danger);
  }
  .tab-input {
    width: 100%;
    padding: 2px 4px;
    border: 1px solid var(--border-focus);
    border-radius: 3px;
    font-size: 13px;
    font-family: inherit;
    outline: none;
  }
  .tab-add {
    width: 28px;
    height: 28px;
    margin: 0 4px 4px;
    padding: 0;
    border: 1px solid var(--border-light);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .tab-add:hover {
    background: var(--bg-hover);
    border-color: var(--border);
    color: var(--text);
  }
</style>
