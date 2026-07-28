<script lang="ts">
  import { tick } from 'svelte';
  import { workspace, switchTab, createTab, closeTab, renameTab } from '$stores/tabs';
  import { CRAFT_LIST, getCraft } from '$lib/crafts';
  import { placeDropdown } from '$lib/dropdown-place';

  // 탭 하나 = 크래프트 하나 → 새 탭을 만들 때 기법을 고른다 (이후 변경 불가)
  let addMenuOpen = $state(false);
  let addBtnEl: HTMLButtonElement | undefined = $state();
  let addMenuEl: HTMLDivElement | undefined = $state();

  function addTab(craft: 'crochet' | 'knit') {
    addMenuOpen = false;
    createTab(craft);
  }

  // .tab-bar 가 overflow 로 잘라내므로 메뉴는 position:fixed 로 띄우고 뷰포트에 clamp
  $effect(() => {
    if (!addMenuOpen) return;
    queueMicrotask(() => placeDropdown(addBtnEl, addMenuEl, 'left'));
    const reflow = () => placeDropdown(addBtnEl, addMenuEl, 'left');
    const close = () => { addMenuOpen = false; };
    window.addEventListener('click', close);
    window.addEventListener('resize', reflow);
    window.addEventListener('scroll', reflow, true);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('resize', reflow);
      window.removeEventListener('scroll', reflow, true);
    };
  });

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
        <span class="tab-craft" title={getCraft(tab.craft).label}>{getCraft(tab.craft).icon}</span>
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
  <div class="tab-add-wrap">
    <button
      type="button"
      class="tab-add"
      bind:this={addBtnEl}
      onclick={(e) => { e.stopPropagation(); addMenuOpen = !addMenuOpen; }}
      title="새 도안 추가"
      aria-label="새 도안 추가"
      aria-haspopup="menu"
      aria-expanded={addMenuOpen}
    >+</button>
    {#if addMenuOpen}
      <div
        class="add-menu"
        role="menu"
        tabindex="-1"
        bind:this={addMenuEl}
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => { if (e.key === 'Escape') addMenuOpen = false; }}
      >
        {#each CRAFT_LIST as craft (craft.id)}
          <button type="button" class="add-menu-item" role="menuitem" onclick={() => addTab(craft.id)}>
            <span class="add-menu-icon">{craft.icon}</span>
            <span>{craft.label} 도안</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .tab-craft {
    font-size: 12px;
    line-height: 1;
    opacity: 0.85;
  }
  .tab-add-wrap {
    position: relative;
    display: inline-flex;
  }
  .add-menu {
    /* placeDropdown 이 fixed 좌표를 지정 — .tab-bar 의 overflow 클리핑 회피 */
    position: fixed;
    z-index: 200;
    min-width: 150px;
    padding: 4px;
    background: #fff;
    border: 1px solid var(--border, #e2e2e2);
    border-radius: var(--radius-sm, 5px);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
  }
  .add-menu-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 7px 10px;
    border: none;
    background: transparent;
    border-radius: 4px;
    font-size: 13px;
    text-align: left;
    cursor: pointer;
    color: var(--text, #202124);
  }
  .add-menu-item:hover {
    background: var(--bg-hover, #f1f3f4);
  }
  .add-menu-icon {
    font-size: 14px;
  }
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
