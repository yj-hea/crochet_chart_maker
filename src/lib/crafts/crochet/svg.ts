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

import { contrastInk } from '$lib/render/contrast';
import { DEFAULT_MAIN_COLOR, DEFAULT_SYMBOL_COLOR, type ColorMode } from '$lib/model/view-options';
import type {
  LayoutResult,
  PositionedStitch,
  LayoutBounds,
  GridGuide,
  PositionedMarker,
} from '$lib/layout/types';
import { SYMBOL_DEFS, stitchSymbolId } from './symbols';
import { STITCH_META } from '$lib/crafts/crochet/stitch';
import { FLAT_CELL_WIDTH } from '$lib/layout/constants';
import {
  STITCH_COLOR,
  CONNECTION_COLOR,
  CONNECTION_DASHARRAY,
  CONNECTION_WIDTH,
  GRID_COLOR,
  GRID_AXIS_COLOR,
} from '$lib/render/palette';

export interface RenderOptions {
  layout: LayoutResult;
  /**
   * 실 색을 어디에 칠할지. 코바늘 기본은 기호 선 색.
   * 'fill' 이면 기호 뒤에 색 원반을 깔고 기호를 명도 대비로 반전한다 —
   * 실이 진할 때 기호가 묻히지 않고 배색이 덩어리로 읽힌다.
   */
  colorMode?: ColorMode;
  /** 코가 **없는** 자리(바탕)의 색. 미지정이면 투명 */
  emptyColor?: string;
  /** 실 색을 지정하지 않은 코의 칸 배경색 (도안 메인 컬러) */
  mainColor?: string;
  /** 실 색을 지정하지 않은 코의 기호 선 색 */
  symbolColor?: string;
  /** 배경 그리드 표시 여부 (디버깅·확인용) */
  showGrid?: boolean;
  /** 부모-자식 연결선 표시 여부 (기본 true) */
  showConnections?: boolean;
}

export function renderSvg(opts: RenderOptions): string {
  const { layout } = opts;
  const showGrid = opts.showGrid ?? false;
  const showConnections = opts.showConnections ?? true;
  // 코바늘 기본은 기호 선 색
  const fillMode = opts.colorMode === 'fill';
  const mainColor = opts.mainColor ?? DEFAULT_MAIN_COLOR;
  const symbolColor = opts.symbolColor ?? DEFAULT_SYMBOL_COLOR;
  const { bounds, stitches } = layout;
  const viewBox = `${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`;

  const grid = showGrid ? renderGrid(layout.gridGuide, bounds) : '';
  const connections = showConnections ? renderConnections(stitches) : '';
  const roundGroups = renderRoundGroups(stitches, fillMode, symbolColor);
  const markers = renderRoundMarkers(layout.roundMarkers);
  const background = opts.emptyColor
    ? `<rect x="${fmt(bounds.minX)}" y="${fmt(bounds.minY)}" ` +
      `width="${fmt(bounds.width)}" height="${fmt(bounds.height)}" ` +
      `fill="${escapeAttr(opts.emptyColor)}"/>`
    : '';

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">`,
    `<defs>${SYMBOL_DEFS}</defs>`,
    background,
    renderStitchBackdrops(stitches, layout.gridGuide, fillMode, mainColor),
    grid,
    connections,
    roundGroups,
    markers,
    renderStitchMarkers(layout.stitchMarkers ?? [], layout.gridGuide),
    `</svg>`,
  ].join('');
}

/** 마커 눈금 반길이 (px) */
const MARKER_HALF = 10;
/** 마커 선 굵기 — 격자선(0.5~0.6)보다 굵게, 볼드체 정도의 대비 */
const MARKER_STROKE = 1.4;

/**
 * 편물 마커 — 코 **사이** 경계에 눈금을 긋는다.
 *
 * 원형은 반지름 방향(동심원 격자의 방사선과 같은 방향), 평면은 세로.
 * 기본색은 격자와 같고 굵기만 올린다. `pm:fff` 로 색을 바꿀 수 있다.
 */
function renderStitchMarkers(
  markers: readonly PositionedMarker[],
  guide: GridGuide | undefined,
): string {
  if (markers.length === 0) return '';
  const half = guide?.type === 'rect' ? Math.max(MARKER_HALF, guide.cellHeight / 2) : MARKER_HALF;

  const parts = markers.map((m) => {
    const color = m.color ? escapeAttr(m.color) : GRID_COLOR;
    let x1: number, y1: number, x2: number, y2: number;
    if (m.angle !== undefined) {
      // 원형 — 반지름 방향으로 뻗는다
      const r = Math.hypot(m.position.x, m.position.y);
      const c = Math.cos(m.angle);
      const s = Math.sin(m.angle);
      x1 = (r - half) * c; y1 = (r - half) * s;
      x2 = (r + half) * c; y2 = (r + half) * s;
    } else {
      x1 = m.position.x; y1 = m.position.y - half;
      x2 = m.position.x; y2 = m.position.y + half;
    }
    const label = m.label
      ? `<text x="${fmt(x2 + 2)}" y="${fmt(y2)}" font-size="6" ` +
        `font-family="system-ui, sans-serif" fill="${color}" ` +
        `dominant-baseline="central">${escapeAttr(m.label)}</text>`
      : '';
    return (
      `<line x1="${fmt(x1)}" y1="${fmt(y1)}" x2="${fmt(x2)}" y2="${fmt(y2)}" ` +
      `stroke="${color}" stroke-width="${MARKER_STROKE}" stroke-linecap="square" ` +
      `vector-effect="non-scaling-stroke"/>` + label
    );
  });
  return `<g class="stitch-markers">${parts.join('')}</g>`;
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
  if (guide.verticalLines && guide.verticalLines.length > 0) {
    return renderVariableRectGrid(bounds, guide.verticalLines, guide.cellHeight, guide.yOffset);
  }
  return renderRectGrid(bounds, guide.cellWidth, guide.cellHeight, guide.xOffset, guide.yOffset);
}

function renderVariableRectGrid(
  bounds: LayoutBounds,
  verticalLines: number[],
  cellHeight: number,
  yOffset: number,
): string {
  const startY = alignToOffset(bounds.minY, cellHeight, yOffset, true);
  const endY = alignToOffset(bounds.maxY, cellHeight, yOffset, false);
  const minX = Math.min(bounds.minX, verticalLines[0]!);
  const maxX = Math.max(bounds.maxX, verticalLines[verticalLines.length - 1]!);
  const lines: string[] = [];
  for (const x of verticalLines) {
    lines.push(`<line x1="${fmt(x)}" y1="${fmt(startY)}" x2="${fmt(x)}" y2="${fmt(endY)}" stroke="${GRID_COLOR}" stroke-width="0.5"/>`);
  }
  for (let y = startY; y <= endY; y += cellHeight) {
    lines.push(`<line x1="${fmt(minX)}" y1="${fmt(y)}" x2="${fmt(maxX)}" y2="${fmt(y)}" stroke="${GRID_COLOR}" stroke-width="0.5"/>`);
  }
  return `<g class="grid">${lines.join('')}</g>`;
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
    // SKIP 은 건너뜀 표시일 뿐 실제 연결 관계가 아니므로 연결선 생략
    if (s.op.kind === 'SKIP') continue;
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

/**
 * 코 자리에 깔리는 색 바탕 — 대바늘의 "코가 있는 칸" 에 해당한다.
 *
 * 코바늘엔 격자 칸이 없으므로 기호 자리에 직접 깐다. 실 색을 지정하지 않은 코도
 * **메인 색**(기본 흰색)으로 깔아서, 바탕(빈칸 색)과 코가 있는 자리가 구분된다.
 * 기호색 모드에서도 메인 색으로 깔린다 — 실 색은 기호 선에 들어간다.
 *
 * **평면**은 격자가 있으므로 대바늘처럼 칸을 그대로 채운다 — 칸끼리 딱 붙어
 * 배색이 면으로 읽힌다.
 *
 * **원형**은 격자 칸이 없어 기호 자리에 타원을 깐다. 크기는 도안 안의 모든 코가
 * 같고(코마다 다르면 배색이 들쭉날쭉하다), 그 하나의 크기는 **도안에서 가장 긴
 * 기호**에 맞춘다. 세로만 그렇게 늘리고 가로는 코 간격의 절반으로 묶는다 —
 * 가로까지 키우면 이웃 코 바탕을 덮어 색 경계에서 뒤에 그린 쪽이 앞을 잘라먹는다.
 * 기호와 같은 각도로 회전시킨다.
 */
/** 기호 끝에서 바탕이 더 뻗는 여유 */
const DISC_PAD = 2.5;
/** 가로 반지름 상한 — 이웃 코 바탕과 겹치지 않는 선 (평면 한 칸 너비의 절반) */
const DISC_MAX_RX = FLAT_CELL_WIDTH / 2;

function renderStitchBackdrops(
  stitches: PositionedStitch[],
  guide: GridGuide | undefined,
  fillMode: boolean,
  mainColor: string,
): string {
  const drawn = stitches.filter((s) => s.op.kind !== 'MAGIC'); // 매직링은 코가 아니다
  if (drawn.length === 0) return '';
  const fillOf = (s: PositionedStitch) =>
    escapeAttr(fillMode ? (s.op.color ?? mainColor) : mainColor);

  // 평면 — 격자 칸을 그대로 채운다
  if (guide?.type === 'rect') {
    const w = guide.cellWidth;
    const h = guide.cellHeight;
    const cells = drawn.map((s) =>
      `<rect x="${fmt(s.position.x - w / 2)}" y="${fmt(s.position.y - h / 2)}" ` +
      `width="${fmt(w)}" height="${fmt(h)}" fill="${fillOf(s)}"/>`,
    );
    return `<g class="colorwork">${cells.join('')}</g>`;
  }

  // 원형 — 도안에서 가장 긴 기호 기준. 한 번 정하면 모든 코에 같은 크기를 쓴다
  const ry = drawn.reduce((max, s) => Math.max(max, symbolHalf(s.op)), 0) + DISC_PAD;
  const rx = Math.min(DISC_MAX_RX, ry);
  const discs = drawn.map((s) => {
    const x = fmt(s.position.x);
    const y = fmt(s.position.y);
    const angleDeg = fmt(((s.angle ?? 0) * 180) / Math.PI);
    return (
      `<ellipse cx="${x}" cy="${y}" rx="${fmt(rx)}" ry="${fmt(ry)}" ` +
      `transform="rotate(${angleDeg} ${x} ${y})" fill="${fillOf(s)}"/>`
    );
  });
  return `<g class="colorwork">${discs.join('')}</g>`;
}

/** 이 코 기호의 반높이 — V/A 는 base 코, 긴뜨기 계열은 감은 수를 반영 */
function symbolHalf(op: PositionedStitch['op']): number {
  const isIncDec = op.kind === 'INC' || op.kind === 'DEC';
  const baseKind = isIncDec && op.baseKind ? op.baseKind : op.kind;
  if ((baseKind === 'TR' || baseKind === 'DTR') && op.yarnOverCount && op.yarnOverCount >= 2) {
    return 9 + 2 * (op.yarnOverCount - 1);
  }
  return STITCH_META[baseKind]?.symbolHalfHeight ?? 5;
}

function renderRoundGroups(stitches: PositionedStitch[], fillMode: boolean, symbolColor: string): string {
  const byRound = new Map<number, PositionedStitch[]>();
  for (const s of stitches) {
    const arr = byRound.get(s.roundIndex) ?? [];
    arr.push(s);
    byRound.set(s.roundIndex, arr);
  }

  const sortedRounds = [...byRound.keys()].sort((a, b) => a - b);
  const groups: string[] = [];

  for (const roundIdx of sortedRounds) {
    const items = byRound.get(roundIdx)!
      .map((s) => renderStitchUse(s, fillMode)).join('');
    // 색을 지정하지 않은 코는 이 그룹 색을 그대로 물려받는다
    groups.push(
      `<g class="round" data-round="${roundIdx}" style="color: ${escapeAttr(symbolColor)}">${items}</g>`
    );
  }

  return groups.join('');
}

function renderStitchUse(s: PositionedStitch, fillMode: boolean): string {
  const x = fmt(s.position.x);
  const y = fmt(s.position.y);
  const angleDeg = fmt(((s.angle ?? 0) * 180) / Math.PI);
  // 실 색을 지정한 코만 색을 덮어쓴다 (지정 없으면 그룹의 기본 기호색을 물려받는다).
  // 배경색 모드에서는 그 코의 바탕 위에서 읽히도록 대비색으로 그린다.
  const ink = s.op.color ? (fillMode ? contrastInk(s.op.color) : s.op.color) : undefined;
  const colorStyle = ink ? ` style="color: ${escapeAttr(ink)}"` : '';

  // INC/DEC는 fan 형태(다리 여러 개)로 출력
  if (s.op.kind === 'INC' || s.op.kind === 'DEC') {
    return renderFanStitch(s, x, y, angleDeg, colorStyle);
  }

  // TR/DTR 에서 yarnOverCount 가 4 이상이면 동적 렌더 (`tr(N)` 구문)
  if ((s.op.kind === 'TR' || s.op.kind === 'DTR') && s.op.yarnOverCount && s.op.yarnOverCount >= 4) {
    return renderTallStitchInline(s.op.yarnOverCount, x, y, angleDeg, colorStyle);
  }

  const sym = stitchSymbolId(s.op.kind);
  return `<use href="#${sym}" x="${x}" y="${y}" transform="rotate(${angleDeg} ${x} ${y})"${colorStyle}/>`;
}

/** N 개 yarn-over 기둥긴뜨기 를 동적으로 렌더 (N≥4). TR(n=2)/DTR(n=3) 와 같은 스타일. */
function renderTallStitchInline(n: number, x: string, y: string, angleDeg: string, colorStyle: string): string {
  const symH = 9 + 2 * (n - 1); // DC=9, TR=11, DTR=13, TR4=15, TR5=17, ...
  const hatchSpacing = 6;
  const parts: string[] = [];
  parts.push(`<line x1="0" y1="${-symH}" x2="0" y2="${symH}" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`);
  parts.push(`<line x1="-5" y1="${-symH}" x2="5" y2="${-symH}" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`);
  for (let i = 0; i < n; i++) {
    const cy = (i - (n - 1) / 2) * hatchSpacing;
    parts.push(`<line x1="-4" y1="${fmt(cy + 1)}" x2="4" y2="${fmt(cy - 1)}" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>`);
  }
  return `<g transform="translate(${x} ${y}) rotate(${angleDeg})"${colorStyle}>${parts.join('')}</g>`;
}

/** N 개 yarn-over 기둥 긴뜨기의 leg 를 동적으로 렌더 (fan 용, N≥4). anchor=(0,+symH) 바닥. */
function renderTallLegInline(n: number, fanAngleDeg: number, isInc: boolean): string {
  const symH = 9 + 2 * (n - 1);
  const hatchSpacing = 6;
  const parts: string[] = [];
  // leg 의 main vertical: anchor 기준 위로 뻗음. 일반 leg 와 동일 좌표계.
  parts.push(`<line x1="0" y1="${symH}" x2="0" y2="${-symH}" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`);
  parts.push(`<line x1="-4" y1="${-symH}" x2="4" y2="${-symH}" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`);
  for (let i = 0; i < n; i++) {
    const cy = (i - (n - 1) / 2) * hatchSpacing;
    parts.push(`<line x1="-3" y1="${fmt(cy + 1)}" x2="3" y2="${fmt(cy - 1)}" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>`);
  }
  if (isInc) {
    return `<g transform="rotate(${fmt(fanAngleDeg)} 0 ${symH})">${parts.join('')}</g>`;
  }
  return `<g transform="rotate(${fmt(fanAngleDeg)} 0 ${-symH}) scale(1 -1)">${parts.join('')}</g>`;
}

// V^2 의 각 leg 가 sym-INC 정적 기호와 비슷한 너비를 갖도록.
// step 이 legs 간 각도. V^2 는 ±step/2, V^N 은 ±(N-1)*step/2.
// 팁이 너무 벌어지지 않도록 total spread 를 90° 이하로 캡.
function fanStep(expansion: number): number {
  const base = 60; // V^2 의 양쪽 legs 간 각도 (≈ sym-INC 너비)
  const maxTotal = 90; // V^N 의 최대 총 spread
  if (expansion <= 2) return base;
  return Math.min(base, maxTotal / (expansion - 1));
}

function renderFanStitch(
  s: PositionedStitch,
  x: string, y: string, angleDeg: string, colorStyle: string,
): string {
  const base = s.op.baseKind ?? 'SC';
  const count = Math.max(2, s.op.expansion);
  const isInc = s.op.kind === 'INC';
  const step = fanStep(count);
  const yoc = s.op.yarnOverCount;
  // TR/DTR 에서 yarn-over 수가 4 이상이면 leg 도 동적 렌더
  const useInlineLeg = (base === 'TR' || base === 'DTR') && yoc !== undefined && yoc >= 4;
  const symH = useInlineLeg ? 9 + 2 * (yoc - 1) : STITCH_META[base].symbolHalfHeight;
  const legSym = `leg-${base}`;

  const legs: string[] = [];
  for (let i = 0; i < count; i++) {
    const fanAngle = (i - (count - 1) / 2) * step;
    if (useInlineLeg) {
      legs.push(renderTallLegInline(yoc, fanAngle, isInc));
    } else if (isInc) {
      legs.push(`<use href="#${legSym}" transform="rotate(${fmt(fanAngle)} 0 ${symH})"/>`);
    } else {
      legs.push(`<use href="#${legSym}" transform="rotate(${fmt(fanAngle)} 0 ${-symH}) scale(1 -1)"/>`);
    }
  }
  return `<g transform="translate(${x} ${y}) rotate(${angleDeg})"${colorStyle}>${legs.join('')}</g>`;
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmt(n: number): string {
  // 소수점 2자리로 축약, 정수는 그대로
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}
