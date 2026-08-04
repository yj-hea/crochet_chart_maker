import { describe, expect, it } from 'vitest';
import { parseRound } from '../src/lib/crafts/crochet/parser';
import { parseKnitRound } from '../src/lib/crafts/knit/parser';
import {
  setColorAt,
  setColorInRange,
  replaceColorInRound,
  colorsInRound,
  collectStitches,
  colorLiteral,
} from '../src/lib/color-edit';

const cro = (src: string) => parseRound(1, src);
const kni = (src: string) => parseKnitRound(1, src);

/** 바꾼 소스가 다시 파싱되는지 + 의도한 색이 붙었는지 확인 */
function reparseColors(src: string, knit = false): Array<string | undefined> {
  const p = knit ? kni(src) : cro(src);
  expect(p.errors, `재파싱 실패: ${src}`).toEqual([]);
  return collectStitches(p.body).map((s) => s.color);
}

describe('색 표기', () => {
  it('이름이 있는 색은 이름으로 적는다', () => {
    expect(colorLiteral('#1e88e5')).toBe('blue');
    expect(colorLiteral('#0D47A1')).toBe('navy');
    expect(colorLiteral('#757575')).toBe('gray'); // grey 가 아니라 gray
    expect(colorLiteral('#aaccff')).toBe('#aaccff');
  });

  it('색 파싱 시 표기 범위가 기록된다', () => {
    const p = cro('2x:navy, 1v');
    const [first] = collectStitches(p.body);
    expect(first!.colorRange).toBeDefined();
    expect('2x:navy, 1v'.slice(first!.colorRange!.start, first!.colorRange!.end)).toBe(':navy');
  });
});

describe('코 하나의 색 바꾸기 (스와치 클릭)', () => {
  it('기존 색을 갈아끼운다', () => {
    const src = '2x:navy, 1v:cream';
    const p = cro(src);
    const first = collectStitches(p.body)[0]!;
    const out = setColorAt(src, p, first.range.start, '#e53935');
    expect(out).toBe('2x:red, 1v:cream');
    expect(reparseColors(out)).toEqual(['#e53935', '#f5efe0']);
  });

  it('색이 없던 코에 새로 붙인다', () => {
    const src = '2x, 1v';
    const p = cro(src);
    const second = collectStitches(p.body)[1]!;
    expect(setColorAt(src, p, second.range.start, '#1e88e5')).toBe('2x, 1v:blue');
  });

  it('색을 지운다', () => {
    const src = '2x:navy, 1v';
    const p = cro(src);
    const first = collectStitches(p.body)[0]!;
    expect(setColorAt(src, p, first.range.start, undefined)).toBe('2x, 1v');
  });

  it('주석이 있으면 주석 앞에 넣는다', () => {
    const src = '2x "여기 주의", 1v';
    const p = cro(src);
    const first = collectStitches(p.body)[0]!;
    const out = setColorAt(src, p, first.range.start, '#1e88e5');
    expect(out).toBe('2x:blue "여기 주의", 1v');
    const rp = cro(out);
    expect(rp.errors).toEqual([]);
    expect(collectStitches(rp.body)[0]!.comment).toBe('여기 주의');
  });

  it('없는 위치를 지정하면 원본 그대로', () => {
    const src = '2x, 1v';
    expect(setColorAt(src, cro(src), 999, '#1e88e5')).toBe(src);
  });
});

describe('선택 범위 일괄 칠하기', () => {
  it('범위와 겹치는 코들에만 색이 붙는다', () => {
    const src = '2x, 1v, 3x, 1v';
    // '1v, 3x' 구간
    const from = src.indexOf('1v');
    const to = src.indexOf('3x') + 2;
    const out = setColorInRange(src, cro(src), { start: from, end: to }, '#0d47a1');
    expect(out).toBe('2x, 1v:navy, 3x:navy, 1v');
    expect(reparseColors(out)).toEqual([undefined, '#0d47a1', '#0d47a1', undefined]);
  });

  it('이미 색이 있는 코는 갈아끼운다', () => {
    const src = '2x:red, 1v:blue';
    const out = setColorInRange(src, cro(src), { start: 0, end: src.length }, '#0d47a1');
    expect(out).toBe('2x:navy, 1v:navy');
  });

  it('선택 범위의 색을 한꺼번에 지운다', () => {
    const src = '2x:red, 1v:blue, 3x';
    const out = setColorInRange(src, cro(src), { start: 0, end: src.length }, undefined);
    expect(out).toBe('2x, 1v, 3x');
    expect(reparseColors(out)).toEqual([undefined, undefined, undefined]);
  });

  it('반복·한코그룹 안의 코도 대상이 된다', () => {
    const src = '(1x, 1v)*3, [1f, 1t]';
    const out = setColorInRange(src, cro(src), { start: 0, end: src.length }, '#e53935');
    expect(out).toBe('(1x:red, 1v:red)*3, [1f:red, 1t:red]');
    expect(reparseColors(out)).toEqual(['#e53935', '#e53935', '#e53935', '#e53935']);
  });

  it('빈 선택(커서)이면 커서가 놓인 코 하나만', () => {
    const src = '2x, 1v, 3x';
    const at = src.indexOf('1v') + 1;
    expect(setColorInRange(src, cro(src), { start: at, end: at }, '#e53935'))
      .toBe('2x, 1v:red, 3x');
  });

  it('겹치는 코가 없으면 원본 그대로', () => {
    const src = '2x, 1v';
    expect(setColorInRange(src, cro(src), { start: 100, end: 200 }, '#e53935')).toBe(src);
  });

  it('대바늘에서도 동작한다 (반복수가 뒤에 오는 표기)', () => {
    const src = 'k4, p2, k4';
    const out = setColorInRange(src, kni(src), { start: 0, end: src.length }, '#0d47a1');
    expect(out).toBe('k4:navy, p2:navy, k4:navy');
    expect(reparseColors(out, true)).toEqual(['#0d47a1', '#0d47a1', '#0d47a1']);
  });
});

describe('배색 일괄 교체', () => {
  it('같은 색인 코만 모두 바뀐다', () => {
    const src = '2x:navy, 1v:cream, 3x:navy';
    const out = replaceColorInRound(src, cro(src), '#0d47a1', '#e53935');
    expect(out).toBe('2x:red, 1v:cream, 3x:red');
  });

  it('hex 로 쓴 색도 같은 값이면 함께 바뀐다', () => {
    const src = '2x:#0d47a1, 1v:navy';
    const out = replaceColorInRound(src, cro(src), '#0d47a1', '#aaccff');
    expect(out).toBe('2x:#aaccff, 1v:#aaccff');
    expect(reparseColors(out)).toEqual(['#aaccff', '#aaccff']);
  });

  it('그 색이 없으면 원본 그대로', () => {
    const src = '2x:navy, 1v';
    expect(replaceColorInRound(src, cro(src), '#e53935', '#000000')).toBe(src);
  });

  it('색을 제거할 수도 있다', () => {
    const src = '2x:navy, 1v:navy, 3x:red';
    expect(replaceColorInRound(src, cro(src), '#0d47a1', undefined)).toBe('2x, 1v, 3x:red');
  });
});

describe('단에서 쓰인 색 모으기', () => {
  it('색별 코 수를 센다 (반복수 반영)', () => {
    const counts = colorsInRound(cro('2x:navy, 1v:cream, 3x:navy'));
    expect(counts.get('#0d47a1')).toBe(5);
    expect(counts.get('#f5efe0')).toBe(1);
  });

  it('색이 없으면 빈 맵', () => {
    expect(colorsInRound(cro('6x')).size).toBe(0);
    expect(colorsInRound(undefined).size).toBe(0);
  });
});

// ── 스토어 연동: 도안 전체 배색 교체 ──────────────────────────────
describe('도안 전체 배색 교체 (스토어)', () => {
  it('모든 단에서 그 색이 바뀌고, 쓰인 색 목록이 갱신된다', async () => {
    const { createTab, replaceColorEverywhere, usedColors, pattern } =
      await import('../src/stores/tabs');
    const { updateRoundSource, addRoundAtEnd } = await import('../src/stores/pattern');
    const { get } = await import('svelte/store');

    createTab('crochet');
    const first = get(pattern).rounds[0]!.id;
    updateRoundSource(first, '3x:navy, 3x:red');
    const second = addRoundAtEnd();
    updateRoundSource(second, '6x:navy');

    expect(get(usedColors)).toEqual([
      { color: '#0d47a1', count: 9 },
      { color: '#e53935', count: 3 },
    ]);

    replaceColorEverywhere('#0d47a1', '#aaccff');
    // 모든 코에 색이 있고 #aaccff 가 9코로 최다 → 본문에서 빠지고 칸 색이 된다
    const sources = get(pattern).rounds.map((r) => r.source);
    expect(sources).toEqual(['3x, 3x:red', '6x']);
    // 바뀐 소스가 다시 파싱돼 에러가 없다
    for (const r of get(pattern).rounds) expect(r.parsed?.errors).toEqual([]);
    expect(get(usedColors)).toEqual([{ color: '#e53935', count: 3 }]);
  });

  it('색 제거도 전체에 적용된다', async () => {
    const { createTab, replaceColorEverywhere, pattern } = await import('../src/stores/tabs');
    const { updateRoundSource } = await import('../src/stores/pattern');
    const { get } = await import('svelte/store');

    createTab('knit');
    const id = get(pattern).rounds[0]!.id;
    updateRoundSource(id, 'k4:navy, p2:red, k4:navy');
    replaceColorEverywhere('#0d47a1', undefined);
    expect(get(pattern).rounds[0]!.source).toBe('k4, p2:red, k4');
  });
});

// ── 에디터 표시용 텍스트 스캔 ──────────────────────────────────────
describe('색 표기 스캔 (에디터 표시용)', () => {
  it('완성된 색과 입력 중인 색을 모두 찾는다', async () => {
    const { scanColorTokens } = await import('../src/lib/color-edit');
    const src = '2x:navy, 1v:aa, 3x:#aaccff, 1f:';
    expect(scanColorTokens(src).map((t) => [t.raw, t.color])).toEqual([
      ['navy', '#0d47a1'],
      ['aa', undefined],      // 입력 중 — 아직 유효하지 않다
      ['#aaccff', '#aaccff'],
      ['', undefined],        // `:` 만 친 직후
    ]);
  });

  it('주석 안의 콜론은 색으로 보지 않는다', async () => {
    const { scanColorTokens } = await import('../src/lib/color-edit');
    const tokens = scanColorTokens('2x "3:5 비율로", 1v:red');
    expect(tokens.map((t) => t.raw)).toEqual(['red']);
  });

  it('닫히지 않은 따옴표 뒤는 전부 주석으로 본다 (오탐 방지)', async () => {
    const { scanColorTokens } = await import('../src/lib/color-edit');
    expect(scanColorTokens('2x "미완성 :red')).toEqual([]);
  });

  it('AST 가 잡는 위치와 일치한다', async () => {
    const { scanColorTokens } = await import('../src/lib/color-edit');
    const src = '2x:navy, [1f:red, 1t], (1v:#aaccff)*3';
    const scanned = scanColorTokens(src).map((t) => [t.start, t.end]);
    const fromAst = collectStitches(cro(src).body)
      .filter((s) => s.colorRange)
      .map((s) => [s.colorRange!.start, s.colorRange!.end]);
    expect(scanned).toEqual(fromAst);
  });

  it('커서 위치로 편집 중인 색을 찾는다 (양 끝 포함)', async () => {
    const { scanColorTokens, colorTokenAt } = await import('../src/lib/color-edit');
    const src = '2x:navy, 1v';
    const tokens = scanColorTokens(src);
    expect(colorTokenAt(tokens, 2)?.raw).toBe('navy');  // ':' 바로 위
    expect(colorTokenAt(tokens, 7)?.raw).toBe('navy');  // 'navy' 끝 — 아직 편집 중
    expect(colorTokenAt(tokens, 8)).toBeUndefined();    // ',' — 벗어남
    expect(colorTokenAt(tokens, 0)).toBeUndefined();
  });

  it('색 표기 하나를 교체·제거한다', async () => {
    const { scanColorTokens, replaceColorToken } = await import('../src/lib/color-edit');
    const src = '2x:aa, 1v:red';
    const [partial] = scanColorTokens(src);
    expect(replaceColorToken(src, partial!, '#0d47a1')).toBe('2x:navy, 1v:red');
    expect(replaceColorToken(src, partial!, undefined)).toBe('2x, 1v:red');
  });
});

describe('색 표기 접기 (화면 표시)', () => {
  /** 접힌 뒤 화면에 보이는 글자 — 접힌 자리는 ● 로 대체 */
  async function rendered(src: string, selFrom: number, selTo = selFrom) {
    const { foldableColorTokens } = await import('../src/lib/color-edit');
    const folded = foldableColorTokens(src, selFrom, selTo);
    let out = '';
    let i = 0;
    for (const t of folded) {
      out += src.slice(i, t.start) + '●';
      i = t.end;
    }
    return out + src.slice(i);
  }

  it('커서가 멀리 있으면 색 코드가 동그라미로 접힌다', async () => {
    expect(await rendered('2x:#aaccff, 1v:navy', 0)).toBe('2x●, 1v●');
  });

  it('커서가 그 색 안에 있으면 펼쳐서 고칠 수 있다', async () => {
    const src = '2x:#aaccff, 1v:navy';
    // ':#aaccff' 중간에 커서 → 그 색만 펼쳐진다
    expect(await rendered(src, 5)).toBe('2x:#aaccff, 1v●');
    // 'navy' 끝에 커서 → 그 색만 펼쳐진다
    expect(await rendered(src, src.length)).toBe('2x●, 1v:navy');
  });

  it('입력 중인 미완성 색은 접지 않는다', async () => {
    // ':aa' 는 아직 유효하지 않다 — 커서가 멀어도 글자가 보여야 한다
    expect(await rendered('2x:aa, 1v:red', 0)).toBe('2x:aa, 1v●');
  });

  it('선택 범위에 걸친 색은 펼쳐진다', async () => {
    const src = '2x:navy, 1v:red';
    expect(await rendered(src, 0, src.length)).toBe(src);
  });

  it('스페이스로 확정하는 순간 접힌다 (커서가 끝을 벗어남)', async () => {
    const src = '2x:aaf';
    // 확정 전 — 커서가 색 끝에 있다
    expect(await rendered(src, src.length)).toBe('2x:aaf');
    // 확정 후 — 커서가 한 칸 뒤로 (다음 글자를 치기 시작한 상태)
    expect(await rendered(src + ', 1v', src.length + 2)).toBe('2x●, 1v');
  });
});

describe('색 없는 코에 실 색 일괄 지정', () => {
  it('색이 없는 코에만 붙고 이미 있는 코는 그대로', async () => {
    const { assignColorToUncolored } = await import('../src/lib/color-edit');
    const src = '2x:navy, 3x, 1v';
    const out = assignColorToUncolored(src, cro(src), '#f5efe0');
    expect(out).toBe('2x:navy, 3x:cream, 1v:cream');
    expect(reparseColors(out)).toEqual(['#0d47a1', '#f5efe0', '#f5efe0']);
  });

  it('반복·한코그룹 안에도 들어간다', async () => {
    const { assignColorToUncolored } = await import('../src/lib/color-edit');
    const src = '(1x, 1v:red)*3, [1f, 1t]';
    const out = assignColorToUncolored(src, cro(src), '#0d47a1');
    expect(out).toBe('(1x:navy, 1v:red)*3, [1f:navy, 1t:navy]');
  });

  it('전부 색이 있으면 원본 그대로', async () => {
    const { assignColorToUncolored } = await import('../src/lib/color-edit');
    const src = '2x:navy, 1v:red';
    expect(assignColorToUncolored(src, cro(src), '#000000')).toBe(src);
  });

  /**
   * 일괄 지정하면 모든 코에 `:색` 이 붙어 본문이 색 표기로 뒤덮인다.
   * 다수를 차지하는 색은 본문에서 빼고 칸 색(기본값)으로 내린다 — 그림은 그대로다.
   */
  it('지정 후 최다 색은 본문에서 빠지고 칸 색이 된다', async () => {
    const { createTab, assignDefaultColorEverywhere, usedColors, uncoloredCount, viewOptions, pattern } =
      await import('../src/stores/tabs');
    const { updateRoundSource, addRoundAtEnd } = await import('../src/stores/pattern');
    const { get } = await import('svelte/store');

    createTab('crochet');
    updateRoundSource(get(pattern).rounds[0]!.id, '3x:navy, 3x');
    updateRoundSource(addRoundAtEnd(), '6x');
    expect(get(uncoloredCount)).toBe(9);

    assignDefaultColorEverywhere('#f5efe0');

    // cream 9코 > navy 3코 → cream 이 본문에서 빠지고 칸 색이 된다
    expect(get(pattern).rounds.map((r) => r.source)).toEqual(['3x:navy, 3x', '6x']);
    expect(get(viewOptions).mainColor).toBe('#f5efe0');
    expect(get(usedColors)).toEqual([{ color: '#0d47a1', count: 3 }]);
    expect(get(uncoloredCount)).toBe(9);
  });

  it('소수 색을 고르면 그건 본문에 남고 원래 다수색이 내려간다', async () => {
    const { createTab, assignDefaultColorEverywhere, viewOptions, pattern } =
      await import('../src/stores/tabs');
    const { updateRoundSource } = await import('../src/stores/pattern');
    const { get } = await import('svelte/store');

    createTab('crochet');
    // navy 9코 (이미 지정) + 색 없는 3코
    updateRoundSource(get(pattern).rounds[0]!.id, '9x:navy, 3x');
    assignDefaultColorEverywhere('#e53935');

    // red 3코 < navy 9코 → navy 가 칸 색으로 내려가고 red 만 본문에 남는다
    expect(get(pattern).rounds[0]!.source).toBe('9x, 3x:red');
    expect(get(viewOptions).mainColor).toBe('#0d47a1');
  });

  it('색 없는 코가 남아 있으면 정규화하지 않는다', async () => {
    const { createTab, replaceColorEverywhere, viewOptions, pattern } =
      await import('../src/stores/tabs');
    const { updateRoundSource } = await import('../src/stores/pattern');
    const { get } = await import('svelte/store');

    createTab('crochet');
    updateRoundSource(get(pattern).rounds[0]!.id, '6x:navy, 3x');
    const before = get(viewOptions).mainColor;

    // navy 가 최다지만 색 없는 3코가 남아 있다 — 빼면 두 무리가 합쳐진다
    replaceColorEverywhere('#0d47a1', '#e53935');
    expect(get(pattern).rounds[0]!.source).toBe('6x:red, 3x');
    expect(get(viewOptions).mainColor).toBe(before);
  });
});
