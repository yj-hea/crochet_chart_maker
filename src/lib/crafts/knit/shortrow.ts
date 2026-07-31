/**
 * 되돌아뜨기(short row) 자동 배치.
 *
 * 손으로 적을 때 가장 헷갈리는 부분은 **`unw` 를 줄 앞에 쓸지 뒤에 쓸지**다.
 * 규칙 자체는 단순하다 — 단은 항상 "뜨는 순서"로 적으므로:
 *
 *   - 이 단을 시작하기 **전에 이미 지나온** 미작업 코 → 줄 **앞**
 *   - 이 단에서 **끝까지 가지 않아 남긴** 코            → 줄 **뒤**
 *
 * 어려운 건 이 둘이 매 단 좌우로 번갈아 뒤집힌다는 점이라, 여기서는 바늘 위
 * 상태(양 끝에 몇 코가 남아 있는지)를 그대로 시뮬레이션해 각 단을 만든다.
 *
 * 되돌리는 방법 세 가지:
 *   - `wt`  (감아 되돌리기) — 감는 코가 그 단에서 소비된다. `k12, wt, unw7`
 *   - `ds`  (독일식)       — 돌린 **다음 단 첫 코**가 이중코가 된다. `unw7, ds, p12`
 *   - `plain` (그냥 돌리기) — 표시 기호 없음
 *
 * 어느 방법이든 단마다 총 코 수가 보존되므로 코 수 검증이 그대로 유지된다.
 */

import type { KnitBase } from '$lib/eveninc';

export type ShortRowTurn = 'wt' | 'ds' | 'plain';
/** 한쪽만 경사지게(어깨) / 양쪽 번갈아(뒷목·힐) */
export type ShortRowSide = 'one' | 'both';

export interface ShortRowOptions {
  /** 바늘 위 전체 코 수 */
  total: number;
  /** 한 번에 남길 코 수 */
  step: number;
  /** 되돌리는 횟수 (양쪽 모드는 한쪽 기준) */
  repeats: number;
  turn?: ShortRowTurn;
  side?: ShortRowSide;
  /** 첫 단의 기본 코 */
  base?: KnitBase;
  /** 단마다 겉/안뜨기 교대 (메리야스). false 면 모두 같은 코 (가터·원통) */
  alternate?: boolean;
  /** 남은 코를 모두 되살리는 마무리 단 포함 */
  resolve?: boolean;
}

export interface ShortRowRow {
  /** 단 본문 (단 번호 없음) */
  source: string;
  /** 이 단이 무엇을 하는지 — 미리보기용 */
  note: string;
}

export interface ShortRowResult {
  kind: 'ok' | 'invalid';
  rows: ShortRowRow[];
  summary: string;
  /** 주의사항 (예: ds 인데 마무리 단을 뺐을 때) */
  warning?: string;
}

/** 바늘 양 끝 — 'A' 는 첫 단을 시작하는 쪽 */
type Edge = 'A' | 'B';

function invalid(summary: string): ShortRowResult {
  return { kind: 'invalid', rows: [], summary };
}

export function planShortRows(opts: ShortRowOptions): ShortRowResult {
  const { total, step, repeats } = opts;
  const turn: ShortRowTurn = opts.turn ?? 'wt';
  const side: ShortRowSide = opts.side ?? 'both';
  const base: KnitBase = opts.base ?? 'k';
  const alternate = opts.alternate ?? true;
  const resolve = opts.resolve ?? true;

  if (![total, step, repeats].every(Number.isFinite)) return invalid('유효한 숫자를 입력하세요');
  if (total < 2) return invalid('전체 코 수는 2코 이상이어야 합니다');
  if (step < 1) return invalid('한 번에 남길 코는 1코 이상이어야 합니다');
  if (repeats < 1) return invalid('되돌리는 횟수는 1회 이상이어야 합니다');

  const other = (e: Edge): Edge => (e === 'A' ? 'B' : 'A');
  const held: Record<Edge, number> = { A: 0, B: 0 };
  const rows: ShortRowRow[] = [];
  let pendingDs = false;
  let tooFew = false;

  /** 이 단의 기본 코 — 메리야스면 단마다 겉/안 교대 */
  const baseFor = (rowNo: number): KnitBase =>
    !alternate || rowNo % 2 === 1 ? base : base === 'k' ? 'p' : 'k';

  /**
   * 한 단을 만든다.
   * @param heldStart 시작 전에 이미 지나온 미작업 코 (줄 앞)
   * @param worked    이 단에서 실제로 뜨는 코 수 (되돌아뜨기 기호 포함)
   * @param heldEnd   끝까지 가지 않아 남기는 코 (줄 뒤)
   */
  const emit = (
    rowNo: number,
    heldStart: number,
    worked: number,
    heldEnd: number,
    turning: boolean,
    note: string,
  ) => {
    const st = baseFor(rowNo);
    const parts: string[] = [];
    let plain = worked;

    if (heldStart > 0) parts.push(`unw${heldStart}`);
    // 독일식: 앞 단에서 돌렸으면 이 단 첫 코가 이중코
    if (pendingDs) {
      parts.push('ds');
      plain -= 1;
      pendingDs = false;
    }
    // 감아 되돌리기: 마지막 코가 wt
    const wrap = turning && turn === 'wt';
    if (wrap) plain -= 1;

    if (plain > 0) parts.push(`${st}${plain}`);
    if (wrap) parts.push('wt');
    if (heldEnd > 0) parts.push(`unw${heldEnd}`);

    if (worked < 1 || plain < 0) tooFew = true;
    if (turning && turn === 'ds') pendingDs = true;

    rows.push({ source: parts.join(', '), note });
  };

  // 되돌리는 단들 — 한쪽 모드는 홀수 단에서만 돌리고 짝수 단은 끝까지 간다
  const turnRows = repeats * 2;
  for (let i = 1; i <= turnRows; i++) {
    const start: Edge = i % 2 === 1 ? 'A' : 'B';
    const far = other(start);
    const heldStart = held[start];
    const turning = side === 'both' || i % 2 === 1;

    if (turning) {
      const heldEnd = held[far] + step;
      held[far] = heldEnd;
      emit(i, heldStart, total - heldStart - heldEnd, heldEnd, true,
        `되돌리는 단 — ${heldEnd}코 남기고 돌림`);
    } else {
      emit(i, heldStart, total - heldStart, 0, false, '끝까지 뜨는 단');
    }
  }

  // 마무리 — 남은 미작업 코를 모두 되살린다
  if (resolve) {
    let rowNo = turnRows + 1;
    const start: Edge = rowNo % 2 === 1 ? 'A' : 'B';
    const heldStart = held[start];
    held[other(start)] = 0;
    emit(rowNo, heldStart, total - heldStart, 0, false, '마무리 — 반대쪽 되돌린 코를 되살림');
    if (heldStart > 0) {
      held[start] = 0;
      rowNo += 1;
      emit(rowNo, 0, total, 0, false, '마무리 — 남은 되돌린 코까지 전체 뜨기');
    }
  }

  if (tooFew) {
    return invalid(
      `${total}코에서 ${step}코씩 ${repeats}회는 너무 많습니다 ` +
      `(${side === 'both' ? '양쪽' : '한쪽'}으로 ${step * repeats * (side === 'both' ? 2 : 1)}코를 남기게 됩니다)`,
    );
  }

  const leftover = step * repeats * (side === 'both' ? 2 : 1);
  const warning = turn === 'ds' && !resolve
    ? '독일식은 돌린 다음 단 첫 코가 이중코(ds)입니다. 마무리 단을 직접 적을 때 맨 앞에 ds 를 넣으세요.'
    : undefined;

  return {
    kind: 'ok',
    rows,
    summary:
      `${total}코 · ${side === 'both' ? '양쪽' : '한쪽'} ${step}코씩 ${repeats}회 ` +
      `(총 ${leftover}코 되돌림, ${rows.length}단)`,
    warning,
  };
}
