import { describe, expect, it } from 'vitest';
import { serialize, validate, FILE_VERSION, validateWorkspace, serializeWorkspace } from '../src/lib/persistence';

describe('serialize', () => {
  it('기본 상태를 저장용 객체로 직렬화', () => {
    const out = serialize({
      shape: 'circular',
      rounds: [{ source: '@, 6X' }, { source: '6V' }],
    });
    expect(out.version).toBe(FILE_VERSION);
    expect(out.shape).toBe('circular');
    expect(out.rounds).toEqual([{ source: '@, 6X' }, { source: '6V' }]);
    expect(out.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('id 등 파생 필드는 저장하지 않음', () => {
    const out = serialize({
      shape: 'flat',
      rounds: [{ source: 'X' } as any, { source: 'V' } as any],
    });
    expect((out.rounds[0] as any).id).toBeUndefined();
  });
});

describe('validate', () => {
  it('유효한 데이터 통과', () => {
    const data = {
      version: 1,
      savedAt: '2026-04-15T00:00:00Z',
      shape: 'circular',
      rounds: [{ source: '@, 6X' }],
    };
    const out = validate(data);
    expect(out.shape).toBe('circular');
    expect(out.rounds).toEqual([{ source: '@, 6X' }]);
  });

  it('객체 아님 → 에러', () => {
    expect(() => validate(null)).toThrow();
    expect(() => validate('hello')).toThrow();
    expect(() => validate(42)).toThrow();
  });

  it('버전 불일치 → 에러', () => {
    expect(() => validate({ version: 99, shape: 'circular', rounds: [] })).toThrow(/버전/);
  });

  it('v1 파일 → craft 는 코바늘로 마이그레이션', () => {
    const out = validate({ version: 1, shape: 'circular', rounds: [{ source: '@, 6X' }] });
    expect(out.craft).toBe('crochet');
    expect(out.version).toBe(2);
  });

  it('v2 파일의 craft 유지', () => {
    const out = validate({ version: 2, craft: 'knit', shape: 'flat', rounds: [{ source: 'k6' }] });
    expect(out.craft).toBe('knit');
  });

  it('알 수 없는 shape → 에러', () => {
    expect(() => validate({ version: 1, shape: 'triangle', rounds: [] })).toThrow(/도형/);
  });

  it('rounds 누락 → 에러', () => {
    expect(() => validate({ version: 1, shape: 'circular' })).toThrow(/rounds/);
  });

  it('rounds 항목에 source 누락 → 에러', () => {
    expect(() => validate({
      version: 1,
      shape: 'circular',
      rounds: [{ other: 'x' }],
    })).toThrow(/source/);
  });

  it('serialize → validate 왕복', () => {
    const original = {
      shape: 'flat' as const,
      rounds: [{ source: '6O' }, { source: '(1X,1V)*3' }],
    };
    const serialized = serialize(original);
    const restored = validate(JSON.parse(JSON.stringify(serialized)));
    expect(restored.shape).toBe(original.shape);
    expect(restored.rounds).toEqual(original.rounds);
  });
});

describe('워크스페이스 복원 — 관대한 검증', () => {
  const base = {
    version: 3,
    savedAt: '2026-07-29T00:00:00Z',
    tabs: [
      { id: 't1', name: '대바늘', craft: 'knit', shape: 'round', rounds: [{ source: 'k40' }] },
      { id: 't2', name: '코바늘', craft: 'crochet', shape: 'circular', rounds: [{ source: '@, 6X' }] },
    ],
    activeTabId: 't1',
  };

  it('정상 데이터는 그대로 복원', () => {
    const out = validateWorkspace(JSON.parse(JSON.stringify(base)));
    expect(out.tabs.map((t) => `${t.craft}/${t.shape}`)).toEqual(['knit/round', 'crochet/circular']);
  });

  it('모르는 도형이면 그 탭만 기본 도형으로 (탭은 살린다)', () => {
    const broken = JSON.parse(JSON.stringify(base));
    broken.tabs[0].shape = 'hexagon';
    const out = validateWorkspace(broken);
    expect(out.tabs).toHaveLength(2);
    expect(out.tabs[0]!.shape).toBe('flat'); // 대바늘 기본
  });

  it('알 수 없는 버전이어도 탭을 읽어낸다', () => {
    const future = { ...JSON.parse(JSON.stringify(base)), version: 99 };
    expect(validateWorkspace(future).tabs).toHaveLength(2);
  });

  it('망가진 탭 하나 때문에 나머지가 사라지지 않는다', () => {
    const broken = JSON.parse(JSON.stringify(base));
    broken.tabs.splice(1, 0, null);
    broken.tabs.push({ name: '이름만 있음' });
    const out = validateWorkspace(broken);
    // null 은 버리고, rounds 없는 탭은 빈 단으로 살린다
    expect(out.tabs.map((t) => t.name)).toEqual(['대바늘', '코바늘', '이름만 있음']);
    expect(out.tabs[2]!.rounds).toEqual([{ source: '' }]);
  });

  it('activeTabId 가 없는 탭을 가리키면 첫 탭으로', () => {
    const out = validateWorkspace({ ...JSON.parse(JSON.stringify(base)), activeTabId: 'gone' });
    expect(out.activeTabId).toBe('t1');
  });

  it('직렬화 → 복원 왕복', () => {
    const saved = serializeWorkspace({
      tabs: [{ id: 'a', name: '목도리', craft: 'knit', shape: 'round', rounds: [{ source: 'k40' }] }],
      activeTabId: 'a',
    });
    const out = validateWorkspace(JSON.parse(JSON.stringify(saved)));
    expect(out.tabs[0]!.name).toBe('목도리');
    expect(out.tabs[0]!.shape).toBe('round');
  });
});
