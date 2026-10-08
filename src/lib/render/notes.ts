/**
 * 도안에 메모를 함께 그리기.
 *
 * 메모는 편집기에서만 보이던 것이라, 도안을 내보내면 빠졌다. 뜬 사람에게 건네는
 * 도안은 **기호 + 설명**이 한 장이어야 하므로 SVG 안에 같이 그린다 (내보내기·확대
 * 창·공유에 그대로 실린다).
 *
 *  - **도안 메모**는 도안 위쪽에 한 덩이로
 *  - **단 메모**는 그 단 옆에, 칸에서 선을 끌어
 *
 * 캔버스에서 고를 수 있도록 `data-el="note:…"` 를 달아 두므로 손으로 옮길 수도 있다
 * (`layout/adjust`).
 */

import type { LayoutResult } from '$lib/layout/types';

export interface ChartNote {
  /** `note:pattern` 또는 `note:<단 번호>` */
  key: string;
  text: string;
  /** 메모 색 (왼쪽 띠) */
  color?: string;
  /** 단 메모면 그 단 번호 */
  roundIndex?: number;
  /** 손으로 옮긴 배치 */
  transform?: string;
}

/** 글자 크기·줄 간격 (도안 좌표 단위) */
const FONT = 7;
const LINE = 9.5;
const PAD = 5;
/** 메모 상자 너비 */
const WIDTH = 108;
/** 한 줄에 들어가는 글자 수 (한글 기준, font-size 7 · 너비 108) */
const PER_LINE = 15;
const MAX_LINES = 8;
/** 도안과 메모 사이 간격 */
const GAP = 14;
/** 앱과 같은 글꼴 — 메모에는 한글이 들어가므로 내보낸 SVG 에서도 같은 스택을 쓴다 */
const FONT_FAMILY = "'Noto Sans KR', system-ui, -apple-system, sans-serif";

export interface NotesRender {
  svg: string;
  /** 메모까지 포함한 경계 — 렌더러가 viewBox 를 넓히는 데 쓴다 */
  box?: { minX: number; minY: number; maxX: number; maxY: number };
}

/**
 * 메모를 그린다.
 * 도안 메모는 위쪽, 단 메모는 오른쪽에 둔다 (단 번호와 겹치지 않도록).
 */
export function renderNotes(notes: ReadonlyArray<ChartNote>, layout: LayoutResult): NotesRender {
  if (notes.length === 0) return { svg: '' };
  const { bounds } = layout;
  const parts: string[] = [];
  let minX = bounds.minX;
  let minY = bounds.minY;
  let maxX = bounds.maxX;
  let maxY = bounds.maxY;

  // 1) 도안 메모 — 도안 위에 한 덩이
  const pattern = notes.filter((n) => n.roundIndex === undefined);
  let topY = bounds.minY - GAP;
  for (const note of [...pattern].reverse()) {
    const lines = wrap(note.text);
    const h = lines.length * LINE + PAD * 2;
    topY -= h;
    parts.push(box(note, bounds.minX, topY, WIDTH * 1.6, lines));
    minY = Math.min(minY, topY);
    maxX = Math.max(maxX, bounds.minX + WIDTH * 1.6);
  }

  // 2) 단 메모 — 그 단 오른쪽에, 칸에서 선을 끌어
  const byRound = new Map<number, { x: number; y: number }>();
  for (const m of layout.roundMarkers) byRound.set(m.roundIndex, m.position);

  const rounds = notes.filter((n) => n.roundIndex !== undefined);
  const x = bounds.maxX + GAP;
  // 화면에 보이는 **위에서 아래 순서**로 두고, 겹치면 아래로 밀어 둔다
  const ordered = [...rounds].sort((a, b) => {
    const ay = byRound.get(a.roundIndex!)?.y ?? 0;
    const by = byRound.get(b.roundIndex!)?.y ?? 0;
    return ay - by;
  });
  let lastBottom = Number.NEGATIVE_INFINITY;
  for (const note of ordered) {
    const anchor = byRound.get(note.roundIndex!);
    const lines = wrap(note.text);
    const h = lines.length * LINE + PAD * 2 + LINE;   // 단 라벨 한 줄
    const y = Math.max(anchor ? anchor.y - h / 2 : bounds.minY, lastBottom + 5);
    lastBottom = y + h;
    if (anchor) {
      parts.push(
        `<line x1="${fmt(bounds.maxX)}" y1="${fmt(anchor.y)}" x2="${fmt(x)}" y2="${fmt(y + h / 2)}" ` +
        `stroke="${note.color ?? '#888'}" stroke-width="0.8" stroke-dasharray="2 2" opacity="0.7"/>`,
      );
    }
    parts.push(box(note, x, y, WIDTH, lines, `${note.roundIndex}단`));
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y + h);
    maxX = Math.max(maxX, x + WIDTH);
  }

  return {
    svg: `<g class="notes">${parts.join('')}</g>`,
    box: { minX, minY, maxX, maxY },
  };
}

/** 메모 한 덩이 — 왼쪽에 색 띠, 그 옆에 글 */
function box(
  note: ChartNote,
  x: number,
  y: number,
  width: number,
  lines: string[],
  label?: string,
): string {
  const h = lines.length * LINE + PAD * 2;
  const color = note.color ?? '#9aa0a6';
  const t = note.transform ? ` transform="${escapeAttr(note.transform)}"` : '';
  const head = label
    ? `<text x="${fmt(x + PAD)}" y="${fmt(y + PAD + FONT - 1)}" font-size="6" ` +
      `font-family="${FONT_FAMILY}" fill="${escapeAttr(color)}">${escapeAttr(label)}</text>`
    : '';
  const offset = label ? LINE : 0;
  const body = lines.map((line, i) =>
    `<text x="${fmt(x + PAD)}" y="${fmt(y + PAD + offset + (i + 1) * LINE - 2)}" font-size="${FONT}" ` +
    `font-family="${FONT_FAMILY}" fill="#3a3632">${escapeAttr(line)}</text>`).join('');
  return (
    `<g data-el="${escapeAttr(note.key)}" data-cx="${fmt(x + width / 2)}" data-cy="${fmt(y + h / 2)}"${t}>` +
    `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(width)}" height="${fmt(h + offset)}" rx="3" ` +
    `fill="#fffdf7" stroke="${escapeAttr(color)}" stroke-width="0.8" opacity="0.96"/>` +
    `<rect x="${fmt(x)}" y="${fmt(y)}" width="2.5" height="${fmt(h + offset)}" rx="1.2" fill="${escapeAttr(color)}"/>` +
    head + body +
    `</g>`
  );
}

/**
 * 줄바꿈 — SVG 는 글을 저절로 감싸 주지 않는다.
 * 마크다운 표식과 빈 줄은 덜어내고, 글자 수로 끊는다 (한글 기준).
 */
function wrap(text: string): string[] {
  const clean = text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')     // 이미지
    .replace(/[*_`#>]/g, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const line of clean) {
    for (let i = 0; i < line.length; i += PER_LINE) {
      out.push(line.slice(i, i + PER_LINE));
      if (out.length >= MAX_LINES) return [...out.slice(0, MAX_LINES - 1), `${out[MAX_LINES - 1]!.slice(0, PER_LINE - 1)}…`];
    }
  }
  return out.length > 0 ? out : ['(빈 메모)'];
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
