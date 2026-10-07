<script lang="ts">
  /**
   * 프로젝트(작품) 탭 줄 — 도안 탭 줄 **위**에 놓인다.
   *
   * 한 작품에 필요한 도안들이 그 작품 안에 들어 있으므로, 위아래 두 줄은
   * "작품 고르기 → 그 작품의 도안 고르기" 가 된다.
   */
  import {
    projects, openProjectId, openProject, createProject, renameProject,
    duplicateProject, removeProject, closeProject,
  } from '$stores/projects';

  let renamingId = $state<string | null>(null);
  let renameValue = $state('');
  let menuFor = $state<string | null>(null);

  const current = $derived($projects.find((p) => p.id === $openProjectId));

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
  function remove(id: string, name: string) {
    menuFor = null;
    if (window.confirm(`'${name}' 작품을 지울까요?\n이 기기에서 지워집니다 (되돌릴 수 없습니다).`)) {
      removeProject(id);
    }
  }
</script>

<div class="project-bar">
  <div class="tabs">
    {#each $projects as p (p.id)}
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
            onclick={() => openProject(p.id)}
            ondblclick={() => startRename(p.id, p.name)}
            title={`${p.name} · 도안 ${p.tabCount}개`}
          >
            {p.name}<span class="count">{p.tabCount}</span>
          </button>
          {#if p.id === $openProjectId}
            <button
              type="button" class="more" aria-label="작품 메뉴"
              onclick={() => (menuFor = menuFor === p.id ? null : p.id)}
            >⋯</button>
          {/if}
        </div>
      {/if}
    {/each}
    <button type="button" class="add" onclick={addProject} title="새 작품" aria-label="새 작품">+</button>
  </div>

  <button type="button" class="close" onclick={closeProject} title="작품 목록으로">
    <i class="fa-solid fa-folder-open"></i> 작품 목록
  </button>
</div>

{#if menuFor && current}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="menu-backdrop" onclick={() => (menuFor = null)} role="presentation">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="menu" onclick={(e) => e.stopPropagation()} role="menu" tabindex="-1">
      <button type="button" onclick={() => startRename(current.id, current.name)}>이름 바꾸기</button>
      <button type="button" onclick={() => { duplicateProject(current.id); menuFor = null; }}>복제</button>
      <button type="button" class="danger" onclick={() => remove(current.id, current.name)}>삭제</button>
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
  .menu button.danger { color: var(--danger, #e53935); }
</style>
