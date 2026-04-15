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
  | 'parent_missing'; // 이전 단이 없음 (단 1의 경우는 제외)

export interface ValidationError {
  kind: ValidationErrorKind;
  roundIndex: number;
  message: string;
  /** 초과의 경우: 초과를 유발한 첫 Op의 AST 소스 위치 (빨간 표시용) */
  offendingRange?: SourceRange;
  expected: number;
  actual: number;
}
