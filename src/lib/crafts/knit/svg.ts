/**
 * 대바늘 격자 도안 SVG 렌더러.
 *
 * 코바늘 렌더러와 달리:
 *  - 칸 테두리(모눈)가 항상 그려진다 — 격자가 도안의 일부이기 때문.
 *  - 부모-자식 연결선을 그리지 않는다.
 *  - 단 번호를 격자 좌/우에 표기한다 (겉면=오른쪽, 안면=왼쪽).
 *  - 코 없음(no stitch) 칸은 회색으로 채운다.
 */

import type { LayoutResult, PositionedStitch, RoundMarker, Point } from '$lib/layout/types';
import { KNIT_SYMBOL_DEFS, knitSymbolId } from './symbols';
import { STITCH_COLOR, GRID_COLOR } from '$lib/render/palette';

const NO_STITCH_FILL = '#e8e5e0';

export interface KnitRenderOptions {
  layout: LayoutResult;
  /** 대바늘은 격자가 도안의 일부라 기본 true. false 면 테두리를 숨긴다. */
  showGrid?: boolean;
}

export function renderKnitSvg(opts: KnitRenderOptions): string {
  const { layout } = opts;
  const showGrid = opts.showGrid ?? true;
  const { bounds } = layout;
  const pad = 4;
  const viewBox = `${bounds.minX - pad} ${bounds.minY - pad} ${bounds.width + pad * 2} ${bounds.height + pad * 2}`;
  const cell = layout.cellSize ?? { width: 20, height: 14 };

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">`,
    `<defs>${KNIT_SYMBOL_DEFS}</defs>`,
    renderFillers(layout.fillerCells ?? [], cell),
    showGrid ? renderCellBorders(layout, cell) : '',
    renderRoundGroups(layout.stitches),
    renderRoundNumbers(layout.roundMarkers),
    `</svg>`,
  ].join('');
}

/** 코 없음 칸 — 회색 채움 */
function renderFillers(cells: Point[], cell: { width: number; height: number }): string {
  if (cells.length === 0) return '';
  const rects = cells.map((c) =>
    `<rect x="${fmt(c.x - cell.width / 2)}" y="${fmt(c.y - cell.height / 2)}" ` +
    `width="${fmt(cell.width)}" height="${fmt(cell.height)}" fill="${NO_STITCH_FILL}"/>`
  );
  return `<g class="no-stitch">${rects.join('')}</g>`;
}

/** 칸 테두리 — 코가 놓인 격자 영역 전체 */
function renderCellBorders(layout: LayoutResult, cell: { width: number; height: number }): string {
  const { bounds } = layout;
  const left = 0;
  const right = gridRightEdge(layout, cell);
  if (right <= left) return '';

  const lines: string[] = [];
  for (let x = left; x <= right + 0.001; x += cell.width) {
    lines.push(`<line x1="${fmt(x)}" y1="${fmt(bounds.minY)}" x2="${fmt(x)}" y2="${fmt(bounds.maxY)}" stroke="${GRID_COLOR}" stroke-width="0.6"/>`);
  }
  for (let y = bounds.minY; y <= bounds.maxY + 0.001; y += cell.height) {
    lines.push(`<line x1="${fmt(left)}" y1="${fmt(y)}" x2="${fmt(right)}" y2="${fmt(y)}" stroke="${GRID_COLOR}" stroke-width="0.6"/>`);
  }
  return `<g class="grid">${lines.join('')}</g>`;
}

/** 격자 오른쪽 끝 — 코/채움 칸 중 가장 오른쪽 칸의 오른쪽 경계 */
function gridRightEdge(layout: LayoutResult, cell: { width: number; height: number }): number {
  let maxCenter = 0;
  for (const s of layout.stitches) {
    const span = s.cell?.span ?? 1;
    maxCenter = Math.max(maxCenter, s.position.x + (span - 1) * cell.width);
  }
  for (const f of layout.fillerCells ?? []) maxCenter = Math.max(maxCenter, f.x);
  if (maxCenter === 0) return 0;
  return maxCenter + cell.width / 2;
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
  const colorStyle = s.op.color ? ` style="color: ${escapeAttr(s.op.color)}"` : '';
  // 여러 칸을 차지하는 코(kfb 등)는 차지한 칸들의 가운데에 기호를 놓는다
  const span = s.cell?.span ?? 1;
  const cellW = 20;
  const x = s.position.x + ((span - 1) * cellW) / 2;
  return `<use href="#${knitSymbolId(s.op.kind)}" x="${fmt(x)}" y="${fmt(s.position.y)}"${colorStyle}/>`;
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
