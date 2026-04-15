#!/usr/bin/env node
/**
 * 샘플 도안을 두 가지 spacing 모드로 SVG 생성.
 *   node scripts/preview.mjs
 * 결과: preview_circular_uniform.svg, preview_circular_proportional.svg, preview_flat.svg
 */

import { writeFileSync } from 'node:fs';
import { parseRound } from '../src/lib/parser/parser.ts';
import { expand } from '../src/lib/expand/expander.ts';
import { layoutCircular } from '../src/lib/layout/circular.ts';
import { layoutFlat } from '../src/lib/layout/flat.ts';
import { renderSvg } from '../src/lib/render/svg.ts';

function expandAll(sources) {
  return sources.map((src, i) => {
    const r = parseRound(i + 1, src);
    if (!r.body) {
      console.error(`Round ${i + 1} parse failed:`, r.errors);
      process.exit(1);
    }
    return expand(r.body, i + 1);
  });
}

const circularSources = [
  '@, 6X',
  '6V',
  '(1X, 1V) * 6',
  '(2X, 1V) * 6',
  '(3X, 1V) * 6',
  '24X',
];
const flatSources = [
  '6O',
  '6X',
  '(1X, 1V) * 3',
  '9X',
  '(2X, 1V) * 3',
];

const circularRounds = expandAll(circularSources);
const flatRounds = expandAll(flatSources);

writeFileSync(
  'preview_circular.svg',
  renderSvg({
    layout: layoutCircular(circularRounds, { spacing: 'uniform' }),
    showGrid: true,
  }),
);
writeFileSync(
  'preview_flat.svg',
  renderSvg({
    layout: layoutFlat(flatRounds),
    showGrid: true,
  }),
);

console.log('Generated:');
console.log('  preview_circular.svg');
console.log('  preview_flat.svg');
