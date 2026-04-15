<script lang="ts">
  import PatternEditor from './components/PatternEditor.svelte';
  import ChartViewer from './components/ChartViewer.svelte';
  import ShapeSelector from './components/ShapeSelector.svelte';
</script>

<header class="app-header">
  <h1>코바늘 도안 생성기</h1>
  <ShapeSelector />
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
    padding: 1rem 1.5rem;
    border-bottom: 1px solid #e0e0e0;
    background: white;
  }
  h1 {
    font-size: 1.4rem;
    margin: 0;
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
