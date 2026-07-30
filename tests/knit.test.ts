import { describe, expect, it } from 'vitest';
import { parseKnitRound } from '../src/lib/crafts/knit/parser';
import { expandKnit } from '../src/lib/crafts/knit/expander';
import { layoutKnitGrid, KNIT_CELL_WIDTH, KNIT_CELL_HEIGHT } from '../src/lib/crafts/knit/grid';
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

  it('cascade OFF: 코 수가 다르면 좌우 no-stitch 로 채운다 (기본 가운데 정렬)', () => {
    const rounds = [parseExpand(1, 'k6'), parseExpand(2, 'p4')];
    const layout = layoutKnitGrid(rounds, { shape: 'round', cascade: false });
    // 2단은 4칸 → 좌우 1칸씩 채움
    expect(layout.fillerCells).toHaveLength(2);
    const row2 = layout.stitches.filter((s) => s.roundIndex === 2);
    expect(row2[0]!.cell!.col).toBe(1);
  });

  it('cascade OFF + align=L 이면 왼쪽 정렬', () => {
    const rounds = [parseExpand(1, 'k6'), parseExpand(2, 'p4')];
    const layout = layoutKnitGrid(rounds, { shape: 'round', align: 'L', cascade: false });
    const row2 = layout.stitches.filter((s) => s.roundIndex === 2);
    expect(row2[0]!.cell!.col).toBe(0);
  });

  it('cascade ON: 소비되지 않은 부모 위에 빈 칸이 생긴다', () => {
    const rounds = [parseExpand(1, 'k6'), parseExpand(2, 'p4')];
    const layout = layoutKnitGrid(rounds, { shape: 'round' });
    const row2 = layout.stitches.filter((s) => s.roundIndex === 2);
    // 실제 코 4개는 왼쪽부터, 남은 부모 2개 위는 빈 칸
    expect(row2[0]!.cell!.col).toBe(0);
    expect(layout.fillerCells).toHaveLength(2);
    const row1Y = layout.stitches.find((s) => s.roundIndex === 1)!.position.y;
    // 빈 칸은 2단(위쪽) 에 위치
    expect(layout.fillerCells!.every((f) => f.y < row1Y)).toBe(true);
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

describe('knit cascade — 늘림/줄임에 맞춘 칸 폭', () => {
  function rowSpan(layout: ReturnType<typeof layoutKnitGrid>, roundIndex: number): number {
    const stitches = layout.stitches.filter((s) => s.roundIndex === roundIndex);
    return stitches.reduce((sum, s) => sum + (s.cell?.span ?? 1), 0);
  }

  it('kfb 의 부모 칸이 2칸으로 넓어진다', () => {
    const rounds = [parseExpand(1, 'k4'), parseExpand(2, 'k1, kfb, k2')];
    const layout = layoutKnitGrid(rounds, { shape: 'round', cascade: true });
    const row1 = layout.stitches.filter((s) => s.roundIndex === 1);
    // 2단의 kfb 가 소비하는 부모(표시 순서 2번째)가 2칸
    const widened = row1.filter((s) => (s.cell?.span ?? 1) === 2);
    expect(widened).toHaveLength(1);
    // 두 단의 총 폭이 같아진다 → no-stitch 채움 불필요
    expect(rowSpan(layout, 1)).toBe(5);
    expect(rowSpan(layout, 2)).toBe(5);
    expect(layout.fillerCells).toHaveLength(0);
  });

  it('kfb 자식과 부모의 칸이 같은 x 범위를 덮는다', () => {
    const rounds = [parseExpand(1, 'k4'), parseExpand(2, 'k1, kfb, k2')];
    const layout = layoutKnitGrid(rounds, { shape: 'round', cascade: true });
    const parent = layout.stitches.find((s) => s.roundIndex === 1 && s.cell?.span === 2)!;
    const kfb = layout.stitches.find((s) => s.op.kind === 'KFB')!;
    expect(kfb.position.x).toBeCloseTo(parent.position.x);
  });

  it('cascade OFF 면 모든 부모 칸이 1칸 (부족분은 no-stitch)', () => {
    const rounds = [parseExpand(1, 'k4'), parseExpand(2, 'k1, kfb, k2')];
    const layout = layoutKnitGrid(rounds, { shape: 'round', cascade: false });
    const row1 = layout.stitches.filter((s) => s.roundIndex === 1);
    expect(row1.every((s) => (s.cell?.span ?? 1) === 1)).toBe(true);
    expect(layout.fillerCells!.length).toBeGreaterThan(0);
  });

  it('k2tog 는 부모 둘의 폭만큼 넓어진다', () => {
    const rounds = [parseExpand(1, 'k4'), parseExpand(2, 'k1, k2tog, k1')];
    const layout = layoutKnitGrid(rounds, { shape: 'round', cascade: true });
    const dec = layout.stitches.find((s) => s.op.kind === 'K2TOG')!;
    expect(dec.cell!.span).toBe(2);
    expect(rowSpan(layout, 1)).toBe(4);
    expect(rowSpan(layout, 2)).toBe(4);
  });

  it('부모 없는 yo 아래에는 빈 칸(no stitch)이 생긴다', () => {
    const rounds = [parseExpand(1, 'k4'), parseExpand(2, 'k1, yo, k3')];
    const layout = layoutKnitGrid(rounds, { shape: 'round', cascade: true });
    expect(rowSpan(layout, 2)).toBe(5);
    // 1단은 4코 + yo 자리 빈 칸 1 → 총 폭 5, 채움 칸 1개
    expect(layout.fillerCells).toHaveLength(1);
    const yo = layout.stitches.find((s) => s.op.kind === 'YO')!;
    expect(layout.fillerCells![0]!.x).toBeCloseTo(yo.position.x);
  });

  it('빈 칸은 더 아래 단으로도 전파된다', () => {
    const rounds = [parseExpand(1, 'k4'), parseExpand(2, 'k1, yo, k3'), parseExpand(3, 'k5')];
    const layout = layoutKnitGrid(rounds, { shape: 'round', cascade: true });
    // 3단 5코 / 2단 5칸 / 1단 4코 + 빈칸 1
    expect(rowSpan(layout, 3)).toBe(5);
    expect(layout.fillerCells).toHaveLength(1);
    expect(layout.fillerCells![0]!.y).toBeGreaterThan(0);
  });
});

describe('knit 게이지', () => {
  it('미입력이면 기본 셀 비율 1:0.7', () => {
    const layout = layoutKnitGrid([parseExpand(1, 'k4')], { shape: 'round' });
    expect(layout.cellSize).toEqual({ width: KNIT_CELL_WIDTH, height: KNIT_CELL_HEIGHT });
  });

  it('셀 세로가 코수/단수 비율로 조정된다', () => {
    // 22코 30단 → 22/30 = 0.733… → 20 × 14.67
    const layout = layoutKnitGrid([parseExpand(1, 'k4')], {
      shape: 'round',
      gauge: { stitches: 22, rows: 30 },
    });
    expect(layout.cellSize!.width).toBe(KNIT_CELL_WIDTH);
    expect(layout.cellSize!.height).toBeCloseTo(20 * (22 / 30), 5);
  });

  it('가로 폭은 게이지와 무관하게 유지된다', () => {
    const rounds = [parseExpand(1, 'k6')];
    const base = layoutKnitGrid(rounds, { shape: 'round' });
    const gauged = layoutKnitGrid(rounds, { shape: 'round', gauge: { stitches: 28, rows: 36 } });
    expect(gauged.bounds.width).toBe(base.bounds.width);
    expect(gauged.stitches.map((s) => s.position.x)).toEqual(base.stitches.map((s) => s.position.x));
  });

  it('단 수가 많아지면 세로 길이가 게이지 비율대로 늘어난다', () => {
    const rounds = [parseExpand(1, 'k4'), parseExpand(2, 'k4'), parseExpand(3, 'k4')];
    const g = { stitches: 20, rows: 40 }; // 비율 0.5 → 셀 높이 10
    const layout = layoutKnitGrid(rounds, { shape: 'round', gauge: g });
    expect(layout.bounds.height).toBeCloseTo(3 * 10, 5);
  });

  it('잘못된 게이지는 기본 비율로 폴백', () => {
    const layout = layoutKnitGrid([parseExpand(1, 'k4')], {
      shape: 'round',
      gauge: { stitches: 0, rows: -5 },
    });
    expect(layout.cellSize!.height).toBe(KNIT_CELL_HEIGHT);
  });
});

describe('코잡기 / 코막음', () => {
  it('co40 은 부모 없이 40코를 만든다', () => {
    const r = parseExpand(1, 'co40');
    expect(r.ops).toHaveLength(40);
    expect(r.ops[0]!.kind).toBe('CAST_ON');
    expect(r.totalConsume).toBe(0);
    expect(r.totalProduce).toBe(40);
  });

  it('코잡기 단 위에 일반 단이 정확히 얹힌다', () => {
    const rounds = [parseExpand(1, 'co6'), parseExpand(2, 'k6')];
    const layout = layoutKnitGrid(rounds, { shape: 'flat' });
    // 두 단 모두 6칸, 채움 없음
    expect(layout.stitches.filter((s) => s.roundIndex === 1)).toHaveLength(6);
    expect(layout.fillerCells).toHaveLength(0);
  });

  it('bo 는 코를 없앤다', () => {
    const r = parseExpand(3, 'bo6');
    expect(r.ops[0]!.kind).toBe('BIND_OFF');
    expect(r.totalConsume).toBe(6);
    expect(r.totalProduce).toBe(0);
  });

  it('코막음 칸도 격자에 그려진다', () => {
    const rounds = [parseExpand(1, 'co4'), parseExpand(2, 'k4'), parseExpand(3, 'bo4')];
    const layout = layoutKnitGrid(rounds, { shape: 'flat' });
    expect(layout.stitches.filter((s) => s.roundIndex === 3)).toHaveLength(4);
    const svg = renderKnitSvg({ layout });
    expect(svg).toContain('#knit-BIND_OFF');
    expect(svg).toContain('#knit-CAST_ON');
  });

  it('별칭 cast-on / bind-off 도 인식', () => {
    expect(parseExpand(1, 'cast-on4').ops[0]!.kind).toBe('CAST_ON');
    expect(parseExpand(1, 'bind-off4').ops[0]!.kind).toBe('BIND_OFF');
  });
});

describe('되돌아뜨기 (short row)', () => {
  it('unw 는 뜨지 않고 코를 통과시킨다 (1 → 1)', () => {
    const r = parseExpand(3, 'unw7');
    expect(r.ops[0]!.kind).toBe('UNWORKED');
    expect(r.totalConsume).toBe(7);
    expect(r.totalProduce).toBe(7);
  });

  it('짧은 단도 코 수가 보존되어 경고가 나지 않는다', () => {
    const r = parseExpand(3, 'k12, wt, unw7');
    expect(r.totalConsume).toBe(20);
    expect(r.totalProduce).toBe(20);
  });

  it('wt / w&t / ds 인식', () => {
    expect(parseExpand(1, 'wt').ops[0]!.kind).toBe('WRAP_TURN');
    expect(parseExpand(1, 'w&t').ops[0]!.kind).toBe('WRAP_TURN');
    expect(parseExpand(1, 'ds').ops[0]!.kind).toBe('DOUBLE_ST');
  });

  it('미작업 코는 회색 칸으로 그려진다', () => {
    const rounds = [parseExpand(1, 'co6'), parseExpand(2, 'k3, wt, unw2')];
    const layout = layoutKnitGrid(rounds, { shape: 'flat' });
    const svg = renderKnitSvg({ layout });
    expect(svg).toContain('class="no-stitch"');
    expect(svg).toContain('#knit-WRAP_TURN');
    // 미작업 코도 코이므로 stitches 에 남아 있다 (진행 추적용)
    expect(layout.stitches.filter((s) => s.op.kind === 'UNWORKED')).toHaveLength(2);
  });

  it('되돌아뜨기 후 전체 단을 다시 뜰 수 있다', () => {
    // 돌아오는 단(WS)에서는 이미 지나온 미작업 코를 **앞에** 적는다
    const rows = ['co20', 'k20', 'k12, wt, unw7', 'unw7, p13', 'k20'];
    const rounds = rows.map((src, i) => parseExpand(i + 1, src));
    // 모든 단이 20코를 유지
    for (const r of rounds.slice(1)) expect(r.totalProduce).toBe(20);
    const layout = layoutKnitGrid(rounds, { shape: 'flat' });
    expect(layout.stitches.filter((s) => s.roundIndex === 5)).toHaveLength(20);
  });

  it('가는 단과 오는 단의 미작업 구간이 같은 열에 놓인다', () => {
    const rows = ['co8', 'k8', 'k5, wt, unw2', 'unw2, p6'];
    const rounds = rows.map((src, i) => parseExpand(i + 1, src));
    const layout = layoutKnitGrid(rounds, { shape: 'flat' });
    const xs = (round: number) => layout.stitches
      .filter((s) => s.roundIndex === round && s.op.kind === 'UNWORKED')
      .map((s) => s.position.x)
      .sort((a, b) => a - b);
    expect(xs(3)).toEqual(xs(4));
    expect(xs(3)).toHaveLength(2);
  });
});

describe('단 중간 코막음 / 감아코', () => {
  it('중간 코막음 위에는 빈 칸이 생긴다', () => {
    const rounds = [parseExpand(1, 'co10'), parseExpand(2, 'k3, bo4, k3'), parseExpand(3, 'k6')];
    expect(rounds[1]!.totalConsume).toBe(10);
    expect(rounds[1]!.totalProduce).toBe(6);
    const layout = layoutKnitGrid(rounds, { shape: 'flat' });
    // 3단은 실제 6코 + 코막음 자리 4칸(빈 칸)
    expect(layout.stitches.filter((s) => s.roundIndex === 3)).toHaveLength(6);
    const row3Y = layout.stitches.find((s) => s.roundIndex === 3)!.position.y;
    expect(layout.fillerCells!.filter((f) => f.y === row3Y)).toHaveLength(4);
  });

  it('감아코(단 중간 co)는 아래에 빈 칸을 만든다', () => {
    const rounds = [parseExpand(1, 'co6'), parseExpand(2, 'k3, co4, k3')];
    expect(rounds[1]!.totalConsume).toBe(6);
    expect(rounds[1]!.totalProduce).toBe(10);
    const layout = layoutKnitGrid(rounds, { shape: 'flat' });
    const row1Y = layout.stitches.find((s) => s.roundIndex === 1)!.position.y;
    // 1단(아래) 에 새로 만든 4코 자리만큼 빈 칸
    expect(layout.fillerCells!.filter((f) => f.y === row1Y)).toHaveLength(4);
  });

  it('감아코 별칭 ewrap / blco', () => {
    expect(parseExpand(1, 'ewrap3').ops[0]!.kind).toBe('CAST_ON');
    expect(parseExpand(1, 'blco3').ops[0]!.kind).toBe('CAST_ON');
  });
});
