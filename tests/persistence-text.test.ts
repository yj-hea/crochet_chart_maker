import { describe, expect, it } from 'vitest';
import { serializeAsText, parseTextFormat } from '../src/lib/persistence-text';

describe('serializeAsText', () => {
  it('모든 섹션 포함 + round memo', () => {
    const text = serializeAsText({
      name: '첫 도안',
      shape: 'circular',
      rounds: [
        { source: 'mr, 6x' },
        { source: '6v' },
      ],
      patternMemo: '처음부터 끝까지\n메모 두 번째 줄',
      roundMemos: new Map([[1, '이 단은 12코\n여러 줄 가능']]),
    });
    expect(text).toBe(
      '# 이름\n첫 도안\n\n' +
      '# 도형\ncircular\n\n' +
      '# 도안 메모\n처음부터 끝까지\n메모 두 번째 줄\n\n' +
      '# 도안\n' +
      '1단:: mr, 6x\n' +
      '2단:: 6v\n' +
      '> 이 단은 12코\n' +
      '> 여러 줄 가능\n'
    );
  });

  it('patternMemo/roundMemos 없으면 섹션 생략', () => {
    const text = serializeAsText({
      name: 'n',
      shape: 'flat',
      rounds: [{ source: '3ch' }],
    });
    expect(text).toBe('# 이름\nn\n\n# 도형\nflat\n\n# 도안\n1단:: 3ch\n');
  });
});

describe('parseTextFormat', () => {
  it('기본 예시 파싱', () => {
    const text =
      '# 이름\n테스트\n\n' +
      '# 도형\ncircular\n\n' +
      '# 도안 메모\n메모\n\n' +
      '# 도안\n1단:: mr, 6x\n2단:: 6v\n';
    const r = parseTextFormat(text);
    expect(r.name).toBe('테스트');
    expect(r.saved.shape).toBe('circular');
    expect(r.saved.rounds.map((rr) => rr.source)).toEqual(['mr, 6x', '6v']);
    expect(r.saved.comments).toHaveLength(1);
    expect(r.saved.comments?.[0]?.target).toEqual({ kind: 'pattern' });
    expect(r.saved.comments?.[0]?.text).toBe('메모');
  });

  it('단 메모 (> 줄) 은 그 단의 코멘트로 수집', () => {
    const text = '# 도안\n1단:: 3x\n> 시작\n> 두 번째\n2단:: 6v\n';
    const r = parseTextFormat(text);
    expect(r.saved.rounds).toHaveLength(2);
    const rm = r.saved.comments?.find(
      (c) => c.target.kind === 'round' && c.target.roundIndex === 0,
    );
    expect(rm?.text).toBe('시작\n두 번째');
    // 2단은 메모 없음
    expect(
      r.saved.comments?.some((c) => c.target.kind === 'round' && c.target.roundIndex === 1),
    ).toBe(false);
  });

  it('도형 섹션 빠지면 circular 기본값', () => {
    const r = parseTextFormat('# 도안\n1단:: 6x\n');
    expect(r.saved.shape).toBe('circular');
  });

  it('한글 도형 값 (원형/평면) 도 인식', () => {
    expect(parseTextFormat('# 도형\n평면\n').saved.shape).toBe('flat');
    expect(parseTextFormat('# 도형\n원형\n').saved.shape).toBe('circular');
  });

  it('섹션 순서 무관', () => {
    const text =
      '# 도안\n1단:: 6x\n\n' +
      '# 이름\nA\n\n' +
      '# 도형\nflat\n';
    const r = parseTextFormat(text);
    expect(r.name).toBe('A');
    expect(r.saved.shape).toBe('flat');
    expect(r.saved.rounds[0]?.source).toBe('6x');
  });

  it('`N단::` / `>` 가 아닌 줄은 이전 단 source 의 연속으로 붙음', () => {
    const text = '# 도안\n1단:: mr, 6x\n이것은 단이 아님\n2단:: 6v\n';
    const r = parseTextFormat(text);
    expect(r.saved.rounds.map((rr) => rr.source)).toEqual([
      'mr, 6x\n이것은 단이 아님',
      '6v',
    ]);
  });

  it('단 source 안의 개행을 보존 (continuation lines)', () => {
    const text =
      '# 도안\n' +
      '1단:: mr,\n' +
      '6x,\n' +
      '(1x, 1v)*3\n' +
      '2단:: 6v\n';
    const r = parseTextFormat(text);
    expect(r.saved.rounds).toHaveLength(2);
    expect(r.saved.rounds[0]?.source).toBe('mr,\n6x,\n(1x, 1v)*3');
    expect(r.saved.rounds[1]?.source).toBe('6v');
  });

  it('개행 포함 source 의 round trip', () => {
    const input = {
      name: 'n',
      shape: 'circular' as const,
      rounds: [{ source: 'mr, 6x,\n(1x, 1v)*3,\n2x' }, { source: 'v,\na' }],
    };
    const text = serializeAsText(input);
    const r = parseTextFormat(text);
    expect(r.saved.rounds.map((rr) => rr.source)).toEqual(input.rounds.map((rr) => rr.source));
  });

  it('round trip — serializeAsText → parseTextFormat', () => {
    const input = {
      name: '예시',
      shape: 'flat' as const,
      rounds: [{ source: 'mr, 6x"start"' }, { source: '(1x, 1v)*3' }],
      patternMemo: '제목\n\n설명 두 줄',
      roundMemos: new Map<number, string>([[0, '1단 메모']]),
    };
    const text = serializeAsText(input);
    const r = parseTextFormat(text);
    expect(r.name).toBe('예시');
    expect(r.saved.shape).toBe('flat');
    expect(r.saved.rounds.map((rr) => rr.source)).toEqual(input.rounds.map((rr) => rr.source));
    const pm = r.saved.comments?.find((c) => c.target.kind === 'pattern');
    expect(pm?.text).toBe('제목\n\n설명 두 줄');
    const rm = r.saved.comments?.find(
      (c) => c.target.kind === 'round' && c.target.roundIndex === 0,
    );
    expect(rm?.text).toBe('1단 메모');
  });
});
