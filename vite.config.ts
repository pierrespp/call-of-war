import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: env.VITE_BASE_PATH || '/',
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            // Vendor chunks
            'react-vendor': ['react', 'react-dom'],
            'lucide-icons': ['lucide-react'],
            // App chunks
            'game-components': [
              './src/components/DeployScreen',
            ],
            'menu-components': [
              './src/components/CreateMatchMenu',
              './src/components/SoldiersInfoMenu',
            ],
            'editor-components': [
              './src/components/MapEditorMenu',
              './src/components/AIMapCreatorMenu',
            ],
          },
        },
      },
      chunkSizeWarningLimit: 1000,
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true,
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
