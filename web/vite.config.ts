import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    // CSP headers temporarily disabled for Turnstile debugging
    // headers: {
    //   'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://challenges.cloudflare.com https://api.your-domain.com https://your-pmail-api.your-subdomain.workers.dev http://localhost:*; frame-src 'self' https://challenges.cloudflare.com; frame-ancestors 'self'; child-src 'self' https://challenges.cloudflare.com; worker-src 'self' blob:",
    // },
    proxy: {
      '/api': {
        target: 'http://localhost:8787', // Local Wrangler dev server
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'query-vendor': ['@tanstack/react-query', 'axios'],
        },
      },
    },
  },
});