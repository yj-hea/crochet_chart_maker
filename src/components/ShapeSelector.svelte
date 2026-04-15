<script lang="ts">
  import { pattern, setShape, type ShapeKind } from '$stores/pattern';

  function handleChange(e: Event) {
    const value = (e.currentTarget as HTMLSelectElement).value as ShapeKind;
    setShape(value);
  }
</script>

<label class="shape-selector">
  <span>도형:</span>
  <select value={$pattern.shape} onchange={handleChange}>
    <option value="circular">원형</option>
    <option value="flat">평면</option>
  </select>
</label>

<style>
  .shape-selector {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
  }
  select {
    padding: 4px 8px;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: white;
    font-size: 14px;
  }
</style>
