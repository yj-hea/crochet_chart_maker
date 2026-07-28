<script lang="ts">
  import { pattern } from '$stores/pattern';
  import { mode, currentRound, currentStitch, showGrid, showConnections, flatFlipVertical, flatAlign, flatCascade, flatVAlign } from '$stores/mode';
  import { renderedChart } from '$stores/rendered';
  import ZoomModal from './ZoomModal.svelte';
  import { isValidGauge, stitchesToCm, rowsToCm } from '$lib/model/gauge';

  // 대바늘은 격자 도안이라 코바늘 전용 토글(연결선·세로 정렬)이 의미가 없다.
  const isKnit = $derived($pattern.craft === 'knit');
  // 대바늘은 원통/평면 모두 격자 → 정렬·상하 반전 토글을 항상 노출
  const showFlatTools = $derived(isKnit || $pattern.shape === 'flat');

  /**
   * 게이지 기반 실측 치수 — 가장 넓은 단의 코 수와 단 수로 완성 크기를 어림한다.
   * (늘림·줄임으로 단마다 코 수가 다르면 최대 폭 기준)
   */
  const physicalSize = $derived.by(() => {
    const g = $pattern.gauge;
    if (!isKnit || !isValidGauge(g)) return null;
    let maxStitches = 0;
    let rows = 0;
    for (const r of $pattern.rounds) {
      const total = r.expanded?.totalProduce ?? 0;
      if (total === 0) continue;
      rows++;
      if (total > maxStitches) maxStitches = total;
    }
    if (rows === 0 || maxStitches === 0) return null;
    return {
      stitches: maxStitches,
      rows,
      widthCm: stitchesToCm(maxStitches, g),
      heightCm: rowsToCm(rows, g),
    };
  });

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
    // 같은 단 내 chain-as-parent stack 으로 r 편차가 큼 → min/max 로 전체 코를 감싸는 도넛.
    const minR = Math.min(...distances);
    const maxR = Math.max(...distances);
    const pad = 10;
    const outerR = maxR + pad;
    const innerR = Math.max(0, minR - pad);

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
    <div class="btn-group">
      <button
        type="button"
        class="tool-btn toggle-btn"
        class:active={$showGrid}
        onclick={() => showGrid.update((v) => !v)}
        aria-pressed={$showGrid}
        title={$showGrid ? '그리드 숨기기' : '그리드 표시'}
      ><span class="grid-dot" class:on={$showGrid}></span> Grid {$showGrid ? 'On' : 'Off'}</button>
      {#if !isKnit}
        <button
          type="button"
          class="tool-btn toggle-btn"
          class:active={$showConnections}
          onclick={() => showConnections.update((v) => !v)}
          aria-pressed={$showConnections}
          title={$showConnections ? '연결선 숨기기' : '연결선 표시'}
        ><span class="grid-dot" class:on={$showConnections}></span> Lines {$showConnections ? 'On' : 'Off'}</button>
      {/if}
      {#if showFlatTools}
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
      {/if}
    </div>
    <div class="btn-group">
      {#if showFlatTools}
        <button
          type="button"
          class="tool-btn toggle-btn"
          onclick={() => flatAlign.update((v) => v === 'L' ? 'C' : v === 'C' ? 'R' : 'L')}
          title={
            $flatAlign === 'L' ? '좌측 정렬 (자식이 우측으로 펼쳐짐). 클릭: 가운데' :
            $flatAlign === 'C' ? '가운데 정렬. 클릭: 우측' :
            '우측 정렬 (자식이 좌측으로 펼쳐짐). 클릭: 좌측'
          }
        >
          <i class="fa-solid fa-align-{$flatAlign === 'L' ? 'left' : $flatAlign === 'R' ? 'right' : 'center'}"></i>
          {$flatAlign}
        </button>
      {/if}
      <button
        type="button"
        class="tool-btn toggle-btn"
        class:active={$flatCascade}
        onclick={() => flatCascade.update((v) => !v)}
        aria-pressed={$flatCascade}
        title={isKnit
          ? ($flatCascade ? 'Cascade 켜짐 — 늘림/줄임에 맞춰 부모 칸 폭 조정. 클릭: 끄기' : 'Cascade 꺼짐 — 모든 칸 균등 폭. 클릭: 켜기')
          : ($flatCascade ? 'Cascade 켜짐 (부모 위치로 정렬). 클릭: 끄기' : 'Cascade 꺼짐 (균등 간격). 클릭: 켜기')}
      >
        <span class="grid-dot" class:on={$flatCascade}></span> Cascade {$flatCascade ? 'On' : 'Off'}
      </button>
      {#if !isKnit}
        <button
          type="button"
          class="tool-btn toggle-btn"
          onclick={() => flatVAlign.update((v) => v === 'same' ? 'even' : 'same')}
          title={
            $flatVAlign === 'same'
              ? '같은 단 동일 위치 (기본). 클릭: 균등 간격 (부모로부터 일정 거리)'
              : '균등 간격 — 각 코가 부모 위치 + 자기 높이로 배치. 클릭: 동일 위치'
          }
        >
          <i class="fa-solid fa-{$flatVAlign === 'same' ? 'grip-lines' : 'arrows-up-to-line'}"></i>
          {$flatVAlign === 'same' ? '동일 위치' : '균등 간격'}
        </button>
      {/if}
    </div>
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
  {#if physicalSize}
    <div class="size-bar" title="게이지 기준 완성 크기 (가장 넓은 단 기준)">
      <i class="fa-solid fa-ruler-combined"></i>
      가로 {physicalSize.stitches}코 ≈ {physicalSize.widthCm.toFixed(1)}cm
      · 세로 {physicalSize.rows}단 ≈ {physicalSize.heightCm.toFixed(1)}cm
    </div>
  {/if}
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
    flex-wrap: wrap;
    row-gap: 4px;
    column-gap: 8px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--border-light);
    justify-content: flex-end;
    align-items: center;
    background: var(--bg-warm);
  }
  .btn-group {
    display: inline-flex;
    flex-wrap: nowrap;
    gap: 4px;
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
  .size-bar {
    flex-shrink: 0;
    padding: 4px 10px;
    border-top: 1px solid var(--border, #e2e2e2);
    font-size: 11px;
    color: var(--text-secondary, #666);
    text-align: right;
    white-space: nowrap;
    overflow-x: auto;
  }
  .empty {
    color: #999;
    font-size: 14px;
    margin: auto;
    cursor: default;
  }
</style>
