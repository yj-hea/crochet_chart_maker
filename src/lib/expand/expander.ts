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

import type { SequenceNode, StitchNode, RepeatNode, SameHoleGroupNode } from '$lib/parser/ast';
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
    } else if (el.type === 'repeat') {
      expandRepeat(el, out);
    } else {
      expandSameHole(el, out);
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

/**
 * `[...]` 한 코 그룹: 그룹 전체가 부모 단 한 코를 공유.
 * 내부 ops를 평탄화한 뒤 첫 소비 op만 consume=1, 나머지는 consume=0 + sameHoleContinuation=true.
 */
function expandSameHole(node: SameHoleGroupNode, out: Op[]): void {
  for (let i = 0; i < node.count; i++) {
    const groupOps: Op[] = [];
    expandSequence(node.body, groupOps);
    let consumed = false;
    for (const op of groupOps) {
      if (!consumed && op.consume > 0) {
        out.push({ ...op, consume: 1, sameHoleContinuation: false, inSameHoleGroup: true });
        consumed = true;
      } else {
        out.push({ ...op, consume: 0, sameHoleContinuation: consumed, inSameHoleGroup: true });
      }
    }
    // 엣지: 소비 op가 하나도 없는 경우 (예: [O]). 그래도 그룹은 부모 1코를 차지하는 것이 자연스러우므로
    // 첫 op를 consume=1로 끌어올린다.
    if (!consumed && groupOps.length > 0) {
      const firstIdx = out.length - groupOps.length;
      const first = out[firstIdx]!;
      out[firstIdx] = { ...first, consume: 1, sameHoleContinuation: false };
    }
  }
}
