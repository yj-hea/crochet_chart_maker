/**
 * Expanded Op — AST를 평탄화한 단위 연산.
 *
 * Parser AST는 `2V^3`처럼 여러 동작을 압축 표현하지만,
 * Op 리스트는 실제 뜨는 순서대로의 원자적 연산 리스트이다.
 *
 * 예: `2V^3` → Op(INC, expansion=3) × 2
 */

import type { StitchKind, ModifierKind } from '$lib/model/stitch';
import type { SourceRange } from '$lib/model/errors';

export interface Op {
  kind: StitchKind;
  modifier?: ModifierKind;
  /** V/A의 ^N 값. 일반 기호는 1 또는 미사용 */
  expansion: number;
  consume: number;
  produce: number;
  /**
   * `[...]` 한 코 그룹의 두 번째 이후 op임을 표시.
   * true인 op는 부모 슬롯을 새로 소비하지 않고 직전 op와 같은 부모를 공유한다.
   * (consume 은 이 경우 0으로 설정됨)
   */
  sameHoleContinuation?: boolean;
  /** `[...]` 한 코 그룹에 속한 op인지. 첫 번째 op 포함. turning chain 감지 등에 사용 */
  inSameHoleGroup?: boolean;
  /** `[^...]` 기둥코 그룹에 속한 op. true 면 그룹 전체가 슬롯 1개로 축약되고 세로 스택 렌더 */
  turningChain?: boolean;
  /** V/A의 base stitch — 렌더 시 심볼 선택용 */
  baseKind?: StitchKind;
  /**
   * TR/DTR 계열의 yarn-over 수(= 빗금 수).
   *   - TR: 기본 2
   *   - DTR: 기본 3
   *   - `tr(N)` 구문으로 N≥4 지정 가능 (네길·다섯길… 긴뜨기)
   */
  yarnOverCount?: number;
  /** 인라인 코멘트 — 각 코별 주의사항 */
  comment?: string;
  /** 인라인 색상 — 배색 도안용 (기호 색상) */
  color?: string;
  /** 원본 AST 노드의 소스 위치 (같은 AST 노드에서 확장된 Op들은 동일 range 공유) */
  sourceRange: SourceRange;
}

/**
 * 한 단(round)에 대한 확장된 Op 리스트 + 집계.
 */
export interface ExpandedRound {
  index: number;
  ops: Op[];
  totalConsume: number;
  totalProduce: number;
  /** 이 단의 작업 방향. 레이아웃 단계에서 사용. 미지정시 'forward' */
  direction?: 'forward' | 'reverse';
}
