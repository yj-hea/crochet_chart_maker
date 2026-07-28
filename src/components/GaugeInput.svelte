<script lang="ts">
  /**
   * 게이지 입력 — 10cm 당 코수 / 단수.
   *
   * 대바늘 전용. 셀 세로 길이와 미리보기 실측 치수에 반영된다.
   * 비우면 게이지 해제 (기본 비율 1:0.7).
   */
  import { pattern } from '$stores/pattern';
  import { setGauge } from '$stores/tabs';
  import { GAUGE_MIN, GAUGE_MAX } from '$lib/model/gauge';

  const gauge = $derived($pattern.gauge);
  // 입력 중 임시값 — 한쪽만 채운 상태에서도 타이핑을 이어갈 수 있게
  let stitchesText = $state('');
  let rowsText = $state('');
  let editing = $state(false);

  $effect(() => {
    if (editing) return;
    stitchesText = gauge ? String(gauge.stitches) : '';
    rowsText = gauge ? String(gauge.rows) : '';
  });

  function commit() {
    editing = false;
    const s = Number(stitchesText);
    const r = Number(rowsText);
    if (!stitchesText.trim() || !rowsText.trim() || !Number.isFinite(s) || !Number.isFinite(r)) {
      setGauge(undefined);
      return;
    }
    const clamp = (v: number) => Math.min(GAUGE_MAX, Math.max(GAUGE_MIN, Math.round(v)));
    setGauge({ stitches: clamp(s), rows: clamp(r) });
  }
</script>

<div class="gauge" title="10cm 당 코수 × 단수. 비우면 기본 비율(1:0.7)로 그립니다">
  <span class="label">게이지</span>
  <input
    type="number"
    class="num"
    min={GAUGE_MIN}
    max={GAUGE_MAX}
    placeholder="코"
    bind:value={stitchesText}
    oninput={() => (editing = true)}
    onblur={commit}
    onkeydown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }}
    aria-label="10cm 당 코 수"
  />
  <span class="times">코 ×</span>
  <input
    type="number"
    class="num"
    min={GAUGE_MIN}
    max={GAUGE_MAX}
    placeholder="단"
    bind:value={rowsText}
    oninput={() => (editing = true)}
    onblur={commit}
    onkeydown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }}
    aria-label="10cm 당 단 수"
  />
  <span class="unit">단 / 10cm</span>
</div>

<style>
  .gauge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--text-secondary, #666);
    white-space: nowrap;
  }
  .label {
    font-weight: 600;
  }
  .num {
    width: 42px;
    padding: 3px 4px;
    border: 1px solid var(--border, #e2e2e2);
    border-radius: var(--radius-sm, 5px);
    font-size: 12px;
    text-align: center;
    background: #fff;
    color: var(--text, #202124);
  }
  /* 스피너 숨김 — 좁은 폭에서 숫자가 가려지지 않도록 */
  .num::-webkit-outer-spin-button,
  .num::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  .num {
    -moz-appearance: textfield;
    appearance: textfield;
  }
  .times, .unit {
    font-size: 11px;
  }
</style>
