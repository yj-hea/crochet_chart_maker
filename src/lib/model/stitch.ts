/**
 * Stitch domain model.
 *
 * 기호 체계는 docs/symbol_system.md 참조.
 */

export type StitchKind =
  | 'MAGIC'    // @ 매직링
  | 'CHAIN'    // O 사슬뜨기
  | 'SLIP'     // S 빼뜨기
  | 'SC'       // X 짧은뜨기
  | 'HDC'      // T 긴뜨기 (half double crochet)
  | 'DC'       // F 한길긴뜨기 (double crochet)
  | 'TR'       // E 두길긴뜨기 (treble crochet)
  | 'DTR'      // dtr 세길긴뜨기 (double treble crochet)
  | 'INC'      // V 늘림
  | 'DEC'      // A 줄임
  | 'POPCORN'  // P 팝콘뜨기
  | 'BUBBLE'   // B 버블뜨기 (bobble)
  | 'SKIP'     // skip(N) 바늘 비우기 (N개 부모 건너뛰기)
  | 'TC';      // tc(...) 기둥코 마커 — 파서 토큰 전용 (Op 에는 나타나지 않음)

export type ModifierKind = 'BLO'; // blo 뒤이랑뜨기 (future: FLO 앞이랑뜨기)

/**
 * 각 코의 기본 consume/produce.
 * V(INC), A(DEC)는 expansion 값에 의해 실제 consume/produce가 결정된다.
 */
export interface StitchMeta {
  kind: StitchKind;
  canonical: string;     // 정식 단일 문자 (또는 기호) 입력 코드
  korean: string;
  english: string;
  baseConsume: number;
  baseProduce: number;
  expandable: boolean;   // V/A만 true
  /** SVG 심볼의 중심에서 끝까지 거리 (px). 레이아웃에서 기호 하단 정렬에 사용 */
  symbolHalfHeight: number;
}

export const STITCH_META: Record<StitchKind, StitchMeta> = {
  MAGIC: { kind: 'MAGIC', canonical: '@', korean: '매직링',     english: 'magic ring',          baseConsume: 0, baseProduce: 0, expandable: false, symbolHalfHeight: 7   },
  CHAIN: { kind: 'CHAIN', canonical: 'O', korean: '사슬뜨기',   english: 'chain (ch)',          baseConsume: 0, baseProduce: 1, expandable: false, symbolHalfHeight: 3.5 },
  SLIP:  { kind: 'SLIP',  canonical: 'sl', korean: '빼뜨기',    english: 'slip stitch (sl)',    baseConsume: 1, baseProduce: 1, expandable: false, symbolHalfHeight: 2.2 },
  SC:    { kind: 'SC',    canonical: 'X', korean: '짧은뜨기',   english: 'single crochet (sc)', baseConsume: 1, baseProduce: 1, expandable: false, symbolHalfHeight: 5   },
  HDC:   { kind: 'HDC',   canonical: 'T', korean: '긴뜨기',     english: 'half double (hdc)',   baseConsume: 1, baseProduce: 1, expandable: false, symbolHalfHeight: 7   },
  DC:    { kind: 'DC',    canonical: 'F', korean: '한길긴뜨기', english: 'double (dc)',         baseConsume: 1, baseProduce: 1, expandable: false, symbolHalfHeight: 9   },
  TR:    { kind: 'TR',    canonical: 'E', korean: '두길긴뜨기', english: 'treble (tr)',         baseConsume: 1, baseProduce: 1, expandable: false, symbolHalfHeight: 11  },
  DTR:   { kind: 'DTR',   canonical: 'dtr', korean: '세길긴뜨기', english: 'double treble (dtr)', baseConsume: 1, baseProduce: 1, expandable: false, symbolHalfHeight: 13  },
  INC:   { kind: 'INC',   canonical: 'V', korean: '늘림',       english: 'increase',            baseConsume: 1, baseProduce: 2, expandable: true,  symbolHalfHeight: 5   },
  DEC:   { kind: 'DEC',   canonical: 'A', korean: '줄임',       english: 'decrease',            baseConsume: 2, baseProduce: 1, expandable: true,  symbolHalfHeight: 5   },
  POPCORN:{ kind: 'POPCORN', canonical: 'P', korean: '팝콘뜨기', english: 'popcorn (pop)',      baseConsume: 1, baseProduce: 1, expandable: false, symbolHalfHeight: 9   },
  BUBBLE:{ kind: 'BUBBLE',canonical: 'B', korean: '버블뜨기',   english: 'bobble (bo)',         baseConsume: 1, baseProduce: 1, expandable: false, symbolHalfHeight: 9   },
  SKIP:  { kind: 'SKIP',  canonical: 'skip', korean: '바늘 비우기', english: 'skip',             baseConsume: 0, baseProduce: 0, expandable: false, symbolHalfHeight: 4   },
  TC:    { kind: 'TC',    canonical: 'tc',   korean: '기둥코',      english: 'turning chain',    baseConsume: 0, baseProduce: 0, expandable: false, symbolHalfHeight: 0   },
};

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
export const ALIAS_MAP: Readonly<Record<string, StitchKind | ModifierKind>> = Object.freeze({
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

export function isStitchKind(v: StitchKind | ModifierKind): v is StitchKind {
  return v !== 'BLO';
}

export function isModifierKind(v: StitchKind | ModifierKind): v is ModifierKind {
  return v === 'BLO';
}
