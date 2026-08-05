import { describe, expect, it } from 'vitest';
import { scanComments, foldableComments } from '../src/lib/comment-edit';
import { scanColorTokens } from '../src/lib/color-edit';

describe('코멘트 스캔', () => {
  it('닫힌 코멘트의 범위와 알맹이를 찾는다', () => {
    const src = '3x "여기서 늘림", 2v';
    const [c] = scanComments(src);
    expect(c).toBeDefined();
    expect(src.slice(c!.start, c!.end)).toBe('"여기서 늘림"');
    expect(c!.value).toBe('여기서 늘림');
    expect(c!.closed).toBe(true);
  });

  it('여러 개를 소스 순서대로 찾는다', () => {
    const cs = scanComments('1x "가", 2v:navy "나", 3t');
    expect(cs.map((c) => c.value)).toEqual(['가', '나']);
  });

  it('닫히지 않은 코멘트는 closed=false, 끝까지', () => {
    const src = '3x "쓰는 중';
    const [c] = scanComments(src);
    expect(c!.closed).toBe(false);
    expect(c!.end).toBe(src.length);
  });

  it('이스케이프한 따옴표는 코멘트를 끝내지 않는다', () => {
    const [c] = scanComments('1x "3\\" 여유"');
    expect(c!.closed).toBe(true);
    expect(c!.value).toBe('3" 여유');
  });

  it('코멘트가 없으면 빈 배열', () => {
    expect(scanComments('3x, 2v')).toEqual([]);
  });
});

describe('접을 코멘트 고르기', () => {
  const src = '1x "가", 2v';
  const at = src.indexOf('"');

  it('커서가 밖에 있으면 접는다', () => {
    expect(foldableComments(src, 0, 0)).toHaveLength(1);
  });

  it('커서가 코멘트 안이면 접지 않는다 — 접히면 못 고친다', () => {
    expect(foldableComments(src, at + 2, at + 2)).toEqual([]);
  });

  it('커서가 경계에 붙어 있어도 접지 않는다', () => {
    expect(foldableComments(src, at, at)).toEqual([]);
    const end = at + '"가"'.length;
    expect(foldableComments(src, end, end)).toEqual([]);
  });

  it('선택이 걸쳐 있으면 접지 않는다', () => {
    expect(foldableComments(src, 0, src.length)).toEqual([]);
  });

  it('입력 중(닫히지 않은) 코멘트는 접지 않는다', () => {
    expect(foldableComments('1x "쓰는 중', 0, 0)).toEqual([]);
  });

  it('빈 코멘트도 접는다', () => {
    expect(foldableComments('1x ""', 0, 0)).toHaveLength(1);
  });
});

describe('색 스캔과의 관계', () => {
  it('코멘트 안의 `:` 는 색으로 보지 않는다', () => {
    expect(scanColorTokens('2x "3:5 비율"')).toEqual([]);
  });

  it('이스케이프한 따옴표 뒤의 `:` 도 코멘트 안이면 색이 아니다', () => {
    expect(scanColorTokens('2x "3\\" 비율 1:2"')).toEqual([]);
  });

  it('코멘트 뒤에 오는 색은 정상적으로 잡는다', () => {
    const found = scanColorTokens('2x "메모", 1v:navy');
    expect(found.map((t) => t.color)).toEqual(['#0d47a1']);
  });
});
