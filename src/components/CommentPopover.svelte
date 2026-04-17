<script lang="ts">
  import { marked } from 'marked';
  import { updateComment, deleteComment, type Comment } from '$stores/tabs';

  interface Props {
    comment: Comment;
    onClose: () => void;
  }
  let { comment, onClose }: Props = $props();

  let editing = $state(false);
  let draftText = $state('');
  let draftColor = $state('#FFE066');

  const palette = [
    '#FFE066', // yellow
    '#FFB3B3', // pink
    '#B5EAD7', // mint
    '#B3D9FF', // blue
    '#E0BBE4', // purple
    '#FFD8A8', // orange
    '#C9C9C9', // gray
  ];

  const rendered = $derived(marked.parse(comment.text || '*(내용 없음)*', { async: false, breaks: true }) as string);

  function startEdit() {
    draftText = comment.text;
    draftColor = comment.color;
    editing = true;
  }

  function commitEdit() {
    updateComment(comment.id, { text: draftText, color: draftColor });
    editing = false;
  }

  function cancelEdit() {
    editing = false;
  }

  function handleDelete() {
    if (window.confirm('이 코멘트를 삭제할까요?')) {
      deleteComment(comment.id);
      onClose();
    }
  }

  function pickPaletteColor(c: string) {
    draftColor = c;
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions a11y_interactive_supports_focus -->
<div
  class="popover"
  style="background: {editing ? draftColor : comment.color}"
  role="dialog"
  aria-label="코멘트"
  tabindex="-1"
  onclick={(e) => e.stopPropagation()}
>
  <div class="header">
    <span class="label">
      {#if comment.target.kind === 'pattern'}도안 메모{:else}단 메모{/if}
    </span>
    <div class="actions">
      {#if !editing}
        <button type="button" class="icon-btn" onclick={startEdit} title="편집"><i class="fa-solid fa-pen"></i></button>
        <button type="button" class="icon-btn" onclick={handleDelete} title="삭제"><i class="fa-solid fa-trash"></i></button>
      {/if}
      <button type="button" class="icon-btn" onclick={onClose} title="닫기"><i class="fa-solid fa-xmark"></i></button>
    </div>
  </div>

  {#if editing}
    <textarea
      class="editor"
      bind:value={draftText}
      placeholder="마크다운으로 메모를 작성하세요..."
      rows="5"
    ></textarea>

    <div class="color-section">
      <span class="sublabel">색상:</span>
      <div class="palette">
        {#each palette as c (c)}
          <button
            type="button"
            class="swatch"
            class:active={draftColor === c}
            style="background: {c}"
            onclick={() => pickPaletteColor(c)}
            aria-label={c}
          ></button>
        {/each}
      </div>
      <input
        type="color"
        class="color-input"
        bind:value={draftColor}
        title="색상 선택"
      />
      <input
        type="text"
        class="hex-input"
        bind:value={draftColor}
        placeholder="#RRGGBB"
        maxlength="7"
      />
    </div>

    <div class="edit-actions">
      <button type="button" class="btn" onclick={cancelEdit}>취소</button>
      <button type="button" class="btn primary" onclick={commitEdit}>저장</button>
    </div>
  {:else}
    <div class="content markdown">
      {@html rendered}
    </div>
  {/if}
</div>

<style>
  .popover {
    width: 320px;
    max-width: calc(100vw - 40px);
    border: 1px solid rgba(0, 0, 0, 0.15);
    border-radius: var(--radius);
    box-shadow: var(--shadow-md);
    padding: 10px 12px;
    font-size: 13px;
    color: #1a1a1a;
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
    padding-bottom: 6px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  }
  .label {
    font-weight: 600;
    font-size: 12px;
    color: rgba(0, 0, 0, 0.7);
  }
  .actions {
    display: flex;
    gap: 2px;
  }
  .icon-btn {
    width: 24px;
    height: 24px;
    border: none;
    background: transparent;
    cursor: pointer;
    color: rgba(0, 0, 0, 0.6);
    font-size: 12px;
    border-radius: 3px;
  }
  .icon-btn:hover {
    background: rgba(0, 0, 0, 0.08);
    color: #000;
  }
  .content {
    min-height: 20px;
    line-height: 1.5;
  }
  .markdown :global(p) { margin: 0 0 8px; }
  .markdown :global(p:last-child) { margin-bottom: 0; }
  .markdown :global(code) {
    background: rgba(0,0,0,0.1);
    padding: 1px 4px;
    border-radius: 3px;
    font-family: var(--font-mono);
    font-size: 12px;
  }
  .markdown :global(ul), .markdown :global(ol) {
    margin: 4px 0;
    padding-left: 1.4em;
  }
  .markdown :global(a) { color: #1a5bbf; }
  .editor {
    width: 100%;
    min-height: 80px;
    padding: 6px 8px;
    border: 1px solid rgba(0,0,0,0.15);
    border-radius: 4px;
    background: rgba(255,255,255,0.8);
    font-family: var(--font-sans);
    font-size: 13px;
    resize: vertical;
    box-sizing: border-box;
  }
  .color-section {
    margin-top: 8px;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
  }
  .sublabel {
    font-size: 11px;
    color: rgba(0,0,0,0.6);
    margin-right: 4px;
  }
  .palette {
    display: flex;
    gap: 3px;
  }
  .swatch {
    width: 18px;
    height: 18px;
    border: 1px solid rgba(0,0,0,0.15);
    border-radius: 50%;
    padding: 0;
    cursor: pointer;
  }
  .swatch.active {
    border-color: #000;
    border-width: 2px;
  }
  .color-input {
    width: 28px;
    height: 22px;
    padding: 0;
    border: 1px solid rgba(0,0,0,0.15);
    border-radius: 3px;
    cursor: pointer;
    background: transparent;
  }
  .hex-input {
    width: 72px;
    padding: 2px 4px;
    border: 1px solid rgba(0,0,0,0.15);
    border-radius: 3px;
    font-family: var(--font-mono);
    font-size: 11px;
    text-transform: uppercase;
  }
  .edit-actions {
    margin-top: 8px;
    display: flex;
    gap: 6px;
    justify-content: flex-end;
  }
  .btn {
    padding: 4px 12px;
    border: 1px solid rgba(0,0,0,0.2);
    border-radius: 4px;
    background: rgba(255,255,255,0.7);
    font-size: 12px;
    cursor: pointer;
  }
  .btn:hover { background: rgba(255,255,255,0.9); }
  .btn.primary {
    background: rgba(0,0,0,0.8);
    color: white;
    border-color: rgba(0,0,0,0.8);
  }
  .btn.primary:hover { background: #000; }
</style>
