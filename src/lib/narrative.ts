/**
 * 서술 도안 포매터 — AST 를 HTML 로 렌더.
 *
 * - 색상 주석(`:#rrggbb`) → 해당 기호를 colored span 으로 감쌈
 * - 코멘트(`"..."`) → 각주 마커 `<sup>*1, *2, ...</sup>` 삽입 후 하단 목록으로 수집
 */

import type { SequenceNode, StitchNode, ParsedRound, ElementNode } from './parser/ast';
import { STITCH_META } from './model/stitch';

export interface NarrativeResult {
  html: string;
  comments: string[];
}

export function renderNarrative(parsed: ParsedRound | undefined, source: string): NarrativeResult {
  const body = parsed?.body ?? parsed?.lastValid;
  if (!body) return { html: escapeHtml(source || ''), comments: [] };
  const comments: string[] = [];
  const html = renderSequence(body, comments);
  return { html, comments };
}

function renderSequence(seq: SequenceNode, comments: string[]): string {
  return seq.elements.map((el) => renderElement(el, comments)).join(', ');
}

function renderElement(el: ElementNode, comments: string[]): string {
  if (el.type === 'stitch') return renderStitch(el, comments);
  if (el.type === 'repeat') {
    return `(${renderSequence(el.body, comments)}) * ${el.count}`;
  }
  if (el.type === 'skip') {
    return `<span class="stitch-token">skip(${el.count})</span>`;
  }
  if (el.type === 'tc') {
    return `<span class="stitch-token">tc</span>(${renderSequence(el.body, comments)})`;
  }
  const prefix = el.count > 1 ? String(el.count) : '';
  return `${prefix}[${renderSequence(el.body, comments)}]`;
}

function renderStitch(s: StitchNode, comments: string[]): string {
  const meta = STITCH_META[s.kind];
  let text = '';
  if (s.modifier) text += s.modifier.toLowerCase() + ' ';
  if (s.count > 1) text += String(s.count);
  text += meta.canonical;
  if (s.baseKind) text += STITCH_META[s.baseKind].canonical;
  if (s.expansion !== undefined) text += '^' + s.expansion;
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
