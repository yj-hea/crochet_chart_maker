/**
 * 대바늘 Expander — AST 를 Op 리스트로 평탄화.
 *
 * 코바늘 expander 와 구조는 같지만 footprint 계산이 다르고,
 * `[...]`/`tc()`/`skip()` 노드가 없다 (파서가 만들지 않음).
 */

import type { SequenceNode, StitchNode, RepeatNode } from '$lib/parser/ast';
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
    // 그 외 노드(samehole/tc/skip)는 대바늘 문법에 없다.
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
