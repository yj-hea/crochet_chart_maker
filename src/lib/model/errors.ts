/**
 * 공용 에러 타입 + 소스 위치 표현.
 */

export interface SourceRange {
  start: number; // 0-based character offset (inclusive)
  end: number;   // 0-based character offset (exclusive)
}

export type ParseErrorKind =
  | 'unknown_token'       // 별칭 사전에 없는 토큰
  | 'unexpected_token'    // 문법상 허용되지 않는 위치의 토큰
  | 'unclosed_paren'      // `(` 에 대응하는 `)` 누락
  | 'unopened_paren'      // `)` 앞에 `(` 부재
  | 'unclosed_bracket'    // `[` 에 대응하는 `]` 누락
  | 'unopened_bracket'    // `]` 앞에 `[` 부재
  | 'missing_repeat_count'// `)` 뒤 `*N` 누락 또는 N 부재
  | 'invalid_expansion'   // V/A 외 기호에 `^N` 적용
  | 'invalid_samehole'    // `[...]` 안에 허용되지 않는 기호 (V/A) 또는 중첩 `[`
  | 'empty_samehole'      // `[]` 빈 그룹
  | 'invalid_number';     // 숫자 자리에 숫자 외 토큰

export interface ParseError {
  kind: ParseErrorKind;
  range: SourceRange;
  message: string;
}

export type ValidationErrorKind =
  | 'over_consumed'   // 부모 단의 코 수보다 많이 소비
  | 'under_consumed'  // 부모 단의 코 수보다 적게 소비
  | 'parent_missing'  // 이전 단이 없음 (단 1의 경우는 제외)
  | 'folded_changed'  // 접은 줄(11~25단:)인데 코 수가 변한다
  | 'number_mismatch' // 적어 둔 단 번호가 실제 번호와 다르다
  | 'repeat_missing'; // 되풀이할 단을 앞에서 찾지 못했다

export interface ValidationError {
  kind: ValidationErrorKind;
  roundIndex: number;
  message: string;
  /** 초과의 경우: 초과를 유발한 첫 Op의 AST 소스 위치 (빨간 표시용) */
  offendingRange?: SourceRange;
  /** 경고 성격 — 도안은 그려지지만 확인이 필요한 경우 */
  warning?: boolean;
  expected: number;
  actual: number;
}
