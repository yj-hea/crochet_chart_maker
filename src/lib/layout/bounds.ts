/**
 * 바운딩 박스 계산 헬퍼.
 */

import type { Point, LayoutBounds, RoundMarker } from './types';
import { BOUNDS_MARGIN } from './constants';

/**
 * 단 마커의 텍스트 반대편 끝(가장 멀리 뻗은 점)을 반환.
 * 바운드 계산 시 마커가 잘리지 않도록 사용.
 */
export function markerFarPoint(marker: RoundMarker): Point {
  const TRI_HALF = 3.5;
  const GAP = 2.5;
  // 단 번호는 1~3자리 가정. font-size 8에서 1자리 ~5, 2자리 ~10, 3자리 ~15
  const MAX_TEXT_WIDTH = 14;
  const reach = TRI_HALF + GAP + MAX_TEXT_WIDTH;
  if (marker.direction === 'right') {
    // 텍스트는 왼쪽 끝에 있음
    return { x: marker.position.x - reach, y: marker.position.y };
  }
  return { x: marker.position.x + reach, y: marker.position.y };
}

export function computeBounds(points: Point[]): LayoutBounds {
  if (points.length === 0) {
    return {
      minX: -BOUNDS_MARGIN,
      minY: -BOUNDS_MARGIN,
      maxX: BOUNDS_MARGIN,
      maxY: BOUNDS_MARGIN,
      width: BOUNDS_MARGIN * 2,
      height: BOUNDS_MARGIN * 2,
    };
  }

  let minX = points[0]!.x;
  let maxX = points[0]!.x;
  let minY = points[0]!.y;
  let maxY = points[0]!.y;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  minX -= BOUNDS_MARGIN;
  minY -= BOUNDS_MARGIN;
  maxX += BOUNDS_MARGIN;
  maxY += BOUNDS_MARGIN;

  return {
    minX, minY, maxX, maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}
