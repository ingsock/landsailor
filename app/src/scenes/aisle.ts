// VERSE 2, "A vast preserve / Aisle after aisle in reach".
// A supermarket printed in two inks, and its floor plan is a bar chart: each gondola is as long as
// a country's daily supply of food per person (FAO, latest year), the world's own among them,
// sorted so the longest is at the back. From high above it reads as the chart, its gondolas running
// out to their lengths on "A vast", A VAST PRESERVE hanging over the back of the store; on
// "preserve" the camera swings down into the store and
// glides along the main aisle past the aisle mouths (dolly motion: steady, quickening with the
// words), and over every other aisle a sign drops in on its cables with a word of the line.
// Shelves are stocked with bold flat goods; the floor is tiled.
import { Camera } from '../engine/camera';
import { FillMesh } from '../engine/draw';
import { Scene, ShotFrame } from '../engine/engine';
import { M4, RGBA, V3, chain, cross, mulberry32, norm, rotX, rotY, scale, spring, translate } from '../engine/math';
import { Score, Word } from '../engine/score';
import { label, layLine } from '../lib/lyric';
import { BLUE, BOTH, Contour, PAPER, PINK, PRINT_POST, circleC, holeC, inkLine, rectC, rrectC, track } from '../lib/print_ink';

const PITCH = 3.6;            // metres from one gondola to the next
const GD = 1.6;               // a gondola's depth, front to back
const GH = 1.8;               // and its height
const KM = 0.0262;            // metres of gondola per kcal
const BAY = 1.3;              // shelving comes in bays
const SHELVES = [0.14, 0.7, 1.26];

type Layer = { mesh: FillMesh | null; paint: RGBA };
type Row = { name: string; kcal: number; year: number; len: number; z: number; world: boolean; goods: Layer[] };

/** a model that lays local (u, v) on the floor: u along +x, v toward -z (text reads from the front) */
const flat = (x: number, y: number, z: number): M4 => chain(translate(x, y, z), rotX(-Math.PI / 2));

/** right, down and forward of a camera looking along (yaw, pitch) */
function facing(yaw: number, pitch: number): { r: V3; dn: V3; f: V3 } {
  const f: V3 = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
  const r = norm(cross(f, [0, -1, 0]));
  return { r, dn: cross(f, r), f };
}
/** a model whose local x is r and local y is dn, placed at o */
function basisM(o: V3, r: V3, dn: V3, f: V3): M4 {
  const m = new Float32Array(16);
  m[0] = r[0]; m[1] = r[1]; m[2] = r[2];
  m[4] = dn[0]; m[5] = dn[1]; m[6] = dn[2];
  m[8] = f[0]; m[9] = f[1]; m[10] = f[2];
  m[12] = o[0]; m[13] = o[1]; m[14] = o[2]; m[15] = 1;
  return m;
}

const kcalFmt = (v: number) => Math.round(v).toLocaleString('en-US');

export class Aisle extends Scene {
  score!: Score;
  rows: Row[] = [];
  tiles: FillMesh | null = null;
  display: Layer[] = [];
  years = '';

  async init() {
    this.score = this.ctx.data.get('score');
    const k = this.ctx.data.get('charts').kcal.series as Record<string, [number[], number[]]>;
    this.rows = Object.entries(k).map(([name, s]) => {
      const kcal = s[1][s[1].length - 1];
      return { name, kcal, year: s[0][s[0].length - 1], len: kcal * KM, z: 0, world: name === 'World', goods: [] };
    });
    // shortest at the front of the store, longest at the back: from above, the longest bar is on top
    this.rows.sort((a, b) => a.kcal - b.kcal);
    this.rows.forEach((r, i) => { r.z = i * PITCH; r.goods = this.stock(r, i); });
    // the latest year is not the same everywhere: say so
    const last = Math.max(...this.rows.map((r) => r.year));
    const odd = this.rows.filter((r) => r.year !== last).map((r) => `${r.name} ${r.year}`);
    this.years = `${last}${odd.length ? ` (${odd.join(', ')})` : ''}`;
    // the floor: three-metre tiles, every other one inked
    const tiles: Contour[] = [];
    for (let x = -30; x < 117; x += 3) for (let z = -24; z < 78; z += 3) if (((x + z) / 3) % 2 === 0) tiles.push(rectC(x, -z - 3, 3, 3));
    this.tiles = this.ctx.d.makeFill(tiles);
    // the end of each gondola, facing the main aisle: a pyramid of tins
    const tins: Contour[] = [], ends: Contour[] = [];
    const rr = 0.13;
    for (let row = 0; row < 5; row++) {
      for (let j = 0; j < 5 - row; j++) {
        const cx = 0.2 + rr + row * rr + j * rr * 2.02, cy = -0.14 - rr - row * rr * 1.74;
        tins.push(circleC(cx, cy, rr, 20));
        ends.push(circleC(cx, cy, rr * 0.5, 14));
      }
    }
    this.display = [{ mesh: this.ctx.d.makeFill(tins), paint: PINK() }, { mesh: this.ctx.d.makeFill(ends), paint: PAPER }];
  }

  /** a gondola's front face, stocked: shelving and goods in layers of one ink each (local u along
   *  the gondola, v down, metres) */
  stock(r: Row, i: number): Layer[] {
    const rnd = mulberry32(31 + i * 7);
    const L: Record<string, Contour[]> = { Bt: [], Pt: [], B: [], P: [], O: [], dB: [], dP: [], dX: [] };
    const put = (k: string, c: Contour) => L[k].push(c);
    // the shelving: kick plate, shelf edges, uprights
    put('O', rectC(0, -0.14, r.len, 0.14));
    for (const h of SHELVES.slice(1)) put('B', rectC(0, -h, r.len, 0.05));
    put('B', rectC(0, -GH, r.len, 0.07));
    for (let u = 0; u <= r.len + 0.01; u += BAY) put('B', rectC(Math.min(u, r.len) - 0.03, -GH, 0.06, GH));
    // goods: a bay holds one kind of thing per shelf, faced side by side
    const kinds = ['can', 'box', 'bottle', 'tins', 'fruit', 'jar', 'carton', 'bag'];
    const inks = ['P', 'B', 'O', 'Bt', 'Pt', 'P', 'B'];
    for (let u0 = 0; u0 < r.len - 0.3; u0 += BAY) {
      SHELVES.forEach((h, s) => {
        const kind = kinds[Math.floor(rnd() * kinds.length)];
        let body = inks[Math.floor(rnd() * inks.length)];
        // the world's gondola is stocked mostly in its own ink
        if (r.world && rnd() < 0.6) body = 'P';
        const det = body === 'P' || body === 'Pt' ? (rnd() < 0.5 ? 'dB' : 'dX') : body === 'O' ? 'dX' : rnd() < 0.5 ? 'dP' : 'dX';
        const yb = -h - (s === 0 ? 0 : 0.05);
        const room = (SHELVES[s + 1] ?? GH) - h - 0.1;
        this.goods(kind, u0 + 0.09, yb, BAY - 0.18, Math.min(room, 0.46), body, det, put);
      });
    }
    const paint: Record<string, RGBA> = { Bt: BLUE(0.45), Pt: PINK(0.5), B: BLUE(), P: PINK(), O: BOTH(), dB: BLUE(), dP: PINK(), dX: PAPER };
    return Object.keys(L).map((k) => ({ mesh: this.ctx.d.makeFill(L[k]), paint: paint[k] }));
  }

  /** one facing of goods across a bay's shelf: x0 left, yb the shelf (v, negative is up) */
  goods(kind: string, x0: number, yb: number, w: number, hMax: number, body: string, det: string, put: (k: string, c: Contour) => void) {
    switch (kind) {
      case 'can': {
        const cw = 0.2, ch = Math.min(0.3, hMax);
        for (let x = x0; x + cw <= x0 + w; x += cw + 0.035) {
          put(body, rrectC(x, yb - ch, cw, ch, 0.03, 3));
          put(det, rectC(x, yb - ch * 0.68, cw, ch * 0.32));
        }
        break;
      }
      case 'box': {
        const bw = 0.27, bh = Math.min(0.42, hMax);
        for (let x = x0; x + bw <= x0 + w; x += bw + 0.03) {
          put(body, rectC(x, yb - bh, bw, bh));
          put(det, circleC(x + bw / 2, yb - bh * 0.6, bw * 0.3, 16));
        }
        break;
      }
      case 'bottle': {
        const bw = 0.13, bh = Math.min(0.44, hMax);
        for (let x = x0; x + bw <= x0 + w; x += bw + 0.045) {
          put(body, rrectC(x, yb - bh * 0.64, bw, bh * 0.64, [0.045, 0.045, 0.012, 0.012], 3));
          put(body, rectC(x + bw * 0.31, yb - bh, bw * 0.38, bh * 0.38));
          put(det, rectC(x, yb - bh * 0.42, bw, bh * 0.17));
        }
        break;
      }
      case 'tins': {
        // tins on their sides, stacked: circles
        const rr = 0.1;
        const n = Math.max(1, Math.floor(w / (rr * 2 + 0.012)));
        for (let row = 0; row < 3; row++) {
          const y = yb - rr - row * rr * 1.74;
          if (y - rr < yb - hMax) break;
          for (let j = 0; j < n - row; j++) {
            const cx = x0 + rr + row * rr + j * (rr * 2 + 0.012);
            put(body, circleC(cx, y, rr, 18));
            put('dX', circleC(cx, y, rr * 0.45, 12));
          }
        }
        break;
      }
      case 'fruit': {
        // a crate, and fruit piled on it
        const fr = 0.085;
        put('B', rectC(x0, yb - 0.15, w, 0.15));
        put('dX', rectC(x0 + 0.04, yb - 0.095, w - 0.08, 0.03));
        const fruitInk = body === 'B' || body === 'Bt' ? 'P' : body;
        for (let row = 0; row < 2; row++) {
          for (let x = x0 + fr + row * fr; x + fr <= x0 + w - row * fr; x += fr * 2.05) {
            put(fruitInk, circleC(x, yb - 0.15 - fr * 0.8 - row * fr * 1.5, fr, 16));
          }
        }
        break;
      }
      case 'jar': {
        const jw = 0.19, jh = Math.min(0.25, hMax);
        for (let x = x0; x + jw <= x0 + w; x += jw + 0.035) {
          put(body, rrectC(x, yb - jh * 0.8, jw, jh * 0.8, 0.035, 3));
          put(det === 'dX' ? 'B' : det, rectC(x + 0.012, yb - jh, jw - 0.024, jh * 0.22));
        }
        break;
      }
      case 'carton': {
        const cw = 0.17, ch = Math.min(0.36, hMax);
        for (let x = x0; x + cw <= x0 + w; x += cw + 0.035) {
          put(body, [x, yb, x + cw, yb, x + cw, yb - ch * 0.8, x + cw / 2, yb - ch, x, yb - ch * 0.8]);
          put(det, rectC(x, yb - ch * 0.52, cw, ch * 0.15));
        }
        break;
      }
      case 'bag': {
        const bw = 0.3, bh = Math.min(0.4, hMax);
        for (let x = x0; x + bw <= x0 + w; x += bw + 0.035) {
          put(body, rrectC(x, yb - bh, bw, bh, [0.02, 0.02, 0.07, 0.07], 4));
          put(det, circleC(x + bw / 2, yb - bh * 0.48, bw * 0.25, 14));
          put('dX', rectC(x, yb - bh, bw, 0.04));
        }
        break;
      }
    }
  }

  /** the camera at any moment: high over the plan, drifting the way the last shot went; after
   *  "preserve" it swings down into the store and glides along the main aisle, reaching each sign as
   *  its word is sung, quicker with each word, and carries on past the end */
  camAt(t: number): Camera {
    const sc = this.score;
    const vp = sc.line('A vast preserve'), ar = sc.line('Aisle after aisle');
    const w = ar.words;
    const zOf = (i: number) => i * PITCH;
    const aisleOf = (k: number) => 11 - 2 * k;
    const signZ = (k: number) => zOf(aisleOf(k) - 1) + PITCH / 2;
    const s0 = vp.words[2].start + 0.25, s1 = w[0].start - 0.2;
    const tz: [number, number][] = [[72.6, 33.2], [s0, 34.6], [s1, signZ(0) + 1.8]];
    // the signs step a little further into the aisles each time, and the camera with them
    const signX = (k: number) => 4.2 + 1.1 * k;
    const tx: [number, number][] = [[72.6, 38.6], [s0, 43.2], [s1, 6.2]];
    w.forEach((x, k) => { tz.push([x.start + 0.15, signZ(k) + 0.8]); tx.push([x.start + 0.15, signX(k) + 2.2]); });
    tz.push([ar.end + 0.8, signZ(4) - 8]);
    tx.push([ar.end + 0.8, signX(4) + 3.4]);
    const target: V3 = [track(t, tx), 0, track(t, tz)];
    const yaw = track(t, [[72.6, 0], [s0, 0.035], [s1, 0.64], [ar.end + 0.8, 0.72]]);
    const pitch = track(t, [[72.6, 1.38], [s0, 1.36], [s1, 0.62], [ar.end + 0.8, 0.56]]);
    const dist = track(t, [[72.6, 262], [s0, 251], [s1, 33], [ar.end + 0.8, 30]]);
    const cam = Camera.orbit(target, dist, yaw, pitch, 0, 0.32);
    cam.near = 0.5;
    return cam;
  }

  /** how far the print's halftone screen has slid by t, following the picture: the summed motion
   *  on screen of the point the camera looks at (with this long lens the picture moves nearly as
   *  one). Tabulated once, at 1/240 s, from the start of the camera's path. */
  private screenT0 = 72.4;
  private screenTab: number[] | null = null;
  screenAt(t: number): [number, number] {
    const H = 1 / 240;
    if (!this.screenTab) {
      const tab: number[] = [0, 0];
      let ox = 0, oy = 0;
      for (let i = 0; i < 240 * 9; i++) {
        const t0 = this.screenT0 + i * H;
        const c0 = this.camAt(t0), c1 = this.camAt(t0 + H);
        const m = c1.viewProj(1920 / 1080), p = c0.target;
        const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
        const y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
        const wq = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
        // where the point under the centre went in the next instant, in px of the 1080-line frame
        const sx = (x / wq * 0.5 + 0.5) * 1920 - 960, sy = (0.5 - y / wq * 0.5) * 1080 - 540;
        // the screen moves with the picture: the pattern is sampled at px + offset, so it goes
        // the other way
        ox -= sx; oy -= sy;
        tab.push(ox, oy);
      }
      this.screenTab = tab;
    }
    const tab = this.screenTab;
    const u = Math.max(0, Math.min((tab.length / 2 - 1) - 1e-6, (t - this.screenT0) / H));
    const i = Math.floor(u), k = u - i;
    return [tab[i * 2] + (tab[i * 2 + 2] - tab[i * 2]) * k, tab[i * 2 + 1] + (tab[i * 2 + 3] - tab[i * 2 + 1]) * k];
  }

  draw(f: ShotFrame) {
    const { d, fonts } = this.ctx;
    const t = f.t;
    const sc = this.score;
    this.ctx.clear([0, 0, 0]);
    const vp = sc.line('A vast preserve'), ar = sc.line('Aisle after aisle');
    const w = ar.words;
    const n = this.rows.length;
    const zOf = (i: number) => i * PITCH;
    // a word over every other aisle, toward the front of the store: aisle 11, 9, 7, 5, 3
    const aisleOf = (k: number) => 11 - 2 * k;                 // aisle a lies between rows a - 1 and a
    const signZ = (k: number) => zOf(aisleOf(k) - 1) + PITCH / 2;
    // ------------------------------------------------------------------ the camera
    // high over the plan, drifting the way the last shot went; after "preserve" it swings down into
    // the store and glides along the main aisle, reaching each sign as its word is sung, quicker
    // with each word, and carries on past the end
    const signX = (k: number) => 4.2 + 1.1 * k;
    const cam = this.camAt(t);
    d.setCamera(cam);
    const camX = cam.pos[0];
    // ------------------------------------------------------------------ the floor
    d.fillMesh(this.tiles, BLUE(0.1), flat(0, 0, 0));
    // the chart's title, painted on the floor at the back
    const ttl = flat(-24, -0.01, zOf(n - 1) + 7.6);
    label(d, fonts, 'Daily supply of calories per person', 0, 0, 2.9, BLUE(), { font: 'pass', axes: { wght: 800 }, base: ttl });
    label(d, fonts, `Latest year: ${this.years}. Data: FAO, via Our World in Data`, 0, 2.3, 1.3, BLUE(0.9), { font: 'passMono', axes: { wght: 500 }, base: ttl });
    // ------------------------------------------------------------------ the gondolas, back to front
    // on "A vast" the store stocks itself: each gondola runs out to its length, the front row first
    // (no overshoot: what a bar settles at is the number)
    const grow0 = vp.start - 0.12;
    for (let i = n - 1; i >= 0; i--) {
      const r = this.rows[i];
      const z = zOf(i);
      const ink = r.world ? PINK : BLUE;
      const g = Math.max(0.002, 1 - Math.pow(1 - Math.min(1, Math.max(0, (t - grow0 - i * 0.032) / 0.62)), 3));
      const len = r.len * g;
      // the chart's own labels on the floor: the country before its gondola, the number after it
      label(d, fonts, r.name.toUpperCase(), -8, 0, 1.9, ink(), { font: 'pass', axes: { wght: 850 }, align: 'right', base: flat(0, -0.01, z - 0.66) });
      const dots: Contour[] = [];
      for (let x = -6.9; x < -1; x += 1.0) dots.push(circleC(x, -z, 0.15, 10));
      d.fill(dots, ink(), flat(0, -0.01, 0));
      label(d, fonts, `${kcalFmt(r.kcal)} kcal`, len + 1.1, 0, 1.75, ink(), { font: 'passMono', axes: { wght: 700 }, base: flat(0, -0.01, z - 0.6) });
      // the end that faces the main aisle, with its display
      if (camX < 0) {
        const endM = chain(translate(0, 0, z + GD / 2), rotY(Math.PI / 2));
        d.rect(0, -GH, GD, GH, r.world ? PINK(0.35) : BLUE(0.3), endM);
        d.rect(0, -0.14, GD, 0.14, BOTH(), endM);
        for (const g of this.display) d.fillMesh(g.mesh, r.world ? (g.paint === PAPER ? PAPER : BLUE()) : g.paint, endM);
      }
      // the top: the bar of the chart, with its name and number knocked out of it
      d.rect(0, -(z + GD / 2), len, GD, ink(), flat(0, -GH, 0));
      if (g > 0.3) label(d, fonts, `${r.name.toUpperCase()}  ${kcalFmt(r.kcal)} kcal`, 0.8, 0, 0.85, PAPER, { font: 'pass', axes: { wght: 800 }, base: flat(0, -GH - 0.005, z - 0.3) });
      // the face: paper behind the goods, then the goods in their inks (run out with the gondola)
      const face = chain(translate(0, 0, z - GD / 2), scale(g, 1, 1));
      d.rect(0, -GH, r.len, GH, PAPER, face);
      for (const gd of r.goods) d.fillMesh(gd.mesh, gd.paint, face);
    }
    // ------------------------------------------------------------------ hanging signs
    type Face = { r: V3; dn: V3; f: V3 };
    const sign = (sl: ReturnType<typeof layLine>, num: string | null, x: number, z: number, h: number, drop: number, fc: Face, light: 'fluoro' | 'sodium') => {
      // it drops in on its cables and swings to rest
      const fall = spring(t - drop, 2.1, 0.5);
      if (fall <= 0) return;
      const size = sl.size;
      const pad = size * 0.45, disc = num ? size * 1.1 : 0;
      const W = sl.width + pad * (num ? 3 : 2) + disc, Hh = size * 1.3;
      const lift = (1 - fall) * 4.5;
      const o: V3 = [x - (W / 2) * fc.r[0] - Hh * fc.dn[0], -h - lift - Hh * fc.dn[1], z - (W / 2) * fc.r[2] - Hh * fc.dn[2]];
      const M = basisM(o, fc.r, fc.dn, fc.f);
      d.lineStyle({ world: true });
      for (const u of [W * 0.1, W * 0.9]) {
        const a: V3 = [o[0] + fc.r[0] * u, o[1], o[2] + fc.r[2] * u];
        d.seg(a, [a[0], a[1] - 40, a[2]], size * 0.045, BLUE());
      }
      d.flush();
      d.lineStyle({});
      // the panel: paper, an inked frame, a disc with the aisle's number, the word. The aisle signs
      // are solid blue with the word knocked out of it: a pale panel arriving over the blue shelves
      // on every word would pulse the frame's brightness like a strobe
      const knock = num !== null;
      const fr = size * 0.1, m = size * 0.16;
      d.rect(-m, -m, W + 2 * m, Hh + 2 * m, knock ? BLUE() : PAPER, M);
      d.fill([rectC(0, 0, W, Hh), holeC(rectC(fr, fr, W - 2 * fr, Hh - 2 * fr))], knock ? PINK() : BLUE(), M);
      if (num) {
        d.fill([circleC(pad + disc / 2, Hh / 2, disc * 0.44, 32)], PINK(), M);
        label(d, fonts, num, pad + disc / 2, Hh / 2 + size * 0.24, size * 0.62, PAPER, { font: 'pass', axes: { wght: 900 }, align: 'center', base: M });
      }
      inkLine(d, sl, pad * (num ? 2 : 1) + disc, Hh / 2 + size * 0.36, t, { light, on: knock ? [0.08, 0] : light === 'sodium' ? [1, 0] : [0, 1], ghost: knock ? [0, 0.6] : [0.04, 0.13], base: M });
    };
    // A VAST PRESERVE over the back of the store, turned to whoever looks up at it
    const cb = cam.basis();
    const big = layLine(fonts, vp, null, { size: 6.4, axes: { wdth: 115, wght: 880 }, upper: true });
    sign(big, null, 70, zOf(n - 1) + 6, 3.5, 72.75, { r: cb.r, dn: cb.d, f: cb.f }, 'sodium');
    // the words, one over every other aisle, each turned to the camera that passes it
    const fc = facing(0.66, 0.62);
    w.forEach((x, k) => {
      const sl = layLine(fonts, null, x.w, { size: 1.3, axes: { wdth: 112, wght: 860 }, upper: true });
      sl.words[0].word = x;
      sign(sl, String(aisleOf(k)), signX(k), signZ(k), 3.3, x.start - 0.5, fc, 'fluoro');
    });
    return { ...PRINT_POST };
  }
}
