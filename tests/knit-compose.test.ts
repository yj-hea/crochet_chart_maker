/**
 * 대바늘 도안을 조각으로 합쳐 그릴 때.
 *
 * 대바늘은 **칸이 도안의 일부**라서, 코바늘처럼 격자를 생략할 수 없다.
 * 조각이 들고 온 빈칸·편물 마커도 함께 와야 하고, 조각마다 게이지가 다르면
 * 칸 높이도 조각마다 달라야 한다.
 */
import { describe, expect, it } from 'vitest';
import { composeWithPieces, sideBySide } from '../src/lib/layout/compose';
import { parseKnitRound } from '../src/lib/crafts/knit/parser';
import { expandKnit } from '../src/lib/crafts/knit/expander';
import { layoutKnitGrid } from '../src/lib/crafts/knit/grid';
import { renderKnitSvg } from '../src/lib/crafts/knit/svg';
import type { Gauge } from '../src/lib/model/gauge';

function knit(srcs: string[], gauge?: Gauge) {
  const rounds = srcs.map((s, i) => expandKnit(parseKnitRound(i + 1, s).body!, i + 1));
  return layoutKnitGrid(rounds, { shape: 'flat', ...(gauge ? { gauge } : {}) });
}

describe('대바늘 조각 합쳐 그리기', () => {
  const body = knit(['k12', 'k12']);
  // 줄임이 빈칸(코막음 자리)을 만들고, pm 이 마커를 하나 남긴다
  const sleeve = knit(['k6', 'k2tog, k2, k2tog, pm', 'k4']);

  it('조각의 빈칸이 함께 온다', () => {
    const fillers = sleeve.fillerCells ?? [];
    expect(fillers.length).toBeGreaterThan(0);
    const out = composeWithPieces(body, [{ name: '소매', layout: sleeve }]);
    expect((out.fillerCells ?? []).length).toBe((body.fillerCells ?? []).length + fillers.length);
    // 조각이 놓인 자리로 옮겨져 있다 — 몸통 아래
    for (const f of (out.fillerCells ?? []).slice((body.fillerCells ?? []).length)) {
      expect(f.y).toBeGreaterThan(body.bounds.maxY);
    }
  });

  it('조각의 편물 마커가 함께 온다', () => {
    expect((sleeve.stitchMarkers ?? []).length).toBe(1);
    const out = composeWithPieces(body, [{ name: '소매', layout: sleeve }]);
    expect((out.stitchMarkers ?? []).length).toBe(1);
    expect((out.stitchMarkers ?? [])[0]!.position.y).toBeGreaterThan(body.bounds.maxY);
  });

  it('합쳐 그려도 칸 테두리를 그린다 — 대바늘은 칸이 도안이다', () => {
    const out = composeWithPieces(body, [{ name: '소매', layout: sleeve }]);
    expect(out.noGrid).toBe(true);        // 코바늘용 안내선은 끈 채로
    const svg = renderKnitSvg({ layout: out, showGrid: true });
    expect(svg).toContain('<g class="grid">');
    // 몸통 + 조각의 코·빈칸 수만큼 칸이 그려진다
    const rects = (svg.match(/<g class="grid">(.*?)<\/g>/s)?.[1] ?? '').match(/<rect/g) ?? [];
    expect(rects.length).toBe(
      out.stitches.length + (out.fillerCells ?? []).length,
    );
  });

  it('게이지가 다른 조각은 자기 칸 높이를 들고 온다', () => {
    const tight = knit(['k6'], { stitches: 20, rows: 40 });
    expect(tight.cellSize!.height).not.toBeCloseTo(body.cellSize!.height);
    const out = composeWithPieces(body, [{ name: '소매', layout: tight }]);
    const foreign = out.stitches.filter((s) => s.foreign);
    expect(foreign.length).toBe(tight.stitches.length);
    for (const s of foreign) expect(s.cell?.size?.height).toBeCloseTo(tight.cellSize!.height);
    // 몸통의 코는 자기 칸 크기를 쓰므로 들고 오는 값이 없다
    expect(out.stitches.find((s) => !s.foreign)?.cell?.size).toBeUndefined();
  });

  it('조각을 돌려 놓으면 칸도 같이 돈다', () => {
    const out = composeWithPieces(body, [
      { name: '소매', layout: sleeve, offset: { rot: 90 } },
    ]);
    const foreign = out.stitches.filter((s) => s.foreign);
    expect(foreign[0]!.cell?.rot).toBeCloseTo(90);
    const svg = renderKnitSvg({ layout: out, showGrid: true });
    expect(svg).toContain('rotate(90');
  });

  it('나란히 놓을 때도 빈칸·마커를 지키고 칸을 그린다', () => {
    const sheet = sideBySide([
      { name: '앞판', layout: body },
      { name: '소매', layout: sleeve },
    ])!;
    expect((sheet.fillerCells ?? []).length)
      .toBe((body.fillerCells ?? []).length + (sleeve.fillerCells ?? []).length);
    expect((sheet.stitchMarkers ?? []).length).toBe(1);
    expect(renderKnitSvg({ layout: sheet, showGrid: true })).toContain('<g class="grid">');
  });

  it('Grid Off 는 그대로 칸을 감춘다', () => {
    const out = composeWithPieces(body, [{ name: '소매', layout: sleeve }]);
    expect(renderKnitSvg({ layout: out, showGrid: false })).not.toContain('<g class="grid">');
  });
});
