<script lang="ts">
  /**
   * 조립도 — 작품 전체를 한 장에 놓고 **조각 단위로** 자리를 다듬는 화면.
   *
   * 기호 하나하나를 고르는 도안 캔버스(`ChartCanvas`)와 달리, 여기서 집는 것은
   * **조각 하나**다. 레이아웃이 조각마다 경계를 알려 주므로(`pieceBoxes`) 그 사각형을
   * 그대로 집는 자리로 쓴다 — 기호를 하나씩 세지 않아도 된다.
   *
   * 다듬은 값은 조각(`Tab.assemblyAt`)에 쌓이고 자동 배치 위에 덧입혀진다.
   * 글(단 입력)은 없다 — 내용은 각 도안 탭에서 고친다.
   */
  import { assemblySheet } from '$stores/assembly';
  import { nudgePiece, resetPieceOffsets, pieceOffsetCount, workspace, switchTab } from '$stores/tabs';
  import { assemblyOpen } from '$stores/assembly';

  const MIN_ZOOM = 0.1;
  const MAX_ZOOM = 6;

  let area: HTMLDivElement | undefined = $state();
  let host: HTMLDivElement | undefined = $state();
  let areaW = $state(0);
  let areaH = $state(0);

  let zoom = $state(1);
  let panX = $state(0);
  let panY = $state(0);
  let touched = $state(false);

  /**
   * SVG 가 실제로 쓰는 viewBox — 무대 크기의 기준.
   * 도안 경계에는 여백·범례가 들어 있지 않아, 경계로 맞추면 아래가 잘린다.
   */
  let view = $state({ w: 0, h: 0 });

  let selected = $state<string | null>(null);

  const sheet = $derived($assemblySheet);
  /** 집을 수 있는 조각만 (id 가 있는 것) */
  const pieces = $derived((sheet?.pieces ?? []).filter((p) => p.id));

  /** 도안 좌표 → 화면 좌표 (무대 기준) */
  function svgEl(): SVGSVGElement | null {
    return host?.querySelector('svg') ?? null;
  }

  function toChart(clientX: number, clientY: number): { x: number; y: number } | null {
    const svg = svgEl();
    const m = svg?.getScreenCTM?.();
    if (!svg || !m) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }

  function toScreen(x: number, y: number): { x: number; y: number } | null {
    const svg = svgEl();
    const m = svg?.getScreenCTM?.();
    if (!svg || !m) return null;
    const p = new DOMPoint(x, y).matrixTransform(m);
    const r = area?.getBoundingClientRect();
    return { x: p.x - (r?.x ?? 0), y: p.y - (r?.y ?? 0) };
  }

  /** 조각 경계를 화면 사각형으로 — 테두리·핸들을 그릴 자리 */
  function screenBox(b: { minX: number; minY: number; maxX: number; maxY: number }) {
    const a = toScreen(b.minX, b.minY);
    const c = toScreen(b.maxX, b.maxY);
    if (!a || !c) return null;
    return { x: a.x, y: a.y, w: c.x - a.x, h: c.y - a.y };
  }

  /** 다시 그릴 때마다 테두리 자리를 새로 잡는다 */
  let boxTick = $state(0);
  $effect(() => {
    void sheet; void zoom; void panX; void panY; void selected;
    requestAnimationFrame(() => { boxTick++; });
  });
  const boxes = $derived.by(() => {
    void boxTick;
    return pieces
      .map((p) => ({ piece: p, box: screenBox(p.bounds) }))
      .filter((x): x is { piece: typeof pieces[number]; box: NonNullable<ReturnType<typeof screenBox>> } => !!x.box);
  });

  /** 다시 그릴 때마다 viewBox 를 따라간다 */
  function syncViewBox(): void {
    const b = svgEl()?.viewBox?.baseVal;
    if (!b || !b.width) return;
    view = { w: b.width, h: b.height };
  }

  function fit(): void {
    if (!sheet || !areaW || !areaH) return;
    const w = view.w || sheet.width;
    const h = view.h || sheet.height;
    const pad = 32;
    const z = Math.min((areaW - pad) / w, (areaH - pad) / h);
    zoom = clamp(Number.isFinite(z) && z > 0 ? z : 1);
    panX = (areaW - w * zoom) / 2;
    panY = (areaH - h * zoom) / 2;
    touched = false;
  }

  $effect(() => {
    void sheet?.svg;
    requestAnimationFrame(syncViewBox);
  });

  $effect(() => {
    void view.w; void view.h; void areaW; void areaH;
    if (!touched) fit();
  });

  function clamp(z: number): number {
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
  }

  function zoomAt(factor: number, cx: number, cy: number): void {
    const next = clamp(zoom * factor);
    if (next === zoom) return;
    panX = cx - (cx - panX) * (next / zoom);
    panY = cy - (cy - panY) * (next / zoom);
    zoom = next;
    touched = true;
  }

  function onWheel(e: WheelEvent) {
    if (!area) return;
    e.preventDefault();
    const r = area.getBoundingClientRect();
    zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
  }

  // ── 집어 옮기기 ─────────────────────────────────────────

  type DragKind = 'move' | 'rotate' | 'pan';
  interface DragState {
    kind: DragKind;
    id: string | null;
    startChart: { x: number; y: number } | null;
    startX: number;
    startY: number;
    panX0: number;
    panY0: number;
    /** 회전 기준 (조각 가운데, 화면 좌표) */
    cx: number;
    cy: number;
    startAngle: number;
    /** 미리보기 각도 (도) */
    preview: { dx: number; dy: number; rot: number };
  }
  let drag = $state<DragState | null>(null);

  /** 어느 조각을 눌렀는지 — 경계 사각형 중 **가장 작은** 것 (조각 안의 조각이 먼저) */
  function pieceAt(x: number, y: number): string | null {
    let hit: { id: string; area: number } | null = null;
    for (const { piece, box } of boxes) {
      if (x < box.x || x > box.x + box.w || y < box.y || y > box.y + box.h) continue;
      const a = box.w * box.h;
      if (!hit || a < hit.area) hit = { id: piece.id!, area: a };
    }
    return hit?.id ?? null;
  }

  function begin(kind: DragKind, e: PointerEvent, id: string | null): void {
    if (!area) return;
    const r = area.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const box = id ? boxes.find((b) => b.piece.id === id)?.box : undefined;
    const cx = box ? box.x + box.w / 2 : x;
    const cy = box ? box.y + box.h / 2 : y;
    drag = {
      kind, id,
      startChart: toChart(e.clientX, e.clientY),
      startX: x, startY: y,
      panX0: panX, panY0: panY,
      cx, cy,
      startAngle: Math.atan2(y - cy, x - cx),
      preview: { dx: 0, dy: 0, rot: 0 },
    };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }

  function onPointerDown(e: PointerEvent) {
    if (e.button === 1 || e.altKey) { begin('pan', e, null); return; }
    if (e.button !== 0 || !area) return;
    const r = area.getBoundingClientRect();
    const id = pieceAt(e.clientX - r.left, e.clientY - r.top);
    selected = id;
    if (id) begin('move', e, id);
    else begin('pan', e, null);
  }

  function onPointerMove(e: PointerEvent) {
    if (!drag || !area) return;
    const r = area.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (drag.kind === 'pan') {
      panX = drag.panX0 + (x - drag.startX);
      panY = drag.panY0 + (y - drag.startY);
      touched = true;
      return;
    }
    if (drag.kind === 'move') {
      const now = toChart(e.clientX, e.clientY);
      if (!now || !drag.startChart) return;
      drag.preview = { dx: now.x - drag.startChart.x, dy: now.y - drag.startChart.y, rot: 0 };
    } else {
      const angle = Math.atan2(y - drag.cy, x - drag.cx) - drag.startAngle;
      drag.preview = { dx: 0, dy: 0, rot: (angle * 180) / Math.PI };
    }
  }

  /**
   * 끄는 동안의 미리보기 — **테두리만** 따라 움직인다.
   *
   * 조각을 실제로 옮기려면 작품 전체를 다시 풀어야 해서(조각마다 레이아웃을 다시 잡는다)
   * 매 프레임 하기엔 무겁다. 손을 떼는 순간 한 번만 반영한다.
   */
  function ghostTransform(id: string, box: { x: number; y: number; w: number; h: number }): string {
    if (!drag || drag.id !== id) return '';
    const { dx, dy, rot } = drag.preview;
    if (rot) return `rotate(${rot.toFixed(1)} ${box.x + box.w / 2} ${box.y + box.h / 2})`;
    return `translate(${(dx * zoom).toFixed(1)} ${(dy * zoom).toFixed(1)})`;
  }

  function onPointerUp(e: PointerEvent) {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.kind === 'pan' || !d.id) return;
    const { dx, dy, rot } = d.preview;
    if (Math.abs(dx) < 0.4 && Math.abs(dy) < 0.4 && Math.abs(rot) < 0.5) return;
    touched = true;
    nudgePiece(d.id, d.kind === 'move' ? { dx, dy } : { rot });
    void e;
  }

  function openPiece(id: string): void {
    assemblyOpen.set(false);
    switchTab(id);
  }

  const selectedName = $derived(
    selected ? ($workspace.tabs.find((t) => t.id === selected)?.name ?? '조각') : '',
  );
</script>

<div class="assembly" bind:clientWidth={areaW} bind:clientHeight={areaH} bind:this={area}>
  {#if !sheet}
    <div class="empty">
      <p>아직 이어 붙인 조각이 없습니다.</p>
      <p class="hint">도안 탭에서 <strong>조각 잇기 · 이어받기</strong>를 지정하면 여기에 작품 전체가 그려집니다.</p>
    </div>
  {:else}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="viewport"
      class:dragging={drag?.kind === 'pan'}
      onwheel={onWheel}
      onpointerdown={onPointerDown}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
      onpointercancel={onPointerUp}
    >
      <div
        class="stage"
        style="width:{view.w || sheet.width}px;height:{view.h || sheet.height}px;transform:translate({panX}px,{panY}px) scale({zoom});"
      >
        <div class="svg-host" bind:this={host}>{@html sheet.svg}</div>
      </div>

      <svg class="overlay" width={areaW} height={areaH} aria-hidden="true">
        {#each boxes as b (b.piece.id)}
          <rect
            class="piece"
            class:on={b.piece.id === selected}
            class:ghost={drag?.id === b.piece.id}
            transform={ghostTransform(b.piece.id!, b.box)}
            x={b.box.x - 3} y={b.box.y - 3} width={b.box.w + 6} height={b.box.h + 6} rx="3"
          />
        {/each}
      </svg>

      {#each boxes as b (b.piece.id)}
        {#if b.piece.id === selected}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="handle rotate"
            style="left:{b.box.x + b.box.w / 2}px;top:{b.box.y - 22}px;"
            title="끌어서 회전 — 잇는 자리에 맞춰 돌립니다"
            onpointerdown={(e) => { e.stopPropagation(); begin('rotate', e, b.piece.id!); }}
            onpointermove={onPointerMove}
            onpointerup={onPointerUp}
          ></div>
        {/if}
      {/each}
    </div>
  {/if}

  <div class="status">
    <div class="left">
      {#if selected}
        <span class="sel">
          <strong>{selectedName}</strong>
          <button type="button" class="link" onclick={() => openPiece(selected!)}>도안 열기</button>
          <button type="button" class="link" onclick={() => resetPieceOffsets(selected!)}>자리 되돌리기</button>
        </span>
      {:else}
        <span class="hint">조각을 끌어 옮기기 · 위쪽 손잡이로 회전 · Alt+드래그 이동 · 휠 확대</span>
      {/if}
    </div>
    <div class="right">
      {#if $pieceOffsetCount > 0}
        <span class="moved"><i class="fa-solid fa-hand"></i> 옮긴 조각 {$pieceOffsetCount}개</span>
        <button type="button" class="link" onclick={() => resetPieceOffsets()}>배치 초기화</button>
      {/if}
      <button type="button" class="zoom-btn" onclick={() => zoomAt(1 / 1.25, areaW / 2, areaH / 2)} aria-label="축소">−</button>
      <button type="button" class="zoom-level" onclick={fit} title="화면에 맞추기">{Math.round(zoom * 100)}%</button>
      <button type="button" class="zoom-btn" onclick={() => zoomAt(1.25, areaW / 2, areaH / 2)} aria-label="확대">+</button>
    </div>
  </div>
</div>

<style>
  .assembly {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: var(--bg-card);
  }
  .viewport {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    touch-action: none;
  }
  .viewport.dragging { cursor: grabbing; }
  .stage {
    position: absolute;
    top: 0;
    left: 0;
    transform-origin: 0 0;
  }
  .svg-host :global(svg) {
    width: 100%;
    height: 100%;
    display: block;
  }
  .overlay {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
  }
  .overlay .piece {
    fill: transparent;
    stroke: rgba(80, 140, 255, 0.35);
    stroke-width: 1;
    stroke-dasharray: 5 4;
  }
  .overlay .piece.ghost {
    fill: rgba(80, 140, 255, 0.14);
    stroke: #4d86ff;
    stroke-dasharray: 4 3;
  }
  .overlay .piece.on {
    fill: rgba(80, 140, 255, 0.08);
    stroke: #4d86ff;
    stroke-dasharray: none;
  }
  .handle {
    position: absolute;
    width: 11px;
    height: 11px;
    margin: -5.5px 0 0 -5.5px;
    border: 1px solid #fff;
    border-radius: 50%;
    background: #4d86ff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
    cursor: grab;
    touch-action: none;
  }
  .empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: var(--text-secondary);
    font-size: 13px;
  }
  .status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 4px 10px;
    border-top: 1px solid var(--border-light);
    font-size: 11px;
    color: var(--text-secondary);
    min-height: 28px;
  }
  .status .right { display: flex; align-items: center; gap: 6px; }
  .sel { display: inline-flex; align-items: center; gap: 8px; }
  .moved { display: inline-flex; align-items: center; gap: 4px; }
  .hint { opacity: 0.75; }
  .link {
    border: none;
    background: transparent;
    color: var(--accent, #4d86ff);
    font-size: 11px;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: var(--radius-sm);
  }
  .link:hover { background: var(--bg-hover); }
  .zoom-btn,
  .zoom-level {
    border: 1px solid var(--border);
    background: var(--bg-card);
    color: var(--text-secondary);
    border-radius: var(--radius-sm);
    font-size: 11px;
    line-height: 1;
    padding: 3px 6px;
    cursor: pointer;
  }
  .zoom-level { min-width: 46px; }
  .zoom-btn:hover,
  .zoom-level:hover { background: var(--bg-hover); color: var(--text); }
</style>
