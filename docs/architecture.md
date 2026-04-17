# 아키텍처 설계 (Architecture)

> 이 문서는 코바늘 도안 웹 앱의 기술 스택, 모듈 구조, 데이터 흐름, UX 명세를 정의합니다.
> 기호 체계는 [`symbol_system.md`](./symbol_system.md) 참조.

## 1. 기본 원칙

- **No-server, static-only**: GitHub Pages 정적 호스팅. 백엔드 없음.
- **클라이언트 100% 동작**: 모든 변환·렌더링이 브라우저에서 수행.
- **Python 미사용**: 런타임·툴링 모두 JS/TS 생태계로.
- **로그인/저장 후순위**: MVP 이후. 도입 시 Supabase 등 BaaS 직결 (서버 없이).

## 2. 기술 스택

| 영역 | 선택 | 이유 |
|---|---|---|
| 언어 | **TypeScript** | 파서·AST·좌표 계산의 타입 안정성 확보 |
| UI 프레임워크 | **Svelte 5** | 입문자 친화적 문법, 작은 번들, HTML/CSS와 가장 가까움 |
| 빌드 도구 | **Vite** | 빠른 HMR, 표준 도구, GitHub Pages 배포 간단 |
| 코드 에디터 | **CodeMirror 6** | 인라인 데코레이션·오류 마커 표준 지원, 가벼움 |
| 테스트 | **Vitest** | Vite 통합, Jest 호환 API |
| 배포 | **GitHub Actions → GitHub Pages** | 정적 호스팅 표준 |
| (추후) BaaS | **Supabase** | Postgres 기반, 무료 티어, 오픈소스 |

> SvelteKit은 **사용하지 않음** — 라우팅·SSR이 불필요한 단일 페이지 앱.

## 3. 모듈 구조

```
crochet-chart/
├── docs/
│   ├── symbol_system.md
│   └── architecture.md          (이 문서)
├── src/
│   ├── lib/                     ── 순수 TS 코어 (UI 독립)
│   │   ├── parser/
│   │   │   ├── tokenizer.ts     ── 문자열 → 토큰 스트림
│   │   │   ├── ast.ts           ── AST 노드 타입 정의
│   │   │   └── parser.ts        ── 토큰 → AST (점진적 모드 지원)
│   │   ├── model/
│   │   │   ├── stitch.ts        ── Stitch 열거형 + 메타데이터 (consume/produce)
│   │   │   └── round.ts         ── Round 표현
│   │   ├── expand/
│   │   │   └── expander.ts      ── AST → 평탄화된 코 ops 리스트
│   │   ├── layout/
│   │   │   ├── types.ts         ── PositionedStitch 등
│   │   │   ├── circular.ts      ── 원형 도안 좌표 계산
│   │   │   └── flat.ts          ── 평면 도안 좌표 계산
│   │   └── render/
│   │       ├── symbols.ts       ── SVG <symbol> 정의
│   │       └── svg.ts           ── SVG 문자열 조립
│   ├── components/              ── Svelte 컴포넌트
│   │   ├── App.svelte
│   │   ├── PatternEditor.svelte ── 다단 입력 (CodeMirror)
│   │   ├── RoundLine.svelte     ── 단일 단 입력 줄
│   │   ├── ChartViewer.svelte   ── SVG 미리보기
│   │   ├── ShapeSelector.svelte ── 원형/평면 선택
│   │   ├── ModeToggle.svelte    ── Edit/Read 모드 전환
│   │   └── RoundNavigator.svelte── Read 모드 단 진행 추적 (◀ N/M ▶)
│   ├── stores/
│   │   ├── pattern.ts           ── 도안 상태 (단별 텍스트 + 파싱 결과)
│   │   └── mode.ts              ── Edit/Read 모드 상태
│   ├── App.svelte
│   └── main.ts
├── tests/
│   ├── parser.test.ts
│   ├── expander.test.ts
│   └── layout.test.ts
├── public/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── .github/workflows/deploy.yml
```

## 4. 데이터 흐름

```
사용자 입력 (단별 텍스트)
        ↓
    Tokenizer (longest-match)
        ↓
      Parser (점진적, 에러 허용)
        ↓
        AST  ── ParseError 발생 시 부분 AST + 에러 위치
        ↓
     Expander (AST → 코 ops, consume/produce 누적)
        ↓
   ValidatedOps  ── 부모 단 코 수 비교, 의미 오류 표시
        ↓
      Layout (원형 또는 평면)
        ↓
PositionedStitches
        ↓
     Renderer
        ↓
       SVG → ChartViewer 렌더
```

## 5. UX 명세

### 5.1 입력 (Edit 모드)

- **다단 입력 컴포넌트**: 각 단은 single-line CodeMirror 인스턴스
- **단 추가**: Enter → 새 단 생성, 자동 인덱스 (`1:`, `2:`, ...)
- **단 삭제**: 빈 단에서 Backspace → 위 단으로 병합
- **단 순서 변경**: 드래그 또는 위/아래 화살표 (MVP 후순위)
- **도형 선택**: 상단 드롭다운 (원형/평면)

### 5.2 점진적 파싱·미리보기

**트리거**: `,` 입력 시 + 단 완성(Enter) 시 + `)` 또는 `*N` 완성 시.

**처리 흐름**:
1. 마지막 정상 지점부터 트리거 위치까지를 한 세그먼트로 파싱
2. 성공 → 미리보기 갱신, 정상 지점 전진
3. 실패 → 해당 트리거 문자에 빨간 표시, 이후 입력은 미반영
4. 사용자가 수정하면 매 키 입력마다 재파싱 → 정상화 시 빨강 해소

**괄호 내부 `,`**: 즉시 커밋하지 않음. `)` 또는 `*N` 완성 시점에 통째로 커밋.

**오류 분류**:

| 종류 | 표시 | 비고 |
|---|---|---|
| 알 수 없는 기호 (`Q`) | **즉시 빨강** | 토큰 위치에 데코레이션 |
| 짝 안 맞는 괄호 | 빨강 | 닫는 괄호 누락 시 라인 끝에 마커 |
| 불완전 토큰 (`bl` 타이핑 중) | 표시 없음 | 미리보기 미반영, 다음 입력 대기 |
| **초과**: 부모 단 코 수 초과 | **초과 시작 토큰부터 빨강** | "단 N: 부모 N코 초과" 경고 |
| **부족**: 부모 단 코 수 미만 | 라인 끝 노란 마커 | "N코 부족" 안내 |

**단 의존성**: 단 N은 단 N-1의 생성 코 수에 의존. 이전 단이 미완성/오류면 다음 단은 그리지 않고 안내 표시.

### 5.3 Read 모드

- 미리보기 SVG 전체 화면
- 입력 텍스트는 접힌 패널로 보기만 가능 (편집 불가)
- **SVG 다운로드 버튼** 제공
- **단 네비게이터** (아래 5.3.1) — 실제 뜨개 작업 중 진행 추적용
- (추후) 이미지 PNG 변환 다운로드, 인쇄

#### 5.3.1 단 네비게이터 (Round Navigator)

사용자가 도안을 보며 뜨개질하는 동안 "현재 작업 중인 단"을 시각적으로 추적하는 컨트롤.

**UI 구성** (Read 모드 상단 중앙):
```
◀  [ 3 / 10 ]  ▶
```
- `◀` / `▶` 버튼: 이전/다음 단 이동 (경계에서 비활성화)
- 중앙 숫자 영역: **현재 단 번호 / 총 단 수**. 클릭 시 `<input type="number">`로 전환되어 직접 입력 가능 (유효 범위 1 ~ 총 단 수)
- 현재 단 텍스트를 네비게이터 아래에 함께 표시 (예: `(1X, 1V) * 6`)

**SVG 하이라이트 규칙**:

| 단 상태 | 시각 표현 |
|---|---|
| **현재 단** | 선명한 색상 + 굵은 선 (stroke-width 강조) |
| **이전 단들 (완성)** | 옅은 표시 (opacity ≈ 0.4) |
| **미래 단들 (미완)** | 회색/점선 또는 매우 옅음 (opacity ≈ 0.15) |

**키보드 단축키**:
- `↑` / `→`: 다음 단
- `↓` / `←`: 이전 단
- `Home` / `End`: 첫 단 / 마지막 단
- 두 자리 이상 단으로 바로 이동은 네비게이터 숫자 입력 사용

**상태 저장**:
- `localStorage`에 `{patternId, currentRound}` 저장
- 동일 도안 재방문 시 마지막 작업 단 복원
- 도안 내용이 바뀌면 `currentRound`가 범위를 벗어날 수 있으므로 clamp 처리

**Edit 모드와의 관계**:
- Edit 모드 → Read 모드 전환 시: 현재 단은 마지막 저장값 또는 1로 초기화
- Read 모드 → Edit 모드 전환 시: 현재 단에 해당하는 입력 줄로 자동 스크롤/포커스

### 5.4 모드 토글

상단 우측 토글 버튼. 단축키(`Ctrl+E`) 추가 검토.

## 6. 핵심 알고리즘

### 6.1 Tokenizer (longest-match)

별칭 셋 `{@, mr, O, ch, o, S, sl, _, X, sc, x, F, hdc, f, T, dc, t, E, tr, e, V, inc, v, A, dec, a, blo, BLO}`을 사전에 등록하고 입력의 각 위치에서 가장 긴 일치를 선택. 숫자(`\d+`), `^`, `(`, `)`, `,`, `*`, 공백은 별도 토큰.

### 6.2 Parser

문법(EBNF):
```
round            ::= sequence
sequence         ::= element ("," element)*
element          ::= stitchElement | repeatElement | sameHoleElement
stitchElement    ::= modifier? count? stitch expansion?
repeatElement    ::= "(" sequence ")" "*" NUMBER
sameHoleElement  ::= count? "[" sequence "]"    (안에 V/A/중첩 [] 금지. () 허용)
expansion        ::= "^" NUMBER                  (V/A에만 허용)
count            ::= NUMBER
stitch           ::= "@" | "O" | "S" | "X" | "F" | "T" | "E" | "V" | "A"
modifier         ::= "blo"
```

점진적 모드: 세그먼트 단위로 파싱, 실패 시 마지막 정상 AST 반환 + 에러 토큰 위치 반환.

### 6.3 Expander

AST를 순회하며 `Op { type, sourceRange, baseStitch, expansion }` 리스트로 평탄화. 각 Op는 `consume`/`produce` 메타데이터를 가짐:

| Op | consume | produce |
|---|---|---|
| MAGIC (`@`) | 0 | 0 |
| CHAIN (`O`) | 0 | 1 |
| SLIP (`S`) | 1 | 0 (또는 마무리용) |
| SC/HDC/DC/TR (`X/F/T/E`) | 1 | 1 |
| `V^N` | 1 | N |
| `A^N` | N | 1 |
| `blo X` | 1 | 1 (시각적으로만 다름) |

### 6.4 Layout: 원형

- 단 n의 반지름: `r_n = r_0 + n × stitch_height`
- 단 n의 코 수: `produce_total(n)`
- 각 코의 각도: `θ_i = 2π × i / produce_total(n)`
- 좌표: `(r_n × cos(θ_i), r_n × sin(θ_i))`
- 부모-자식 연결선 (늘림/줄임 시각화)

### 6.5 Layout: 평면

- 격자: 코 너비 `w`, 단 높이 `h`
- 단 n, 위치 i의 좌표: `(i × w, n × h)`
- **방향 전환**: 홀수 단은 좌→우, 짝수 단은 우→좌 (실제 뜨개와 동일). 방향은 시작 마커(▶/◀)로만 표현하고 기호는 항상 위쪽을 향해 그린다 (차트 관행).
- 부모-자식 연결선 (위/아래 단 간)

### 6.6 SVG 렌더링

- `<defs><symbol id="stitch-X">...</symbol>...</defs>`로 기호 정의
- 본문은 `<use href="#stitch-X" x=.. y=.. transform="rotate(..)" />`
- 단별 그룹화: `<g class="round-3" stroke="...">`
- 단별 색상: HSL 기반 자동 분배 (단 수에 비례한 색상환 분할)

## 7. 상태 관리

Svelte stores 사용:

```ts
// stores/pattern.ts
export const pattern = writable<{
  shape: 'circular' | 'flat';
  rounds: Array<{
    text: string;
    parsed?: Round;     // 정상 파싱 결과
    errors?: Error[];   // 위치·메시지
  }>;
}>;

// stores/mode.ts
export const mode = writable<'edit' | 'read'>('edit');

// stores/navigation.ts
export const currentRound = writable<number>(1);  // Read 모드 진행 추적
```

## 8. 배포

**GitHub Actions** (`.github/workflows/deploy.yml`):
- main 푸시 시 빌드 → `dist/` → `gh-pages` 브랜치 푸시 또는 GitHub Pages 직접 배포
- Vite의 `base` 설정으로 서브패스 처리

## 9. MVP 범위 / 우선순위

### Phase 1 (MVP)
- 기호: `@`, `O`, `S`, `X`, `F`, `T`, `E`, `V`(+`^N`), `A`(+`^N`), `blo`
- 도형: 원형, 평면
- 입력: 다단 + 점진적 미리보기 + 오류 표시
- 출력: SVG 화면 표시 + 다운로드
- 모드: Edit / Read
- Read 모드 단 네비게이터 (진행 추적, localStorage 복원)

### Phase 2
- 도안 URL 공유 (텍스트 → 인코딩된 쿼리스트링)
- PNG 변환 다운로드, 인쇄 스타일

### Phase 3
- 로그인 (Supabase) + 도안 저장/불러오기
- 도안 갤러리/공유

### Phase 4 (장기)
- 오각형/사각형 도형
- 코 종류별 V/A 베이스 변경
- 색상 변경 기호, 앞이랑(`flo`) 등

## 10. 알려진 한계 / 개선 예정 (Known Issues & TODO)

현재 파이프라인이 단순화하여 처리하는 시각적 정확도 항목들. MVP 이후 순차 개선.

### 10.1 코 종류별 높이 차이 미반영 (평면 도안)

현재 `FLAT_CELL_HEIGHT` 상수 하나로 모든 코가 동일 단 높이에 배치된다.
실제 코바늘에서는:

| 코 | 상대 높이 |
|---|---|
| `X` (SC, 짧은뜨기) | 1.0 |
| `T` (HDC, 긴뜨기) | 1.5 |
| `F` (DC, 한길긴뜨기) | 2.0 |
| `E` (TR, 두길긴뜨기) | 2.5 ~ 3.0 |

개선 방향:
- `model/stitch.ts` `StitchMeta` 에 `relativeHeight: number` 필드 추가
- 평면 레이아웃에서 단 경계선이 아니라 **코마다 다른 세로 길이**로 배치
- 기호 자체도 높이 차이가 드러나도록 `symbols.ts` 크기 조정 (현재 DC/TR은 세로줄 길이로만 구분)
- 원형 레이아웃은 반지름 증분을 코 높이에 비례 배정하는 옵션 검토

### 10.2 사슬(`O`) 특수 배치

현재 `O` 는 다른 코와 동일하게 한 슬롯을 차지하는 타원으로만 렌더된다.
실제 차트 관행에서는:

- **시작·마감 기둥**: 단 시작/끝의 사슬(turning chain)은 해당 단의 시작에 **세로 기둥** 형태로 배치. 슬롯을 수평으로 차지하지 않음
- **중간 사슬 그룹**: `X, 3O, X` 처럼 일반 코 사이의 사슬은 두 anchor 코 사이를 잇는 **호(arc)** 로 그려짐 (구멍·공간 표현)

개선 방향:
- Tokenizer/Parser 에 "시작 사슬"을 구분할 수 있는 힌트 필요 (단 맨 앞의 `NO` 패턴? 또는 별도 표기)
- 레이아웃에서 사슬 run(연속된 O)을 감지하고 anchor 코 사이면 호 경로 생성
- 렌더러에 `<path d="M ... Q ...">` 기반 사슬 호 렌더 추가

### 10.3 Drawing 모드 (미리보기 개별 기호 편집)

미리보기에서 연필 버튼(✏️) 클릭 → **Drawing 모드** 진입. 개별 코(또는 코 그룹) 단위로 시각적 속성을 직접 조정할 수 있게 한다.

**코 단위 정의**:
- 콤마(`,`)로 구분된 최소 단위
- `(...)` 또는 `[...]` 로 묶인 그룹은 하나의 단위로 간주
- 예: `X, 2V, [F,T], (1X,1V)*3` → 단위는 `X` / `2V` / `[F,T]` / `(1X,1V)*3` 4개

**조작**:
- 선택한 코 단위의 **크기 확대/축소** (심볼 scale)
- **회전** (심볼 angle 오버라이드)
- **늘리기/옮기기** (위치 미세 조정)

**데이터 모델 방향**:
- 각 코 단위에 `displayOverrides?: { scale?, angleDelta?, offsetX?, offsetY? }` 추가
- Parser AST 노드에 고유 식별자 부여 (단 인덱스 + unit 인덱스) — 도안 텍스트 변경 시 override가 살아남도록
- 렌더러가 오버라이드를 심볼 transform에 반영
- 저장 포맷에 drawing overrides 포함

**UX**:
- Edit/Read/Drawing 3-mode toggle
- 클릭으로 코 단위 선택 → 주변에 핸들(회전/스케일) 표시
- 사이드바나 플로팅 인스펙터에서 수치 조정
- "원래대로" 버튼으로 오버라이드 초기화

## 11. 결정 사항 로그

- **2026-04-15**: TypeScript + Svelte 5 + Vite 스택 확정
- **2026-04-15**: CodeMirror 6 도입 (인라인 오류 표시용)
- **2026-04-15**: 단별 single-line 에디터, Enter로 단 추가
- **2026-04-15**: 점진적 파싱 트리거는 `,` / `)` / `*N` / Enter
- **2026-04-15**: 의미 오류 — 초과는 빨강, 부족은 노랑
- **2026-04-15**: Edit / Read 모드 분리, Read 모드는 SVG 전체 화면 + 다운로드
- **2026-04-15**: 미리보기는 단별 색상 구분 (HSL 자동 분배)
- **2026-04-15**: 평면 도안은 매 행 방향 전환 (지그재그)
- **2026-04-15**: Read 모드에 단 네비게이터 추가 — 이전/다음 버튼, 단 번호 직접 입력, 현재 단 하이라이트, localStorage로 진행 상태 저장
- **2026-04-15**: 하이라이트 스타일 확정 — 현재 선명 / 이전 단 opacity 0.4 / 미래 단 opacity 0.15 (또는 점선)
- **2026-04-15**: 숫자 키 단축키(`1`~`9`) 제거 — 화살표/Home/End + 네비게이터 직접 입력만 사용
- **2026-04-15**: V(INC)/A(DEC) 기호를 꼬리 없는 수직 대칭 V/역V로 변경 (Y자로 보이던 문제 해결)
- **2026-04-15**: 평면 짝수 단 기호 회전(angle=π) 제거 — 작업 방향은 시작 마커로만 표현, 기호는 항상 위 향함
- **2026-04-15**: `[...]` 한 코 그룹 문법 추가. Op에 `sameHoleContinuation` 플래그, 레이아웃은 이 플래그가 true인 op의 부모를 직전 그룹과 공유
