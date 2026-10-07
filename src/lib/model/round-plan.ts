/**
 * 편집기 **줄** → 도안 **행** 계획.
 *
 * 줄 하나가 곧 한 단이던 시절에는 필요 없던 단계다. 이제 둘이 어긋난다:
 *
 *   11~25단: k30     한 줄이 15단 — 그리기는 한 행 (접어 적기)
 *   1~2단 반복*3     한 줄이 6단 — 그리기도 6행 (앞 단 되풀이)
 *
 * 번호 매기기와 "무엇을 그릴지"를 한곳에서 함께 정한다. 되풀이할 단을 번호로
 * 찾아야 하는데, 그 번호는 앞 줄들을 훑어야 나오기 때문이다.
 */

import type { ExpandedRound } from '$lib/expand/op';
import { spanOf, type RoundSpec, type RoundRepeat } from './round-spec';
import { formatRoundNumber } from './round-numbers';

/** 계획에 필요한 줄 정보 */
export interface PlanLine {
  expanded?: ExpandedRound;
  spec?: RoundSpec;
  repeat?: RoundRepeat;
  /** 앞 줄에 이어지는 줄 (되돌아뜨기) */
  continued?: boolean;
}

/** 줄마다의 결과 */
export interface PlannedLine {
  /** 이 줄이 맡은 첫 단 번호 */
  number: number;
  /** 편집기·도안에 적는 번호 (`12`, `12-2`, `11~25`, `11~16`) */
  label: string;
  /** 이 줄이 나타내는 단 수 */
  span: number;
  /** 되풀이 줄인데 가리킨 단을 찾지 못함 */
  missing?: boolean;
}

/** 도안에 실제로 그려지는 행 */
export interface PlannedRound {
  /** 몇 번째 줄에서 나왔는지 (0-based) */
  lineIndex: number;
  /** 단 번호 */
  number: number;
  /** 그릴 내용 — 되풀이 행은 원본 줄의 것을 복사해 index·label 만 바꾼다 */
  expanded: ExpandedRound;
  /** 되풀이로 복사된 행이면 원본 줄 번호(0-based) */
  copyOf?: number;
}

export interface RoundPlan {
  lines: PlannedLine[];
  chart: PlannedRound[];
}

export function planRounds(lines: ReadonlyArray<PlanLine>): RoundPlan {
  const outLines: PlannedLine[] = [];
  const chart: PlannedRound[] = [];
  let next = 1;      // 다음에 쓸 단 번호
  let number = 0;    // 지금 줄의 단 번호
  let pass = 0;      // 되돌아뜨기 — 한 단 안에서 몇 번째 줄인지

  lines.forEach((line, i) => {
    const continued = i > 0 && line.continued === true;
    if (!continued) {
      number = next;
      pass = 1;
    } else {
      pass++;
    }

    if (line.repeat) {
      // 되풀이 — 앞서 그린 행 중 번호가 범위에 드는 것을 복사한다
      const sources = chart.filter((r) => r.number >= line.repeat!.from && r.number <= line.repeat!.to);
      const unique = dedupeByNumber(sources);
      let count = 0;
      for (let t = 0; t < line.repeat.times; t++) {
        for (const src of unique) {
          const n = number + count;
          chart.push({
            lineIndex: i,
            number: n,
            copyOf: src.lineIndex,
            expanded: { ...src.expanded, index: chart.length + 1, label: String(n) },
          });
          count++;
        }
      }
      const span = Math.max(1, count);
      outLines.push({
        number,
        span,
        label: count > 1 ? `${number}~${number + count - 1}` : String(number),
        ...(count === 0 ? { missing: true } : {}),
      });
      next = Math.max(next, number + span);
      return;
    }

    const span = spanOf(line.spec);
    const label = formatRoundNumber({ number, pass, passes: pass > 1 ? pass : 1, span });
    outLines.push({ number, span, label });
    next = Math.max(next, number + span);

    // 빈 줄(코가 하나도 없는 단)은 그리지 않는다
    if (line.expanded && line.expanded.ops.length > 0) {
      chart.push({
        lineIndex: i,
        number,
        expanded: { ...line.expanded, index: chart.length + 1, label },
      });
    }
  });

  // `12-1` 처럼 뒤에 이어지는 줄이 있어야 비로소 정해지는 라벨을 채운다
  fixContinuedLabels(lines, outLines, chart);
  return { lines: outLines, chart };
}

/** 같은 단 번호가 여러 행에 걸쳐 있으면(되돌아뜨기) 한 번씩만 복사한다 */
function dedupeByNumber(rounds: ReadonlyArray<PlannedRound>): PlannedRound[] {
  return rounds.filter((r, i) => i === 0 || r.number !== rounds[i - 1]!.number || r.lineIndex !== rounds[i - 1]!.lineIndex);
}

/**
 * 되돌아뜨기로 한 단을 여러 줄에 걸쳐 적으면 `12-1`, `12-2` 가 된다.
 * 몇 줄짜리인지는 뒤 줄까지 봐야 알 수 있어 마지막에 다시 적는다.
 */
function fixContinuedLabels(
  lines: ReadonlyArray<PlanLine>,
  outLines: PlannedLine[],
  chart: PlannedRound[],
): void {
  for (let i = 0; i < outLines.length; i++) {
    if (lines[i]?.repeat) continue;
    const cur = outLines[i]!;
    if (cur.span > 1) continue;
    let passes = 1;
    while (i + passes < outLines.length && lines[i + passes]?.continued && outLines[i + passes]!.number === cur.number) {
      passes++;
    }
    if (passes === 1) continue;
    for (let p = 0; p < passes; p++) {
      const label = `${cur.number}-${p + 1}`;
      outLines[i + p]!.label = label;
      for (const row of chart) if (row.lineIndex === i + p) row.expanded.label = label;
    }
    i += passes - 1;
  }
}
