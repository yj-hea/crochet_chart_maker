import { describe, expect, it } from 'vitest';
import { parseKnitRound } from '../src/lib/crafts/knit/parser';
import { expandKnit } from '../src/lib/crafts/knit/expander';
import { layoutKnitGrid, KNIT_CELL_WIDTH } from '../src/lib/crafts/knit/grid';
import { isRightSide, flipOp, toDisplayOrder } from '../src/lib/crafts/knit/flip';
import { renderKnitSvg } from '../src/lib/crafts/knit/svg';
import type { ExpandedRound } from '../src/lib/expand/op';

function parseExpand(index: number, src: string): ExpandedRound {
  const parsed = parseKnitRound(index, src);
  expect(parsed.errors).toEqual([]);
  return expandKnit(parsed.body!, index);
}

describe('knit parser', () => {
  it('후치 반복수 — k3 은 겉뜨기 3코', () => {
    const r = parseExpand(1, 'k3');
    expect(r.ops).toHaveLength(3);
    expect(r.ops.every((o) => o.kind === 'KNIT')).toBe(true);
    expect(r.totalProduce).toBe(3);
  });

  it('전치 반복수(코바늘식 3k)도 허용', () => {
    const r = parseExpand(1, '3k');
    expect(r.ops).toHaveLength(3);
  });

  it('앞뒤 양쪽에 숫자를 쓰면 에러', () => {
    const parsed = parseKnitRound(1, '2k2');
    expect(parsed.errors.length).toBeGreaterThan(0);
  });

  it('k2tog 는 하나의 코로 인식 (k + 2 로 쪼개지지 않음)', () => {
    const r = parseExpand(1, 'k2tog');
    expect(r.ops).toHaveLength(1);
    expect(r.ops[0]!.kind).toBe('K2TOG');
    expect(r.ops[0]!.consume).toBe(2);
    expect(r.ops[0]!.produce).toBe(1);
  });

  it('k3tog 는 3코를 소비', () => {
    const r = parseExpand(1, 'k3tog');
    expect(r.ops[0]!.kind).toBe('K2TOG');
    expect(r.ops[0]!.consume).toBe(3);
  });

  it('sssk 는 왼쪽 기욺 3코 모아뜨기', () => {
    const r = parseExpand(1, 'sssk');
    expect(r.ops[0]!.kind).toBe('SSK');
    expect(r.ops[0]!.consume).toBe(3);
  });

  it('yo 는 부모를 소비하지 않고 코를 만든다', () => {
    const r = parseExpand(1, 'yo');
    expect(r.ops[0]!.consume).toBe(0);
    expect(r.ops[0]!.produce).toBe(1);
  });

  it('m1l/m1r 은 consume 0', () => {
    const r = parseExpand(1, 'm1l, m1r');
    expect(r.totalConsume).toBe(0);
    expect(r.totalProduce).toBe(2);
    expect(r.ops.map((o) => o.kind)).toEqual(['M1L', 'M1R']);
  });

  it('kfb 는 1코를 2코로', () => {
    const r = parseExpand(1, 'kfb');
    expect(r.ops[0]!.consume).toBe(1);
    expect(r.ops[0]!.produce).toBe(2);
  });

  it('반복 (k2,p2)*3', () => {
    const r = parseExpand(1, '(k2, p2)*3');
    expect(r.ops).toHaveLength(12);
    expect(r.ops.map((o) => o.kind).slice(0, 5)).toEqual(['KNIT', 'KNIT', 'PURL', 'PURL', 'KNIT']);
  });

  it('레이스 한 단 — 코 수 보존', () => {
    const r = parseExpand(1, 'k1, yo, ssk, k17');
    expect(r.totalConsume).toBe(20);
    expect(r.totalProduce).toBe(20);
  });

  it('알 수 없는 기호는 에러', () => {
    const parsed = parseKnitRound(1, 'k2, zz');
    expect(parsed.errors.length).toBeGreaterThan(0);
  });

  it('코바늘 기호는 대바늘에서 인식되지 않는다', () => {
    const parsed = parseKnitRound(1, '@, 6X');
    expect(parsed.errors.length).toBeGreaterThan(0);
  });

  it('주석과 색상 표기 지원', () => {
    const r = parseExpand(1, 'k2 "여기 주의", p2:red');
    expect(r.ops[0]!.comment).toBe('여기 주의');
    expect(r.ops[2]!.color).toBeTruthy();
  });

  it('닫히지 않은 괄호는 에러', () => {
    expect(parseKnitRound(1, '(k2, p2').errors.length).toBeGreaterThan(0);
  });

  it('`)` 뒤 `*N` 누락은 에러', () => {
    expect(parseKnitRound(1, '(k2, p2)').errors.length).toBeGreaterThan(0);
  });
});

describe('knit 겉면/안면', () => {
  it('원통은 모든 단이 겉면', () => {
    expect(isRightSide('round', 1, undefined)).toBe(true);
    expect(isRightSide('round', 2, undefined)).toBe(true);
    expect(isRightSide('round', 7, undefined)).toBe(true);
  });

  it('평면은 홀수단 겉면 / 짝수단 안면', () => {
    expect(isRightSide('flat', 1, undefined)).toBe(true);
    expect(isRightSide('flat', 2, undefined)).toBe(false);
    expect(isRightSide('flat', 3, undefined)).toBe(true);
  });

  it('direction=reverse 는 면을 수동으로 뒤집는다', () => {
    expect(isRightSide('flat', 1, 'reverse')).toBe(false);
    expect(isRightSide('flat', 2, 'reverse')).toBe(true);
  });

  it('안면에서 뜬 안뜨기는 겉면에서 겉뜨기로 보인다', () => {
    const r = parseExpand(2, 'p1');
    expect(flipOp(r.ops[0]!).kind).toBe('KNIT');
  });

  it('안면 줄임은 짝이 바뀐다 (p2tog → ssk 모양)', () => {
    const r = parseExpand(2, 'p2tog');
    expect(flipOp(r.ops[0]!).kind).toBe('SSK');
  });

  it('yo 는 반전되지 않는다', () => {
    const r = parseExpand(2, 'yo');
    expect(flipOp(r.ops[0]!).kind).toBe('YO');
  });

  it('겉면 단은 뜬 순서를 뒤집어 좌→우로 배치', () => {
    const r = parseExpand(1, 'k1, p1, yo');
    expect(toDisplayOrder(r, true).map((o) => o.kind)).toEqual(['YO', 'PURL', 'KNIT']);
  });

  it('안면 단은 뜬 순서 그대로, 기호만 반전', () => {
    const r = parseExpand(2, 'k1, p1');
    expect(toDisplayOrder(r, false).map((o) => o.kind)).toEqual(['PURL', 'KNIT']);
  });

  it('flipSymbols=false 면 반전하지 않는다', () => {
    const r = parseExpand(2, 'k1, p1');
    expect(toDisplayOrder(r, false, false).map((o) => o.kind)).toEqual(['KNIT', 'PURL']);
  });
});

describe('knit 격자 레이아웃', () => {
  it('1코 = 1칸, 1단이 맨 아래', () => {
    const rounds = [parseExpand(1, 'k4'), parseExpand(2, 'p4')];
    const layout = layoutKnitGrid(rounds, { shape: 'flat' });
    expect(layout.stitches).toHaveLength(8);
    const row1 = layout.stitches.filter((s) => s.roundIndex === 1);
    const row2 = layout.stitches.filter((s) => s.roundIndex === 2);
    // 1단이 아래 = y 가 더 큼
    expect(row1[0]!.position.y).toBeGreaterThan(row2[0]!.position.y);
  });

  it('원통/평면 모두 같은 격자 셀 크기를 쓴다', () => {
    const rounds = [parseExpand(1, 'k4')];
    const flat = layoutKnitGrid(rounds, { shape: 'flat' });
    const round = layoutKnitGrid(rounds, { shape: 'round' });
    expect(flat.cellSize).toEqual(round.cellSize);
    expect(flat.stitches.map((s) => s.position.x)).toEqual(round.stitches.map((s) => s.position.x));
  });

  it('코 수가 다르면 no-stitch 로 채운다 (기본 가운데 정렬)', () => {
    const rounds = [parseExpand(1, 'k6'), parseExpand(2, 'p4')];
    const layout = layoutKnitGrid(rounds, { shape: 'round' });
    // 2단은 4칸 → 좌우 1칸씩 채움
    expect(layout.fillerCells).toHaveLength(2);
    const row2 = layout.stitches.filter((s) => s.roundIndex === 2);
    expect(row2[0]!.cell!.col).toBe(1);
  });

  it('align=L 이면 왼쪽 정렬', () => {
    const rounds = [parseExpand(1, 'k6'), parseExpand(2, 'p4')];
    const layout = layoutKnitGrid(rounds, { shape: 'round', align: 'L' });
    const row2 = layout.stitches.filter((s) => s.roundIndex === 2);
    expect(row2[0]!.cell!.col).toBe(0);
  });

  it('kfb 는 만든 코 수만큼 칸을 차지', () => {
    const rounds = [parseExpand(1, 'k1, kfb, k1')];
    const layout = layoutKnitGrid(rounds, { shape: 'round' });
    const kfb = layout.stitches.find((s) => s.op.kind === 'KFB')!;
    expect(kfb.cell!.span).toBe(2);
    // 총 4칸 (1 + 2 + 1)
    expect(layout.bounds.width).toBeGreaterThanOrEqual(4 * KNIT_CELL_WIDTH);
  });

  it('겉면 단 번호는 오른쪽, 안면 단 번호는 왼쪽', () => {
    const rounds = [parseExpand(1, 'k4'), parseExpand(2, 'p4')];
    const layout = layoutKnitGrid(rounds, { shape: 'flat' });
    const m1 = layout.roundMarkers.find((m) => m.roundIndex === 1)!;
    const m2 = layout.roundMarkers.find((m) => m.roundIndex === 2)!;
    expect(m1.direction).toBe('right');
    expect(m1.position.x).toBeGreaterThan(0);
    expect(m2.direction).toBe('left');
    expect(m2.position.x).toBeLessThan(0);
  });

  it('원통은 모든 단 번호가 오른쪽', () => {
    const rounds = [parseExpand(1, 'k4'), parseExpand(2, 'k4')];
    const layout = layoutKnitGrid(rounds, { shape: 'round' });
    expect(layout.roundMarkers.every((m) => m.direction === 'right')).toBe(true);
  });
});

describe('knit 렌더러', () => {
  it('격자·기호·단 번호를 그린다', () => {
    const rounds = [parseExpand(1, 'k2, yo, ssk'), parseExpand(2, 'p4')];
    const svg = renderKnitSvg({ layout: layoutKnitGrid(rounds, { shape: 'flat' }) });
    expect(svg).toContain('<svg');
    expect(svg).toContain('class="grid"');
    expect(svg).toContain('#knit-KNIT');
    expect(svg).toContain('#knit-YO');
    expect(svg).toContain('class="round-numbers"');
    expect(svg).toContain('data-round="1"');
  });

  it('no-stitch 칸은 회색으로 채운다', () => {
    const rounds = [parseExpand(1, 'k6'), parseExpand(2, 'k4')];
    const svg = renderKnitSvg({ layout: layoutKnitGrid(rounds, { shape: 'round' }) });
    expect(svg).toContain('class="no-stitch"');
  });

  it('연결선은 그리지 않는다', () => {
    const rounds = [parseExpand(1, 'k4')];
    const svg = renderKnitSvg({ layout: layoutKnitGrid(rounds, { shape: 'round' }) });
    expect(svg).not.toContain('class="connections"');
  });
});
