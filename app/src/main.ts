// Boot: the engine, the type, the song's clock, the edit. A preview with the song playing, and the
// hooks the offline renderer drives (window.__film).
import { Engine, FPS, frameOf, timeOf } from './engine/engine';
import { Score } from './engine/score';
import { buildEdit, DURATION, loadAssets } from './edit';

const qs = new URLSearchParams(location.search);
const scale = parseFloat(qs.get('scale') || '1');
const mode = qs.get('mode') || 'preview';
const canvas = document.getElementById('c') as HTMLCanvasElement;
const info = document.getElementById('info')!;
const scrub = document.getElementById('scrub') as HTMLInputElement;
const playBtn = document.getElementById('play') as HTMLButtonElement;

const engine = new Engine(canvas, scale);

async function boot() {
  await engine.init();
  const f = engine.fonts;
  await Promise.all([
    f.load('mona', '/media/fonts/MonaSans[wdth,wght].ttf'),
    f.load('monaItalic', '/media/fonts/MonaSans-Italic[wdth,wght].ttf'),
    f.load('pass', '/media/fonts/Overpass[wght].ttf'),
    f.load('passMono', '/media/fonts/OverpassMono[wght].ttf'),
    f.load('serif', '/media/fonts/InstrumentSerif-Regular.ttf'),
    f.load('serifItalic', '/media/fonts/InstrumentSerif-Italic.ttf'),
    f.load('climate', '/media/fonts/ClimateCrisis[YEAR].ttf'),
  ]);
  const score = await Score.load('/data/lyrics.json', '/data/audio.json');
  engine.ctx.data.set('score', score);
  await loadAssets(engine.ctx);
  const shots = buildEdit(score);
  const only = qs.get('only');
  const use = only ? shots.filter((s) => only.split(',').includes(s.name)) : shots;
  engine.setShots(use);
  const inited = new Set();
  for (const s of use) if (!inited.has(s.scene)) { inited.add(s.scene); await s.scene.init(); }
  return { score, shots: use };
}

const ready = boot();

// ------------------------------------------------------------------ offline hooks
let ws: WebSocket | null = null;
(window as any).__film = {
  ready: ready.then(() => true),
  fps: FPS,
  duration: DURATION,
  shots: () => engine.shots.map((s) => ({ name: s.name, start: s.start, end: s.end })),
  render(n: number, samples = 1, shutter = 0.5) {
    const t0 = performance.now();
    engine.render(n, samples, shutter, true);
    engine.present();
    engine.gl.finish();
    return performance.now() - t0;
  },
  /** render frames [from, to) and send each as raw RGBA over a websocket, one at a time */
  async exportRange(url: string, from: number, to: number, samples: number, shutter: number) {
    ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    await new Promise((r, j) => { ws!.onopen = r; ws!.onerror = j; });
    const buf = new Uint8Array(engine.physW * engine.physH * 4);
    let pending: ((v?: unknown) => void) | null = null;
    ws.onmessage = () => { if (pending) { const p = pending; pending = null; p(); } };
    let ms = 0;
    for (let n = from; n < to; n++) {
      const t0 = performance.now();
      engine.render(n, samples, shutter, true);
      engine.readOut(buf);
      ms += performance.now() - t0;
      const ack = new Promise((r) => (pending = r));
      ws.send(buf);
      await ack;
      if ((n - from) % 60 === 0) console.log(`frame ${n} (${(ms / (n - from + 1)).toFixed(1)} ms/frame)`);
    }
    ws.close();
    return ms / Math.max(1, to - from);
  },
  stats: () => engine.d.stats,
};

// ------------------------------------------------------------------ preview
if (mode === 'preview') {
  const audio = new Audio('/media/audio/song.webm');
  audio.preload = 'auto';
  let t = parseFloat(qs.get('t') || '0');
  let playing = false;
  scrub.max = String(DURATION);
  const show = () => {
    const n = frameOf(t);
    const t0 = performance.now();
    engine.render(n, 1, 0.5, true);
    engine.present();
    const ms = performance.now() - t0;
    const shot = engine.shotAtFrame(n);
    const st = engine.d.stats;
    info.textContent = `${t.toFixed(3)} s  f${n}  ${shot ? shot.name : '-'}  ${ms.toFixed(1)} ms  ${st.calls} calls ${st.lines} segs`;
    scrub.value = String(t);
  };
  const loop = () => {
    if (playing) { t = audio.currentTime; show(); }
    requestAnimationFrame(loop);
  };
  ready.then(() => { show(); loop(); }).catch((e) => { info.textContent = String(e); console.error(e); });
  const setPlaying = (p: boolean) => {
    playing = p;
    playBtn.textContent = p ? 'pause' : 'play';
    if (p) { audio.currentTime = t; audio.play(); } else { audio.pause(); t = audio.currentTime; show(); }
  };
  playBtn.onclick = () => setPlaying(!playing);
  scrub.oninput = () => { t = parseFloat(scrub.value); if (playing) audio.currentTime = t; show(); };
  addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 5 : 1;
    if (e.key === ' ') { e.preventDefault(); setPlaying(!playing); }
    else if (e.key === 'ArrowRight') { t = Math.min(DURATION, t + step); if (playing) audio.currentTime = t; show(); }
    else if (e.key === 'ArrowLeft') { t = Math.max(0, t - step); if (playing) audio.currentTime = t; show(); }
    else if (e.key === '.') { t = timeOf(frameOf(t) + 1); show(); }
    else if (e.key === ',') { t = timeOf(frameOf(t) - 1); show(); }
    else if (e.key === ']' || e.key === '[') {
      const n = frameOf(t);
      const s = engine.shots;
      const i = s.findIndex((x) => frameOf(x.start) <= n && n < frameOf(x.end));
      const j = e.key === ']' ? Math.min(s.length - 1, i + 1) : Math.max(0, i - 1);
      if (s[j]) { t = timeOf(frameOf(s[j].start)); if (playing) audio.currentTime = t; show(); }
    } else if (e.key === 'h') document.body.classList.toggle('hide');
  });
  (window as any).__seek = (x: number) => { t = x; show(); };
}
