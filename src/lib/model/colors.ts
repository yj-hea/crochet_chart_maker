/**
 * 코 색상 키워드 → hex 매핑.
 *
 * `:red`, `:gray` 같은 문법에서 사용. CSS 의 named color 와 비슷한 이름만 쓰되,
 * 챠트에 잘 보이는 톤으로 지정 (너무 연한 yellow 대신 진한 노랑 등).
 */

export const NAMED_COLORS: Record<string, string> = Object.freeze({
  red:     '#e53935',
  orange:  '#fb8c00',
  yellow:  '#fbc02d',
  green:   '#43a047',
  teal:    '#00897b',
  cyan:    '#00acc1',
  blue:    '#1e88e5',
  indigo:  '#3949ab',
  purple:  '#8e24aa',
  pink:    '#ec407a',
  brown:   '#6d4c41',
  black:   '#212121',
  white:   '#ffffff',
  gray:    '#757575',
  grey:    '#757575',
  silver:  '#bdbdbd',
  navy:    '#0d47a1',
});

const HEX3 = /^[0-9a-f]{3}$/i;
const HEX6 = /^[0-9a-f]{6}$/i;

/**
 * `:` 뒤에 올 수 있는 색상 값 (키워드 / #없는 hex / #있는 hex) 을
 * 정규화된 `#rrggbb` 또는 `#rgb` 로 변환.
 * 유효하지 않으면 null.
 */
export function resolveColorValue(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // 이미 # 이 있는 경우
  if (trimmed.startsWith('#')) {
    const rest = trimmed.slice(1);
    return HEX3.test(rest) || HEX6.test(rest) ? '#' + rest.toLowerCase() : null;
  }
  // 키워드 먼저
  const named = NAMED_COLORS[trimmed.toLowerCase()];
  if (named) return named;
  // # 없는 hex
  if (HEX3.test(trimmed) || HEX6.test(trimmed)) return '#' + trimmed.toLowerCase();
  return null;
}

/** 사용 가능한 키워드 색상 이름 배열 */
export const NAMED_COLOR_KEYS: readonly string[] = Object.freeze(Object.keys(NAMED_COLORS));
