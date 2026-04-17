<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { EditorView, keymap, Decoration, type DecorationSet } from '@codemirror/view';
  import { EditorState, StateField, StateEffect } from '@codemirror/state';
  import { history, historyKeymap } from '@codemirror/commands';
  import type { ParseError, ValidationError } from '$lib/model/errors';
  import type { Comment } from '$stores/tabs';
  import CommentPin from './CommentPin.svelte';

  export interface FocusRequest {
    token: number;
    cursor?: 'start' | 'end' | number;
  }

  interface Props {
    source: string;
    index: number;
    errors?: ParseError[];
    validationErrors?: ValidationError[];
    stitchCount?: number;
    canDelete?: boolean;
    /** 이 단에 연결된 코멘트 (없으면 []) */
    roundComment?: Comment;
    /** 단 작업 방향 ('forward' 기본 / 'reverse') */
    direction?: 'forward' | 'reverse';
    /** 방향 아이콘 — 도형에 따라 다르므로 부모가 결정 */
    directionIcon?: { forward: string; reverse: string };
    /** 방향 라벨 (툴팁) */
    directionLabel?: { forward: string; reverse: string };
    /** 외부 포커스 요청. token 증가 시 포커스 이동, cursor로 커서 위치 지정 */
    focusRequest?: FocusRequest;
    onChange: (source: string) => void;
    /** 일반 Enter: 다음 단으로 커서 이동 (새 단 추가 안 함) */
    onEnter: () => void;
    /** Shift+Enter: 새 단 추가 */
    onShiftEnter: () => void;
    onDelete: () => void;
    onToggleDirection?: () => void;
    onAddComment?: () => void;
    onArrowUp?: (col: number) => void;
    onArrowDown?: (col: number) => void;
    onArrowLeftBoundary?: () => void;
    onArrowRightBoundary?: () => void;
  }

  let {
    source,
    index,
    errors = [],
    validationErrors = [],
    stitchCount,
    canDelete = true,
    roundComment,
    direction = 'forward',
    directionIcon,
    directionLabel,
    focusRequest,
    onChange,
    onEnter,
    onShiftEnter,
    onDelete,
    onToggleDirection,
    onAddComment,
    onArrowUp,
    onArrowDown,
    onArrowLeftBoundary,
    onArrowRightBoundary,
  }: Props = $props();

  let container: HTMLDivElement;
  let view: EditorView | undefined = $state();
  let lastSeenFocusToken: number | undefined = undefined;

  // 에러 데코레이션을 동적으로 갱신하기 위한 StateField + StateEffect
  const setErrorRanges = StateEffect.define<Array<{ from: number; to: number }>>();
  const errorMark = Decoration.mark({ class: 'cm-error' });
  const errorField = StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(deco, tr) {
      let updated = deco.map(tr.changes);
      for (const eff of tr.effects) {
        if (eff.is(setErrorRanges)) {
          const ranges = eff.value
            .filter((r) => r.from < r.to)
            .map((r) => errorMark.range(r.from, r.to))
            .sort((a, b) => a.from - b.from);
          updated = Decoration.set(ranges);
        }
      }
      return updated;
    },
    provide: (f) => EditorView.decorations.from(f),
  });

  // single-line: 줄바꿈 트랜잭션 차단
  const singleLineFilter = EditorState.transactionFilter.of((tr) => {
    if (tr.newDoc.lines > 1) return [];
    return tr;
  });

  function applyFocus(v: EditorView, req: FocusRequest) {
    v.focus();
    const docLen = v.state.doc.length;
    let pos: number | undefined;
    if (req.cursor === 'start') pos = 0;
    else if (req.cursor === 'end') pos = docLen;
    else if (typeof req.cursor === 'number') pos = Math.min(Math.max(0, req.cursor), docLen);
    if (pos !== undefined) {
      v.dispatch({ selection: { anchor: pos } });
    }
  }

  function applyDecorations(v: EditorView, parseErrs: ParseError[], valErrs: ValidationError[]) {
    const docLen = v.state.doc.length;
    const ranges = parseErrs.map((e) => ({
      from: Math.min(e.range.start, docLen),
      to: Math.min(e.range.end, docLen),
    }));
    // 초과 오류: offending 지점부터 줄 끝까지 빨간 표시
    for (const ve of valErrs) {
      if (ve.kind === 'over_consumed' && ve.offendingRange) {
        ranges.push({
          from: Math.min(ve.offendingRange.start, docLen),
          to: docLen,
        });
      }
    }
    v.dispatch({ effects: setErrorRanges.of(ranges) });
  }

  onMount(() => {
    const v = new EditorView({
      state: EditorState.create({
        doc: source,
        extensions: [
          history(),
          singleLineFilter,
          errorField,
          EditorView.lineWrapping,
          keymap.of([
            ...historyKeymap,
            {
              key: 'Enter',
              run: () => { onEnter(); return true; },
            },
            {
              key: 'Shift-Enter',
              run: () => { onShiftEnter(); return true; },
            },
            {
              key: 'Shift-Backspace',
              run: () => { if (canDelete) { onDelete(); return true; } return false; },
            },
            {
              key: 'ArrowUp',
              run: (v) => {
                if (!onArrowUp) return false;
                onArrowUp(v.state.selection.main.head);
                return true;
              },
            },
            {
              key: 'ArrowDown',
              run: (v) => {
                if (!onArrowDown) return false;
                onArrowDown(v.state.selection.main.head);
                return true;
              },
            },
            {
              key: 'ArrowLeft',
              run: (v) => {
                if (onArrowLeftBoundary && v.state.selection.main.head === 0) {
                  onArrowLeftBoundary();
                  return true;
                }
                return false;
              },
            },
            {
              key: 'ArrowRight',
              run: (v) => {
                if (onArrowRightBoundary && v.state.selection.main.head === v.state.doc.length) {
                  onArrowRightBoundary();
                  return true;
                }
                return false;
              },
            },
          ]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) {
              onChange(u.state.doc.toString());
            }
          }),
          EditorView.theme({
            '&': { fontSize: '14px', fontFamily: "'Noto Sans KR', system-ui, sans-serif" },
            '.cm-content': { padding: '6px 8px' },
            '.cm-line': { padding: '0' },
            '&.cm-focused': { outline: 'none' },
            '.cm-error': {
              textDecoration: 'underline wavy #d33',
              textDecorationThickness: '2px',
              textDecorationSkipInk: 'none',
              backgroundColor: 'rgba(221, 51, 51, 0.14)',
              borderRadius: '2px',
            },
          }),
        ],
      }),
      parent: container,
    });
    view = v;
    applyDecorations(v, errors, validationErrors);
    // 마운트 시점에 포커스 요청이 이미 걸려있으면 즉시 포커스.
    if (focusRequest !== undefined) {
      lastSeenFocusToken = focusRequest.token;
      tick().then(() => applyFocus(v, focusRequest!));
    }
    return () => v.destroy();
  });

  // 외부에서 source가 바뀌면 (단 추가/삭제 후 재인덱싱 등) view에 동기화
  $effect(() => {
    if (!view) return;
    if (view.state.doc.toString() !== source) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: source },
      });
    }
  });

  // 에러 변화 시 데코레이션 갱신
  $effect(() => {
    if (view) applyDecorations(view, errors, validationErrors);
  });

  // 외부 포커스 요청 — 토큰이 실제로 증가했을 때만 포커스
  $effect(() => {
    const req = focusRequest;
    if (!req || !view) return;
    if (req.token === lastSeenFocusToken) return;
    lastSeenFocusToken = req.token;
    const v = view;
    tick().then(() => applyFocus(v, req));
  });
</script>

<div class="round-line">
  <span class="round-index">{index}:</span>
  {#if roundComment}
    <CommentPin comment={roundComment} />
  {:else if onAddComment}
    <button type="button" class="add-comment-btn" onclick={onAddComment} title="단 메모 추가" aria-label="단 메모 추가">
      <i class="fa-regular fa-comment"></i>
    </button>
  {/if}
  <div class="cm-wrap">
    <div class="cm-host" bind:this={container}></div>
    {#if errors.length > 0}
      <ul class="error-list">
        {#each errors as err (err.range.start + ':' + err.kind)}
          <li>{err.message}</li>
        {/each}
      </ul>
    {/if}
    {#if validationErrors.length > 0}
      <ul class="validation-list">
        {#each validationErrors as ve (ve.kind)}
          <li class={ve.kind === 'over_consumed' ? 'over' : 'under'}>{ve.message}</li>
        {/each}
      </ul>
    {/if}
  </div>
  <span class="stitch-count" title="이 단의 총 코 수">
    {stitchCount ?? '—'}<span class="unit">코</span>
  </span>
  {#if onToggleDirection && directionIcon && directionLabel}
    <button
      type="button"
      class="dir-btn"
      onclick={onToggleDirection}
      title={direction === 'forward' ? directionLabel.forward : directionLabel.reverse}
      aria-label="작업 방향 전환"
    >
      <i class={direction === 'forward' ? directionIcon.forward : directionIcon.reverse}></i>
    </button>
  {/if}
  <button
    type="button"
    class="delete-btn"
    onclick={onDelete}
    disabled={!canDelete}
    title={canDelete ? '이 단 삭제' : '마지막 단은 삭제할 수 없습니다'}
    aria-label="단 {index} 삭제"
  >×</button>
</div>

<style>
  .round-line {
    display: flex;
    align-items: stretch;
    gap: 8px;
    padding: 2px 0;
  }
  .round-index {
    min-width: 28px;
    text-align: right;
    font-family: var(--font-mono);
    font-size: 13px;
    color: var(--text-muted);
    padding-top: 8px;
    user-select: none;
  }
  .add-comment-btn {
    flex-shrink: 0;
    width: 22px;
    height: 22px;
    margin-top: 6px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-muted);
    font-size: 11px;
    cursor: pointer;
    opacity: 0.4;
    transition: opacity 0.15s, color 0.15s;
  }
  .round-line:hover .add-comment-btn {
    opacity: 1;
  }
  .add-comment-btn:hover {
    color: var(--text);
  }
  .cm-wrap {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .cm-host {
    width: 100%;
    border: 1px solid var(--border-light);
    border-radius: var(--radius-sm);
    background: var(--bg-card);
    box-sizing: border-box;
    transition: border-color 0.15s;
  }
  .cm-host :global(.cm-editor) {
    width: 100%;
  }
  .cm-host :global(.cm-editor.cm-focused) {
    border-color: var(--border-focus);
  }
  .stitch-count {
    flex-shrink: 0;
    min-width: 56px;
    text-align: right;
    padding-top: 8px;
    font-size: 13px;
    font-family: var(--font-mono);
    color: var(--text-secondary);
    user-select: none;
  }
  .stitch-count .unit {
    color: var(--text-muted);
    font-size: 11px;
    margin-left: 2px;
  }
  .dir-btn {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    margin-top: 4px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    font-size: 13px;
    line-height: 1;
    cursor: pointer;
    transition: all 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .dir-btn:hover {
    background: var(--bg-hover);
    border-color: var(--border);
    color: var(--text);
  }
  .delete-btn {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    margin-top: 4px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-muted);
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    transition: all 0.15s;
  }
  .delete-btn:hover:not(:disabled) {
    background: var(--danger-light);
    border-color: var(--danger);
    color: var(--danger);
  }
  .delete-btn:disabled {
    opacity: 0.2;
    cursor: not-allowed;
  }
  .error-list {
    list-style: none;
    padding: 0;
    margin: 0 0 0 4px;
    font-size: 12px;
    color: #c0392b;
    line-height: 1.35;
  }
  .error-list li::before {
    content: '⚠ ';
  }
  .validation-list {
    list-style: none;
    padding: 0;
    margin: 0 0 0 4px;
    font-size: 12px;
    line-height: 1.35;
  }
  .validation-list li.over {
    color: var(--danger);
  }
  .validation-list li.over::before {
    content: '🚫 ';
  }
  .validation-list li.under {
    color: var(--warning);
  }
  .validation-list li.under::before {
    content: '⚠️ ';
  }
</style>
