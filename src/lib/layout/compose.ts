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

import type { LayoutResult, PositionedStitch, Point, Decoration } from './types';

export interface PieceLayout {
  /** 조각 이름 — 도안에 라벨로 적는다 */
  name: string;
  layout: LayoutResult;
  /**
   * 이 조각에서 **어느 코를 가져왔는지** (이어받기).
   * 주면 그 구간의 코에서 선을 긋고 몇 코인지 적는다. 없으면 조각 전체에서 긋는다.
   */
  range?: { at: number; count: number };
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

  const widths = pieces.map((p) => p.layout.bounds.width);
  const totalWidth = widths.reduce((a, b) => a + b, 0) + GAP_X * (pieces.length - 1);
  const bodyCenterX = (body.bounds.minX + body.bounds.maxX) / 2;
  const top = body.bounds.maxY + GAP_Y;   // 몸통 아래

  const stitches: PositionedStitch[] = [...body.stitches];
  const decorations: Decoration[] = [...(body.decorations ?? [])];
  let minX = body.bounds.minX;
  let maxX = body.bounds.maxX;
  let maxY = body.bounds.maxY;

  let cursor = bodyCenterX - totalWidth / 2;
  const tops: Array<{ x: number; y: number; marks?: Point[] }> = [];

  pieces.forEach((piece, i) => {
    const b = piece.layout.bounds;
    // 조각의 왼쪽 위를 (cursor, top) 에 맞춘다
    const dx = cursor - b.minX;
    const dy = top - b.minY;
    // 부모 인덱스는 **합친 배열 기준**으로 옮긴다 — 안 그러면 조각의 연결선이
    // 몸통의 코를 가리켜 부채처럼 퍼진다
    const offset = stitches.length;
    for (const s of piece.layout.stitches) {
      stitches.push(translate(s, dx, dy, offset));
    }
    for (const d of piece.layout.decorations ?? []) {
      decorations.push(moveDecoration(d, dx, dy));
    }
    // 조각 이름
    decorations.push({
      kind: 'label',
      at: { x: cursor + b.width / 2, y: top - 8 },
      text: piece.name,
      align: 'middle',
    });

    // 이어받은 구간이 있으면 그 코들에서 선을 긋는다 (어디서 갈라졌는지 보이게)
    const taken = piece.range
      ? takenPositions(piece.layout, piece.range).map((p) => move(p, dx, dy))
      : [];
    if (taken.length > 0) {
      const mid = taken.reduce((a, p) => a + p.x, 0) / taken.length;
      const topY = Math.min(...taken.map((p) => p.y));
      tops.push({ x: mid, y: topY, marks: taken });
    } else {
      tops.push({ x: cursor + b.width / 2, y: top });
    }
    minX = Math.min(minX, cursor);
    maxX = Math.max(maxX, cursor + b.width);
    maxY = Math.max(maxY, top + b.height);
    cursor += b.width + GAP_X;
    void i;
  });

  // 조각 → 몸통 연결선
  const bodyBottom = body.bounds.maxY;
  for (const t of tops) {
    decorations.push({ kind: 'line', from: { x: t.x, y: t.y }, to: { x: t.x, y: bodyBottom }, dashed: true });
    // 가져온 코마다 짧은 선을 그어 그 구간이 갈라진 자리임을 보인다
    for (const m of t.marks ?? []) {
      decorations.push({ kind: 'line', from: m, to: { x: t.x, y: t.y }, dashed: true });
    }
  }
  // 조각 사이에 넣는 사슬 — 몇 코인지 적어 둔다
  if (opts.chain && opts.chain > 0 && tops.length > 0) {
    for (let i = 0; i < tops.length; i++) {
      const a = tops[i]!;
      const b = tops[(i + 1) % tops.length]!;
      const x = tops.length === 1 ? a.x : (a.x + b.x) / 2;
      decorations.push({
        kind: 'label',
        at: { x, y: (a.y + bodyBottom) / 2 },
        text: `사슬 ${opts.chain}`,
        align: 'middle',
        muted: true,
      });
      if (tops.length <= 2) break;   // 두 조각이면 가운데 한 번이면 족하다
    }
  }

  return {
    ...body,
    stitches,
    decorations,
    // 격자 안내선은 조각마다 기준이 달라 합치면 어긋난다 — 합쳐 그릴 때는 생략한다
    gridGuide: undefined,
    noGrid: true,
    bounds: {
      minX, minY: body.bounds.minY, maxX, maxY,
      width: maxX - minX,
      height: maxY - body.bounds.minY,
    },
  };
}

/** 조각의 코는 **보여 주기 전용** — 선택 키를 떼고 좌표만 옮긴다 */
function translate(s: PositionedStitch, dx: number, dy: number, offset: number): PositionedStitch {
  const { key: _key, transform: _t, ...rest } = s;
  return {
    ...rest,
    parentIndices: s.parentIndices.map((i) => i + offset),
    position: { x: s.position.x + dx, y: s.position.y + dy },
    ...(s.chainArcBounds
      ? {
          chainArcBounds: {
            left: move(s.chainArcBounds.left, dx, dy),
            right: move(s.chainArcBounds.right, dx, dy),
          },
        }
      : {}),
  };
}

function move(p: Point, dx: number, dy: number): Point {
  return { x: p.x + dx, y: p.y + dy };
}

function moveDecoration(d: Decoration, dx: number, dy: number): Decoration {
  return d.kind === 'line'
    ? { ...d, from: move(d.from, dx, dy), to: move(d.to, dx, dy) }
    : { ...d, at: move(d.at, dx, dy) };
}

/**
 * 조각의 **마지막 단**에서 [at, at+count-1] 구간의 코 자리.
 * 코를 만들지 않는 동작(스킵 등)은 세지 않는다 — "몇 번째 코" 의 기준과 같다.
 */
function takenPositions(layout: LayoutResult, range: { at: number; count: number }): Point[] {
  const lastRound = layout.stitches.reduce((max, s) => Math.max(max, s.roundIndex), 0);
  const row = layout.stitches.filter((s) => s.roundIndex === lastRound && s.op.produce > 0);
  const from = Math.max(0, range.at - 1);
  return row.slice(from, from + Math.max(1, range.count)).map((s) => s.position);
}
