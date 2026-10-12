<script lang="ts">
  /**
   * 이 도안(조각)이 어떻게 시작하는지 정하는 창.
   *
   * 한 작품 안의 다른 도안을 **탭 id** 로 가리키므로 이름을 바꿔도 끊기지 않는다.
   */
  import { onMount } from 'svelte';
  import { workspace, siblingPieces, setTabStart } from '$stores/tabs';
  import { resolveStart, type PieceStart } from '$lib/model/pieces';

  interface Props {
    onClose: () => void;
  }
  let { onClose }: Props = $props();

  const activeId = $derived($workspace.activeTabId);
  const others = $derived($siblingPieces.filter((p) => p.id !== activeId));
  const current = $derived($workspace.tabs.find((t) => t.id === activeId)?.startsFrom);

  let kind = $state<'new' | 'join' | 'from'>('new');
  let picked = $state<string[]>([]);
  let chain = $state(0);
  let fromId = $state('');
  let stitches = $state<number | ''>('');
  let at = $state<number | ''>('');
  let ready = $state(false);

  // 지금 설정으로 창을 채운다 (한 번만)
  $effect(() => {
    if (ready) return;
    ready = true;
    const c = current;
    if (!c) { kind = 'new'; return; }
    if (c.kind === 'join') { kind = 'join'; picked = [...c.pieces]; chain = c.chain; }
    else { kind = 'from'; fromId = c.piece; stitches = c.stitches ?? ''; at = c.at ?? ''; }
  });

  const draft = $derived<PieceStart | undefined>(
    kind === 'join' && picked.length > 0
      ? { kind: 'join', pieces: picked, chain }
      : kind === 'from' && fromId
        ? {
            kind: 'from',
            piece: fromId,
            ...(typeof stitches === 'number' && stitches > 0 ? { stitches } : {}),
            ...(typeof at === 'number' && at > 1 ? { at } : {}),
          }
        : undefined,
  );
  const preview = $derived(resolveStart(draft, others));

  function toggle(id: string) {
    picked = picked.includes(id) ? picked.filter((p) => p !== id) : [...picked, id];
  }

  function save() {
    setTabStart(activeId, kind === 'new' ? undefined : draft);
    onClose();
  }

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
      <h2><i class="fa-solid fa-code-merge"></i> 이 도안은 어떻게 시작하나요</h2>
      <button class="close-btn" onclick={onClose} aria-label="닫기"><i class="fa-solid fa-xmark"></i></button>
    </header>

    <div class="modal-body">
      <p class="hint">
        한 작품에 든 도안들은 그 작품의 조각입니다. 다리를 따로 뜬 뒤 몸통에서 합치거나,
        몸통에서 갈라져 나온 조각이라면 여기서 이어 두세요.
      </p>

      <div class="kinds">
        <label><input type="radio" bind:group={kind} value="new" /> 혼자 시작</label>
        <label><input type="radio" bind:group={kind} value="join" disabled={others.length === 0} /> 조각 잇기</label>
        <label><input type="radio" bind:group={kind} value="from" disabled={others.length === 0} /> 이어받기</label>
      </div>

      {#if others.length === 0}
        <p class="empty">이 작품에 다른 도안이 없습니다. 도안 탭을 먼저 추가하세요.</p>
      {:else if kind === 'join'}
        <fieldset>
          <legend>이어 붙일 조각 (뜨는 순서)</legend>
          {#each others as p (p.id)}
            <label class="piece">
              <input type="checkbox" checked={picked.includes(p.id)} onchange={() => toggle(p.id)} />
              {p.name}<span class="count">{p.lastCount}코</span>
            </label>
          {/each}
          <label class="chain">
            조각 사이 사슬
            <input type="number" min="0" max="40" bind:value={chain} />
            <span class="note">양쪽을 이으므로 {picked.length || 0}군데에 들어갑니다</span>
          </label>
        </fieldset>
      {:else if kind === 'from'}
        <fieldset>
          <legend>이어받을 도안</legend>
          <select bind:value={fromId} aria-label="이어받을 도안">
            <option value="" disabled>고르세요…</option>
            {#each others as p (p.id)}
              <option value={p.id}>{p.name} ({p.lastCount}코)</option>
            {/each}
          </select>
          <label class="chain">
            가져오는 코 수
            <input type="number" min="1" placeholder="전부" bind:value={stitches} />
          </label>
          <label class="chain">
            몇 번째 코부터
            <input type="number" min="1" placeholder="1" bind:value={at} />
            <span class="note">
              비우면 1번째부터·전부를 가져옵니다. 남는 코는 그 도안에 <b>쉼코</b>로 표시됩니다.
            </span>
          </label>
        </fieldset>
      {/if}

      {#if preview}
        <p class="preview"><b>물려받는 코</b> — {preview.label}</p>
      {/if}
    </div>

    <footer>
      <button class="btn" onclick={onClose}>취소</button>
      <button class="btn btn-primary" onclick={save}>저장</button>
    </footer>
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
    max-width: 460px; width: 100%;
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
    padding: 4px 8px; border-radius: var(--radius-sm); cursor: pointer;
  }
  .modal-body {
    padding: 14px 18px;
    display: flex; flex-direction: column; gap: 12px;
  }
  .hint, .note, .empty {
    margin: 0;
    font-size: 12px;
    line-height: 1.5;
    color: var(--text-secondary);
  }
  .kinds { display: flex; gap: 14px; font-size: 13px; }
  .kinds label { display: inline-flex; align-items: center; gap: 5px; cursor: pointer; }
  fieldset {
    border: 1px solid var(--border-light);
    border-radius: var(--radius-sm);
    padding: 10px 12px;
    display: flex; flex-direction: column; gap: 7px;
  }
  legend { font-size: 11px; color: var(--text-secondary); padding: 0 4px; }
  .piece { display: flex; align-items: center; gap: 7px; font-size: 13px; cursor: pointer; }
  .count { color: var(--text-muted); font-size: 11px; }
  .chain { display: flex; align-items: center; gap: 8px; font-size: 13px; flex-wrap: wrap; }
  .chain input { width: 68px; padding: 4px 6px; border: 1px solid var(--border); border-radius: var(--radius-sm); }
  select {
    padding: 5px 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-card); color: var(--text); font-size: 13px;
  }
  .preview {
    margin: 0;
    font-size: 13px;
    padding: 8px 10px;
    border-radius: var(--radius-sm);
    background: var(--bg-hover);
  }
  footer {
    display: flex; justify-content: flex-end; gap: 6px;
    padding: 12px 18px;
    border-top: 1px solid var(--border-light);
  }
  .btn {
    padding: 6px 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-card); color: var(--text);
    font-size: 13px; cursor: pointer;
  }
  .btn-primary { background: var(--accent); color: #fff; border-color: var(--accent); }
</style>
