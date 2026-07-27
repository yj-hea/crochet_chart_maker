<script lang="ts">
  import { pattern, setShape, type ShapeKind } from '$stores/pattern';
  import { getCraft } from '$lib/crafts';

  // 도형 선택지는 크래프트가 정의한다 (코바늘: 원형/평면, 대바늘: 원통/평면)
  const options = $derived(getCraft($pattern.craft).shapes);
</script>

<div class="shape-selector" role="radiogroup" aria-label="도형 선택">
  {#each options as opt (opt.id)}
    <button
      type="button"
      class="seg-btn"
      class:active={$pattern.shape === opt.id}
      role="radio"
      aria-checked={$pattern.shape === opt.id}
      onclick={() => setShape(opt.id as ShapeKind)}
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
