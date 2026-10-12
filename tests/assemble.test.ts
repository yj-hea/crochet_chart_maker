/**
 * 이어받기를 끝까지 따라가 한 장으로 조립하기.
 *
 * 배 ← 몸통 ← 다리 A·다리 B 처럼 조각이 또 조각을 가질 때, 배 도안에서도 다리가
 * 보여야 한다 (한 겹만 보면 다리가 사라졌던 자리).
 */
import { describe, expect, it } from 'vitest';
import { assemble, rootPieces, type AssembleNode } from '../src/lib/layout/assemble';
import type { PieceStart } from '../src/lib/model/pieces';
import { parseRound } from '../src/lib/crafts/crochet/parser';
import { expand as expandOps } from '../src/lib/expand/expander';
import { layoutCircular } from '../src/lib/crafts/crochet/circular';

function layout(...srcs: string[]) {
  return layoutCircular(srcs.map((s, i) => expandOps(parseRound(i + 1, s).body!, i + 1)), {});
}

/** 다리(12코) × 2 + 사슬 1 × 2 = 26코 몸통, 그 26코를 배가 이어받는다 */
function dollParts() {
  const leg = layout('@, 6X', '6V');          // 마지막 단 12코
  const body = layout('26X', '26X');
  const belly = layout('26X');
  const nodes: Record<string, AssembleNode> = {
    legA: { name: '다리 A', layout: leg },
    legB: { name: '다리 B', layout: leg },
    body: {
      name: '몸통',
      layout: body,
      start: { kind: 'join', pieces: ['legA', 'legB'], chain: 1 },
    },
    belly: {
      name: '배',
      layout: belly,
      start: { kind: 'from', piece: 'body' },
    },
  };
  return { nodes, lookup: (id: string) => nodes[id], leg, body, belly };
}

describe('조각 조립', () => {
  it('혼자 시작하는 도안은 그대로 둔다', () => {
    const { lookup, leg } = dollParts();
    expect(assemble('legA', lookup)).toBe(leg);
  });

  it('한 겹만 — 배 도안에 몸통까지만 (다리는 빠진다)', () => {
    const { lookup, belly, body } = dollParts();
    const out = assemble('belly', lookup, 'direct')!;
    expect(out.stitches.length).toBe(belly.stitches.length + body.stitches.length);
    const labels = (out.decorations ?? [])
      .filter((d) => d.kind === 'label')
      .map((d) => (d as { text: string }).text);
    expect(labels).toEqual(['몸통']);
  });

  it('끝까지 — 배 도안에 몸통과 다리가 모두 그려진다', () => {
    const { lookup, belly, body, leg } = dollParts();
    const out = assemble('belly', lookup, 'all')!;
    expect(out.stitches.length).toBe(
      belly.stitches.length + body.stitches.length + leg.stitches.length * 2,
    );
    const labels = (out.decorations ?? [])
      .filter((d) => d.kind === 'label')
      .map((d) => (d as { text: string }).text);
    expect(labels).toContain('몸통');
    expect(labels).toContain('다리 A');
    expect(labels).toContain('다리 B');
    expect(labels).toContain('사슬 1');
  });

  it('조각 안쪽의 잇는 선도 함께 온다 — 다리 24코 + 몸통 26코', () => {
    const { lookup } = dollParts();
    const out = assemble('belly', lookup, 'all')!;
    const lines = (out.decorations ?? []).filter((d) => d.kind === 'line');
    // 다리 → 몸통 24 (사슬 2코 자리는 건너뛴다) + 몸통 → 배 26
    expect(lines).toHaveLength(24 + 26);
  });

  it('합쳐 그린 조각의 **자기 마지막 단**에서 선을 긋는다 (끌어온 코는 세지 않는다)', () => {
    const { lookup, belly } = dollParts();
    const direct = assemble('belly', lookup, 'direct')!;
    const all = assemble('belly', lookup, 'all')!;
    const toBelly = (l: typeof direct) => (l.decorations ?? [])
      .filter((d) => d.kind === 'line')
      .map((d) => (d as { to: { x: number; y: number } }).to);
    // 배가 받는 자리는 깊이와 무관하게 같다 — 26코
    const bellyRow = belly.stitches.filter((s) => s.roundIndex === 1 && s.op.consume > 0);
    expect(toBelly(direct)).toHaveLength(26);
    expect(toBelly(all).filter((p) =>
      bellyRow.some((s) => Math.hypot(s.position.x - p.x, s.position.y - p.y) < 0.001),
    )).toHaveLength(26);
  });

  it('찾지 못한 조각은 건너뛴다', () => {
    const { nodes, belly } = dollParts();
    delete nodes.body;
    const out = assemble('belly', (id) => nodes[id], 'all')!;
    expect(out.stitches.length).toBe(belly.stitches.length);
  });

  it('서로 물고 도는 관계에서도 멈춘다', () => {
    const a = layout('6X');
    const nodes: Record<string, AssembleNode> = {
      a: { name: 'A', layout: a, start: { kind: 'from', piece: 'b' } },
      b: { name: 'B', layout: a, start: { kind: 'from', piece: 'a' } },
    };
    const out = assemble('a', (id) => nodes[id], 'all')!;
    // A + B 두 겹에서 멈춘다 (A 를 다시 끌어오지 않는다)
    expect(out.stitches.length).toBe(a.stitches.length * 2);
  });
});

describe('뿌리 조각 찾기', () => {
  const startOf = (id: string): PieceStart | undefined => ({
    body: { kind: 'join', pieces: ['legA', 'legB'], chain: 1 },
    belly: { kind: 'from', piece: 'body' },
  } as Record<string, PieceStart>)[id];

  it('아무도 이어받지 않는 도안만 남는다', () => {
    expect(rootPieces(['legA', 'legB', 'body', 'belly'], startOf)).toEqual(['belly']);
  });

  it('따로 뜨는 덩어리가 여럿이면 여럿 다 돌려준다', () => {
    expect(rootPieces(['legA', 'legB', 'body', 'belly', '받침'], startOf))
      .toEqual(['belly', '받침']);
  });
});
