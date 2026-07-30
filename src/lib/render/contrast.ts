/**
 * 배경색 위에서 읽히는 전경색 계산.
 *
 * 배색 도안은 칸을 실 색으로 채우므로, 어두운 칸 위의 검은 기호는 보이지 않는다.
 * 배경 밝기에 따라 기호를 흰색/검정으로 전환한다.
 */

/** `#rgb` / `#rrggbb` → [r, g, b] (0~255). 파싱 불가면 undefined */
export function parseHex(color: string): [number, number, number] | undefined {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return undefined;
  const hex = m[1]!;
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
}

/** 상대 휘도 (WCAG). 0 = 검정, 1 = 흰색 */
export function luminance(color: string): number | undefined {
  const rgb = parseHex(color);
  if (!rgb) return undefined;
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * 이 배경 위에 그릴 기호 색.
 * 밝은 배경 → 어두운 기호, 어두운 배경 → 흰 기호.
 */
export function contrastInk(background: string, dark = '#3a3632', light = '#ffffff'): string {
  const l = luminance(background);
  if (l === undefined) return dark;
  return l > 0.45 ? dark : light;
}
