import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [svelte()],
  base: './',
  resolve: {
    alias: {
      $lib: fileURLToPath(new URL('./src/lib', import.meta.url)),
      $components: fileURLToPath(new URL('./src/components', import.meta.url)),
      $stores: fileURLToPath(new URL('./src/stores', import.meta.url)),
    },
  },
  server: {
    // WSL + Dropbox 환경에서 파일 워칭 성능 개선
    watch: {
      // Dropbox/git 등 외부에서 관리하는 파일 감시 제외
      ignored: [
        '**/node_modules/**',
        '**/dist/**',
        '**/.git/**',
        '**/preview_*.svg',
        '**/.dropbox*',
      ],
      // WSL에서 inotify 이벤트 누락 방지. Dropbox 경로면 polling이 더 안정적.
      usePolling: true,
      interval: 500,
    },
    // 첫 로딩 시 bundle을 사전에 빌드
    warmup: {
      clientFiles: ['./src/main.ts', './src/App.svelte'],
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
