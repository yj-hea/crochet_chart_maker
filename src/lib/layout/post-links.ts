/**
 * 걸어뜨기 연결선 — **어느 코에 걸었는지** 보여 주는 선.
 *
 * 걸어뜨기(`fp`/`bp`)는 아래 코의 기둥을 감아 뜬다. 보통은 바로 아래 코라 따로 그릴
 * 것이 없지만, 꽈배기·골지처럼 **2단 아래 기둥**에 걸 때는 어디에 걸었는지 보여야 한다.
 *
 *   fpF@1-2   1단 2번째 코에 건다
 *   fpF@^     가장 가까운 아래 걸어뜨기에 이어서 건다
 *
 * 없는 자리를 가리키면 선을 긋지 않고 **보통 걸어뜨기로** 그린다 (설명서와 같은 태도).
 * 그 사실은 편집기 쪽 검증(`validateLinkTargets`)이 알려 준다.
 */

import type { PositionedStitch, Point } from './types';

export interface PostLink {
  /** 걸어뜨기 코의 자리 */
  from: Point;
  /** 걸린 코의 자리 */
  to: Point;
}

/** 걸어뜨기인지 (앞·뒤걸어) */
function isPost(s: PositionedStitch): boolean {
  return s.op.modifier === 'FP' || s.op.modifier === 'BP';
}

/**
 * 단 안에서 **몇 번째 코**인지로 찾는다.
 * 코를 만들지 않는 동작(스킵·사이사슬 등)은 세지 않는다 — 설명서의 "코로 카운트" 와 같다.
 */
function nthStitchOfRound(
  stitches: ReadonlyArray<PositionedStitch>,
  round: number,
  nth: number,
): PositionedStitch | undefined {
  let count = 0;
  for (const s of stitches) {
    if (s.roundIndex !== round) continue;
    if (s.op.produce <= 0) continue;
    count++;
    if (count === nth) return s;
  }
  return undefined;
}

/** `@^` — 아래 단들 중 걸어뜨기가 있는 **가장 가까운** 단에서, 가로로 가장 가까운 코 */
function nearestPostBelow(
  stitches: ReadonlyArray<PositionedStitch>,
  self: PositionedStitch,
): PositionedStitch | undefined {
  const below = stitches.filter((s) => s.roundIndex < self.roundIndex && isPost(s));
  if (below.length === 0) return undefined;
  const round = Math.max(...below.map((s) => s.roundIndex));
  const sameRound = below.filter((s) => s.roundIndex === round);
  return sameRound.reduce((best, s) => {
    const d = dist(s.position, self.position);
    return d < dist(best.position, self.position) ? s : best;
  }, sameRound[0]!);
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** 레이아웃 결과에서 연결선을 뽑는다 */
export function resolvePostLinks(stitches: ReadonlyArray<PositionedStitch>): PostLink[] {
  const links: PostLink[] = [];
  for (const s of stitches) {
    const target = s.op.target;
    if (!target) continue;
    const hit = target === 'nearest'
      ? nearestPostBelow(stitches, s)
      : nthStitchOfRound(stitches, target.round, target.stitch);
    if (!hit || hit === s) continue;
    links.push({ from: s.position, to: hit.position });
  }
  return links;
}
