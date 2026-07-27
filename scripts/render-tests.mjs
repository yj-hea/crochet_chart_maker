#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { parseRound } from '../src/lib/parser/parser.ts';
import { expand } from '../src/lib/expand/expander.ts';
import { layoutCircular } from '../src/lib/layout/circular.ts';
import { layoutFlat } from '../src/lib/layout/flat.ts';
import { renderSvg } from '../src/lib/render/svg.ts';

const files = process.argv.slice(2);
for (const f of files) {
  const data = JSON.parse(readFileSync(f, 'utf-8'));
  const expanded = data.rounds.map((r, i) => {
    const p = parseRound(i + 1, r.source);
    if (!p.body) { console.error(`R${i+1} parse fail`); process.exit(1); }
    return expand(p.body, i + 1);
  });
  const layout = data.shape === 'flat'
    ? layoutFlat(expanded, { align: data.flatAlign ?? 'L' })
    : layoutCircular(expanded);
  const svg = renderSvg({ layout, showGrid: true });
  const out = f.replace(/\.crochet\.json$/, '.rendered.svg');
  writeFileSync(out, svg);
  console.log(`wrote ${out}`);

  // 사슬 vs 비사슬, 또는 다른 round 끼리 겹침. 같은 round 내 인접 사슬은 의도된 GAP 이라 제외.
  const visible = layout.stitches.filter(s => !s.hidden && s.op.kind !== 'MAGIC');
  const OVERLAP_THRESHOLD = 20;
  const overlaps = [];
  for (let i = 0; i < visible.length; i++) {
    for (let j = i + 1; j < visible.length; j++) {
      const a = visible[i], b = visible[j];
      const sameRound = a.roundIndex === b.roundIndex;
      const bothChains = a.op.kind === 'CHAIN' && b.op.kind === 'CHAIN';
      if (sameRound && bothChains) continue; // 같은 round 사슬끼리는 GAP 처리됨
      const d = Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);
      if (d < OVERLAP_THRESHOLD) overlaps.push({ a, b, d });
    }
  }
  console.log(`\n=== Cross overlaps (< ${OVERLAP_THRESHOLD}px) in ${f}: ${overlaps.length} ===`);
  for (const { a, b, d } of overlaps.slice(0, 30)) {
    console.log(`  R${a.roundIndex} ${a.op.kind} (${a.position.x.toFixed(0)},${a.position.y.toFixed(0)}) <-> R${b.roundIndex} ${b.op.kind} (${b.position.x.toFixed(0)},${b.position.y.toFixed(0)}) d=${d.toFixed(1)}`);
  }
}
