/**
 * 대바늘 Expander — AST 를 Op 리스트로 평탄화.
 *
 * 코바늘 expander 와 구조는 같지만 footprint 계산이 다르고,
 * `tc()`/`skip()` 노드가 없다 (파서가 만들지 않음).
 *
 * `[...]`(한 코에 여러 번 뜨기)는 코바늘 `[...]` 와 같은 모양으로 푼다 —
 * 그룹에서 **처음 코에 바늘을 넣는 코** 하나만 부모 코를 소비하고(1 → 1),
 * 나머지는 같은 코에서 이어 나온 코라 부모를 소비하지 않는다(0 → 1).
 * 격자에서는 이 이어 나온 코들 아래에 `yo`·`m1l` 처럼 빈칸이 생긴다.
 */

import type { SequenceNode, StitchNode, RepeatNode, SameHoleGroupNode } from '$lib/parser/ast';
import type { Op, ExpandedRound } from '$lib/expand/op';
import { resolveKnitFootprint } from './stitch';

export function expandKnit(body: SequenceNode, index: number): ExpandedRound {
  const ops: Op[] = [];
  expandSequence(body, ops);

  let totalConsume = 0;
  let totalProduce = 0;
  for (const op of ops) {
    totalConsume += op.consume;
    totalProduce += op.produce;
  }
  return { index, ops, totalConsume, totalProduce };
}

function expandSequence(node: SequenceNode, out: Op[]): void {
  for (const el of node.elements) {
    if (el.type === 'stitch') expandStitch(el, out);
    else if (el.type === 'repeat') expandRepeat(el, out);
    else if (el.type === 'samehole') expandSameStitch(el, out);
    // 그 외 노드(tc/skip)는 대바늘 문법에 없다.
  }
}

function expandStitch(node: StitchNode, out: Op[]): void {
  const { consume, produce } = resolveKnitFootprint(node.kind, node.expansion);
  const expansion = node.expansion ?? 1;
  for (let i = 0; i < node.count; i++) {
    out.push({
      kind: node.kind,
      expansion,
      consume,
      produce,
      comment: node.comment,
      color: node.color,
      sourceRange: node.range,
    });
  }
}

function expandRepeat(node: RepeatNode, out: Op[]): void {
  for (let i = 0; i < node.count; i++) {
    expandSequence(node.body, out);
  }
}

function expandSameStitch(node: SameHoleGroupNode, out: Op[]): void {
  for (let i = 0; i < node.count; i++) {
    const group: Op[] = [];
    expandSequence(node.body, group);
    // 파서가 "코에 뜨는 기호가 하나 이상" 을 보장한다 — 그 첫 코가 부모를 소비한다
    const anchor = group.findIndex((op) => op.consume > 0);
    group.forEach((op, idx) => {
      out.push({
        ...op,
        consume: idx === anchor ? 1 : 0,
        inSameHoleGroup: true,
        sameHoleContinuation: idx !== anchor,
      });
    });
  }
}
