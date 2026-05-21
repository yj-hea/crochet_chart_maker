/**
 * 원형 도안 레이아웃.
 *
 * 핵심 원칙:
 *   - 각 Op은 정확히 1개의 PositionedStitch를 생성한다.
 *   - 단의 "슬롯"은 단의 totalProduce(생성 코 수)와 같다. 슬롯들은 원주에 균등 각도로 분포.
 *   - 일반 코는 1 슬롯, V(INC^N)는 N 슬롯, A(DEC^N)는 1 슬롯.
 *   - 코 종류별 반지름이 다르다: relativeHeight에 비례 (SC=1.0, DC=2.0 등).
 *   - 사슬(CHAIN) run은 양쪽 anchor 사이를 잇는 안쪽 호(arc)로 재배치.
 */

import type { ExpandedRound, Op } from '$lib/expand/op';
import type { PositionedStitch, Point, LayoutResult, RoundMarker } from './types';
import { FIRST_RING_RADIUS } from './constants';
import { STITCH_META } from '$lib/model/stitch';
import { computeBounds, markerFarPoint } from './bounds';

const MARKER_SIDE_OFFSET = 11;
const START_ANGLE = -Math.PI / 2; // 12시 방향

/** 단 방향에 해당하는 부호. forward=CCW(-1), reverse=CW(+1) */
function directionSign(dir: 'forward' | 'reverse' | undefined): 1 | -1 {
  return dir === 'reverse' ? 1 : -1;
}

export interface CircularOptions {
  stitchArc?: number;
  minRadius?: number;
  /**
   * 세로 (반경) 정렬.
   *  - 'same': 같은 단의 코들이 동일 baseRadius (기본).
   *  - 'even': 각 코가 부모 반경 + 부모/자기 halfH + gap. 같은 단도 다른 반경 가능.
   */
  vAlign?: 'same' | 'even';
  /**
   * Cascade — 부모 angular 위치 따라 자식 배치.
   *  - true (기본): 1:1 → 부모 angle, V → 부모 territory 분할, DEC/bridge → 부모 angle 평균.
   *  - false: 각 단을 균등 angular 간격으로 배치 (legacy).
   */
  cascade?: boolean;
}

const RADIAL_GAP = 12; // 'even' 모드에서 부모 바깥 끝 ↔ 자식 안쪽 끝 사이 빈 반경 간격.

interface SlotPos { angle: number; width: number; }

function meanAngle(angles: number[]): number {
  if (angles.length === 0) return 0;
  if (angles.length === 1) return angles[0]!;
  let sx = 0, sy = 0;
  for (const a of angles) { sx += Math.cos(a); sy += Math.sin(a); }
  return Math.atan2(sy, sx);
}

export function layoutCircular(
  rounds: ExpandedRound[],
  opts: CircularOptions = {},
): LayoutResult {
  const vAlign: 'same' | 'even' = opts.vAlign ?? 'same';
  const cascade: boolean = opts.cascade ?? true;

  // 1단 내용 따라 첫 ring 반경 적응. 상수보다 코 수/높이 기준이 더 자연스러움.
  const FIRST_INNER_PAD = 8; // 가운데 magic ring/빈 공간.
  const FIRST_MIN_SLOT_SPACING = 20; // 1단 내 코 사이 최소 chord-arc 간격.
  const round1 = rounds[0];
  const firstSlots = round1?.ops.reduce((s, op) => s + visualProduceFor(op), 0) ?? 0;
  const firstMaxH = round1
    ? round1.ops.reduce((m, op) => op.kind === 'MAGIC' ? m : Math.max(m, effectiveSymH(op)), 5)
    : 5;
  const firstCircumBased = firstSlots > 0
    ? (firstSlots * FIRST_MIN_SLOT_SPACING) / (2 * Math.PI)
    : 0;
  const firstHeightBased = firstMaxH + FIRST_INNER_PAD;
  const minRadius = opts.minRadius ?? Math.max(firstCircumBased, firstHeightBased, 12);

  // 1) 각 단의 슬롯 수(시각 기준), baseRadius 사전 계산.
  const slotCountByRound = new Map<number, number>();
  const baseRadiusByRound = new Map<number, number>();
  let currentBase = minRadius;

  for (let rIdx = 0; rIdx < rounds.length; rIdx++) {
    const round = rounds[rIdx]!;
    const slots = round.ops.reduce((sum, op) => sum + visualProduceFor(op), 0);
    slotCountByRound.set(round.index, slots);
    baseRadiusByRound.set(round.index, currentBase);

    // 다음 단의 baseRadius 결정.
    const MIN_RING_SPACING = 32;
    const ROUND_GAP = 25;
    const MIN_SLOT_SPACING = 16; // 인접 코 사이 chord-arc 최소 간격 (px) — V 심볼 너비 ~16 에 맞춤.
    const maxSymH = round.ops.reduce((max, op) => {
      if (op.kind === 'MAGIC') return max;
      return Math.max(max, effectiveSymH(op));
    }, 5);
    const heightBased = Math.max(maxSymH * 2 + ROUND_GAP, MIN_RING_SPACING);

    // 다음 단의 슬롯 수가 많으면 원주가 충분하도록 반지름 보장 (균등 분포 가정).
    const nextRound = rounds[rIdx + 1];
    const nextSlots = nextRound
      ? nextRound.ops.reduce((s, op) => s + visualProduceFor(op), 0)
      : 0;
    const circumBased = nextSlots > 0
      ? Math.max(0, (nextSlots * MIN_SLOT_SPACING) / (2 * Math.PI) - currentBase)
      : 0;

    currentBase += Math.max(heightBased, circumBased);
  }

  // 2) 각 단 배치
  const stitches: PositionedStitch[] = [];
  const roundMarkers: RoundMarker[] = [];
  const slotMapByRound = new Map<number, number[]>();
  const slotPosByRound = new Map<number, SlotPos[]>();

  for (const round of rounds) {
    placeRound(round, stitches, slotMapByRound, baseRadiusByRound, slotCountByRound, roundMarkers, vAlign, cascade, slotPosByRound);
  }

  // 3) `[^...]` 기둥코 후처리 — 세로 스택으로 쌓기
  repositionTurningChainColumns(stitches);

  // 4) 사슬 호: 연속된 CHAIN 만 대상, top-to-top anchor (기둥코는 제외)
  repositionChainArcs(stitches);

  // 5) 마커 위치 재계산 (후처리로 stitch 위치가 바뀌었을 수 있음)
  for (const m of roundMarkers) {
    const mExt = m as RoundMarker & { _stitchIdx?: number };
    if (mExt._stitchIdx !== undefined) {
      const s = stitches[mExt._stitchIdx]!;
      m.position = { x: s.position.x + MARKER_SIDE_OFFSET, y: s.position.y };
      delete mExt._stitchIdx;
    }
  }

  // 6) 바운딩 + 그리드 가이드 — stitch 기호 extent (±symH) 까지 포함해야
  // arc 로 멀리 뻗은 chain 이나 키 큰 T/F/E 가 잘리지 않음.
  const extentPoints: Point[] = [];
  for (const s of stitches) {
    const symH = effectiveSymH(s.op);
    extentPoints.push(
      { x: s.position.x + symH, y: s.position.y + symH },
      { x: s.position.x + symH, y: s.position.y - symH },
      { x: s.position.x - symH, y: s.position.y + symH },
      { x: s.position.x - symH, y: s.position.y - symH },
    );
  }
  const bounds = computeBounds([
    ...extentPoints,
    ...roundMarkers.map((m) => m.position),
    ...roundMarkers.map(markerFarPoint),
  ]);

  const ringRadii: number[] = [];
  for (const round of rounds) {
    const n = slotCountByRound.get(round.index) ?? 0;
    if (n > 0) ringRadii.push(baseRadiusByRound.get(round.index) ?? 0);
  }
  const sectorCount = ringRadii.length === 0
    ? 0
    : (() => {
        for (const r of rounds) {
          const n = slotCountByRound.get(r.index) ?? 0;
          if (n > 0) return n;
        }
        return 0;
      })();

  return {
    stitches,
    bounds,
    gridGuide: { type: 'concentric', ringRadii, sectorCount },
    roundMarkers,
  };
}

/** op 의 실제 심볼 반높이. V/A 에 baseKind 있으면 그 stitch 의 높이 사용. TR/DTR 의 yarnOverCount 도 반영. */
function effectiveSymH(op: Op): number {
  const isIncDec = op.kind === 'INC' || op.kind === 'DEC';
  const baseKind = isIncDec && op.baseKind ? op.baseKind : op.kind;
  if ((baseKind === 'TR' || baseKind === 'DTR') && op.yarnOverCount && op.yarnOverCount >= 2) {
    return 9 + 2 * (op.yarnOverCount - 1);
  }
  return STITCH_META[baseKind].symbolHalfHeight;
}

/**
 * op 가 링에서 차지하는 시각적 슬롯 수 = max(produce, consume).
 * MAGIC, 장식 (chain/tc cont, produce=0 && consume=0) 은 0.
 * SKIP (produce=0, consume=1) 은 1 슬롯 (자리 차지) — 다음 단으로는 노출 X.
 */
function visualProduceFor(op: Op): number {
  if (op.kind === 'MAGIC') return 0;
  if (op.produce === 0 && op.consume === 0) return 0;
  return Math.max(op.produce, op.consume);
}

/** 기호 하단이 baseRadius에 맞도록 심볼 반높이만큼 밀어냄 */
function stitchRadius(baseRadius: number, op: Op): number {
  return baseRadius + effectiveSymH(op);
}

/** stitch 의 바깥 끝까지 거리 — center 반경 + 자기 halfH. */
function stitchOuterRadius(s: PositionedStitch): number {
  const r = Math.sqrt(s.position.x * s.position.x + s.position.y * s.position.y);
  return r + effectiveSymH(s.op);
}

function placeRound(
  round: ExpandedRound,
  stitches: PositionedStitch[],
  slotMapByRound: Map<number, number[]>,
  baseRadiusByRound: Map<number, number>,
  slotCountByRound: Map<number, number>,
  roundMarkers: RoundMarker[],
  vAlign: 'same' | 'even',
  cascade: boolean,
  slotPosByRound: Map<number, SlotPos[]>,
): void {
  const { index: roundIdx } = round;
  const ringSlots = slotCountByRound.get(roundIdx) ?? 0;
  const baseRadius = baseRadiusByRound.get(roundIdx) ?? FIRST_RING_RADIUS;
  const dirSign = directionSign(round.direction);

  const parentSlotMap = slotMapByRound.get(roundIdx - 1) ?? [];
  const prevSlotPos = slotPosByRound.get(roundIdx - 1) ?? [];
  // 이전 단의 슬롯 위치가 있을 때만 cascade 활성 — 1단 / cascade off 면 균등 angular.
  const useCascade = cascade && prevSlotPos.length > 0;
  const thisStitchIndices: number[] = [];
  const thisSlotPos: SlotPos[] = [];
  let parentCursor = 0;
  let slotCursor = 0;
  let lastGroupParents: number[] = [];
  let lastGroupConsumeSlots: SlotPos[] = [];
  // 같은 단 standalone chain 들의 produce slot 큐 + 자기 슬롯 위치. 다음 op 가 prev 단보다
  // 먼저 여기서 consume — `Nch, Mx` → Mx 가 chain 위에 코.
  const chainQueueIdx: number[] = []; // stitches[] 인덱스
  const chainQueuePos: SlotPos[] = []; // cascade ON 시 부모 각도 정보
  const consumedChains = new Set<number>();

  // 같은 [...] 그룹 처리 컨텍스트 (cascade ON): 그룹 territory 를 producing member 수로 분할.
  let sameHoleCtx: {
    territoryWidth: number;
    groupCenter: number;
    produceMembers: number;
    producedCount: number;
  } | null = null;

  for (const op of round.ops) {
    if (op.kind === 'MAGIC') {
      const idx = stitches.length;
      stitches.push({
        op, roundIndex: roundIdx,
        position: { x: 0, y: 0 }, angle: 0,
        parentIndices: [], exposedSlots: 0,
      });
      thisStitchIndices.push(idx);
      continue;
    }

    // SKIP: 부모 N개 건너뜀. chain 큐 우선 (= chain 위에 안 뜨고 장식만 남김), 비면 prev 단.
    if (op.kind === 'SKIP') {
      const skipParents: number[] = [];
      let consumedFromChainQueue = false;
      for (let k = 0; k < op.consume; k++) {
        if (chainQueueIdx.length > 0) {
          const cIdx = chainQueueIdx.shift()!;
          chainQueuePos.shift();
          skipParents.push(cIdx);
          consumedChains.add(cIdx);
          consumedFromChainQueue = true;
        } else {
          const p = parentSlotMap[parentCursor];
          if (p !== undefined) skipParents.push(p);
          parentCursor++;
        }
      }

      // 건너뛴 부모들의 평균 각도, prev 단 consume 시 중간 반경 / chain queue consume 시 chain 위.
      let sumX = 0, sumY = 0;
      for (const pi of skipParents) {
        sumX += stitches[pi]!.position.x;
        sumY += stitches[pi]!.position.y;
      }
      const nParents = skipParents.length;
      const prevBase = baseRadiusByRound.get(roundIdx - 1) ?? 0;
      let midR: number;
      if (consumedFromChainQueue && skipParents.length > 0) {
        // chain 위에 SKIP — X-on-chain 과 동일 layer (chain outerR + gap + halfH).
        const parent = stitches[skipParents[0]!]!;
        midR = stitchOuterRadius(parent) + RADIAL_GAP + effectiveSymH(op);
      } else {
        midR = nParents > 0 ? (prevBase + baseRadius) / 2 : baseRadius;
      }
      let pos: Point;
      let markerAngle = START_ANGLE;
      if (nParents > 0) {
        const cx = sumX / nParents;
        const cy = sumY / nParents;
        const d = Math.sqrt(cx * cx + cy * cy);
        if (d > 0.001) {
          pos = { x: (cx * midR) / d, y: (cy * midR) / d };
          markerAngle = Math.atan2(pos.y, pos.x);
        } else {
          pos = polarToCartesian(midR, START_ANGLE);
        }
      } else {
        pos = polarToCartesian(midR, START_ANGLE);
      }

      const idx = stitches.length;
      stitches.push({
        op, roundIndex: roundIdx,
        position: pos, angle: markerAngle + Math.PI / 2,
        parentIndices: skipParents, exposedSlots: 0,
      });
      thisStitchIndices.push(idx);
      // SKIP 도 ringSlots 에 1 칸 차지 — slotCursor 를 advance 시켜 다음 op 들의 slot index 가
      // 어긋나지 않게.
      slotCursor += visualProduceFor(op);
      continue;
    }

    let parents: number[];
    let consumeSlots: SlotPos[];
    if (op.sameHoleContinuation) {
      parents = lastGroupParents;
      consumeSlots = lastGroupConsumeSlots;
    } else {
      parents = [];
      consumeSlots = [];
      for (let k = 0; k < op.consume; k++) {
        if (chainQueueIdx.length > 0) {
          const cIdx = chainQueueIdx.shift()!;
          const cPos = chainQueuePos.shift();
          parents.push(cIdx);
          consumedChains.add(cIdx);
          if (useCascade && cPos) consumeSlots.push(cPos);
        } else {
          const p = parentSlotMap[parentCursor];
          if (p !== undefined) parents.push(p);
          if (useCascade) {
            const sp = prevSlotPos[parentCursor];
            if (sp) consumeSlots.push(sp);
          }
          parentCursor++;
        }
      }
      lastGroupParents = parents;
      lastGroupConsumeSlots = consumeSlots;
    }

    // samehole 그룹 anchor: 그룹 territory 산정 + producing member 수 미리 카운트.
    if (useCascade && op.inSameHoleGroup && !op.sameHoleContinuation) {
      const territoryWidth = consumeSlots.reduce((s, p) => s + p.width, 0);
      const groupCenter = consumeSlots.length > 0 ? meanAngle(consumeSlots.map(p => p.angle)) : 0;
      const opIdxLocal = round.ops.indexOf(op);
      let pm = 0;
      for (let k = opIdxLocal; k < round.ops.length; k++) {
        const o = round.ops[k]!;
        if (k > opIdxLocal && (!o.sameHoleContinuation || !o.inSameHoleGroup)) break;
        if (o.produce > 0) pm++;
      }
      sameHoleCtx = { territoryWidth, groupCenter, produceMembers: Math.max(1, pm), producedCount: 0 };
    } else if (!op.inSameHoleGroup) {
      sameHoleCtx = null;
    }

    const vSlots = visualProduceFor(op);

    // op 의 visual angle 결정 + 다음 단을 위한 produce slot 위치 산출.
    let midAngle: number;
    const producePositions: SlotPos[] = [];
    if (useCascade) {
      if (op.inSameHoleGroup && sameHoleCtx) {
        const ctx = sameHoleCtx;
        if (op.produce > 0) {
          const subW = ctx.territoryWidth / ctx.produceMembers;
          // forward (dirSign=-1) 일 때 sub 0 이 가장 높은 angle (CCW 시작) 에 위치하도록.
          midAngle = ctx.groupCenter + dirSign * (subW * (ctx.producedCount + 0.5) - ctx.territoryWidth / 2);
          if (op.produce === 1) {
            producePositions.push({ angle: midAngle, width: subW });
          } else {
            const ssW = subW / op.produce;
            for (let k = 0; k < op.produce; k++) {
              producePositions.push({ angle: midAngle + dirSign * (ssW * (k + 0.5) - subW / 2), width: ssW });
            }
          }
          ctx.producedCount++;
        } else {
          // 장식 chain cont — 그룹 center 에 임시 배치, arc 후처리가 최종 위치 결정.
          midAngle = ctx.groupCenter;
        }
      } else if (consumeSlots.length === 1) {
        const cs = consumeSlots[0]!;
        midAngle = cs.angle;
        if (op.produce === 1) {
          producePositions.push({ angle: midAngle, width: cs.width });
        } else if (op.produce > 1) {
          // V (1 consume, N produce): consume slot 을 N 등분 — forward 시 sub 0 이 높은 angle.
          const subW = cs.width / op.produce;
          for (let k = 0; k < op.produce; k++) {
            producePositions.push({ angle: midAngle + dirSign * (subW * (k + 0.5) - cs.width / 2), width: subW });
          }
        }
      } else if (consumeSlots.length > 1) {
        // DEC / bridge: 부모 angle 평균.
        midAngle = meanAngle(consumeSlots.map(p => p.angle));
        const sumW = consumeSlots.reduce((s, p) => s + p.width, 0);
        if (op.produce === 1) {
          producePositions.push({ angle: midAngle, width: sumW });
        } else if (op.produce > 1) {
          const subW = sumW / op.produce;
          for (let k = 0; k < op.produce; k++) {
            producePositions.push({ angle: midAngle + dirSign * (subW * (k + 0.5) - sumW / 2), width: subW });
          }
        }
      } else {
        // 부모 슬롯 없음 (standalone chain 등). 직전 visible op 의 angle 에서 작은 step (= chain 너비
        // 기준 MIN_CHORD/r) 만큼 떨어진 위치에 배치 — 뒤따르는 prev-consume op 와 충돌 방지.
        const sliceW = ringSlots > 0 ? 2 * Math.PI / ringSlots : 0;
        let prevVisible: PositionedStitch | undefined;
        for (let p = thisStitchIndices.length - 1; p >= 0; p--) {
          const cand = stitches[thisStitchIndices[p]!]!;
          if (cand.op.kind === 'MAGIC') continue;
          prevVisible = cand;
          break;
        }
        // chain step: chord 16px (sym 너비) ÷ 자기 단 baseRadius ≈ 7° at typical scale.
        // sliceW 보다 좁아 chain run 이 압축되게 배치 — 뒤에 prev-consume op 들이 들어갈 공간 확보.
        const stitchR = baseRadius + effectiveSymH(op);
        const chainStep = Math.min(sliceW, 16 / Math.max(stitchR, 1));
        if (prevVisible) {
          const prevA = Math.atan2(prevVisible.position.y, prevVisible.position.x);
          midAngle = prevA + dirSign * chainStep;
        } else {
          const startSlot = slotCursor;
          const endSlot = slotCursor + Math.max(1, vSlots) - 1;
          midAngle = (angleAt(startSlot, ringSlots, dirSign) + angleAt(endSlot, ringSlots, dirSign)) / 2;
        }
        for (let k = 0; k < op.produce; k++) {
          producePositions.push({ angle: midAngle + dirSign * chainStep * k, width: chainStep });
        }
      }
    } else {
      // cascade off: 균등 angular.
      const startSlot = slotCursor;
      const endSlot = slotCursor + Math.max(1, vSlots) - 1;
      midAngle = (angleAt(startSlot, ringSlots, dirSign) + angleAt(endSlot, ringSlots, dirSign)) / 2;
      const sliceW = ringSlots > 0 ? 2 * Math.PI / ringSlots : 0;
      for (let k = 0; k < op.produce; k++) {
        producePositions.push({ angle: angleAt(slotCursor + k, ringSlots, dirSign), width: sliceW });
      }
    }

    // 링 슬롯을 차지하지 않는 op (예: 기둥코/사슬 continuation). 부모/그룹 angle 옆에 임시 배치 — 후처리에서 이동.
    if (vSlots === 0) {
      const r = baseRadius + STITCH_META[op.kind].symbolHalfHeight;
      const angOff = op.sameHoleContinuation ? 0.04 : 0;
      const a = midAngle + angOff;
      const pos = polarToCartesian(r, a);
      const idx = stitches.length;
      stitches.push({
        op, roundIndex: roundIdx,
        position: pos, angle: a + Math.PI / 2,
        parentIndices: parents, exposedSlots: 0,
      });
      thisStitchIndices.push(idx);
      // produce slots: 보통 0 이지만 혹시 있으면 추가 (있을 일 거의 없음).
      for (const sp of producePositions) thisSlotPos.push(sp);
      continue;
    }

    // 같은 단 chain 을 부모로 가진 producing op (= chain 위에 뜨는 코) — chain 바깥으로 stack.
    const inRoundParents = parents.filter((p) => stitches[p]!.roundIndex === roundIdx);
    // SKIP 은 이미 위 분기에서 처리되어 여기 안 옴.
    const stackOnInRoundChain = inRoundParents.length > 0 && op.produce > 0;

    // 'even' 모드: 부모 (가장 바깥) 반경 + 부모/자기 halfH + gap. 부모 없으면 baseRadius 사용.
    let r: number;
    if (stackOnInRoundChain) {
      const parent = stitches[inRoundParents[0]!]!;
      r = stitchOuterRadius(parent) + RADIAL_GAP + effectiveSymH(op);
      // angle 도 부모 따라가기 — alignChildToParents 없으니 직접.
      midAngle = Math.atan2(parent.position.y, parent.position.x);
    } else if (vAlign === 'even' && parents.length > 0) {
      let topParentIdx = parents[0]!;
      let topParentR = stitchOuterRadius(stitches[topParentIdx]!);
      for (let k = 1; k < parents.length; k++) {
        const pr = stitchOuterRadius(stitches[parents[k]!]!);
        if (pr > topParentR) { topParentR = pr; topParentIdx = parents[k]!; }
      }
      r = topParentR + RADIAL_GAP + effectiveSymH(op);
    } else {
      r = stitchRadius(baseRadius, op);
    }
    const pos = polarToCartesian(r, midAngle);

    // V/A 는 부모 방향에 맞춰 기울이기 (연결선 각도와 일치)
    let symbolAngle = midAngle + Math.PI / 2;
    if ((op.kind === 'INC' || op.kind === 'DEC') && parents.length > 0) {
      let pxSum = 0, pySum = 0;
      for (const pi of parents) {
        pxSum += stitches[pi]!.position.x;
        pySum += stitches[pi]!.position.y;
      }
      const parentMid = { x: pxSum / parents.length, y: pySum / parents.length };
      const dx = parentMid.x - pos.x;
      const dy = parentMid.y - pos.y;
      symbolAngle = Math.atan2(dy, dx) - Math.PI / 2;
    }

    // exposedSlots 는 다음 단 부모 매핑용 — 실제 produce 기준. SLIP 은 시각 슬롯 1개지만 produce=0.
    const idx = stitches.length;
    const newStitch: PositionedStitch = {
      op, roundIndex: roundIdx,
      position: pos, angle: symbolAngle,
      parentIndices: parents, exposedSlots: op.produce,
    };
    // chain samehole anchor 의 부모 territory 경계 — 사슬 호 재배치가 사용.
    if (
      op.kind === 'CHAIN' &&
      op.inSameHoleGroup &&
      !op.sameHoleContinuation &&
      parents.length > 0
    ) {
      const firstP = stitches[parents[0]!]!;
      const lastP = stitches[parents[parents.length - 1]!]!;
      let firstSW: number, lastSW: number;
      if (useCascade && consumeSlots.length > 0) {
        firstSW = consumeSlots[0]!.width;
        lastSW = consumeSlots[consumeSlots.length - 1]!.width;
      } else {
        const prevRing = slotCountByRound.get(roundIdx - 1) ?? 0;
        const uniformW = prevRing > 0 ? 2 * Math.PI / prevRing : 0;
        firstSW = uniformW;
        lastSW = uniformW;
      }
      const firstA = Math.atan2(firstP.position.y, firstP.position.x);
      const lastA = Math.atan2(lastP.position.y, lastP.position.x);
      // chord 좌(= 진행 방향 시작) = 첫 부모의 진행-반대 방향 edge.
      // 진행: forward dirSign=-1 (CCW, 각도 감소). leftEdge = firstAngle - dirSign * sw/2.
      const leftA = firstA - dirSign * firstSW / 2;
      const rightA = lastA + dirSign * lastSW / 2;
      // bezier 끝점 radius = 사슬 anchor 자기 radius (= 현재 단 ring level). 부모 단 outer 가
      // 아니라 자기 단 radius 를 써야 호가 이전 단 영역으로 내려가지 않음.
      const anchorR = Math.sqrt(pos.x * pos.x + pos.y * pos.y);
      newStitch.chainArcBounds = {
        left: polarToCartesian(anchorR, leftA),
        right: polarToCartesian(anchorR, rightA),
      };
    }
    stitches.push(newStitch);
    thisStitchIndices.push(idx);
    for (const sp of producePositions) thisSlotPos.push(sp);
    slotCursor += vSlots;
    // standalone CHAIN (samehole/turning chain 아님) 의 produce 를 chain queue 에 push.
    if (
      op.kind === 'CHAIN' &&
      !op.inSameHoleGroup &&
      !op.turningChain &&
      op.produce > 0
    ) {
      for (let k = 0; k < op.produce; k++) {
        chainQueueIdx.push(idx);
        const sp = producePositions[k];
        if (sp) chainQueuePos.push(sp);
      }
    }
  }

  // 부모 없는 standalone chain (consume=0) 의 반경을 같은 단의 다음 (없으면 이전) 코로 맞춤.
  // 같은 단에서 위에 코가 떠진 chain (consumedChains) 은 stack 된 자식과 r 충돌하므로 제외.
  // even 모드에서 기준 부모가 없어 default grid 위치에 남는 문제 해결.
  for (let i = 0; i < thisStitchIndices.length; i++) {
    const s = stitches[thisStitchIndices[i]!]!;
    if (s.op.kind !== 'CHAIN' || s.parentIndices.length > 0) continue;
    if (consumedChains.has(thisStitchIndices[i]!)) continue;
    let neighbor: PositionedStitch | undefined;
    for (let j = i + 1; j < thisStitchIndices.length; j++) {
      const t = stitches[thisStitchIndices[j]!]!;
      if (t.op.kind === 'MAGIC' || t.op.kind === 'SKIP') continue;
      if (t.op.kind === 'CHAIN' && t.parentIndices.length === 0) continue;
      neighbor = t;
      break;
    }
    if (!neighbor) {
      for (let j = i - 1; j >= 0; j--) {
        const t = stitches[thisStitchIndices[j]!]!;
        if (t.op.kind === 'MAGIC' || t.op.kind === 'SKIP') continue;
        if (t.op.kind === 'CHAIN' && t.parentIndices.length === 0) continue;
        neighbor = t;
        break;
      }
    }
    if (!neighbor) continue;
    const newR = Math.sqrt(neighbor.position.x ** 2 + neighbor.position.y ** 2);
    const a = Math.atan2(s.position.y, s.position.x);
    s.position = polarToCartesian(newR, a);
  }

  // chain run 의 angular 재분배 — chain 그룹 (consumed + decoration) 을 인접 non-chain op 사이
  // angular span 에 균등 분포. consumed chain 위에 stack 된 sc 의 angle 도 함께 sync.
  for (let i = 0; i < thisStitchIndices.length; ) {
    const startIdx = thisStitchIndices[i]!;
    const start = stitches[startIdx]!;
    if (start.op.kind !== 'CHAIN' || start.op.inSameHoleGroup || start.op.turningChain || start.parentIndices.length > 0) {
      i++; continue;
    }
    // 연속 chain run 수집.
    const runIndices: number[] = [];
    let j = i;
    while (j < thisStitchIndices.length) {
      const sIdx = thisStitchIndices[j]!;
      const s = stitches[sIdx]!;
      if (s.op.kind === 'CHAIN' && !s.op.inSameHoleGroup && !s.op.turningChain && s.parentIndices.length === 0) {
        runIndices.push(sIdx);
        j++;
      } else break;
    }
    // prev/next visible non-chain (skip/magic 도 제외) anchor.
    let prevA: number | null = null;
    for (let p = i - 1; p >= 0; p--) {
      const cand = stitches[thisStitchIndices[p]!]!;
      if (cand.op.kind === 'MAGIC' || cand.op.kind === 'SKIP') continue;
      if (cand.op.kind === 'CHAIN') continue;
      prevA = Math.atan2(cand.position.y, cand.position.x);
      break;
    }
    let nextA: number | null = null;
    for (let p = j; p < thisStitchIndices.length; p++) {
      const cand = stitches[thisStitchIndices[p]!]!;
      if (cand.op.kind === 'MAGIC' || cand.op.kind === 'SKIP') continue;
      if (cand.op.kind === 'CHAIN') continue;
      // chain-as-parent stack 된 sc 도 chain run 의 자식이라 anchor 후보 X.
      if (cand.parentIndices.some((pp) => stitches[pp]!.roundIndex === cand.roundIndex)) continue;
      nextA = Math.atan2(cand.position.y, cand.position.x);
      break;
    }
    if (prevA !== null && nextA !== null) {
      // prev → next dirSign 방향 span 을 (run 길이 + 1) 등분 후 chain 들을 1..run 위치에.
      let span = dirSign * (nextA - prevA);
      while (span < 0) span += 2 * Math.PI;
      while (span > 2 * Math.PI) span -= 2 * Math.PI;
      const step = span / (runIndices.length + 1);
      for (let k = 0; k < runIndices.length; k++) {
        const chainIdx = runIndices[k]!;
        const ch = stitches[chainIdx]!;
        const newA = prevA + dirSign * step * (k + 1);
        const chR = Math.sqrt(ch.position.x ** 2 + ch.position.y ** 2);
        ch.position = polarToCartesian(chR, newA);
        // 이 chain 위에 stack 된 sc 가 있으면 angle 도 sync.
        for (const sIdx of thisStitchIndices) {
          const s = stitches[sIdx]!;
          if (s.parentIndices.includes(chainIdx)) {
            const sR = Math.sqrt(s.position.x ** 2 + s.position.y ** 2);
            s.position = polarToCartesian(sR, newA);
          }
        }
      }
    }
    i = j;
  }

  // 겹치는 cascade 코는 인접 non-overlap 양 끝을 anchor 로 outward bezier 호에 재배치.
  // 같은 단 chain-as-parent 관계 (consumed chain + stack 된 sc) 는 이미 정확히 align 되어 있어 제외.
  const MIN_CHORD = 16;
  const visibleOps = thisStitchIndices.filter((i) => {
    const s = stitches[i]!;
    const k = s.op.kind;
    if (k === 'MAGIC' || k === 'SKIP') return false;
    if (k === 'CHAIN' && s.op.inSameHoleGroup) return false;
    if (consumedChains.has(i)) return false; // chain-as-parent chain.
    if (s.parentIndices.some((p) => stitches[p]!.roundIndex === s.roundIndex)) return false; // stack sc.
    return true;
  });
  const dist = (i: number, j: number) => {
    const a = stitches[i]!.position, b = stitches[j]!.position;
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  let runStart = -1;
  for (let i = 1; i <= visibleOps.length; i++) {
    const overlaps = i < visibleOps.length && dist(visibleOps[i - 1]!, visibleOps[i]!) < MIN_CHORD;
    if (overlaps && runStart < 0) runStart = i - 1;
    if (!overlaps && runStart >= 0) {
      // run = [runStart .. i-1]
      const runEnd = i - 1;
      const runLen = runEnd - runStart + 1;
      const prev = runStart > 0 ? stitches[visibleOps[runStart - 1]!] : null;
      const next = runEnd < visibleOps.length - 1 ? stitches[visibleOps[runEnd + 1]!] : null;
      if (prev && next && runLen >= 2) {
        const left = prev.position, right = next.position;
        const dx = right.x - left.x, dy = right.y - left.y;
        const chord = Math.hypot(dx, dy);
        const midX = (left.x + right.x) / 2, midY = (left.y + right.y) / 2;
        const midDist = Math.hypot(midX, midY);
        // arc 길이 = (run+2) - 1 spacing × MIN_CHORD (= run 멤버 + 양 anchor 사이 간격).
        const requiredArc = (runLen + 1) * MIN_CHORD;
        const arcRatio = chord > 0.001 ? requiredArc / chord : 1;
        const minBulgeRatio = 0.15;
        let h_bez = chord * Math.max(minBulgeRatio, Math.sqrt(Math.max(0, 0.75 * (arcRatio - 1))));
        // outward perp.
        let perpX: number, perpY: number;
        if (chord < 0.001) { perpX = midX / Math.max(midDist, 1); perpY = midY / Math.max(midDist, 1); }
        else {
          const cdx = dx / chord, cdy = dy / chord;
          const p1x = -cdy, p1y = cdx;
          const mUnitX = midDist > 0.001 ? midX / midDist : 0;
          const mUnitY = midDist > 0.001 ? midY / midDist : 1;
          if (p1x * mUnitX + p1y * mUnitY >= 0) { perpX = p1x; perpY = p1y; }
          else { perpX = cdy; perpY = -cdx; }
        }
        const cOffset = 2 * h_bez;
        const cx = midX + cOffset * perpX, cy = midY + cOffset * perpY;
        // 양 anchor 사이를 (runLen+1) 등분, 1..runLen 위치에 run 멤버 배치.
        for (let k = 0; k < runLen; k++) {
          const t = (k + 1) / (runLen + 1);
          const mt = 1 - t;
          const bx = mt * mt * left.x + 2 * mt * t * cx + t * t * right.x;
          const by = mt * mt * left.y + 2 * mt * t * cy + t * t * right.y;
          stitches[visibleOps[runStart + k]!]!.position = { x: bx, y: by };
        }
      }
      runStart = -1;
    }
  }

  // 슬롯 매핑 + 슬롯 위치 저장 (다음 단 cascade 용).
  // 같은 단에서 consume 된 chain 은 다음 단으로 노출 안 됨 (= 위에 코가 떠짐).
  const slotMap: number[] = [];
  const filteredSlotPos: SlotPos[] = [];
  let posCursor = 0;
  for (const sIdx of thisStitchIndices) {
    const s = stitches[sIdx]!;
    const skip = consumedChains.has(sIdx);
    for (let k = 0; k < s.exposedSlots; k++) {
      const sp = thisSlotPos[posCursor];
      if (!skip) {
        slotMap.push(sIdx);
        if (sp) filteredSlotPos.push(sp);
      }
      posCursor++;
    }
  }
  slotMapByRound.set(roundIdx, slotMap);
  slotPosByRound.set(roundIdx, filteredSlotPos);

  // 시작 마커: MAGIC, CHAIN, SLIP 제외한 첫 visible stitch
  const firstVisible = thisStitchIndices.find(
    (i) => {
      const k = stitches[i]!.op.kind;
      return k !== 'MAGIC' && k !== 'CHAIN' && k !== 'SLIP' && stitches[i]!.op.produce > 0;
    }
  );
  if (firstVisible !== undefined) {
    roundMarkers.push({
      roundIndex: roundIdx,
      position: { x: 0, y: 0 }, // 후처리에서 재계산
      direction: 'left',
      _stitchIdx: firstVisible, // 임시 참조
    } as RoundMarker & { _stitchIdx: number });
  }
}

// ============================================================
// `[^...]` / `tc(...)` 기둥코 세로 스택 재배치
// ============================================================

/**
 * 기둥코 그룹: turningChain=true 로 마킹된 op 들을 첫 op 의 슬롯 각도에서
 * 바깥 방향으로 세로 스택(사슬 기둥)으로 배치.
 *
 * 첫 op(sameHoleContinuation=false)가 해당 슬롯의 정상 각도에 놓여 있으므로,
 * 그 각도를 기준으로 모든 op 를 r=baseR+symH, baseR+3·symH, ... 에 쌓는다.
 */
function repositionTurningChainColumns(stitches: PositionedStitch[]): void {
  for (let i = 0; i < stitches.length; i++) {
    const s = stitches[i]!;
    if (!s.op.turningChain) continue;
    if (s.op.sameHoleContinuation) continue;

    // 그룹 수집: 같은 단 내 뒤따르는 turningChain + sameHoleContinuation 연속
    const groupIndices: number[] = [i];
    for (let j = i + 1; j < stitches.length; j++) {
      const t = stitches[j]!;
      if (t.roundIndex !== s.roundIndex) break;
      if (!t.op.turningChain) break;
      if (!t.op.sameHoleContinuation) break;
      groupIndices.push(j);
    }

    // anchor 의 실제 반경 기준으로 위로 쌓음 — even 모드에서 anchor 가 parent 반경에 따라
    // 다른 위치에 있어도 정상 동작.
    const anchorR = Math.sqrt(s.position.x * s.position.x + s.position.y * s.position.y);
    const anchorH = effectiveSymH(s.op);
    const columnAngle = Math.atan2(s.position.y, s.position.x);
    const chainSymH = STITCH_META['CHAIN'].symbolHalfHeight;
    const innerEdge = anchorR - anchorH; // anchor 의 안쪽 끝

    for (let k = 0; k < groupIndices.length; k++) {
      const cs = stitches[groupIndices[k]!]!;
      const r = innerEdge + chainSymH + k * chainSymH * 2;
      cs.position = polarToCartesian(r, columnAngle);
      cs.angle = columnAngle + Math.PI / 2;
    }

    i = groupIndices[groupIndices.length - 1]!;
  }
}

// ============================================================
// 사슬 호(arc) 재배치 — 순수 CHAIN 연속만, top-to-top
// ============================================================

/** 기호의 바깥쪽 끝(top) 좌표. */
function stitchTop(s: PositionedStitch): Point {
  const symH = effectiveSymH(s.op);
  const r = Math.sqrt(s.position.x * s.position.x + s.position.y * s.position.y);
  if (r < 0.001) return { x: s.position.x, y: s.position.y };
  const k = (r + symH) / r;
  return { x: s.position.x * k, y: s.position.y * k };
}

/**
 * `[...]` 내부 연속된 CHAIN 을 공유 부모 top 과 samehole 내 non-chain anchor top 사이
 * arc 위에 클러스터로 배치. 기둥코 / standalone chain 은 대상이 아님.
 */
function repositionChainArcs(stitches: PositionedStitch[]): void {
  const byRound = new Map<number, number[]>();
  for (let i = 0; i < stitches.length; i++) {
    const ri = stitches[i]!.roundIndex;
    const arr = byRound.get(ri) ?? [];
    arr.push(i);
    byRound.set(ri, arr);
  }
  for (const indices of byRound.values()) {
    repositionChainArcsInRound(stitches, indices);
  }
}

function isSameholeArcChain(s: PositionedStitch | undefined): boolean {
  if (!s) return false;
  if (s.op.turningChain) return false;
  if (!s.op.inSameHoleGroup) return false;
  return s.op.kind === 'CHAIN';
}

/** 같은 단 내 인접 non-chain stitch 탐색. 원형 wrap-around. CHAIN/turningChain/MAGIC 은 건너뜀.
 *  SKIP 은 1 코 boundary 로 포함 — 사슬 호가 SKIP 영역을 가로지르지 않게 (평면과 동일 로직). */
function findAdjacentNonChain(
  stitches: PositionedStitch[],
  indices: number[],
  from: number,
  direction: 1 | -1,
): PositionedStitch | undefined {
  const n = indices.length;
  if (n === 0) return undefined;
  let j = ((from % n) + n) % n;
  for (let k = 0; k < n; k++) {
    const t = stitches[indices[j]!]!;
    if (t.op.kind !== 'CHAIN' && !t.op.turningChain && t.op.kind !== 'MAGIC') return t;
    j = ((j + direction) % n + n) % n;
  }
  return undefined;
}

function repositionChainArcsInRound(stitches: PositionedStitch[], indices: number[]): void {
  let i = 0;
  while (i < indices.length) {
    if (!isSameholeArcChain(stitches[indices[i]!])) { i++; continue; }
    const runStart = i;
    while (i < indices.length && isSameholeArcChain(stitches[indices[i]!])) i++;
    const runEnd = i;
    const runLen = runEnd - runStart;

    // 공유 부모 (fallback anchor)
    const firstChain = stitches[indices[runStart]!]!;
    const parentIdx = firstChain.parentIndices[0];
    const parent = parentIdx !== undefined ? stitches[parentIdx] : undefined;

    // chain run 의 samehole anchor (sameHoleContinuation=false 인 첫 chain).
    // 그 anchor 가 chainArcBounds 를 가지면 부모 territory 의 좌/우 경계를 직접 사용 →
    // 호가 인접 stitch territory 로 침범하지 않고 부모 슬롯 폭 안에 머무름.
    let runAnchor: PositionedStitch | null = null;
    for (let k = runStart; k < runEnd; k++) {
      const c = stitches[indices[k]!]!;
      if (!c.op.sameHoleContinuation) { runAnchor = c; break; }
    }
    let leftTop: Point, rightTop: Point;
    if (runAnchor && runAnchor.chainArcBounds) {
      leftTop = runAnchor.chainArcBounds.left;
      rightTop = runAnchor.chainArcBounds.right;
    } else {
      // fallback: 단 내 앞/뒤 non-chain stitch top.
      let prev = findAdjacentNonChain(stitches, indices, runStart - 1, -1);
      if (!prev) prev = parent;
      let next = findAdjacentNonChain(stitches, indices, runEnd, 1);
      if (!next) next = parent;
      if (!prev || !next) continue;
      leftTop = stitchTop(prev);
      rightTop = stitchTop(next);
    }

    // chord: anchor tops 간 직선 길이
    const dx = rightTop.x - leftTop.x;
    const dy = rightTop.y - leftTop.y;
    const chord = Math.sqrt(dx * dx + dy * dy);
    const midX = (leftTop.x + rightTop.x) / 2;
    const midY = (leftTop.y + rightTop.y) / 2;
    const midDist = Math.sqrt(midX * midX + midY * midY);
    // anchor tops 의 origin 까지 거리 — apex 가 이 라인 (= 단 outer 그리드) 이상에 오도록 강제.
    const ltDist = Math.sqrt(leftTop.x * leftTop.x + leftTop.y * leftTop.y);
    const rtDist = Math.sqrt(rightTop.x * rightTop.x + rightTop.y * rightTop.y);
    const targetTopDist = Math.max(ltDist, rtDist);

    // CHAIN ellipse width 10 → spacing 9 로 1px 겹쳐 연결된 느낌
    const CHAIN_SPACING = 9;
    // anchor 기호와 체인이 겹치지 않고 시각적 여유도 주도록 양 끝에 여유
    const ANCHOR_GAP = 12;

    // chain group 이 arc 에 fit 하도록 필요한 arc 길이:
    //   (chain 중심 간격 = (runLen-1)*spacing) + 양 끝 anchor gap × 2
    const chainSpan = (runLen - 1) * CHAIN_SPACING;
    const requiredArc = chainSpan + 2 * ANCHOR_GAP;
    // bezier midpoint 의 chord 수직 offset h_bez: arc ≈ chord * (1 + (4/3)(h/chord)²)
    // → h_bez = chord * sqrt((3/4) * max(0, arc/chord - 1))
    const arcRatio = chord > 0.001 ? requiredArc / chord : 1;
    const minBulgeRatio = 0.1; // 최소 볼록도 (좁은 arc 도 약간 굽게)
    const baseH = chord * Math.max(minBulgeRatio, Math.sqrt(Math.max(0, 0.75 * (arcRatio - 1))));
    // 그리드 라인 보정: apex distance ≈ midDist + h_bez 가 anchor tops radius 이상이도록.
    const minBulgeForGrid = Math.max(0, targetTopDist - midDist);
    const h_bez = Math.max(baseH, minBulgeForGrid);
    const cOffset = 2 * h_bez; // C 의 chord midpoint 로부터의 수직 거리

    // outward perpendicular: chord 에 수직이며 원점에서 멀어지는 방향
    let perpX: number, perpY: number;
    if (chord < 0.001) {
      perpX = 0; perpY = 0;
    } else {
      const cdx = dx / chord, cdy = dy / chord;
      // perp 후보: (-cdy, cdx) 또는 (cdy, -cdx). midpoint 방향과 dot 가 양수인 것 선택
      const p1x = -cdy, p1y = cdx;
      const mUnitX = midDist > 0.001 ? midX / midDist : 0;
      const mUnitY = midDist > 0.001 ? midY / midDist : 1;
      const dot1 = p1x * mUnitX + p1y * mUnitY;
      if (dot1 >= 0) { perpX = p1x; perpY = p1y; }
      else { perpX = cdy; perpY = -cdx; }
    }

    const cx = midX + cOffset * perpX;
    const cy = midY + cOffset * perpY;

    const tValues = sampleByArcLength(leftTop, { x: cx, y: cy }, rightTop, runLen, CHAIN_SPACING);

    // run 내 chain anchor (sameHoleContinuation=false) 가 cluster 가운데에 오도록 t-swap.
    // 다음 단 자식의 슬롯 위치 (= group center) 와 angular 정렬 → 연결선 비스듬해지지 않음.
    let anchorRunIdx = -1;
    for (let k = 0; k < runLen; k++) {
      if (!stitches[indices[runStart + k]!]!.op.sameHoleContinuation) { anchorRunIdx = k; break; }
    }
    const midSampleIdx = Math.floor((runLen - 1) / 2);
    if (anchorRunIdx >= 0 && anchorRunIdx !== midSampleIdx && midSampleIdx < runLen) {
      [tValues[anchorRunIdx], tValues[midSampleIdx]] =
        [tValues[midSampleIdx]!, tValues[anchorRunIdx]!];
    }

    for (let j = 0; j < runLen; j++) {
      const t = tValues[j]!;
      const bx = bezierQuad(leftTop.x, cx, rightTop.x, t);
      const by = bezierQuad(leftTop.y, cy, rightTop.y, t);
      const sIdx = indices[runStart + j]!;
      const s = stitches[sIdx]!;
      s.position = { x: bx, y: by };
      const tx = bezierQuadDeriv(leftTop.x, cx, rightTop.x, t);
      const ty = bezierQuadDeriv(leftTop.y, cy, rightTop.y, t);
      s.angle = Math.atan2(ty, tx);
    }
  }
}

/** 베지어 위에 arc-length 등간격으로 count 개 점의 t 값 반환. 곡선 중앙 정렬. */
function sampleByArcLength(
  p0: Point, c: Point, p1: Point, count: number, spacing: number,
): number[] {
  const N = 60;
  const table: Array<{ t: number; len: number }> = [{ t: 0, len: 0 }];
  let totalLen = 0;
  let px = p0.x, py = p0.y;
  for (let i = 1; i <= N; i++) {
    const t = i / N;
    const x = bezierQuad(p0.x, c.x, p1.x, t);
    const y = bezierQuad(p0.y, c.y, p1.y, t);
    totalLen += Math.sqrt((x - px) ** 2 + (y - py) ** 2);
    table.push({ t, len: totalLen });
    px = x; py = y;
  }
  const groupLen = (count - 1) * spacing;
  const startLen = (totalLen - groupLen) / 2;
  const result: number[] = [];
  for (let j = 0; j < count; j++) {
    const target = Math.max(0, Math.min(totalLen, startLen + j * spacing));
    let lo = 0;
    for (let k = 1; k < table.length; k++) {
      if (table[k]!.len >= target) { lo = k - 1; break; }
      lo = k - 1;
    }
    const a = table[lo]!;
    const b = table[lo + 1] ?? a;
    const seg = b.len - a.len;
    const frac = seg > 0 ? (target - a.len) / seg : 0;
    result.push(a.t + frac * (b.t - a.t));
  }
  return result;
}

function bezierQuad(p0: number, c: number, p1: number, t: number): number {
  const mt = 1 - t;
  return mt * mt * p0 + 2 * mt * t * c + t * t * p1;
}

function bezierQuadDeriv(p0: number, c: number, p1: number, t: number): number {
  return 2 * (1 - t) * (c - p0) + 2 * t * (p1 - c);
}

function angleAt(i: number, total: number, sign: 1 | -1): number {
  if (total <= 0) return START_ANGLE;
  return START_ANGLE + sign * ((2 * Math.PI * i) / total);
}

function polarToCartesian(r: number, angle: number): Point {
  return { x: r * Math.cos(angle), y: r * Math.sin(angle) };
}
