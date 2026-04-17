<script lang="ts">
  import { mode, type AppMode } from '$stores/mode';

  function toggle() {
    mode.update((m) => (m === 'edit' ? 'read' : 'edit'));
  }

  const label: Record<AppMode, string> = {
    edit: '✏️ Edit',
    read: '👁️ Read',
  };
</script>

<button type="button" class="mode-toggle" onclick={toggle} title="Edit/Read 모드 전환 (Ctrl+E)">
  {label[$mode]}
</button>

<svelte:window onkeydown={(e) => {
  if (e.ctrlKey && e.key === 'e') { e.preventDefault(); toggle(); }
}} />

<style>
  .mode-toggle {
    padding: 6px 14px;
    border: 1px solid #888;
    border-radius: 4px;
    background: white;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    color: #333;
  }
  .mode-toggle:hover {
    background: #f0f0f0;
  }
</style>
