/**
 * 대바늘 격자 도안 SVG 렌더러.
 *
 * 코바늘 렌더러와 달리:
 *  - 칸 테두리(모눈)가 항상 그려진다 — 격자가 도안의 일부이기 때문.
 *  - 부모-자식 연결선을 그리지 않는다.
 *  - 단 번호를 격자 좌/우에 표기한다 (겉면=오른쪽, 안면=왼쪽).
 *  - 코 없음(no stitch) 칸은 회색으로 채운다.
 */

import type {
  LayoutResult,
  PositionedStitch,
  RoundMarker,
  PositionedMarker,
} from '$lib/layout/types';
import { KNIT_SYMBOL_DEFS, knitSymbolId } from './symbols';
import { STITCH_COLOR, GRID_COLOR } from '$lib/render/palette';
import { contrastInk } from '$lib/render/contrast';

import {
  DEFAULT_EMPTY_COLOR, DEFAULT_MAIN_COLOR, DEFAULT_SYMBOL_COLOR, type ColorMode,
} from '$lib/model/view-options';
/** 마커 선 굵기 — 격자선(0.8)보다 굵게, 볼드체 정도의 대비 */
const MARKER_STROKE = 1.6;

export interface KnitRenderOptions {
  layout: LayoutResult;
  /** 대바늘은 격자가 도안의 일부라 기본 true. false 면 테두리를 숨긴다. */
  showGrid?: boolean;
  /** 배색 범례 표시 (기본 true — 색이 쓰인 경우에만 그려짐) */
  showLegend?: boolean;
  /** 실 색을 어디에 칠할지. 대바늘 기본은 칸 채우기 */
  colorMode?: ColorMode;
  /** 코가 **없는** 칸의 색 */
  emptyColor?: string;
  /** 실 색을 지정하지 않은 코의 칸 배경색 (도안 메인 컬러) */
  mainColor?: string;
  /** 실 색을 지정하지 않은 코의 기호 선 색 */
  symbolColor?: string;
}

const LEGEND_ROW_HEIGHT = 13;
const LEGEND_GAP = 8;
const LEGEND_SWATCH = 9;

export function renderKnitSvg(opts: KnitRenderOptions): string {
  const { layout } = opts;
  const showGrid = opts.showGrid ?? true;
  // 대바늘 기본은 칸 채우기 (기호는 명도 대비로 반전)
  const fillMode = (opts.colorMode ?? 'auto') !== 'symbol';
  const emptyColor = opts.emptyColor ?? DEFAULT_EMPTY_COLOR;
  const mainColor = opts.mainColor ?? DEFAULT_MAIN_COLOR;
  const symbolColor = opts.symbolColor ?? DEFAULT_SYMBOL_COLOR;
  const { bounds } = layout;
  const pad = 4;
  const cell = layout.cellSize ?? { width: 20, height: 14 };

  // 배색 범례 — 쓰인 색과 코 수. 색이 없으면 그리지 않는다.
  const legend = (opts.showLegend ?? true) ? collectColors(layout) : [];
  const legendHeight = legend.length > 0
    ? LEGEND_GAP + legend.length * LEGEND_ROW_HEIGHT
    : 0;
  const viewBox = `${bounds.minX - pad} ${bounds.minY - pad} ` +
    `${bounds.width + pad * 2} ${bounds.height + legendHeight + pad * 2}`;

  // 코가 없는 칸은 모두 같은 회색으로 채운다 —
  // 구멍(코막음·열 맞춤), 정렬용 여백, 그리고 되돌아뜨기의 미작업 코(unw).
  const greyCells = [
    ...(layout.fillerCells ?? []),
    ...layout.stitches
      .filter((s) => s.op.kind === 'UNWORKED')
      .map((s) => ({ x: s.position.x, y: s.position.y, span: s.cell?.span ?? 1 })),
  ];

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">`,
    `<defs>${KNIT_SYMBOL_DEFS}</defs>`,
    renderFillers(greyCells, cell, emptyColor),
    renderColorCells(layout.stitches, cell, fillMode ? undefined : mainColor, mainColor),
    showGrid ? renderCellBorders(layout, cell) : '',
    renderRoundGroups(layout.stitches, fillMode, symbolColor),
    renderRoundNumbers(layout.roundMarkers),
    renderStitchMarkers(layout.stitchMarkers ?? [], cell),
    renderLegend(legend, bounds.minX, bounds.maxY + LEGEND_GAP),
    `</svg>`,
  ].join('');
}

/** 코 없음 칸 — 회색 채움 */
function renderFillers(
  cells: ReadonlyArray<{ x: number; y: number; span: number; kind?: string }>,
  cell: { width: number; height: number },
  fill: string,
): string {
  if (cells.length === 0) return '';
  const rects = cells.map((c) => {
    const w = c.span * cell.width;
    return `<rect x="${fmt(c.x - w / 2)}" y="${fmt(c.y - cell.height / 2)}" ` +
      `width="${fmt(w)}" height="${fmt(cell.height)}" fill="${escapeAttr(fill)}"/>`;
  });
  return `<g class="no-stitch">${rects.join('')}</g>`;
}

/**
 * 칸 테두리 — 칸마다 사각형을 그린다.
 * cascade 로 칸 폭이 달라질 수 있어 균일 격자선 대신 셀 단위로 그린다.
 */
function renderCellBorders(layout: LayoutResult, cell: { width: number; height: number }): string {
  const rects: string[] = [];
  const push = (cx: number, cy: number, span: number) => {
    const w = span * cell.width;
    rects.push(
      `<rect x="${fmt(cx - w / 2)}" y="${fmt(cy - cell.height / 2)}" ` +
      `width="${fmt(w)}" height="${fmt(cell.height)}" fill="none" ` +
      // vector-effect: 축소해도 격자선이 sub-pixel 로 사라지지 않도록 화면 기준 두께 유지
      `stroke="${GRID_COLOR}" stroke-width="0.8" vector-effect="non-scaling-stroke"/>`
    );
  };
  for (const s of layout.stitches) push(s.position.x, s.position.y, s.cell?.span ?? 1);
  for (const f of layout.fillerCells ?? []) push(f.x, f.y, f.span);
  if (rects.length === 0) return '';
  return `<g class="grid">${rects.join('')}</g>`;
}

function renderRoundGroups(stitches: PositionedStitch[], fillMode: boolean, symbolColor: string): string {
  const byRound = new Map<number, PositionedStitch[]>();
  for (const s of stitches) {
    const arr = byRound.get(s.roundIndex) ?? [];
    arr.push(s);
    byRound.set(s.roundIndex, arr);
  }
  const groups: string[] = [];
  for (const roundIdx of [...byRound.keys()].sort((a, b) => a - b)) {
    const items = byRound.get(roundIdx)!
      .map((s) => renderStitchUse(s, fillMode)).join('');
    // 색을 지정하지 않은 코는 이 그룹 색을 그대로 물려받는다
    groups.push(
      `<g class="round" data-round="${roundIdx}" style="color: ${escapeAttr(symbolColor)}">${items}</g>`,
    );
  }
  return groups.join('');
}

function renderStitchUse(s: PositionedStitch, fillMode: boolean): string {
  // 실 색을 지정한 코만 색을 덮어쓴다 (지정 없으면 그룹의 기본 기호색을 물려받는다).
  // 칸 채우기 모드에서는 그 칸 배경 위에서 읽히도록 대비색으로 그린다.
  const ink = s.op.color ? (fillMode ? contrastInk(s.op.color) : s.op.color) : undefined;
  const colorStyle = ink ? ` style="color: ${escapeAttr(ink)}"` : '';
  // position 은 이미 칸(여러 칸일 수 있음) 의 중심이다
  return `<use href="#${knitSymbolId(s.op.kind)}" x="${fmt(s.position.x)}" y="${fmt(s.position.y)}"${colorStyle}/>`;
}

/**
 * 코가 있는 칸의 배경 채움.
 *
 * 실 색을 지정하지 않은 코도 **메인 색**으로 칠한다 — 그래야 빈칸(회색)과
 * 코가 있는 칸(기본 흰색)이 구분된다.
 * `force` 가 주어지면(기호색 모드) 모든 칸을 그 색으로 칠한다 — 실 색은 기호에 들어간다.
 */
function renderColorCells(
  stitches: PositionedStitch[],
  cell: { width: number; height: number },
  force: string | undefined,
  mainColor: string,
): string {
  const rects: string[] = [];
  for (const s of stitches) {
    // 미작업 코는 빈칸으로 그린다 (renderFillers 가 이미 회색으로 칠했다)
    if (s.op.kind === 'UNWORKED') continue;
    const fill = force ?? s.op.color ?? mainColor;
    const w = (s.cell?.span ?? 1) * cell.width;
    rects.push(
      `<rect x="${fmt(s.position.x - w / 2)}" y="${fmt(s.position.y - cell.height / 2)}" ` +
      `width="${fmt(w)}" height="${fmt(cell.height)}" fill="${escapeAttr(fill)}"/>`
    );
  }
  if (rects.length === 0) return '';
  return `<g class="colorwork">${rects.join('')}</g>`;
}

/** 도안에 쓰인 색과 코 수 (많이 쓰인 순) */
function collectColors(layout: LayoutResult): Array<{ color: string; count: number }> {
  const counts = new Map<string, number>();
  for (const s of layout.stitches) {
    if (!s.op.color) continue;
    counts.set(s.op.color, (counts.get(s.op.color) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([color, count]) => ({ color, count }))
    .sort((a, b) => b.count - a.count);
}

/** 배색 범례 — 색 견본 + 코 수 */
function renderLegend(
  entries: Array<{ color: string; count: number }>,
  x: number,
  y: number,
): string {
  if (entries.length === 0) return '';
  const rows = entries.map((e, i) => {
    const ry = y + i * LEGEND_ROW_HEIGHT;
    return (
      `<rect x="${fmt(x)}" y="${fmt(ry)}" width="${LEGEND_SWATCH}" height="${LEGEND_SWATCH}" ` +
      `fill="${escapeAttr(e.color)}" stroke="${GRID_COLOR}" stroke-width="0.6"/>` +
      `<text x="${fmt(x + LEGEND_SWATCH + 4)}" y="${fmt(ry + LEGEND_SWATCH / 2)}" font-size="7" ` +
      `font-family="system-ui, sans-serif" fill="${STITCH_COLOR}" dominant-baseline="central">` +
      `${escapeAttr(e.color)} — ${e.count}코</text>`
    );
  });
  return `<g class="legend">${rows.join('')}</g>`;
}

/** 단 번호 — 겉면 단은 격자 오른쪽, 안면 단은 왼쪽 */
function renderRoundNumbers(markers: RoundMarker[]): string {
  if (markers.length === 0) return '';
  const parts = markers.map((m) => {
    const anchor = m.direction === 'right' ? 'start' : 'end';
    return `<text x="${fmt(m.position.x)}" y="${fmt(m.position.y)}" font-size="7" ` +
      `font-family="system-ui, sans-serif" fill="${STITCH_COLOR}" ` +
      `text-anchor="${anchor}" dominant-baseline="central">${m.roundIndex}</text>`;
  });
  return `<g class="round-numbers">${parts.join('')}</g>`;
}

/**
 * 편물 마커 — 칸 경계의 격자선을 **굵게** 덧그린다.
 *
 * 코 위가 아니라 **코 사이**를 가리키므로 칸을 덮지 않는다.
 * 기본색은 격자와 같게 두고 굵기만 올려서(볼드체처럼) 격자의 일부로 읽히게 하고,
 * 구분이 필요하면 `pm:fff` 처럼 색을 직접 지정한다.
 */
function renderStitchMarkers(
  markers: readonly PositionedMarker[],
  cell: { width: number; height: number },
): string {
  if (markers.length === 0) return '';
  const h = cell.height / 2;
  const parts = markers.map((m) => {
    const color = m.color ? escapeAttr(m.color) : GRID_COLOR;
    const { x, y } = m.position;
    const label = m.label
      ? `<text x="${fmt(x + 2)}" y="${fmt(y - h - 3)}" font-size="6" ` +
        `font-family="system-ui, sans-serif" fill="${color}" ` +
        `dominant-baseline="ideographic">${escapeAttr(m.label)}</text>`
      : '';
    return (
      `<line x1="${fmt(x)}" y1="${fmt(y - h)}" x2="${fmt(x)}" y2="${fmt(y + h)}" ` +
      `stroke="${color}" stroke-width="${MARKER_STROKE}" stroke-linecap="square" ` +
      `vector-effect="non-scaling-stroke"/>` + label
    );
  });
  return `<g class="stitch-markers">${parts.join('')}</g>`;
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmt(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}
