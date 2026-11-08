import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const BUILD_ID = new Date().toISOString();
const APP_VERSION = '1.2.8';

function pipoVersionManifestPlugin() {
  const payload = JSON.stringify(
    {
      name: 'glow-with-pipo',
      version: APP_VERSION,
      buildId: BUILD_ID
    },
    null,
    2
  );

  return {
    name: 'pipo-version-manifest',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.split('?')[0].endsWith('/version.json')) {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
          res.end(payload);
          return;
        }
        next();
      });
    },
    closeBundle() {
      const outDir = path.resolve(process.cwd(), 'dist');
      if (fs.existsSync(outDir)) {
        fs.writeFileSync(path.join(outDir, 'version.json'), payload, 'utf8');
      }
    }
  };
}

export default defineConfig({
  base: './',
  define: {
    __APP_BUILD_ID__: JSON.stringify(BUILD_ID),
    __APP_VERSION__: JSON.stringify(APP_VERSION)
  },
  plugins: [react(), pipoVersionManifestPlugin()],
  server: {
    port: 5175,
    host: true
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          supabase: ['@supabase/supabase-js'],
          icons: ['lucide-react']
        }
      }
    }
  }
});
