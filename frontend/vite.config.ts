import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // 【关键】允许局域网访问
    port: 5173,      // 指定端口（可选）
    proxy: {
      // 1. 代理 API 请求
      '/api': {
        target: 'http://127.0.0.1:8000', // 后端地址
        changeOrigin: true,
      },
      // 2. 代理静态资源 (图片)
      '/static': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      }
    }
  }
})