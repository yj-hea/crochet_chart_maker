/**
 * 드롭다운을 뷰포트 안에 유지시키는 포지셔닝 헬퍼.
 *
 * trigger 버튼 기준으로 drop-down 을 position:fixed 로 띄우되,
 * 선호 정렬 (`left` = 트리거의 왼쪽, `right` = 트리거의 오른쪽) 에 맞게 배치한 뒤
 * 뷰포트 좌/우/하단 경계에서 밀려나지 않도록 clamp.
 *
 * 호출 시점: 드롭다운이 열려 DOM 에 들어온 직후 ($effect 안).
 */
export function placeDropdown(
  trigger: HTMLElement | undefined,
  dropdown: HTMLElement | undefined,
  align: 'left' | 'right',
  margin = 8,
): void {
  if (!trigger || !dropdown) return;
  const rect = trigger.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // 우선 preferred width (CSS min/max 를 따라 실제 렌더된 너비) 로 위치 계산
  const ddWidth = Math.min(dropdown.offsetWidth, vw - margin * 2);
  let left =
    align === 'left'
      ? rect.left
      : rect.right - ddWidth;
  // 좌우 clamp
  left = Math.max(margin, Math.min(left, vw - ddWidth - margin));
  let top = rect.bottom + 4;
  // 아래로 빠지면 위로 뒤집기
  const ddHeight = dropdown.offsetHeight;
  if (top + ddHeight + margin > vh) {
    const above = rect.top - ddHeight - 4;
    if (above >= margin) top = above;
    else top = Math.max(margin, vh - ddHeight - margin);
  }
  dropdown.style.position = 'fixed';
  dropdown.style.top = `${top}px`;
  dropdown.style.left = `${left}px`;
  dropdown.style.right = 'auto';
  dropdown.style.bottom = 'auto';
  dropdown.style.maxWidth = `${vw - margin * 2}px`;
}
