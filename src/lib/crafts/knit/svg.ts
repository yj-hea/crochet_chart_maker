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
    showGrid ? renderCellBorders(layout, cell) : '',
    renderRoundGroups(layout.stitches),
    renderRoundNumbers(layout.roundMarkers),
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
  const colorStyle = s.op.color ? ` style="color: ${escapeAttr(s.op.color)}"` : '';
  // position 은 이미 칸(여러 칸일 수 있음) 의 중심이다
  return `<use href="#${knitSymbolId(s.op.kind)}" x="${fmt(s.position.x)}" y="${fmt(s.position.y)}"${colorStyle}/>`;
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
