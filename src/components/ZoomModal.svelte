<script lang="ts">
  /**
   * SVG 확대 팝업 — 더블클릭으로 열리고, 휠 줌 + 드래그 팬 지원.
   * ESC 또는 배경 클릭으로 닫힘.
   */

  interface Props {
    svg: string;
    svgWidth: number;
    svgHeight: number;
    onClose: () => void;
  }

  let { svg, svgWidth, svgHeight, onClose }: Props = $props();

  const ZOOM_MIN = 0.1;
  const ZOOM_MAX = 20;

  let zoom = $state(1);
  let panX = $state(0);
  let panY = $state(0);

  let dragging = $state(false);
  let dragStartX = 0;
  let dragStartY = 0;
  let panStartX = 0;
  let panStartY = 0;

  let viewport: HTMLDivElement | undefined = $state();

  // 초기 줌: 뷰포트에 맞춰 fit
  $effect(() => {
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const scaleX = rect.width / svgWidth;
    const scaleY = rect.height / svgHeight;
    const fitScale = Math.min(scaleX, scaleY) * 0.9;
    zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, fitScale));
    panX = (rect.width - svgWidth * zoom) / 2;
    panY = (rect.height - svgHeight * zoom) / 2;
  });

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    if (!viewport) return;

    const rect = viewport.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const oldZoom = zoom;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, oldZoom * factor));

    panX = mouseX - (mouseX - panX) * (newZoom / oldZoom);
    panY = mouseY - (mouseY - panY) * (newZoom / oldZoom);
    zoom = newZoom;
  }

  function handleMouseDown(e: MouseEvent) {
    if (e.button !== 0) return;
    dragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    panStartX = panX;
    panStartY = panY;
  }

  function handleMouseMove(e: MouseEvent) {
    if (!dragging) return;
    panX = panStartX + (e.clientX - dragStartX);
    panY = panStartY + (e.clientY - dragStartY);
  }

  function handleMouseUp() {
    dragging = false;
  }

  function resetView() {
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const scaleX = rect.width / svgWidth;
    const scaleY = rect.height / svgHeight;
    zoom = Math.min(scaleX, scaleY) * 0.9;
    panX = (rect.width - svgWidth * zoom) / 2;
    panY = (rect.height - svgHeight * zoom) / 2;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }
</script>

<svelte:window onkeydown={handleKeydown} onmousemove={handleMouseMove} onmouseup={handleMouseUp} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions a11y_no_noninteractive_element_interactions -->
<!-- svelte-ignore a11y_interactive_supports_focus -->
<div class="modal-backdrop" role="dialog" aria-modal="true" onclick={handleBackdropClick}>
  <div class="modal-chrome">
    <div class="modal-toolbar">
      <span class="zoom-label">{Math.round(zoom * 100)}%</span>
      <button type="button" onclick={resetView}>맞춤</button>
      <span class="spacer"></span>
      <button type="button" class="close-btn" onclick={onClose} aria-label="닫기">✕</button>
    </div>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="modal-viewport"
      bind:this={viewport}
      onwheel={handleWheel}
      onmousedown={handleMouseDown}
      class:dragging
    >
      <div
        class="svg-container"
        style="transform: translate({panX}px, {panY}px) scale({zoom}); width: {svgWidth}px; height: {svgHeight}px;"
      >
        {@html svg}
      </div>
    </div>
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .modal-chrome {
    width: 100%;
    height: 100%;
    max-width: 1400px;
    max-height: 90vh;
    background: white;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  }
  .modal-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-bottom: 1px solid #e0e0e0;
    background: #fafafa;
  }
  .modal-toolbar button {
    padding: 4px 10px;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: white;
    font-size: 13px;
    cursor: pointer;
    color: #333;
  }
  .modal-toolbar button:hover {
    background: #f0f0f0;
    border-color: #888;
  }
  .zoom-label {
    font-size: 13px;
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-weight: 600;
    color: #555;
    min-width: 50px;
    text-align: center;
  }
  .spacer {
    flex: 1;
  }
  .close-btn {
    font-size: 18px !important;
    line-height: 1;
    padding: 2px 8px !important;
  }
  .modal-viewport {
    flex: 1;
    overflow: hidden;
    cursor: grab;
    position: relative;
    background:
      repeating-conic-gradient(#f0f0f0 0% 25%, transparent 0% 50%)
      50% / 20px 20px;
  }
  .modal-viewport.dragging {
    cursor: grabbing;
  }
  .svg-container {
    transform-origin: 0 0;
    position: absolute;
    top: 0;
    left: 0;
  }
  .svg-container :global(svg) {
    width: 100%;
    height: 100%;
    display: block;
  }
</style>
