import { describe, expect, it } from 'vitest';
import { compressRoundSource } from '../src/lib/compress';

describe('compressRoundSource', () => {
  it('연속된 동일 stitch 를 run-length 로 축약', () => {
    expect(compressRoundSource('x,x,x,v,v')).toBe('3x, 2v');
  });

  it('타일 반복을 (…)*k 로 감쌈', () => {
    expect(compressRoundSource('x,x,x,v,v,x,x,x,v,v')).toBe('(3x, 2v)*2');
  });

  it('모디파이어/색 있는 stitch 는 단독 유지 + `1` 접두사', () => {
    expect(compressRoundSource('x,x,x,v,v,x,x,x:aaf,v,v')).toBe('3x, 2v, 2x, 1x:aaf, 2v');
  });

  it('단일 stitch count=1 은 접두사 생략', () => {
    expect(compressRoundSource('x,v,x')).toBe('x, v, x');
  });

  it('전부 동일하면 (N kind) 대신 Nkind', () => {
    expect(compressRoundSource('x,x,x,x')).toBe('4x');
  });

  it('최소 주기 선택 — x,x,v,x,x,v → (2x,v)*2', () => {
    expect(compressRoundSource('x,x,v,x,x,v')).toBe('(2x, v)*2');
  });

  it('꼬리가 남는 경우는 감싸지 않음', () => {
    expect(compressRoundSource('x,x,x,v,v,x,x,x')).toBe('3x, 2v, 3x');
  });

  it('색상 키워드 원문 보존', () => {
    expect(compressRoundSource('x:red,x:red,x')).toBe('2x:red, x');
  });

  it('같은 헥스 두 번 → 병합', () => {
    expect(compressRoundSource('x:#ff0000,x:#ff0000')).toBe('2x:#ff0000');
  });

  it('V^N 확장은 정체성에 포함', () => {
    expect(compressRoundSource('v^3,v^3,v^2,v^2')).toBe('2v^3, 2v^2');
  });

  it('이미 (…)*N 로 쓴 원문은 복합 노드로 보존', () => {
    expect(compressRoundSource('x,(x,v)*2,x')).toBe('x, (x,v)*2, x');
  });

  it('파싱 실패 시 원문 그대로', () => {
    const bad = 'x,,,';
    expect(compressRoundSource(bad)).toBe(bad);
  });

  it('blo 모디파이어 + count>1', () => {
    expect(compressRoundSource('blo x,blo x,blo x')).toBe('3blo x');
  });

  it('V/A with baseKind', () => {
    expect(compressRoundSource('vf,vf,vf')).toBe('3vf');
  });

  it('연속 동일 stitch count 합산 (3x,x → 4x)', () => {
    expect(compressRoundSource('3x,x')).toBe('4x');
  });

  it('다른 색은 병합하지 않음', () => {
    expect(compressRoundSource('x:red,x:blue')).toBe('1x:red, 1x:blue');
  });
});
