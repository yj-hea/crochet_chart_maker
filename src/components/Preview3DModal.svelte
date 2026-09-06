<script lang="ts">
  /**
   * 도안의 입체 형태 미리보기.
   *
   * 코 하나를 실제 비율의 육면체 비즈로 두고, 코 사이 연결을 실로 보아 3D 배치를
   * 푼다 (`$lib/preview3d`). 늘림·줄임이 만드는 형태 — 원판인지 공인지 주름이
   * 잡히는지 — 를 뜨기 전에 확인하는 것이 목적이라, 실 한 올까지 그리지는 않는다.
   */
  import * as THREE from 'three';
  import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
  import { ViewHelper } from 'three/examples/jsm/helpers/ViewHelper.js';
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
  // `$state` 로 두면 안 된다. 아래 `$effect` 가 이 값들을 읽으므로 카메라를 움직일
  // 때마다 형태를 처음부터 다시 푼다. 화면 갱신은 렌더 루프가 하므로 반응성이 필요 없다.
  let savedEye: THREE.Vector3 | undefined;
  let savedTarget: THREE.Vector3 | undefined;

  /** 헤더의 "처음 각도" 버튼 → 지금 살아 있는 뷰를 되돌린다 */
  let resetView: (() => void) | undefined;

  /** 기본 시점 — 살짝 위에서 비스듬히 */
  const DEFAULT_YAW = 0.6;
  const DEFAULT_PITCH = 0.5;

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
    const defaultEye = new THREE.Vector3(
      distance * Math.cos(DEFAULT_PITCH) * Math.sin(DEFAULT_YAW),
      distance * Math.sin(DEFAULT_PITCH),
      distance * Math.cos(DEFAULT_PITCH) * Math.cos(DEFAULT_YAW),
    );
    camera.position.copy(savedEye ?? defaultEye);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    // 캔버스는 옅은 판보다 위, 축 클릭 판보다 아래
    renderer.domElement.style.position = 'relative';
    renderer.domElement.style.zIndex = '1';
    // 기즈모는 화면 한쪽에 덧그리는 두 번째 렌더다. 자동 지우기를 켜 두면 그 렌더가
    // 화면 전체를 지워 모델이 사라지므로, 지우는 시점을 draw() 가 직접 잡는다.
    renderer.autoClear = false;
    wrap.appendChild(renderer.domElement);

    // 궤도 조작 — 회전(왼쪽 끌기) · 이동(오른쪽 끌기 / Shift+끌기 / 두 손가락) ·
    // 확대(휠 / 핀치). 직접 짜면 이동·터치·관성이 매번 빠져서 three 의 것을 쓴다.
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    // 화면 평면 그대로 끌리도록 — 모델링 프로그램의 이동과 같은 감각
    controls.screenSpacePanning = true;
    controls.minDistance = Math.max(0.01, model.radius * 0.15);
    controls.maxDistance = distance * 8;
    controls.target.copy(savedTarget ?? new THREE.Vector3());
    controls.update();

    // 축 핸들 — 오른쪽 아래 X/Y/Z 기즈모. 클릭하면 그 축에서 본 시점으로 돌아간다
    const viewHelper = new ViewHelper(camera, renderer.domElement);
    viewHelper.setLabels('X', 'Y', 'Z');
    // 옅은 판 — 배경 그라데이션에 축이 묻히지 않도록. 캔버스가 투명하므로
    // 캔버스 **뒤에** 깔아야 기즈모 색을 흐리지 않는다.
    const gizmoPlate = document.createElement('div');
    gizmoPlate.style.cssText =
      'position:absolute;right:20px;bottom:20px;width:88px;height:88px;border-radius:50%;'
      + 'background:rgba(255,255,255,0.55);box-shadow:0 1px 3px rgba(0,0,0,0.08);'
      + 'pointer-events:none;z-index:0;';
    wrap.insertBefore(gizmoPlate, renderer.domElement);
    // 기즈모가 가리는 자리에서는 회전 대신 축 클릭을 받는다
    const gizmoHit = document.createElement('div');
    gizmoHit.style.cssText =
      'position:absolute;right:0;bottom:0;width:128px;height:128px;cursor:pointer;z-index:3;';
    wrap.appendChild(gizmoHit);

    function resize() {
      const w = wrap!.clientWidth;
      const h = wrap!.clientHeight;
      if (w === 0 || h === 0) return;
      // CSS 크기까지 맞춘다 — 고해상도 화면에서 캔버스가 스테이지보다 커지는 것을 막고,
      // 기즈모(ViewHelper)가 offsetWidth 로 잡는 자리도 맞아떨어진다
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }

    function draw() {
      renderer.clear();
      renderer.render(scene, camera);
      viewHelper.center.copy(controls.target);
      viewHelper.render(renderer);
    }

    // 관성·기즈모 애니메이션이 있으므로 프레임 루프를 돈다. 다만 실제로 움직일 때만
    // 그린다 — 가만히 두면 GPU 를 놀린다.
    const clock = new THREE.Clock();
    let needsDraw = true;
    let frame = 0;
    function tick() {
      frame = requestAnimationFrame(tick);
      const delta = clock.getDelta();
      let moved = false;
      if (viewHelper.animating) {
        viewHelper.update(delta);
        // 기즈모가 카메라를 직접 옮기므로 controls 는 끝난 뒤에 따라잡게 한다
        if (!viewHelper.animating) controls.update();
        moved = true;
      } else if (controls.update()) {
        moved = true;
      }
      if (moved || needsDraw) {
        needsDraw = false;
        draw();
      }
    }

    const onGizmoDown = (e: PointerEvent) => e.stopPropagation();
    const onGizmoClick = (e: MouseEvent) => {
      if (viewHelper.handleClick(e)) needsDraw = true;
    };
    gizmoHit.addEventListener('pointerdown', onGizmoDown);
    gizmoHit.addEventListener('click', onGizmoClick);

    resetView = () => {
      camera.position.copy(defaultEye);
      controls.target.set(0, 0, 0);
      controls.update();
      needsDraw = true;
    };

    const observer = new ResizeObserver(() => { resize(); needsDraw = true; });
    observer.observe(wrap);
    resize();
    tick();

    return () => {
      // 보던 시점을 기억해 뒀다가 옵션을 바꿔 다시 풀어도 그대로 이어 본다
      savedEye = camera.position.clone();
      savedTarget = controls.target.clone();
      resetView = undefined;
      cancelAnimationFrame(frame);
      observer.disconnect();
      gizmoHit.removeEventListener('pointerdown', onGizmoDown);
      gizmoHit.removeEventListener('click', onGizmoClick);
      gizmoHit.remove();
      gizmoPlate.remove();
      viewHelper.dispose();
      controls.dispose();
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
        <button
          type="button"
          class="icon-btn"
          onclick={() => resetView?.()}
          title="처음 각도로"
        >
          <i class="fa-solid fa-house"></i>
        </button>
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
      <span class="hint">
        끌어서 회전 · 오른쪽(또는 Shift+) 끌기로 이동 · 휠로 확대 · 오른쪽 아래 축 클릭
      </span>
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
    z-index: 2;
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
