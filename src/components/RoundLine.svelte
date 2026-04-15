<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { EditorView, keymap, Decoration, type DecorationSet } from '@codemirror/view';
  import { EditorState, StateField, StateEffect } from '@codemirror/state';
  import { history, historyKeymap } from '@codemirror/commands';
  import type { ParseError } from '$lib/model/errors';

  interface Props {
    source: string;
    index: number;
    errors?: ParseError[];
    /** 외부에서 이 단에 포커스 요청. 변경될 때마다 (true→false→true 등) 포커스 */
    focusToken?: number;
    onChange: (source: string) => void;
    onEnter: () => void;
    onBackspaceEmpty: () => void;
    onArrowUp?: () => void;
    onArrowDown?: () => void;
  }

  let {
    source,
    index,
    errors = [],
    focusToken,
    onChange,
    onEnter,
    onBackspaceEmpty,
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

  function applyErrors(view: EditorView, errs: ParseError[]) {
    const docLen = view.state.doc.length;
    const ranges = errs.map((e) => ({
      from: Math.min(e.range.start, docLen),
      to: Math.min(e.range.end, docLen),
    }));
    view.dispatch({ effects: setErrorRanges.of(ranges) });
  }

  onMount(() => {
    view = new EditorView({
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
              key: 'Backspace',
              run: (v) => {
                if (v.state.doc.length === 0) {
                  onBackspaceEmpty();
                  return true;
                }
                return false;
              },
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
            '.cm-error': { textDecoration: 'underline wavy #d33', textDecorationSkipInk: 'none' },
          }),
        ],
      }),
      parent: container,
    });
    applyErrors(view, errors);
    return () => view?.destroy();
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
    if (view) applyErrors(view, errors);
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
  <div class="cm-host" bind:this={container}></div>
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
  .cm-host {
    flex: 1;
    border: 1px solid #ddd;
    border-radius: 4px;
    background: white;
  }
  .cm-host :global(.cm-editor.cm-focused) {
    border-color: #888;
  }
</style>
