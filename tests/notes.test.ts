import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { renderNotes } from '../src/lib/render/notes';
import { parseKnitRound } from '../src/lib/crafts/knit/parser';
import { expandKnit } from '../src/lib/crafts/knit/expander';
import { layoutKnitGrid } from '../src/lib/crafts/knit/grid';
import { applyAdjustments } from '../src/lib/layout/adjust';
import { renderKnitSvg } from '../src/lib/crafts/knit/svg';
import {
  workspace, createTab, updateRoundSource, addRoundAtEnd, addComment,
} from '../src/stores/tabs';
import { chartNotes } from '../src/stores/rendered';
import { setViewOption } from '../src/stores/tabs';

function layout(...srcs: string[]) {
  const rounds = srcs.map((src, i) => expandKnit(parseKnitRound(i + 1, src).body!, i + 1));
  return applyAdjustments(layoutKnitGrid(rounds, { shape: 'flat' }));
}

function activeTab() {
  const ws = get(workspace);
  return ws.tabs.find((t) => t.id === ws.activeTabId)!;
}

describe('도안에 메모 그리기', () => {
  it('도안 메모는 위쪽에, 단 메모는 그 단 옆에', () => {
    const l = layout('co6', 'k6', 'k6');
    const { svg, box } = renderNotes([
      { key: 'note:pattern', text: '4.0mm 바늘', color: '#4d86ff' },
      { key: 'note:2', text: '여기서 줄임', color: '#4caf50', roundIndex: 2 },
    ], l);
    expect(svg).toContain('data-el="note:pattern"');
    expect(svg).toContain('data-el="note:2"');
    expect(svg).toContain('4.0mm 바늘');
    expect(svg).toContain('>2단<');          // 단 라벨
    // 경계가 도안 밖으로 넓어진다 (위로, 오른쪽으로)
    expect(box!.minY).toBeLessThan(l.bounds.minY);
    expect(box!.maxX).toBeGreaterThan(l.bounds.maxX);
  });

  it('메모가 없으면 아무것도 그리지 않는다', () => {
    expect(renderNotes([], layout('co6')).svg).toBe('');
  });

  it('긴 글은 줄로 쪼개고 마크다운 표식은 덜어낸다', () => {
    const { svg } = renderNotes(
      [{ key: 'note:pattern', text: '**굵게** 적은 아주 긴 설명을 여러 줄로 쪼개어 보여 준다'.repeat(2) }],
      layout('co6'),
    );
    expect(svg).not.toContain('**');
    expect((svg.match(/<text/g) ?? []).length).toBeGreaterThan(1);
  });

  it('렌더러가 도안과 함께 싣는다 — 내보내기에도 들어간다', () => {
    const l = layout('co6', 'k6');
    const svg = renderKnitSvg({
      layout: l,
      showGrid: true,
      notes: [{ key: 'note:pattern', text: '메모 한 줄' }],
    });
    expect(svg).toContain('class="notes"');
    expect(svg).toContain('메모 한 줄');
  });
});

describe('메모 → 도안 행 맞추기', () => {
  it('단 메모가 그 단의 도안 행에 붙는다', () => {
    createTab('knit');
    updateRoundSource(activeTab().rounds[0]!.id, 'co6');
    const second = addRoundAtEnd();
    updateRoundSource(second, 'k6');
    addComment({ kind: 'round', roundId: second }, '여기서 줄임');
    addComment({ kind: 'pattern' }, '4.0mm 바늘');

    const notes = get(chartNotes);
    expect(notes.map((n) => n.key).sort()).toEqual(['note:2', 'note:pattern']);
    expect(notes.find((n) => n.key === 'note:2')!.roundIndex).toBe(2);
  });

  it('되풀이로 펼쳐진 행에도 원본 줄의 메모가 따라간다', () => {
    createTab('knit');
    updateRoundSource(activeTab().rounds[0]!.id, 'co6');
    const rib = addRoundAtEnd();
    updateRoundSource(rib, 'k6');
    addComment({ kind: 'round', roundId: rib }, '무늬 단');
    updateRoundSource(addRoundAtEnd(), '2단 반복*2');

    // 2단과 그 복사본(3·4단) 모두 같은 줄에서 나온다 → 메모가 붙는 행이 있다
    const notes = get(chartNotes);
    expect(notes.some((n) => n.text === '무늬 단')).toBe(true);
  });

  it('메모 표시를 끄면 도안에 넣지 않는다', () => {
    createTab('knit');
    updateRoundSource(activeTab().rounds[0]!.id, 'co6');
    addComment({ kind: 'pattern' }, '숨길 메모');
    expect(get(chartNotes)).toHaveLength(1);
    setViewOption('showNotes', false);
    expect(get(chartNotes)).toHaveLength(0);
    setViewOption('showNotes', true);
  });
});
