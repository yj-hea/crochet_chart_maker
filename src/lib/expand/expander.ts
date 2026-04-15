/**
 * Expander — AST를 평탄화된 Op 리스트로 변환.
 *
 * StitchNode의 count, RepeatNode의 count, V/A의 expansion을 모두 적용하여
 * 실제 뜨는 순서대로의 원자 연산 리스트로 만든다.
 *
 * 예)
 *   "3X"          → [Op(SC), Op(SC), Op(SC)]
 *   "2V^3"        → [Op(INC, exp=3), Op(INC, exp=3)]
 *   "(1X, 1V)*2"  → [Op(SC), Op(INC), Op(SC), Op(INC)]
 */

import type { SequenceNode, StitchNode, RepeatNode } from '$lib/parser/ast';
import type { Op, ExpandedRound } from './op';
import { resolveStitchFootprint } from '$lib/model/stitch';

export function expand(body: SequenceNode, index: number): ExpandedRound {
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
    if (el.type === 'stitch') {
      expandStitch(el, out);
    } else {
      expandRepeat(el, out);
    }
  }
}

function expandStitch(node: StitchNode, out: Op[]): void {
  const { consume, produce } = resolveStitchFootprint(node.kind, node.expansion);
  const expansion = node.expansion ?? 1;
  for (let i = 0; i < node.count; i++) {
    out.push({
      kind: node.kind,
      modifier: node.modifier,
      expansion,
      consume,
      produce,
      sourceRange: node.range,
    });
  }
}

function expandRepeat(node: RepeatNode, out: Op[]): void {
  for (let i = 0; i < node.count; i++) {
    expandSequence(node.body, out);
  }
}
