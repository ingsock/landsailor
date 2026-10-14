// VERSE 3, "Crack the ciphers to free up your mind / Your life, your heart".
// Literacy, 1820-2024 (12% of adults could read; now 88%), on an amber terminal: behind the chart a
// primer's page of cipher decodes from its top as far as the share of the world that could read
// that year, a cursor at its edge; the chart's labels resolve from scramble into sense, a table
// prints a row as each year is reached, and the sung line is typed at the prompt, each letter
// cipher until the voice reaches it (decode motion: noise settling into sense).
// Then life expectancy, 1770-2023 (29 years then, 73 now), on a heart monitor: the life line
// climbs a step a beat on the song's beat, lub then dub, each beat leaving its year below; under it
// a beat strip is written by a sweep, and the readouts keep the years (heartbeat motion: lub, dub,
// rest). Only life expectancy is data; the beat strip is the song's.
import { Camera } from '../engine/camera';
import { Scene, ShotFrame, timeOf } from '../engine/engine';
import { RGBA, clamp, ease, hex, lerp, prog, withA, hash2, glide, translate } from '../engine/math';
import { Score, Word } from '../engine/score';
import { at, path } from '../lib/chart';
import { drawLine, label, layLine, letterOn } from '../lib/lyric';
import { L } from '../lib/palette';
import { CIPHER, Page } from '../lib/crt_page';

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&?*+=<>/';
const SYMBOLS = '#%&?*+=<>/@$';

// the page behind the cipher's chart: a primer, the first page anyone reads (alphabet, syllables,
// small words); how much of it can be read is the share of adults who could read that year
const PCOLS = 150, PROWS = 44, PCELL: [number, number] = [12.5, 24];
const WORDS = 'sun moon star sky sea land road rain snow wind fire lamp light night day map ship sail bird tree seed corn bread salt milk home door book pen ink page word name hand eye cart wheel bell clock coat boat fish lake hill farm well town gate bridge';
const SENTENCES = 'I can read.  You can read.  We can read the map.  The lamp is lit.  The road is long.  The ship has a sail.  The book is open.  Here is my name.  The sun is up.  The rain is on the hill.';

function primer(cols: number, rows: number): string {
  const out: string[] = [];
  const blank = () => { out.push(''.padEnd(cols)); };
  const wrap = (words: string[], gap = '  ') => {
    let cur = '';
    for (const w of words) {
      const add = cur ? cur + gap + w : w;
      if (add.length > cols - 2) { out.push(('  ' + cur).padEnd(cols)); cur = w; } else cur = add;
    }
    if (cur) out.push(('  ' + cur).padEnd(cols));
  };
  const AZ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const V = ['a', 'e', 'i', 'o', 'u'], C = 'bcdfghjklmnprstvwz'.split('');
  const parts = [
    () => { out.push(('  ' + AZ.split('').join(' ') + '      ' + AZ.toLowerCase().split('').join(' ')).padEnd(cols)); },
    () => { out.push(('  ' + '1 2 3 4 5 6 7 8 9 0').padEnd(cols)); },
    blank,
    () => wrap(C.map((c) => V.map((v) => c + v).join(' ')), '    '),
    blank,
    () => wrap(C.map((c) => V.map((v) => v + c).join(' ')), '    '),
    blank,
    () => wrap(WORDS.split(' ')),
    blank,
    () => wrap(SENTENCES.split('  '), '   '),
    blank,
  ];
  while (out.length < rows) for (const f of parts) { if (out.length >= rows) break; f(); }
  return out.slice(0, rows).map((r) => r.slice(0, cols)).join('');
}

export class Mind extends Scene {
  score!: Score;
  lit!: Record<string, [number[], number[]]>;
  life!: Record<string, [number[], number[]]>;
  page!: Page;
  text = '';
  async init() {
    this.score = this.ctx.data.get('score');
    const ch = this.ctx.data.get('charts');
    this.lit = ch.literacy.series;
    this.life = ch.life.series;
    this.page = new Page(this.ctx.d, this.ctx.fonts, { cols: PCOLS, rows: PROWS, cell: PCELL });
    this.text = primer(PCOLS, PROWS);
  }

  draw(f: ShotFrame) {
    return f.shot.params!.part === 'cipher' ? this.cipher(f) : this.heart(f);
  }

  /** text that is scrambled until `reveal` (0..1 of its letters, left to right) */
  scramble(text: string, reveal: number, t: number, seed: number) {
    const n = text.length;
    let out = '';
    for (let i = 0; i < n; i++) {
      const ch = text[i];
      if (ch === ' ' || ch === '.' || ch === ',' || i / n < reveal) { out += ch; continue; }
      const h = hash2(i + seed, Math.floor(t * 18));
      // a digit (or a per cent sign) not yet decoded is never shown as a digit: a half-read year or
      // share must not read as a real one
      out += (ch >= '0' && ch <= '9') || ch === '%' ? SYMBOLS[Math.floor(h * SYMBOLS.length)] : GLYPHS[Math.floor(h * GLYPHS.length)];
    }
    return out;
  }

  cipher(f: ShotFrame) {
    const { d, fonts } = this.ctx;
    const t = f.t;
    const line = this.score.line('Crack the ciphers');
    this.ctx.clear(hex('#010101'));
    // the camera drifts before the screen, so the tube's lines and the page slide a little
    const cam = Camera.home();
    const k = glide(f.p);
    cam.pos = [960 + lerp(46, -46, k), 540 + lerp(14, -10, k), lerp(-1570, -1650, k)];
    cam.target = [960 + lerp(20, -20, k), 540, 0];
    cam.roll = lerp(0.012, -0.012, k);
    d.setCamera(cam);
    // the years run as the line is sung; how much of the page can be read follows the world
    const rev = ease.inOutSine(prog(t, line.start - 0.1, line.end));
    const yr = lerp(1820, 2024, rev);
    const W = this.lit.World;
    // what is read out as text is taken at the frame's own time, so a changing number or letter is
    // never two at once in one motion-blurred frame; what moves is drawn at each sub-frame
    const tf = timeOf(f.frame);
    const revF = ease.inOutSine(prog(tf, line.start - 0.1, line.end));
    const yrF = lerp(1820, 2024, revF);
    const share = (at(W, yrF) ?? 12) / 100;
    const ink: [number, number, number] = [1, 0.92, 0.8];

    // the page: read up to the decoding cursor, cipher after it
    const P = this.page;
    P.clear();
    const N = PCOLS * PROWS;
    const F = Math.floor(share * N);
    const tick = Math.floor(tf * 14);
    for (let i = 0; i < N; i++) {
      const ch = this.text[i];
      if (ch === ' ') continue;
      const col = i % PCOLS, row = (i / PCOLS) | 0;
      if (i < F) {
        const trail = clamp(1 - (F - i) / 70);
        P.set(col, row, ch, 0.012 + 0.07 * trail * trail);
      } else {
        const h = hash2(i * 0.37, tick + Math.floor(hash2(i, 3) * 5));
        P.set(col, row, CIPHER[Math.floor(h * CIPHER.length)], 0.006 + 0.004 * hash2(i, 9));
      }
    }
    // the cursor, at the edge of what can be read, and the share beside it
    const fc = F % PCOLS, fr = Math.floor(F / PCOLS);
    P.set(fc, fr, '█', 0.11);
    const tag = `${Math.round(share * 100)}% CAN READ`;
    for (let j = 0; j < tag.length; j++) P.set(fc + 2 + j, fr, tag[j], 0.09);
    const PX = 960 - (PCOLS * PCELL[0]) / 2, PY = 540 - (PROWS * PCELL[1]) / 2;
    P.draw(translate(PX, PY, 0), ink);

    // the chart, in a window over the page
    const win = (x0: number, y0: number, x1: number, y1: number, title: string, a: number) => {
      d.rect(x0, y0, x1 - x0, y1 - y0, hex('#000000', 1, 0.8 * a));
      d.lineStyle({});
      const c = withA(L('halide', 0.55), a);
      d.poly([x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y1, 0], 1.6, c, { closed: true });
      d.poly([x0 + 6, y0 + 6, 0, x1 - 6, y0 + 6, 0, x1 - 6, y1 - 6, 0, x0 + 6, y1 - 6, 0], 1.0, withA(L('halide', 0.3), a), { closed: true });
      d.flush();
      d.rect(x0 + 6, y0 + 6, x1 - x0 - 12, 34, withA(L('halide', 0.42), a));
      label(d, fonts, title, x0 + 22, y0 + 32, 20, hex('#000000', 1, a), { font: 'passMono', axes: { wght: 700 } });
    };
    const cx0 = 150, cx1 = 1300, cy0 = 150, cy1 = 840;
    win(cx0, cy0, cx1, cy1, this.scramble('LITERACY RATE, ADULTS, 1820-2024', revF * 1.7, tf, 3), 1);
    const X0 = 270, X1 = 1230, Y0 = 760, Y1 = 250;
    const X = (y: number) => X0 + ((y - 1820) / (2024 - 1820)) * (X1 - X0);
    const Y = (p: number) => Y0 + (p / 100) * (Y1 - Y0);
    d.lineStyle({ dash: [6, 0.5] });
    for (const p of [25, 50, 75, 100]) d.seg([X0, Y(p), 0], [X1, Y(p), 0], 1, withA(L('halide', 0.16), 1));
    d.flush();
    d.lineStyle({});
    d.seg([X0, Y0, 0], [X1, Y0, 0], 1.4, withA(L('halide', 0.4), 1));
    d.flush();
    for (const p of [0, 25, 50, 75, 100]) label(d, fonts, this.scramble(`${p}%`, revF * 1.4, tf, p), X0 - 14, Y(p) + 7, 18, L('halide', 0.4), { align: 'right' });
    for (const y of [1820, 1870, 1920, 1970, 2024]) label(d, fonts, this.scramble(String(y), revF * 1.3 - (y - 1820) / 420, tf, y), X(y), Y0 + 34, 18, L('halide', 0.4), { align: 'center' });
    // the countries, faint; their names decode as the sweep reaches them
    for (const n of ['China', 'India', 'Nigeria', 'Ethiopia']) {
      const s = this.lit[n];
      if (!s || s[0][0] > yr) continue;
      d.lineStyle({});
      d.poly(path(s, X as any, Y as any, yr), 1.4, withA(L('halide', 0.3), 1));
      d.flush();
      const ye = Math.min(yr, s[0][s[0].length - 1]);
      const v = at(s, ye);
      if (v !== null) label(d, fonts, this.scramble(n.toUpperCase(), (yrF - s[0][0]) / 40, tf, n.length * 3), X(ye) + 8, Y(v) + 5, 14, L('halide', 0.32));
    }
    // the world: the line that matters, and the sweep that carries it
    d.lineStyle({ glow: 3 });
    d.poly(path(W, X as any, Y as any, yr), 3.6, L('halide', 1.3));
    d.flush();
    d.lineStyle({});
    const v = at(W, yr) ?? 12;
    const vF = at(W, yrF) ?? 12;
    d.lineStyle({ dash: [4, 0.5] });
    d.seg([X(yr), Y0, 0], [X(yr), Y1 - 10, 0], 1, withA(L('halide', 0.35), 1));
    d.flush();
    d.lineStyle({});
    d.dotStyle({});
    d.dot([X(yr), Y(v), 0], 6, L('halide', 2.0), 0.5);
    d.flush();
    // the reading rides the head of the line, turning to its left side near the window's edge
    const late = X(yr) > 1010;
    label(d, fonts, `WORLD ${vF.toFixed(0)}%`, late ? X(yr) - 16 : X(yr) + 14, Y(v) - 16, 22, L('halide', 1.3), { font: 'passMono', axes: { wght: 700 }, align: late ? 'right' : 'left' });
    label(d, fonts, 'Data: van Zanden et al.; UNESCO, via Our World in Data', cx0 + 22, cy1 - 18, 13, L('halide', 0.28));

    // the table: a row printed as each year is reached, the newest one lit
    const tx0 = 1340, tx1 = 1770;
    win(tx0, cy0, tx1, cy1, 'YEAR    READ', 1);
    const years = [1820, 1870, 1900, 1920, 1940, 1950, 1960, 1975, 1985, 1995, 2000, 2005, 2010, 2015, 2020, 2024];
    let newest = -1;
    years.forEach((y, i) => { if (yrF >= y - 0.01) newest = i; });
    years.forEach((y, i) => {
      if (i > newest) return;
      const val = at(W, y)!;
      const row = `${y}    ${val.toFixed(1).padStart(4)}%`;
      const yy = cy0 + 84 + i * 40;
      const isNew = i === newest;
      if (isNew) d.rect(tx0 + 16, yy - 26, tx1 - tx0 - 32, 36, withA(L('halide', 0.32), 1));
      label(d, fonts, row, tx0 + 30, yy, 22, isNew ? hex('#000000') : L('halide', 0.55), { font: 'passMono', axes: { wght: isNew ? 700 : 500 } });
    });

    // the bar along the top of the screen, and the prompt's line, kept clear of the page
    d.rect(140, 86, 1640, 48, hex('#000000', 1, 0.85));
    d.rect(140, 872, 1640, 124, hex('#000000', 1, 0.7));
    label(d, fonts, 'LITERACY.DAT', 150, 112, 20, L('halide', 0.6), { font: 'passMono', axes: { wght: 700 } });
    label(d, fonts, `YEAR ${Math.round(yrF)}   PAGE READ ${Math.round(share * 100)}%`, 1770, 112, 20, L('halide', 0.6), { font: 'passMono', axes: { wght: 700 }, align: 'right' });
    d.seg([150, 124, 0], [1770, 124, 0], 1, withA(L('halide', 0.3), 1));
    d.flush();

    // the sung line, typed at the prompt: each letter is cipher until the voice reaches it
    this.typed(line.words, 210, 962, 60, t, tf, 'led');
    return { bloom: 0.3, threshold: 0.95 };
  }

  /** the sung line at a prompt: every letter stays where it will be, cipher until it is sung */
  typed(words: Word[], x: number, y: number, size: number, t: number, tf: number, light: 'led' | 'monitor') {
    const { d, fonts } = this.ctx;
    const line = words[0].line;
    const sl = layLine(fonts, line, null, { size, axes: { wdth: 104, wght: 820 }, upper: true, maxWidth: 1560 });
    label(d, fonts, '>', x - 54, y, size * 0.8, L('halide', 0.9), { font: 'passMono', axes: { wght: 700 } });
    // letters not yet sung: a cipher letter in the same place, dim and changing
    let lastX = x;
    sl.words.forEach((sw, wi) => {
      const n = sw.letters;
      sw.run.glyphs.forEach((g, gi) => {
        const on = letterOn(sw.word!, gi, n);
        const gx = x + sw.x + g.x;
        if (t >= on) { lastX = Math.max(lastX, gx + g.adv); return; }
        const h = hash2(wi * 13 + gi, Math.floor(tf * 16));
        label(d, fonts, GLYPHS[Math.floor(h * GLYPHS.length)], gx + g.adv / 2, y, sl.size * 0.82, L('halide', 0.16), { font: 'passMono', axes: { wght: 700 }, align: 'center' });
      });
    });
    // the sung letters, lit as they are reached
    drawLine(d, sl, x, y, t, { light, glass: 0 });
    // the cursor after the last letter sung, blinking
    if (Math.floor(tf * 2.2) % 2 === 0 || tf < words[0].start) d.rect(lastX + 10, y - sl.size * 0.72, sl.size * 0.42, sl.size * 0.78, L('halide', 0.9));
  }

  heart(f: ShotFrame) {
    const { d, fonts } = this.ctx;
    const t = f.t;
    const sc = this.score;
    const line = sc.line('Your life, your heart');
    this.ctx.clear(hex('#000100'));
    const G = (i: number, a = 1): RGBA => L('monitor', i, a);
    // the heart: the song's beat, lub on the beat and dub just after it
    const bt = sc.beatAt(t);
    const fb = bt - Math.floor(bt);
    const lub = Math.exp(-fb / 0.07), dub = fb > 0.2 ? Math.exp(-(fb - 0.2) / 0.07) : 0;
    const thump = lub + 0.6 * dub;
    // the camera before the monitor: drifting, and pushed a little by every beat
    const k = glide(f.p);
    const cam = Camera.home();
    cam.pos = [960 + lerp(-36, 40, k), 540 + lerp(18, -14, k), lerp(-1560, -1640, k) + 16 * thump];
    cam.target = [960 + lerp(-12, 16, k), 540, 0];
    cam.roll = lerp(-0.012, 0.014, k);
    d.setCamera(cam);

    // the years: a step a beat from the first beat of the line, lub then dub
    const b1 = Math.ceil(sc.beatAt(f.shot.start));
    // the last step lands while "heart" is still held, so the reading rests on 2023 a moment
    const steps = Math.floor(sc.beatAt(line.end - 0.2) - b1) + 1;
    const s = bt - b1;
    const stepEase = (x: number) => 0.6 * ease.outQuart(clamp(x / 0.14)) + 0.4 * ease.outQuart(clamp((x - 0.2) / 0.14));
    const done = s < 0 ? 0 : Math.floor(s) + stepEase(s - Math.floor(s));
    const yr = lerp(1770, 2023, clamp(done / steps));
    const W = this.life.World;
    const life = at(W, yr) ?? 28.5;
    // the readouts at the frame's own time (see the cipher)
    const sF = sc.beatAt(timeOf(f.frame)) - b1;
    const doneF = sF < 0 ? 0 : Math.floor(sF) + stepEase(sF - Math.floor(sF));
    const yrF = lerp(1770, 2023, clamp(doneF / steps));
    const lifeF = at(W, yrF) ?? 28.5;

    // the screen's grid, as on the monitor's glass
    const X0 = 150, X1 = 1380, Y0 = 700, Y1 = 190, E0 = 760, E1 = 900;
    d.lineStyle({});
    for (let x = X0; x <= X1 + 0.5; x += 20.5) {
      const major = Math.round((x - X0) / 20.5) % 5 === 0;
      d.seg([x, Y1 - 20, 0], [x, E1, 0], 1, G(major ? 0.1 : 0.04));
    }
    for (let y = Y1 - 20; y <= E1 + 0.5; y += 20) {
      const major = Math.round((y - Y1 + 20) / 20) % 5 === 0;
      d.seg([X0, y, 0], [X1, y, 0], 1, G(major ? 0.1 : 0.04));
    }
    d.flush();
    const X = (y: number) => X0 + ((y - 1770) / (2023 - 1770)) * (X1 - X0);
    const Y = (a: number) => Y0 + ((a - 20) / (80 - 20)) * (Y1 - Y0);
    for (const ag of [30, 40, 50, 60, 70, 80]) label(d, fonts, String(ag), X0 - 14, Y(ag) + 7, 18, G(0.5), { align: 'right', font: 'passMono' });
    // every beat leaves its mark: a line down from where the step landed, and its year
    for (let j = 0; j <= Math.min(steps, Math.floor(doneF + 0.05)); j++) {
      const yj = lerp(1770, 2023, j / steps), vj = at(W, yj) ?? 28.5;
      const fresh = clamp(1 - (doneF - j) / 1.5);
      d.lineStyle({ dash: [5, 0.5] });
      d.seg([X(yj), Y(vj) + 8, 0], [X(yj), Y0, 0], 1, G(0.18 + 0.4 * fresh));
      d.flush();
      d.lineStyle({});
      label(d, fonts, String(Math.round(yj)), X(yj), Y0 + 30, 17, G(0.42 + 0.6 * fresh), { align: 'center', font: 'passMono', axes: { wght: fresh > 0.5 ? 700 : 500 } });
    }
    label(d, fonts, 'LIFE', X0 + 8, Y1 - 30, 18, G(0.7), { font: 'passMono', axes: { wght: 700 } });

    // the trace: life expectancy up to this year, older light fading like a phosphor's
    const pts = path(W, X as any, Y as any, yr, 1770, 1);
    const n = pts.length / 3;
    if (n > 1) {
      d.lineStyle({ glow: 4 });
      d.poly(pts, 2.8, (i) => G(lerp(0.4, 1.7, Math.pow(i / (n - 1), 3))));
      d.flush();
      d.lineStyle({});
    }
    const hx = X(yr), hy = Y(life);
    // on every beat a blip at the head of the trace, as the monitor marks a beat
    if (thump > 0.02) {
      const a = lub;
      d.lineStyle({ glow: 3 });
      d.poly([hx - 26, hy, 0, hx - 16, hy + 9 * a, 0, hx - 8, hy - 78 * a, 0, hx, hy + 26 * a, 0, hx + 8, hy, 0, hx + 22, hy - 12 * dub, 0, hx + 34, hy, 0], 2.2, G(0.4 + 1.6 * thump));
      d.flush();
      d.lineStyle({});
    }
    d.dotStyle({});
    d.dot([hx, hy, 0], 6 + 4 * thump, G(2.0 + 1.5 * thump), 0.5);
    d.flush();
    // a ring goes out from the head on each beat
    {
      const rr = 12 + 150 * ease.outCubic(fb), ra = 0.5 * Math.pow(1 - fb, 2);
      const ring: number[] = [];
      for (let i = 0; i <= 48; i++) { const a = (i / 48) * Math.PI * 2; ring.push(hx + Math.cos(a) * rr, hy + Math.sin(a) * rr, 0); }
      d.lineStyle({ blend: 'add' });
      d.poly(ring, 1.4, G(ra));
      d.flush();
      d.lineStyle({});
    }

    // the strip below: the beat itself, written by a sweep that runs on and wraps, the old trace
    // erased just ahead of it
    const speed = 470, span = X1 - X0;
    const head = ((t * speed) % span + span) % span;
    const ecg = (tau: number) => {
      const ph = sc.beatAt(tau);
      const q = ph - Math.floor(ph);
      let v = 0;
      v += 0.12 * Math.exp(-Math.pow((q - 0.86) / 0.03, 2));          // P
      v -= 0.12 * Math.exp(-Math.pow((q - 0.985) / 0.008, 2));        // Q
      v += 1.0 * Math.exp(-Math.pow((q - 0.0) / 0.012, 2)) + 1.0 * Math.exp(-Math.pow((q - 1.0) / 0.012, 2)); // R
      v -= 0.25 * Math.exp(-Math.pow((q - 0.025) / 0.01, 2));         // S
      v += 0.3 * Math.exp(-Math.pow((q - 0.2) / 0.05, 2));            // dub's echo in the T wave
      return v;
    };
    const em = (E0 + E1) / 2 + 30;
    const strip: number[] = [], bright: number[] = [];
    for (let px = 0; px <= span; px += 2) {
      let age = head - px;
      if (age < 0) age += span;
      if (age > span - 46) { strip.push(NaN); bright.push(0); continue; }
      const tau = t - age / speed;
      strip.push(em - ecg(tau) * 92);
      bright.push(Math.exp(-age / 700));
    }
    d.lineStyle({ glow: 2 });
    for (let i = 1; i < strip.length; i++) {
      if (isNaN(strip[i]) || isNaN(strip[i - 1])) continue;
      d.seg([X0 + (i - 1) * 2, strip[i - 1], 0], [X0 + i * 2, strip[i], 0], 2.0, G(0.25 + 1.3 * bright[i - 1]), 2.0, G(0.25 + 1.3 * bright[i]));
    }
    d.flush();
    d.lineStyle({});
    label(d, fonts, 'BEAT', X0 + 8, E0 + 4, 16, G(0.6), { font: 'passMono', axes: { wght: 700 } });

    // the numbers, where a monitor keeps them: life expectancy, the year, the years gained
    const box = (x0: number, y0: number, x1: number, y1: number) => {
      d.lineStyle({});
      d.poly([x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y1, 0], 1.2, G(0.28), { closed: true });
      d.flush();
    };
    const RX0 = 1440, RX1 = 1790;
    box(RX0, 170, RX1, 470);
    label(d, fonts, 'LIFE EXPECTANCY', RX0 + 22, 206, 18, G(0.7), { font: 'passMono', axes: { wght: 700 } });
    label(d, fonts, lifeF.toFixed(1), RX1 - 20, 382, 132, G(1.5 + 0.4 * thump), { font: 'passMono', axes: { wght: 700 }, align: 'right' });
    label(d, fonts, 'YEARS AT BIRTH, WORLD', RX0 + 22, 440, 15, G(0.55), { font: 'passMono' });
    box(RX0, 490, RX1, 660);
    label(d, fonts, 'YEAR', RX0 + 22, 526, 18, G(0.7), { font: 'passMono', axes: { wght: 700 } });
    label(d, fonts, String(Math.round(yrF)), RX1 - 20, 628, 88, G(1.25), { font: 'passMono', axes: { wght: 700 }, align: 'right' });
    box(RX0, 680, RX1, 900);
    label(d, fonts, 'SINCE 1770', RX0 + 22, 716, 18, G(0.7), { font: 'passMono', axes: { wght: 700 } });
    const gain = lifeF - (at(W, 1770) ?? 28.5);
    label(d, fonts, `${gain >= 0 ? '+' : ''}${gain.toFixed(1)}`, RX1 - 20, 808, 72, G(1.1), { font: 'passMono', axes: { wght: 700 }, align: 'right' });
    label(d, fonts, 'YEARS', RX1 - 20, 850, 15, G(0.55), { font: 'passMono', align: 'right' });
    // the heart, beating, beside the reading it keeps
    {
      const cx = RX1 - 34, cy = 200, sz = 17 * (1 + 0.25 * thump);
      const hp: number[] = [];
      for (let i = 0; i <= 40; i++) {
        const a = (i / 40) * Math.PI * 2;
        const x = 16 * Math.pow(Math.sin(a), 3), y = 13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a);
        hp.push(cx + (x / 16) * sz, cy - (y / 16) * sz);
      }
      d.fill([hp], G(0.5 + 1.6 * thump));
    }

    // the bar along the top
    label(d, fonts, 'LIFE EXPECTANCY AT BIRTH · WORLD · 1770–2023', X0, 118, 20, G(0.75), { font: 'passMono', axes: { wght: 700 } });
    label(d, fonts, 'Data: Riley (2005); Zijdeman et al. (2015); UN WPP (2024), via Our World in Data', RX1, 118, 13, G(0.4), { align: 'right' });
    d.seg([X0, 132, 0], [RX1, 132, 0], 1, G(0.3));
    d.flush();

    // YOUR LIFE, YOUR HEART: lit as sung, swelling with each beat
    const sl = layLine(fonts, line, null, { size: 104, axes: { wdth: 112, wght: 860 }, upper: true, maxWidth: 1500 });
    drawLine(d, sl, X0, 1010, t, { light: 'monitor', glass: 0.5, jiggle: () => [0, 0, 0, 1 + 0.045 * thump, 1 + 0.045 * thump] });
    return { bloom: 0.35, threshold: 0.9 };
  }
}
