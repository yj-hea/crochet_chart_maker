<script lang="ts">
  import { mode } from '$stores/mode';

  function toggle() {
    mode.update((m) => (m === 'edit' ? 'read' : 'edit'));
  }

  const isPreview = $derived($mode === 'read');
</script>

<svelte:window onkeydown={(e) => {
  if (e.ctrlKey && e.key === 'e') { e.preventDefault(); toggle(); }
}} />

<button
  type="button"
  class="toggle-wrap"
  onclick={toggle}
  title="미리보기 모드 전환 (Ctrl+E)"
  role="switch"
  aria-checked={isPreview}
>
  <span class="toggle-label">Preview</span>
  <span class="toggle-track" class:on={isPreview}>
    <span class="toggle-thumb"></span>
  </span>
</button>

<style>
  .toggle-wrap {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px 4px 10px;
    border: none;
    border-radius: var(--radius-sm, 5px);
    background: transparent;
    cursor: pointer;
    font-size: 13px;
    color: var(--text-secondary, #666);
    transition: color 0.15s;
  }
  .toggle-wrap:hover {
    color: var(--text, #1a1a1a);
  }
  .toggle-track {
    position: relative;
    width: 36px;
    height: 20px;
    border-radius: 10px;
    background: var(--border, #ddd9d2);
    transition: background 0.2s;
    flex-shrink: 0;
  }
  .toggle-track.on {
    background: var(--accent, #5a554d);
  }
  .toggle-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: white;
    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
    transition: transform 0.2s;
  }
  .toggle-track.on .toggle-thumb {
    transform: translateX(16px);
  }
  .toggle-label {
    user-select: none;
    white-space: nowrap;
  }
</style>
