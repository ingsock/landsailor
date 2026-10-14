// Offline renderer: starts the app's dev server, opens it in Edge (headless, on the GPU) and
// renders stills, contact sheets or the film.
//
//   node scripts/render.mjs stills --t 12.5,30 [--samples 8] [--out ../out/stills] [--only a,b] [--scale 1]
//   node scripts/render.mjs sheet --from 0 --to 30 --n 24 --cols 6 [--out ../out/sheet.png]
//   node scripts/render.mjs video --from 0 --to 225.5 [--samples 8] [--shutter 0.5] [--out ../out/film.mp4] [--crf 21]
//   node scripts/render.mjs gpu      (prints the WebGL renderer)
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { WebSocketServer } from 'ws';

const here = dirname(fileURLToPath(import.meta.url));
const app = resolve(here, '..');
const film = resolve(app, '..');
const SONG = resolve(film, 'build', 'song_master.wav');

const argv = process.argv.slice(2);
const mode = argv[0];
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const flag = (k) => argv.includes('--' + k);

/** a free TCP port, so several renders can run at once */
async function freePort() {
  const net = await import('node:net');
  return new Promise((res) => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
}

async function open(extra = '') {
  process.env.LANDSAILOR_NO_HMR = '1';
  const want = await freePort();
  const server = await createServer({ configFile: resolve(app, 'vite.config.ts'), root: app, server: { port: want, strictPort: false, hmr: false }, logLevel: 'error' });
  await server.listen();
  const port = server.httpServer.address().port;
  const browser = await chromium.launch({
    channel: 'msedge', headless: true,
    args: ['--use-angle=d3d11', '--force_high_performance_gpu', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--force-gpu-mem-available-mb=4096'],
  });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('console', (m) => { const s = m.text(); if (!s.includes('[vite]')) console.log('  [page]', s); });
  page.on('pageerror', (e) => console.log('  [page error]', e.message));
  const scale = opt('scale', '1');
  const only = opt('only', '');
  const url = `http://localhost:${port}/?mode=render&scale=${scale}${only ? '&only=' + only : ''}${extra}`;
  await page.goto(url);
  await page.waitForFunction(() => window.__film && window.__film.ready, null, { timeout: 120000 });
  await page.evaluate(() => window.__film.ready);
  return { server, browser, page, port };
}

async function close(o) { await o.browser.close(); await o.server.close(); }

async function stills() {
  const o = await open();
  const out = resolve(app, opt('out', '../out/stills'));
  mkdirSync(out, { recursive: true });
  const samples = parseInt(opt('samples', '1'));
  const fps = await o.page.evaluate(() => window.__film.fps);
  const ts = opt('t', '0').split(',').map(Number);
  for (const t of ts) {
    const n = Math.round(t * fps);
    const ms = await o.page.evaluate(([n, s]) => window.__film.render(n, s, 0.5), [n, samples]);
    const data = await o.page.evaluate(() => document.getElementById('c').toDataURL('image/png'));
    const file = resolve(out, `t${t.toFixed(3).padStart(8, '0')}.png`);
    writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'));
    const st = await o.page.evaluate(() => window.__film.stats());
    console.log(`${file}  (${ms.toFixed(0)} ms, ${st.calls} calls)`);
  }
  await close(o);
}

async function sheet() {
  const o = await open();
  const from = parseFloat(opt('from', '0')), to = parseFloat(opt('to', '10'));
  const n = parseInt(opt('n', '24')), cols = parseInt(opt('cols', '6'));
  const samples = parseInt(opt('samples', '1'));
  const out = resolve(app, opt('out', '../out/sheet.png'));
  mkdirSync(dirname(out), { recursive: true });
  const data = await o.page.evaluate(async ([from, to, n, cols, samples]) => {
    const F = window.__film;
    const cw = 480, ch = 270, pad = 4, lab = 16;
    const rows = Math.ceil(n / cols);
    const sh = document.createElement('canvas');
    sh.width = cols * (cw + pad) + pad; sh.height = rows * (ch + lab + pad) + pad;
    const g = sh.getContext('2d');
    g.fillStyle = '#111'; g.fillRect(0, 0, sh.width, sh.height);
    g.font = '12px monospace';
    const src = document.getElementById('c');
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? from : from + ((to - from) * i) / (n - 1);
      const f = Math.round(t * F.fps);
      F.render(f, samples, 0.5);
      const x = pad + (i % cols) * (cw + pad), y = pad + Math.floor(i / cols) * (ch + lab + pad);
      g.drawImage(src, x, y, cw, ch);
      g.fillStyle = '#ccc'; g.fillText(`${t.toFixed(2)}s f${f}`, x + 2, y + ch + 12);
    }
    return sh.toDataURL('image/png');
  }, [from, to, n, cols, samples]);
  writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
  console.log(out);
  await close(o);
}

async function video() {
  const o = await open();
  const fps = await o.page.evaluate(() => window.__film.fps);
  const from = parseFloat(opt('from', '0'));
  const to = parseFloat(opt('to', String(await o.page.evaluate(() => window.__film.duration))));
  const samples = parseInt(opt('samples', '8'));
  const shutter = parseFloat(opt('shutter', '0.5'));
  const crf = opt('crf', '21');
  const out = resolve(app, opt('out', '../out/film.mp4'));
  mkdirSync(dirname(out), { recursive: true });
  const scale = parseFloat(opt('scale', '1'));
  const w = Math.round(1920 * scale), h = Math.round(1080 * scale);
  const f0 = Math.round(from * fps), f1 = Math.round(to * fps);
  const withAudio = !flag('mute');
  const ffArgs = ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${w}x${h}`, '-r', String(fps), '-i', '-'];
  if (withAudio) ffArgs.push('-ss', String(f0 / fps), '-t', String((f1 - f0) / fps), '-i', SONG);
  ffArgs.push('-vf', 'vflip,format=yuv420p', '-c:v', 'libx264', '-preset', opt('preset', 'slow'), '-crf', crf, '-tune', 'film',
    '-profile:v', 'high', '-movflags', '+faststart', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709');
  if (withAudio) ffArgs.push('-c:a', 'aac', '-b:a', '320k', '-map', '0:v', '-map', '1:a', '-shortest');
  ffArgs.push(out);
  const ff = spawn('ffmpeg', ffArgs, { stdio: ['pipe', 'inherit', 'inherit'] });
  const wss = new WebSocketServer({ port: 0, maxPayload: 64 * 1024 * 1024 });
  const wsPort = wss.address().port;
  let got = 0;
  const t0 = Date.now();
  wss.on('connection', (sock) => {
    sock.on('message', (buf) => {
      const ok = ff.stdin.write(buf);
      got++;
      const ack = () => sock.send('k');
      if (ok) ack(); else ff.stdin.once('drain', ack);
      if (got % 120 === 0) {
        const el = (Date.now() - t0) / 1000;
        const left = ((f1 - f0 - got) * el) / got;
        console.log(`  ${got}/${f1 - f0} frames  ${el.toFixed(0)} s  ~${(left / 60).toFixed(1)} min left`);
      }
    });
  });
  const ms = await o.page.evaluate(([url, a, b, s, sh]) => window.__film.exportRange(url, a, b, s, sh), [`ws://localhost:${wsPort}`, f0, f1, samples, shutter]);
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  wss.close();
  console.log(`${out}: ${f1 - f0} frames, ${ms.toFixed(1)} ms/frame on the GPU, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  await close(o);
}

async function gpu() {
  const o = await open();
  const r = await o.page.evaluate(() => {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2', { powerPreference: 'high-performance' });
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return { renderer: gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER), samples: gl.getParameter(gl.MAX_SAMPLES) };
  });
  console.log(r);
  await close(o);
}

async function shots() {
  const o = await open();
  const list = await o.page.evaluate(() => window.__film.shots());
  for (const s of list) console.log(`${s.name.padEnd(16)}${s.start.toFixed(2).padStart(8)}${s.end.toFixed(2).padStart(8)}${(s.end - s.start).toFixed(2).padStart(7)}`);
  await close(o);
}

const modes = { stills, sheet, video, gpu, shots };
if (!modes[mode]) { console.log('modes: stills | sheet | video | gpu | shots'); process.exit(1); }
modes[mode]().catch((e) => { console.error(e); process.exit(1); });
