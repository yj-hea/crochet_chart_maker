import { describe, expect, it } from 'vitest';
import { parseKnitRound } from '../src/lib/crafts/knit/parser';
import { expandKnit } from '../src/lib/crafts/knit/expander';
import { fillUnworked } from '../src/lib/crafts/knit/unworked';
import { layoutKnitGrid } from '../src/lib/crafts/knit/grid';
import { renderKnitSvg } from '../src/lib/crafts/knit/svg';
import { flipOp } from '../src/lib/crafts/knit/flip';
import { validateRound } from '../src/lib/validate';
import { renderNarrative } from '../src/lib/narrative';
import type { ExpandedRound } from '../src/lib/expand/op';

function rows(...srcs: string[]): ExpandedRound[] {
  return fillUnworked(srcs.map((src, i) => {
    const parsed = parseKnitRound(i + 1, src);
    expect(parsed.errors, src).toEqual([]);
    return expandKnit(parsed.body!, i + 1);
  })) as ExpandedRound[];
}

function checkAll(rs: ExpandedRound[]): void {
  for (let i = 1; i < rs.length; i++) {
    expect(validateRound(rs[i]!, rs[i - 1]!), `${i + 1}단`).toEqual([]);
  }
}

describe('쉼코 (hold)', () => {
  it('코를 없애지 않는다 — 1 → 1', () => {
    const r = rows('co40', 'hold10, k20, hold10');
    expect(r[1]!.totalConsume).toBe(40);
    expect(r[1]!.totalProduce).toBe(40);
    checkAll(r);
  });

  it('별칭 holder·hld 도 같은 코', () => {
    for (const src of ['hold4', 'holder4', 'hld4']) {
      expect(rows('co4', src)[1]!.ops.every((o) => o.kind === 'HOLD'), src).toBe(true);
    }
  });

  it('안면 단에서도 모습이 그대로다 (좌우가 없는 기호)', () => {
    const r = rows('co4', 'hold4');
    expect(r[1]!.ops.map((o) => flipOp(o).kind)).toEqual(['HOLD', 'HOLD', 'HOLD', 'HOLD']);
  });

  it('도안에 쉼코 기호로 그려진다 — 미작업 코의 회색 칸과 구분된다', () => {
    const r = rows('co6', 'hold2, k2, hold2');
    const svg = renderKnitSvg({ layout: layoutKnitGrid(r, { shape: 'flat' }), showGrid: true });
    expect(svg).toContain('#knit-HOLD');
    // 쉼코는 살아 있는 코라 빈칸(회색)으로 칠하지 않는다
    expect(svg.match(/#knit-HOLD/g)).toHaveLength(4);
  });

  it('서술 도안에 쉼코로 나온다', () => {
    const parsed = parseKnitRound(2, 'hold10, k20');
    const { html } = renderNarrative(parsed, parsed.source, 'knit');
    expect(html.replace(/<[^>]+>/g, '')).toBe('hold10, k20');
  });

  it('되돌아뜨기 자동 채우기와 섞이지 않는다', () => {
    const r = rows('co40', 'hold10, k20, hold10', 'hold10, p20, hold10');
    expect(r.every((x) => x.ops.every((o) => !o.autoFilled))).toBe(true);
    checkAll(r);
  });
});

describe('감아코 (단 중간 co)', () => {
  it('부모 없이 코를 더한다 — 0 → N', () => {
    const r = rows('co20', 'k20', 'k10, co8, k10');
    expect([r[2]!.totalConsume, r[2]!.totalProduce]).toEqual([20, 28]);
    checkAll(r);
  });

  it('감아코 아래에는 부모가 없어 빈칸이 생긴다', () => {
    const r = rows('co20', 'k20', 'k10, co8, k10');
    const layout = layoutKnitGrid(r, { shape: 'flat' });
    expect(layout.stitches.filter((s) => s.roundIndex === 3)).toHaveLength(28);
    const holes = (layout.fillerCells ?? []).filter((f) => f.kind === 'hole');
    expect(holes.reduce((n, f) => n + f.span, 0)).toBe(8);
  });

  it('별칭 ewrap·blco 도 같은 코', () => {
    for (const src of ['co3', 'ewrap3', 'blco3']) {
      expect(rows('co3', `k3, ${src}`)[1]!.totalProduce, src).toBe(6);
    }
  });
});
