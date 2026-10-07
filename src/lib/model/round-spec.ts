/**
 * 단 접두어 — 한 줄이 **몇 단을 나타내는지** 적는 표기.
 *
 * 증감 없이 같은 단이 이어질 때 스무 줄을 적는 대신 한 줄로 접는다.
 *
 *   11~25단: k30      → 15단을 한 줄로 (도안에는 `11~25` 로 한 줄만 그린다)
 *   11단: k30         → 그냥 단 번호를 적어 둔 것 (한 단)
 *
 * 번호는 **적어 두는 값**이고 실제 번호는 줄 순서로 계산한다(`round-numbers`).
 * 적은 번호가 계산한 번호와 다르면 경고로 알려 준다 — 위에 단을 끼워 넣으면
 * 번호가 밀리는데, 앱이 사용자의 글을 말없이 고치지는 않는다.
 *
 * ## 자리를 지키며 떼어 내기
 *
 * 접두어는 코 문법이 아니므로 파서에 넘기기 전에 떼어 낸다. 이때 **같은 길이의 공백으로
 * 덮어서**(mask) 넘기면 토크나이저가 공백을 건너뛰므로, 코의 소스 위치가 원본 그대로
 * 유지된다 — 색 편집·코 메모·오류 표시가 전부 원본 좌표를 쓰기 때문이다.
 */

import type { SourceRange } from './errors';

export interface RoundSpec {
  /** 적어 둔 시작 단 번호 */
  from: number;
  /** 적어 둔 끝 단 번호 (범위가 아니면 from 과 같다) */
  to: number;
  /** 이 줄이 나타내는 단 수 (= to - from + 1, 최소 1) */
  span: number;
  /** 접두어가 차지한 자리 */
  range: SourceRange;
  /** 끝 번호가 시작보다 작은 등 뒤집힌 범위 */
  reversed?: boolean;
}

/** `11~25단:` / `11-25:` / `11단:` / `11:` */
const SPEC_RE = /^(\s*)(\d+)(?:\s*[~\-–]\s*(\d+))?\s*단?\s*:\s*/;

export interface ReadResult {
  spec?: RoundSpec;
  /** 접두어를 공백으로 덮은 소스 — 파서에 넘긴다 */
  masked: string;
}

export function readRoundSpec(source: string): ReadResult {
  const m = SPEC_RE.exec(source);
  if (!m) return { masked: source };
  const from = Number(m[2]);
  const to = m[3] === undefined ? from : Number(m[3]);
  if (!Number.isFinite(from) || from < 1) return { masked: source };
  const reversed = to < from;
  const end = m[0].length;
  return {
    spec: {
      from,
      to,
      span: reversed ? 1 : to - from + 1,
      range: { start: m[1]!.length, end },
      ...(reversed ? { reversed: true } : {}),
    },
    masked: ' '.repeat(end) + source.slice(end),
  };
}

/**
 * 앞의 단들을 통째로 되풀이하는 줄 — `1~2단 반복*3`.
 *
 * 무늬를 이루는 단이 계속 반복될 때 한 단 한 단 다시 적지 않는다.
 * 접어 적기(`11~25단:`)와 달리 **모두 그려진다** — 무늬가 보여야 하기 때문.
 */
export interface RoundRepeat {
  /** 되풀이할 단 번호 범위 */
  from: number;
  to: number;
  /** 몇 번 되풀이할지 (기본 1) */
  times: number;
  range: SourceRange;
}

/** `1~2단 반복*3` / `1~2단 반복` / `5단 반복 × 2` */
const REPEAT_RE =
  /^(\s*)(\d+)(?:\s*[~\-–]\s*(\d+))?\s*단\s*반복\s*(?:[*×xX]\s*(\d+))?\s*$/;

export function readRoundRepeat(source: string): RoundRepeat | undefined {
  const m = REPEAT_RE.exec(source);
  if (!m) return undefined;
  const from = Number(m[2]);
  const to = m[3] === undefined ? from : Number(m[3]);
  if (!Number.isFinite(from) || from < 1 || to < from) return undefined;
  const times = m[4] === undefined ? 1 : Number(m[4]);
  if (!Number.isFinite(times) || times < 1) return undefined;
  return { from, to, times, range: { start: m[1]!.length, end: source.length } };
}

/** 이 줄이 나타내는 단 수 */
export function spanOf(spec: RoundSpec | undefined): number {
  return spec?.span ?? 1;
}

/** 접은 줄인지 (여러 단을 한 줄로) */
export function isFolded(spec: RoundSpec | undefined): boolean {
  return spanOf(spec) > 1;
}

/**
 * 계산한 번호로 접두어를 다시 쓴 소스.
 * 번호가 밀렸을 때 한 번에 고치는 용도.
 */
export function rewriteSpec(source: string, startNumber: number): string {
  const { spec } = readRoundSpec(source);
  if (!spec) return source;
  const label = spec.span > 1 ? `${startNumber}~${startNumber + spec.span - 1}단` : `${startNumber}단`;
  return source.slice(0, spec.range.start) + `${label}: ` + source.slice(spec.range.end);
}
