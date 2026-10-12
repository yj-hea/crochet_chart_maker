/**
 * 조각 잇기 · 이어받기 — **도안 탭 하나 = 조각 하나**.
 *
 * 한 작품(프로젝트) 안의 도안들은 그 작품의 조각이다. 인형이라면 다리 A·다리 B 를
 * 따로 뜨고 몸통에서 합치고, 몸통을 다시 나눠 팔을 뜬다. 그 관계를 도안마다
 * **시작 방식**으로 적어 둔다.
 *
 * | 시작 방식 | 뜻 |
 * |---|---|
 * | `new` | 혼자 시작한다 (기본) |
 * | `join` | 조각 여럿을 이어서 시작한다 — 사이사이에 사슬을 넣을 수 있다 |
 * | `from` | 다른 도안에서 이어받아 시작한다 (나누기) |
 *
 * 탭 **id** 로 가리키므로 이름을 바꿔도 끊기지 않는다. 가리킨 도안이 사라지면
 * 그 사실만 알려 주고 도안은 그대로 그린다.
 *
 * 코 수는 설명서 5장 규칙을 따른다:
 *   몸통 코 수 = 조각들의 마지막 단 코 수 합 + **사슬 × 2** (양쪽을 잇는다)
 */

export interface JoinStart {
  kind: 'join';
  /** 이어 붙일 조각들 (탭 id, 뜨는 순서) */
  pieces: string[];
  /** 조각 사이에 넣는 사슬 수 (0 이면 바로 붙인다) */
  chain: number;
}

export interface FromStart {
  kind: 'from';
  /** 이어받을 도안 (탭 id) */
  piece: string;
  /** 가져오는 코 수. 없으면 그 도안의 마지막 단 전부 */
  stitches?: number;
  /**
   * **몇 번째 코부터** 가져오는지 (1-based, 그 도안의 마지막 단 기준). 없으면 1.
   * 설명서의 `오른쪽 목 (8코부터)` 에 해당한다.
   */
  at?: number;
}

export type PieceStart = JoinStart | FromStart;

/** 조각 하나에 대해 알아야 하는 것 */
export interface PieceInfo {
  id: string;
  name: string;
  /** 마지막 단이 남기는 코 수 */
  lastCount: number;
}

export interface ResolvedStart {
  /** 이 도안이 물려받는 코 수 */
  count: number;
  /** 사람에게 보여 줄 설명 */
  label: string;
  /** 찾지 못한 조각 (지워졌거나 다른 작품으로 옮겨졌다) */
  missing: string[];
}

/**
 * 시작 방식을 풀어 **물려받는 코 수**를 센다.
 * 찾지 못한 조각은 0코로 치고 `missing` 에 담는다.
 */
export function resolveStart(
  start: PieceStart | undefined,
  pieces: ReadonlyArray<PieceInfo>,
): ResolvedStart | undefined {
  if (!start) return undefined;
  const byId = new Map(pieces.map((p) => [p.id, p]));

  if (start.kind === 'from') {
    const piece = byId.get(start.piece);
    if (!piece) return { count: 0, label: '이어받을 도안을 찾지 못했습니다', missing: [start.piece] };
    const count = start.stitches ?? piece.lastCount;
    const at = start.at ?? 1;
    const where = start.stitches !== undefined
      ? ` (${piece.lastCount}코 중 ${at}번째부터)`
      : '';
    return { count, label: `${piece.name} 에서 이어받음 — ${count}코${where}`, missing: [] };
  }

  const missing: string[] = [];
  let count = 0;
  const names: string[] = [];
  for (const id of start.pieces) {
    const piece = byId.get(id);
    if (!piece) { missing.push(id); names.push('?'); continue; }
    count += piece.lastCount;
    names.push(piece.name);
  }
  // 조각 사이사이를 사슬로 잇는다 — 두 조각이면 양쪽 두 군데
  const bridges = start.pieces.length > 0 ? start.pieces.length : 0;
  count += start.chain * bridges;
  const chainPart = start.chain > 0 ? ` + 사슬 ${start.chain}×${bridges}` : '';
  return {
    count,
    label: `${names.join(' + ')}${chainPart} = ${count}코`,
    missing,
  };
}

/** 가리킨 조각이 자기 자신이거나 서로 물고 도는지 — 그러면 셀 수 없다 */
export function hasCycle(
  tabId: string,
  startOf: (id: string) => PieceStart | undefined,
  seen: Set<string> = new Set(),
): boolean {
  if (seen.has(tabId)) return true;
  seen.add(tabId);
  const start = startOf(tabId);
  if (!start) return false;
  const next = start.kind === 'join' ? start.pieces : [start.piece];
  return next.some((id) => hasCycle(id, startOf, new Set(seen)));
}

// ── 나누기 — 한 도안을 여러 파트가 나눠 가질 때 ─────────────

/** 이 도안을 이어받는 파트 하나 */
export interface SplitChild {
  id: string;
  name: string;
  /** 시작 코 (1-based) */
  at: number;
  /** 가져가는 코 수 */
  count: number;
}

export interface SplitInfo {
  /** 나눠 줄 코 수 (이 도안의 마지막 단) */
  total: number;
  /** 자리 순으로 정렬된 파트들 */
  children: SplitChild[];
  /** 아무도 가져가지 않은 코 수 — 쉼코로 남는다 */
  leftover: number;
  /** 서로 겹치는 파트 이름 쌍 */
  overlaps: Array<[string, string]>;
  /** 마지막 단을 벗어나는 파트 이름들 */
  overflow: string[];
}

/**
 * 파트들이 어떻게 나눠 가지는지 센다.
 *
 * 설명서 6장의 "나누기 직전 단의 코를 모두 세고, 각 파트가 가져가는 코를 뺀 나머지를
 * 겨드랑이에 배분한다" 와 같은 셈이다. 여기서는 남는 코를 **쉼코**로 본다.
 */
export function splitOf(total: number, children: ReadonlyArray<SplitChild>): SplitInfo {
  const sorted = [...children].sort((a, b) => a.at - b.at);
  const overlaps: Array<[string, string]> = [];
  const overflow: string[] = [];
  let taken = 0;

  for (let i = 0; i < sorted.length; i++) {
    const c = sorted[i]!;
    taken += c.count;
    if (c.at < 1 || c.at + c.count - 1 > total) overflow.push(c.name);
    const next = sorted[i + 1];
    if (next && c.at + c.count - 1 >= next.at) overlaps.push([c.name, next.name]);
  }

  return {
    total,
    children: sorted,
    leftover: Math.max(0, total - taken),
    overlaps,
    overflow,
  };
}
