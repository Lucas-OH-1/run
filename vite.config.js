import { defineConfig } from 'vite';

export default defineConfig({
  base: '/run/',
  test: { environment: 'jsdom', restoreMocks: true }
});
