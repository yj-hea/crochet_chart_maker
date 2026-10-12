/**
 * 손으로 다듬은 배치 (manual adjustment).
 *
 * 자동 배치가 모든 도안을 뜻대로 그려 주지는 못한다. 그래서 캔버스에서 기호를 골라
 * 옮기고·키우고·돌릴 수 있게 하고, 그 값을 **도안과 함께 저장**한다.
 *
 * ## 어디에 붙는가
 *
 * 레이아웃 결과(`LayoutResult`)의 각 요소에 **키**를 붙이고, 키마다 보정값을 둔다.
 * 보정은 좌표를 바꾸지 않고 **transform 문자열**로만 표현한다 — 그래야
 *   - 3D 미리보기·게이지 같은 계산은 보정 없는 원래 좌표를 그대로 쓰고,
 *   - SVG·확대 창·내보내기는 같은 그림을 얻는다.
 *
 * ## 키는 단과 코 순번
 *
 * `s:3:5` = 3단의 6번째 코. 단 id 가 아니라 **순번**이라, 그 단의 글을 고쳐도 보정이
 * 남는다 (패턴라이터와 같은 방식). 어긋나면 도구바의 "배치 초기화"로 전부 지운다.
 */

import type { LayoutResult, PositionedStitch, RoundMarker, PositionedMarker } from './types';

export interface Adjust {
  /** 옮긴 거리 (도안 좌표계) */
  dx?: number;
  dy?: number;
  /** 배율 (1 = 그대로) */
  scale?: number;
  /** 회전 각도 (도) */
  rot?: number;
}

/** 키 → 보정값 */
export type Adjustments = Record<string, Adjust>;

/** 캔버스에서 고를 수 있는 요소의 종류 */
export type ElementKind = 'stitch' | 'number' | 'marker' | 'legend';

export const LEGEND_KEY = 'legend';

/** `s:<단>:<그 단에서 몇 번째 코>` */
export function stitchKey(roundIndex: number, indexInRound: number): string {
  return `s:${roundIndex}:${indexInRound}`;
}
/** `n:<단>` — 단 번호 */
export function numberKey(roundIndex: number): string {
  return `n:${roundIndex}`;
}
/** `m:<단>:<그 단에서 몇 번째 마커>` */
export function markerKey(roundIndex: number, indexInRound: number): string {
  return `m:${roundIndex}:${indexInRound}`;
}

export function elementKind(key: string): ElementKind {
  if (key === LEGEND_KEY) return 'legend';
  if (key.startsWith('s:')) return 'stitch';
  if (key.startsWith('n:')) return 'number';
  return 'marker';
}

/** 사람이 읽는 이름 — 선택 안내에 쓴다 */
export function describeKey(key: string): string {
  const [, round, idx] = key.split(':');
  switch (elementKind(key)) {
    case 'legend': return '범례';
    case 'number': return `${round}단 번호`;
    case 'marker': return `${round}단 마커`;
    default: return `${round}단 ${Number(idx) + 1}번째 코`;
  }
}

/** 값이 들어 있는 보정인지 (전부 기본값이면 지운다) */
export function isEmptyAdjust(a: Adjust | undefined): boolean {
  if (!a) return true;
  const { dx = 0, dy = 0, scale = 1, rot = 0 } = a;
  return dx === 0 && dy === 0 && scale === 1 && rot === 0;
}

/** 보정 두 개를 합친다 (드래그 중 미리보기 → 확정) */
export function mergeAdjust(base: Adjust | undefined, delta: Adjust): Adjust {
  return {
    dx: (base?.dx ?? 0) + (delta.dx ?? 0),
    dy: (base?.dy ?? 0) + (delta.dy ?? 0),
    scale: (base?.scale ?? 1) * (delta.scale ?? 1),
    rot: (base?.rot ?? 0) + (delta.rot ?? 0),
  };
}

/**
 * transform 문자열. 중심(cx, cy) 둘레로 돌리고 키운 뒤 옮긴다.
 * 비어 있으면 undefined (속성을 아예 넣지 않는다).
 */
export function adjustTransform(a: Adjust | undefined, cx: number, cy: number): string | undefined {
  if (isEmptyAdjust(a)) return undefined;
  const { dx = 0, dy = 0, scale = 1, rot = 0 } = a!;
  const parts: string[] = [];
  if (dx !== 0 || dy !== 0) parts.push(`translate(${fmt(dx)} ${fmt(dy)})`);
  if (rot !== 0) parts.push(`rotate(${fmt(rot)} ${fmt(cx)} ${fmt(cy)})`);
  if (scale !== 1) {
    parts.push(`translate(${fmt(cx)} ${fmt(cy)}) scale(${fmt(scale)}) translate(${fmt(-cx)} ${fmt(-cy)})`);
  }
  return parts.join(' ');
}

/**
 * 레이아웃 결과에 키와 보정 transform 을 채운다.
 *
 * 보정이 하나도 없어도 **키는 항상** 붙인다 — 캔버스에서 고르려면 식별자가 필요하다.
 * 옮긴 기호가 도안 밖으로 나가면 잘리므로 경계도 그만큼 넓힌다.
 */
export function applyAdjustments(layout: LayoutResult, adjustments?: Adjustments): LayoutResult {
  const adj = adjustments ?? {};
  const seen = new Map<number, number>();
  const used: Array<{ x: number; y: number; a: Adjust }> = [];

  const stitches: PositionedStitch[] = layout.stitches.map((s) => {
    const i = seen.get(s.roundIndex) ?? 0;
    seen.set(s.roundIndex, i + 1);
    const key = stitchKey(s.roundIndex, i);
    return withKey(s, key, adj[key], used);
  });

  const roundMarkers: RoundMarker[] = layout.roundMarkers.map((m) => {
    const key = numberKey(m.roundIndex);
    return withKey(m, key, adj[key], used);
  });

  const markerSeen = new Map<number, number>();
  const stitchMarkers: PositionedMarker[] | undefined = layout.stitchMarkers?.map((m) => {
    const i = markerSeen.get(m.roundIndex) ?? 0;
    markerSeen.set(m.roundIndex, i + 1);
    const key = markerKey(m.roundIndex, i);
    return withKey(m, key, adj[key], used);
  });

  const legend = adj[LEGEND_KEY];
  const legendTransform = isEmptyAdjust(legend)
    ? undefined
    : adjustTransform(legend, layout.bounds.minX, layout.bounds.maxY);

  return {
    ...layout,
    stitches,
    roundMarkers,
    ...(stitchMarkers ? { stitchMarkers } : {}),
    ...(legendTransform ? { legendTransform } : {}),
    bounds: expandBounds(layout.bounds, used),
  };
}

/** 보정된 요소가 도안 밖으로 나가도 잘리지 않도록 경계를 넓힌다 */
function expandBounds(
  bounds: LayoutResult['bounds'],
  used: ReadonlyArray<{ x: number; y: number; a: Adjust }>,
): LayoutResult['bounds'] {
  if (used.length === 0) return bounds;
  let { minX, minY, maxX, maxY } = bounds;
  for (const u of used) {
    const x = u.x + (u.a.dx ?? 0);
    const y = u.y + (u.a.dy ?? 0);
    // 기호 크기는 모르므로 넉넉히 한 칸(12) 정도를 더해 둔다
    minX = Math.min(minX, x - 12);
    maxX = Math.max(maxX, x + 12);
    minY = Math.min(minY, y - 12);
    maxY = Math.max(maxY, y + 12);
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function withKey<T extends { position: { x: number; y: number } }>(
  el: T,
  key: string,
  a: Adjust | undefined,
  used: Array<{ x: number; y: number; a: Adjust }>,
): T & { key: string; transform?: string } {
  const transform = adjustTransform(a, el.position.x, el.position.y);
  if (transform && a) used.push({ x: el.position.x, y: el.position.y, a });
  return transform ? { ...el, key, transform } : { ...el, key };
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
