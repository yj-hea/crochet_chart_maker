<script lang="ts">
  /**
   * 시작 화면 — 어떤 작품을 열까.
   *
   * 앱은 아무 프로젝트도 **자동으로 열지 않는다**. 여는 순간이 곧 동기화를 결정하는
   * 순간이라(원격이 새것인지, 내 것이 새것인지) 사용자가 그 순간을 보고 있어야 한다.
   * 대신 마지막으로 연 작품을 맨 위에 두고 Enter 로 바로 열 수 있게 한다.
   */
  import { onMount } from 'svelte';
  import { projects, openProject, createProject, removeProject, renameProject } from '$stores/projects';

  let newName = $state('');
  let creating = $state(false);
  let renamingId = $state<string | null>(null);
  let renameValue = $state('');
  let nameInput: HTMLInputElement | undefined = $state();

  const hasProjects = $derived($projects.length > 0);

  function openFirst() {
    const first = $projects[0];
    if (first) openProject(first.id);
  }

  function startCreate() {
    creating = true;
    newName = '';
    queueMicrotask(() => nameInput?.focus());
  }

  function commitCreate() {
    createProject(newName);
    creating = false;
  }

  function commitRename() {
    if (renamingId) renameProject(renamingId, renameValue);
    renamingId = null;
  }

  function remove(id: string, name: string) {
    if (window.confirm(`'${name}' 작품을 지울까요?\n이 기기에서 지워집니다 (되돌릴 수 없습니다).`)) {
      removeProject(id);
    }
  }

  /** 2026-10-07T… → "오늘" / "어제" / "3일 전" / 날짜 */
  function when(iso: string | undefined): string {
    if (!iso) return '';
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return '';
    const days = Math.floor((Date.now() - t) / 86_400_000);
    if (days <= 0) return '오늘';
    if (days === 1) return '어제';
    if (days < 7) return `${days}일 전`;
    return new Date(t).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });
  }

  function onKey(e: KeyboardEvent) {
    if (creating || renamingId) return;
    if (e.key === 'Enter' && hasProjects) { e.preventDefault(); openFirst(); }
  }
  onMount(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
</script>

<div class="picker">
  <div class="panel">
    <header>
      <h1><i class="fa-solid fa-folder-open"></i> 작품 고르기</h1>
      <p class="sub">한 작품에 필요한 도안들이 그 작품 안에 함께 들어 있습니다.</p>
    </header>

    {#if hasProjects}
      <ul class="list">
        {#each $projects as p, i (p.id)}
          <li class="row">
            {#if renamingId === p.id}
              <input
                class="rename"
                bind:value={renameValue}
                onkeydown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') renamingId = null; }}
                onblur={commitRename}
                aria-label="작품 이름"
              />
            {:else}
              <button type="button" class="open" onclick={() => openProject(p.id)}>
                <span class="name">{p.name}</span>
                <span class="meta">도안 {p.tabCount}개 · {when(p.openedAt ?? p.updatedAt)}</span>
                {#if i === 0}<span class="badge">마지막 작업 · Enter</span>{/if}
              </button>
              <button
                type="button" class="icon" title="이름 바꾸기" aria-label="이름 바꾸기"
                onclick={() => { renamingId = p.id; renameValue = p.name; }}
              ><i class="fa-solid fa-pen"></i></button>
              <button
                type="button" class="icon danger" title="삭제" aria-label="삭제"
                onclick={() => remove(p.id, p.name)}
              ><i class="fa-regular fa-trash-can"></i></button>
            {/if}
          </li>
        {/each}
      </ul>
    {:else}
      <p class="empty">아직 만든 작품이 없습니다. 새 작품으로 시작하세요.</p>
    {/if}

    <footer>
      {#if creating}
        <input
          class="rename"
          bind:this={nameInput}
          bind:value={newName}
          placeholder="작품 이름 (예: 토끼 인형)"
          onkeydown={(e) => { if (e.key === 'Enter') commitCreate(); if (e.key === 'Escape') creating = false; }}
          aria-label="새 작품 이름"
        />
        <button type="button" class="primary" onclick={commitCreate}>만들기</button>
        <button type="button" class="ghost" onclick={() => (creating = false)}>취소</button>
      {:else}
        <button type="button" class="primary" onclick={startCreate}>
          <i class="fa-solid fa-plus"></i> 새 작품
        </button>
      {/if}
    </footer>
  </div>
</div>

<style>
  .picker {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: var(--bg, #faf8f5);
    z-index: 900;
    overflow-y: auto;
  }
  .panel {
    width: 100%;
    max-width: 520px;
    background: var(--bg-card);
    border: 1px solid var(--border-light);
    border-radius: var(--radius);
    box-shadow: var(--shadow-sm);
    padding: 22px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  h1 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .sub {
    margin: 6px 0 0;
    font-size: 12px;
    color: var(--text-secondary);
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 50vh;
    overflow-y: auto;
  }
  .row {
    display: flex;
    align-items: stretch;
    gap: 4px;
  }
  .open {
    flex: 1;
    min-width: 0;
    text-align: left;
    padding: 10px 12px;
    border: 1px solid var(--border-light);
    border-radius: var(--radius-sm);
    background: var(--bg-card);
    cursor: pointer;
    display: flex;
    align-items: baseline;
    gap: 10px;
  }
  .open:hover { background: var(--bg-hover); }
  .name { font-weight: 600; font-size: 14px; }
  .meta { font-size: 11px; color: var(--text-secondary); }
  .badge {
    margin-left: auto;
    font-size: 10px;
    color: var(--accent, #4d86ff);
    white-space: nowrap;
  }
  .icon {
    width: 30px;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
  }
  .icon:hover { background: var(--bg-hover); color: var(--text); }
  .icon.danger:hover { color: var(--danger, #e53935); }
  .empty {
    margin: 0;
    padding: 18px 0;
    text-align: center;
    color: var(--text-secondary);
    font-size: 13px;
  }
  footer {
    display: flex;
    align-items: center;
    gap: 6px;
    border-top: 1px solid var(--border-light);
    padding-top: 14px;
  }
  .rename {
    flex: 1;
    min-width: 0;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-card);
    color: var(--text);
    font-size: 13px;
  }
  .primary {
    padding: 8px 14px;
    border: 1px solid var(--accent, #4d86ff);
    border-radius: var(--radius-sm);
    background: var(--accent, #4d86ff);
    color: #fff;
    font-size: 13px;
    cursor: pointer;
  }
  .ghost {
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    font-size: 13px;
    cursor: pointer;
  }
</style>
