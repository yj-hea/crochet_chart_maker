import { describe, expect, it } from 'vitest';
import { parseRound } from '../src/lib/crafts/crochet/parser';
import { expand } from '../src/lib/expand/expander';
import { layoutCircular } from '../src/lib/crafts/crochet/circular';
import { layoutFlat } from '../src/lib/crafts/crochet/flat';
import { renderSvg } from '../src/lib/crafts/crochet/svg';
import { parseKnitRound } from '../src/lib/crafts/knit/parser';
import { expandKnit } from '../src/lib/crafts/knit/expander';
import { layoutKnitGrid, KNIT_CELL_WIDTH } from '../src/lib/crafts/knit/grid';
import { renderKnitSvg } from '../src/lib/crafts/knit/svg';

function crochet(rows: string[]) {
  return rows.map((s, i) => {
    const p = parseRound(i + 1, s);
    expect(p.errors, `파싱 실패: ${s}`).toEqual([]);
    return expand(p.body!, i + 1);
  });
}

function knit(rows: string[]) {
  return rows.map((s, i) => {
    const p = parseKnitRound(i + 1, s);
    expect(p.errors, `파싱 실패: ${s}`).toEqual([]);
    return expandKnit(p.body!, i + 1);
  });
}

describe('마커 파싱', () => {
  it('코바늘 — pm 은 코를 소비/생성하지 않는다', () => {
    const [r] = crochet(['3x, pm, 3x']);
    expect(r!.totalConsume).toBe(6);
    expect(r!.totalProduce).toBe(6);
    expect(r!.ops.filter((o) => o.kind === 'MARKER')).toHaveLength(1);
  });

  it('대바늘 — pm / sm / marker 모두 인식', () => {
    for (const alias of ['pm', 'sm', 'marker', 'PM']) {
      const [r] = knit([`k3, ${alias}, k3`]);
      expect(r!.totalProduce, alias).toBe(6);
      expect(r!.ops.filter((o) => o.kind === 'MARKER'), alias).toHaveLength(1);
    }
  });

  it('색과 라벨을 붙일 수 있다', () => {
    const [r] = knit(['k3, pm:fff "옆선", k3']);
    const m = r!.ops.find((o) => o.kind === 'MARKER')!;
    expect(m.color).toBe('#fff');
    expect(m.comment).toBe('옆선');
  });

  it('반복 안에서도 쓸 수 있다', () => {
    const [r] = knit(['(k4, pm)*3']);
    expect(r!.totalProduce).toBe(12);
    expect(r!.ops.filter((o) => o.kind === 'MARKER')).toHaveLength(3);
  });
});

describe('마커 배치 — 대바늘 격자', () => {
  it('칸 경계에 놓이고 코 위에는 놓이지 않는다', () => {
    // 2단은 안면(WS) — 뜬 순서가 곧 표시 순서
    const L = layoutKnitGrid(knit(['co12', 'k4, pm, k4, pm, k4']), { shape: 'flat' });
    const xs = (L.stitchMarkers ?? []).map((m) => m.position.x);
    expect(xs).toEqual([4 * KNIT_CELL_WIDTH, 8 * KNIT_CELL_WIDTH]);
    // 칸 중심(10, 30, 50…)과 겹치지 않는다
    const centers = L.stitches.filter((s) => s.roundIndex === 2).map((s) => s.position.x);
    for (const x of xs) expect(centers).not.toContain(x);
  });

  it('겉면 단은 뜨는 방향이 반대라 마커도 반대쪽에서 센다', () => {
    // 3단 = 겉면(RS): 오른쪽에서 4코 뒤 → 왼쪽에서는 8칸 뒤
    const L = layoutKnitGrid(knit(['co12', 'k12', 'k4, pm, k8']), { shape: 'flat' });
    const m = (L.stitchMarkers ?? []).find((x) => x.roundIndex === 3)!;
    expect(m.position.x).toBe(8 * KNIT_CELL_WIDTH);
  });

  it('단 맨 앞/맨 뒤에도 놓을 수 있다', () => {
    const L = layoutKnitGrid(knit(['co6', 'pm, k6, pm']), { shape: 'flat' });
    const xs = (L.stitchMarkers ?? []).map((m) => m.position.x).sort((a, b) => a - b);
    expect(xs).toEqual([0, 6 * KNIT_CELL_WIDTH]);
  });

  it('마커는 코 수와 차트 폭을 바꾸지 않는다', () => {
    const plain = layoutKnitGrid(knit(['co12', 'k12']), { shape: 'flat' });
    const marked = layoutKnitGrid(knit(['co12', 'k4, pm, k4, pm, k4']), { shape: 'flat' });
    expect(marked.stitches).toHaveLength(plain.stitches.length);
    expect(marked.bounds.width).toBe(plain.bounds.width);
  });

  it('색을 안 주면 격자색, 주면 그 색으로 그린다', () => {
    const L = layoutKnitGrid(knit(['co6', 'k3, pm, k3', 'k3, pm:fff, k3']), { shape: 'flat' });
    const svg = renderKnitSvg({ layout: L });
    expect(svg).toContain('class="stitch-markers"');
    expect(svg).toContain('stroke="#fff"');
    // 격자선(0.8)보다 굵다
    expect(svg).toMatch(/class="stitch-markers".*stroke-width="1.6"/);
  });
});

describe('마커 배치 — 코바늘', () => {
  it('원형은 이웃한 두 코 사이 각도에 놓인다', () => {
    // 3등분 요크 — 마커 3개가 정확히 120° 간격
    const L = layoutCircular(crochet(['6x', '6v', 'pm, (3x, 1v), pm, (3x, 1v), pm, (3x, 1v)']));
    const deg = (L.stitchMarkers ?? [])
      .map((m) => (m.angle! * 180) / Math.PI)
      .sort((a, b) => a - b);
    expect(deg).toHaveLength(3);
    expect(deg[1]! - deg[0]!).toBeCloseTo(120, 5);
    expect(deg[2]! - deg[1]!).toBeCloseTo(120, 5);
  });

  it('평면은 이웃한 두 코의 중간 x 에 놓인다', () => {
    const L = layoutFlat(crochet(['8x', '2x, pm, 4x, pm, 2x']));
    const row = L.stitches.filter((s) => s.roundIndex === 2).map((s) => s.position.x);
    const xs = (L.stitchMarkers ?? []).map((m) => m.position.x).sort((a, b) => a - b);
    expect(xs).toHaveLength(2);
    expect(xs[0]).toBeCloseTo((row[1]! + row[2]!) / 2, 5);
    expect(xs[1]).toBeCloseTo((row[5]! + row[6]!) / 2, 5);
  });

  it('마커가 코 위치를 밀어내지 않는다', () => {
    const plain = layoutCircular(crochet(['6x', '12x']));
    const marked = layoutCircular(crochet(['6x', '6x, pm, 6x']));
    expect(marked.stitches).toHaveLength(plain.stitches.length);
    for (let i = 0; i < plain.stitches.length; i++) {
      expect(marked.stitches[i]!.position.x).toBeCloseTo(plain.stitches[i]!.position.x, 6);
      expect(marked.stitches[i]!.position.y).toBeCloseTo(plain.stitches[i]!.position.y, 6);
    }
  });

  it('SVG 에 마커 눈금이 나온다', () => {
    const L = layoutCircular(crochet(['6x', '3x, pm, 3x']));
    expect(renderSvg({ layout: L })).toContain('class="stitch-markers"');
  });
});
