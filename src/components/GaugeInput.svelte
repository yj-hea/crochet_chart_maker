<script lang="ts">
  /**
   * 게이지 입력 — 10cm 당 코수 / 단수.
   *
   * 대바늘 전용. 셀 세로 길이와 미리보기 실측 치수에 반영된다.
   * 두 칸을 모두 비우면 게이지 해제 (기본 비율 1:0.7).
   *
   * 입력 도중에는 스토어가 로컬 텍스트를 덮어쓰지 않는다.
   * 한쪽만 채운 상태는 "아직 입력 중"으로 보고 스토어를 건드리지 않는다.
   */
  import { pattern } from '$stores/pattern';
  import { setGauge, workspace } from '$stores/tabs';
  import { GAUGE_MIN, GAUGE_MAX } from '$lib/model/gauge';

  const gauge = $derived($pattern.gauge);
  const activeTabId = $derived($workspace.activeTabId);

  let stitchesText = $state('');
  let rowsText = $state('');

  // 스토어 → 입력칸 동기화는 "값이 실제로 바뀐 경우"에만 (탭 전환·외부 로드).
  // 매 렌더마다 덮어쓰면 타이핑 중인 내용이 지워진다.
  let syncedKey = $state<string | null>(null);
  $effect(() => {
    const key = `${activeTabId}|${gauge ? `${gauge.stitches}x${gauge.rows}` : ''}`;
    if (key === syncedKey) return;
    syncedKey = key;
    stitchesText = gauge ? String(gauge.stitches) : '';
    rowsText = gauge ? String(gauge.rows) : '';
  });

  function parseField(text: string): number | null {
    const t = text.trim();
    if (!t) return null;
    const n = Number(t);
    if (!Number.isFinite(n)) return null;
    return Math.min(GAUGE_MAX, Math.max(GAUGE_MIN, Math.round(n)));
  }

  function commit() {
    const s = parseField(stitchesText);
    const r = parseField(rowsText);
    // 둘 다 비었을 때만 해제. 한쪽만 채운 상태는 입력 중으로 보고 그대로 둔다.
    if (s === null && r === null) {
      if (gauge) setGauge(undefined);
      return;
    }
    if (s === null || r === null) return;
    if (gauge && gauge.stitches === s && gauge.rows === r) return;
    setGauge({ stitches: s, rows: r });
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
  }
</script>

<div class="gauge" title="10cm 당 코수 × 단수. 두 칸을 비우면 기본 비율(1:0.7)로 그립니다">
  <span class="label">게이지</span>
  <input
    type="text"
    inputmode="numeric"
    class="num"
    placeholder="코"
    bind:value={stitchesText}
    onblur={commit}
    onkeydown={onKey}
    aria-label="10cm 당 코 수"
  />
  <span class="times">코 ×</span>
  <input
    type="text"
    inputmode="numeric"
    class="num"
    placeholder="단"
    bind:value={rowsText}
    onblur={commit}
    onkeydown={onKey}
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
    width: 40px;
    padding: 3px 4px;
    border: 1px solid var(--border, #e2e2e2);
    border-radius: var(--radius-sm, 5px);
    font-size: 12px;
    text-align: center;
    background: #fff;
    color: var(--text, #202124);
  }
  .times, .unit {
    font-size: 11px;
  }
</style>
