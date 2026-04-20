<script lang="ts">
  import {
    pattern,
    addRoundAfter,
    addRoundAtEnd,
    deleteRound,
    updateRoundSource,
  } from '$stores/pattern';
  import { setRoundDirection, addComment, workspace } from '$stores/tabs';
  import CommentPin from './CommentPin.svelte';
  import { validateRound } from '$lib/validate';
  import { compressRoundSource } from '$lib/compress';
  import type { ValidationError } from '$lib/model/errors';
  import RoundLine, { type FocusRequest } from './RoundLine.svelte';
  import ShapeSelector from './ShapeSelector.svelte';
  import EvenIncModal from './EvenIncModal.svelte';

  let focusRequests = $state<Record<string, FocusRequest>>({});
  // 현재 에디터 포커스를 가진 단 id — "단 추가" 시 삽입 위치 기준
  let focusedRoundId = $state<string | null>(null);
  let evenIncOpen = $state(false);
  // 압축 미리보기 — roundId → { from: 미리보기 만들 때 원본, to: 제안된 소스 }.
  // from 이 현재 source 와 다르면 사용자가 편집했다는 뜻이라 버린다.
  interface CompressPreview { from: string; to: string }
  let compressPreview = $state<Record<string, CompressPreview>>({});

  // 인접 단 간 의미 오류 계산 (부모 produce vs 현재 consume)
  const validationByRound = $derived.by(() => {
    const rounds = $pattern.rounds;
    const map = new Map<string, ValidationError[]>();
    for (let i = 0; i < rounds.length; i++) {
      const r = rounds[i]!;
      if (i === 0 || !r.expanded) { map.set(r.id, []); continue; }
      const prev = rounds[i - 1];
      if (!prev?.expanded) { map.set(r.id, []); continue; }
      map.set(r.id, validateRound(r.expanded, prev.expanded));
    }
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

  function handleCompress(roundId: string) {
    const round = $pattern.rounds.find((r) => r.id === roundId);
    if (!round) return;
    const compressed = compressRoundSource(round.source);
    if (compressed === round.source) {
      // 이미 최소 형태 — 기존 미리보기만 정리
      dropCompressPreview(roundId);
      return;
    }
    compressPreview = { ...compressPreview, [roundId]: { from: round.source, to: compressed } };
  }

  function confirmCompress(roundId: string) {
    const preview = compressPreview[roundId];
    if (!preview) return;
    updateRoundSource(roundId, preview.to);
    dropCompressPreview(roundId);
  }

  function cancelCompress(roundId: string) {
    dropCompressPreview(roundId);
  }

  function dropCompressPreview(roundId: string) {
    if (compressPreview[roundId] === undefined) return;
    const next = { ...compressPreview };
    delete next[roundId];
    compressPreview = next;
  }

  // 원본 소스가 바뀌었거나 단이 삭제되면 stale preview 를 폐기
  $effect(() => {
    const roundsById = new Map($pattern.rounds.map((r) => [r.id, r]));
    let changed = false;
    const next: Record<string, CompressPreview> = {};
    for (const [id, preview] of Object.entries(compressPreview)) {
      const round = roundsById.get(id);
      if (!round || round.source !== preview.from) { changed = true; continue; }
      next[id] = preview;
    }
    if (changed) compressPreview = next;
  });

  function handleAddPatternComment() {
    addComment({ kind: 'pattern' }, '');
  }

  // 도형별 방향 아이콘/라벨
  const dirIcon = $derived($pattern.shape === 'circular'
    ? { forward: 'fa-solid fa-rotate-left', reverse: 'fa-solid fa-rotate-right' }
    : { forward: 'fa-solid fa-arrow-right', reverse: 'fa-solid fa-arrow-left' });
  const dirLabel = $derived($pattern.shape === 'circular'
    ? { forward: '반시계 방향 (클릭하여 시계 방향으로)', reverse: '시계 방향 (클릭하여 반시계 방향으로)' }
    : { forward: '왼→오 (클릭하여 오→왼으로)', reverse: '오→왼 (클릭하여 왼→오로)' });
</script>

<div class="pattern-editor">
  <div class="editor-header">
    <ShapeSelector />
    <div class="header-spacer"></div>
    {#if patternComment}
      <CommentPin comment={patternComment} />
    {:else}
      <button type="button" class="pattern-comment-btn" onclick={handleAddPatternComment} title="도안 메모 추가">
        <i class="fa-regular fa-comment"></i> 메모
      </button>
    {/if}
  </div>
  <div class="rounds-area">
  {#each $pattern.rounds as round, i (round.id)}
    <RoundLine
      source={round.source}
      index={i + 1}
      errors={round.parsed?.errors ?? []}
      validationErrors={validationByRound.get(round.id) ?? []}
      stitchCount={round.expanded?.totalProduce}
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
      onAddComment={() => handleAddRoundComment(round.id)}
      onCompress={() => handleCompress(round.id)}
      onArrowUp={(col) => handleArrowUp(round.id, col)}
      onArrowDown={(col) => handleArrowDown(round.id, col)}
      onArrowLeftBoundary={() => handleArrowLeftBoundary(round.id)}
      onArrowRightBoundary={() => handleArrowRightBoundary(round.id)}
      onFocus={() => (focusedRoundId = round.id)}
    />
    {#if compressPreview[round.id]}
      <div class="compress-preview" role="region" aria-label="압축 결과 미리보기">
        <span class="cp-label">압축 결과:</span>
        <code class="cp-text">{compressPreview[round.id].to}</code>
        <div class="cp-actions">
          <button type="button" class="cp-btn cp-cancel" onclick={() => cancelCompress(round.id)}>취소</button>
          <button type="button" class="cp-btn cp-confirm" onclick={() => confirmCompress(round.id)}>확인</button>
        </div>
      </div>
    {/if}
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
  </div>
</div>

{#if evenIncOpen}
  <EvenIncModal
    defaultFrom={defaultFromCount}
    onClose={() => (evenIncOpen = false)}
    onInsert={handleInsertCalculated}
  />
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
  .compress-preview {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 2px 0 6px 32px;
    padding: 6px 10px;
    background: var(--bg-warm, #faf7f0);
    border: 1px solid var(--border-light, #e8e3d8);
    border-left: 3px solid var(--accent, #5a554d);
    border-radius: var(--radius-sm, 5px);
    font-size: 13px;
  }
  .cp-label {
    flex-shrink: 0;
    color: var(--text-secondary);
    font-size: 12px;
  }
  .cp-text {
    flex: 1;
    min-width: 0;
    font-family: var(--font-mono);
    font-size: 13px;
    color: var(--text);
    word-break: break-all;
  }
  .cp-actions {
    flex-shrink: 0;
    display: flex;
    gap: 6px;
  }
  .cp-btn {
    padding: 4px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-card);
    color: var(--text);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .cp-btn:hover { background: var(--bg-hover); }
  .cp-confirm {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
  .cp-confirm:hover { background: var(--accent-hover, #3a3530); }
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
