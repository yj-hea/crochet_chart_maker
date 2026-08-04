/**
 * 미리보기 표시 옵션 — **도안(탭) 단위** 설정.
 *
 * 원형/평면, 코바늘/대바늘에 따라 알맞은 표시가 다르므로 워크스페이스 전역이 아니라
 * 탭마다 따로 기억한다. 탭을 새로 만들거나 저장된 워크스페이스를 처음 읽을 때는
 * **마지막으로 쓴 값**(localStorage seed)을 복사해 넣어, 늘 쓰던 화면으로 열리되
 * 그 뒤로는 도안끼리 서로 영향을 주지 않는다.
 */

/**
 * 평면 도안에서 단마다 코 수가 다를 때 좁은 단을 max 폭 안에서 어디에 정렬할지.
 *  - 'L': 좌측 끝  /  'R': 우측 끝  /  'C': 가운데
 */
export type FlatAlign = 'L' | 'R' | 'C';

/**
 * 평면 세로 정렬 모드.
 *  - 'same': 같은 단의 모든 코가 같은 y
 *  - 'even': 각 코가 부모 코로부터 일정 간격 — 같은 단도 y 가 다를 수 있다
 */
export type FlatVAlign = 'same' | 'even';

export interface ViewOptions {
  /** 배경 그리드 표시 */
  showGrid: boolean;
  /** 부모-자식 연결선 표시 (코바늘 전용) */
  showConnections: boolean;
  /** 상하 반전 — true 면 1단이 위 */
  flatFlipVertical: boolean;
  flatAlign: FlatAlign;
  /** 부모-자식 폭/위치 맞춤 */
  flatCascade: boolean;
  flatVAlign: FlatVAlign;
}

export const DEFAULT_VIEW_OPTIONS: Readonly<ViewOptions> = Object.freeze({
  showGrid: true,
  showConnections: true,
  flatFlipVertical: false,
  flatAlign: 'L',
  flatCascade: true,
  flatVAlign: 'same',
});

export type ViewOptionKey = keyof ViewOptions;

const ALIGNS: readonly string[] = ['L', 'R', 'C'];
const VALIGNS: readonly string[] = ['same', 'even'];

/**
 * 외부 데이터(localStorage·파일·Dropbox)에서 읽은 값을 관대하게 정규화한다.
 * 모르는 값·잘못된 타입은 기본값으로 대체하고, 통째로 버리지 않는다.
 */
export function normalizeViewOptions(raw: unknown): ViewOptions | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const v = raw as Record<string, unknown>;
  const bool = (x: unknown, fallback: boolean) => (typeof x === 'boolean' ? x : fallback);
  return {
    showGrid: bool(v.showGrid, DEFAULT_VIEW_OPTIONS.showGrid),
    showConnections: bool(v.showConnections, DEFAULT_VIEW_OPTIONS.showConnections),
    flatFlipVertical: bool(v.flatFlipVertical, DEFAULT_VIEW_OPTIONS.flatFlipVertical),
    flatAlign: ALIGNS.includes(v.flatAlign as string)
      ? (v.flatAlign as FlatAlign)
      : DEFAULT_VIEW_OPTIONS.flatAlign,
    flatCascade: bool(v.flatCascade, DEFAULT_VIEW_OPTIONS.flatCascade),
    flatVAlign: VALIGNS.includes(v.flatVAlign as string)
      ? (v.flatVAlign as FlatVAlign)
      : DEFAULT_VIEW_OPTIONS.flatVAlign,
  };
}

// ============================================================
// 새 탭이 물려받을 "마지막으로 쓴 값" (localStorage)
// ============================================================

const SEED_KEY = 'crochet-chart:view.seed';

function storage(): Storage | undefined {
  try {
    return typeof globalThis !== 'undefined' ? globalThis.localStorage : undefined;
  } catch {
    return undefined; // 프라이빗 모드 등에서 접근 자체가 throw
  }
}

/**
 * 이번 세션에서 마지막으로 쓴 값.
 * localStorage 를 못 쓰는 환경(프라이빗 모드·테스트)에서도 세션 안에서는 동작하도록
 * 메모리에도 들고 있고, 있으면 이쪽을 먼저 본다.
 */
let seedCache: ViewOptions | undefined;

/** 새 탭·복원된 탭의 초기 표시 옵션 */
export function readViewSeed(): ViewOptions {
  if (seedCache) return { ...seedCache };
  const raw = storage()?.getItem(SEED_KEY);
  if (!raw) return { ...DEFAULT_VIEW_OPTIONS };
  try {
    const parsed = normalizeViewOptions(JSON.parse(raw));
    if (parsed) seedCache = parsed;
    return { ...(parsed ?? DEFAULT_VIEW_OPTIONS) };
  } catch {
    return { ...DEFAULT_VIEW_OPTIONS };
  }
}

/** 사용자가 토글할 때마다 갱신 — 다음에 만드는 탭이 이 값으로 시작한다 */
export function writeViewSeed(options: ViewOptions): void {
  seedCache = { ...options };
  try {
    storage()?.setItem(SEED_KEY, JSON.stringify(options));
  } catch {
    // 쿼터 초과 등은 무시 (작업 흐름을 끊지 않는다)
  }
}
