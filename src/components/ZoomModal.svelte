<script lang="ts">
  import { onMount } from 'svelte';
  /**
   * SVG 확대 팝업 — SVG 를 <img> 로 변환하여 렌더.
   * 휠 줌 + 드래그 팬 + 오른쪽 클릭으로 이미지 복사 지원.
   * 배경은 흰색.
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

  // fitScale: 뷰포트에 맞추는 실제 CSS 스케일 (모달 오픈 시 1회 계산)
  // zoom: 사용자 배율 (1.0 = 100% = fit). 실제 CSS scale = fitScale × zoom
  let fitScale = $state(1);
  let zoom = $state(1);
  let panX = $state(0);
  let panY = $state(0);

  const actualScale = $derived(fitScale * zoom);

  let dragging = $state(false);
  let dragStartX = 0;
  let dragStartY = 0;
  let panStartX = 0;
  let panStartY = 0;

  let viewport: HTMLDivElement | undefined = $state();
  let imgSrc = $state('');

  /** viewBox 파싱해서 흰색 배경 rect 주입 */
  function withWhiteBackground(svgStr: string): string {
    const m = svgStr.match(/viewBox="([^"]+)"/);
    if (!m) return svgStr;
    const parts = m[1]!.split(/\s+/).map(Number);
    if (parts.length < 4) return svgStr;
    const [x, y, w, h] = parts as [number, number, number, number];
    const bg = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#ffffff"/>`;
    return svgStr.replace(/<svg([^>]*)>/, `<svg$1>${bg}`);
  }

  // SVG → blob URL (img src 로 사용 → 우클릭 "이미지 복사" 지원)
  $effect(() => {
    const enhanced = withWhiteBackground(svg);
    const blob = new Blob([enhanced], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    imgSrc = url;
    return () => URL.revokeObjectURL(url);
  });

  // 마운트 시 1회만 fit + wheel 리스너 등록
  onMount(() => {
    const el = viewport;
    if (!el) return;

    // 레이아웃 반영 후 fit 계산
    requestAnimationFrame(() => {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const scaleX = rect.width / svgWidth;
      const scaleY = rect.height / svgHeight;
      fitScale = Math.min(scaleX, scaleY) * 0.9;
      zoom = 1;
      const s = fitScale * zoom;
      panX = (rect.width - svgWidth * s) / 2;
      panY = (rect.height - svgHeight * s) / 2;
    });

    // 휠 줌 ({passive: false} 필수)
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const oldScale = fitScale * zoom;
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom * factor));
      const newScale = fitScale * newZoom;
      panX = mouseX - (mouseX - panX) * (newScale / oldScale);
      panY = mouseY - (mouseY - panY) * (newScale / oldScale);
      zoom = newZoom;
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  });

  function handleMouseDown(e: MouseEvent) {
    if (e.button !== 0) return;
    e.preventDefault(); // img 기본 드래그 차단
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
    fitScale = Math.min(scaleX, scaleY) * 0.9;
    zoom = 1;
    const s = fitScale * zoom;
    panX = (rect.width - svgWidth * s) / 2;
    panY = (rect.height - svgHeight * s) / 2;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }
</script>

<svelte:window onkeydown={handleKeydown} onmousemove={handleMouseMove} onmouseup={handleMouseUp} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions a11y_no_noninteractive_element_interactions a11y_interactive_supports_focus -->
<div class="modal-backdrop" role="dialog" aria-modal="true" tabindex="-1" onclick={handleBackdropClick}>
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
      onmousedown={handleMouseDown}
      class:dragging
    >
      {#if imgSrc}
        <img
          class="svg-image"
          src={imgSrc}
          alt="도안 미리보기"
          draggable="false"
          style="transform: translate({panX}px, {panY}px) scale({actualScale}); width: {svgWidth}px; height: {svgHeight}px;"
        />
      {/if}
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
    font-family: var(--font-mono);
    font-weight: 600;
    color: #555;
    min-width: 50px;
    text-align: center;
  }
  .spacer { flex: 1; }
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
    background: #ffffff;
  }
  .modal-viewport.dragging {
    cursor: grabbing;
  }
  .svg-image {
    position: absolute;
    top: 0;
    left: 0;
    transform-origin: 0 0;
    user-select: none;
    -webkit-user-drag: none;
  }
</style>
