/**
 * SVG 기호 정의.
 *
 * 각 기호는 원점 (0,0) 중심으로 그려지며, <use> 요소의 x/y 속성으로 위치가 결정된다.
 * 색상은 currentColor 를 사용하므로 상위 그룹의 color/stroke 설정으로 제어 가능.
 *
 * V(INC)는 꼭짓점이 아래(부모 단 방향), 두 팔이 위로 벌어진 V 형태.
 * A(DEC)는 꼭짓점이 위, 두 팔이 아래로 벌어진 역V 형태. V와 수직 대칭.
 */

import type { StitchKind } from '$lib/model/stitch';

/**
 * <defs> 내용에 들어갈 SVG 기호 정의들.
 * 각 기호는 ISO/일본식 표준 참고.
 */
export const SYMBOL_DEFS = `
<g id="sym-MAGIC">
  <circle cx="0" cy="0" r="7" fill="none" stroke="currentColor" stroke-width="1.2"/>
  <circle cx="0" cy="0" r="3" fill="none" stroke="currentColor" stroke-width="1.2"/>
</g>
<g id="sym-CHAIN">
  <ellipse cx="0" cy="0" rx="6" ry="3.5" fill="none" stroke="currentColor" stroke-width="1.4"/>
</g>
<g id="sym-SLIP">
  <circle cx="0" cy="0" r="2.2" fill="currentColor" stroke="currentColor"/>
</g>
<g id="sym-SC">
  <line x1="-5" y1="-5" x2="5" y2="5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  <line x1="5" y1="-5" x2="-5" y2="5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
</g>
<g id="sym-HDC">
  <line x1="0" y1="-7" x2="0" y2="7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  <line x1="-5" y1="-7" x2="5" y2="-7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
</g>
<g id="sym-DC">
  <line x1="0" y1="-9" x2="0" y2="9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  <line x1="-5" y1="-9" x2="5" y2="-9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  <line x1="-4" y1="1" x2="4" y2="-1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
</g>
<g id="sym-TR">
  <line x1="0" y1="-11" x2="0" y2="11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  <line x1="-5" y1="-11" x2="5" y2="-11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  <line x1="-4" y1="-2" x2="4" y2="-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
  <line x1="-4" y1="3" x2="4" y2="1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
</g>
<g id="sym-INC">
  <line x1="-5" y1="-5" x2="0" y2="5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  <line x1="5" y1="-5" x2="0" y2="5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
</g>
<g id="sym-DEC">
  <line x1="-5" y1="5" x2="0" y2="-5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  <line x1="5" y1="5" x2="0" y2="-5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
</g>
`.trim();

/** PositionedStitch의 kind를 SVG symbol id로 매핑 */
export function stitchSymbolId(kind: StitchKind): string {
  return `sym-${kind}`;
}
