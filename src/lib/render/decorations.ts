/**
 * 덧그림(연결선·이름표) 렌더 — 두 크래프트가 함께 쓴다.
 * 조각을 합쳐 그릴 때 조각끼리·몸통과의 관계를 보여 준다 (`layout/compose.ts`).
 */

import type { Decoration } from '$lib/layout/types';

const INK = '#3a3632';

export function renderDecorations(decorations: ReadonlyArray<Decoration> | undefined): string {
  if (!decorations || decorations.length === 0) return '';
  const parts = decorations.map((d) => {
    if (d.kind === 'line') {
      return `<line x1="${fmt(d.from.x)}" y1="${fmt(d.from.y)}" x2="${fmt(d.to.x)}" y2="${fmt(d.to.y)}" ` +
        `stroke="${INK}" stroke-width="1" opacity="0.5"` +
        (d.dashed ? ' stroke-dasharray="4 3"' : '') +
        ` vector-effect="non-scaling-stroke"/>`;
    }
    return `<text x="${fmt(d.at.x)}" y="${fmt(d.at.y)}" font-size="8" ` +
      `font-family="'Noto Sans KR', system-ui, sans-serif" ` +
      `fill="${d.muted ? '#8a8378' : INK}" text-anchor="${d.align ?? 'start'}" ` +
      `dominant-baseline="central">${escapeText(d.text)}</text>`;
  });
  return `<g class="decorations">${parts.join('')}</g>`;
}

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
