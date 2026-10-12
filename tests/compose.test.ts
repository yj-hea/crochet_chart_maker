import { describe, expect, it } from 'vitest';
import { composeWithPieces } from '../src/lib/layout/compose';
import { parseRound } from '../src/lib/crafts/crochet/parser';
import { expand as expandOps } from '../src/lib/expand/expander';
import { layoutCircular } from '../src/lib/crafts/crochet/circular';
import { renderSvg } from '../src/lib/crafts/crochet/svg';
import { applyAdjustments } from '../src/lib/layout/adjust';

function layout(...srcs: string[]) {
  return layoutCircular(srcs.map((s, i) => expandOps(parseRound(i + 1, s).body!, i + 1)), {});
}

describe('조각 합쳐 그리기', () => {
  const body = layout('32X', '32X');
  const leg = layout('@, 6X', '6V');

  it('조각이 없으면 그대로 둔다', () => {
    expect(composeWithPieces(body, [])).toBe(body);
  });

  it('조각의 코가 아래에 붙고 경계가 넓어진다', () => {
    const out = composeWithPieces(body, [
      { name: '다리 A', layout: leg },
      { name: '다리 B', layout: leg },
    ], { chain: 4 });

    expect(out.stitches.length).toBe(body.stitches.length + leg.stitches.length * 2);
    expect(out.bounds.maxY).toBeGreaterThan(body.bounds.maxY);
    expect(out.bounds.width).toBeGreaterThan(body.bounds.width);
    // 조각은 몸통 **아래**
    const pieceStitches = out.stitches.slice(body.stitches.length);
    expect(Math.min(...pieceStitches.map((s) => s.position.y))).toBeGreaterThan(body.bounds.maxY);
  });

  it('조각 이름과 사슬 수를 적는다', () => {
    const out = composeWithPieces(body, [
      { name: '다리 A', layout: leg },
      { name: '다리 B', layout: leg },
    ], { chain: 4 });
    const labels = (out.decorations ?? []).filter((d) => d.kind === 'label').map((d) => (d as { text: string }).text);
    expect(labels).toContain('다리 A');
    expect(labels).toContain('다리 B');
    expect(labels).toContain('사슬 4');
  });

  it('조각의 코와 몸통의 코를 **하나씩 짝지어** 잇는다', () => {
    // 다리 마지막 단 12코 × 2 + 사슬 4 × 2 = 32 → 몸통 32코와 자리가 맞는다
    const out = composeWithPieces(body, [
      { name: '다리 A', layout: leg },
      { name: '다리 B', layout: leg },
    ], { chain: 4 });
    const lines = (out.decorations ?? []).filter((d) => d.kind === 'line');
    expect(lines).toHaveLength(24);                 // 12 + 12, 사슬 자리는 건너뛴다

    const bodyFirst = body.stitches.filter((s) => s.roundIndex === 1 && s.op.consume > 0);
    const near = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.hypot(a.x - b.x, a.y - b.y) < 0.001;
    // 첫 짝: 다리 A 의 첫 코 → 몸통의 첫 코
    const first = lines[0] as { to: { x: number; y: number } };
    expect(near(first.to, bodyFirst[0]!.position)).toBe(true);
    // 두 번째 조각은 **사슬 4코를 건너뛴** 자리에서 시작한다 (12 + 4 = 17번째 코)
    const secondPiece = lines[12] as { to: { x: number; y: number } };
    expect(near(secondPiece.to, bodyFirst[16]!.position)).toBe(true);
  });

  it('이어받기는 가져온 구간만 잇는다', () => {
    const out = composeWithPieces(body, [
      { name: '몸통', layout: leg, range: { at: 3, count: 4 } },
    ]);
    expect((out.decorations ?? []).filter((d) => d.kind === 'line')).toHaveLength(4);
  });

  it('몸통 코가 모자라면 있는 데까지만 잇는다', () => {
    const small = layout('4X');
    const out = composeWithPieces(small, [{ name: '다리', layout: leg }]);
    expect((out.decorations ?? []).filter((d) => d.kind === 'line')).toHaveLength(4);
  });

  it('조각의 부모 인덱스를 합친 배열 기준으로 옮긴다', () => {
    const out = composeWithPieces(body, [{ name: '다리', layout: leg }]);
    const offset = body.stitches.length;
    const pieceStitches = out.stitches.slice(offset);
    // 원본 조각의 부모 관계가 그대로 유지되고, 몸통 코를 가리키지 않는다
    for (let i = 0; i < pieceStitches.length; i++) {
      const original = leg.stitches[i]!;
      expect(pieceStitches[i]!.parentIndices).toEqual(original.parentIndices.map((p) => p + offset));
      for (const p of pieceStitches[i]!.parentIndices) expect(p).toBeGreaterThanOrEqual(offset);
    }
  });

  it('조각의 코는 캔버스 선택 대상이 아니다 (보여 주기 전용)', () => {
    const withKeys = applyAdjustments(body);
    const out = composeWithPieces(withKeys, [{ name: '다리', layout: applyAdjustments(leg) }]);
    const pieceStitches = out.stitches.slice(withKeys.stitches.length);
    expect(pieceStitches.every((s) => s.key === undefined)).toBe(true);
    // 몸통 쪽 키는 그대로
    expect(out.stitches[0]!.key).toBe('s:1:0');
  });

  it('합쳐 그리면 격자 안내선을 그리지 않는다 — 기준이 여럿이라 어긋난다', () => {
    const out = composeWithPieces(body, [{ name: '다리', layout: leg }]);
    expect(out.noGrid).toBe(true);
    const svg = renderSvg({ layout: out, showGrid: true, showConnections: false });
    expect(svg).not.toContain('class="grid"');
    expect(svg).toContain('class="decorations"');
    expect(svg).toContain('다리');
  });
});
