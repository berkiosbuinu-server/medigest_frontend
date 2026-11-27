import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import svgr from 'vite-plugin-svgr';

// Fonction de debug pour afficher la mémoire
function logMemoryUsage(step: string): void {
  const used = process.memoryUsage();
  console.log(`[MEMORY DEBUG - ${step}]`, {
    rss: `${Math.round(used.rss / 1024 / 1024)} MB`,
    heapTotal: `${Math.round(used.heapTotal / 1024 / 1024)} MB`,
    heapUsed: `${Math.round(used.heapUsed / 1024 / 1024)} MB`,
    external: `${Math.round(used.external / 1024 / 1024)} MB`
  });
}

// Plugin pour monitorer la mémoire pendant le build
function memoryMonitorPlugin(): Plugin {
  let interval: NodeJS.Timeout | null = null;
  return {
    name: 'memory-monitor',
    buildStart() {
      logMemoryUsage('Build Start');
      // Surveiller la mémoire toutes les 5 secondes
      interval = setInterval(() => {
        logMemoryUsage('During Build');
      }, 5000);
    },
    buildEnd() {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
      logMemoryUsage('Build End');
    },
    handleHotUpdate({ file }) {
      console.log(`[HMR] File changed: ${file}`);
      logMemoryUsage('Hot Update');
      return undefined;
    }
  };
}

export default defineConfig({
  plugins: [
    react(),
    memoryMonitorPlugin(), // Plugin de debug mémoire
    svgr({
      svgrOptions: {
        exportType: 'named',
        ref: true,
        svgo: false,
        titleProp: true,
      },
      include: '**/*.svg',
    })
  ],
  
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  
  server: {
    port: 5173,
    strictPort: true, // Tauri attend exactement ce port (devUrl)
    host: true,
    watch: {
      usePolling: false,
      interval: 1000,
      ignored: ['**/src-tauri/**'], // ne pas recharger quand Rust recompile
    },
    proxy: {
      '/api': {
        target: 'http://localhost:8000/api/v1',
        changeOrigin: true,
        secure: false,
      },
      '/uploads': {
        target: 'http://localhost:8000/api/v1',
        changeOrigin: true,
        secure: false,
        rewrite: (pathUrl: string) => pathUrl.replace(/^\/api/, '')
      }
    },
  },
  
  build: {
    outDir: 'dist',
    // Pas de sourcemaps dans l'installateur desktop (TAURI_ENV_PLATFORM est défini par `tauri build`)
    sourcemap: !process.env.TAURI_ENV_PLATFORM,
    rollupOptions: {
      output: {
        // Rollup (Vite 5) : on cible les paquets par leur nom exact, sinon
        // `id.includes('react')` attrape aussi react-query, lucide-react, etc.
        // et crée des dépendances circulaires entre chunks.
        manualChunks: (id: string) => {
          if (!id.includes('node_modules')) return undefined;

          const match = id.match(/node_modules\/(@[^/]+\/[^/]+|[^/]+)/g);
          const pkg = match?.[match.length - 1]?.replace('node_modules/', '');

          if (pkg === 'react' || pkg === 'react-dom' || pkg === 'scheduler') {
            return 'react-vendor';
          }
          if (pkg === '@tanstack/react-query' || pkg === '@tanstack/query-core') {
            return 'query-vendor';
          }
          if (pkg === 'lucide-react' || pkg === 'sonner' || pkg === 'recharts') {
            return 'ui-vendor';
          }
          return 'vendor';
        },
      },
    },
  },
  
  optimizeDeps: {
    include: [
      'react', 
      'react-dom', 
      'react-router-dom', 
      '@tanstack/react-query',
      'lucide-react', 
      'sonner', 
      'recharts', 
      'date-fns', 
      'zustand', 
      'mobx', 
      'mobx-react-lite',
      'dayjs', 
      'dayjs/plugin/*'
    ],
    exclude: ['workbox-window', 'workbox-core', 'workbox-routing']
  },
  
  base: '/',
  
  // Configuration de debug supplémentaire
  logLevel: 'info',
  clearScreen: false,  // Garder les logs visibles
  
  // Option pour limiter l'usage mémoire
  cacheDir: 'node_modules/.vite-debug',  // Dossier cache séparé pour debug
});