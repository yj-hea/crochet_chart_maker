/**
 * 조각을 한 장에 합쳐 그리기.
 *
 * 몸통 도안이 다리 A·B 를 이어 시작한다면(`Tab.startsFrom`), 몸통만 보여 주는 것으로는
 * 어떻게 생긴 작품인지 알 수 없다. 조각들을 **몸통 아래에 나란히** 놓고, 이어지는 자리를
 * 점선으로 묶어 한 장으로 만든다.
 *
 * 레이아웃 엔진은 뿌리(1단)가 하나라는 전제 위에 있으므로 엔진을 건드리지 않는다.
 * 조각마다 **따로 레이아웃한 뒤 좌표를 옮겨** 합치는 층이다.
 *
 * 합쳐 그린 결과는 **보여 주기 전용**이다 — 3D 미리보기·게이지·캔버스 선택은 몸통 자신의
 * 레이아웃을 그대로 쓴다. 그래서 조각의 코에는 선택 키를 달지 않는다.
 */

import type { LayoutResult, PositionedStitch, Point, Decoration, LayoutBounds } from './types';

/** 조각을 놓는 자리를 손으로 다듬은 값 — 자동 배치 위에 덧입힌다 */
export interface PieceOffset {
  dx?: number;
  dy?: number;
  /** 조각 **자신의 가운데**를 축으로 돌린 각도 (도) */
  rot?: number;
}

export interface PieceLayout {
  /** 조각(도안 탭) id — 조립도에서 이 조각을 집어 옮길 때 쓴다 */
  id?: string;
  /** 조각 이름 — 도안에 라벨로 적는다 */
  name: string;
  layout: LayoutResult;
  /**
   * 이 조각에서 **어느 코를 가져왔는지** (이어받기).
   * 주면 그 구간의 코에서 선을 긋고 몇 코인지 적는다. 없으면 조각 전체에서 긋는다.
   */
  range?: { at: number; count: number };
  /** 손으로 다듬은 자리 */
  offset?: PieceOffset;
}

/** 몸통과 조각 사이, 조각끼리의 간격 */
const GAP_Y = 46;
const GAP_X = 34;

export interface ComposeOptions {
  /** 조각 사이를 잇는 사슬 수 (0 이면 바로 붙인다) */
  chain?: number;
}

/**
 * 몸통 레이아웃 아래에 조각들을 나란히 붙인 새 레이아웃.
 * 조각이 없으면 몸통을 그대로 돌려준다.
 */
export function composeWithPieces(
  body: LayoutResult,
  pieces: ReadonlyArray<PieceLayout>,
  opts: ComposeOptions = {},
): LayoutResult {
  if (pieces.length === 0) return body;

  // 자동 배치는 **손대지 않았을 때의 경계**(baseBounds) 로 잡는다.
  // 옮겨 둔 조각의 실제 경계로 잡으면, 조각 하나를 끌 때마다 위쪽 배치가 따라 움직여
  // 끈 만큼 가지 않는다 (끌면 다른 조각들까지 흔들린다).
  const bodyBase = body.baseBounds ?? body.bounds;
  const bases = pieces.map((p) => p.layout.baseBounds ?? p.layout.bounds);
  const totalWidth = bases.reduce((a, b) => a + b.width, 0) + GAP_X * (pieces.length - 1);
  const bodyCenterX = (bodyBase.minX + bodyBase.maxX) / 2;
  const top = bodyBase.maxY + GAP_Y;   // 몸통 아래

  const stitches: PositionedStitch[] = [...body.stitches];
  const decorations: Decoration[] = [...(body.decorations ?? [])];
  let minX = body.bounds.minX;
  let maxX = body.bounds.maxX;
  let minY = body.bounds.minY;
  let maxY = body.bounds.maxY;
  const base = { minX: bodyBase.minX, maxX: bodyBase.maxX, minY: bodyBase.minY, maxY: bodyBase.maxY };

  let cursor = bodyCenterX - totalWidth / 2;
  /** 조각마다 몸통과 이어지는 코의 자리 (뜨는 순서) */
  const linked: Point[][] = [];
  const pieceBoxes: Array<{ id?: string; name: string; bounds: LayoutBounds }> = [];

  pieces.forEach((piece, i) => {
    const b = bases[i]!;
    // 조각의 왼쪽 위를 (cursor, top) 에 맞춘 뒤, 손으로 다듬은 만큼 더 옮긴다
    const dx = cursor - b.minX;
    const dy = top - b.minY;
    const place = placer(b, dx, dy, piece.offset);
    /** 손으로 옮기기 **전**의 자리 — 위쪽 배치의 기준 */
    const place0 = placer(b, dx, dy);
    // 부모 인덱스는 **합친 배열 기준**으로 옮긴다 — 안 그러면 조각의 연결선이
    // 몸통의 코를 가리켜 부채처럼 퍼진다
    const offset = stitches.length;
    for (const s of piece.layout.stitches) {
      stitches.push(transform(s, place, offset));
    }
    for (const d of piece.layout.decorations ?? []) {
      decorations.push(moveDecoration(d, place.at));
    }
    const box = place.boxOf(piece.layout.bounds);
    const baseBox = place0.boxOf(b);
    // 조각 이름 — 조각 바로 위
    decorations.push({
      kind: 'label',
      at: { x: box.minX + box.width / 2, y: box.minY - 8 },
      text: piece.name,
      align: 'middle',
    });
    pieceBoxes.push({ ...(piece.id ? { id: piece.id } : {}), name: piece.name, bounds: box });
    // 조각이 또 조각을 가졌다면 그것들도 집을 수 있어야 한다
    for (const inner of piece.layout.pieceBoxes ?? []) {
      pieceBoxes.push({ ...inner, bounds: place.boxOf(inner.bounds) });
    }

    // 몸통과 이어지는 코들 — 이어받기면 가져온 구간만, 잇기면 마지막 단 전부
    const taken = (piece.range
      ? takenPositions(piece.layout, piece.range)
      : lastRowPositions(piece.layout)
    ).map(place.at);
    linked.push(taken);

    minX = Math.min(minX, box.minX);
    maxX = Math.max(maxX, box.maxX);
    minY = Math.min(minY, box.minY);
    maxY = Math.max(maxY, box.maxY);
    base.minX = Math.min(base.minX, baseBox.minX);
    base.maxX = Math.max(base.maxX, baseBox.maxX);
    base.minY = Math.min(base.minY, baseBox.minY);
    base.maxY = Math.max(base.maxY, baseBox.maxY);
    cursor += b.width + GAP_X;
  });

  // 조각 → 몸통: **코 하나하나를 짝지어** 점선으로 잇는다.
  // 조각의 어느 코가 몸통의 어느 코로 이어지는지가 도안에서 읽혀야 한다.
  const bodyRow = firstRowPositions(body);
  const chain = opts.chain ?? 0;
  let cursorIdx = 0;
  for (const taken of linked) {
    for (const from of taken) {
      const to = bodyRow[cursorIdx];
      cursorIdx++;
      if (!to) break;                 // 몸통 코가 모자라면 (코 수가 안 맞는 도안) 거기까지만
      decorations.push({ kind: 'line', from, to, dashed: true, faint: true });
    }
    // 조각 사이를 잇는 사슬은 조각에서 올라온 코가 아니다 — 그만큼 건너뛴다
    cursorIdx += chain;
  }
  // 조각 사이에 넣는 사슬 — 조각과 조각 사이에 몇 코인지 적는다
  if (chain > 0 && linked.length > 0) {
    const mids = linked.map((pts) => (pts.length > 0
      ? pts.reduce((a, p) => a + p.x, 0) / pts.length
      : bodyCenterX));
    const topY = Math.min(...linked.flat().map((p) => p.y), top);
    const y = (topY + body.bounds.maxY) / 2;
    const gaps = linked.length === 1
      ? [bodyCenterX]
      : mids.slice(0, -1).map((x, i) => (x + mids[i + 1]!) / 2);
    for (const x of gaps) {
      decorations.push({ kind: 'label', at: { x, y }, text: `사슬 ${chain}`, align: 'middle', muted: true });
    }
  }

  return {
    ...body,
    stitches,
    decorations,
    pieceBoxes,
    // 격자 안내선은 조각마다 기준이 달라 합치면 어긋난다 — 합쳐 그릴 때는 생략한다
    gridGuide: undefined,
    noGrid: true,
    bounds: {
      minX, minY, maxX, maxY,
      width: maxX - minX,
      height: maxY - minY,
    },
    baseBounds: {
      ...base,
      width: base.maxX - base.minX,
      height: base.maxY - base.minY,
    },
  };
}

/**
 * 따로 뜨는 덩어리 여럿을 **한 장에 나란히** 놓는다 (조립도).
 *
 * 서로 이어지지 않으므로 잇는 선은 긋지 않는다. 덩어리가 하나뿐이면 그대로 둔다.
 */
export function sideBySide(items: ReadonlyArray<PieceLayout>): LayoutResult | null {
  if (items.length === 0) return null;
  if (items.length === 1 && !items[0]!.offset) return items[0]!.layout;

  const stitches: PositionedStitch[] = [];
  const decorations: Decoration[] = [];
  const pieceBoxes: Array<{ id?: string; name: string; bounds: LayoutBounds }> = [];
  let cursor = 0;
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;

  for (const item of items) {
    // 나란히 놓는 자리도 **손대기 전** 경계로 잡는다 — 옮긴 조각이 옆 덩어리를 밀지 않도록
    const b = item.layout.baseBounds ?? item.layout.bounds;
    const place = placer(b, cursor - b.minX, -b.minY, item.offset);
    const offset = stitches.length;
    for (const s of item.layout.stitches) stitches.push(transform(s, place, offset));
    for (const d of item.layout.decorations ?? []) decorations.push(moveDecoration(d, place.at));
    const box = place.boxOf(item.layout.bounds);
    pieceBoxes.push({ ...(item.id ? { id: item.id } : {}), name: item.name, bounds: box });
    for (const inner of item.layout.pieceBoxes ?? []) {
      pieceBoxes.push({ ...inner, bounds: place.boxOf(inner.bounds) });
    }
    minX = Math.min(minX, box.minX); maxX = Math.max(maxX, box.maxX);
    minY = Math.min(minY, box.minY); maxY = Math.max(maxY, box.maxY);
    cursor += b.width + GAP_X * 2;
  }

  return {
    ...items[0]!.layout,
    stitches,
    decorations,
    pieceBoxes,
    roundMarkers: [],
    gridGuide: undefined,
    noGrid: true,
    bounds: { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY },
  };
}

/**
 * 조각 하나를 놓는 변환.
 *
 * 자동 배치(`dx`,`dy`) 위에 손으로 다듬은 값을 덧입힌다. 회전은 **조각 자신의 가운데**를
 * 축으로 돈다 — 조립도에서 다리를 돌려 몸통에 맞출 때 조각이 제자리에서 돌아야 한다.
 */
function placer(b: LayoutBounds, dx: number, dy: number, offset?: PieceOffset) {
  const ox = dx + (offset?.dx ?? 0);
  const oy = dy + (offset?.dy ?? 0);
  const rot = ((offset?.rot ?? 0) * Math.PI) / 180;
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);

  const at = (p: Point): Point => {
    if (!rot) return { x: p.x + ox, y: p.y + oy };
    const vx = p.x - cx;
    const vy = p.y - cy;
    return {
      x: cx + vx * cos - vy * sin + ox,
      y: cy + vx * sin + vy * cos + oy,
    };
  };

  /** 돌린 네 귀퉁이를 감싸는 경계 */
  const boxOf = (src: LayoutBounds): LayoutBounds => {
    const pts = [
      at({ x: src.minX, y: src.minY }), at({ x: src.maxX, y: src.minY }),
      at({ x: src.minX, y: src.maxY }), at({ x: src.maxX, y: src.maxY }),
    ];
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  };

  return { at, boxOf, rot };
}

type Placer = ReturnType<typeof placer>;

/** 조각의 코는 **보여 주기 전용** — 선택 키를 떼고 좌표만 옮긴다 */
function transform(s: PositionedStitch, place: Placer, offset: number): PositionedStitch {
  const { key: _key, transform: _t, ...rest } = s;
  return {
    ...rest,
    foreign: true,
    parentIndices: s.parentIndices.map((i) => i + offset),
    position: place.at(s.position),
    // 원형 기호는 각도를 보고 서 있다 — 조각을 돌리면 기호도 같이 돈다
    ...(s.angle !== undefined ? { angle: s.angle + place.rot } : {}),
    ...(s.chainArcBounds
      ? {
          chainArcBounds: {
            left: place.at(s.chainArcBounds.left),
            right: place.at(s.chainArcBounds.right),
          },
        }
      : {}),
  };
}

function moveDecoration(d: Decoration, at: (p: Point) => Point): Decoration {
  return d.kind === 'line'
    ? { ...d, from: at(d.from), to: at(d.to) }
    : { ...d, at: at(d.at) };
}

/**
 * 단을 **코(슬롯) 단위**로 펼친 자리 목록.
 *
 * 기호 하나가 코 하나인 것은 아니다 — 늘림(`V`)은 한 기호가 코 둘을 만들고,
 * 줄임(`A`)은 아래 코 둘을 쓴다. 잇는 선은 **코**를 따라가야 하므로
 * 그 수만큼 같은 자리를 되풀이해 펼친다.
 *
 *  - `produce` : 이 단이 **위로 내보내는** 코 (조각 쪽)
 *  - `consume` : 이 단이 **아래에서 받는** 코 (몸통 쪽). 사슬처럼 받지 않는 코는 빠진다
 *
 * 이미 합쳐 그린 레이아웃을 다시 조각으로 쓸 수 있으므로(배 ← 몸통 ← 다리),
 * 끌어온 코(`foreign`)는 세지 않는다 — 이 레이아웃 **자신의** 단만 본다.
 */
function slotsOf(layout: LayoutResult, roundIndex: number, by: 'produce' | 'consume'): Point[] {
  const out: Point[] = [];
  for (const s of own(layout)) {
    if (s.roundIndex !== roundIndex) continue;
    const n = by === 'produce' ? s.op.produce : s.op.consume;
    for (let i = 0; i < n; i++) out.push(s.position);
  }
  return out;
}

/** 이 레이아웃이 자기 도안으로 뜬 코 — 합쳐 그릴 때 끌어온 코는 뺀다 */
function own(layout: LayoutResult): PositionedStitch[] {
  return layout.stitches.filter((s) => !s.foreign);
}

/** 조각의 마지막 단 — 여기서 몸통으로 이어진다 */
function lastRowPositions(layout: LayoutResult): Point[] {
  const last = own(layout).reduce((max, s) => Math.max(max, s.roundIndex), 0);
  return slotsOf(layout, last, 'produce');
}

/** 몸통의 첫 단 — 조각에서 올라온 코를 받는 자리 */
function firstRowPositions(layout: LayoutResult): Point[] {
  const first = own(layout).reduce(
    (min, s) => Math.min(min, s.roundIndex),
    Number.POSITIVE_INFINITY,
  );
  return Number.isFinite(first) ? slotsOf(layout, first, 'consume') : [];
}

/**
 * 조각의 **마지막 단**에서 [at, at+count-1] 구간의 코 자리.
 * 코를 만들지 않는 동작(스킵 등)은 세지 않는다 — "몇 번째 코" 의 기준과 같다.
 */
function takenPositions(layout: LayoutResult, range: { at: number; count: number }): Point[] {
  const row = lastRowPositions(layout);
  const from = Math.max(0, range.at - 1);
  return row.slice(from, from + Math.max(1, range.count));
}
