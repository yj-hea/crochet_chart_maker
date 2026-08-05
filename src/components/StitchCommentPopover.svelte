<script lang="ts">
  /**
   * 코 하나에 달린 메모(`"..."`)를 고치는 팝오버.
   *
   * 도안 메모·단 메모(`CommentPopover`)와 같은 카드 모양이지만 **저장 위치가 다르다** —
   * 저 둘은 스토어의 `Comment` 객체지만 이 메모는 도안 본문 텍스트 그 자체다.
   * 그래서 색이나 이미지 같은 부속 정보가 없고, 결과는 소스 문자열 치환으로 나간다.
   *
   * 짧은 이름표가 대부분이라 편집 모드로 바로 연다 — 한 번 더 누르게 하지 않는다.
   */
  interface Props {
    /** 현재 코멘트 알맹이 (따옴표 벗긴 것) */
    text: string;
    onSave: (text: string) => void;
    onDelete: () => void;
    onClose: () => void;
  }
  let { text, onSave, onDelete, onClose }: Props = $props();

  let draft = $state('');
  let textareaEl: HTMLTextAreaElement | undefined = $state();

  // 다른 메모를 이어서 누르면 같은 컴포넌트가 재사용되므로 `text` 변화를 따라간다
  $effect(() => {
    draft = text;
    const el = textareaEl;
    if (el) { el.focus(); el.select(); }
  });

  function commit() {
    const t = draft.trim();
    if (t === '') onDelete();
    else onSave(t);
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    // Enter 로 확정, Shift+Enter 로 줄바꿈 — 한 줄짜리가 대부분이다
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      commit();
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
  class="popover"
  role="dialog"
  aria-label="코 메모"
  tabindex="-1"
  onclick={(e) => e.stopPropagation()}
>
  <div class="header">
    <span class="label">코 메모</span>
    <div class="actions">
      <button type="button" class="icon-btn" onclick={onDelete} title="삭제">
        <i class="fa-solid fa-trash"></i>
      </button>
      <button type="button" class="icon-btn" onclick={onClose} title="닫기">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>
  </div>

  <textarea
    class="editor"
    bind:this={textareaEl}
    bind:value={draft}
    onkeydown={onKeydown}
    placeholder="이 코에 대한 메모"
    rows="2"
  ></textarea>

  <div class="edit-actions">
    <span class="hint">Enter 저장 · Shift+Enter 줄바꿈</span>
    <button type="button" class="btn" onclick={onClose}>취소</button>
    <button type="button" class="btn primary" onclick={commit}>저장</button>
  </div>
</div>

<style>
  .popover {
    width: 260px;
    max-width: calc(100vw - 40px);
    border: 1px solid rgba(0, 0, 0, 0.15);
    border-radius: var(--radius);
    box-shadow: var(--shadow-md);
    padding: 10px 12px;
    font-size: 13px;
    color: #1a1a1a;
    background: #ffe066;
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
  .editor {
    width: 100%;
    padding: 6px 8px;
    border: 1px solid rgba(0, 0, 0, 0.15);
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.8);
    font-family: var(--font-sans);
    font-size: 13px;
    resize: vertical;
    box-sizing: border-box;
  }
  .edit-actions {
    margin-top: 8px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .hint {
    flex: 1;
    font-size: 10.5px;
    color: rgba(0, 0, 0, 0.45);
  }
  .btn {
    padding: 4px 10px;
    border: 1px solid rgba(0, 0, 0, 0.15);
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.7);
    font-size: 12px;
    cursor: pointer;
  }
  .btn:hover {
    background: rgba(255, 255, 255, 0.95);
  }
  .btn.primary {
    background: rgba(0, 0, 0, 0.75);
    color: #fff;
    border-color: transparent;
  }
  .btn.primary:hover {
    background: #000;
  }
</style>
