<script lang="ts">
  import { onMount } from 'svelte';
  import { SYMBOL_DEFS } from '../lib/render/symbols';

  interface Props { onClose: () => void; }
  let { onClose }: Props = $props();

  type Row = { id: string; aliases: string; korean: string; english: string; viewBox?: string };
  const STITCHES: Row[] = [
    { id: 'sym-MAGIC',   aliases: '@, mr',              korean: '매직링',       english: 'magic ring' },
    { id: 'sym-CHAIN',   aliases: 'O, o, ch',           korean: '사슬뜨기',     english: 'chain' },
    { id: 'sym-SLIP',    aliases: '_, S, sl',           korean: '빼뜨기',       english: 'slip stitch' },
    { id: 'sym-SC',      aliases: 'X, x, sc',           korean: '짧은뜨기',     english: 'single crochet' },
    { id: 'sym-HDC',     aliases: 'T, t, hdc',          korean: '긴뜨기',       english: 'half double' },
    { id: 'sym-DC',      aliases: 'F, f, dc',           korean: '한길긴뜨기',   english: 'double' },
    { id: 'sym-TR',      aliases: 'E, e, tr',           korean: '두길긴뜨기',   english: 'treble' },
    { id: 'sym-INC',     aliases: 'V, v, inc',          korean: '늘림',         english: 'increase' },
    { id: 'sym-DEC',     aliases: 'A, a, dec',          korean: '줄임',         english: 'decrease' },
    { id: 'sym-POPCORN', aliases: 'P, p, pc, pop',      korean: '팝콘뜨기',     english: 'popcorn' },
    { id: 'sym-BUBBLE',  aliases: 'B, b, bo, bob, bbl', korean: '버블뜨기',     english: 'bobble' },
    { id: 'sym-SKIP',    aliases: 'skip(N)',            korean: '바늘 비우기',  english: 'skip' },
  ];

  function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
  onMount(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
</script>

<!-- 공유 기호 defs (모달 내 모든 <use> 가 참조) -->
<svg class="defs-host" width="0" height="0" aria-hidden="true">
  <defs>{@html SYMBOL_DEFS}</defs>
</svg>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="overlay" onclick={onClose} role="presentation">
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
    <header class="modal-header">
      <h2><i class="fa-solid fa-circle-question"></i> 도안 작성 가이드</h2>
      <button class="close-btn" onclick={onClose} aria-label="닫기"><i class="fa-solid fa-xmark"></i></button>
    </header>

    <div class="modal-body">
      <section>
        <h3>기본 문법</h3>
        <table class="syntax-table">
          <tbody>
            <tr><td><code>Nx</code></td><td>같은 코 N번. 예: <code>6x</code> = 짧은뜨기 6개</td></tr>
            <tr><td><code>(...)·*N</code></td><td>반복. 예: <code>(1x, 1v)*6</code></td></tr>
            <tr><td><code>[...]</code></td><td>같은 부모 코에 여러 기호 적용. 예: <code>[f, t]</code></td></tr>
            <tr><td><code>tc(...)</code></td><td>기둥코 — 내부를 세로 스택으로 쌓고 1슬롯 차지. 예: <code>tc(3ch)</code>, <code>[tc(3ch), 1f]</code></td></tr>
            <tr><td><code>skip(N)</code></td><td>바늘 비우기 — 부모 N개 건너뜀</td></tr>
            <tr><td><code>,</code></td><td>코 구분자 (필수)</td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h3>코 기호</h3>
        <table class="symbol-table">
          <thead>
            <tr><th>기호</th><th>입력 (별칭)</th><th>한글</th><th>영문</th></tr>
          </thead>
          <tbody>
            {#each STITCHES as row (row.id)}
              <tr>
                <td class="sym-cell">
                  <svg viewBox="-14 -14 28 28" width="28" height="28" aria-hidden="true">
                    <use href="#{row.id}"/>
                  </svg>
                </td>
                <td><code>{row.aliases}</code></td>
                <td>{row.korean}</td>
                <td class="en">{row.english}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </section>

      <section>
        <h3>V / A 변형 (늘림·줄임)</h3>
        <table class="syntax-table">
          <tbody>
            <tr><td><code>V</code></td><td>기본 늘림 — 짧은뜨기 2개</td></tr>
            <tr><td><code>VT</code>, <code>VF</code>, <code>VE</code></td><td>긴뜨기 / 한길긴뜨기 / 두길긴뜨기 기반 늘림</td></tr>
            <tr><td><code>V^3</code></td><td>3개로 확장 (한 부모에서 3개 생성)</td></tr>
            <tr><td><code>A</code>, <code>AT</code>, <code>AF</code>, <code>A^3</code></td><td>동일 규칙의 줄임</td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h3>주석</h3>
        <table class="syntax-table">
          <tbody>
            <tr><td><code>:색</code></td><td>색상 (배색 도안). <code>#</code> 있/없음 hex 또는 키워드. 예: <code>x:#ff6a6a</code>, <code>x:ff6a6a</code>, <code>x:efd</code>, <code>x:red</code></td></tr>
            <tr><td>키워드</td><td><code>red, orange, yellow, green, teal, cyan, blue, indigo, purple, pink, brown, black, white, gray, silver, navy</code></td></tr>
            <tr><td><code>"..."</code></td><td>인라인 코멘트 (서술 도안에 각주로 표시). 예: <code>x"조심"</code></td></tr>
            <tr><td><code>blo</code></td><td>뒤이랑뜨기 수식자. 예: <code>blo 6x</code></td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h3>단축키</h3>
        <table class="syntax-table">
          <tbody>
            <tr><td><kbd>Enter</kbd></td><td>현재 단 안에서 줄바꿈</td></tr>
            <tr><td><kbd>Shift</kbd>+<kbd>Enter</kbd></td><td>새 단 추가</td></tr>
            <tr><td><kbd>Shift</kbd>+<kbd>Backspace</kbd></td><td>현재 단 삭제</td></tr>
            <tr><td><kbd>↑</kbd> / <kbd>↓</kbd></td><td>위/아래 단으로 포커스 이동</td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h3>예시</h3>
        <pre><code>mr, 6x
6v                          → 12코
tc(3ch), 11t                → 기둥코 + 11긴뜨기 (총 12슬롯)
[tc(3ch), 1f], 10f, 1sl     → 기둥코와 F를 한 코에 + 10F + 빼뜨기
skip(2), 1f, 3ch, 1f        → 첫 F 는 3번째 부모에서 시작</code></pre>
      </section>
    </div>
  </div>
</div>

<style>
  .defs-host { position: absolute; }
  .overlay {
    position: fixed; inset: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 1000;
    display: flex; align-items: center; justify-content: center;
    padding: 20px;
  }
  .modal {
    background: var(--bg-card);
    border-radius: var(--radius);
    box-shadow: var(--shadow-lg, 0 8px 32px rgba(0,0,0,0.2));
    max-width: 720px;
    width: 100%;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .modal-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 20px;
    border-bottom: 1px solid var(--border-light);
  }
  .modal-header h2 {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--text);
    display: flex; align-items: center; gap: 8px;
  }
  .close-btn {
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--text-secondary);
    font-size: 18px;
    padding: 4px 8px;
    border-radius: var(--radius-sm);
  }
  .close-btn:hover { background: var(--bg-hover); }

  .modal-body {
    overflow-y: auto;
    padding: 16px 20px 24px;
    color: var(--text);
  }
  section { margin-bottom: 18px; }
  section:last-child { margin-bottom: 0; }
  section h3 {
    font-size: 14px;
    font-weight: 600;
    margin: 0 0 8px;
    color: var(--text);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  td, th {
    padding: 6px 10px;
    text-align: left;
    border-bottom: 1px solid var(--border-light);
    vertical-align: middle;
  }
  th {
    font-weight: 600;
    color: var(--text-secondary);
    font-size: 12px;
    background: var(--bg-hover);
  }
  tr:last-child td { border-bottom: none; }
  .syntax-table td:first-child { width: 30%; white-space: nowrap; }
  .symbol-table .sym-cell {
    width: 36px;
    color: var(--text);
    text-align: center;
    padding: 4px 8px;
  }
  .symbol-table .sym-cell svg { display: block; margin: 0 auto; }
  .symbol-table td:nth-child(2) { width: 30%; }
  .symbol-table td.en {
    color: var(--text-secondary);
    font-style: italic;
    font-size: 12px;
  }
  code {
    background: rgba(0,0,0,0.06);
    padding: 1px 5px;
    border-radius: 3px;
    font-family: var(--font-mono);
    font-size: 12px;
  }
  kbd {
    background: var(--bg-hover);
    border: 1px solid var(--border);
    border-bottom-width: 2px;
    border-radius: 3px;
    padding: 1px 6px;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text);
  }
  pre {
    background: var(--bg-hover);
    padding: 10px 12px;
    border-radius: var(--radius-sm);
    overflow-x: auto;
    font-size: 12px;
    line-height: 1.5;
    margin: 0;
  }
  pre code {
    background: transparent;
    padding: 0;
    font-size: inherit;
  }
</style>
