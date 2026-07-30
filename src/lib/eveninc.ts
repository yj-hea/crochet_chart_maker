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

/**
 * 표기 규칙 — 크래프트마다 반복수 위치가 다르다.
 *   코바늘 `2x`, `1v`   /   대바늘 `k2`, `m1l`
 */
interface PatternFormat {
  plain(count: number, base: string): string;
  op(name: string): string;
}

const CROCHET_FORMAT: PatternFormat = {
  plain: (count, base) => `${count}${base}`,
  op: (name) => `1${name}`,
};

const KNIT_FORMAT: PatternFormat = {
  plain: (count, base) => `${base}${count}`,
  op: (name) => name,
};

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

function gcd(a: number, b: number): number {
  while (b !== 0) { [a, b] = [b, a % b]; }
  return a;
}

/**
 * `plain` 일반 코를 `groups` 그룹으로 균등 분산. 완전 교차(interleave) 방식.
 *
 * 큰 그룹(gap+1 SC + V) R 개와 작은 그룹(gap SC + V) S 개를 g=gcd(R, S) 개의
 * 반복 블록으로 나누고, 블록 안에서 min 만큼 (big, small) 쌍을 먼저 배치한 뒤
 * 남는 |R-S| 개의 큰/작은 그룹을 뒤에 붙임.
 * 예) R=8, S=6 → g=2 → 블록 (4B+3S) → `(big, small)*3, big` → ×2
 *     = `((2x, 1v, 1x, 1v)*3, 2x, 1v)*2`
 */
function buildGroups(
  plain: number,
  groups: number,
  base: string,
  incdec: string,
  fmt: PatternFormat = CROCHET_FORMAT,
): string {
  const gap = Math.floor(plain / groups);
  const R = plain - gap * groups;        // 큰 그룹 수 (gap+1 SC)
  const S = groups - R;                  // 작은 그룹 수 (gap SC)

  const bigStr = gap + 1 > 0 ? `${fmt.plain(gap + 1, base)}, ${fmt.op(incdec)}` : fmt.op(incdec);
  const smallStr = gap > 0 ? `${fmt.plain(gap, base)}, ${fmt.op(incdec)}` : fmt.op(incdec);
  const repeat = (inner: string, n: number): string => n === 1 ? inner : `(${inner})*${n}`;

  // 단일 타입
  if (R === 0) return repeat(smallStr, S);
  if (S === 0) return repeat(bigStr, R);

  // 블록 분할: g 개의 동일 블록으로 반복
  const g = gcd(R, S);
  const blockR = R / g;
  const blockS = S / g;
  const blockMin = Math.min(blockR, blockS);
  const blockDiff = Math.abs(blockR - blockS);
  const extraStr = blockR > blockS ? bigStr : smallStr;
  const pairStr = `${bigStr}, ${smallStr}`; // 큰→작은 쌍

  const blockParts: string[] = [];
  if (blockMin > 0) blockParts.push(repeat(pairStr, blockMin));
  if (blockDiff > 0) blockParts.push(repeat(extraStr, blockDiff));
  const blockText = blockParts.join(', ');

  return g === 1 ? blockText : `(${blockText})*${g}`;
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
  const plain = from - incCount;
  const pattern = buildGroups(plain, incCount, base, V_FOR[base]);
  return {
    kind: 'increase',
    pattern,
    resultCount: to,
    summary: `${from}코 → ${to}코 (균등 증가 ${incCount})`,
  };
}

function buildDecrease(from: number, to: number, base: BaseStitch): EvenIncResult {
  const decCount = from - to;
  const plain = from - 2 * decCount;
  if (plain < 0) {
    return {
      kind: 'invalid',
      pattern: '',
      resultCount: 0,
      summary: `${from}코에서 ${decCount}코 감소는 불가 (줄임이 너무 많음)`,
    };
  }
  const pattern = buildGroups(plain, decCount, base, A_FOR[base]);
  return {
    kind: 'decrease',
    pattern,
    resultCount: to,
    summary: `${from}코 → ${to}코 (균등 감소 ${decCount})`,
  };
}

// ============================================================
// 대바늘 (knit)
// ============================================================

/**
 * 대바늘 늘림 방식.
 *  - `m1l` / `m1r` / `m1p` / `yo`: 코와 코 **사이**에서 새 코를 만든다 → 부모를 소비하지 않음 (0 → 1)
 *  - `kfb`: 한 코에 두 번 뜬다 → 부모 1코 소비 (1 → 2, 코바늘 V 와 같은 구조)
 */
export type KnitIncMethod = 'm1l' | 'm1r' | 'm1p' | 'yo' | 'kfb';
/** 대바늘 줄임 방식 — 기욺 방향이 다르다 */
export type KnitDecMethod = 'k2tog' | 'ssk';
/** 일반 코 — 겉뜨기 / 안뜨기 */
export type KnitBase = 'k' | 'p';

export interface KnitEvenOptions {
  base?: KnitBase;
  inc?: KnitIncMethod;
  dec?: KnitDecMethod;
}

/** 이 늘림 방식이 부모 코를 소비하는 수 */
function incConsumes(method: KnitIncMethod): number {
  return method === 'kfb' ? 1 : 0;
}

const INC_LABEL: Record<KnitIncMethod, string> = {
  m1l: '왼코 늘리기(m1l)',
  m1r: '오른코 늘리기(m1r)',
  m1p: '안뜨기 늘리기(m1p)',
  yo: '바늘비우기(yo)',
  kfb: '코늘리기(kfb)',
};
const DEC_LABEL: Record<KnitDecMethod, string> = {
  k2tog: '왼코겹치기(k2tog)',
  ssk: '오른코겹치기(ssk)',
};

/**
 * 대바늘 균등 증감.
 *
 * 코바늘과 균등 분산 로직(`buildGroups`)은 공유하고, 다른 점만 분기한다:
 *   1. 늘림이 부모를 소비하는지 (m1/yo = 0코, kfb = 1코)
 *   2. 표기 — 반복수가 코 뒤 (`k2`), 늘림/줄임은 이름 그대로 (`m1l`)
 */
export function evenIncDecKnit(from: number, to: number, opts: KnitEvenOptions = {}): EvenIncResult {
  const base: KnitBase = opts.base ?? 'k';
  const inc: KnitIncMethod = opts.inc ?? 'm1l';
  const dec: KnitDecMethod = opts.dec ?? 'k2tog';

  if (!Number.isFinite(from) || !Number.isFinite(to) || from <= 0 || to <= 0) {
    return { kind: 'invalid', pattern: '', resultCount: 0, summary: '유효한 코 수를 입력하세요' };
  }
  if (from === to) {
    return {
      kind: 'same',
      pattern: KNIT_FORMAT.plain(from, base),
      resultCount: from,
      summary: `${from}코 그대로`,
    };
  }

  if (to > from) {
    const incCount = to - from;
    const consumes = incConsumes(inc);
    const plain = from - incCount * consumes;
    if (plain < 0) {
      return {
        kind: 'invalid',
        pattern: '',
        resultCount: 0,
        summary: `${from}코에서 ${incCount}코 증가는 ${INC_LABEL[inc]}로 불가 (늘림이 기존 코 수보다 많음)`,
      };
    }
    return {
      kind: 'increase',
      pattern: buildGroups(plain, incCount, base, inc, KNIT_FORMAT),
      resultCount: to,
      summary: `${from}코 → ${to}코 (균등 증가 ${incCount}, ${INC_LABEL[inc]})`,
    };
  }

  const decCount = from - to;
  // 줄임은 2코를 1코로 → 소비 2
  const plain = from - 2 * decCount;
  if (plain < 0) {
    return {
      kind: 'invalid',
      pattern: '',
      resultCount: 0,
      summary: `${from}코에서 ${decCount}코 감소는 불가 (줄임이 너무 많음)`,
    };
  }
  return {
    kind: 'decrease',
    pattern: buildGroups(plain, decCount, base, dec, KNIT_FORMAT),
    resultCount: to,
    summary: `${from}코 → ${to}코 (균등 감소 ${decCount}, ${DEC_LABEL[dec]})`,
  };
}
