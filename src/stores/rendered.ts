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
import { pattern, workspace } from './tabs';
import {
  showGrid, showConnections, flatFlipVertical, flatAlign, flatCascade, flatCompact, flatVAlign,
  knitStartSide, showNotes,
  colorMode, emptyColor, mainColor, symbolColor,
} from './mode';
import type { ExpandedRound } from '$lib/expand/op';
import type { LayoutResult } from '$lib/layout/types';
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
  [chartLayout, composedLayout, showGrid, showConnections, colorMode, emptyColor, mainColor, symbolColor, chartNotes],
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
