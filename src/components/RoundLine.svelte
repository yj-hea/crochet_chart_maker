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
  import {
    scanColorTokens,
    colorTokenAt,
    foldableColorTokens,
    replaceColorToken,
    setColorInRange,
  } from '$lib/color-edit';
  import { foldableComments, replaceComment } from '$lib/comment-edit';
  import StitchCommentPopover from './StitchCommentPopover.svelte';

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
  //
  // 색 표기(`:aaf`)를 **동그란 색 미리보기로 대체**해서 그린다 (replace decoration).
  // hex 코드가 줄 안에 그대로 남아 있으면 도안을 읽기 어렵기 때문이다.
  // 소스 텍스트는 건드리지 않는다 — 화면에서만 접힌다.
  //
  // 단, 커서가 그 색 표기 안(또는 끝)에 있으면 접지 않고 원래 글자를 보여준다.
  // 안 그러면 한번 접힌 색을 키보드로 고칠 수 없다.

  /** 접힌 색 표기 자리에 그리는 동그라미 */
  class SwatchWidget extends WidgetType {
    color: string;
    from: number;
    to: number;
    constructor(color: string, from: number, to: number) {
      super();
      this.color = color;
      this.from = from;
      this.to = to;
    }
    // 같은 색·같은 위치면 DOM 을 재사용 (타이핑마다 새로 만들지 않도록)
    eq(other: SwatchWidget) {
      return other.color === this.color && other.from === this.from && other.to === this.to;
    }
    toDOM() {
      const el = document.createElement('span');
      el.className = 'cm-color-swatch';
      el.style.backgroundColor = this.color;
      el.dataset.from = String(this.from);
      el.dataset.to = String(this.to);
      el.dataset.color = this.color;
      el.title = `${this.color} — 클릭하여 바꾸기 (커서를 대면 코드가 보입니다)`;
      return el;
    }
    ignoreEvent() { return false; }
  }

  /**
   * 접힌 코멘트 자리에 그리는 쪽지 아이콘.
   *
   * 메모 아이콘(말풍선)을 쓰고, 누르면 도안 메모·단 메모와 같은 모양의 팝오버가 열린다 —
   * 셋 다 "메모"라는 점에서 같으므로 생김새와 조작이 갈릴 이유가 없다.
   */
  class CommentWidget extends WidgetType {
    text: string;
    from: number;
    to: number;
    constructor(text: string, from: number, to: number) {
      super();
      this.text = text;
      this.from = from;
      this.to = to;
    }
    eq(other: CommentWidget) {
      return other.text === this.text && other.from === this.from && other.to === this.to;
    }
    toDOM() {
      const el = document.createElement('span');
      el.className = 'cm-comment-note';
      // 메모를 뜻하는 말풍선 — 메모 추가 버튼과 같은 아이콘
      const icon = document.createElement('i');
      icon.className = 'fa-regular fa-comment';
      el.appendChild(icon);
      el.dataset.from = String(this.from);
      el.dataset.to = String(this.to);
      el.dataset.text = this.text;
      el.title = this.text || '코 메모';
      return el;
    }
    ignoreEvent() { return false; }
  }

  /** 현재 문서·커서 상태에서 접을 것들(색 표기·코멘트)을 계산 */
  function buildFolds(state: EditorState): DecorationSet {
    const sel = state.selection.main;
    const doc = state.doc.toString();
    const ranges = [
      ...foldableColorTokens(doc, sel.from, sel.to).map((t) =>
        Decoration.replace({ widget: new SwatchWidget(t.color!, t.start, t.end) })
          .range(t.start, t.end),
      ),
      ...foldableComments(doc, sel.from, sel.to).map((c) =>
        Decoration.replace({ widget: new CommentWidget(c.value, c.start, c.end) })
          .range(c.start, c.end),
      ),
    ];
    // 색과 코멘트가 섞이므로 위치 순 정렬이 필요하다
    return Decoration.set(ranges, true);
  }

  const foldField = StateField.define<DecorationSet>({
    create: (state) => buildFolds(state),
    update(deco, tr) {
      // 글자나 커서가 움직였을 때만 다시 계산
      if (!tr.docChanged && !tr.selection) return deco;
      return buildFolds(tr.state);
    },
    provide: (f) => EditorView.decorations.from(f),
  });

  // ── 코 메모 팝오버 ──────────────────────────────────────────────
  /** 메모를 뜻하는 노랑 — 본문 글자를 가리지 않도록 연하게 */
  const STITCH_COMMENT_PIN_COLOR = '#e8c25c';

  let commentFor = $state<
    { from: number; to: number; text: string; top: number; left: number } | null
  >(null);

  function openCommentPopover(from: number, to: number, text: string, anchor: HTMLElement) {
    const rect = anchor.getBoundingClientRect();
    const popW = 260;
    const margin = 8;
    let left = rect.left;
    let top = rect.bottom + 4;
    if (left + popW + margin > window.innerWidth) {
      left = Math.max(margin, window.innerWidth - popW - margin);
    }
    if (top + 150 > window.innerHeight) top = Math.max(margin, rect.top - 150 - 4);
    commentFor = { from, to, text, top, left };
  }

  /** 팝오버 밖을 누르면 닫는다 (도안 메모·단 메모와 같은 동작) */
  function handleWindowClickForComment(e: MouseEvent) {
    if (!commentFor) return;
    const t = e.target as HTMLElement | null;
    if (t?.closest?.('.stitch-comment-fixed')) return;
    if (t?.closest?.('.cm-comment-note')) return;
    commentFor = null;
  }

  /** 팝오버 결과를 소스에 반영 — `undefined` 면 메모를 지운다 */
  function applyCommentEdit(text: string | undefined) {
    const target = commentFor;
    if (!target || !view) return;
    const next = replaceComment(
      view.state.doc.toString(),
      { start: target.from, end: target.to },
      text,
    );
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
    onChange(next);
    commentFor = null;
  }

  // ── 팔레트 열기 상태 ────────────────────────────────────────────
  /**
   * 'token'     = 색 표기 하나 (스와치 클릭 / `:` 입력 직후)
   * 'selection' = 현재 선택 범위의 코들
   */
  let paletteFor = $state<
    | { kind: 'token'; from: number; to: number; color?: string; anchor: HTMLElement }
    | { kind: 'selection'; from: number; to: number; anchor: HTMLElement }
    | null
  >(null);
  let paletteBtn: HTMLButtonElement | undefined = $state();
  /** `:` 를 친 자리에 팝오버를 띄우기 위한 0×0 기준점 */
  let caretAnchor: HTMLDivElement | undefined = $state();

  const paletteCurrent = $derived(paletteFor?.kind === 'token' ? paletteFor.color : undefined);

  function openSelectionPalette() {
    if (!view || !paletteBtn) return;
    const sel = view.state.selection.main;
    paletteFor = { kind: 'selection', from: sel.from, to: sel.to, anchor: paletteBtn };
  }

  /** 캐럿 좌표에 기준점을 옮기고 그 색 표기용 팔레트를 연다 */
  function openTokenPaletteAtCaret(v: EditorView, from: number, to: number, color?: string) {
    if (!caretAnchor) return;
    const coords = v.coordsAtPos(from);
    if (!coords) return;
    caretAnchor.style.top = `${coords.bottom}px`;
    caretAnchor.style.left = `${coords.left}px`;
    paletteFor = { kind: 'token', from, to, color, anchor: caretAnchor };
  }

  /** 팔레트에서 고른 색(또는 제거)을 소스에 반영 */
  function applyColor(hex: string | undefined) {
    const target = paletteFor;
    if (!target || !view) return;
    const src = view.state.doc.toString();
    let next: string;
    if (target.kind === 'token') {
      // 팔레트를 연 뒤에도 계속 타이핑할 수 있으므로 범위를 지금 다시 구한다
      // (열 때 잡아둔 end 는 `:aa` → `:aaf` 처럼 이미 낡았을 수 있다)
      const live = colorTokenAt(scanColorTokens(src), target.from);
      next = replaceColorToken(src, live ?? { start: target.from, end: target.to }, hex);
    } else {
      next = setColorInRange(src, parsed, { start: target.from, end: target.to }, hex);
    }
    paletteFor = null;
    if (next !== src) onChange(next);
  }

  /**
   * 스페이스로 색 입력 확정 — 커서를 색 표기 끝으로 보내고 공백은 넣지 않는다.
   * 커서가 빠져나가면 그 색은 자동으로 동그라미로 접힌다.
   * 색이 아직 유효하지 않으면 평소처럼 공백이 입력된다.
   */
  function commitColorOnSpace(v: EditorView): boolean {
    const sel = v.state.selection.main;
    if (!sel.empty) return false;
    const token = colorTokenAt(scanColorTokens(v.state.doc.toString()), sel.from);
    if (!token || token.color === undefined) return false;
    paletteFor = null;
    v.dispatch({ selection: { anchor: token.end } });
    return true;
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
          foldField,
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
              // Space: 색 입력 확정 (색 표기 안일 때만. 아니면 평소대로 공백)
              key: 'Space',
              run: (v) => commitColorOnSpace(v),
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
              // `:` 를 친 직후 그 자리에 색 팔레트를 띄운다.
              // 포커스는 에디터에 남으므로 팝오버를 보면서 계속 타이핑할 수 있다.
              let typedColon = false;
              u.changes.iterChanges((_fa, _ta, _fb, _tb, inserted) => {
                if (inserted.toString() === ':') typedColon = true;
              });
              if (typedColon) {
                const pos = u.state.selection.main.head;
                const token = colorTokenAt(scanColorTokens(u.state.doc.toString()), pos);
                if (token) openTokenPaletteAtCaret(u.view, token.start, token.end, token.color);
              }
            }
            // 커서가 그 색 표기를 벗어나면 팝오버를 닫는다
            if ((u.docChanged || u.selectionSet) && paletteFor?.kind === 'token') {
              const pos = u.state.selection.main.head;
              const token = colorTokenAt(scanColorTokens(u.state.doc.toString()), pos);
              if (!token) paletteFor = null;
            }
          }),
          EditorView.domEventHandlers({
            focus: () => { onFocus?.(); },
            mousedown: (e) => {
              const note = (e.target as HTMLElement | null)?.closest?.('.cm-comment-note');
              if (note instanceof HTMLElement) {
                e.preventDefault(); // 클릭으로 커서가 튀지 않도록
                const from = Number(note.dataset.from);
                const to = Number(note.dataset.to);
                if (!Number.isFinite(from) || !Number.isFinite(to)) return false;
                openCommentPopover(from, to, note.dataset.text ?? '', note);
                return true;
              }
              const el = (e.target as HTMLElement | null)?.closest?.('.cm-color-swatch');
              if (!(el instanceof HTMLElement)) return false;
              e.preventDefault(); // 스와치 클릭으로 커서가 튀지 않도록
              const from = Number(el.dataset.from);
              const to = Number(el.dataset.to);
              if (!Number.isFinite(from) || !Number.isFinite(to)) return false;
              paletteFor = { kind: 'token', from, to, color: el.dataset.color, anchor: el };
              return true;
            },
          }),
          EditorView.theme({
            '&': { fontSize: '14px', fontFamily: "'Noto Sans KR', system-ui, sans-serif" },
            '.cm-content': { padding: '6px 8px' },
            '.cm-line': { padding: '0' },
            '&.cm-focused': { outline: 'none' },
            // 색 표기(`:aaf`)를 대신 그리는 동그라미 — 글자 자리를 차지한다
            '.cm-color-swatch': {
              display: 'inline-block',
              width: '11px',
              height: '11px',
              margin: '0 1px',
              borderRadius: '50%',
              border: '1px solid rgba(0,0,0,0.28)',
              boxShadow: '0 0 0 1px rgba(255,255,255,0.7) inset',
              verticalAlign: 'middle',
              cursor: 'pointer',
            },
            '.cm-color-swatch:hover': { transform: 'scale(1.25)' },
            // 코 메모(`"..."`)를 대신 그리는 핀 — 도안 메모·단 메모와 같은 모양
            '.cm-comment-note': {
              display: 'inline-block',
              margin: '0 2px',
              color: STITCH_COMMENT_PIN_COLOR,
              fontSize: '12px',
              lineHeight: '1',
              verticalAlign: 'middle',
              cursor: 'pointer',
              transition: 'transform 0.1s',
            },
            '.cm-comment-note:hover': { transform: 'scale(1.2)' },
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

<svelte:window onclick={handleWindowClickForComment} />

<div class="caret-anchor" bind:this={caretAnchor}></div>

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

{#if commentFor}
  <div class="stitch-comment-fixed" style="top: {commentFor.top}px; left: {commentFor.left}px;">
    <StitchCommentPopover
      text={commentFor.text}
      onSave={(t) => applyCommentEdit(t)}
      onDelete={() => applyCommentEdit(undefined)}
      onClose={() => (commentFor = null)}
    />
  </div>
{/if}

<style>
  .stitch-comment-fixed {
    position: fixed;
    z-index: 1000;
  }

  /* `:` 입력 시 팝오버를 캐럿 위치에 띄우기 위한 0×0 기준점 */
  .caret-anchor {
    position: fixed;
    width: 0; height: 0;
    pointer-events: none;
  }
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
