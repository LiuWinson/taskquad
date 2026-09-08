import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// TaskQuad Web 前端构建配置。
// base 使用 '/'，由 TaskQuad 服务端（--web-root ../web/dist）在同源根路径下提供静态服务，
// 因此前端仅通过相对路径 /api/* 访问 REST API。
export default defineConfig({
  plugins: [vue()],
  base: '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsDir: 'assets',
  },
});
