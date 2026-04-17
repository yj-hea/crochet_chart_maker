<script lang="ts">
  import CommentPopover from './CommentPopover.svelte';
  import type { Comment } from '$stores/tabs';

  interface Props {
    comment: Comment;
    icon?: string;
    size?: number;
  }
  let { comment, icon = '●', size = 14 }: Props = $props();

  let open = $state(false);
  let pinEl: HTMLButtonElement | undefined = $state();
  let popoverTop = $state(0);
  let popoverLeft = $state(0);

  // 초기 open 상태 반영 (첫 렌더시 1회)
  let openInitialized = false;
  $effect(() => {
    if (!openInitialized) {
      openInitialized = true;
      if (comment.open) {
        queueMicrotask(() => { open = true; updatePosition(); });
      }
    }
  });

  function updatePosition() {
    if (!pinEl) return;
    const rect = pinEl.getBoundingClientRect();
    const popW = 320;
    const margin = 8;
    // 기본: 아래쪽, 핀의 왼쪽 정렬
    let left = rect.left;
    let top = rect.bottom + 4;
    // 우측 뷰포트를 넘으면 오른쪽 정렬로 전환
    if (left + popW + margin > window.innerWidth) {
      left = Math.max(margin, window.innerWidth - popW - margin);
    }
    // 아래 공간 부족하면 위쪽으로
    if (top + 200 > window.innerHeight) {
      top = Math.max(margin, rect.top - 200 - 4);
    }
    popoverLeft = left;
    popoverTop = top;
  }

  function toggle(e: MouseEvent) {
    e.stopPropagation();
    open = !open;
    if (open) updatePosition();
  }

  function close() {
    open = false;
  }

  function handleWindowClick(e: MouseEvent) {
    if (!open) return;
    const target = e.target as Node;
    const popover = document.querySelector('.comment-popover-fixed[data-cmid="' + comment.id + '"]');
    if (popover?.contains(target)) return;
    if (pinEl?.contains(target)) return;
    open = false;
  }

  function handleWindowResize() {
    if (open) updatePosition();
  }
</script>

<svelte:window onclick={handleWindowClick} onresize={handleWindowResize} onscroll={handleWindowResize} />

<button
  type="button"
  class="pin"
  bind:this={pinEl}
  style="color: {comment.color}; font-size: {size}px;"
  onclick={toggle}
  aria-label="코멘트"
  title={comment.text.slice(0, 60) || '코멘트'}
>{icon}</button>

{#if open}
  <div
    class="comment-popover-fixed"
    data-cmid={comment.id}
    style="top: {popoverTop}px; left: {popoverLeft}px;"
  >
    <CommentPopover {comment} onClose={close} />
  </div>
{/if}

<style>
  .pin {
    border: none;
    background: transparent;
    cursor: pointer;
    padding: 0 2px;
    line-height: 1;
    text-shadow: 0 0 1px rgba(0, 0, 0, 0.3);
    transition: transform 0.1s;
  }
  .pin:hover {
    transform: scale(1.2);
  }
  .comment-popover-fixed {
    position: fixed;
    z-index: 1000;
  }
</style>
