// Buildings drawn as a night illustration: crisp flat blocks in two or three tones, windows as
// clean grids of light, a gradient sky with a few flat things alive in it (a moon, stars, haze,
// aircraft lights, a crane's beacon). A multiplane camera (flat layers at depths, as on an
// animation stand) gives the parallax. Shared by the tower that spells TAMER OF NIGHT, the urban
// chart built floor by floor, and the world's cities rising.
import { Draw, Paint } from '../engine/draw';
import { M4, RGBA, TAU, chain, clamp, fract, hash2, hex, lerp, mixc, rotZ, scale, translate, withA } from '../engine/math';
import { Axes, Fonts, glyphModel, setRun } from '../engine/text';
import { LightKind, SetLine, lamp, letterOn } from './lyric';
import { L } from './palette';

// ---------------------------------------------------------------- palette
/** the night of these scenes, in flat tones (linear; built from sRGB) */
export const NITE = {
  skyTop: hex('#04061a'),
  skyHigh: hex('#090d2b'),
  skyMid: hex('#151640'),
  skyLow: hex('#2c1f4f'),
  glow: hex('#4e2d48'),      // the city's light on the low sky, through haze
  glowHot: hex('#74403f'),
  haze: hex('#2b2152'),
  /** near blocks: a face to the moon, a face in shade, a recess, a lit edge */
  front: hex('#1a1f45'),
  side: hex('#0b0d25'),
  recess: hex('#11143a'),
  edge: hex('#414c86'),
  glass: hex('#141a3c'),
  pale: hex('#2e3668'),
  struct: hex('#3b4680'),
  moon: hex('#f3ead2'),
};

export type Tone = { front: RGBA; side: RGBA; recess: RGBA; edge: RGBA; glass: RGBA; pale: RGBA; struct: RGBA; light: number };

/** the tones of a layer, mixed toward the haze by its distance (0 near .. 1 lost in the haze) */
export function tone(far: number): Tone {
  const h = NITE.haze, k = clamp(far) * 0.75;
  const m = (c: RGBA) => mixc(c, h, k);
  return { front: m(NITE.front), side: m(NITE.side), recess: m(NITE.recess), edge: m(NITE.edge), glass: m(NITE.glass), pale: m(NITE.pale), struct: m(NITE.struct), light: 1 - clamp(far) * 0.45 };
}

// ---------------------------------------------------------------- the multiplane camera
/** a camera over flat layers: it looks at (x, y) from distance d; f is its focal length in px */
export type View = { x: number; y: number; d: number; roll?: number; f?: number };

/** a flat layer at depth z as the view sees it: design units -> screen px */
export class Plane {
  readonly s: number;
  readonly ok: boolean;
  readonly m: M4;
  private c: number;
  private sn: number;
  private vx: number;
  private vy: number;
  constructor(v: View, readonly z: number) {
    const f = v.f ?? 1600, dz = v.d + z;
    this.ok = dz > 1;
    this.s = this.ok ? f / dz : 0;
    const r = v.roll ?? 0;
    this.c = Math.cos(r); this.sn = Math.sin(r);
    this.vx = v.x; this.vy = v.y;
    this.m = chain(translate(960, 540, 0), rotZ(r), scale(this.s, this.s, 1), translate(-v.x, -v.y, 0));
  }
  /** design point -> screen px */
  X(x: number, y: number): [number, number] {
    const dx = (x - this.vx) * this.s, dy = (y - this.vy) * this.s;
    return [960 + this.c * dx - this.sn * dy, 540 + this.sn * dx + this.c * dy];
  }
  /** is a design box (roughly) on screen? */
  sees(x0: number, y0: number, x1: number, y1: number, pad = 40): boolean {
    const a = this.X(x0, y0), b = this.X(x1, y1), c = this.X(x0, y1), e = this.X(x1, y0);
    const lx = Math.min(a[0], b[0], c[0], e[0]), hx = Math.max(a[0], b[0], c[0], e[0]);
    const ly = Math.min(a[1], b[1], c[1], e[1]), hy = Math.max(a[1], b[1], c[1], e[1]);
    return hx > -pad && lx < 1920 + pad && hy > -pad && ly < 1080 + pad;
  }
}

/** fill a polygon (flat xy pairs, design units) on a plane */
export function poly(d: Draw, pl: Plane, pts: number[], paint: Paint) { d.fill([pts], paint, pl.m); }
export function polys(d: Draw, pl: Plane, ps: number[][], paint: Paint) { if (ps.length) d.fill(ps, paint, pl.m); }
export function box(d: Draw, pl: Plane, x0: number, y0: number, x1: number, y1: number, paint: Paint) {
  d.fill([[x0, y0, x1, y0, x1, y1, x0, y1]], paint, pl.m);
}
export const boxPts = (x0: number, y0: number, x1: number, y1: number) => [x0, y0, x1, y0, x1, y1, x0, y1];

/** a straight stroke on a plane, its width in design units (butt ends when lineStyle square) */
export function pseg(d: Draw, pl: Plane, x0: number, y0: number, x1: number, y1: number, w: number, c: RGBA, w1 = w, c1: RGBA = c) {
  const a = pl.X(x0, y0), b = pl.X(x1, y1);
  d.seg([a[0], a[1], 0], [b[0], b[1], 0], w * pl.s, c, w1 * pl.s, c1);
}

export type GridOpts = {
  x0: number; x1: number;
  /** y of the first floor's floor line (the ground is 0, up is negative) */
  yb: number;
  cols: number; rows: number; fh: number;
  /** the first floor drawn (negative: on down below the ground, under the haze) */
  r0?: number;
  /** glass as a share of its cell */
  gw?: number; gh?: number;
  /** the colour of the window at column c, floor r; null: not drawn */
  at: (c: number, r: number) => RGBA | null;
};

/** windows as a clean grid on a face (call with lineStyle square) */
export function grid(d: Draw, pl: Plane, o: GridOpts) {
  const pitch = (o.x1 - o.x0) / o.cols;
  const gw = pitch * (o.gw ?? 0.62), gh = o.fh * (o.gh ?? 0.58);
  if (gh * pl.s < 0.25 || gw * pl.s < 0.25) return;
  // the screen rows and columns that can be seen (a little roll is covered by the pad)
  for (let r = o.r0 ?? 0; r < o.rows; r++) {
    const yc = o.yb - (r + 0.56) * o.fh;
    const p0 = pl.X(o.x0, yc), p1 = pl.X(o.x1, yc);
    if (Math.max(p0[1], p1[1]) < -60 || Math.min(p0[1], p1[1]) > 1140) continue;
    const span = p1[0] - p0[0];
    let c0 = 0, c1 = o.cols - 1;
    if (Math.abs(p0[1] - p1[1]) < 30 && span > 0) {
      c0 = Math.max(0, Math.floor(((-60 - p0[0]) / span) * o.cols));
      c1 = Math.min(o.cols - 1, Math.ceil(((1980 - p0[0]) / span) * o.cols));
    }
    for (let c = c0; c <= c1; c++) {
      const col = o.at(c, r);
      if (!col) continue;
      const xc = o.x0 + (c + 0.5) * pitch;
      pseg(d, pl, xc - gw / 2, yc, xc + gw / 2, yc, gh, col);
    }
  }
}

// ---------------------------------------------------------------- lights in windows
const WARM = L('filament', 1), COOL = L('fluoro', 1), SOD = L('sodium', 1);

/** an integer hash to 0..1 (the sine hashes alias on a grid: whole runs of floors come out alike) */
export function ih(a: number, b: number, c = 0): number {
  let h = Math.imul((a | 0) ^ 0x2c9277b5, 0x85ebca6b) ^ Math.imul(((b | 0) + 0x7f4a7c15) | 0, 0xc2b2ae35) ^ Math.imul(((c | 0) + 0x165667b1) | 0, 0x27d4eb2f);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** an office at night: a few floors lit where the cleaners are, a few late desks, the rest glass.
 *  A few lights go on or off while we watch. Returns null for dark glass. */
export function office(seed: number, c: number, r: number, t: number, busy = 0.16, k = 1): RGBA | null {
  const fl = ih(seed, r, 1);
  const h = ih(seed, r * 977 + c, 2);
  let on = (fl < busy * 0.5 && h < 0.8) || h < 0.06 * (busy / 0.16);
  const sw = ih(seed, r * 977 + c, 3);
  if (sw > 0.97) on = fract(t * 0.7 + sw * 37) > 0.5 ? !on : on;
  if (!on) return null;
  const kind = ih(seed, r, 4 + Math.floor(c / 7));
  const base = kind < 0.5 ? WARM : kind < 0.85 ? COOL : SOD;
  const i = (0.7 + 0.55 * ih(seed, r * 977 + c, 5)) * k;
  return [base[0] * i, base[1] * i, base[2] * i, 1];
}

/** how far below the ground the blocks go on, so none floats over the haze (metres) */
export const UNDER = 420;

/** a face's flat tone, a touch lighter at the top and warmer at its foot, from the city's glow */
export function shade(c: RGBA, y0: number, y1: number, up = 0.16, down = 0.22): Paint {
  return { c0: mixc(c, NITE.edge, up), c1: mixc(c, NITE.glow, down), from: [0, y0], to: [0, y1] };
}

// ---------------------------------------------------------------- the sky and what lives in it
/** a vertical gradient through stops [y px, colour], the whole width of the frame */
export function sky(d: Draw, stops: [number, RGBA][]) {
  const s = stops;
  d.rect(-40, -400, 2000, s[0][0] + 400, s[0][1]);
  for (let i = 0; i < s.length - 1; i++) {
    const [y0, c0] = s[i], [y1, c1] = s[i + 1];
    if (y1 <= y0) continue;
    d.rect(-40, y0 - 0.5, 2000, y1 - y0 + 1, { c0, c1, from: [0, y0], to: [0, y1] });
  }
  const [yl, cl] = s[s.length - 1];
  d.rect(-40, yl - 0.5, 2000, 1500 - yl, cl);
}

/** stars, faint and a little alive; dx, dy shift them with the camera (they barely move) */
export function stars(d: Draw, t: number, n: number, seed: number, yMax: number, dx = 0, dy = 0, a = 1) {
  d.dotStyle({ blend: 'add' });
  for (let i = 0; i < n; i++) {
    const x = ((hash2(seed, i * 1.31) * 2100 - 90 + dx) % 2100 + 2100) % 2100 - 90;
    const yy = hash2(seed + 3.7, i * 0.77);
    const y = yy * yy * yMax + dy;
    if (y < -10 || y > 1090) continue;
    const tw = 0.65 + 0.35 * Math.sin(t * (2 + 5 * hash2(i, seed)) + i * 1.7);
    const big = hash2(i * 3.3, seed) > 0.93;
    const fade = 1 - clamp(yy * yy * 1.1 - 0.35);
    d.dot([x, y, 0], big ? 1.6 : 0.95, L('halide', (big ? 0.9 : 0.45) * tw * a * fade), big ? 0.5 : 0.2);
  }
  d.flush();
}

/** a circle as flat xy pairs */
export function circle(cx: number, cy: number, r: number, n = 64, ry = r): number[] {
  const p: number[] = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU; p.push(cx + Math.cos(a) * r, cy + Math.sin(a) * ry); }
  return p;
}

/** the moon, flat: a halo, the disc, its seas; screen px */
export function moon(d: Draw, x: number, y: number, r: number, a = 1) {
  d.fill([circle(x, y, r * 4.2, 72)], { c0: withA(hex('#4d4a86'), 0.22 * a), c1: withA(hex('#4d4a86'), 0), from: [x, y], to: [x + r * 4.2, y], radial: true }, null, 'add');
  d.fill([circle(x, y, r * 1.45, 64)], { c0: withA(hex('#9a92c0'), 0.16 * a), c1: withA(hex('#9a92c0'), 0), from: [x, y], to: [x + r * 1.45, y], radial: true }, null, 'add');
  d.fill([circle(x, y, r, 96)], withA(mixc(NITE.moon, [1.05, 1.0, 0.9, 1], 0.1), a));
  const sea = withA(hex('#c9bfa6'), 0.75 * a);
  d.fill([circle(x - r * 0.28, y - r * 0.22, r * 0.3, 32, r * 0.24)], sea);
  d.fill([circle(x + r * 0.2, y - r * 0.32, r * 0.2, 32, r * 0.17)], sea);
  d.fill([circle(x + r * 0.05, y + r * 0.18, r * 0.34, 32, r * 0.22)], sea);
  d.fill([circle(x - r * 0.42, y + r * 0.34, r * 0.12, 24)], sea);
}

/** a crescent moon: the lit part between the limb and the terminator (k: 1 new .. 0 half .. -1
 *  full), turned by `tilt`; the dark of the disc just shows (screen px) */
export function crescent(d: Draw, x: number, y: number, r: number, k: number, tilt: number) {
  d.fill([circle(x, y, r * 3.2, 64)], { c0: withA(hex('#4d4a86'), 0.13), c1: withA(hex('#4d4a86'), 0), from: [x, y], to: [x + r * 3.2, y], radial: true }, null, 'add');
  d.fill([circle(x, y, r, 72)], mixc(NITE.skyHigh, NITE.edge, 0.22));
  const pts: number[] = [];
  const c = Math.cos(tilt), s = Math.sin(tilt);
  const P = (u: number, v: number) => pts.push(x + c * u - s * v, y + s * u + c * v);
  for (let i = 0; i <= 48; i++) { const a = -Math.PI / 2 + (i / 48) * Math.PI; P(r * Math.cos(a), r * Math.sin(a)); }
  for (let i = 0; i <= 48; i++) { const a = Math.PI / 2 - (i / 48) * Math.PI; P(k * r * Math.cos(a), r * Math.sin(a)); }
  d.fill([pts], NITE.moon);
}

/** a band of haze (screen or plane units through `m`), its alpha from a0 at y0 to a1 at y1 */
export function haze(d: Draw, x0: number, y0: number, x1: number, y1: number, c: RGBA, a0: number, a1: number, m: M4 | null = null) {
  d.fill([[x0, y0, x1, y0, x1, y1, x0, y1]], { c0: withA(c, a0), c1: withA(c, a1), from: [0, y0], to: [0, y1] }, m);
}

/** a light that blinks: 1 for `on` of each period, with a soft edge */
export function blink(t: number, period: number, phase = 0, on = 0.18): number {
  const u = fract(t / period + phase);
  return u < on ? 1 - Math.pow(u / on, 3) * 0.6 : 0;
}

/** an aircraft at night, only its lights: wingtips red and green, a strobe, the red beacon */
export function aircraft(d: Draw, x: number, y: number, t: number, dir = 1, k = 1, seed = 0) {
  d.dotStyle({ blend: 'add' });
  const span = 7 * k;
  const port: [number, number, number] = [x - dir * span * 0.2, y + span * 0.12, 0];
  const star: [number, number, number] = [x + dir * span * 0.25, y - span * 0.1, 0];
  d.dot(port, 1.4 * k, L('tail', 1.6), 0.6);
  d.dot(star, 1.4 * k, hex('#5dff8a', 1.4), 0.6);
  d.dot([x - dir * span, y, 0], 1.1 * k, L('halide', 0.8), 0.5);
  const s = blink(t, 1.1, seed, 0.06);
  if (s > 0) { d.dot(port, 2.8 * k, L('halide', 3 * s), 0.8); d.dot(star, 2.8 * k, L('halide', 3 * s), 0.8); }
  const b = blink(t, 1.4, seed + 0.5, 0.25);
  d.dot([x, y + span * 0.05, 0], 1.6 * k, L('tail', 0.5 + 2.2 * b), 0.7);
  d.flush();
}

/** a red obstruction light on a mast top (screen px) */
export function beacon(d: Draw, x: number, y: number, r: number, t: number, phase = 0, a = 1) {
  const b = 0.22 + 0.78 * blink(t, 1.5, phase, 0.38);
  d.dotStyle({ blend: 'add' });
  d.dot([x, y, 0], r * 2.6, L('tail', 0.55 * b * a), 1);
  d.dot([x, y, 0], r, L('tail', 2.2 * b * a), 0.3);
}

// ---------------------------------------------------------------- motion
/** a smooth path through values at evenly spaced p in 0..1 that carries straight on beyond both
 *  ends, so a camera on it never stops at the cut */
export function through(p: number, v: number[]): number {
  const n = v.length - 1;
  const m = (i: number) => (i <= 0 ? v[1] - v[0] : i >= n ? v[n] - v[n - 1] : (v[i + 1] - v[i - 1]) / 2);
  if (p <= 0) return v[0] + m(0) * n * p;
  if (p >= 1) return v[n] + m(n) * n * (p - 1);
  const x = p * n, i = Math.min(n - 1, Math.floor(x)), u = x - i;
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * v[i] + (u3 - 2 * u2 + u) * m(i) + (-2 * u3 + 3 * u2) * v[i + 1] + (u3 - u2) * m(i + 1);
}

// ---------------------------------------------------------------- type in windows
const dotCache = new Map<string, { dots: [number, number][]; width: number }>();

function inside(contours: Float32Array[], x: number, y: number): boolean {
  let wn = 0;
  for (const c of contours) {
    const n = c.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const x0 = c[i * 2], y0 = c[i * 2 + 1], x1 = c[j * 2], y1 = c[j * 2 + 1];
      if (y0 <= y) { if (y1 > y && (x1 - x0) * (y - y0) - (x - x0) * (y1 - y0) > 0) wn++; }
      else if (y1 <= y && (x1 - x0) * (y - y0) - (x - x0) * (y1 - y0) < 0) wn--;
    }
  }
  return wn !== 0;
}

/** text as windows: a glyph outline sampled on a grid `rows` windows tall at cap height (dot
 *  [column, row from the top]), with its own letter spacing so a line fits a facade */
export function dots(fonts: Fonts, text: string, rows: number, font = 'pass', axes: Axes = { wght: 800 }, tracking = 0.05) {
  const key = `${font}|${rows}|${JSON.stringify(axes)}|${tracking}|${text}`;
  const hit = dotCache.get(key);
  if (hit) return hit;
  const run = setRun(fonts, font, text, 1000, axes, tracking);
  const cap = setRun(fonts, font, 'H', 1000, axes).glyphs[0].geo.bbox[3] * run.scale;
  const pitch = cap / rows;
  const out: [number, number][] = [];
  const seen = new Set<string>();
  let maxC = 0;
  // a window is lit when the letter covers enough of it (4x4 samples), so strokes come out even
  const N = 4;
  for (const g of run.glyphs) {
    const k = run.scale;
    const [bx0, , bx1] = g.geo.bbox;
    if (!isFinite(bx0)) continue;
    const c0 = Math.floor((g.x + bx0 * k) / pitch), c1 = Math.ceil((g.x + bx1 * k) / pitch);
    for (let cx = c0; cx <= c1; cx++) for (let ry = -1; ry <= rows; ry++) {
      const id = `${cx},${ry}`;
      if (seen.has(id)) continue;
      let hit = 0;
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const px = (cx + (i + 0.5) / N) * pitch, py = (rows - ry - 1 + (j + 0.5) / N) * pitch;
        if (inside(g.geo.contours, (px - g.x) / k, py / k)) hit++;
      }
      if (hit / (N * N) >= 0.45) { seen.add(id); out.push([cx, ry]); maxC = Math.max(maxC, cx); }
    }
  }
  const minC = out.reduce((m, [c]) => Math.min(m, c), 1e9);
  const res = { dots: out.map(([c, r]) => [c - minC, r] as [number, number]), width: maxC - minC + 1 };
  dotCache.set(key, res);
  return res;
}

// ---------------------------------------------------------------- clouds
/** a cloud cut from paper: puffs over a flat underside, its top edge lit by the moon (screen px) */
export function cloud(d: Draw, x: number, y: number, w: number, h: number, seed: number, lit: RGBA, body: RGBA, m: M4 | null = null) {
  // a long rounded base (y is its underside, h its height) and a few big puffs rising out of it,
  // the middle ones tallest
  const hb = h * 0.62, rb = hb / 2;
  const n = 4 + Math.floor(ih(seed, 1, 7) * 2);
  const P: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const u = 0.16 + (0.68 * i) / Math.max(1, n - 1) + (ih(seed, i, 9) - 0.5) * 0.12;
    const r = h * (0.32 + 0.62 * Math.pow(Math.sin(Math.PI * u), 1.5) * (0.6 + 0.4 * ih(seed, i, 8)));
    P.push([x - w / 2 + u * w, y - hb * 0.5 - r * 0.42, r]);
  }
  const shape = (dy: number, k: number): number[][] => {
    const out = P.map(([px, py, r]) => circle(px, py + dy, r * k, 48));
    const base: number[] = [];
    const yc = y - rb + dy;
    for (let i = 0; i <= 16; i++) { const a = -Math.PI / 2 + (i / 16) * Math.PI; base.push(x + w / 2 - rb + Math.cos(a) * rb, yc + Math.sin(a) * rb); }
    for (let i = 0; i <= 16; i++) { const a = Math.PI / 2 + (i / 16) * Math.PI; base.push(x - w / 2 + rb + Math.cos(a) * rb, yc + Math.sin(a) * rb); }
    out.push(base);
    return out;
  };
  d.fill(shape(0, 1), lit, m);
  d.fill(shape(h * 0.12, 0.97), body, m);
}

/** a block dropped into place: 0 above, 1 down, with the bounce of landing (t seconds since it fell) */
export function land(t: number, fall = 0.09): number {
  if (t <= 0) return 0;
  if (t < fall) { const u = t / fall; return u * u; }
  const s = t - fall;
  return 1 + Math.sin(s * TAU * 7) * Math.exp(-s * 14) * 0.18;
}

// ---------------------------------------------------------------- construction
export type CraneOpts = {
  /** foot of the mast (on the roof being built), its height, the jib's reach out and back */
  x: number; y: number; mast: number; jib: number; counter: number;
  /** where the trolley is along the jib (share), and how far the hook hangs */
  trolley: number; drop: number;
  c: RGBA; t: number; phase: number; dir?: 1 | -1;
};

/** a tower crane seen side on: lattice mast, jib and counter-jib, the cat head and its ties, the
 *  trolley and hook, a floodlight on the work, a red light on top */
export function crane(d: Draw, pl: Plane, o: CraneOpts) {
  if (!pl.ok) return;
  const dir = o.dir ?? 1, c = o.c, top = o.y - o.mast, mw = 3.4;
  d.lineStyle({ square: true, blend: 'alpha' });
  pseg(d, pl, o.x - mw / 2, o.y, o.x - mw / 2, top, 0.9, c);
  pseg(d, pl, o.x + mw / 2, o.y, o.x + mw / 2, top, 0.9, c);
  const n = Math.max(2, Math.round(o.mast / 5));
  for (let k = 0; k < n; k++) {
    const y0 = o.y - (k / n) * o.mast, y1 = o.y - ((k + 1) / n) * o.mast;
    pseg(d, pl, k % 2 ? o.x - mw / 2 : o.x + mw / 2, y0, k % 2 ? o.x + mw / 2 : o.x - mw / 2, y1, 0.5, c);
  }
  // the jib, its lower chord and lacing, the counter-jib with its weights
  const jx = o.x + dir * o.jib, cx = o.x - dir * o.counter;
  pseg(d, pl, cx, top, jx, top, 1.5, c);
  pseg(d, pl, o.x, top + 3, jx - dir * 2, top + 1.2, 0.6, c);
  const m = Math.max(2, Math.round(o.jib / 6));
  for (let k = 0; k < m; k++) {
    const a = o.x + dir * (k / m) * o.jib, b = o.x + dir * ((k + 0.5) / m) * o.jib;
    pseg(d, pl, a, top + 3 - (k / m) * 1.8, b, top, 0.45, c);
  }
  box(d, pl, Math.min(cx, cx + dir * 7), top - 1.5, Math.max(cx, cx + dir * 7), top + 5, mixc(c, NITE.side, 0.4));
  // the cat head and its pendant ties
  pseg(d, pl, o.x, top, o.x, top - 10, 1.3, c);
  pseg(d, pl, o.x, top - 10, jx, top, 0.45, c);
  pseg(d, pl, o.x, top - 10, cx, top, 0.45, c);
  // the cab
  box(d, pl, Math.min(o.x, o.x + dir * 5), top + 1, Math.max(o.x, o.x + dir * 5), top + 6, mixc(c, L('filament', 1), 0.35));
  // trolley, hoist rope, hook
  const tx = o.x + dir * o.trolley * o.jib;
  pseg(d, pl, tx - 2, top + 1.4, tx + 2, top + 1.4, 1.6, c);
  pseg(d, pl, tx, top + 2, tx, top + 2 + o.drop, 0.35, mixc(c, NITE.edge, 0.4));
  box(d, pl, tx - 1.4, top + 2 + o.drop, tx + 1.4, top + 5 + o.drop, c);
  d.flush();
  // its floodlight under the jib, and the red light on its head
  const f = pl.X(o.x + dir * o.jib * 0.45, top + 3);
  d.dotStyle({ blend: 'add' });
  d.dot([f[0], f[1], 0], Math.max(0.8, 1.0 * pl.s), L('filament', 1.6 * c[3]), 0.5);
  d.dot([f[0], f[1], 0], Math.max(2, 5 * pl.s), L('filament', 0.12 * c[3]), 1);
  const b = pl.X(o.x, top - 10);
  beacon(d, b[0], b[1], Math.max(1, 1.2 * pl.s), o.t, o.phase, c[3]);
  d.flush();
}

/** sparks thrown off where a block lands (t0: when it landed); plane units */
export function sparks(d: Draw, pl: Plane, x: number, y: number, t0: number, t: number, seed: number, n = 6, w = 20) {
  const a = t - t0;
  if (a < 0 || a > 0.5 || !pl.ok) return;
  d.dotStyle({ blend: 'add' });
  for (let i = 0; i < n; i++) {
    const u = ih(seed, i, 11), v = ih(seed, i, 12);
    const px = x + (u - 0.5) * w + (u - 0.5) * 140 * a;
    const py = y - (40 + 70 * v) * a + 260 * a * a;
    const p = pl.X(px, py);
    const fade = 1 - a / 0.5;
    d.dot([p[0], p[1], 0], Math.max(0.8, 1.1 * pl.s), L('filament', 2.6 * fade * fade), 0.4);
  }
  d.flush();
}

/** a helicopter at night: a dark shape, its rotor a blur, its lights; and a searchlight from its
 *  nose to a point below (screen px) */
export function helicopter(d: Draw, x: number, y: number, t: number, k: number, to: [number, number] | null, body: RGBA) {
  if (to) {
    const dx = to[0] - x, dy = to[1] - y, L0 = Math.hypot(dx, dy) || 1;
    const nx = -dy / L0, ny = dx / L0, sp = L0 * 0.07;
    d.fill([[x + nx * 1.5, y + ny * 1.5, x - nx * 1.5, y - ny * 1.5, to[0] - nx * sp, to[1] - ny * sp, to[0] + nx * sp, to[1] + ny * sp]],
      { c0: withA(L('halide', 0.5), 0.26), c1: withA(L('halide', 0.4), 0), from: [x, y], to: [to[0], to[1]] }, null, 'add');
  }
  d.fill([circle(x, y, 9 * k, 28, 5 * k)], body);
  d.fill([[x - 6 * k, y - 1.5 * k, x - 24 * k, y - 2.5 * k, x - 24 * k, y - 0.5 * k, x - 6 * k, y + 2 * k]], body);
  d.fill([[x - 24 * k, y - 2.5 * k, x - 27 * k, y - 7 * k, x - 25 * k, y - 7 * k, x - 21 * k, y - 2 * k]], body);
  d.lineStyle({ square: true, blend: 'alpha' });
  d.seg([x - 7 * k, y + 7 * k, 0], [x + 7 * k, y + 7 * k, 0], 1.1 * k, body);
  const rot = 0.55 + 0.45 * Math.abs(Math.sin(t * 41));
  d.seg([x - 22 * k * rot, y - 6.5 * k, 0], [x + 22 * k * rot, y - 6.5 * k, 0], 1.2 * k, withA(mixc(body, NITE.edge, 0.6), 0.85));
  d.seg([x, y - 6.5 * k, 0], [x, y - 4 * k, 0], 1.6 * k, body);
  d.flush();
  d.dotStyle({ blend: 'add' });
  d.dot([x - 26 * k, y - 7 * k, 0], 1.5 * k, L('tail', 0.6 + 2 * blink(t, 1.2, 0.3, 0.3)), 0.6);
  d.dot([x + 4 * k, y + 4.5 * k, 0], 1.2 * k, L('halide', 0.4 + 3 * blink(t, 0.9, 0.7, 0.07)), 0.6);
  d.flush();
}

/** a sung line built floor by floor: each glyph goes up in `floors` slabs from its baseline as the
 *  voice reaches it, each slab dropped into place with a bounce and lit as it lands. Before that
 *  the letter is a faint plan (ghost). Slabs are cut with the scissor, so the plane must not be
 *  rolled. (x, y): the line's left baseline on the plane. */
export function buildLine(d: Draw, gl: WebGL2RenderingContext, sl: SetLine, x: number, y: number, t: number, pl: Plane,
  o: { floors: number; every: number; light: LightKind; intensity?: number; drop?: number; ghost?: RGBA | null; fall?: number; alpha?: number }) {
  const a = o.alpha ?? 1;
  if (!pl.ok || a <= 0.002) return;
  const F = o.floors, drop = o.drop ?? 14, fall = o.fall ?? 0.07;
  const H = d.res[1], px = d.px;
  sl.words.forEach((sw) => {
    const n = sw.letters;
    sw.run.glyphs.forEach((g, gi) => {
      if (!g.geo.mesh) return;
      const gx = x + sw.x + g.x, gy = y + g.y, k = sw.run.scale;
      const on = sw.word ? letterOn(sw.word, gi, n) : -1e9;
      if (o.ghost && t < on + F * o.every + fall) d.fillMesh(g.geo.mesh, withA(o.ghost, o.ghost[3] * a), glyphModel(pl.m, gx, gy, k));
      const [, fy0, , fy1] = g.geo.bbox;
      for (let b = 0; b < F; b++) {
        const tb = on + b * o.every;
        if (t < tb) break;
        const dy = -(1 - Math.min(1.25, land(t - tb, fall))) * drop;
        const lo = fy0 + ((fy1 - fy0) * b) / F, hi = fy0 + ((fy1 - fy0) * (b + 1)) / F;
        // a slab in the air or bouncing is drawn on over the gap it leaves, so no seam opens
        const yTop = gy - hi * k + Math.min(dy, 0) - (b === F - 1 ? 4 : 0), yBot = gy - lo * k + Math.max(dy, 0) + (b === 0 ? 4 : 0);
        const s0 = Math.round(pl.X(gx, yTop)[1] * px), s1 = Math.round(pl.X(gx, yBot)[1] * px);
        if (s1 <= 0 || s0 >= H || s1 <= s0) continue;
        d.flush();
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(0, H - s1, d.res[0], s1 - s0);
        const c = lamp(o.light, t - tb, o.intensity ?? 1, gi);
        d.fillMesh(g.geo.mesh, withA(c, c[3] * a), glyphModel(pl.m, gx, gy + dy, k));
        gl.disable(gl.SCISSOR_TEST);
      }
    });
  });
}

export { lerp };
