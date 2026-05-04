<script lang="ts">
  import { pattern } from '$stores/pattern';
  import { mode, currentRound, currentStitch, showGrid, showConnections, flatFlipVertical } from '$stores/mode';
  import { setFlatAlign } from '$stores/tabs';
  import type { FlatAlign } from '$stores/tabs';
  import { renderedChart } from '$stores/rendered';
  import ZoomModal from './ZoomModal.svelte';

  let modalOpen = $state(false);
  let modalSvg = $state('');

  const rendered = $derived($renderedChart);

  function openModal() {
    if (!rendered) return;
    // 현재 DOM의 하이라이트 상태를 그대로 스냅샷 (Read 모드면 색상·강조·배경 포함)
    const svgEl = svgWrap?.querySelector('svg');
    modalSvg = svgEl ? svgEl.outerHTML : rendered.svg;
    modalOpen = true;
  }

  // SVG 컨테이너 ref — 렌더 후 g.round 요소에 직접 하이라이트 스타일 적용
  let svgWrap: HTMLDivElement | undefined = $state();
  const HIGHLIGHT_COLOR = '#3a3632';  // --text warm dark

  const STITCH_HIGHLIGHT_COLOR = '#e53935'; // 빨간색 — 현재 작업 코 강조

  $effect(() => {
    void $mode;
    void $currentRound;
    void $currentStitch;
    void rendered?.svg;
    if (!svgWrap) return;
    const groups = svgWrap.querySelectorAll<SVGGElement>('g.round[data-round]');
    if ($mode !== 'read') {
      groups.forEach((g) => {
        g.style.opacity = '';
        g.style.strokeWidth = '';
        g.style.color = '';
        clearStitchHighlight(g);
      });
      return;
    }
    // 이전 하이라이트 배경 제거
    svgWrap.querySelectorAll('.round-highlight-bg').forEach((el) => el.remove());

    const cr = $currentRound;
    groups.forEach((g) => {
      const round = parseInt(g.dataset.round ?? '0', 10);
      clearStitchHighlight(g);
      if (round === cr) {
        g.style.opacity = '1';
        g.style.strokeWidth = '2.6';
        g.style.color = HIGHLIGHT_COLOR;
        // 현재 단 뒤에 하이라이트 배경 삽입
        const isCircular = $pattern.shape === 'circular';
        if (isCircular) {
          insertDonutHighlight(g);
        } else {
          insertRectHighlight(g);
        }
        // 현재 코 하이라이트 (currentStitch 설정된 경우)
        if ($currentStitch !== null) {
          applyStitchHighlight(g, $currentStitch);
        }
      } else if (round < cr) {
        // 과거 단은 가장 연하게 (이미 완료된 단)
        g.style.opacity = '0.18';
        g.style.strokeWidth = '';
        g.style.color = '';
      } else {
        // 미래 단은 두 번째로 연하게 (앞으로 뜰 단)
        g.style.opacity = '0.45';
        g.style.strokeWidth = '';
        g.style.color = '';
      }
    });
  });

  /** 라운드 그룹의 N-번째 stitch 위치에 빨간 원 마커를 오버레이. */
  function applyStitchHighlight(g: SVGGElement, stitchIdx: number) {
    const children = Array.from(g.children).filter(
      (el) => el.tagName === 'use' || el.tagName === 'g',
    );
    const target = children[stitchIdx];
    if (!(target instanceof SVGElement)) return;

    // stitch 위치 추출. <use x="" y=""> 또는 <g transform="translate(x y) ...">
    let x = 0, y = 0;
    if (target.tagName === 'use') {
      x = parseFloat(target.getAttribute('x') || '0');
      y = parseFloat(target.getAttribute('y') || '0');
    } else {
      const m = (target.getAttribute('transform') || '').match(/translate\(\s*([-\d.]+)[\s,]+([-\d.]+)\s*\)/);
      if (m) { x = parseFloat(m[1]!); y = parseFloat(m[2]!); }
    }

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(x));
    circle.setAttribute('cy', String(y));
    circle.setAttribute('r', '14');
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', STITCH_HIGHLIGHT_COLOR);
    circle.setAttribute('stroke-width', '2');
    circle.classList.add('current-stitch-marker');
    g.appendChild(circle); // stitch 위에 덧그리기
  }

  /** 이전에 적용된 현재 코 원 마커 제거. */
  function clearStitchHighlight(g: SVGGElement) {
    g.querySelectorAll('.current-stitch-marker').forEach((el) => el.remove());
  }

  function insertRectHighlight(g: SVGGElement) {
    const bbox = g.getBBox();
    if (bbox.width <= 0 || bbox.height <= 0) return;
    const pad = 6;
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(bbox.x - pad));
    rect.setAttribute('y', String(bbox.y - pad));
    rect.setAttribute('width', String(bbox.width + pad * 2));
    rect.setAttribute('height', String(bbox.height + pad * 2));
    rect.setAttribute('rx', '4');
    rect.setAttribute('fill', '#fff9c4');
    rect.setAttribute('opacity', '0.5');
    rect.classList.add('round-highlight-bg');
    g.parentNode?.insertBefore(rect, g);
  }

  function insertDonutHighlight(g: SVGGElement) {
    // 기호 요소들의 원점 거리로 링 반지름 계산.
    // 일반 stitch 는 <use x="" y="">, V/A fan stitch 는 <g transform="translate(x y) ...">
    // 로 렌더되므로 양쪽 모두 처리.
    const elements = g.querySelectorAll('use, g[transform]');
    const distances: number[] = [];
    elements.forEach((el) => {
      const tag = el.tagName.toLowerCase();
      let x = 0, y = 0;
      if (tag === 'use') {
        x = parseFloat(el.getAttribute('x') || '0');
        y = parseFloat(el.getAttribute('y') || '0');
      } else {
        const tr = el.getAttribute('transform') || '';
        const m = tr.match(/translate\(\s*([-\d.]+)[\s,]+([-\d.]+)\s*\)/);
        if (!m) return;
        x = parseFloat(m[1]!);
        y = parseFloat(m[2]!);
      }
      const d = Math.sqrt(x * x + y * y);
      if (d > 0) distances.push(d);
    });
    if (distances.length === 0) {
      insertRectHighlight(g); // fallback (매직링 등)
      return;
    }
    const avgR = distances.reduce((a, b) => a + b, 0) / distances.length;
    const band = 10;
    const outerR = avgR + band;
    const innerR = Math.max(0, avgR - band);

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    // 도넛: 외원 시계방향 + 내원 반시계방향 (evenodd)
    const d = [
      `M ${outerR},0`,
      `A ${outerR},${outerR} 0 1,1 ${-outerR},0`,
      `A ${outerR},${outerR} 0 1,1 ${outerR},0 Z`,
      `M ${innerR},0`,
      `A ${innerR},${innerR} 0 1,0 ${-innerR},0`,
      `A ${innerR},${innerR} 0 1,0 ${innerR},0 Z`,
    ].join(' ');
    path.setAttribute('d', d);
    path.setAttribute('fill', '#fff9c4');
    path.setAttribute('opacity', '0.45');
    path.setAttribute('fill-rule', 'evenodd');
    path.classList.add('round-highlight-bg');
    g.parentNode?.insertBefore(path, g);
  }

</script>

<div class="chart-viewer">
  <div class="toolbar">
    <span class="spacer"></span>
    <button
      type="button"
      class="tool-btn toggle-btn"
      class:active={$showGrid}
      onclick={() => showGrid.update((v) => !v)}
      aria-pressed={$showGrid}
      title={$showGrid ? '그리드 숨기기' : '그리드 표시'}
    ><span class="grid-dot" class:on={$showGrid}></span> Grid {$showGrid ? 'On' : 'Off'}</button>
    <button
      type="button"
      class="tool-btn toggle-btn"
      class:active={$showConnections}
      onclick={() => showConnections.update((v) => !v)}
      aria-pressed={$showConnections}
      title={$showConnections ? '연결선 숨기기' : '연결선 표시'}
    ><span class="grid-dot" class:on={$showConnections}></span> Lines {$showConnections ? 'On' : 'Off'}</button>
    {#if $pattern.shape === 'flat'}
      <button
        type="button"
        class="tool-btn toggle-btn"
        class:active={$flatFlipVertical}
        onclick={() => flatFlipVertical.update((v) => !v)}
        aria-pressed={$flatFlipVertical}
        title={$flatFlipVertical ? '1단이 위 (반전됨)' : '1단이 아래 (기본). 클릭하여 반전'}
      >
        <i class="fa-solid fa-arrows-up-down"></i> {$flatFlipVertical ? '1단 ↑' : '1단 ↓'}
      </button>
      <div class="align-group" role="group" aria-label="좁은 단 정렬">
        {#each ['L', 'R', 'C'] as a (a)}
          <button
            type="button"
            class="tool-btn toggle-btn align-btn"
            class:active={$pattern.flatAlign === a}
            onclick={() => setFlatAlign(a as FlatAlign)}
            aria-pressed={$pattern.flatAlign === a}
            title={a === 'L' ? '왼쪽 정렬 (부모 오른쪽 공백)'
              : a === 'R' ? '오른쪽 정렬 (부모 왼쪽 공백)'
              : '가운데 정렬'}
          >{a}</button>
        {/each}
      </div>
    {/if}
  </div>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="scroll-area"
    ondblclick={openModal}
    title={rendered ? '더블클릭으로 확대' : ''}
  >
    {#if rendered}
      <div class="svg-wrap" bind:this={svgWrap}>
        {@html rendered.svg}
      </div>
    {:else}
      <p class="empty">도안 입력을 시작하세요</p>
    {/if}
  </div>
</div>

{#if modalOpen && rendered}
  <ZoomModal
    svg={modalSvg || rendered.svg}
    svgWidth={rendered.width}
    svgHeight={rendered.height}
    onClose={() => { modalOpen = false; }}
  />
{/if}

<style>
  .chart-viewer {
    background: var(--bg-card);
    border: 1px solid var(--border-light);
    border-radius: var(--radius);
    box-shadow: var(--shadow-sm);
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }
  .toolbar {
    display: flex;
    gap: 4px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--border-light);
    justify-content: flex-end;
    align-items: center;
    background: var(--bg-warm);
  }
  .tool-btn {
    height: 28px;
    padding: 0 10px;
    border: 1px solid var(--border-light);
    border-radius: var(--radius-sm);
    background: var(--bg-card);
    font-size: 13px;
    cursor: pointer;
    color: var(--text-secondary);
    transition: all 0.15s;
  }
  .tool-btn:hover:not(:disabled) {
    background: var(--bg-hover);
    border-color: var(--border);
    color: var(--text);
  }
  .tool-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
  .spacer {
    flex: 1;
  }
  .align-group {
    display: inline-flex;
    gap: 0;
  }
  .align-btn {
    width: 24px;
    padding: 0;
    border-radius: 0;
    font-weight: 600;
  }
  .align-btn:first-child {
    border-top-left-radius: var(--radius-sm);
    border-bottom-left-radius: var(--radius-sm);
  }
  .align-btn:last-child {
    border-top-right-radius: var(--radius-sm);
    border-bottom-right-radius: var(--radius-sm);
  }
  .align-btn + .align-btn {
    border-left: 0;
  }
  .align-btn.active {
    background: var(--bg-hover);
    color: var(--text);
  }
  .grid-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--text-muted, #9aa0a6);
    margin-right: 2px;
    vertical-align: middle;
    transition: background 0.15s;
  }
  .grid-dot.on {
    background: #4caf50;
  }
  .scroll-area {
    flex: 1;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
    padding: 20px;
    cursor: zoom-in;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .svg-wrap {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }
  /* SVG viewBox 는 preserveAspectRatio=xMidYMid meet(기본)로 contain-fit.
     도안 전체가 컨테이너에 항상 들어오고, 디테일은 더블클릭으로 확대. */
  .svg-wrap :global(svg) {
    width: 100%;
    height: 100%;
    display: block;
  }
  .empty {
    color: #999;
    font-size: 14px;
    margin: auto;
    cursor: default;
  }
</style>
