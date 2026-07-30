/**
 * 대바늘 SVG 기호 정의.
 *
 * 각 기호는 셀 중심 (0,0) 기준으로 그려진다. 셀은 20 × 14 (가로:세로 ≈ 1:0.7).
 * 색상은 currentColor 를 사용하므로 상위 그룹에서 제어 가능.
 *
 * 기호는 일본식/한국식 대바늘 기호도 관행을 따른다:
 *   겉뜨기 = 세로선, 안뜨기 = 가로선, 바늘비우기 = 원,
 *   줄임은 기우는 방향을 사선으로 표현 (오른쪽 기욺 `╱`, 왼쪽 기욺 `╲`).
 */

import type { StitchKind } from '$lib/model/stitch-kind';

const SW = 1.4; // 기본 선 두께

export const KNIT_SYMBOL_DEFS = `
<g id="knit-KNIT">
  <line x1="0" y1="-5" x2="0" y2="5" stroke="currentColor" stroke-width="${SW}" stroke-linecap="round"/>
</g>
<g id="knit-PURL">
  <line x1="-6" y1="0" x2="6" y2="0" stroke="currentColor" stroke-width="${SW}" stroke-linecap="round"/>
</g>
<g id="knit-YO">
  <circle cx="0" cy="0" r="4" fill="none" stroke="currentColor" stroke-width="${SW}"/>
</g>
<g id="knit-KTBL">
  <line x1="0" y1="-5" x2="0" y2="5" stroke="currentColor" stroke-width="${SW}" stroke-linecap="round"/>
  <line x1="-3" y1="3" x2="3" y2="-3" stroke="currentColor" stroke-width="${SW}" stroke-linecap="round"/>
</g>
<g id="knit-PTBL">
  <line x1="-6" y1="0" x2="6" y2="0" stroke="currentColor" stroke-width="${SW}" stroke-linecap="round"/>
  <line x1="-3" y1="3" x2="3" y2="-3" stroke="currentColor" stroke-width="${SW}" stroke-linecap="round"/>
</g>
<g id="knit-SLIP_ST">
  <path d="M -4,-4 L 0,4 L 4,-4" fill="none" stroke="currentColor" stroke-width="${SW}" stroke-linecap="round" stroke-linejoin="round"/>
</g>
<g id="knit-NO_STITCH">
  <line x1="-6" y1="-4" x2="6" y2="4" stroke="currentColor" stroke-width="0.8" stroke-linecap="round"/>
  <line x1="-6" y1="4" x2="6" y2="-4" stroke="currentColor" stroke-width="0.8" stroke-linecap="round"/>
</g>
<g id="knit-UNWORKED">
  <!-- 미작업 코 — 회색 칸으로 채워지고 기호는 그리지 않는다 (렌더러가 배경 처리) -->
</g>
<g id="knit-WRAP_TURN">
  <line x1="0" y1="-5" x2="0" y2="3" stroke="currentColor" stroke-width="${SW}" stroke-linecap="round"/>
  <path d="M -4,4 Q 0,7 4,4" fill="none" stroke="currentColor" stroke-width="${SW}" stroke-linecap="round"/>
</g>
<g id="knit-DOUBLE_ST">
  <line x1="-2" y1="-5" x2="-2" y2="5" stroke="currentColor" stroke-width="${SW}" stroke-linecap="round"/>
  <line x1="2" y1="-5" x2="2" y2="5" stroke="currentColor" stroke-width="${SW}" stroke-linecap="round"/>
  <line x1="-4" y1="-5" x2="4" y2="-5" stroke="currentColor" stroke-width="${SW}" stroke-linecap="round"/>
</g>
<g id="knit-CAST_ON">
  <ellipse cx="0" cy="0" rx="5" ry="3.2" fill="none" stroke="currentColor" stroke-width="${SW}"/>
</g>
<g id="knit-BIND_OFF">
  <line x1="-7" y1="0" x2="7" y2="0" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
</g>
<g id="knit-KFB">
  <line x1="0" y1="-5" x2="0" y2="5" stroke="currentColor" stroke-width="${SW}" stroke-linecap="round"/>
  <path d="M -4,-5 L 0,-1 L 4,-5" fill="none" stroke="currentColor" stroke-width="${SW}" stroke-linecap="round" stroke-linejoin="round"/>
</g>
<g id="knit-M1L">
  <path d="M -4,4 Q 0,-6 4,4" fill="none" stroke="currentColor" stroke-width="${SW}" stroke-linecap="round"/>
  <line x1="-4" y1="4" x2="-6" y2="1" stroke="currentColor" stroke-width="${SW}" stroke-linecap="round"/>
</g>
<g id="knit-M1R">
  <path d="M -4,4 Q 0,-6 4,4" fill="none" stroke="currentColor" stroke-width="${SW}" stroke-linecap="round"/>
  <line x1="4" y1="4" x2="6" y2="1" stroke="currentColor" stroke-width="${SW}" stroke-linecap="round"/>
</g>
<g id="knit-M1P">
  <path d="M -4,4 Q 0,-6 4,4" fill="none" stroke="currentColor" stroke-width="${SW}" stroke-linecap="round"/>
  <line x1="-3" y1="4" x2="3" y2="4" stroke="currentColor" stroke-width="${SW}" stroke-linecap="round"/>
</g>
<g id="knit-K2TOG">
  <line x1="-5" y1="5" x2="5" y2="-5" stroke="currentColor" stroke-width="${SW}" stroke-linecap="round"/>
</g>
<g id="knit-SSK">
  <line x1="5" y1="5" x2="-5" y2="-5" stroke="currentColor" stroke-width="${SW}" stroke-linecap="round"/>
</g>
<g id="knit-CDD">
  <line x1="0" y1="-5" x2="0" y2="5" stroke="currentColor" stroke-width="${SW}" stroke-linecap="round"/>
  <line x1="-6" y1="5" x2="-2" y2="-1" stroke="currentColor" stroke-width="${SW}" stroke-linecap="round"/>
  <line x1="6" y1="5" x2="2" y2="-1" stroke="currentColor" stroke-width="${SW}" stroke-linecap="round"/>
</g>
<g id="knit-P2TOG">
  <line x1="-5" y1="5" x2="5" y2="-5" stroke="currentColor" stroke-width="${SW}" stroke-linecap="round"/>
  <circle cx="0" cy="0" r="1.3" fill="currentColor"/>
</g>
<g id="knit-SSP">
  <line x1="5" y1="5" x2="-5" y2="-5" stroke="currentColor" stroke-width="${SW}" stroke-linecap="round"/>
  <circle cx="0" cy="0" r="1.3" fill="currentColor"/>
</g>
<g id="knit-CABLE">
  <path d="M -6,4 L 6,-4 M -6,-4 L -1,-0.7 M 1,0.7 L 6,4" fill="none" stroke="currentColor" stroke-width="${SW}" stroke-linecap="round"/>
</g>
`;

/** 이 코를 그릴 <use> 심볼 id */
export function knitSymbolId(kind: StitchKind): string {
  return `knit-${kind}`;
}

/** 심볼 정의가 있는 코인지 */
export function hasKnitSymbol(kind: StitchKind): boolean {
  return KNIT_SYMBOL_DEFS.includes(`id="knit-${kind}"`);
}
