/**
 * 현재 활성 탭 + 표시 옵션으로부터 파생되는 레이아웃·SVG 렌더 결과.
 *
 * ChartViewer 가 이 store 를 읽어 화면에 그리고, App.svelte 의 내보내기 경로
 * (SVG/PNG) 도 같은 결과를 재사용한다. 기존에 ChartViewer 안의 $derived.by
 * 에 있던 로직을 이곳으로 옮겨 단일 출처로 만든 것.
 *
 * 레이아웃과 렌더를 두 단계로 나눠 둔다 — 3D 미리보기는 SVG 가 아니라 **좌표**가
 * 필요해서, 색·기호 같은 렌더 옵션만 바뀔 때 레이아웃을 다시 풀 이유가 없다.
 */

import { derived } from 'svelte/store';
import { pattern, workspace, activeSplit } from './tabs';
import {
  showGrid, showConnections, flatFlipVertical, flatAlign, flatCascade, flatCompact, flatVAlign,
  knitStartSide, showNotes,
  colorMode, emptyColor, mainColor, symbolColor,
} from './mode';
import type { ExpandedRound } from '$lib/expand/op';
import type { LayoutResult, Decoration } from '$lib/layout/types';
import type { SplitInfo } from '$lib/model/pieces';
import { getCraft, type CraftId } from '$lib/crafts';
import { applyAdjustments, adjustTransform, type Adjustments } from '$lib/layout/adjust';
import { adjustments } from './tabs';
import type { ChartNote } from '$lib/render/notes';
import { planRounds } from '$lib/model/round-plan';
import { composeWithPieces, type PieceLayout } from '$lib/layout/compose';

export interface RenderedChart {
  svg: string;
  width: number;
  height: number;
  totalRounds: number;
  /** 격자 크래프트(대바늘) 의 칸 크기. 최소 가독 크기 계산에 사용 */
  cellWidth?: number;
  cellHeight?: number;
}

/** 레이아웃 단계 결과 — 코마다의 좌표와 부모 관계 */
export interface ChartLayout {
  craft: CraftId;
  layout: LayoutResult;
  totalRounds: number;
}

/**
 * 도안 행 — 읽기 모드가 걷는 단위.
 *
 * 편집기 줄과 1:1 이 아니다: 접어 적은 줄(`11~25단:`)은 한 행, 되풀이 줄
 * (`1~2단 반복*3`)은 여러 행이 된다. 서술 도안과 단 메모는 **그 행을 만든 줄**에서
 * 가져오는데, 되풀이로 복사된 행은 원본 줄을 가리킨다.
 */
export interface ChartRow {
  /** 1-based 도안 행 번호 (SVG 의 data-round 와 같다) */
  index: number;
  /** 단 번호 라벨 (`12`, `11~25`) */
  label: string;
  /** 이 행을 만든 편집기 줄 id */
  lineId: string;
  /** 글과 메모를 가져올 줄 id — 되풀이 행은 원본 줄 */
  sourceLineId: string;
  /** 이 행의 코 수 (코 단위 이동용) */
  stitchCount: number;
}

export const chartRows = derived(pattern, ($pattern): ChartRow[] => {
  const rows: ChartRow[] = [];
  for (const row of planRounds($pattern.rounds).chart) {
    if (row.expanded.ops.length === 0) continue;
    const line = $pattern.rounds[row.lineIndex];
    const source = $pattern.rounds[row.copyOf ?? row.lineIndex];
    if (!line) continue;
    rows.push({
      index: rows.length + 1,
      label: row.expanded.label ?? String(row.number),
      lineId: line.id,
      sourceLineId: (source ?? line).id,
      stitchCount: row.expanded.ops.length,
    });
  }
  return rows;
});

export const chartLayout = derived(
  [pattern, flatFlipVertical, flatAlign, flatCascade, flatCompact, flatVAlign, knitStartSide],
  ([$pattern, $flatFlipVertical, $flatAlign, $flatCascade, $flatCompact,
    $flatVAlign, $knitStartSide]): ChartLayout | null => {
    // 줄 → 도안 행 계획 (접어 적은 줄은 한 행, 되풀이 줄은 여러 행)
    const validRounds: ExpandedRound[] = [];
    for (const row of planRounds($pattern.rounds).chart) {
      if (row.expanded.ops.length === 0) continue;
      validRounds.push(row.expanded);
    }
    if (validRounds.length === 0) return null;
    const craft = getCraft($pattern.craft);
    return {
      craft: $pattern.craft,
      // 캔버스에서 고를 수 있도록 키를 붙이고, 손으로 다듬은 배치를 덧입힌다
      layout: applyAdjustments(craft.layout(validRounds, {
        shape: $pattern.shape,
        gauge: $pattern.gauge,
        flipVertical: $flatFlipVertical,
        align: $flatAlign,
        cascade: $flatCascade,
        compact: $flatCompact,
        startLeft: $knitStartSide === 'L',
        vAlign: $flatVAlign,
      }), $pattern.adjust),
      totalRounds: validRounds.length,
    };
  },
);

/**
 * 조각을 합쳐 그린 레이아웃.
 *
 * 몸통이 조각을 이어 시작하면(`Tab.startsFrom`) 그 조각들을 **아래에 나란히** 붙여
 * 한 장으로 만든다. 합친 결과는 **보여 주기 전용**이라 3D·게이지·캔버스 선택은
 * `chartLayout`(몸통 자신의 레이아웃)을 그대로 쓴다.
 */
export const composedLayout = derived(
  [chartLayout, workspace, flatAlign, flatCascade, flatCompact, flatVAlign, flatFlipVertical, knitStartSide],
  ([$chartLayout, $ws, $align, $cascade, $compact, $vAlign, $flip, $startSide]): LayoutResult | null => {
    if (!$chartLayout) return null;
    const tab = $ws.tabs.find((t) => t.id === $ws.activeTabId);
    const start = tab?.startsFrom;
    if (!start) return $chartLayout.layout;

    const ids = start.kind === 'join' ? start.pieces : [start.piece];
    const pieces: PieceLayout[] = [];
    for (const id of ids) {
      const piece = $ws.tabs.find((t) => t.id === id);
      if (!piece) continue;
      const rounds = planRounds(piece.rounds).chart
        .map((r) => r.expanded)
        .filter((e) => e.ops.length > 0);
      if (rounds.length === 0) continue;
      const craft = getCraft(piece.craft);
      pieces.push({
        name: piece.name,
        ...(start.kind === 'from'
          ? { range: { at: start.at ?? 1, count: start.stitches ?? Number.MAX_SAFE_INTEGER } }
          : {}),
        layout: craft.layout(rounds, {
          shape: piece.shape,
          gauge: piece.gauge,
          flipVertical: $flip,
          align: $align,
          cascade: $cascade,
          compact: $compact,
          startLeft: $startSide === 'L',
          vAlign: $vAlign,
        }),
      });
    }
    return composeWithPieces(
      $chartLayout.layout,
      pieces,
      { chain: start.kind === 'join' ? start.chain : 0 },
    );
  },
);

/**
 * 나눠 주는 쪽 표시 — 이 도안을 이어받는 파트가 있으면 **마지막 단**에 누가 어디를
 * 가져가는지 적고, 남는 코는 쉼코로 표시한다.
 */
function splitDecorations(layout: LayoutResult, split: SplitInfo): Decoration[] {
  const lastRound = layout.stitches.reduce((max, s) => Math.max(max, s.roundIndex), 0);
  const row = layout.stitches.filter((s) => s.roundIndex === lastRound && s.op.produce > 0);
  if (row.length === 0) return [];
  const out: Decoration[] = [];
  const takenIdx = new Set<number>();
  // 단의 한가운데 — 여기서 **바깥쪽**이 어디인지 가린다 (원형은 반지름 방향, 평면은 좌우)
  const center = {
    x: row.reduce((a, s) => a + s.position.x, 0) / row.length,
    y: row.reduce((a, s) => a + s.position.y, 0) / row.length,
  };

  for (const child of split.children) {
    const from = Math.max(0, child.at - 1);
    const slice = row.slice(from, from + child.count);
    if (slice.length === 0) continue;
    slice.forEach((_, i) => takenIdx.add(from + i));
    const mid = slice[Math.floor(slice.length / 2)]!;
    const away = outward(mid.position, center);
    out.push({
      kind: 'label',
      at: { x: mid.position.x + away.x * 24, y: mid.position.y + away.y * 24 },
      text: `→ ${child.name} ${child.count}코`,
      align: 'middle',
    });
    // 구간의 **양 끝**에만 눈금을 긋는다. 첫 코와 끝 코를 바로 이으면 원형에서
    // 도안 한가운데를 가로지르는 선이 된다.
    for (const end of [slice[0]!, slice[slice.length - 1]!]) {
      const dir = outward(end.position, center);
      out.push({
        kind: 'line',
        from: { x: end.position.x + dir.x * 8, y: end.position.y + dir.y * 8 },
        to: { x: end.position.x + dir.x * 17, y: end.position.y + dir.y * 17 },
      });
    }
  }

  if (split.leftover > 0) {
    const rest = row.find((_, i) => !takenIdx.has(i));
    if (rest) {
      const dir = outward(rest.position, center);
      out.push({
        kind: 'label',
        at: { x: rest.position.x + dir.x * 24, y: rest.position.y + dir.y * 24 },
        text: `쉼코 ${split.leftover}코`,
        align: 'middle',
        muted: true,
      });
    }
  }
  return out;
}

/** 단의 한가운데에서 그 코로 향하는 **바깥 방향** (길이 1) */
function outward(p: { x: number; y: number }, center: { x: number; y: number }): { x: number; y: number } {
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.001) return { x: 0, y: -1 };
  return { x: dx / len, y: dy / len };
}

/** 나눠 주는 표시까지 얹은 최종 레이아웃 */
export const chartForRender = derived(
  [composedLayout, activeSplit],
  ([$layout, $split]): LayoutResult | null => {
    if (!$layout) return null;
    if (!$split || $split.children.length === 0) return $layout;
    return {
      ...$layout,
      decorations: [...($layout.decorations ?? []), ...splitDecorations($layout, $split)],
    };
  },
);

/**
 * 도안에 함께 그릴 메모.
 *
 * 편집기의 메모를 **도안 행**에 맞춰 옮긴다 — 접어 적은 줄은 한 행, 되풀이 줄은
 * 여러 행이라 줄 id 로는 자리를 찾을 수 없다. 손으로 옮긴 배치도 여기서 입힌다.
 */
export const chartNotes = derived(
  [workspace, chartRows, showNotes, adjustments],
  ([$ws, $rows, $showNotes, $adjust]): ChartNote[] => {
    if (!$showNotes) return [];
    const tab = $ws.tabs.find((t) => t.id === $ws.activeTabId);
    if (!tab) return [];
    const out: ChartNote[] = [];
    for (const c of tab.comments) {
      if (!c.text.trim()) continue;
      if (c.target.kind === 'pattern') {
        out.push(withAdjust({ key: 'note:pattern', text: c.text, color: c.color }, $adjust));
        continue;
      }
      const roundId = c.target.roundId;
      const row = $rows.find((r) => r.sourceLineId === roundId || r.lineId === roundId);
      if (!row) continue;   // 단을 잃은 메모 — 편집기에서 다시 붙인다
      out.push(withAdjust({
        key: `note:${row.index}`,
        text: c.text,
        color: c.color,
        roundIndex: row.index,
      }, $adjust));
    }
    return out;
  },
);

function withAdjust(note: ChartNote, adjust: Adjustments): ChartNote {
  const a = adjust[note.key];
  const t = adjustTransform(a, 0, 0);
  return t ? { ...note, transform: t } : note;
}

export const renderedChart = derived(
  [chartLayout, chartForRender, showGrid, showConnections, colorMode, emptyColor, mainColor, symbolColor, chartNotes],
  ([$chartLayout, $composed, $showGrid, $showConnections,
    $colorMode, $emptyColor, $mainColor, $symbolColor, $notes]): RenderedChart | null => {
    if (!$chartLayout) return null;
    const { totalRounds } = $chartLayout;
    const layout = $composed ?? $chartLayout.layout;
    const craft = getCraft($chartLayout.craft);
    return {
      svg: craft.render(layout, {
        showGrid: $showGrid,
        showConnections: $showConnections,
        colorMode: $colorMode,
        emptyColor: $emptyColor,
        mainColor: $mainColor,
        symbolColor: $symbolColor,
        notes: $notes,
      }),
      width: layout.bounds.width,
      height: layout.bounds.height,
      totalRounds,
      ...(layout.cellSize
        ? { cellWidth: layout.cellSize.width, cellHeight: layout.cellSize.height }
        : {}),
    };
  },
);
