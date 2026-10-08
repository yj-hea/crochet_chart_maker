import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { resolveStart, hasCycle, type PieceStart, type PieceInfo } from '../src/lib/model/pieces';
import {
  workspace, createTab, updateRoundSource, addRoundAtEnd, setTabStart,
  activeStart, siblingPieces, toSavedTab, applyWorkspace, renameTab,
} from '../src/stores/tabs';
import { serializeWorkspace, validateWorkspace } from '../src/lib/persistence';

const PIECES: PieceInfo[] = [
  { id: 'a', name: '다리 A', lastCount: 24 },
  { id: 'b', name: '다리 B', lastCount: 24 },
];

describe('조각 코 수 세기', () => {
  it('잇기 — 조각 코 수 합 + 사슬 × 잇는 자리', () => {
    // 설명서 5-2-1: 24 + 24 + 4 + 4 = 56
    const r = resolveStart({ kind: 'join', pieces: ['a', 'b'], chain: 4 }, PIECES)!;
    expect(r.count).toBe(56);
    expect(r.label).toContain('다리 A + 다리 B');
    expect(r.missing).toEqual([]);
  });

  it('잇기 — 사슬 없이 바로 붙이기', () => {
    expect(resolveStart({ kind: 'join', pieces: ['a', 'b'], chain: 0 }, PIECES)!.count).toBe(48);
  });

  it('이어받기 — 전부 또는 일부', () => {
    expect(resolveStart({ kind: 'from', piece: 'a' }, PIECES)!.count).toBe(24);
    const part = resolveStart({ kind: 'from', piece: 'a', stitches: 10 }, PIECES)!;
    expect(part.count).toBe(10);
    expect(part.label).toContain('24코 중');
  });

  it('사라진 조각은 알려 주고 0코로 센다', () => {
    const r = resolveStart({ kind: 'join', pieces: ['a', 'zzz'], chain: 0 }, PIECES)!;
    expect(r.missing).toEqual(['zzz']);
    expect(r.count).toBe(24);
  });

  it('서로 물고 도는 참조를 가린다', () => {
    const starts: Record<string, PieceStart> = {
      x: { kind: 'from', piece: 'y' },
      y: { kind: 'from', piece: 'x' },
    };
    expect(hasCycle('x', (id) => starts[id])).toBe(true);
    expect(hasCycle('x', () => undefined)).toBe(false);
  });
});

describe('조각 시작 — 스토어', () => {
  function tabIds() {
    return get(workspace).tabs.map((t) => t.id);
  }

  it('다른 도안을 가리켜 코 수를 물려받는다', () => {
    createTab('crochet');
    const legA = get(workspace).activeTabId;
    updateRoundSource(get(workspace).tabs.find((t) => t.id === legA)!.rounds[0]!.id, '@, 6X');
    updateRoundSource(addRoundAtEnd(), '6V');          // 12코

    const body = createTab('crochet');
    setTabStart(body, { kind: 'join', pieces: [legA, legA], chain: 4 });
    const start = get(activeStart)!;
    // 12 + 12 + 사슬 4 × 2 군데 = 32
    expect(start.count).toBe(32);
  });

  it('탭 이름을 바꿔도 끊기지 않는다 (id 로 가리킨다)', () => {
    createTab('crochet');
    const leg = get(workspace).activeTabId;
    updateRoundSource(get(workspace).tabs.find((t) => t.id === leg)!.rounds[0]!.id, '@, 6X');
    const body = createTab('crochet');
    setTabStart(body, { kind: 'from', piece: leg });

    renameTab(leg, '왼쪽 다리');
    const start = get(activeStart)!;
    expect(start.label).toContain('왼쪽 다리');
    expect(start.count).toBe(6);
  });

  it('저장 → 복원 뒤에도 남는다', () => {
    createTab('crochet');
    const leg = get(workspace).activeTabId;
    updateRoundSource(get(workspace).tabs.find((t) => t.id === leg)!.rounds[0]!.id, '@, 6X');
    const body = createTab('crochet');
    setTabStart(body, { kind: 'join', pieces: [leg], chain: 2 });

    const ws = get(workspace);
    const wire = JSON.parse(JSON.stringify(
      serializeWorkspace({ tabs: ws.tabs.map(toSavedTab), activeTabId: ws.activeTabId }),
    ));
    applyWorkspace(validateWorkspace(wire));
    const restored = get(workspace).tabs.find((t) => t.id === body)!;
    expect(restored.startsFrom).toEqual({ kind: 'join', pieces: [leg], chain: 2 });
  });

  it('조각 목록에는 같은 작품의 도안이 모두 들어간다', () => {
    createTab('crochet');
    createTab('knit');
    expect(get(siblingPieces).map((p) => p.id)).toEqual(tabIds());
  });
});
