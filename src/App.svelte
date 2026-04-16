<script lang="ts">
  import PatternEditor from './components/PatternEditor.svelte';
  import ChartViewer from './components/ChartViewer.svelte';
  import ShapeSelector from './components/ShapeSelector.svelte';
  import { exportToFile, importFromFile, resetPattern, lastSavedAt } from './stores/pattern';

  let fileInput: HTMLInputElement;
  let savedFlash = $state(false);
  let flashTimer: ReturnType<typeof setTimeout> | undefined;

  // 저장 직후 "저장됨" 뱃지를 잠깐 표시
  $effect(() => {
    void $lastSavedAt;
    if (!$lastSavedAt) return;
    savedFlash = true;
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { savedFlash = false; }, 1200);
  });

  async function handleImport(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';  // 같은 파일을 다시 선택해도 change 이벤트가 발생하도록
    if (!file) return;
    try {
      await importFromFile(file);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`불러오기 실패: ${msg}`);
    }
  }

  function handleReset() {
    const ok = window.confirm(
      '현재 도안을 모두 지우고 새로 시작할까요?\n저장되지 않은 작업은 사라집니다.',
    );
    if (ok) resetPattern();
  }
</script>

<header class="app-header">
  <div class="header-left">
    <h1>코바늘 도안 생성기</h1>
    <ShapeSelector />
  </div>
  <div class="header-right">
    <span class="save-status" class:visible={savedFlash} aria-live="polite">저장됨</span>
    <button type="button" class="tool-btn" onclick={exportToFile} title="현재 도안을 파일로 다운로드">
      💾 저장
    </button>
    <button type="button" class="tool-btn" onclick={() => fileInput.click()} title=".crochet.json 파일에서 불러오기">
      📂 불러오기
    </button>
    <button type="button" class="tool-btn danger" onclick={handleReset} title="도안 비우고 새로 시작">
      🆕 새 도안
    </button>
    <input
      type="file"
      accept=".json,.crochet.json,application/json"
      bind:this={fileInput}
      onchange={handleImport}
      style="display:none"
    />
  </div>
</header>

<main class="app-main">
  <section class="pane editor-pane">
    <h2>입력</h2>
    <PatternEditor />
  </section>
  <section class="pane viewer-pane">
    <h2>미리보기</h2>
    <ChartViewer />
  </section>
</main>

<style>
  .app-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 0.75rem 1.5rem;
    border-bottom: 1px solid #e0e0e0;
    background: white;
    flex-wrap: wrap;
  }
  .header-left {
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  .header-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  h1 {
    font-size: 1.4rem;
    margin: 0;
  }
  .save-status {
    font-size: 12px;
    color: #2a7a3a;
    margin-right: 4px;
    opacity: 0;
    transition: opacity 0.2s;
  }
  .save-status.visible {
    opacity: 1;
  }
  .tool-btn {
    padding: 6px 12px;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: white;
    font-size: 13px;
    cursor: pointer;
    color: #333;
  }
  .tool-btn:hover {
    background: #f0f0f0;
    border-color: #888;
  }
  .tool-btn.danger:hover {
    background: #fce4e4;
    border-color: #c0392b;
    color: #c0392b;
  }
  .app-main {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    padding: 16px 1.5rem;
    max-width: 1400px;
    margin: 0 auto;
  }
  .pane {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  h2 {
    font-size: 0.9rem;
    margin: 0;
    color: #666;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  @media (max-width: 800px) {
    .app-main {
      grid-template-columns: 1fr;
    }
  }
</style>
