/**
 * 표시용 단 번호.
 *
 * 되돌아뜨기는 뜨개에서 **한 단이 아직 끝나지 않은 것**으로 센다. 그래서 줄은 여러
 * 개지만 단 번호는 하나다 — 줄마다 "앞 단에 이어짐"을 켜 두면 그 줄은 앞 줄의 번호를
 * 나눠 쓴다.
 *
 *   12단  k11, wt
 *    ↳    p4, wt      ← 이어짐
 *    ↳    k12         ← 이어짐
 *   13단  k19
 *
 * 한 단이 여러 줄이면 도안에는 `12-1`, `12-2` … 로 적어 몇 번째 줄인지 보이게 하고,
 * 한 줄뿐이면 그냥 `12` 다. 편집기는 첫 줄만 번호를 쓰고 나머지는 `↳` 로 표시한다.
 */

export interface RoundNumber {
  /** 단 번호 (1-based) */
  number: number;
  /** 그 단 안에서 몇 번째 줄인지 (1-based) */
  pass: number;
  /** 그 단이 몇 줄로 되어 있는지 */
  passes: number;
}

/**
 * `continued[i]` = i 번째 줄이 앞 줄에 이어지는지.
 * 첫 줄은 이어질 앞 줄이 없으므로 무조건 새 단으로 센다.
 */
export function roundNumbers(continued: ReadonlyArray<boolean | undefined>): RoundNumber[] {
  const out: RoundNumber[] = [];
  let number = 0;
  let pass = 0;
  for (let i = 0; i < continued.length; i++) {
    if (i === 0 || !continued[i]) {
      number++;
      pass = 1;
    } else {
      pass++;
    }
    out.push({ number, pass, passes: 1 });
  }
  // 같은 단의 줄 수를 뒤에서 채운다
  for (let i = out.length - 1; i >= 0; i--) {
    const cur = out[i]!;
    const next = out[i + 1];
    cur.passes = next && next.number === cur.number ? next.passes : cur.pass;
  }
  return out;
}

/** 도안에 적는 단 번호 — 한 단이 여러 줄이면 `12-2` */
export function formatRoundNumber(n: RoundNumber): string {
  return n.passes > 1 ? `${n.number}-${n.pass}` : `${n.number}`;
}

/** 전체 단 수 — 이어지는 줄은 한 단으로 센다 */
export function countRounds(continued: ReadonlyArray<boolean | undefined>): number {
  const nums = roundNumbers(continued);
  return nums.length === 0 ? 0 : nums[nums.length - 1]!.number;
}
