/**
 * 코를 구슬로, 코 사이 연결을 실로 보는 그래프.
 *
 * 3D 형태는 **코 수에서 저절로 나온다**. 각 코를 정해진 크기의 구슬로 두고 두 종류의
 * 변만 걸면 된다:
 *
 *  - **가로 변** — 같은 단의 이웃 코. 길이 = 두 코 폭의 평균
 *  - **세로 변** — 부모 코 → 자식 코. 길이 = 자식 코의 높이
 *
 * 이 길이들을 3D 에서 만족시키면, 부모보다 코가 많은 단은 둘레가 남아 바깥으로
 * 벌어지고(원판·원뿔), 같으면 원통이 되고, 적으면 오므라든다. 늘림이 너무 많으면
 * 평면에 들어가지 못해 주름이 잡힌다. 별도 규칙 없이 변 길이만으로 나오는 결과다.
 *
 * 여기서는 그래프만 만든다 — 실제 3D 좌표를 푸는 건 `relax.ts` 다.
 */

import type { PositionedStitch } from '$lib/layout/types';
import type { StitchKind } from '$lib/model/stitch-kind';
import { stitchHeight, stitchTops, stitchWidth } from './aspect';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * 구슬 하나 = 코 하나.
 *
 * `V` 처럼 한 표기가 여러 코를 만들면 구슬도 그만큼 생긴다 — `stitchIndex` 가 같은
 * 구슬이 여럿일 수 있다.
 *
 * 좌표가 가리키는 곳은 코의 **윗변 가운데**다. 다음 단이 올라앉는 자리가 윗변이라,
 * 세로 변(부모→자식)의 길이가 곧 자식의 키가 되어 계산이 단순해진다.
 */
export interface StitchNode {
  /** 원본 `PositionedStitch[]` 에서의 인덱스 — 색·기호를 되찾을 때 쓴다 */
  stitchIndex: number;
  roundIndex: number;
  kind: StitchKind;
  /** 코 하나의 폭 (코 폭 단위) */
  width: number;
  /** 아랫변에서 윗변까지 (코 폭 단위) */
  height: number;
  /** 2D 레이아웃에서 가져온 초기 위치 (코 폭 단위, z=0 평면) */
  seed: Vec3;
}

/**
 * 변의 종류.
 *  - `row`    같은 단 이웃 — 단의 둘레를 정한다
 *  - `column` 부모→자식 — 단 사이 간격을 정한다
 *  - `stiff`  굽힘 저항 — 편물이 종이처럼 접히지 않게 잡아준다
 */
export type EdgeKind = 'row' | 'column' | 'stiff';

export interface StitchEdge {
  a: number;
  b: number;
  /** 목표 길이 (코 폭 단위) */
  rest: number;
  kind: EdgeKind;
  /**
   * true 면 **가까울 때만** 밀어낸다.
   *
   * 굽힘 저항은 "펴져 있으라"가 아니라 "접히지 말라"다. 등식으로 걸면 편물이 곡면을
   * 이루지 못하고 억지로 평평해진다.
   */
  minOnly?: boolean;
}

export interface StitchGraph {
  nodes: StitchNode[];
  edges: StitchEdge[];
  /**
   * 코 폭 1 에 해당하는 원본 레이아웃 px.
   * 3D 결과를 2D 도안과 같은 축척으로 보여줄 때 되곱한다.
   */
  unit: number;
  /**
   * 각 단이 고리로 닫혀 있는가 (원형 도안).
   * 열려 있으면(왕복뜨기) 단이 띠라서 회전면 가정을 쓸 수 없다.
   */
  closed: boolean;
}

/** 편물을 이루지 않는 표기 — 구슬이 되지 않는다 */
function isFabric(kind: StitchKind): boolean {
  return kind !== 'MARKER' && kind !== 'SKIP' && kind !== 'TC';
}

/**
 * 굽힘 저항의 목표 길이를 일직선의 몇 배로 잡을 것인가.
 *
 * 1.0 으로 두면 안 된다. 닫힌 단은 **원래 휘어 있는 것이 정상**인데, 일직선을 목표로
 * 걸면 "펴져라"가 한순간도 쉬지 않고 작동해 둘레 제약과 영원히 싸운다. 그 결과 단이
 * 원이 되지 못하고 해가 수렴하지 않는다.
 *
 * 조금 줄여 잡으면 완만한 곡률은 통과시키고 급하게 접히는 것만 막는다 — 굽힘 저항이
 * 실제로 해야 하는 일이 그것이다.
 */
const STIFF_SLACK = 0.75;

/** 한 표기에서 갈라진 구슬들을 떼어 놓을 거리 (레이아웃 px) */
const SPLIT_NUDGE = 0.01;

/** 두 코 사이 가로 변의 길이 — 각자 자기 폭의 절반씩 내놓는다 */
function rowRest(a: StitchNode, b: StitchNode): number {
  return (a.width + b.width) / 2;
}

export interface GraphOptions {
  /**
   * 각 단이 고리로 닫히는가 (원형 도안). 기본 true.
   *
   * 닫히면 마지막 코와 첫 코 사이에도 가로 변을 건다 — 이게 없으면 단이 띠처럼
   * 풀어져 원통이 되지 않는다. 반대로 왕복뜨기(평면)에 이 변을 걸면 납작한 천이
   * 원통으로 말려 버린다.
   *
   * 레이아웃 좌표만 봐서는 구분할 수 없다. 평면 레이아웃도 `angle` 을 0 으로 채워
   * 두기 때문에, 도안의 `shape` 를 아는 쪽에서 알려 줘야 한다.
   */
  closed?: boolean;
}

/**
 * 코 그래프를 만든다. 원형/평면 어느 레이아웃이든 받는다.
 */
export function buildStitchGraph(
  stitches: readonly PositionedStitch[],
  options: GraphOptions = {},
): StitchGraph {
  const nodes: StitchNode[] = [];
  /** 원본 인덱스 → 그 표기가 만든 구슬들 (`V^3` 이면 3개) */
  const beadsOf = new Map<number, number[]>();

  // `V` 는 구슬 하나가 아니라 **만드는 코 수만큼** 이다.
  //
  // 폭만 두 배로 늘린 구슬 하나로 두면 둘레 계산은 맞지만 편물이 틀어진다. 다음 단의
  // 두 코가 한 점에 매달려 좌우로 벌어질 자리를 잃고, V 가 만든 두 코 사이에는
  // 좌우 연결이 아예 없어진다. 편물은 코마다 상하좌우로 이어져 있어야 제 모양이 나온다.
  stitches.forEach((s, i) => {
    if (!isFabric(s.op.kind)) return;
    const tops = stitchTops(s.op);
    const ids: number[] = [];
    for (let k = 0; k < tops; k++) {
      ids.push(nodes.length);
      nodes.push({
        stitchIndex: i,
        roundIndex: s.roundIndex,
        kind: s.op.kind,
        width: stitchWidth(s.op),
        height: stitchHeight(s.op),
        // 한 표기에서 나온 구슬들은 2D 도안에서 같은 자리를 가리킨다. 완전히 겹치면
        // 서로 밀어낼 방향이 없어 영영 붙어 있으므로 아주 조금 떼어 놓는다.
        seed: { x: s.position.x + k * SPLIT_NUDGE, y: s.position.y, z: 0 },
      });
    }
    beadsOf.set(i, ids);
  });

  const edges: StitchEdge[] = [];
  const push = (a: number, b: number, rest: number, kind: EdgeKind, minOnly?: boolean) => {
    if (a === b || rest <= 0) return;
    edges.push(minOnly ? { a, b, rest, kind, minOnly } : { a, b, rest, kind });
  };

  // ── 세로 변: 부모 → 자식 ────────────────────────────────────────────
  // 한 자식이 부모를 여럿 가지면(A 줄임) 각 부모마다 같은 길이의 변이 걸려, 부모들이
  // 서로 끌려와 오므라든다. 반대로 한 부모가 구슬 여럿이면(V 늘림) 자식들이 각각 다른
  // 윗변에 걸려 나란히 선다. 줄임·늘림을 따로 다룰 필요가 없는 이유다.
  //
  // 부모가 구슬 여럿이면 **자식들이 왼쪽부터 하나씩 나눠 갖는다**. `V` 위에 두 코를
  // 뜨면 왼쪽 윗변에 하나, 오른쪽 윗변에 하나가 걸리는 것과 같다.
  const usedSlots = new Map<number, number>();
  stitches.forEach((s, i) => {
    const childBeads = beadsOf.get(i);
    if (!childBeads) return;
    for (const p of s.parentIndices) {
      const parentBeads = beadsOf.get(p);
      if (!parentBeads || parentBeads.length === 0) continue;
      const used = usedSlots.get(p) ?? 0;
      // `[...]` 한 구멍 그룹의 두 번째 이후 코는 슬롯을 새로 먹지 않고 직전 코와
      // 같은 자리에 얹힌다
      const slot = s.op.sameHoleContinuation ? used - 1 : used;
      if (!s.op.sameHoleContinuation) usedSlots.set(p, used + 1);
      const parent = parentBeads[Math.max(0, Math.min(slot, parentBeads.length - 1))]!;
      // 자식이 V 면 그 구슬 전부가 같은 구멍에서 나온다
      for (const child of childBeads) {
        push(parent, child, nodes[child]!.height, 'column');
      }
    }
  });

  // 매직링은 1단의 **부모로 기록되지 않는다** — 레이아웃에서 1단 코들의
  // `parentIndices` 는 비어 있다. 그대로 두면 매직링이 아무 변에도 걸리지 않은 외톨이가
  // 되어 허공으로 날아간다. 실제로는 1단 전체가 이 고리 하나에 걸리므로, 부모 없는
  // 같은 단 코 전부에 세로 변을 이어 준다. 그러면 조임끈처럼 1단을 오므려 준다.
  stitches.forEach((s, i) => {
    if (s.op.kind !== 'MAGIC') return;
    const ring = beadsOf.get(i)?.[0];
    if (ring === undefined) return;
    stitches.forEach((t, j) => {
      if (t.roundIndex !== s.roundIndex || t.parentIndices.length > 0) return;
      for (const child of beadsOf.get(j) ?? []) {
        if (child === ring) continue;
        push(ring, child, nodes[child]!.height, 'column');
      }
    });
  });

  // ── 가로 변: 같은 단 이웃 ──────────────────────────────────────────
  // 매직링은 단의 이웃이 아니라 1단 전체가 모이는 중심점이라 줄에서 뺀다.
  // 기둥코(`[^...]`)는 옆이 아니라 **위로** 쌓이므로 세로 변으로 잇고, 줄에는 맨 위
  // 한 칸만 내보낸다.
  const rows = new Map<number, number[]>();
  const rowFor = (round: number): number[] => {
    const existing = rows.get(round);
    if (existing) return existing;
    const fresh: number[] = [];
    rows.set(round, fresh);
    return fresh;
  };
  let i = 0;
  while (i < stitches.length) {
    const s = stitches[i]!;
    const beads = beadsOf.get(i);
    if (!beads || s.op.kind === 'MAGIC') { i++; continue; }

    if (s.op.turningChain) {
      // 연속된 기둥코를 세로로 쌓는다
      let top = beads[beads.length - 1]!;
      let j = i + 1;
      while (j < stitches.length) {
        const t = stitches[j]!;
        if (!t.op.turningChain || t.roundIndex !== s.roundIndex) break;
        const next = beadsOf.get(j)?.[0];
        if (next !== undefined) {
          push(top, next, nodes[next]!.height, 'column');
          top = next;
        }
        j++;
      }
      rowFor(s.roundIndex).push(top);
      i = j;
      continue;
    }

    // V 가 만든 코들은 나란히 선다 — 줄에 순서대로 들어가 서로 가로 변으로 이어진다
    for (const b of beads) rowFor(s.roundIndex).push(b);
    i++;
  }

  const closed = options.closed ?? true;

  for (const row of rows.values()) {
    for (let k = 0; k + 1 < row.length; k++) {
      const a = row[k]!;
      const b = row[k + 1]!;
      push(a, b, rowRest(nodes[a]!, nodes[b]!), 'row');
    }
    if (closed && row.length > 2) {
      const a = row[row.length - 1]!;
      const b = row[0]!;
      push(a, b, rowRest(nodes[a]!, nodes[b]!), 'row');
    }
  }

  // ── 굽힘 저항 ──────────────────────────────────────────────────────
  // 변 길이만 맞추면 편물이 종이처럼 자유롭게 접힌다. 한 칸 건너 이웃에 "이보다 가까워지지
  // 말라"는 하한을 걸어 뻣뻣함을 준다. 가로(단이 각지게 꺾이는 것)와 세로(단끼리 겹쳐
  // 접히는 것) 양쪽에 필요하다.
  const stiffRest = (straight: number) => straight * STIFF_SLACK;

  for (const row of rows.values()) {
    const n = row.length;
    const span = closed && n > 3 ? n : n - 2;
    for (let k = 0; k < span; k++) {
      const a = row[k]!;
      const mid = row[(k + 1) % n]!;
      const b = row[(k + 2) % n]!;
      const straight = rowRest(nodes[a]!, nodes[mid]!) + rowRest(nodes[mid]!, nodes[b]!);
      push(a, b, stiffRest(straight), 'stiff', true);
    }
  }

  // 자식 → 할아버지. 단 세 개가 일직선으로 서 있으려는 힘이다.
  const parentsOf = new Map<number, number[]>();
  for (const e of edges) {
    if (e.kind !== 'column') continue;
    const list = parentsOf.get(e.b);
    if (list) list.push(e.a);
    else parentsOf.set(e.b, [e.a]);
  }
  for (const [child, parents] of parentsOf) {
    for (const p of parents) {
      for (const gp of parentsOf.get(p) ?? []) {
        push(gp, child, stiffRest(nodes[child]!.height + nodes[p]!.height), 'stiff', true);
      }
    }
  }

  // ── 축척 ───────────────────────────────────────────────────────────
  // 2D 레이아웃은 px 이고 그래프는 코 폭 단위다. 가로 변의 실제 2D 길이 중앙값을
  // 코 폭 1 로 잡으면, 도안이 어떤 크기로 그려졌든 알아서 맞는다.
  const unit = medianRowLength(nodes, edges);
  for (const n of nodes) {
    n.seed.x /= unit;
    n.seed.y /= unit;
  }

  return { nodes, edges, unit, closed };
}

/** 가로 변의 2D 길이 중앙값 ÷ 목표 길이 — 레이아웃 px 로 잰 "코 폭 1" */
function medianRowLength(nodes: readonly StitchNode[], edges: readonly StitchEdge[]): number {
  const ratios: number[] = [];
  for (const e of edges) {
    if (e.kind !== 'row') continue;
    const a = nodes[e.a]!.seed;
    const b = nodes[e.b]!.seed;
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (d > 0.001) ratios.push(d / e.rest);
  }
  if (ratios.length === 0) return 1;
  ratios.sort((x, y) => x - y);
  return ratios[ratios.length >> 1]!;
}
