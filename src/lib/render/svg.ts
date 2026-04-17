/**
 * SVG 렌더러.
 *
 * LayoutResult + 단 수를 받아 완성된 SVG 문자열을 생성한다.
 *
 * 구조:
 *   <svg viewBox="...">
 *     <defs>...SYMBOL_DEFS...</defs>
 *     <g class="connections">...lines...</g>
 *     <g class="round" data-round="1" style="color: hsl(...)">
 *       <use href="#sym-SC" x=".." y=".."/>
 *       ...
 *     </g>
 *     <g class="round" data-round="2">...</g>
 *   </svg>
 *
 * 하이라이트(Read 모드)는 CSS 또는 inline style로 `.round[data-round="N"]`의
 * opacity를 제어하는 방식이다 (렌더러는 전체 불투명으로 출력).
 */

import type { LayoutResult, PositionedStitch, LayoutBounds, GridGuide } from '$lib/layout/types';
import { SYMBOL_DEFS, stitchSymbolId } from './symbols';
import {
  STITCH_COLOR,
  CONNECTION_COLOR,
  CONNECTION_DASHARRAY,
  CONNECTION_WIDTH,
  GRID_COLOR,
  GRID_AXIS_COLOR,
} from './palette';

export interface RenderOptions {
  layout: LayoutResult;
  /** 배경 그리드 표시 여부 (디버깅·확인용) */
  showGrid?: boolean;
}

export function renderSvg(opts: RenderOptions): string {
  const { layout } = opts;
  const showGrid = opts.showGrid ?? false;
  const { bounds, stitches } = layout;
  const viewBox = `${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`;

  const grid = showGrid ? renderGrid(layout.gridGuide, bounds) : '';
  const connections = renderConnections(stitches);
  const roundGroups = renderRoundGroups(stitches);
  const markers = renderRoundMarkers(layout.roundMarkers);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">`,
    `<defs>${SYMBOL_DEFS}</defs>`,
    grid,
    connections,
    roundGroups,
    markers,
    `</svg>`,
  ].join('');
}

function renderRoundMarkers(markers: import('$lib/layout/types').RoundMarker[]): string {
  if (markers.length === 0) return '';
  const TRI = 3.5;       // 삼각형 반치수
  const GAP = 2.5;       // 삼각형과 숫자 사이 여백

  const parts = markers.map((m) => {
    const { x, y } = m.position;
    if (m.direction === 'right') {
      // ▶: 꼭짓점이 오른쪽, 시작코를 가리킴. 숫자는 왼쪽에.
      const tri = `<path d="M ${fmt(x - TRI)},${fmt(y - TRI)} L ${fmt(x + TRI)},${fmt(y)} L ${fmt(x - TRI)},${fmt(y + TRI)} Z" fill="${STITCH_COLOR}"/>`;
      const text = `<text x="${fmt(x - TRI - GAP)}" y="${fmt(y)}" font-size="8" font-family="system-ui, sans-serif" font-weight="600" fill="${STITCH_COLOR}" text-anchor="end" dominant-baseline="central">${m.roundIndex}</text>`;
      return tri + text;
    }
    // ◀: 꼭짓점이 왼쪽. 숫자는 오른쪽에.
    const tri = `<path d="M ${fmt(x + TRI)},${fmt(y - TRI)} L ${fmt(x - TRI)},${fmt(y)} L ${fmt(x + TRI)},${fmt(y + TRI)} Z" fill="${STITCH_COLOR}"/>`;
    const text = `<text x="${fmt(x + TRI + GAP)}" y="${fmt(y)}" font-size="8" font-family="system-ui, sans-serif" font-weight="600" fill="${STITCH_COLOR}" text-anchor="start" dominant-baseline="central">${m.roundIndex}</text>`;
    return tri + text;
  });
  return `<g class="round-markers">${parts.join('')}</g>`;
}

function renderGrid(guide: GridGuide | undefined, bounds: LayoutBounds): string {
  if (!guide) return renderRectGrid(bounds, 20, 20, 0, 0);
  if (guide.type === 'concentric') {
    return renderConcentricGrid(guide.ringRadii, guide.sectorCount);
  }
  return renderRectGrid(bounds, guide.cellWidth, guide.cellHeight, guide.xOffset, guide.yOffset);
}

function renderConcentricGrid(ringRadii: number[], sectorCount: number): string {
  if (ringRadii.length === 0) return `<g class="grid"></g>`;
  const maxR = Math.max(...ringRadii);
  const parts: string[] = [];

  // 동심원
  for (const r of ringRadii) {
    parts.push(
      `<circle cx="0" cy="0" r="${fmt(r)}" fill="none" stroke="${GRID_COLOR}" stroke-width="0.6"/>`
    );
  }

  // 방사선 — 시작 각도 -π/2 (12시), 시계방향
  if (sectorCount > 0) {
    for (let i = 0; i < sectorCount; i++) {
      const angle = -Math.PI / 2 + (2 * Math.PI * i) / sectorCount;
      const x = maxR * Math.cos(angle);
      const y = maxR * Math.sin(angle);
      parts.push(
        `<line x1="0" y1="0" x2="${fmt(x)}" y2="${fmt(y)}" stroke="${GRID_COLOR}" stroke-width="0.5"/>`
      );
    }
  }

  // 중심점 표시
  parts.push(`<circle cx="0" cy="0" r="1.5" fill="${GRID_AXIS_COLOR}"/>`);

  return `<g class="grid">${parts.join('')}</g>`;
}

function renderRectGrid(
  bounds: LayoutBounds,
  cellWidth: number,
  cellHeight: number,
  xOffset: number,
  yOffset: number,
): string {
  // 셀 경계 라인 위치: xOffset + k*cellWidth, yOffset + k*cellHeight
  // 한 셀 안에 stitch 한 개가 들어가도록 정렬됨.
  const startX = alignToOffset(bounds.minX, cellWidth, xOffset, true);
  const endX = alignToOffset(bounds.maxX, cellWidth, xOffset, false);
  const startY = alignToOffset(bounds.minY, cellHeight, yOffset, true);
  const endY = alignToOffset(bounds.maxY, cellHeight, yOffset, false);

  const lines: string[] = [];
  for (let x = startX; x <= endX; x += cellWidth) {
    lines.push(`<line x1="${fmt(x)}" y1="${fmt(startY)}" x2="${fmt(x)}" y2="${fmt(endY)}" stroke="${GRID_COLOR}" stroke-width="0.5"/>`);
  }
  for (let y = startY; y <= endY; y += cellHeight) {
    lines.push(`<line x1="${fmt(startX)}" y1="${fmt(y)}" x2="${fmt(endX)}" y2="${fmt(y)}" stroke="${GRID_COLOR}" stroke-width="0.5"/>`);
  }
  return `<g class="grid">${lines.join('')}</g>`;
}

/** value를 (offset + k*step) 형태에 맞춰 정렬. floor=true면 내림(시작), false면 올림(끝). */
function alignToOffset(value: number, step: number, offset: number, floor: boolean): number {
  const k = floor
    ? Math.floor((value - offset) / step)
    : Math.ceil((value - offset) / step);
  return offset + k * step;
}

function renderConnections(stitches: PositionedStitch[]): string {
  const parts: string[] = [];
  // 같은 (parent, child) 쌍은 1번만 그림 (V → 2 자식의 경우 동일 부모를 두 자식이 가리켜도 각자 1선)
  const seen = new Set<string>();
  for (let i = 0; i < stitches.length; i++) {
    const s = stitches[i]!;
    for (const pidx of s.parentIndices) {
      const key = `${pidx}-${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const parent = stitches[pidx];
      if (!parent) continue;
      parts.push(
        `<line x1="${fmt(parent.position.x)}" y1="${fmt(parent.position.y)}" ` +
        `x2="${fmt(s.position.x)}" y2="${fmt(s.position.y)}" ` +
        `stroke="${CONNECTION_COLOR}" stroke-width="${CONNECTION_WIDTH}" ` +
        `stroke-dasharray="${CONNECTION_DASHARRAY}"/>`
      );
    }
  }
  return `<g class="connections">${parts.join('')}</g>`;
}

function renderRoundGroups(stitches: PositionedStitch[]): string {
  const byRound = new Map<number, PositionedStitch[]>();
  for (const s of stitches) {
    const arr = byRound.get(s.roundIndex) ?? [];
    arr.push(s);
    byRound.set(s.roundIndex, arr);
  }

  const sortedRounds = [...byRound.keys()].sort((a, b) => a - b);
  const groups: string[] = [];

  for (const roundIdx of sortedRounds) {
    const items = byRound.get(roundIdx)!.map(renderStitchUse).join('');
    groups.push(
      `<g class="round" data-round="${roundIdx}" style="color: ${STITCH_COLOR}">${items}</g>`
    );
  }

  return groups.join('');
}

function renderStitchUse(s: PositionedStitch): string {
  const sym = stitchSymbolId(s.op.kind);
  const x = fmt(s.position.x);
  const y = fmt(s.position.y);
  const angleDeg = fmt(((s.angle ?? 0) * 180) / Math.PI);
  return `<use href="#${sym}" x="${x}" y="${y}" transform="rotate(${angleDeg} ${x} ${y})"/>`;
}

function fmt(n: number): string {
  // 소수점 2자리로 축약, 정수는 그대로
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}
