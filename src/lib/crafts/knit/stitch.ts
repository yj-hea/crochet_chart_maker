/**
 * 대바늘 Stitch domain model.
 *
 * 기호 체계는 docs/knit_symbol_system.md 참조.
 * 코바늘과 코드를 공유하지 않고 대바늘 표준 약어(k, p, yo, k2tog, ssk…)를 그대로 쓴다.
 */

import type {
  KnitStitchKind,
  StitchKind,
  StitchMeta,
  AliasTable,
} from '$lib/model/stitch-kind';

export type { KnitStitchKind };

/**
 * 대바늘 코 메타.
 *
 * 격자 도안이므로 `symbolHalfHeight` 는 레이아웃에 쓰이지 않는다 (셀 높이가 고정).
 * 공용 인터페이스를 만족시키기 위한 값으로 셀 반높이를 넣어 둔다.
 */
const CELL_HALF_HEIGHT = 7;

const KNIT_META: Record<KnitStitchKind, StitchMeta> = {
  KNIT:      { kind: 'KNIT',      canonical: 'k',     korean: '겉뜨기',        english: 'knit',            baseConsume: 1, baseProduce: 1, expandable: false, symbolHalfHeight: CELL_HALF_HEIGHT },
  PURL:      { kind: 'PURL',      canonical: 'p',     korean: '안뜨기',        english: 'purl',            baseConsume: 1, baseProduce: 1, expandable: false, symbolHalfHeight: CELL_HALF_HEIGHT },
  YO:        { kind: 'YO',        canonical: 'yo',    korean: '바늘비우기',    english: 'yarn over',       baseConsume: 0, baseProduce: 1, expandable: false, symbolHalfHeight: CELL_HALF_HEIGHT },
  KTBL:      { kind: 'KTBL',      canonical: 'ktbl',  korean: '꼬아 겉뜨기',   english: 'knit tbl',        baseConsume: 1, baseProduce: 1, expandable: false, symbolHalfHeight: CELL_HALF_HEIGHT },
  PTBL:      { kind: 'PTBL',      canonical: 'ptbl',  korean: '꼬아 안뜨기',   english: 'purl tbl',        baseConsume: 1, baseProduce: 1, expandable: false, symbolHalfHeight: CELL_HALF_HEIGHT },
  SLIP_ST:   { kind: 'SLIP_ST',   canonical: 'sl',    korean: '걸러뜨기',      english: 'slip',            baseConsume: 1, baseProduce: 1, expandable: false, symbolHalfHeight: CELL_HALF_HEIGHT },
  NO_STITCH: { kind: 'NO_STITCH', canonical: 'ns',    korean: '코 없음',       english: 'no stitch',       baseConsume: 0, baseProduce: 0, expandable: false, symbolHalfHeight: CELL_HALF_HEIGHT },
  KFB:       { kind: 'KFB',       canonical: 'kfb',   korean: '코늘리기',      english: 'kfb',             baseConsume: 1, baseProduce: 2, expandable: true,  symbolHalfHeight: CELL_HALF_HEIGHT },
  M1L:       { kind: 'M1L',       canonical: 'm1l',   korean: '왼코 늘리기',   english: 'make 1 left',     baseConsume: 0, baseProduce: 1, expandable: false, symbolHalfHeight: CELL_HALF_HEIGHT },
  M1R:       { kind: 'M1R',       canonical: 'm1r',   korean: '오른코 늘리기', english: 'make 1 right',    baseConsume: 0, baseProduce: 1, expandable: false, symbolHalfHeight: CELL_HALF_HEIGHT },
  M1P:       { kind: 'M1P',       canonical: 'm1p',   korean: '안뜨기 늘리기', english: 'make 1 purl',     baseConsume: 0, baseProduce: 1, expandable: false, symbolHalfHeight: CELL_HALF_HEIGHT },
  K2TOG:     { kind: 'K2TOG',     canonical: 'k2tog', korean: '왼코겹치기',    english: 'k2tog',           baseConsume: 2, baseProduce: 1, expandable: true,  symbolHalfHeight: CELL_HALF_HEIGHT },
  SSK:       { kind: 'SSK',       canonical: 'ssk',   korean: '오른코겹치기',  english: 'ssk',             baseConsume: 2, baseProduce: 1, expandable: true,  symbolHalfHeight: CELL_HALF_HEIGHT },
  CDD:       { kind: 'CDD',       canonical: 'cdd',   korean: '중심 3코 모아', english: 'centered dbl dec', baseConsume: 3, baseProduce: 1, expandable: true,  symbolHalfHeight: CELL_HALF_HEIGHT },
  P2TOG:     { kind: 'P2TOG',     canonical: 'p2tog', korean: '안뜨기 왼코겹치기', english: 'p2tog',       baseConsume: 2, baseProduce: 1, expandable: true,  symbolHalfHeight: CELL_HALF_HEIGHT },
  SSP:       { kind: 'SSP',       canonical: 'ssp',   korean: '안뜨기 오른코겹치기', english: 'ssp',       baseConsume: 2, baseProduce: 1, expandable: true,  symbolHalfHeight: CELL_HALF_HEIGHT },
  CABLE:     { kind: 'CABLE',     canonical: 'cable', korean: '교차뜨기',      english: 'cable',           baseConsume: 2, baseProduce: 2, expandable: false, symbolHalfHeight: CELL_HALF_HEIGHT },
};

/** 조회용 — Op.kind (크래프트 합집합 타입) 로 접근할 수 있게 넓힌 뷰. */
export const KNIT_STITCH_META = KNIT_META as Record<StitchKind, StitchMeta>;

/** 이 코가 대바늘 코인지 */
export function isKnitKind(kind: StitchKind): boolean {
  return Object.prototype.hasOwnProperty.call(KNIT_META, kind);
}

/**
 * consume/produce 계산.
 *  - 늘림(KFB): 1 → expansion
 *  - 줄임(K2TOG/SSK/CDD/P2TOG/SSP): expansion → 1
 *  - 그 외: base 값
 */
export function resolveKnitFootprint(
  kind: StitchKind,
  expansion?: number,
): { consume: number; produce: number } {
  const meta = KNIT_META[kind as KnitStitchKind];
  if (!meta) return { consume: 1, produce: 1 };
  if (!meta.expandable || expansion === undefined) {
    return { consume: meta.baseConsume, produce: meta.baseProduce };
  }
  if (kind === 'KFB') return { consume: 1, produce: expansion };
  return { consume: expansion, produce: 1 };
}

/**
 * 입력 별칭 → 정규화된 코.
 *
 * 대소문자 무관하게 받기 위해 소문자/대문자 변형을 함께 등록한다.
 * `k3tog` 처럼 코 수가 들어간 별칭은 파서가 토큰 텍스트에서 N 을 읽어 expansion 으로 쓴다.
 */
const RAW_ALIASES: Record<string, KnitStitchKind> = {
  // 겉/안
  k: 'KNIT', knit: 'KNIT',
  p: 'PURL', purl: 'PURL',
  // 바늘비우기
  yo: 'YO',
  // 꼬아뜨기
  ktbl: 'KTBL', 'k-tbl': 'KTBL', tw: 'KTBL', twk: 'KTBL',
  ptbl: 'PTBL', 'p-tbl': 'PTBL', twp: 'PTBL',
  // 걸러뜨기
  sl: 'SLIP_ST', slip: 'SLIP_ST', slwyif: 'SLIP_ST', 'sl-wyif': 'SLIP_ST',
  // 코 없음
  ns: 'NO_STITCH',
  // 늘림
  kfb: 'KFB', inc: 'KFB', kfbf: 'KFB',
  m1l: 'M1L', m1r: 'M1R', m1p: 'M1P', m1: 'M1L',
  // 줄임 — 오른쪽 기욺
  k2tog: 'K2TOG', k2t: 'K2TOG', k3tog: 'K2TOG', k4tog: 'K2TOG', k5tog: 'K2TOG',
  p2tog: 'P2TOG', p2t: 'P2TOG', p3tog: 'P2TOG',
  // 줄임 — 왼쪽 기욺
  ssk: 'SSK', skpo: 'SSK', sssk: 'SSK',
  ssp: 'SSP',
  // 중심 모아뜨기
  cdd: 'CDD', sk2p: 'CDD', s2kp: 'CDD',
};

/** `k3tog` / `sssk` / `kfbf` 처럼 별칭 자체가 코 수를 담는 경우의 expansion */
const ALIAS_EXPANSION: Record<string, number> = {
  k3tog: 3, k4tog: 4, k5tog: 5,
  p3tog: 3,
  sssk: 3,
  kfbf: 3,
  cdd: 3, sk2p: 3, s2kp: 3,
};

/** 별칭 문자열에서 expansion 을 구한다. 없으면 undefined (기본값 사용) */
export function aliasExpansion(alias: string): number | undefined {
  return ALIAS_EXPANSION[alias.toLowerCase()];
}

/**
 * 확장수를 반영한 정식 표기.
 * `k2tog` + expansion 3 → `k3tog`, `ssk` + 3 → `sssk`, `kfb` + 3 → `kfbf`.
 */
export function knitCanonicalFor(kind: StitchKind, expansion?: number): string | undefined {
  const meta = KNIT_META[kind as KnitStitchKind];
  if (!meta) return undefined;
  const n = expansion ?? 0;
  if (kind === 'K2TOG' && n > 2) return `k${n}tog`;
  if (kind === 'P2TOG' && n > 2) return `p${n}tog`;
  if (kind === 'SSK' && n > 2) return 's'.repeat(n - 1) + 'k';
  if (kind === 'SSP' && n > 2) return 's'.repeat(n - 1) + 'p';
  if (kind === 'KFB' && n === 3) return 'kfbf';
  if (kind === 'CDD') return 'cdd';
  return meta.canonical;
}

function buildAliasMap(): AliasTable {
  const out: Record<string, StitchKind> = {};
  for (const [key, kind] of Object.entries(RAW_ALIASES)) {
    out[key] = kind;
    out[key.toUpperCase()] = kind;
    // 첫 글자만 대문자인 형태도 허용 (Ktbl, Ssk 등)
    out[key.charAt(0).toUpperCase() + key.slice(1)] = kind;
  }
  return Object.freeze(out);
}

export const KNIT_ALIAS_MAP: AliasTable = buildAliasMap();

export const KNIT_ALIAS_KEYS_BY_LENGTH: readonly string[] = Object.freeze(
  [...Object.keys(KNIT_ALIAS_MAP)].sort((a, b) => b.length - a.length),
);
