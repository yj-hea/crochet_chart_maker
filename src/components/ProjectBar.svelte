<script lang="ts">
  /**
   * 프로젝트(작품) 탭 줄 — 도안 탭 줄 **위**에 놓인다.
   *
   * 한 작품에 필요한 도안들이 그 작품 안에 들어 있으므로, 위아래 두 줄은
   * "작품 고르기 → 그 작품의 도안 고르기" 가 된다.
   */
  import {
    projects, openTabs, openProjectId, openProject, createProject, renameProject,
    duplicateProject, removeProject, closeProject, closeProjectTab,
  } from '$stores/projects';
  import {
    openProjectSynced, pushOpen, refreshRemote, syncStatus, syncError,
  } from '$stores/projectSync';
  import { dropboxConnected } from '$stores/dropbox';

  let renamingId = $state<string | null>(null);
  let renameValue = $state('');
  let menuFor = $state<string | null>(null);

  /** `⋯` 를 누른 작품 — 열어 둔 것이 아니어도 된다 */
  const menuTarget = $derived($projects.find((p) => p.id === menuFor));
  let busy = $state(false);

  /**
   * 동기화 실패 뒤 **다시 시도** — 올리기는 다음 저장을 기다릴 필요가 없다.
   * 실패해도 작업은 로컬에 그대로 있으므로, 눌러서 될 때까지 다시 걸면 된다.
   */
  async function retrySync() {
    if (busy) return;
    busy = true;
    try {
      syncError.set(null);
      await refreshRemote();
      await pushOpen();
    } finally {
      busy = false;
    }
  }

  /**
   * 다른 작품으로 건너가기 — 열기 전에 원격과 한 번 맞춘다.
   * 양쪽이 다 바뀌었으면 열지 않고 작품 목록(시작 화면)에서 고르게 한다.
   */
  async function switchTo(id: string) {
    if (id === $openProjectId || busy) return;
    busy = true;
    try {
      if ($dropboxConnected) {
        const opened = await openProjectSynced(id);
        if (!opened) closeProject();   // 충돌 — 시작 화면에서 묻는다
      } else {
        openProject(id);
      }
    } finally {
      busy = false;
    }
  }

  async function backToList() {
    busy = true;
    try {
      if ($dropboxConnected) await pushOpen();
      closeProject();
    } finally {
      busy = false;
    }
  }

  function startRename(id: string, name: string) {
    renamingId = id;
    renameValue = name;
    menuFor = null;
  }
  function commitRename() {
    if (renamingId) renameProject(renamingId, renameValue);
    renamingId = null;
  }
  function addProject() {
    const name = window.prompt('새 작품 이름', '새 작품');
    if (name !== null) createProject(name);
  }
  function closeTab(id: string) {
    menuFor = null;
    closeProjectTab(id);
  }
  function remove(id: string, name: string) {
    menuFor = null;
    if (window.confirm(`'${name}' 작품을 지울까요?\n이 기기에서 지워집니다 (되돌릴 수 없습니다).`)) {
      removeProject(id);
    }
  }
</script>

<div class="project-bar">
  <div class="tabs">
    {#each $openTabs as p (p.id)}
      {#if renamingId === p.id}
        <input
          class="rename"
          bind:value={renameValue}
          onkeydown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') renamingId = null; }}
          onblur={commitRename}
          aria-label="작품 이름"
        />
      {:else}
        <div class="tab" class:active={p.id === $openProjectId}>
          <button
            type="button"
            class="label"
            onclick={() => switchTo(p.id)}
            ondblclick={() => startRename(p.id, p.name)}
            title={`${p.name} · 도안 ${p.tabCount}개`}
          >
            {p.name}<span class="count">{p.tabCount}</span>
          </button>
          <button
            type="button" class="more" aria-label="작품 메뉴"
            title="이름 바꾸기 · 복제 · 닫기 · 삭제"
            onclick={() => (menuFor = menuFor === p.id ? null : p.id)}
          >⋯</button>
        </div>
      {/if}
    {/each}
    <button type="button" class="add" onclick={addProject} title="새 작품" aria-label="새 작품">+</button>
  </div>

  {#if $dropboxConnected && $syncStatus === 'conflict'}
    <span class="conflict-badge" title="다른 기기에서 바뀌었습니다 — 작품 목록에서 맞춥니다">
      <i class="fa-solid fa-code-branch"></i> 동기화 충돌
    </span>
  {:else if $dropboxConnected && $syncStatus === 'error'}
    <!-- 실패해도 작업은 로컬에 남는다 — 다시 걸 수 있게 해 둔다 -->
    <span
      class="error-badge"
      title={`${$syncError ?? '동기화에 실패했습니다'}\n\n작업은 이 기기에 저장돼 있습니다. 다시 시도해도 안 되면 Dropbox 연결을 해제했다가 다시 연결해 보세요.`}
    >
      <i class="fa-solid fa-triangle-exclamation"></i> 동기화 실패
      <button type="button" class="retry" onclick={retrySync} disabled={busy}>다시 시도</button>
    </span>
  {:else if $dropboxConnected && $syncStatus === 'syncing'}
    <span class="sync-badge"><i class="fa-solid fa-rotate fa-spin"></i> 동기화 중</span>
  {/if}
  <button type="button" class="close" onclick={backToList} disabled={busy} title="작품 목록으로">
    <i class="fa-solid fa-folder-open"></i> 작품 목록
  </button>
</div>

{#if menuTarget}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="menu-backdrop" onclick={() => (menuFor = null)} role="presentation">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="menu" onclick={(e) => e.stopPropagation()} role="menu" tabindex="-1">
      <button type="button" onclick={() => startRename(menuTarget.id, menuTarget.name)}>이름 바꾸기</button>
      <button type="button" onclick={() => { duplicateProject(menuTarget.id); menuFor = null; }}>복제</button>
      <button
        type="button"
        title="탭 줄에서만 치웁니다 — 내용은 남고 작품 목록에서 다시 열 수 있습니다"
        onclick={() => closeTab(menuTarget.id)}
      >닫기</button>
      <div class="menu-divider"></div>
      <button type="button" class="danger" onclick={() => remove(menuTarget.id, menuTarget.name)}>삭제</button>
    </div>
  </div>
{/if}

<style>
  .project-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 10px 0;
    background: var(--bg, #faf8f5);
    border-bottom: 1px solid var(--border-light);
  }
  .tabs {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    flex: 1;
    min-width: 0;
    overflow-x: auto;
  }
  .tab {
    display: flex;
    align-items: center;
    border: 1px solid transparent;
    border-bottom: none;
    border-radius: var(--radius-sm) var(--radius-sm) 0 0;
    background: transparent;
  }
  .tab.active {
    background: var(--bg-card);
    border-color: var(--border-light);
  }
  .label {
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 600;
    padding: 6px 10px;
    cursor: pointer;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .tab.active .label { color: var(--text); }
  .count {
    font-size: 10px;
    font-weight: 500;
    color: var(--text-muted);
    background: var(--bg-hover);
    border-radius: 8px;
    padding: 0 5px;
  }
  .more,
  .add {
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 13px;
    padding: 4px 8px;
    border-radius: var(--radius-sm);
  }
  .more:hover,
  .add:hover { background: var(--bg-hover); color: var(--text); }
  .close {
    border: 1px solid var(--border-light);
    background: var(--bg-card);
    color: var(--text-secondary);
    font-size: 11px;
    padding: 4px 10px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    white-space: nowrap;
  }
  .close:hover { background: var(--bg-hover); color: var(--text); }
  .conflict-badge,
  .error-badge,
  .sync-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    white-space: nowrap;
  }
  .conflict-badge { color: var(--warning, #b26a00); }
  .error-badge { color: var(--danger, #e53935); }
  .sync-badge { color: var(--text-muted); }
  .retry {
    border: 1px solid currentColor;
    background: transparent;
    color: inherit;
    font-size: 10px;
    padding: 1px 6px;
    border-radius: var(--radius-sm);
    cursor: pointer;
  }
  .retry:disabled { opacity: 0.5; cursor: default; }
  .rename {
    padding: 5px 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-card);
    color: var(--text);
    font-size: 12px;
    min-width: 120px;
  }
  .menu-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1200;
  }
  .menu {
    position: absolute;
    top: 56px;
    left: 12px;
    background: var(--bg-card);
    border: 1px solid var(--border-light);
    border-radius: var(--radius-sm);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
    padding: 4px;
    display: flex;
    flex-direction: column;
    min-width: 140px;
  }
  .menu button {
    text-align: left;
    border: none;
    background: transparent;
    color: var(--text);
    font-size: 13px;
    padding: 7px 10px;
    border-radius: var(--radius-sm);
    cursor: pointer;
  }
  .menu button:hover { background: var(--bg-hover); }
  .menu-divider {
    height: 1px;
    background: var(--border-light);
    margin: 4px 2px;
  }
  .menu button.danger { color: var(--danger, #e53935); }
</style>
