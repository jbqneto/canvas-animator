import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      // Installable desktop app (Chrome/Edge "Install" button). Works offline except for the AI features.
      VitePWA({
        // Never reload an editor by surprise: the app shows an "update available" banner instead
        registerType: 'prompt',
        includeAssets: ['icon.svg'],
        manifest: {
          name: 'FlashMotion Studio',
          short_name: 'FlashMotion',
          description:
            'Crie animações 2D para enriquecer vídeos: bonecos palito, objetos que seguem caminhos, gráficos e números animados.',
          lang: 'pt-BR',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          background_color: '#0a0a0f',
          theme_color: '#0a0a0f',
          categories: ['graphics', 'productivity'],
          icons: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
          // Double-clicking a .fmproj file opens it in the installed app (handled via window.launchQueue)
          file_handlers: [
            {
              action: '/',
              accept: { 'application/x-flashmotion-project': ['.fmproj'] },
            },
          ],
          launch_handler: { client_mode: 'focus-existing' },
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          // The lazy-loaded video encoder chunk is ~700 KB
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts',
                expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              },
            },
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
