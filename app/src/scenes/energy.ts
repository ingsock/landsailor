// CHORUS 1, "Your power flows through me, transformed".
// The world's primary energy by source, 1800-2025, as a river (flow motion: particles carried
// along each layer at the speed of the stream, never stopping). It narrows into a transformer's
// two coils and comes out as one line at a higher voltage, which runs off toward the city.
import { Camera } from '../engine/camera';
import { Scene, ShotFrame } from '../engine/engine';
import { RGBA, clamp, ease, hex, lerp, mulberry32, prog, withA, fract, launch, invLerp, easeOn } from '../engine/math';
import { Score } from '../engine/score';
import { drawLine, label, layLine } from '../lib/lyric';
import { L, NIGHT } from '../lib/palette';

const SOURCES = ['Traditional biomass', 'Coal', 'Oil', 'Gas', 'Nuclear', 'Hydropower', 'Wind', 'Solar', 'Biofuels', 'Other renewables'];
const SHORT: Record<string, string> = { 'Traditional biomass': 'Wood & dung', 'Other renewables': 'Other renewables' };
const COLOR: Record<string, RGBA> = {
  'Traditional biomass': hex('#8a4a1c', 1.0), Coal: hex('#b86a1e', 1.1), Oil: hex('#d8391f', 1.15), Gas: hex('#3f6fe0', 1.2),
  Nuclear: hex('#e9f0ff', 1.3), Hydropower: hex('#57a6ff', 1.2), Wind: hex('#bfe3ff', 1.2), Solar: hex('#ffd36a', 1.35),
  Biofuels: hex('#9fd36a', 1.0), 'Other renewables': hex('#9aa6bd', 1.0),
};

export class Energy extends Scene {
  score!: Score;
  years: number[] = [];
  layers: Record<string, number[]> = {};
  async init() {
    this.score = this.ctx.data.get('score');
    const e = this.ctx.data.get('charts').energy;
    this.years = e.years; this.layers = e.layers;
  }

  draw(f: ShotFrame) {
    const { d, fonts } = this.ctx;
    const t = f.t;
    const line = this.score.line('Your power flows');
    this.ctx.clear(hex('#020308'));
    const X0 = 140, X1 = 1500, YB = 900, MAXT = 190000; // TWh at the top
    const ys = this.years;
    const X = (y: number) => X0 + ((y - 1800) / (2025 - 1800)) * (X1 - X0);
    const H = (v: number) => (v / MAXT) * 640;
    // the sweep: the chart flows in from 1800 as the line is sung
    const yr = lerp(1800, 2025, ease.inOutSine(prog(t, line.start - 0.2, line.words[3].start)));
    // the transformer: from "through", the stream narrows to the coils at the right
    const narrow = ease.inOutCubic(prog(t, line.words[3].start, line.words[5].start));
    const out = launch(invLerp(line.words[5].start, line.end + 0.6, t));
    // camera: follows the front of the stream, then the coils, then the wire leaving
    const cam = Camera.home();
    // (at the coils the frame sits right of them, so the word that comes out of them fits)
    const fx = lerp(lerp(700, 1150, easeOn(invLerp(line.start, line.words[3].start, t), ease.inOutSine, 0.3)), 1660 + 260, narrow);
    cam.pos = [fx + lerp(0, 900, out), lerp(540, 600, narrow), lerp(-1600, -1150, narrow) + lerp(0, -300, out)];
    cam.target = [fx + lerp(0, 1300, out), lerp(540, 620, narrow), 0];
    d.setCamera(cam);
    // cumulative stack per year
    const n = ys.length;
    const stack: number[][] = [];
    for (let i = 0; i < n; i++) {
      let acc = 0;
      const row: number[] = [0];
      for (const s of SOURCES) { acc += this.layers[s][i] || 0; row.push(acc); }
      stack.push(row);
    }
    const total = (i: number) => stack[i][SOURCES.length];
    // the coils sit at x = 1660: each layer bends from its height to the coil's mouth
    const CX = 1660, CY = 660;
    const bend = (x: number, y: number) => {
      // after 2025 the river is pulled into the coils
      const u = clamp((x - X1) / (CX - X1));
      const k = narrow * ease.inOutCubic(u);
      return [x, lerp(y, CY + (y - (YB - H(total(n - 1)) / 2)) * 0.06, k)] as [number, number];
    };
    // layers as filled bands up to the current year
    for (let s = 0; s < SOURCES.length; s++) {
      const top: number[] = [], bot: number[] = [];
      for (let i = 0; i < n; i++) {
        if (ys[i] > yr) break;
        top.push(X(ys[i]), YB - H(stack[i][s + 1]));
        bot.push(X(ys[i]), YB - H(stack[i][s]));
      }
      if (top.length < 4) continue;
      // extend toward the coils
      const lt = top.length / 2 - 1;
      if (narrow > 0 && yr >= 2024) {
        for (let k = 1; k <= 12; k++) {
          const x = X1 + ((CX - X1) * k) / 12;
          const [a, ya] = bend(x, top[lt * 2 + 1]);
          const [, yb] = bend(x, bot[lt * 2 + 1]);
          top.push(a, ya); bot.push(a, yb);
        }
      }
      const poly: number[] = [...top];
      for (let i = bot.length / 2 - 1; i >= 0; i--) poly.push(bot[i * 2], bot[i * 2 + 1]);
      const c = COLOR[SOURCES[s]];
      d.fill([poly], { c0: withA(c, 0.5), c1: withA(c, 0.16), from: [0, 260], to: [0, YB] }, null, 'add');
    }
    // particles riding each layer, left to right, at the speed of the stream
    const rnd = mulberry32(9);
    d.dotStyle({ blend: 'add' });
    for (let s = 0; s < SOURCES.length; s++) {
      const c = COLOR[SOURCES[s]];
      for (let p = 0; p < 220; p++) {
        const ph = fract(rnd() + t * (0.09 + rnd() * 0.03));
        const yv = 1800 + ph * 225;
        if (yv > yr) continue;
        const i = Math.max(0, ys.findIndex((y) => y >= yv));
        const lo = stack[i][s], hi = stack[i][s + 1];
        if (hi - lo < 1) continue;
        const v = lerp(lo, hi, rnd());
        d.dot([X(yv), YB - H(v), 0], 1.6, withA(c, 1.2), 0.5);
      }
    }
    d.flush();
    // axis and labels
    d.lineStyle({});
    d.seg([X0, YB, 0], [X1, YB, 0], 1.2, withA(NIGHT.hair, 1));
    d.flush();
    for (const y of [1800, 1850, 1900, 1950, 2000]) label(d, fonts, String(y), X(y), YB + 34, 16, NIGHT.note, { align: 'center' });
    for (const v of [50000, 100000, 150000]) label(d, fonts, `${v / 1000},000 TWh`, X0 - 12, YB - H(v) + 6, 15, NIGHT.note, { align: 'right' });
    label(d, fonts, 'Global primary energy consumption by source', X0, 150, 30, hex('#d7deee'), { font: 'pass', axes: { wght: 650 } });
    label(d, fonts, '1800–2025. Data: Energy Institute; Smil (2017), via Our World in Data', X0, 184, 16, NIGHT.noteDim);
    // labels at the right end of each layer, the OWID way
    if (yr > 2000) {
      const i = n - 1;
      // from the top layer down, each label kept clear of the one above it
      let lastY = -1e9;
      for (let k = SOURCES.length - 1; k >= 0; k--) {
        const s = SOURCES[k];
        const mid = (stack[i][k] + stack[i][k + 1]) / 2;
        if (stack[i][k + 1] - stack[i][k] < 2500) continue;
        const y = Math.max(YB - H(mid) + 6, lastY + 19);
        lastY = y;
        label(d, fonts, SHORT[s] || s, X1 + 14, y, 15, withA(COLOR[s], (1 - narrow) * 1), {});
      }
    }
    // the transformer: two coils on a core, and the line that leaves
    if (narrow > 0) {
      const a = narrow;
      d.lineStyle({ glow: 2 });
      const coil = (cx: number, turns: number, w: number) => {
        const pts: number[] = [];
        for (let i = 0; i <= turns * 24; i++) {
          const u = i / (turns * 24);
          const ang = u * turns * Math.PI * 2;
          pts.push(cx + Math.sin(ang) * w, CY - 90 + u * 180, 0);
        }
        return pts;
      };
      d.poly(coil(CX + 30, 6, 26), 2, withA(L('halide', 1.2), a));
      d.poly(coil(CX + 110, 11, 26), 2, withA(L('sodium', 1.5), a));
      d.seg([CX + 70, CY - 110, 0], [CX + 70, CY + 110, 0], 3, withA(hex('#5a6a90', 1), a));
      d.seg([CX + 62, CY - 110, 0], [CX + 62, CY + 110, 0], 3, withA(hex('#5a6a90', 1), a));
      d.flush();
      // out: one high-voltage line running right, a pulse travelling along it
      if (out > 0) {
        const len = 2600 * out;
        d.seg([CX + 140, CY, 0], [CX + 140 + len, CY, 0], 3, L('sodium', 1.6));
        d.flush();
      }
      d.lineStyle({});
    }
    // the sung line: YOUR POWER FLOWS rides the top of the river; THROUGH ME, TRANSFORMED by the coils
    const sl = layLine(fonts, line, null, { size: 64, axes: { wdth: 110, wght: 800 }, upper: true });
    const first = { ...sl, words: sl.words.slice(0, 3) };
    drawLine(d, first, X0 + 30, 300, t, { light: 'led', glass: 0.7 });
    const second = { ...sl, words: sl.words.slice(3, 5).map((w, i, arr) => ({ ...w, x: w.x - arr[0].x })) };
    drawLine(d, second, CX - 240, CY - 170, t, { light: 'led', glass: prog(t, line.words[3].start - 0.5, line.words[3].start) });
    // TRANSFORMED: comes out of the coils changed (condensed and light going in, wide and heavy coming out)
    const tw = line.words[5];
    const tr = ease.outCubic(prog(t, tw.start, tw.end));
    const trs = layLine(fonts, null, 'TRANSFORMED', { size: 84, axes: { wdth: lerp(75, 125, tr), wght: lerp(300, 900, tr) } });
    trs.words[0].word = tw;
    drawLine(d, trs, CX + 175 + 60 * tr, CY + 32, t, { light: 'sodium', intensity: 1.2, glass: prog(t, tw.start - 0.4, tw.start) });
    return { bloom: 0.32, threshold: 0.95 };
  }
}
