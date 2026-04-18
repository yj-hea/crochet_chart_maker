/**
 * 균등증단 / 균등감단 계산.
 *
 * 입력:
 *   - from: 현재(부모) 단의 코 수
 *   - to:   목표 단의 코 수
 *   - base: 일반 코 종류 ('x' | 't' | 'f' | 'e')
 *
 * 출력: 패턴 문자열 (예: `(2x, 1v)*6`). 나눠 떨어지지 않으면 꼬리에 남는 코를 덧붙임.
 *
 * 로직:
 *   - 증가: 늘어나는 코 수 N = to - from. 기본 간격 gap = floor((from - N) / N).
 *     → `(gap x, 1 v)*N` + 남은 코.
 *   - 감소: 줄어드는 코 수 N = from - to. A 가 2코 소비 1코 생성 → 기본 간격
 *     gap = floor((from - 2*N) / N).
 *     → `(gap x, 1 a)*N` + 남은 코.
 */

export type BaseStitch = 'x' | 't' | 'f' | 'e' | 'dtr';

export interface EvenIncResult {
  kind: 'increase' | 'decrease' | 'same' | 'invalid';
  pattern: string;
  /** 계산 후 실제 결과 코 수 (검증용) */
  resultCount: number;
  /** 사람이 읽을 수 있는 설명 */
  summary: string;
}

const V_FOR: Record<BaseStitch, string> = { x: 'v', t: 'vt', f: 'vf', e: 've', dtr: 'vdtr' };
const A_FOR: Record<BaseStitch, string> = { x: 'a', t: 'at', f: 'af', e: 'ae', dtr: 'adtr' };

export function evenIncDec(from: number, to: number, base: BaseStitch = 'x'): EvenIncResult {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from <= 0 || to <= 0) {
    return { kind: 'invalid', pattern: '', resultCount: 0, summary: '유효한 코 수를 입력하세요' };
  }
  if (from === to) {
    return {
      kind: 'same',
      pattern: `${from}${base}`,
      resultCount: from,
      summary: `${from}코 그대로 (${base} ${from}번)`,
    };
  }
  if (to > from) return buildIncrease(from, to, base);
  return buildDecrease(from, to, base);
}

function buildIncrease(from: number, to: number, base: BaseStitch): EvenIncResult {
  const incCount = to - from;
  if (incCount > from) {
    return {
      kind: 'invalid',
      pattern: '',
      resultCount: 0,
      summary: `${from}코에서 ${incCount}코 증가는 불가 (늘림 수가 기존 코 수보다 많음)`,
    };
  }
  // 일반 코 수 = from - incCount. 이를 incCount 그룹으로 나눔.
  const plain = from - incCount;
  const gap = Math.floor(plain / incCount);
  const remainder = plain - gap * incCount;
  const vSym = V_FOR[base];
  const parts: string[] = [];
  // 메인 블록: `(gap base, 1 V)*incCount`
  if (gap > 0) parts.push(`(${gap}${base}, 1${vSym})*${incCount}`);
  else parts.push(`${incCount}${vSym}`);
  if (remainder > 0) parts.push(`${remainder}${base}`);
  const pattern = parts.join(', ');
  return {
    kind: 'increase',
    pattern,
    resultCount: to,
    summary: `${from}코 → ${to}코 (균등 증가 ${incCount})`,
  };
}

function buildDecrease(from: number, to: number, base: BaseStitch): EvenIncResult {
  const decCount = from - to;
  // A 는 2코 소비 → 줄임 1번에 2코 사용. 일반 코 수 = from - 2*decCount.
  const plain = from - 2 * decCount;
  if (plain < 0) {
    return {
      kind: 'invalid',
      pattern: '',
      resultCount: 0,
      summary: `${from}코에서 ${decCount}코 감소는 불가 (줄임이 너무 많음)`,
    };
  }
  const gap = Math.floor(plain / decCount);
  const remainder = plain - gap * decCount;
  const aSym = A_FOR[base];
  const parts: string[] = [];
  if (gap > 0) parts.push(`(${gap}${base}, 1${aSym})*${decCount}`);
  else parts.push(`${decCount}${aSym}`);
  if (remainder > 0) parts.push(`${remainder}${base}`);
  const pattern = parts.join(', ');
  return {
    kind: 'decrease',
    pattern,
    resultCount: to,
    summary: `${from}코 → ${to}코 (균등 감소 ${decCount})`,
  };
}
