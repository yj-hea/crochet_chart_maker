<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { EditorView, keymap, Decoration, WidgetType, type DecorationSet } from '@codemirror/view';
  import { EditorState, StateField, StateEffect } from '@codemirror/state';
  import { history, historyKeymap } from '@codemirror/commands';
  import type { ParseError, ValidationError } from '$lib/model/errors';
  import type { ParsedRound } from '$lib/parser/ast';
  import type { Comment } from '$stores/tabs';
  import CommentPin from './CommentPin.svelte';
  import ColorPalette from './ColorPalette.svelte';
  import { collectStitches, setColorAt, setColorInRange } from '$lib/color-edit';

  export interface FocusRequest {
    token: number;
    cursor?: 'start' | 'end' | number;
  }

  interface Props {
    source: string;
    index: number;
    errors?: ParseError[];
    validationErrors?: ValidationError[];
    /** 이 단의 파싱 결과 — 색 스와치 위치·색 편집에 사용 */
    parsed?: ParsedRound;
    /** 도안 전체에서 쓰인 색 (팔레트에 먼저 보여준다) */
    usedColors?: readonly string[];
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
    /** Shift+Enter: 새 단 추가 (Enter 단독은 현재 단 안에서 줄바꿈) */
    onShiftEnter: () => void;
    onDelete: () => void;
    onToggleDirection?: () => void;
    onAddComment?: () => void;
    onArrowUp?: (col: number) => void;
    onArrowDown?: (col: number) => void;
    onArrowLeftBoundary?: () => void;
    onArrowRightBoundary?: () => void;
    /** 에디터 포커스 획득 시 호출 — 부모가 현재 활성 단 추적 */
    onFocus?: () => void;
  }

  let {
    source,
    index,
    errors = [],
    validationErrors = [],
    parsed,
    usedColors = [],
    stitchCount,
    canDelete = true,
    roundComment,
    direction = 'forward',
    directionIcon,
    directionLabel,
    focusRequest,
    onChange,
    onShiftEnter,
    onDelete,
    onToggleDirection,
    onAddComment,
    onArrowUp,
    onArrowDown,
    onArrowLeftBoundary,
    onArrowRightBoundary,
    onFocus,
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

  // ── 인라인 색 스와치 ────────────────────────────────────────────
  // 색 코드(`:navy`) 바로 뒤에 실제 색 동그라미를 끼워 넣는다. 텍스트는 건드리지 않고
  // 위젯만 얹으므로 소스는 그대로다. 클릭하면 그 코의 색을 바꾸는 팔레트가 열린다.

  /** 스와치 위젯 — 어떤 코의 색인지 알 수 있도록 소스 위치를 data 속성에 담는다 */
  class SwatchWidget extends WidgetType {
    color: string;
    stitchStart: number;
    constructor(color: string, stitchStart: number) {
      super();
      this.color = color;
      this.stitchStart = stitchStart;
    }
    // 같은 색·같은 코면 DOM 을 재사용 (매 타이핑마다 새로 만들지 않도록)
    eq(other: SwatchWidget) {
      return other.color === this.color && other.stitchStart === this.stitchStart;
    }
    toDOM() {
      const el = document.createElement('span');
      el.className = 'cm-color-swatch';
      el.style.backgroundColor = this.color;
      el.dataset.stitchStart = String(this.stitchStart);
      el.dataset.color = this.color;
      el.title = `${this.color} — 클릭하여 색 바꾸기`;
      return el;
    }
    ignoreEvent() { return false; }
  }

  const setSwatches = StateEffect.define<Array<{ at: number; color: string; stitchStart: number }>>();
  const swatchField = StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(deco, tr) {
      let updated = deco.map(tr.changes);
      for (const eff of tr.effects) {
        if (eff.is(setSwatches)) {
          const docLen = tr.state.doc.length;
          updated = Decoration.set(
            eff.value
              .filter((s) => s.at <= docLen)
              .map((s) =>
                Decoration.widget({ widget: new SwatchWidget(s.color, s.stitchStart), side: 1 })
                  .range(s.at),
              )
              .sort((a, b) => a.from - b.from),
          );
        }
      }
      return updated;
    },
    provide: (f) => EditorView.decorations.from(f),
  });

  function applySwatches(v: EditorView, p: ParsedRound | undefined) {
    const items = collectStitches(p?.body ?? p?.lastValid)
      .filter((s) => s.color && s.colorRange)
      .map((s) => ({ at: s.colorRange!.end, color: s.color!, stitchStart: s.range.start }));
    v.dispatch({ effects: setSwatches.of(items) });
  }

  // ── 팔레트 열기 상태 ────────────────────────────────────────────
  /** 'swatch' = 특정 코 하나 / 'selection' = 현재 선택 범위 */
  let paletteFor = $state<
    | { kind: 'swatch'; stitchStart: number; color: string; anchor: HTMLElement }
    | { kind: 'selection'; from: number; to: number; anchor: HTMLElement }
    | null
  >(null);
  let paletteBtn: HTMLButtonElement | undefined = $state();

  const paletteCurrent = $derived(paletteFor?.kind === 'swatch' ? paletteFor.color : undefined);

  function openSelectionPalette() {
    if (!view || !paletteBtn) return;
    const sel = view.state.selection.main;
    paletteFor = { kind: 'selection', from: sel.from, to: sel.to, anchor: paletteBtn };
  }

  /** 팔레트에서 고른 색(또는 제거)을 소스에 반영 */
  function applyColor(hex: string | undefined) {
    const target = paletteFor;
    if (!target || !view) return;
    const src = view.state.doc.toString();
    const next = target.kind === 'swatch'
      ? setColorAt(src, parsed, target.stitchStart, hex)
      : setColorInRange(src, parsed, { start: target.from, end: target.to }, hex);
    paletteFor = null;
    if (next !== src) onChange(next);
  }

  // 붙여넣기·드래그 등으로 들어오는 개행은 허용하되 Enter 키 기본 동작은 별도 제어.
  // (Alt-Enter 로 명시 삽입. 붙여넣은 \n 은 그대로 유지하여 파싱 시 공백으로 취급)

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
          errorField,
          swatchField,
          EditorView.lineWrapping,
          keymap.of([
            ...historyKeymap,
            {
              // Enter: 현재 단 안에서 개행 삽입 (파서는 \n 을 공백으로 취급)
              key: 'Enter',
              run: (v) => {
                v.dispatch(v.state.replaceSelection('\n'));
                return true;
              },
            },
            {
              // Shift+Enter: 새 단 추가 (기존 동작 유지)
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
          EditorView.domEventHandlers({
            focus: () => { onFocus?.(); },
            mousedown: (e) => {
              const el = (e.target as HTMLElement | null)?.closest?.('.cm-color-swatch');
              if (!(el instanceof HTMLElement)) return false;
              e.preventDefault(); // 스와치 클릭으로 커서가 튀지 않도록
              const stitchStart = Number(el.dataset.stitchStart);
              if (!Number.isFinite(stitchStart)) return false;
              paletteFor = {
                kind: 'swatch',
                stitchStart,
                color: el.dataset.color ?? '',
                anchor: el,
              };
              return true;
            },
          }),
          EditorView.theme({
            '&': { fontSize: '14px', fontFamily: "'Noto Sans KR', system-ui, sans-serif" },
            '.cm-content': { padding: '6px 8px' },
            '.cm-line': { padding: '0' },
            '&.cm-focused': { outline: 'none' },
            '.cm-color-swatch': {
              display: 'inline-block',
              width: '10px',
              height: '10px',
              marginLeft: '2px',
              borderRadius: '50%',
              border: '1px solid rgba(0,0,0,0.25)',
              verticalAlign: 'baseline',
              cursor: 'pointer',
            },
            '.cm-color-swatch:hover': { transform: 'scale(1.3)' },
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
    applySwatches(v, parsed);
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

  // 파싱 결과가 바뀌면 색 스와치 갱신
  $effect(() => {
    if (view) applySwatches(view, parsed);
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
  <button
    type="button"
    class="color-btn"
    bind:this={paletteBtn}
    onclick={openSelectionPalette}
    title="선택한 코에 색 칠하기 (선택 없으면 커서가 놓인 코)"
    aria-label="색 칠하기"
  >
    <i class="fa-solid fa-palette"></i>
  </button>
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

{#if paletteFor}
  <ColorPalette
    anchor={paletteFor.anchor}
    current={paletteCurrent}
    used={usedColors}
    onPick={(hex) => applyColor(hex)}
    onClear={() => applyColor(undefined)}
    onClose={() => (paletteFor = null)}
  />
{/if}

<style>
  .color-btn {
    align-self: flex-start;
    margin-top: 4px;
    width: 26px; height: 26px;
    border: 1px solid transparent;
    border-radius: var(--radius-sm, 4px);
    background: transparent;
    color: var(--text-muted);
    font-size: 12px;
    cursor: pointer;
    opacity: 0.55;
    transition: opacity 0.15s, color 0.15s;
    flex: none;
  }
  .color-btn:hover {
    opacity: 1;
    color: var(--text);
    background: var(--bg-hover);
  }
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
