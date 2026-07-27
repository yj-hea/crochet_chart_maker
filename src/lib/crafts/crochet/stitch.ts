/**
 * 코바늘 Stitch domain model.
 *
 * 기호 체계는 docs/symbol_system.md 참조.
 * 크래프트 공용 타입(StitchKind 합집합, StitchMeta 등)은 `$lib/model/stitch-kind` 에 있다.
 */

import type {
  CrochetStitchKind,
  StitchKind,
  ModifierKind,
  StitchMeta,
  AliasTable,
} from '$lib/model/stitch-kind';

// 기존 import 경로 호환 — 이 모듈에서 타입을 그대로 재수출한다.
export type { StitchKind, ModifierKind, StitchMeta, CrochetStitchKind };
export { isStitchKind, isModifierKind } from '$lib/model/stitch-kind';

/**
 * 코바늘 코 메타 테이블.
 * 리터럴은 `CrochetStitchKind` 로 완전성 검사를 받고,
 * 조회는 공용 `StitchKind` 로 하도록 넓혀서 노출한다 (Op.kind 가 합집합 타입이므로).
 */
const CROCHET_STITCH_META: Record<CrochetStitchKind, StitchMeta> = {
  MAGIC: { kind: 'MAGIC', canonical: '@', korean: '매직링',     english: 'magic ring',          baseConsume: 0, baseProduce: 0, expandable: false, symbolHalfHeight: 7   },
  CHAIN: { kind: 'CHAIN', canonical: 'O', korean: '사슬뜨기',   english: 'chain (ch)',          baseConsume: 0, baseProduce: 1, expandable: false, symbolHalfHeight: 3.5 },
  SLIP:  { kind: 'SLIP',  canonical: 'sl', korean: '빼뜨기',    english: 'slip stitch (sl)',    baseConsume: 1, baseProduce: 1, expandable: false, symbolHalfHeight: 2.2 },
  SC:    { kind: 'SC',    canonical: 'X', korean: '짧은뜨기',   english: 'single crochet (sc)', baseConsume: 1, baseProduce: 1, expandable: false, symbolHalfHeight: 3.5 },
  HDC:   { kind: 'HDC',   canonical: 'T', korean: '긴뜨기',     english: 'half double (hdc)',   baseConsume: 1, baseProduce: 1, expandable: false, symbolHalfHeight: 7   },
  DC:    { kind: 'DC',    canonical: 'F', korean: '한길긴뜨기', english: 'double (dc)',         baseConsume: 1, baseProduce: 1, expandable: false, symbolHalfHeight: 10.5},
  TR:    { kind: 'TR',    canonical: 'E', korean: '두길긴뜨기', english: 'treble (tr)',         baseConsume: 1, baseProduce: 1, expandable: false, symbolHalfHeight: 14  },
  DTR:   { kind: 'DTR',   canonical: 'dtr', korean: '세길긴뜨기', english: 'double treble (dtr)', baseConsume: 1, baseProduce: 1, expandable: false, symbolHalfHeight: 17.5},
  INC:   { kind: 'INC',   canonical: 'V', korean: '늘림',       english: 'increase',            baseConsume: 1, baseProduce: 2, expandable: true,  symbolHalfHeight: 3.5 },
  DEC:   { kind: 'DEC',   canonical: 'A', korean: '줄임',       english: 'decrease',            baseConsume: 2, baseProduce: 1, expandable: true,  symbolHalfHeight: 3.5 },
  POPCORN:{ kind: 'POPCORN', canonical: 'P', korean: '팝콘뜨기', english: 'popcorn (pop)',      baseConsume: 1, baseProduce: 1, expandable: false, symbolHalfHeight: 9   },
  BUBBLE:{ kind: 'BUBBLE',canonical: 'B', korean: '버블뜨기',   english: 'bobble (bo)',         baseConsume: 1, baseProduce: 1, expandable: false, symbolHalfHeight: 9   },
  SKIP:  { kind: 'SKIP',  canonical: 'skip', korean: '바늘 비우기', english: 'skip',             baseConsume: 0, baseProduce: 0, expandable: false, symbolHalfHeight: 4   },
  TC:    { kind: 'TC',    canonical: 'tc',   korean: '기둥코',      english: 'turning chain',    baseConsume: 0, baseProduce: 0, expandable: false, symbolHalfHeight: 0   },
};

/** 조회용 — Op.kind (크래프트 합집합 타입) 로 접근할 수 있게 넓힌 뷰. */
export const STITCH_META = CROCHET_STITCH_META as Record<StitchKind, StitchMeta>;

/**
 * V^N / A^N 적용 시 실제 consume/produce 계산.
 * expansion이 없으면 base값을 반환.
 */
export function resolveStitchFootprint(
  kind: StitchKind,
  expansion?: number
): { consume: number; produce: number } {
  const meta = STITCH_META[kind];
  if (!meta.expandable || expansion === undefined) {
    return { consume: meta.baseConsume, produce: meta.baseProduce };
  }
  if (kind === 'INC') {
    return { consume: 1, produce: expansion };
  }
  if (kind === 'DEC') {
    return { consume: expansion, produce: 1 };
  }
  return { consume: meta.baseConsume, produce: meta.baseProduce };
}

/**
 * 입력 별칭 테이블.
 * 키는 사용자 입력 문자열, 값은 정규화된 StitchKind 또는 ModifierKind.
 *
 * 주의: 단일 소문자 `s`는 의도적으로 제외됨 (가독성 — `sc`와의 혼동 회피).
 * `sl`, `_`, 대문자 `S`만 SLIP으로 인식.
 */
export const ALIAS_MAP: AliasTable = Object.freeze({
  // MAGIC
  '@':   'MAGIC',
  'mr':  'MAGIC',
  'MR':  'MAGIC',
  'Mr':  'MAGIC',

  // CHAIN
  'O':   'CHAIN',
  'o':   'CHAIN',
  'ch':  'CHAIN',
  'CH':  'CHAIN',
  'Ch':  'CHAIN',

  // SLIP — 단일 대문자 'S' 는 의도적으로 제외 (sc/stitch 와의 혼동 회피)
  'sl':   'SLIP',
  'SL':   'SLIP',
  'Sl':   'SLIP',
  'slst': 'SLIP',
  'SLST': 'SLIP',
  'Slst': 'SLIP',
  '_':    'SLIP',

  // SC
  'X':   'SC',
  'x':   'SC',
  'sc':  'SC',
  'SC':  'SC',
  'Sc':  'SC',

  // HDC (긴뜨기, 단일 문자 T)
  'T':   'HDC',
  't':   'HDC',
  'hdc': 'HDC',
  'HDC': 'HDC',
  'Hdc': 'HDC',

  // DC (한길긴뜨기, 단일 문자 F)
  'F':   'DC',
  'f':   'DC',
  'dc':  'DC',
  'DC':  'DC',
  'Dc':  'DC',

  // TR
  'E':   'TR',
  'e':   'TR',
  'tr':  'TR',
  'TR':  'TR',
  'Tr':  'TR',

  // DTR (세길긴뜨기) — 단일 문자 충돌 없어 alias 만 제공
  'dtr': 'DTR',
  'DTR': 'DTR',
  'Dtr': 'DTR',

  // INC
  'V':   'INC',
  'v':   'INC',
  'inc': 'INC',
  'INC': 'INC',
  'Inc': 'INC',

  // DEC
  'A':   'DEC',
  'a':   'DEC',
  'dec': 'DEC',
  'DEC': 'DEC',
  'Dec': 'DEC',

  // POPCORN
  'P':   'POPCORN',
  'p':   'POPCORN',
  'pc':  'POPCORN',
  'PC':  'POPCORN',
  'Pc':  'POPCORN',
  'pop': 'POPCORN',
  'POP': 'POPCORN',
  'Pop': 'POPCORN',

  // BUBBLE (bobble)
  'B':   'BUBBLE',
  'b':   'BUBBLE',
  'bo':  'BUBBLE',
  'BO':  'BUBBLE',
  'Bo':  'BUBBLE',
  'bob': 'BUBBLE',
  'BOB': 'BUBBLE',
  'Bob': 'BUBBLE',
  'bbl': 'BUBBLE',
  'BBL': 'BUBBLE',
  'Bbl': 'BUBBLE',

  // SKIP (바늘 비우기) — 파서에서 skip(N) 형태로 파싱. 다른 alias 와 혼동 없게 길이 4 키만 등록
  'skip': 'SKIP',
  'SKIP': 'SKIP',
  'Skip': 'SKIP',

  // TC (기둥코) — 파서에서 tc(...) 형태로 파싱
  'tc':   'TC',
  'TC':   'TC',
  'Tc':   'TC',

  // BLO modifier
  'blo': 'BLO',
  'BLO': 'BLO',
  'Blo': 'BLO',
});

/**
 * 별칭 목록을 길이 내림차순으로 정렬한 배열.
 * Tokenizer의 longest-match 용도.
 */
export const ALIAS_KEYS_BY_LENGTH: readonly string[] = Object.freeze(
  [...Object.keys(ALIAS_MAP)].sort((a, b) => b.length - a.length)
);
