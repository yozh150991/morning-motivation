import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // ВАЖЛИВО: заміни на назву свого GitHub-репозиторію (зі слешами з обох боків).
  // Якщо деплоїш на кореневий домен або кастомний домен — постав '/'
  base: '/morning-motivation/',
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'favicon.svg'],
      manifest: {
        name: 'Ранкова мотивація',
        short_name: 'Мотивація',
        description: '2–3 цитати щоранку о 8:00 під твою музику',
        lang: 'uk',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        background_color: '#14182E',
        theme_color: '#14182E',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
})
