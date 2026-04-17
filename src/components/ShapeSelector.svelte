<script lang="ts">
  import { pattern, setShape, type ShapeKind } from '$stores/pattern';

  const options: Array<{ value: ShapeKind; label: string; iconClass: string }> = [
    { value: 'circular', label: '원형', iconClass: 'fa-regular fa-circle' },
    { value: 'flat',     label: '평면', iconClass: 'fa-regular fa-square' },
  ];
</script>

<div class="shape-selector" role="radiogroup" aria-label="도형 선택">
  {#each options as opt (opt.value)}
    <button
      type="button"
      class="seg-btn"
      class:active={$pattern.shape === opt.value}
      role="radio"
      aria-checked={$pattern.shape === opt.value}
      onclick={() => setShape(opt.value)}
    ><i class={opt.iconClass}></i> {opt.label}</button>
  {/each}
</div>

<style>
  .shape-selector {
    display: inline-flex;
    border: 1px solid var(--border, #e2e2e2);
    border-radius: var(--radius-sm, 5px);
    overflow: hidden;
    background: var(--bg, #f5f5f5);
  }
  .seg-btn {
    padding: 6px 14px;
    border: none;
    background: transparent;
    font-size: 13px;
    cursor: pointer;
    color: var(--text-secondary, #666);
    transition: all 0.15s;
    white-space: nowrap;
  }
  .seg-btn:not(:last-child) {
    border-right: 1px solid var(--border, #e2e2e2);
  }
  .seg-btn.active {
    background: #fff8e1;
    color: var(--text, #202124);
    font-weight: 600;
  }
  .seg-btn:hover:not(.active) {
    background: var(--bg-hover, #f1f3f4);
    color: var(--text, #202124);
  }
</style>
