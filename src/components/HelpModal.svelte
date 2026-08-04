<script lang="ts">
  import { onMount } from 'svelte';
  import { SYMBOL_DEFS } from '../lib/crafts/crochet/symbols';
  import { KNIT_SYMBOL_DEFS } from '../lib/crafts/knit/symbols';
  import { pattern } from '$stores/pattern';

  // 도움말 내용은 현재 탭의 기법을 따른다 (탭 하나 = 크래프트 하나)
  const isKnit = $derived($pattern.craft === 'knit');

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
    { id: 'sym-DTR',     aliases: 'dtr',                korean: '세길긴뜨기',   english: 'double treble' },
    { id: 'sym-INC',     aliases: 'V, v, inc',          korean: '늘림',         english: 'increase' },
    { id: 'sym-DEC',     aliases: 'A, a, dec',          korean: '줄임',         english: 'decrease' },
    { id: 'sym-POPCORN', aliases: 'P, p, pc, pop',      korean: '팝콘뜨기',     english: 'popcorn' },
    { id: 'sym-BUBBLE',  aliases: 'B, b, bo, bob, bbl', korean: '버블뜨기',     english: 'bobble' },
    { id: 'sym-SKIP',    aliases: 'skip(N)',            korean: '바늘 비우기',  english: 'skip' },
  ];

  const KNIT_STITCHES: Row[] = [
    { id: 'knit-KNIT',      aliases: 'k',            korean: '겉뜨기',        english: 'knit' },
    { id: 'knit-PURL',      aliases: 'p',            korean: '안뜨기',        english: 'purl' },
    { id: 'knit-YO',        aliases: 'yo',           korean: '바늘비우기',    english: 'yarn over' },
    { id: 'knit-KTBL',      aliases: 'ktbl, tw',     korean: '꼬아 겉뜨기',   english: 'knit tbl' },
    { id: 'knit-PTBL',      aliases: 'ptbl',         korean: '꼬아 안뜨기',   english: 'purl tbl' },
    { id: 'knit-SLIP_ST',   aliases: 'sl',           korean: '걸러뜨기',      english: 'slip' },
    { id: 'knit-KFB',       aliases: 'kfb, inc',     korean: '코늘리기',      english: 'kfb' },
    { id: 'knit-M1L',       aliases: 'm1l',          korean: '왼코 늘리기',   english: 'make 1 left' },
    { id: 'knit-M1R',       aliases: 'm1r',          korean: '오른코 늘리기', english: 'make 1 right' },
    { id: 'knit-M1P',       aliases: 'm1p',          korean: '안뜨기 늘리기', english: 'make 1 purl' },
    { id: 'knit-K2TOG',     aliases: 'k2tog, k3tog', korean: '왼코겹치기',    english: 'k2tog' },
    { id: 'knit-SSK',       aliases: 'ssk, sssk',    korean: '오른코겹치기',  english: 'ssk' },
    { id: 'knit-CDD',       aliases: 'cdd, s2kp',    korean: '중심 3코 모아', english: 'centered dbl dec' },
    { id: 'knit-P2TOG',     aliases: 'p2tog',        korean: '안뜨기 왼코겹치기', english: 'p2tog' },
    { id: 'knit-SSP',       aliases: 'ssp',          korean: '안뜨기 오른코겹치기', english: 'ssp' },
    { id: 'knit-NO_STITCH', aliases: 'ns',           korean: '코 없음',       english: 'no stitch' },
    { id: 'knit-CAST_ON',   aliases: 'co, ewrap',    korean: '코잡기 / 감아코', english: 'cast on' },
    { id: 'knit-UNWORKED',  aliases: 'unw',          korean: '미작업 코',     english: 'unworked' },
    { id: 'knit-WRAP_TURN', aliases: 'wt, w&t',      korean: '되돌아뜨기',    english: 'wrap & turn' },
    { id: 'knit-DOUBLE_ST', aliases: 'ds',           korean: '독일식 되돌아뜨기', english: 'double stitch' },
    { id: 'knit-BIND_OFF',  aliases: 'bo',           korean: '코막음',        english: 'bind off' },
  ];

  function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
  onMount(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
</script>

<!-- 공유 기호 defs (모달 내 모든 <use> 가 참조) -->
<svg class="defs-host" width="0" height="0" aria-hidden="true">
  <defs>{@html isKnit ? KNIT_SYMBOL_DEFS : SYMBOL_DEFS}</defs>
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
      {#if isKnit}
      <section>
        <h3>기본 문법</h3>
        <table class="syntax-table">
          <tbody>
            <tr><td><code>kN</code></td><td>같은 코 N번. 반복수는 <b>코 뒤</b>에. 예: <code>k6</code> = 겉뜨기 6코</td></tr>
            <tr><td><code>(...)·*N</code></td><td>반복. 예: <code>(k2, p2)*10</code></td></tr>
            <tr><td><code>,</code></td><td>코 구분자 (필수)</td></tr>
            <tr><td>게이지</td><td><b>평면 도안에서만</b> — 편집기 상단 <b>게이지</b> 버튼에 10cm 당 코수·단수를 넣으면
              미리보기 아래에 실측 치수가 뜬다. 코 종류가 단 높이를 결정하므로 격자를 게이지로 늘리지는 않는다.<br>
              원형은 단마다 지름이 달라져 10cm 환산이 성립하지 않아 제공하지 않는다</td></tr>
            <tr><td><code>k2tog</code></td><td>코 이름에 숫자가 들어가도 하나로 인식 (<code>k</code>+<code>2</code> 로 쪼개지지 않음)</td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h3>겉면 / 안면</h3>
        <table class="syntax-table">
          <tbody>
            <tr><td>원통</td><td>모든 단이 <b>겉면</b>. 항상 오른쪽 → 왼쪽으로 읽음. 기호 반전 없음</td></tr>
            <tr><td>평면</td><td>홀수단 겉면(오→왼) / 짝수단 <b>안면</b>(왼→오). 안면 단은 겉면에서 본 모습으로 자동 반전</td></tr>
            <tr><td>반전 규칙</td><td>안면의 <code>p</code> → 차트엔 겉뜨기, <code>p2tog</code> → <code>ssk</code> 모양, <code>m1l</code> ↔ <code>m1r</code>. <code>yo</code>·<code>sl</code> 은 불변</td></tr>
            <tr><td>단 번호</td><td>겉면 단은 격자 <b>오른쪽</b>, 안면 단은 <b>왼쪽</b>에 표기 → 번호 위치로 방향을 알 수 있음</td></tr>
            <tr><td>면 뒤집기</td><td>단 번호 옆 <i class="fa-regular fa-eye"></i> 버튼으로 그 단의 면을 수동 지정 (짧은 단 등)</td></tr>
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
            {#each KNIT_STITCHES as row (row.id)}
              <tr>
                <td class="sym-cell">
                  <svg viewBox="-11 -8 22 16" width="28" height="20" aria-hidden="true">
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
        <h3>격자 규칙</h3>
        <table class="syntax-table">
          <tbody>
            <tr><td>1코 = 1칸</td><td>한 단의 칸 수 = 그 단이 만든 코 수. 1단이 맨 아래</td></tr>
            <tr><td>코 없음</td><td>코 수가 달라진 단만 그 <b>차이만큼</b> 회색 빈 칸으로 맞춤. 늘림 코 <b>아래</b>, 줄임 코 <b>위</b>에 놓인다</td></tr>
            <tr><td>코 수가 같으면</td><td>격자를 건드리지 않음 — 레이스처럼 <code>yo</code> 와 <code>ssk</code> 가 상쇄되면 직사각형 유지</td></tr>
            <tr><td>Cascade <b>On</b></td><td>늘림·줄임으로 달라진 코 수만큼 빈 칸을 넣어 <b>열을 맞춤</b> (늘림 아래 / 줄임 옆)</td></tr>
            <tr><td>Cascade <b>Off</b></td><td>그 빈 칸을 넣지 않아 <b>코가 붙어 보임</b>. 단 중간 코막음으로 생긴 구멍은 그대로 유지</td></tr>
            <tr><td>빈 칸</td><td>코가 없는 칸은 모두 회색 — 코막음 구멍, 열 맞춤 자리, 좌우 여백, 되돌아뜨기의 미작업 코</td></tr>
            <tr><td>구멍 메우기</td><td><code>bo2</code> 로 뚫은 자리를 다음 단에서 <code>co2</code>(감아코) 로 메우면 구멍이 사라지고 열이 맞음</td></tr>
            <tr><td>게이지</td><td>편집기 상단 <b>게이지</b> 버튼 → <code>[코] × [단] / 10cm</code> — 칸 세로 비율에 반영되고, 미리보기 아래에 실측 치수 표시 (가로는 고정)</td></tr>
            <tr><td><code>k3tog</code>·<code>sssk</code></td><td>3코 이상 모아뜨기. <code>k2tog^4</code> 처럼 <code>^N</code> 으로도 지정 가능</td></tr>
            <tr><td><code>co40</code></td><td>코잡기 40코 — 부모 단 없이 시작. 보통 1단에 쓴다</td></tr>
            <tr><td><code>bo40</code></td><td>코막음 40코 — 코를 없애며 마무리. <b>단 중간</b>에 쓰면 진동·목선 파기 (위쪽에 빈 칸이 생김)</td></tr>
            <tr><td><code>co5</code> (단 중간)</td><td><b>감아코</b> — 단 중간에서 코를 새로 만듦 (아래쪽에 빈 칸이 생김)</td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h3>배색 도안</h3>
        <table class="syntax-table">
          <tbody>
            <tr><td><code>k5:red</code></td><td>그 코들을 지정한 색으로 — <b>칸 배경</b>이 칠해진다</td></tr>
            <tr><td>기호 색</td><td>배경 밝기에 따라 자동으로 흰색/검정 전환 (어두운 실 위에서도 기호가 보이도록)</td></tr>
            <tr><td>칠하는 방식</td><td>미리보기 툴바의 <b>배경색 / 기호색</b> 버튼으로 전환.
              배경색 = 코 자리를 실 색으로 채우고 기호는 대비색 / 기호색 = 기호 선만 실 색</td></tr>
            <tr><td>배색 목록의 칩</td><td>앞의 세 칩(점선)은 표시 옵션이라 본문을 고치지 않는다 —
              <b>빈칸</b>(코가 없는 자리) · <b>칸</b>(색 없는 코의 배경) · <b>기호</b>(색 없는 코의 기호 선)</td></tr>
            <tr><td>배색 목록</td><td>편집 화면 위 <b>배색</b> 버튼을 누르면 펼쳐진다 (게이지도 마찬가지)</td></tr>
            <tr><td>실 색</td><td>구분선 뒤의 칩들은 본문에 <code>:색</code> 으로 적힌 실 색.
              클릭해 바꾸면 <b>도안 전체</b>에서 그 색으로 칠한 코가 한 번에 바뀐다</td></tr>
            <tr><td>범례</td><td>차트 아래에 쓰인 색과 코 수를 자동 표시</td></tr>
            <tr><td>예</td><td><code>3: k2:navy, (k2:cream, k2:navy)*5</code></td></tr>
            <tr><td>색 넣기</td><td><code>:</code> 를 치면 그 자리에 팔레트가 열린다. 팔레트를 보면서 <code>aaf</code> 처럼 계속 쳐도 되고,
              <b>스페이스</b>를 누르면 확정된다</td></tr>
            <tr><td>보이는 모습</td><td>확정된 색 코드는 <b>동그란 색 미리보기</b>로 접혀서 도안이 짧게 읽힌다.
              고치려면 그 동그라미를 클릭하거나 커서를 대면 원래 코드가 다시 보인다</td></tr>
            <tr><td>여러 코 한꺼번에</td><td>코들을 드래그로 선택한 뒤 단 오른쪽 팔레트 버튼</td></tr>
            <tr><td>배색 바꿔보기</td><td>편집 화면 위쪽 <b>배색</b> 목록에서 색을 클릭하면
              <b>도안 전체</b>에서 그 색으로 칠한 코가 한 번에 바뀐다</td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h3>되돌아뜨기 (short row)</h3>
        <table class="syntax-table">
          <tbody>
            <tr><td><code>wt</code> / <code>ds</code></td><td>되돌아뜨기 turn — 감아뜨기(wrap &amp; turn) / 독일식(double stitch)</td></tr>
            <tr><td><code>unw</code></td><td><b>미작업 코</b> — 뜨지 않고 바늘에 남겨둔 코. 코 수가 보존되므로 경고가 뜨지 않고, 격자에는 회색으로 표시</td></tr>
            <tr><td>쓰는 위치</td><td><b>그 단의 작업 순서대로</b> 적는다. 아직 안 지난 코면 뒤에, 이미 지나온 코면 앞에.<br>
              예) <code>3: k12, wt, unw7</code> (가는 단 — 남은 7코는 앞쪽)<br>
              <code>4: unw7, p13</code> (돌아오는 단 — 그 7코는 이미 지나옴)</td></tr>
            <tr><td>확인</td><td>가는 단과 오는 단의 회색 구간이 <b>같은 열</b>에 오면 올바르게 적은 것</td></tr>
            <tr><td>자동 계산</td><td>에디터 아래 <b>되돌아뜨기</b> 버튼 — 전체 코수·한 번에 남길 코·횟수만 넣으면
              <code>unw</code> 위치와 마무리 단까지 계산해 여러 단으로 한 번에 넣는다.<br>
              어깨 경사는 <b>한쪽만</b>, 뒷목·힐·요크는 <b>양쪽 번갈아</b>.</td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h3>마커 (place marker)</h3>
        <table class="syntax-table">
          <tbody>
            <tr><td><code>pm</code></td><td>마커 — 코가 아니라 <b>코와 코 사이</b>를 가리킨다. 코를 소비/생성하지 않아 코 수 검증에 영향이 없다.
              별칭 <code>sm</code>, <code>marker</code></td></tr>
            <tr><td>표시</td><td>칸 경계의 격자선을 <b>굵게</b> 덧그린다</td></tr>
            <tr><td><code>pm:fff</code></td><td>마커 색 지정. 기본은 격자와 같은 색</td></tr>
            <tr><td><code>pm "옆선"</code></td><td>마커 위에 라벨 표시</td></tr>
            <tr><td>단마다 다시</td><td>마커는 <b>위 단으로 자동으로 이어지지 않는다</b>. 필요한 단마다 적는다<br>
              예) <code>3: k4, pm, k8, pm, k4</code></td></tr>
            <tr><td>방향 주의</td><td>마커도 <b>뜨는 순서</b>대로 적으므로, 안면 단에서는 반대쪽 끝에서부터 센다 (<code>unw</code> 와 같다)</td></tr>
          </tbody>
        </table>
      </section>
      {:else}
      <section>
        <h3>기본 문법</h3>
        <table class="syntax-table">
          <tbody>
            <tr><td><code>Nx</code></td><td>같은 코 N번. 예: <code>6x</code> = 짧은뜨기 6개</td></tr>
            <tr><td><code>(...)·*N</code></td><td>반복. 예: <code>(1x, 1v)*6</code></td></tr>
            <tr><td><code>[...]</code></td><td>같은 부모 코에 여러 기호 적용. 예: <code>[f, t]</code></td></tr>
            <tr><td><code>tc(...)</code></td><td>기둥코 — 내부를 세로 스택으로 쌓고 1슬롯 차지. 예: <code>tc(3ch)</code>, <code>[tc(3ch), 1f]</code></td></tr>
            <tr><td><code>skip(N)</code></td><td>바늘 비우기 — 부모 N개 건너뜀</td></tr>
            <tr><td><code>pm</code></td><td>마커 — 코와 코 <b>사이</b>를 가리킨다. 코 수에 영향 없음. 원형은 반지름 방향 눈금으로 표시<br>
              색·라벨: <code>pm:fff</code>, <code>pm "옆선"</code>. 단마다 다시 적는다 (위 단으로 이어지지 않음)<br>
              예) <code>3: pm, (3x, 1v), pm, (3x, 1v)</code> — 늘림이 마커 기준으로 맞는지 확인</td></tr>
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
            <tr><td><code>x3tog</code>, <code>3tog(x)</code></td><td><code>AX^3</code> 와 동일 — 3 부모를 1코로 줄임 (영문 패턴 <code>sc3tog</code>)</td></tr>
            <tr><td><code>x3in</code>, <code>3in(x)</code></td><td><code>VX^3</code> 와 동일 — 1 부모에서 3 코로 늘림 (영문 패턴 <code>3 sc in next st</code>)</td></tr>
            <tr><td><code>3tog(ch)</code></td><td>3 부모를 1 사슬로 수렴 — <code>3tog([1ch])</code> 와 동의어</td></tr>
            <tr><td><code>3tog([5ch])</code></td><td><b>사슬 브릿지</b> — 3 부모 위로 5 사슬 호. 다음 단에 1 슬롯 (호 가운데에서 부모 1코로 인지)</td></tr>
            <tr><td><code>tr(N)</code></td><td>N 길 긴뜨기 (N≥2). 예: <code>tr(4)</code> = 네길긴뜨기, <code>vtr(5)</code> = 다섯길긴뜨기 늘림</td></tr>
          </tbody>
        </table>
      </section>

      {/if}

      <section>
        <h3>주석</h3>
        <table class="syntax-table">
          <tbody>
            <tr><td><code>:색</code></td><td>색상 (배색 도안). <code>#</code> 있/없음 hex 또는 키워드. 예: <code>x:#ff6a6a</code>, <code>x:ff6a6a</code>, <code>x:efd</code>, <code>x:red</code><br>
              <code>:</code> 를 치면 팔레트가 열리고, 스페이스로 확정하면 색 코드가 <b>동그란 미리보기</b>로 접힌다
              (커서를 대거나 클릭하면 다시 펼쳐진다). 여러 코를 선택한 뒤 단 오른쪽 팔레트 버튼으로 한꺼번에 칠할 수도 있고,
              편집 화면 위 <b>배색</b> 목록에서 도안 전체의 색을 바꿀 수도 있다</td></tr>
            <tr><td>키워드</td><td><code>red, orange, yellow, green, teal, cyan, blue, indigo, purple, pink, brown, black, white, gray, silver, navy</code></td></tr>
            <tr><td><code>"..."</code></td><td>인라인 코멘트 — 서술 도안에 각주 <code>*1, *2…</code> 로 표시. 같은 텍스트는 같은 번호를 공유. <code>:색</code> 과 순서 무관. 예: <code>x"조심":red</code> = <code>x:red"조심"</code></td></tr>
            {#if !isKnit}
              <tr><td><code>blo</code></td><td>뒤이랑뜨기 수식자. 예: <code>blo 6x</code></td></tr>
            {/if}
          </tbody>
        </table>
      </section>

      <section>
        <h3>편의 기능</h3>
        <table class="syntax-table">
          <tbody>
            <tr><td>더블클릭 확대</td><td>미리보기 영역을 더블클릭하면 확대 모달이 열림</td></tr>
            {#if isKnit}
              <tr><td>균등 증감 계산기</td><td>편집기 하단 <i class="fa-solid fa-calculator"></i> 버튼 — 현재 코 수 → 목표 코 수 패턴 자동 생성. 늘림 방식(<code>m1l</code>/<code>m1r</code>/<code>yo</code>/<code>kfb</code>)과 줄임 방식(<code>k2tog</code>/<code>ssk</code>)을 고를 수 있음</td></tr>
            {:else}
              <tr><td>균등 증감 계산기</td><td>편집기 하단 <i class="fa-solid fa-calculator"></i> 버튼 — 현재 단 코 수 → 목표 코 수 패턴 자동 생성</td></tr>
            {/if}
            <tr><td>단 메모</td><td>단 번호 옆 <i class="fa-regular fa-comment"></i> 아이콘 클릭 → 마크다운 메모 추가. 서술 도안과 미리보기 상단에도 표시</td></tr>
            <tr><td>도안 메모</td><td>편집기 상단 "메모" 버튼 — 도안 전체에 대한 메모. 마크다운·이미지 지원</td></tr>
            <tr><td>1단 방향</td><td>미리보기 toolbar 의 <i class="fa-solid fa-arrows-up-down"></i> — 1단을 위/아래로 뒤집기</td></tr>
            {#if isKnit}
              <tr><td>미리보기 toolbar</td><td>격자 도안이라 연결선·세로 정렬 토글은 없음. Grid(칸 테두리) / Cascade / 정렬 / 1단 방향만 사용</td></tr>
              <tr><td>좁은 화면</td><td>칸이 너무 작아지면 축소 대신 가로 스크롤 — 모바일에서도 기호가 보이도록</td></tr>
            {/if}
            <tr><td>패널 크기 조정</td><td>편집기·미리보기 사이 핸들을 드래그 (좁은 화면에서는 상하 핸들). localStorage 에 저장</td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h3>단축키 — 편집 모드</h3>
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
        <h3>단축키 — 미리보기 모드</h3>
        <table class="syntax-table">
          <tbody>
            <tr><td><kbd>←</kbd> / <kbd>→</kbd></td><td>현재 단 안에서 이전/다음 코로 이동 (경계에서 인접 단으로 롤오버)</td></tr>
            <tr><td><kbd>Shift</kbd>+<kbd>←</kbd> / <kbd>→</kbd></td><td>이전/다음 단</td></tr>
            <tr><td><kbd>Home</kbd> / <kbd>End</kbd></td><td>첫 단 / 마지막 단</td></tr>
            <tr><td><kbd>Esc</kbd></td><td>현재 코 강조 해제</td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h3>예시</h3>
        {#if isKnit}
          <pre><code>co40                        → 코잡기 40코
k2, (p2, k2)*9, p2          → 고무뜨기
k1, yo, ssk, k34, k2tog, yo, k1   → 레이스 (코 수 유지)
k1, m1l, k38, m1r, k1       → 래글런 늘림 (42코)
k12, wt, unw30              → 되돌아뜨기 (가는 단)
unw30, p12                  → 되돌아뜨기 (오는 단)
k2:navy, (k2:cream, k2:navy)*9    → 배색
k8, bo10, k8                → 진동 파기 (중간 코막음)
bo36                        → 코막음</code></pre>
        {:else}
        <pre><code>mr, 6x
6v                          → 12코
tc(3ch), 11t                → 기둥코 + 11긴뜨기 (총 12슬롯)
[tc(3ch), 1f], 10f, 1sl     → 기둥코와 F를 한 코에 + 10F + 빼뜨기
skip(2), 1f, 3ch, 1f        → 첫 F 는 3번째 부모에서 시작</code></pre>
        {/if}
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
