/**
 * 대바늘 격자 도안 SVG 렌더러.
 *
 * 코바늘 렌더러와 달리:
 *  - 칸 테두리(모눈)가 항상 그려진다 — 격자가 도안의 일부이기 때문.
 *  - 부모-자식 연결선을 그리지 않는다.
 *  - 단 번호를 격자 좌/우에 표기한다 (겉면=오른쪽, 안면=왼쪽).
 *  - 코 없음(no stitch) 칸은 회색으로 채운다.
 */

import type { LayoutResult, PositionedStitch, RoundMarker } from '$lib/layout/types';
import { KNIT_SYMBOL_DEFS, knitSymbolId } from './symbols';
import { STITCH_COLOR, GRID_COLOR } from '$lib/render/palette';
import { contrastInk } from '$lib/render/contrast';

const NO_STITCH_FILL = '#e8e5e0';

export interface KnitRenderOptions {
  layout: LayoutResult;
  /** 대바늘은 격자가 도안의 일부라 기본 true. false 면 테두리를 숨긴다. */
  showGrid?: boolean;
  /** 배색 범례 표시 (기본 true — 색이 쓰인 경우에만 그려짐) */
  showLegend?: boolean;
}

const LEGEND_ROW_HEIGHT = 13;
const LEGEND_GAP = 8;
const LEGEND_SWATCH = 9;

export function renderKnitSvg(opts: KnitRenderOptions): string {
  const { layout } = opts;
  const showGrid = opts.showGrid ?? true;
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

  // 미작업 코(unw) 는 실제 코지만 되돌아뜨기로 뜨지 않은 자리라 회색으로 채운다
  const greyCells = [
    ...(layout.fillerCells ?? []),
    ...layout.stitches
      .filter((s) => s.op.kind === 'UNWORKED')
      .map((s) => ({ x: s.position.x, y: s.position.y, span: s.cell?.span ?? 1 })),
  ];

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">`,
    `<defs>${KNIT_SYMBOL_DEFS}</defs>`,
    renderFillers(greyCells, cell),
    renderColorCells(layout.stitches, cell),
    showGrid ? renderCellBorders(layout, cell) : '',
    renderRoundGroups(layout.stitches),
    renderRoundNumbers(layout.roundMarkers),
    renderLegend(legend, bounds.minX, bounds.maxY + LEGEND_GAP),
    `</svg>`,
  ].join('');
}

/** 코 없음 칸 — 회색 채움 */
function renderFillers(
  cells: ReadonlyArray<{ x: number; y: number; span: number }>,
  cell: { width: number; height: number },
): string {
  if (cells.length === 0) return '';
  const rects = cells.map((c) => {
    const w = c.span * cell.width;
    return `<rect x="${fmt(c.x - w / 2)}" y="${fmt(c.y - cell.height / 2)}" ` +
      `width="${fmt(w)}" height="${fmt(cell.height)}" fill="${NO_STITCH_FILL}"/>`;
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

function renderRoundGroups(stitches: PositionedStitch[]): string {
  const byRound = new Map<number, PositionedStitch[]>();
  for (const s of stitches) {
    const arr = byRound.get(s.roundIndex) ?? [];
    arr.push(s);
    byRound.set(s.roundIndex, arr);
  }
  const groups: string[] = [];
  for (const roundIdx of [...byRound.keys()].sort((a, b) => a - b)) {
    const items = byRound.get(roundIdx)!.map(renderStitchUse).join('');
    groups.push(`<g class="round" data-round="${roundIdx}" style="color: ${STITCH_COLOR}">${items}</g>`);
  }
  return groups.join('');
}

function renderStitchUse(s: PositionedStitch): string {
  // 배색 도안: 색은 **칸 배경**으로 칠하고 기호는 대비색으로 그린다
  const colorStyle = s.op.color ? ` style="color: ${escapeAttr(contrastInk(s.op.color))}"` : '';
  // position 은 이미 칸(여러 칸일 수 있음) 의 중심이다
  return `<use href="#${knitSymbolId(s.op.kind)}" x="${fmt(s.position.x)}" y="${fmt(s.position.y)}"${colorStyle}/>`;
}

/** 색이 지정된 칸의 배경 채움 */
function renderColorCells(
  stitches: PositionedStitch[],
  cell: { width: number; height: number },
): string {
  const rects: string[] = [];
  for (const s of stitches) {
    if (!s.op.color) continue;
    const w = (s.cell?.span ?? 1) * cell.width;
    rects.push(
      `<rect x="${fmt(s.position.x - w / 2)}" y="${fmt(s.position.y - cell.height / 2)}" ` +
      `width="${fmt(w)}" height="${fmt(cell.height)}" fill="${escapeAttr(s.op.color)}"/>`
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

function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmt(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}
