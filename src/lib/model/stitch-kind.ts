/**
 * 크래프트 공용 코(stitch) 타입.
 *
 * 실제 메타데이터 테이블·별칭 테이블은 크래프트별로 나뉘어 있다:
 *   - 코바늘: `$lib/crafts/crochet/stitch`
 *   - 대바늘: `$lib/crafts/knit/stitch`
 *
 * 여기에는 두 크래프트가 공유하는 **타입만** 둔다.
 * (Op / AST / 레이아웃 타입이 크래프트 무관하게 쓰이기 위한 최소 공통분모)
 */

/** 코바늘 코 종류. 기호 체계는 docs/symbol_system.md 참조. */
export type CrochetStitchKind =
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

/**
 * 대바늘 코 종류. 기호 체계는 docs/knit_symbol_system.md 참조.
 * (테이블 구현은 Phase 1 에서 추가 — 여기서는 타입만 선언)
 */
export type KnitStitchKind =
  | 'KNIT'     // k  겉뜨기
  | 'PURL'     // p  안뜨기
  | 'YO'       // yo 바늘비우기
  | 'KTBL'     // ktbl 꼬아 겉뜨기
  | 'PTBL'     // ptbl 꼬아 안뜨기
  | 'SLIP_ST'  // sl 걸러뜨기 (코바늘 SLIP 과 구분)
  | 'UNWORKED' // unw 미작업 코 (되돌아뜨기에서 뜨지 않고 남긴 코)
  | 'WRAP_TURN'// wt 되돌아뜨기 turn (wrap & turn)
  | 'DOUBLE_ST'// ds 독일식 되돌아뜨기 (double stitch)
  | 'CAST_ON'  // co 코잡기 (작품 시작 — 부모 없이 코를 만든다. 중간에 쓰면 감아코)
  | 'BIND_OFF' // bo 코막음 (코를 없앤다)
  | 'NO_STITCH'// ns 코 없음 (격자 채움용)
  | 'KFB'      // kfb 한 코에 여러 코
  | 'M1L'      // m1l 왼코 늘리기
  | 'M1R'      // m1r 오른코 늘리기
  | 'M1P'      // m1p 안뜨기 늘리기
  | 'K2TOG'    // k2tog 왼코겹치기 (오른쪽 기욺)
  | 'SSK'      // ssk 오른코겹치기 (왼쪽 기욺)
  | 'CDD'      // cdd 중심 3코 모아뜨기
  | 'P2TOG'    // p2tog 안뜨기 왼코겹치기
  | 'SSP'      // ssp 안뜨기 오른코겹치기
  | 'CABLE';   // 2/2rc 등 교차뜨기 (span 으로 칸 수 표현)

/**
 * 두 크래프트가 함께 쓰는 코 종류.
 *
 * `MARKER` 는 코가 아니라 **코와 코 사이의 경계**를 가리킨다 (편물 마커, place marker).
 * 코를 소비하지도 만들지도 않으므로(0 → 0) 코 수 검증에 영향을 주지 않고,
 * 레이아웃에서는 칸/슬롯을 차지하지 않고 경계 좌표만 계산한다.
 */
export type CommonStitchKind = 'MARKER';

/** 두 크래프트의 코 종류 합집합. Op·AST·레이아웃 등 공용 자료구조에서 사용. */
export type StitchKind = CrochetStitchKind | KnitStitchKind | CommonStitchKind;

/** 변형자. 현재는 코바늘 전용 (blo 뒤이랑뜨기). */
export type ModifierKind = 'BLO';

/**
 * 코 하나의 메타데이터.
 * V/A 처럼 expansion 을 갖는 코는 실제 consume/produce 가 expansion 으로 결정된다.
 */
export interface StitchMeta {
  kind: StitchKind;
  canonical: string;     // 정식 입력 코드
  korean: string;
  english: string;
  baseConsume: number;
  baseProduce: number;
  expandable: boolean;
  /** SVG 심볼의 중심에서 끝까지 거리 (px). 레이아웃에서 기호 하단 정렬에 사용 */
  symbolHalfHeight: number;
}

/**
 * 마커 메타 — 두 크래프트의 메타 테이블에 그대로 펼쳐 넣는다.
 * 코를 소비/생성하지 않으므로 baseConsume/baseProduce 모두 0.
 */
export const MARKER_META: StitchMeta = {
  kind: 'MARKER',
  canonical: 'pm',
  korean: '마커',
  english: 'place marker',
  baseConsume: 0,
  baseProduce: 0,
  expandable: false,
  symbolHalfHeight: 0,
};

/** 마커 입력 별칭 — 두 크래프트 공용 */
export const MARKER_ALIASES = Object.freeze({
  pm: 'MARKER',
  PM: 'MARKER',
  sm: 'MARKER',
  marker: 'MARKER',
} as const satisfies Record<string, StitchKind>);

/** 입력 별칭 → 정규화된 코/변형자. 토크나이저가 longest-match 로 사용. */
export type AliasTable = Readonly<Record<string, StitchKind | ModifierKind>>;

export function isModifierKind(v: StitchKind | ModifierKind): v is ModifierKind {
  return v === 'BLO';
}

export function isStitchKind(v: StitchKind | ModifierKind): v is StitchKind {
  return !isModifierKind(v);
}
