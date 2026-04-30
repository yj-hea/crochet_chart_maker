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

import type { SequenceNode, StitchNode, RepeatNode, SameHoleGroupNode, SkipNode, TcNode } from '$lib/parser/ast';
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
    } else if (el.type === 'skip') {
      expandSkip(el, out);
    } else if (el.type === 'tc') {
      expandTc(el, out);
    } else {
      expandSameHole(el, out);
    }
  }
}

function expandSkip(node: SkipNode, out: Op[]): void {
  out.push({
    kind: 'SKIP',
    expansion: 1,
    consume: node.count,
    produce: 0,
    sourceRange: node.range,
  });
}

/**
 * `tc(...)` 기둥코: 내부 시퀀스를 평탄화한 뒤 그룹 전체를 링 슬롯 1개로 축약.
 * 첫 op: consume=1, produce=1, turningChain=true.
 * 나머지: consume=0, produce=0, turningChain=true, sameHoleContinuation=true.
 * 결과로 기둥에 속한 모든 op 는 turningChain=true 마킹 → 레이아웃에서 세로 스택 처리.
 */
function expandTc(node: TcNode, out: Op[]): void {
  const bodyOps: Op[] = [];
  expandSequence(node.body, bodyOps);
  if (bodyOps.length === 0) return;

  for (let i = 0; i < bodyOps.length; i++) {
    const op = bodyOps[i]!;
    if (i === 0) {
      out.push({
        ...op,
        consume: 1,
        produce: 1,
        sameHoleContinuation: false,
        turningChain: true,
      });
    } else {
      out.push({
        ...op,
        consume: 0,
        produce: 0,
        sameHoleContinuation: true,
        turningChain: true,
      });
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
      baseKind: node.baseKind,
      yarnOverCount: node.yarnOverCount,
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
 * 항상 그룹의 첫 op 를 samehole anchor (consume=1, shc=false) 로 만들고,
 * 나머지는 consume=0, shc=true 로 표시해 같은 부모를 공유하도록 한다.
 *
 * 그룹 내 CHAIN op 는 produce=0 으로 설정 — 장식용 호로 렌더링되므로
 * 링 슬롯도 차지하지 않고 다음 단 부모로도 카운트되지 않는다.
 * 예: `[x, 12ch, x]` → 2 슬롯 (x1, x2), 12 chain 은 두 x 상단을 잇는 호.
 *
 * tc(...) 도 내부에 올 수 있으며 turningChain 플래그는 tc 확장 시 이미 설정되어 있음.
 */
function expandSameHole(node: SameHoleGroupNode, out: Op[]): void {
  if (node.groupKind === 'bridge') {
    expandBridge(node, out);
    return;
  }
  for (let i = 0; i < node.count; i++) {
    const groupOps: Op[] = [];
    expandSequence(node.body, groupOps);
    if (groupOps.length === 0) continue;

    for (let k = 0; k < groupOps.length; k++) {
      const op = groupOps[k]!;
      const isChain = op.kind === 'CHAIN';
      const effectiveProduce = isChain ? 0 : op.produce;
      if (k === 0) {
        // 첫 op 는 그룹의 앵커 — consume 을 1 로 승격 (chain 등 consume=0 도 포함)
        out.push({
          ...op,
          consume: 1,
          produce: effectiveProduce,
          sameHoleContinuation: false,
          inSameHoleGroup: true,
        });
      } else {
        out.push({
          ...op,
          consume: 0,
          produce: effectiveProduce,
          sameHoleContinuation: true,
          inSameHoleGroup: true,
        });
      }
    }
  }
}

/**
 * 체인 브릿지 그룹 `[NO, skip(M)]` 확장:
 *   N 개의 CHAIN op (consume=0, produce=0, inBridge=true) +
 *   1 개의 BRIDGE_ANCHOR op (consume=M, produce=1, inBridge=true).
 *
 * AST 본문 안의 사슬/skip 순서와 무관하게 항상 "사슬 N + 앵커 1" 순서로 emit.
 * group count > 1 인 경우 (예: `3[5O, skip(3)]`) 패턴을 N 번 반복.
 */
function expandBridge(node: SameHoleGroupNode, out: Op[]): void {
  let chainTotal = 0;
  let skipTotal = 0;
  for (const el of node.body.elements) {
    if (el.type === 'stitch' && el.kind === 'CHAIN') chainTotal += el.count;
    else if (el.type === 'skip') skipTotal += el.count;
  }
  if (skipTotal === 0) return; // 파서가 보장하지만 방어적 가드.

  for (let i = 0; i < node.count; i++) {
    for (let k = 0; k < chainTotal; k++) {
      out.push({
        kind: 'CHAIN',
        expansion: 1,
        consume: 0,
        produce: 0,
        inBridge: true,
        sourceRange: node.range,
      });
    }
    out.push({
      kind: 'BRIDGE_ANCHOR',
      expansion: 1,
      consume: skipTotal,
      produce: 1,
      inBridge: true,
      sourceRange: node.range,
    });
  }
}
