import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// The film's data and media live beside the app (film/data, film/media), served as /data and /media.
export default defineConfig({
  root: __dirname,
  publicDir: false,
  server: {
    port: 5177,
    strictPort: true,
    fs: { allow: [resolve(__dirname, '..')] },
    hmr: process.env.LANDSAILOR_NO_HMR ? false : undefined,
  },
  optimizeDeps: { include: ['harfbuzzjs/hb.js', 'harfbuzzjs/hbjs.js'] },
  plugins: [
    {
      name: 'film-static',
      configureServer(server) {
        // serve ../data and ../media as plain files
        server.middlewares.use(async (req, res, next) => {
          const url = req.url || '';
          const m = url.match(/^\/(data|media)\/([^?]*)/);
          if (!m) return next();
          const { createReadStream, statSync } = await import('node:fs');
          const file = resolve(__dirname, '..', m[1], decodeURIComponent(m[2]));
          const missing = () => { res.statusCode = 404; res.end('not found'); };
          try {
            const st = statSync(file);
            if (!st.isFile()) return missing();
            const ext = file.split('.').pop()!.toLowerCase();
            const types: Record<string, string> = {
              json: 'application/json', geojson: 'application/json', bin: 'application/octet-stream',
              ttf: 'font/ttf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
              wav: 'audio/wav', mp3: 'audio/mpeg', webm: 'audio/webm', m4a: 'audio/mp4',
            };
            res.setHeader('Content-Type', types[ext] || 'application/octet-stream');
            res.setHeader('Content-Length', String(st.size));
            res.setHeader('Cache-Control', 'no-cache');
            createReadStream(file).pipe(res);
          } catch {
            missing();
          }
        });
      },
    },
  ],
});
