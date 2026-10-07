<script lang="ts">
  /**
   * 도안 캔버스 — 그려진 도안을 **고르고 옮길 수 있는** 작업 화면.
   *
   * 렌더러가 요소마다 `data-el` 키를 붙여 주므로(`layout/adjust`) 여기서는 DOM 에서
   * 그 키를 집어 선택·드래그·핸들만 처리한다. 확정된 값은 스토어에 보정값으로 쌓이고,
   * 다시 그린 SVG 에 transform 으로 반영된다 — 내보내기·확대 창도 같은 그림이 된다.
   *
   * 드래그 중에는 스토어를 건드리지 않고 DOM 의 transform 만 바꿔 미리 보여 준다
   * (코가 수백 개인 도안에서 매 프레임 다시 그리지 않기 위해).
   */
  import { onMount, tick } from 'svelte';
  import {
    adjustments, adjustCount, nudgeElements, setElementAdjust, resetAdjustments, undoAdjust,
  } from '$stores/tabs';
  import { describeKey, mergeAdjust, type Adjust } from '$lib/layout/adjust';

  interface Props {
    svg: string;
    /** 도안의 자연 크기 (SVG 사용자 단위) */
    width: number;
    height: number;
    /** false 면 보기 전용 (읽기 모드) */
    editable?: boolean;
    /** SVG 가 들어 있는 요소 — 부모가 하이라이트 등에 쓴다 */
    onHost?: (el: HTMLDivElement | undefined) => void;
    /** 더블클릭 — 부모가 확대 창을 연다 */
    onZoomRequest?: () => void;
  }
  let { svg, width, height, editable = true, onHost, onZoomRequest }: Props = $props();

  const MIN_ZOOM = 0.15;
  const MAX_ZOOM = 8;

  let area: HTMLDivElement | undefined = $state();
  let host: HTMLDivElement | undefined = $state();
  let areaW = $state(0);
  let areaH = $state(0);

  /**
   * SVG 가 실제로 쓰는 viewBox — 무대 크기와 화면 좌표의 기준.
   *
   * 도안 경계는 기호를 밖으로 끌어낼 때 넓어진다. 그러면 viewBox 의 원점이 움직여
   * 화면 전체가 밀리므로, 바뀐 만큼 pan 을 보정해 **보던 자리를 그대로** 둔다.
   */
  let view = $state({ x: 0, y: 0, w: 0, h: 0 });
  let viewReady = false;

  let zoom = $state(1);
  let panX = $state(0);
  let panY = $state(0);
  /** 사용자가 직접 확대·이동했는지 — 그 전까지는 크기가 바뀔 때마다 자동으로 맞춘다 */
  let touched = $state(false);

  let selected = $state<string[]>([]);
  /** 선택 테두리·핸들 좌표 (캔버스 화면 좌표) */
  let boxes = $state<Array<{ x: number; y: number; w: number; h: number }>>([]);
  let marquee = $state<{ x: number; y: number; w: number; h: number } | null>(null);

  $effect(() => { onHost?.(host); });

  /** 다시 그릴 때마다 viewBox 를 따라간다 */
  $effect(() => {
    void svg; void $adjustments;
    tick().then(syncViewBox);
  });

  function syncViewBox(): void {
    const b = svgEl()?.viewBox?.baseVal;
    if (!b || !b.width) return;
    const next = { x: b.x, y: b.y, w: b.width, h: b.height };
    if (viewReady && (next.x !== view.x || next.y !== view.y)) {
      panX += (next.x - view.x) * zoom;
      panY += (next.y - view.y) * zoom;
    }
    view = next;
    viewReady = true;
  }

  /** 도안 크기가 바뀌면 (아직 손대지 않았으면) 화면에 맞춘다 */
  $effect(() => {
    void width; void height; void areaW; void areaH;
    if (!touched) fit();
  });

  // 다시 그려지면 선택 테두리 위치도 다시 잡는다
  $effect(() => {
    void svg; void $adjustments; void zoom; void panX; void panY;
    void selected;
    tick().then(measure);
  });

  export function fit(): void {
    const w = view.w || width;
    const h = view.h || height;
    if (!areaW || !areaH || !w || !h) return;
    const pad = 24;
    const z = Math.min((areaW - pad) / w, (areaH - pad) / h);
    zoom = clamp(Number.isFinite(z) && z > 0 ? z : 1);
    panX = (areaW - w * zoom) / 2;
    panY = (areaH - h * zoom) / 2;
    touched = false;
  }

  function clamp(z: number): number {
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
  }

  function zoomAt(factor: number, cx: number, cy: number): void {
    const next = clamp(zoom * factor);
    if (next === zoom) return;
    // 커서 아래 지점이 제자리에 있도록 pan 을 보정한다
    panX = cx - (cx - panX) * (next / zoom);
    panY = cy - (cy - panY) * (next / zoom);
    zoom = next;
    touched = true;
  }

  function zoomBy(factor: number): void {
    zoomAt(factor, areaW / 2, areaH / 2);
  }

  function onWheel(e: WheelEvent) {
    if (!area) return;
    e.preventDefault();
    const r = area.getBoundingClientRect();
    zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
  }

  // ── 선택 ────────────────────────────────────────────────

  function keyAt(target: EventTarget | null): string | undefined {
    const el = (target as Element | null)?.closest?.('[data-el]');
    return (el as SVGElement | null)?.dataset?.el;
  }

  /**
   * 화면 좌표 ↔ 도안 좌표.
   *
   * 도안은 `viewBox`(여백·범례 포함)로 한 번, 캔버스의 확대·이동으로 또 한 번 변환된다.
   * 직접 계산하면 어긋나므로 SVG 가 들고 있는 실제 행렬을 쓴다.
   */
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
    return { x: p.x, y: p.y };
  }

  /** 요소가 스스로 알려주는 중심 (도안 좌표) — 잉크 경계로 짐작하지 않는다 */
  function centerOf(el: SVGGraphicsElement): { x: number; y: number } | null {
    const cx = Number(el.dataset.cx);
    const cy = Number(el.dataset.cy);
    return Number.isFinite(cx) && Number.isFinite(cy) ? { x: cx, y: cy } : null;
  }

  /**
   * 고른 요소들의 **지금 보이는** 중심 (도안 좌표).
   * `data-cx/cy` 는 자동 배치의 자리라, 이미 옮겨 둔 요소는 그만큼 더해 준다.
   */
  function centersOf(keys: ReadonlyArray<string>): Map<string, { x: number; y: number }> {
    const map = elementsByKey();
    const out = new Map<string, { x: number; y: number }>();
    for (const key of keys) {
      const el = map.get(key);
      const c = el ? centerOf(el) : null;
      if (!c) continue;
      const a = $adjustments[key];
      out.set(key, { x: c.x + (a?.dx ?? 0), y: c.y + (a?.dy ?? 0) });
    }
    return out;
  }

  /** 크기·회전의 기준점 — 하나면 그 기호의 중심, 여럿이면 중심들의 한가운데 */
  function pivotOf(centers: Map<string, { x: number; y: number }>): { x: number; y: number } | null {
    if (centers.size === 0) return null;
    const xs = [...centers.values()].map((c) => c.x);
    const ys = [...centers.values()].map((c) => c.y);
    return {
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      y: (Math.min(...ys) + Math.max(...ys)) / 2,
    };
  }

  function elementsByKey(): Map<string, SVGGraphicsElement> {
    const map = new Map<string, SVGGraphicsElement>();
    host?.querySelectorAll<SVGGraphicsElement>('[data-el]')
      .forEach((el) => { if (el.dataset.el) map.set(el.dataset.el, el); });
    return map;
  }

  /** 선택 테두리 — DOM 에서 실제 그려진 크기를 읽는다 */
  function measure(): void {
    if (!area || selected.length === 0) { boxes = []; return; }
    const base = area.getBoundingClientRect();
    const map = elementsByKey();
    const next: typeof boxes = [];
    for (const key of selected) {
      const el = map.get(key);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      next.push({ x: r.x - base.x, y: r.y - base.y, w: r.width, h: r.height });
    }
    boxes = next;
  }

  const groupBox = $derived.by(() => {
    if (boxes.length === 0) return null;
    const x1 = Math.min(...boxes.map((b) => b.x));
    const y1 = Math.min(...boxes.map((b) => b.y));
    const x2 = Math.max(...boxes.map((b) => b.x + b.w));
    const y2 = Math.max(...boxes.map((b) => b.y + b.h));
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  });

  function selectKey(key: string, add: boolean): void {
    if (add) {
      selected = selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key];
    } else if (!selected.includes(key)) {
      selected = [key];
    }
  }

  export function clearSelection(): void {
    selected = [];
  }

  // ── 드래그 ──────────────────────────────────────────────

  type DragKind = 'move' | 'scale' | 'rotate' | 'pan' | 'marquee';
  interface DragState {
    kind: DragKind;
    /** 시작 지점 (캔버스 화면 좌표) — 마키·화면 이동용 */
    startX: number;
    startY: number;
    /** 시작 지점 (도안 좌표) — 옮긴 거리를 재는 기준 */
    startChart: { x: number; y: number } | null;
    /** 드래그 시작 시점의 transform 속성 — 미리보기를 되돌릴 때 쓴다 */
    base: Map<string, string | null>;
    /** 고른 요소들의 원래 중심 (도안 좌표) */
    centers: Map<string, { x: number; y: number }>;
    /** 크기·회전의 기준점 (도안 좌표) */
    pivot: { x: number; y: number } | null;
    /** 기준점의 화면 좌표 — 끄는 거리·각도를 재는 데 쓴다 */
    cx: number;
    cy: number;
    startDist: number;
    startAngle: number;
    panX0: number;
    panY0: number;
  }
  let drag = $state<DragState | null>(null);

  function beginDrag(kind: DragKind, e: PointerEvent): void {
    if (!area) return;
    const r = area.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const base = new Map<string, string | null>();
    let centers = new Map<string, { x: number; y: number }>();
    if (kind === 'move' || kind === 'scale' || kind === 'rotate') {
      const map = elementsByKey();
      for (const key of selected) {
        const el = map.get(key);
        if (el) base.set(key, el.getAttribute('transform'));
      }
      // 미리보기 transform 이 붙기 **전**의 중심을 기억해 둔다
      centers = centersOf(selected);
    }
    const pivot = pivotOf(centers);
    const pivotScreen = pivot ? toScreen(pivot.x, pivot.y) : null;
    const cx = pivotScreen ? pivotScreen.x - r.left : x;
    const cy = pivotScreen ? pivotScreen.y - r.top : y;
    drag = {
      kind, startX: x, startY: y, base, centers, pivot, cx, cy,
      startChart: toChart(e.clientX, e.clientY),
      startDist: Math.hypot(x - cx, y - cy) || 1,
      startAngle: Math.atan2(y - cy, x - cx),
      panX0: panX, panY0: panY,
    };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }

  function onPointerDown(e: PointerEvent) {
    if (e.button === 1 || e.shiftKey && e.button === 2) { beginDrag('pan', e); return; }
    if (e.button !== 0) return;
    const key = keyAt(e.target);
    if (!editable) { beginDrag('pan', e); return; }
    if (key) {
      selectKey(key, e.shiftKey || e.metaKey || e.ctrlKey);
      tick().then(() => { measure(); });
      beginDrag('move', e);
    } else if (e.altKey) {
      beginDrag('pan', e);
    } else {
      if (!e.shiftKey) selected = [];
      beginDrag('marquee', e);
    }
  }

  function onPointerMove(e: PointerEvent) {
    if (!drag || !area) return;
    const r = area.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const dx = x - drag.startX;
    const dy = y - drag.startY;

    if (drag.kind === 'pan') {
      panX = drag.panX0 + dx;
      panY = drag.panY0 + dy;
      touched = true;
      return;
    }
    if (drag.kind === 'marquee') {
      marquee = { x: Math.min(x, drag.startX), y: Math.min(y, drag.startY), w: Math.abs(dx), h: Math.abs(dy) };
      return;
    }
    previewTransform(previewDelta(drag, e, x, y));
  }

  /** 지금 드래그가 만들어 내는 보정값 (도안 좌표계) */
  function previewDelta(d: DragState, e: PointerEvent, x: number, y: number): Adjust {
    if (d.kind === 'move') {
      const now = toChart(e.clientX, e.clientY);
      if (!now || !d.startChart) return {};
      return { dx: now.x - d.startChart.x, dy: now.y - d.startChart.y };
    }
    if (d.kind === 'scale') {
      const dist = Math.hypot(x - d.cx, y - d.cy);
      return { scale: Math.max(0.2, Math.min(5, dist / d.startDist)) };
    }
    const angle = Math.atan2(y - d.cy, x - d.cx) - d.startAngle;
    return { rot: (angle * 180) / Math.PI };
  }

  /** 스토어를 건드리지 않고 DOM 에만 먼저 반영 */
  function previewTransform(delta: Adjust): void {
    if (!drag || !area) return;
    const map = elementsByKey();
    const gx = drag.pivot?.x ?? 0;
    const gy = drag.pivot?.y ?? 0;
    for (const key of selected) {
      const el = map.get(key);
      if (!el) continue;
      const original = drag.base.get(key) ?? '';
      const parts: string[] = [];
      if (delta.dx || delta.dy) parts.push(`translate(${f(delta.dx ?? 0)} ${f(delta.dy ?? 0)})`);
      if (delta.rot) parts.push(`rotate(${f(delta.rot)} ${f(gx)} ${f(gy)})`);
      if (delta.scale && delta.scale !== 1) {
        parts.push(`translate(${f(gx)} ${f(gy)}) scale(${f(delta.scale)}) translate(${f(-gx)} ${f(-gy)})`);
      }
      const next = [...parts, original].filter(Boolean).join(' ');
      if (next) el.setAttribute('transform', next);
      else el.removeAttribute('transform');
    }
    measure();
  }

  function onPointerUp(e: PointerEvent) {
    if (!drag || !area) return;
    const r = area.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const d = drag;
    drag = null;

    if (d.kind === 'pan') return;
    if (d.kind === 'marquee') {
      const box = marquee;
      marquee = null;
      if (box && (box.w > 3 || box.h > 3)) selectInBox(box, e.shiftKey);
      return;
    }

    const delta = previewDelta(d, e, x, y);
    if (isNoop(delta)) { restore(d); return; }

    // 옮긴 기호가 도안 밖으로 나가면 경계가 넓어진다 — 그때 화면이 다시 맞춰지면
    // 작업하던 자리가 흔들리므로, 한 번 다듬기 시작하면 자동 맞춤을 멈춘다
    touched = true;

    if (d.kind === 'move') {
      nudgeElements(selected, delta);
    } else {
      // 기준점 둘레로 키우거나 돌리면 각 요소는 제자리도 함께 옮겨진다
      const gx = d.pivot?.x ?? 0;
      const gy = d.pivot?.y ?? 0;
      const entries: Record<string, Adjust> = {};
      for (const key of selected) {
        const c = d.centers.get(key);
        if (!c) continue;
        const vx = c.x - gx;
        const vy = c.y - gy;
        let nx = vx;
        let ny = vy;
        if (delta.scale) { nx *= delta.scale; ny *= delta.scale; }
        if (delta.rot) {
          const a = (delta.rot * Math.PI) / 180;
          const rx = nx * Math.cos(a) - ny * Math.sin(a);
          const ry = nx * Math.sin(a) + ny * Math.cos(a);
          nx = rx; ny = ry;
        }
        entries[key] = mergeAdjust($adjustments[key], {
          dx: nx - vx,
          dy: ny - vy,
          ...(delta.scale ? { scale: delta.scale } : {}),
          ...(delta.rot ? { rot: delta.rot } : {}),
        });
      }
      setElementAdjust(entries);
    }
  }

  function isNoop(d: Adjust): boolean {
    return Math.abs(d.dx ?? 0) < 0.4 && Math.abs(d.dy ?? 0) < 0.4
      && Math.abs((d.scale ?? 1) - 1) < 0.01 && Math.abs(d.rot ?? 0) < 0.5;
  }

  /** 미리보기 transform 을 원래대로 (움직이지 않았을 때) */
  function restore(d: DragState): void {
    const map = elementsByKey();
    for (const [key, value] of d.base) {
      const el = map.get(key);
      if (!el) continue;
      if (value) el.setAttribute('transform', value);
      else el.removeAttribute('transform');
    }
    measure();
  }

  function selectInBox(box: { x: number; y: number; w: number; h: number }, add: boolean): void {
    if (!area) return;
    const base = area.getBoundingClientRect();
    const hits: string[] = [];
    for (const [key, el] of elementsByKey()) {
      const r = el.getBoundingClientRect();
      const x = r.x - base.x;
      const y = r.y - base.y;
      if (x + r.width >= box.x && x <= box.x + box.w && y + r.height >= box.y && y <= box.y + box.h) {
        hits.push(key);
      }
    }
    selected = add ? [...new Set([...selected, ...hits])] : hits;
  }

  function f(n: number): string {
    return Number.isInteger(n) ? String(n) : n.toFixed(2);
  }

  // ── 키보드 ──────────────────────────────────────────────

  function onKey(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement | null)?.isContentEditable) return;
    if (e.key === 'Escape') { selected = []; return; }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      if (undoAdjust()) e.preventDefault();
      return;
    }
    if (!editable || selected.length === 0) return;
    const step = e.shiftKey ? 5 : 1;
    const move: Record<string, Adjust> = {
      ArrowLeft: { dx: -step }, ArrowRight: { dx: step },
      ArrowUp: { dy: -step }, ArrowDown: { dy: step },
    };
    const delta = move[e.key];
    if (delta) {
      e.preventDefault();
      nudgeElements(selected, delta);
    }
  }

  onMount(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
</script>

<div class="canvas" bind:clientWidth={areaW} bind:clientHeight={areaH} bind:this={area}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="viewport"
    class:editing={editable}
    class:dragging={drag?.kind === 'pan'}
    onwheel={onWheel}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
    ondblclick={() => onZoomRequest?.()}
  >
    <div
      class="stage"
      style="width:{view.w || width}px;height:{view.h || height}px;transform:translate({panX}px,{panY}px) scale({zoom});"
    >
      <div class="svg-host" bind:this={host}>{@html svg}</div>
    </div>

    <svg class="overlay" width={areaW} height={areaH} aria-hidden="true">
      {#each boxes as b, i (i)}
        <rect class="sel" x={b.x - 2} y={b.y - 2} width={b.w + 4} height={b.h + 4} rx="2" />
      {/each}
      {#if groupBox && editable}
        <rect class="group" x={groupBox.x - 4} y={groupBox.y - 4} width={groupBox.w + 8} height={groupBox.h + 8} />
        <line class="stem" x1={groupBox.x + groupBox.w / 2} y1={groupBox.y - 4}
              x2={groupBox.x + groupBox.w / 2} y2={groupBox.y - 20} />
      {/if}
      {#if marquee}
        <rect class="marquee" x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h} />
      {/if}
    </svg>

    {#if groupBox && editable}
      <!-- 핸들은 포인터를 받아야 해서 SVG 밖의 버튼으로 둔다 -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="handle scale"
        style="left:{groupBox.x + groupBox.w + 4}px;top:{groupBox.y + groupBox.h + 4}px;"
        title="끌어서 크기 조절"
        onpointerdown={(e) => { e.stopPropagation(); beginDrag('scale', e); }}
        onpointermove={onPointerMove}
        onpointerup={onPointerUp}
      ></div>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="handle rotate"
        style="left:{groupBox.x + groupBox.w / 2}px;top:{groupBox.y - 20}px;"
        title="끌어서 회전"
        onpointerdown={(e) => { e.stopPropagation(); beginDrag('rotate', e); }}
        onpointermove={onPointerMove}
        onpointerup={onPointerUp}
      ></div>
    {/if}
  </div>

  <div class="status">
    <div class="left">
      {#if selected.length > 0}
        <span class="sel-info">
          {selected.length === 1 ? describeKey(selected[0]!) : `${selected.length}개 선택`}
          <button type="button" class="link" onclick={() => resetAdjustments(selected)}>이 자리 되돌리기</button>
        </span>
      {:else if editable}
        <span class="hint">끌어서 고르기 · 기호를 끌어 옮기기 · Alt+드래그 이동 · 휠 확대</span>
      {/if}
    </div>
    <div class="right">
      {#if $adjustCount > 0}
        <span class="adjusted" title="자동 배치 위에 손으로 다듬은 요소 수">
          <i class="fa-solid fa-hand"></i> 손으로 옮긴 {$adjustCount}개
        </span>
        <button type="button" class="link" onclick={() => resetAdjustments()}>배치 초기화</button>
      {/if}
      <button type="button" class="zoom-btn" onclick={() => zoomBy(1 / 1.25)} aria-label="축소">−</button>
      <button type="button" class="zoom-level" onclick={fit} title="화면에 맞추기">{Math.round(zoom * 100)}%</button>
      <button type="button" class="zoom-btn" onclick={() => zoomBy(1.25)} aria-label="확대">+</button>
    </div>
  </div>
</div>

<style>
  .canvas {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .viewport {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    background: var(--bg-card);
    touch-action: none;
  }
  .viewport.editing { cursor: default; }
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
  /* 기호 위에서는 집을 수 있다는 표시 */
  .viewport.editing .svg-host :global([data-el]) { cursor: move; }
  .overlay {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
  }
  .overlay .sel {
    fill: rgba(80, 140, 255, 0.12);
    stroke: #4d86ff;
    stroke-width: 1;
  }
  .overlay .group {
    fill: none;
    stroke: #4d86ff;
    stroke-width: 1;
    stroke-dasharray: 4 3;
  }
  .overlay .stem { stroke: #4d86ff; stroke-width: 1; }
  .overlay .marquee {
    fill: rgba(80, 140, 255, 0.1);
    stroke: #4d86ff;
    stroke-width: 1;
    stroke-dasharray: 3 2;
  }
  .handle {
    position: absolute;
    width: 11px;
    height: 11px;
    margin: -5.5px 0 0 -5.5px;
    border: 1px solid #fff;
    border-radius: 2px;
    background: #4d86ff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
    touch-action: none;
  }
  .handle.scale { cursor: nwse-resize; }
  .handle.rotate { border-radius: 50%; cursor: grab; }
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
  .status .right {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .hint { opacity: 0.75; }
  .sel-info { display: inline-flex; align-items: center; gap: 8px; }
  .adjusted { display: inline-flex; align-items: center; gap: 4px; }
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
