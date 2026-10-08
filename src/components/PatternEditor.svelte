<script lang="ts">
  import {
    pattern,
    addRoundAfter,
    addRoundAtEnd,
    deleteRound,
    updateRoundSource,
  } from '$stores/pattern';
  import {
    setRoundDirection, toggleRoundContinued, addComment, workspace, insertRoundsAfter,
    usedColors, orphanComments,
  } from '$stores/tabs';
  import CommentPin from './CommentPin.svelte';
  import {
    validateRound, validateRoundSpec, validateRoundRepeat, validateLinkTargets,
  } from '$lib/validate';
  import { planRounds } from '$lib/model/round-plan';
  import type { ValidationError } from '$lib/model/errors';
  import RoundLine, { type FocusRequest } from './RoundLine.svelte';
  import ShapeSelector from './ShapeSelector.svelte';
  import EvenIncModal from './EvenIncModal.svelte';
  import GaugeInput from './GaugeInput.svelte';
  import ShortRowModal from './ShortRowModal.svelte';
  import PatternColors from './PatternColors.svelte';
  import OrphanCommentsModal from './OrphanCommentsModal.svelte';

  let focusRequests = $state<Record<string, FocusRequest>>({});
  // 현재 에디터 포커스를 가진 단 id — "단 추가" 시 삽입 위치 기준
  let focusedRoundId = $state<string | null>(null);
  let evenIncOpen = $state(false);
  let gaugeOpen = $state(false);
  let colorsOpen = $state(false);
  let shortRowOpen = $state(false);
  let orphanOpen = $state(false);

  /**
   * 의미 오류 계산.
   *
   * 줄과 도안 행이 1:1 이 아니다 — 되풀이 줄(`1~2단 반복*3`)은 여러 행으로 펼쳐지고
   * 접은 줄(`11~25단:`)은 한 행이다. 그래서 **도안 행 순서**로 코 수를 맞춰 보고,
   * 그 행을 만든 줄에 오류를 붙인다.
   */
  const validationByRound = $derived.by(() => {
    const rounds = $pattern.rounds;
    const map = new Map<string, ValidationError[]>();
    for (const r of rounds) map.set(r.id, []);

    const plan = planRounds(rounds);
    for (let i = 1; i < plan.chart.length; i++) {
      const cur = plan.chart[i]!;
      const line = rounds[cur.lineIndex];
      if (!line) continue;
      const errors = validateRound(cur.expanded, plan.chart[i - 1]!.expanded);
      const list = map.get(line.id)!;
      // 되풀이로 같은 오류가 여러 행에서 나와도 한 번만 보여 준다
      for (const e of errors) if (!list.some((x) => x.kind === e.kind)) list.push(e);
    }

    rounds.forEach((r, i) => {
      const number = r.number ?? i + 1;
      const copies = plan.chart.filter((row) => row.lineIndex === i).length;
      const earlier = plan.chart.filter((row) => row.lineIndex < i).map((row) => row.expanded);
      map.get(r.id)!.push(
        ...validateRoundSpec(r.expanded, r.spec, number),
        ...validateRoundRepeat(r.repeat, copies, number),
        ...(r.expanded ? validateLinkTargets(r.expanded, earlier) : []),
      );
    });
    return map;
  });

  function bumpFocus(id: string, cursor?: 'start' | 'end' | number) {
    const prev = focusRequests[id]?.token ?? 0;
    focusRequests[id] = { token: prev + 1, cursor };
  }

  /** Shift+Enter: 새 단 추가 (Enter 단독은 에디터 안에서 개행) */
  function handleShiftEnter(roundId: string) {
    const newId = addRoundAfter(roundId);
    bumpFocus(newId);
  }

  function handleDelete(roundId: string) {
    const prevId = deleteRound(roundId);
    if (prevId) bumpFocus(prevId, 'end');
  }

  function handleAppend() {
    // 활성 단이 있으면 그 아래에 삽입, 없으면 맨 끝에 추가
    if (focusedRoundId && $pattern.rounds.some((r) => r.id === focusedRoundId)) {
      const newId = addRoundAfter(focusedRoundId);
      bumpFocus(newId);
    } else {
      const newId = addRoundAtEnd();
      bumpFocus(newId);
    }
  }

  /** 균등 증감 모달 기본 from — 포커스 단의 totalProduce, 없으면 마지막 단의 totalProduce */
  const defaultFromCount = $derived.by(() => {
    const rounds = $pattern.rounds;
    const target = focusedRoundId ? rounds.find((r) => r.id === focusedRoundId) : rounds[rounds.length - 1];
    return target?.expanded?.totalProduce ?? 6;
  });

  /** 계산된 패턴을 현재 포커스(또는 마지막) 단 아래에 새 단으로 삽입 */
  function handleInsertCalculated(patternSrc: string) {
    const rounds = $pattern.rounds;
    const afterId = focusedRoundId && rounds.some((r) => r.id === focusedRoundId)
      ? focusedRoundId
      : rounds[rounds.length - 1]?.id;
    const newId = afterId ? addRoundAfter(afterId) : addRoundAtEnd();
    updateRoundSource(newId, patternSrc);
    bumpFocus(newId, 'end');
    evenIncOpen = false;
  }

  /** 되돌아뜨기 — 여러 단을 한꺼번에 삽입 */
  function handleInsertRows(sources: string[]) {
    const rounds = $pattern.rounds;
    const afterId = focusedRoundId && rounds.some((r) => r.id === focusedRoundId)
      ? focusedRoundId
      : rounds[rounds.length - 1]?.id ?? null;
    // 되돌아뜨기 묶음은 한 단 — 둘째 줄부터 "이어짐" 으로 넣는다
    const ids = insertRoundsAfter(afterId, sources, { asOneRound: true });
    const last = ids[ids.length - 1];
    if (last) bumpFocus(last, 'end');
    shortRowOpen = false;
  }

  function handleArrowUp(roundId: string, col: number) {
    const idx = $pattern.rounds.findIndex((r) => r.id === roundId);
    if (idx > 0) bumpFocus($pattern.rounds[idx - 1]!.id, col);
  }

  function handleArrowDown(roundId: string, col: number) {
    const idx = $pattern.rounds.findIndex((r) => r.id === roundId);
    if (idx >= 0 && idx < $pattern.rounds.length - 1) {
      bumpFocus($pattern.rounds[idx + 1]!.id, col);
    }
  }

  function handleArrowLeftBoundary(roundId: string) {
    const idx = $pattern.rounds.findIndex((r) => r.id === roundId);
    if (idx > 0) bumpFocus($pattern.rounds[idx - 1]!.id, 'end');
  }

  function handleArrowRightBoundary(roundId: string) {
    const idx = $pattern.rounds.findIndex((r) => r.id === roundId);
    if (idx >= 0 && idx < $pattern.rounds.length - 1) {
      bumpFocus($pattern.rounds[idx + 1]!.id, 'start');
    }
  }

  function handleToggleDirection(roundId: string) {
    const r = $pattern.rounds.find((r) => r.id === roundId);
    if (!r) return;
    const current = r.direction ?? 'forward';
    setRoundDirection(roundId, current === 'forward' ? 'reverse' : 'forward');
  }

  // 활성 탭의 코멘트 맵: round.id → Comment | undefined
  const activeTab = $derived($workspace.tabs.find((t) => t.id === $workspace.activeTabId));
  const roundCommentByRound = $derived.by(() => {
    const map = new Map<string, import('$stores/tabs').Comment>();
    if (!activeTab) return map;
    for (const c of activeTab.comments) {
      if (c.target.kind === 'round') map.set(c.target.roundId, c);
    }
    return map;
  });
  const patternComment = $derived(
    activeTab?.comments.find((c) => c.target.kind === 'pattern'),
  );

  function handleAddRoundComment(roundId: string) {
    addComment({ kind: 'round', roundId }, '');
  }

  function handleAddPatternComment() {
    addComment({ kind: 'pattern' }, '');
  }

  // 크래프트·도형별 방향 아이콘/라벨.
  // 대바늘에서 direction 은 겉면(RS)/안면(WS) 의 수동 오버라이드다.
  const isKnit = $derived($pattern.craft === 'knit');
  /**
   * 게이지를 쓸 수 있는 도안 — 대바늘 전체, 코바늘은 평면만.
   * 코바늘 원형은 단마다 지름이 달라져 10cm 당 코수 환산이 성립하지 않는다.
   */
  const showGauge = $derived(isKnit || $pattern.shape === 'flat');
  /** 팔레트에 먼저 보여줄, 이 도안에서 이미 쓴 색 */
  const usedColorList = $derived($usedColors.map((c) => c.color));
  const dirIcon = $derived(isKnit
    ? { forward: 'fa-regular fa-eye', reverse: 'fa-regular fa-eye-slash' }
    : $pattern.shape === 'circular'
      ? { forward: 'fa-solid fa-rotate-left', reverse: 'fa-solid fa-rotate-right' }
      : { forward: 'fa-solid fa-arrow-right', reverse: 'fa-solid fa-arrow-left' });
  const dirLabel = $derived(isKnit
    ? { forward: '기본 면 (클릭하여 반대 면으로)', reverse: '반대 면 (클릭하여 기본 면으로)' }
    : $pattern.shape === 'circular'
      ? { forward: '반시계 방향 (클릭하여 시계 방향으로)', reverse: '시계 방향 (클릭하여 반시계 방향으로)' }
      : { forward: '왼→오 (클릭하여 오→왼으로)', reverse: '오→왼 (클릭하여 왼→오로)' });
</script>

<div class="pattern-editor">
  <div class="editor-header">
    <ShapeSelector />
    <!-- 게이지·배색은 자주 건드리지 않으므로 접어 둔다 -->
    {#if showGauge}
      <button
        type="button"
        class="disclosure"
        class:on={gaugeOpen}
        onclick={() => (gaugeOpen = !gaugeOpen)}
        aria-expanded={gaugeOpen}
        title="게이지 (10cm 당 코수·단수)"
      >
        <i class="fa-solid fa-ruler"></i> 게이지
      </button>
    {/if}
    <button
      type="button"
      class="disclosure"
      class:on={colorsOpen}
      onclick={() => (colorsOpen = !colorsOpen)}
      aria-expanded={colorsOpen}
      title="배색 — 실 색·기본 색·빈칸 색"
    >
      <i class="fa-solid fa-palette"></i> 배색
      {#if $usedColors.length > 0}<span class="badge">{$usedColors.length}</span>{/if}
    </button>
    <div class="header-spacer"></div>
    {#if $orphanComments.length > 0}
      <button
        type="button"
        class="orphan-btn"
        onclick={() => (orphanOpen = true)}
        title="단과의 연결이 끊긴 메모 — 눌러서 붙일 단을 고르세요"
      >
        <i class="fa-solid fa-link-slash"></i> 끊긴 메모 {$orphanComments.length}
      </button>
    {/if}
    {#if patternComment}
      <CommentPin comment={patternComment} />
    {:else}
      <button type="button" class="pattern-comment-btn" onclick={handleAddPatternComment} title="도안 메모 추가">
        <i class="fa-regular fa-comment"></i> 메모
      </button>
    {/if}
  </div>
  {#if showGauge && gaugeOpen}
    <div class="disclosure-panel"><GaugeInput /></div>
  {/if}
  {#if colorsOpen}
    <div class="disclosure-panel"><PatternColors /></div>
  {/if}
  <div class="rounds-area">
  {#each $pattern.rounds as round, i (round.id)}
    <RoundLine
      source={round.source}
      index={i + 1}
      label={round.expanded?.label}
      continued={round.continued === true}
      errors={round.parsed?.errors ?? []}
      parsed={round.parsed}
      usedColors={usedColorList}
      validationErrors={validationByRound.get(round.id) ?? []}
      stitchCount={round.repeat ? undefined : round.expanded?.totalProduce}
      canDelete={$pattern.rounds.length > 1}
      roundComment={roundCommentByRound.get(round.id)}
      direction={round.direction ?? 'forward'}
      directionIcon={dirIcon}
      directionLabel={dirLabel}
      focusRequest={focusRequests[round.id]}
      onChange={(s) => updateRoundSource(round.id, s)}
      onShiftEnter={() => handleShiftEnter(round.id)}
      onDelete={() => handleDelete(round.id)}
      onToggleDirection={() => handleToggleDirection(round.id)}
      onToggleContinued={isKnit && i > 0 ? () => toggleRoundContinued(round.id) : undefined}
      onAddComment={() => handleAddRoundComment(round.id)}
      onArrowUp={(col) => handleArrowUp(round.id, col)}
      onArrowDown={(col) => handleArrowDown(round.id, col)}
      onArrowLeftBoundary={() => handleArrowLeftBoundary(round.id)}
      onArrowRightBoundary={() => handleArrowRightBoundary(round.id)}
      onFocus={() => (focusedRoundId = round.id)}
    />
  {/each}
  </div>
  <div class="footer-actions">
    <button type="button" class="append-btn" onclick={handleAppend}>
      + 단 추가
    </button>
    <button
      type="button"
      class="calc-btn"
      onclick={() => (evenIncOpen = true)}
      title="균등 증감 계산"
    >
      <i class="fa-solid fa-calculator"></i> 균등 증감
    </button>
    {#if isKnit}
      <button
        type="button"
        class="calc-btn"
        onclick={() => (shortRowOpen = true)}
        title="되돌아뜨기 계산 — unw 위치를 자동으로 배치"
      >
        <i class="fa-solid fa-arrow-turn-down"></i> 되돌아뜨기
      </button>
    {/if}
  </div>
</div>

{#if evenIncOpen}
  <EvenIncModal
    defaultFrom={defaultFromCount}
    craft={$pattern.craft}
    onClose={() => (evenIncOpen = false)}
    onInsert={handleInsertCalculated}
  />
{/if}

{#if shortRowOpen}
  <ShortRowModal
    defaultTotal={defaultFromCount}
    onClose={() => (shortRowOpen = false)}
    onInsert={handleInsertRows}
  />
{/if}

{#if orphanOpen}
  <OrphanCommentsModal onClose={() => (orphanOpen = false)} />
{/if}

<style>
  .pattern-editor {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    background: var(--bg-card, #fff);
    border: 1px solid var(--border, #e2e2e2);
    border-radius: var(--radius, 8px);
    box-shadow: var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.06));
    overflow: hidden;
  }
  .editor-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 14px;
    border-bottom: 1px solid var(--border, #e2e2e2);
    background: var(--bg, #f5f5f5);
  }
  .header-spacer { flex: 1; }
  /* 접었다 펴는 헤더 버튼 — 게이지·배색 */
  .disclosure {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 4px 10px;
    border: 1px solid var(--border-light);
    border-radius: var(--radius-sm);
    background: var(--bg-card);
    color: var(--text-secondary);
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
  }
  .disclosure:hover { background: var(--bg-hover); color: var(--text); }
  .disclosure.on {
    background: var(--bg-hover);
    border-color: var(--border);
    color: var(--text);
  }
  .badge {
    min-width: 15px;
    padding: 0 4px;
    border-radius: 999px;
    background: var(--border-light);
    color: var(--text-secondary);
    font-size: 10px;
    line-height: 15px;
    text-align: center;
  }
  .disclosure-panel {
    padding: 8px 14px;
    border-bottom: 1px solid var(--border-light);
    background: var(--bg-warm, #f8f9fa);
  }
  .pattern-comment-btn {
    padding: 4px 10px;
    border: 1px solid var(--border-light);
    border-radius: var(--radius-sm);
    background: var(--bg-card);
    color: var(--text-secondary);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .pattern-comment-btn:hover {
    background: var(--bg-hover);
    color: var(--text);
    border-color: var(--border);
  }
  /* 끊긴 메모 알림 — 눈에 띄되 오류처럼 보이지 않게 */
  .orphan-btn {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 4px 10px;
    border: 1px solid #f0c36d;
    border-radius: var(--radius-sm);
    background: #fff8e6;
    color: #8a5a00;
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
  }
  .orphan-btn:hover { background: #ffefc7; }
  .rounds-area {
    flex: 1;
    overflow-y: auto;
    padding: 8px 12px;
  }
  .footer-actions {
    display: flex;
    border-top: 1px solid var(--border, #e2e2e2);
    background: var(--bg, #f5f5f5);
  }
  .calc-btn {
    flex: 0 0 auto;
    padding: 10px 14px;
    border: none;
    border-left: 1px solid var(--border-light);
    background: transparent;
    color: var(--text-secondary);
    font-size: 13px;
    cursor: pointer;
    display: flex; align-items: center; gap: 6px;
    transition: all 0.15s;
  }
  .calc-btn:hover {
    background: var(--bg-hover, #f0f0f0);
    color: var(--text, #1a1a1a);
  }
  .append-btn {
    flex: 1;
    margin: 0;
    padding: 10px 14px;
    border: none;
    background: transparent;
    color: var(--text-secondary, #666);
    font-size: 13px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .append-btn:hover {
    background: var(--bg-hover, #f0f0f0);
    color: var(--text, #1a1a1a);
  }
</style>
