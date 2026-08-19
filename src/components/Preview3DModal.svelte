<script lang="ts">
  /**
   * 도안의 입체 형태 미리보기.
   *
   * 코 하나를 실제 비율의 육면체 비즈로 두고, 코 사이 연결을 실로 보아 3D 배치를
   * 푼다 (`$lib/preview3d`). 늘림·줄임이 만드는 형태 — 원판인지 공인지 주름이
   * 잡히는지 — 를 뜨기 전에 확인하는 것이 목적이라, 실 한 올까지 그리지는 않는다.
   */
  import * as THREE from 'three';
  import { chartLayout } from '$stores/rendered';
  import { pattern } from '$stores/tabs';
  import { buildPreview3D, FABRIC_THICKNESS } from '$lib/preview3d';
  import { buildStitchMesh } from '$lib/preview3d/mesh';

  interface Props {
    onClose: () => void;
  }
  let { onClose }: Props = $props();

  let canvasWrap: HTMLDivElement | undefined = $state();
  /** 계산이 끝나기 전까지 보여줄 안내 */
  let status = $state('형태를 푸는 중…');
  let residual = $state(0);
  let stitchCount = $state(0);
  /** 솜을 채운 것처럼 부풀릴지 */
  let stuffed = $state(true);
  let showWireframe = $state(false);

  /** 왕복뜨기(평면)는 단이 고리가 아니라 띠다 — 양 끝을 이으면 안 된다 */
  const isCircular = $derived($pattern.shape !== 'flat');

  // 카메라는 옵션 바깥에 둔다 — 솜 채움이나 뼈대를 켤 때마다 보던 각도가 처음으로
  // 돌아가면, 정작 비교하려던 차이를 못 본다.
  //
  // `$state` 로 두면 안 된다. 아래 `$effect` 가 이 값들을 읽으므로 마우스를 움직일
  // 때마다 형태를 처음부터 다시 푼다. 화면 갱신은 `draw()` 를 직접 불러 하므로
  // 반응성이 필요 없다.
  let yaw = 0.6;
  let pitch = 0.5;
  let zoom = 1;

  // 큰 도안은 반복을 줄여 화면이 멈추지 않게 한다. 코 수가 늘수록 한 번의 반복도
  // 비싸지므로, 총 계산량이 대략 일정하도록 반비례로 잡는다.
  function iterationsFor(count: number): number {
    if (count <= 200) return 400;
    if (count <= 600) return 250;
    return 150;
  }

  $effect(() => {
    const wrap = canvasWrap;
    const layout = $chartLayout;
    // 옵션이 바뀌면 처음부터 다시 푼다
    const inflate = stuffed;
    const wire = showWireframe;
    const circular = isCircular;
    if (!wrap) return;

    if (!layout || layout.layout.stitches.length === 0) {
      status = '도안이 비어 있습니다';
      return;
    }

    const stitches = layout.layout.stitches;
    const solved = buildPreview3D(stitches, {
      closed: circular,
      iterations: iterationsFor(stitches.length),
      stuffing: inflate ? 0.02 : 0,
    });
    residual = solved.residual;
    stitchCount = solved.graph.nodes.length;
    status = '';

    const scene = new THREE.Scene();
    scene.background = null;
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(4, 6, 8);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.5);
    fill.position.set(-5, -3, -4);
    scene.add(fill);

    const model = buildStitchMesh(solved, stitches, wire);
    scene.add(model.object);

    // 모델이 화면에 꽉 차도록 카메라 거리를 반지름에서 역산한다
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    // 45° 화각의 절반이 22.5° — 그 각으로 모델 반지름을 담는 거리에 여유를 조금 둔다
    const distance = (model.radius / Math.sin((45 * Math.PI) / 360)) * 1.15;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    wrap.appendChild(renderer.domElement);

    // 궤도 조작 — OrbitControls 를 끌어오는 대신 필요한 만큼만 직접 쓴다
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    function place() {
      const d = distance * zoom;
      camera.position.set(
        d * Math.cos(pitch) * Math.sin(yaw),
        d * Math.sin(pitch),
        d * Math.cos(pitch) * Math.cos(yaw),
      );
      camera.lookAt(0, 0, 0);
    }

    function resize() {
      const w = wrap!.clientWidth;
      const h = wrap!.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }

    function draw() {
      place();
      renderer.render(scene, camera);
    }

    const onPointerDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      renderer.domElement.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      yaw -= (e.clientX - lastX) * 0.01;
      pitch = Math.max(-1.5, Math.min(1.5, pitch + (e.clientY - lastY) * 0.01));
      lastX = e.clientX;
      lastY = e.clientY;
      draw();
    };
    const onPointerUp = (e: PointerEvent) => {
      dragging = false;
      renderer.domElement.releasePointerCapture(e.pointerId);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoom = Math.max(0.3, Math.min(4, zoom * (e.deltaY > 0 ? 1.1 : 0.9)));
      draw();
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    const observer = new ResizeObserver(() => { resize(); draw(); });
    observer.observe(wrap);
    resize();
    draw();

    return () => {
      observer.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      model.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="backdrop" role="presentation" onclick={onClose}>
  <div class="modal" role="dialog" aria-label="3D 미리보기" tabindex="-1" onclick={(e) => e.stopPropagation()}>
    <div class="header">
      <span class="title"><i class="fa-solid fa-cube"></i> 3D 미리보기</span>
      <div class="tools">
        <label class="toggle">
          <input type="checkbox" bind:checked={stuffed} /> 솜 채움
        </label>
        <label class="toggle">
          <input type="checkbox" bind:checked={showWireframe} /> 뼈대
        </label>
        <button type="button" class="icon-btn" onclick={onClose} title="닫기">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    </div>

    <div class="stage" bind:this={canvasWrap}>
      {#if status}
        <div class="status">{status}</div>
      {/if}
    </div>

    <div class="footer">
      <span>코 {stitchCount}개 · 두께 {FABRIC_THICKNESS}코</span>
      {#if !isCircular}
        <span class="warn"><i class="fa-solid fa-triangle-exclamation"></i> 평면 도안은 어림값입니다</span>
      {:else if residual > 0.1}
        <span class="warn">
          <i class="fa-solid fa-triangle-exclamation"></i>
          형태가 무리합니다 (오차 {residual.toFixed(2)}코) — 늘림이 과할 수 있습니다
        </span>
      {/if}
      <span class="hint">끌어서 회전 · 휠로 확대</span>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 900;
  }
  .modal {
    width: min(880px, calc(100vw - 32px));
    height: min(680px, calc(100vh - 32px));
    display: flex;
    flex-direction: column;
    background: var(--bg, #fff);
    border-radius: var(--radius, 8px);
    box-shadow: var(--shadow-md, 0 8px 32px rgba(0, 0, 0, 0.25));
    overflow: hidden;
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  }
  .title {
    font-weight: 600;
    font-size: 14px;
  }
  .tools {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .toggle {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    cursor: pointer;
    user-select: none;
  }
  .icon-btn {
    width: 26px;
    height: 26px;
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 14px;
    border-radius: 4px;
  }
  .icon-btn:hover {
    background: rgba(0, 0, 0, 0.08);
  }
  .stage {
    position: relative;
    flex: 1;
    min-height: 0;
    background: linear-gradient(180deg, #f3f5f8 0%, #e6eaf0 100%);
    touch-action: none;
    cursor: grab;
  }
  .stage:active {
    cursor: grabbing;
  }
  .status {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    color: rgba(0, 0, 0, 0.55);
  }
  .footer {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 14px;
    border-top: 1px solid rgba(0, 0, 0, 0.1);
    font-size: 11.5px;
    color: rgba(0, 0, 0, 0.6);
  }
  .hint {
    margin-left: auto;
  }
  .warn {
    color: #b26a00;
  }
</style>
