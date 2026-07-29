import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { persisted, isBoolean, isOneOf, type StorageLike } from '../src/lib/persisted-store';

function fakeStorage(seed: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...seed };
  return {
    data,
    getItem: (k) => (k in data ? data[k]! : null),
    setItem: (k, v) => { data[k] = v; },
  };
}

describe('persisted store', () => {
  it('저장된 값이 없으면 기본값', () => {
    const s = persisted('k', true, isBoolean, fakeStorage());
    expect(get(s)).toBe(true);
  });

  it('저장된 값을 복원한다', () => {
    const s = persisted('k', true, isBoolean, fakeStorage({ k: 'false' }));
    expect(get(s)).toBe(false);
  });

  it('변경하면 저장된다', () => {
    const storage = fakeStorage();
    const s = persisted('k', true, isBoolean, storage);
    s.set(false);
    expect(storage.data.k).toBe('false');
  });

  it('타입이 맞지 않는 값은 무시하고 기본값', () => {
    const s = persisted('k', true, isBoolean, fakeStorage({ k: '"yes"' }));
    expect(get(s)).toBe(true);
  });

  it('깨진 JSON 도 기본값으로 넘어간다', () => {
    const s = persisted('k', 'C', isOneOf('L', 'R', 'C'), fakeStorage({ k: '{oops' }));
    expect(get(s)).toBe('C');
  });

  it('열거형 값은 목록 안에 있을 때만 복원', () => {
    expect(get(persisted('k', 'C', isOneOf('L', 'R', 'C'), fakeStorage({ k: '"R"' })))).toBe('R');
    expect(get(persisted('k', 'C', isOneOf('L', 'R', 'C'), fakeStorage({ k: '"X"' })))).toBe('C');
  });

  it('storage 가 없어도 메모리 store 로 동작', () => {
    const s = persisted('k', 1 as number, (v): v is number => typeof v === 'number', null);
    s.set(5);
    expect(get(s)).toBe(5);
  });
});
