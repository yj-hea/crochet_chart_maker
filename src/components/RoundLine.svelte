<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { EditorView, keymap, Decoration, type DecorationSet } from '@codemirror/view';
  import { EditorState, StateField, StateEffect } from '@codemirror/state';
  import { history, historyKeymap } from '@codemirror/commands';
  import type { ParseError, ValidationError } from '$lib/model/errors';

  interface Props {
    source: string;
    index: number;
    errors?: ParseError[];
    /** 인접 단 비교 의미 오류 (초과/부족) */
    validationErrors?: ValidationError[];
    /** 이 단에서 생성되는 총 코 수 (expanded.totalProduce). 미정의 시 '—' 표시 */
    stitchCount?: number;
    /** 이 단을 삭제할 수 있는지 (마지막 한 단은 삭제 불가). 버튼 활성화 제어용 */
    canDelete?: boolean;
    /** 외부에서 이 단에 포커스 요청. 변경될 때마다 (true→false→true 등) 포커스 */
    focusToken?: number;
    onChange: (source: string) => void;
    onEnter: () => void;
    onDelete: () => void;
    onArrowUp?: () => void;
    onArrowDown?: () => void;
  }

  let {
    source,
    index,
    errors = [],
    validationErrors = [],
    stitchCount,
    canDelete = true,
    focusToken,
    onChange,
    onEnter,
    onDelete,
    onArrowUp,
    onArrowDown,
  }: Props = $props();

  let container: HTMLDivElement;
  let view: EditorView | undefined;

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
          keymap.of([
            ...historyKeymap,
            {
              key: 'Enter',
              run: () => { onEnter(); return true; },
            },
            {
              key: 'ArrowUp',
              run: () => { onArrowUp?.(); return !!onArrowUp; },
            },
            {
              key: 'ArrowDown',
              run: () => { onArrowDown?.(); return !!onArrowDown; },
            },
          ]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) {
              onChange(u.state.doc.toString());
            }
          }),
          EditorView.theme({
            '&': { fontSize: '14px', fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace' },
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
    // ($effect가 $state 미사용 변수 `view`를 재추적하지 못해 놓치는 경우 대비)
    if (focusToken !== undefined) {
      tick().then(() => v.focus());
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

  // 외부 포커스 요청
  $effect(() => {
    if (focusToken === undefined || !view) return;
    void focusToken; // depend on the value
    tick().then(() => view?.focus());
  });
</script>

<div class="round-line">
  <span class="round-index">{index}:</span>
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
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-size: 13px;
    color: #888;
    padding-top: 8px;
    user-select: none;
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
    border: 1px solid #ddd;
    border-radius: 4px;
    background: white;
    box-sizing: border-box;
  }
  .cm-host :global(.cm-editor) {
    width: 100%;
  }
  .cm-host :global(.cm-editor.cm-focused) {
    border-color: #888;
  }
  .stitch-count {
    flex-shrink: 0;
    min-width: 56px;
    text-align: right;
    padding-top: 8px;
    font-size: 13px;
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    color: #555;
    user-select: none;
  }
  .stitch-count .unit {
    color: #999;
    font-size: 11px;
    margin-left: 2px;
  }
  .delete-btn {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    margin-top: 4px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 4px;
    background: transparent;
    color: #999;
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
  }
  .delete-btn:hover:not(:disabled) {
    background: #fce4e4;
    border-color: #e88;
    color: #c0392b;
  }
  .delete-btn:disabled {
    opacity: 0.3;
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
    color: #c0392b;
  }
  .validation-list li.over::before {
    content: '🚫 ';
  }
  .validation-list li.under {
    color: #b8860b;
  }
  .validation-list li.under::before {
    content: '⚠️ ';
  }
</style>
