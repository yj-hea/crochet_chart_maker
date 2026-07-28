/**
 * 서술 도안 포매터 — AST 를 HTML 로 렌더.
 *
 * - 색상 주석(`:#rrggbb`) → 해당 기호를 colored span 으로 감쌈
 * - 코멘트(`"..."`) → 각주 마커 `<sup>*1, *2, ...</sup>` 삽입 후 하단 목록으로 수집
 */

import type { SequenceNode, StitchNode, ParsedRound, ElementNode } from './parser/ast';
import { getCraft, lookupStitchMeta, type CraftId } from '$lib/crafts';

export interface NarrativeResult {
  html: string;
  comments: string[];
}

export function renderNarrative(
  parsed: ParsedRound | undefined,
  source: string,
  craft: CraftId = 'crochet',
): NarrativeResult {
  const body = parsed?.body ?? parsed?.lastValid;
  if (!body) return { html: escapeHtml(source || ''), comments: [] };
  const comments: string[] = [];
  const def = getCraft(craft);
  const postfixCount = def.countPosition === 'postfix';
  const html = renderSequence(body, comments, postfixCount, def.canonicalFor?.bind(def));
  return { html, comments };
}

type CanonicalFor = ((kind: StitchNode['kind'], expansion?: number) => string | undefined) | undefined;

function renderSequence(
  seq: SequenceNode, comments: string[], postfixCount: boolean, canonicalFor: CanonicalFor,
): string {
  return seq.elements.map((el) => renderElement(el, comments, postfixCount, canonicalFor)).join(', ');
}

function renderElement(
  el: ElementNode, comments: string[], postfixCount: boolean, canonicalFor: CanonicalFor,
): string {
  if (el.type === 'stitch') return renderStitch(el, comments, postfixCount, canonicalFor);
  if (el.type === 'repeat') {
    return `(${renderSequence(el.body, comments, postfixCount, canonicalFor)}) * ${el.count}`;
  }
  if (el.type === 'skip') {
    return `<span class="stitch-token">skip(${el.count})</span>`;
  }
  if (el.type === 'tc') {
    return `<span class="stitch-token">tc</span>(${renderSequence(el.body, comments, postfixCount, canonicalFor)})`;
  }
  const prefix = el.count > 1 ? String(el.count) : '';
  return `${prefix}[${renderSequence(el.body, comments, postfixCount, canonicalFor)}]`;
}

function renderStitch(
  s: StitchNode, comments: string[], postfixCount: boolean, canonicalFor: CanonicalFor,
): string {
  // 크래프트가 확장수를 표기에 녹여 쓰면(`k3tog`) `^N` 을 따로 붙이지 않는다.
  const merged = canonicalFor?.(s.kind, s.expansion);
  const canonical = merged ?? lookupStitchMeta(s.kind)?.canonical ?? String(s.kind);
  let text = '';
  if (s.modifier) text += s.modifier.toLowerCase() + ' ';
  // 코바늘은 반복수가 앞(`3X`), 대바늘은 뒤(`k3`)
  if (!postfixCount && s.count > 1) text += String(s.count);
  text += canonical;
  if (postfixCount && s.count > 1) text += String(s.count);
  if (s.baseKind) text += lookupStitchMeta(s.baseKind)?.canonical ?? '';
  if (merged === undefined && s.expansion !== undefined) text += '^' + s.expansion;
  if (s.yarnOverCount !== undefined) text += `(${s.yarnOverCount})`;

  let marker = '';
  if (s.comment) {
    // 같은 텍스트 코멘트는 번호를 공유 — *1, *2 가 중복되지 않도록 dedupe
    let idx = comments.indexOf(s.comment);
    if (idx === -1) {
      comments.push(s.comment);
      idx = comments.length - 1;
    }
    marker = `<sup class="footnote-marker">*${idx + 1}</sup>`;
  }

  const classAttr = 'stitch-token';
  if (s.color) {
    return `<span class="${classAttr}" style="color: ${escapeAttr(s.color)}">${escapeHtml(text)}</span>${marker}`;
  }
  return `<span class="${classAttr}">${escapeHtml(text)}</span>${marker}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
