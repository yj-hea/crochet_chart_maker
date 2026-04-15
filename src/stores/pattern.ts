/**
 * 도안 상태 스토어.
 *
 * 단들의 텍스트 + 파싱 결과를 보관. 각 단의 source가 변경되면 즉시 재파싱·확장.
 */

import { writable } from 'svelte/store';
import { parseRound } from '$lib/parser/parser';
import { expand } from '$lib/expand/expander';
import type { ParsedRound } from '$lib/parser/ast';
import type { ExpandedRound } from '$lib/expand/op';

export type ShapeKind = 'circular' | 'flat';

export interface PatternRoundState {
  /** 안정적인 식별자 (각 단 컴포넌트의 #each key) */
  id: string;
  /** 사용자 입력 원문 */
  source: string;
  /** 파싱 결과 (성공/실패 여부에 관계없이 errors 포함) */
  parsed?: ParsedRound;
  /** 평탄화된 Op 리스트. 파싱 실패 시 lastValid 기반 또는 undefined */
  expanded?: ExpandedRound;
}

export interface PatternState {
  shape: ShapeKind;
  rounds: PatternRoundState[];
}

let idCounter = 0;
function makeId(): string {
  idCounter++;
  return `r${idCounter}_${Date.now().toString(36)}`;
}

function initialState(): PatternState {
  return {
    shape: 'circular',
    rounds: [{ id: makeId(), source: '' }],
  };
}

export const pattern = writable<PatternState>(initialState());

/**
 * 단 하나를 (re)파싱하여 parsed/expanded를 갱신.
 * 점진적 파싱: 본문 파싱 실패 시 lastValid를 expand 입력으로 사용.
 */
function reparse(roundIndex: number, source: string): {
  parsed: ParsedRound;
  expanded: ExpandedRound | undefined;
} {
  const parsed = parseRound(roundIndex, source);
  const tree = parsed.body ?? parsed.lastValid;
  const expanded = tree ? expand(tree, roundIndex) : undefined;
  return { parsed, expanded };
}

/** 모든 단을 재파싱 (인덱스 변경 후에 호출) */
function reparseAll(rounds: PatternRoundState[]): PatternRoundState[] {
  return rounds.map((r, i) => {
    const { parsed, expanded } = reparse(i + 1, r.source);
    return { ...r, parsed, expanded };
  });
}

export function updateRoundSource(id: string, source: string): void {
  pattern.update((p) => {
    const idx = p.rounds.findIndex((r) => r.id === id);
    if (idx < 0) return p;
    const { parsed, expanded } = reparse(idx + 1, source);
    const newRounds = [...p.rounds];
    newRounds[idx] = { ...newRounds[idx]!, source, parsed, expanded };
    return { ...p, rounds: newRounds };
  });
}

export function addRoundAfter(id: string): string {
  let newId = '';
  pattern.update((p) => {
    const idx = p.rounds.findIndex((r) => r.id === id);
    newId = makeId();
    const newRounds = [...p.rounds];
    newRounds.splice(idx + 1, 0, { id: newId, source: '' });
    return { ...p, rounds: reparseAll(newRounds) };
  });
  return newId;
}

/** 맨 끝에 단 추가. 반환값은 새 단의 id (포커스 이동용) */
export function addRoundAtEnd(): string {
  let newId = '';
  pattern.update((p) => {
    newId = makeId();
    const newRounds = [...p.rounds, { id: newId, source: '' }];
    return { ...p, rounds: reparseAll(newRounds) };
  });
  return newId;
}

/** 빈 단 삭제. 위 단으로 포커스 이동을 위해 이전 단의 id 반환 (없으면 빈 문자열) */
export function deleteRound(id: string): string {
  let prevId = '';
  pattern.update((p) => {
    if (p.rounds.length <= 1) return p;
    const idx = p.rounds.findIndex((r) => r.id === id);
    if (idx < 0) return p;
    prevId = idx > 0 ? p.rounds[idx - 1]!.id : '';
    const newRounds = p.rounds.filter((r) => r.id !== id);
    return { ...p, rounds: reparseAll(newRounds) };
  });
  return prevId;
}

export function setShape(shape: ShapeKind): void {
  pattern.update((p) => ({ ...p, shape }));
}
