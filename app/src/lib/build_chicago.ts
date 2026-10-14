// Chicago's towers as designed shapes for a night illustration (elevations in metres, ground at
// y = 0, up is negative y): Willis Tower's bundled tubes stepping back with its two masts; the
// John Hancock Center's taper and its stacked X-braces; the Aon Center's pale pinstriped slab;
// Marina City's two corncobs; Trump Tower's setbacks and spire; Two Prudential's stepped
// chevrons. Each face is one flat tone; windows are a clean grid of light. Every block runs on
// down below the ground (UNDER) into the haze, so nothing floats.
import { Draw } from '../engine/draw';
import { RGBA, hash2, hex, lerp, mixc, withA } from '../engine/math';
import { L } from './palette';
import { Plane, Tone, UNDER, beacon, box, boxPts, grid, ih, office, poly, pseg, shade } from './build_style';

const MAST = hex('#5d6594');
const U = UNDER;

/** a red light at the top of a mast, scaled with the plane */
function tip(d: Draw, pl: Plane, x: number, y: number, t: number, ph: number, k = 1) {
  const p = pl.X(x, y);
  beacon(d, p[0], p[1], Math.max(1.1, 1.5 * pl.s * k), t, ph);
}

/** a glass window: dark glass or a lit office */
const win = (tn: Tone, seed: number, t: number, busy = 0.16) => (c: number, r: number): RGBA | null =>
  office(seed, c, r, t, busy, tn.light) ?? tn.glass;

const under = (fh: number) => -Math.ceil(U / fh);

export function willis(d: Draw, pl: Plane, x: number, tn: Tone, t: number, seed = 11) {
  const FH = 442 / 108, Y = (n: number) => -n * FH;
  if (!pl.ok || !pl.sees(x - 40, -530, x + 45, 0)) return;
  // seen from the west: the north tubes stop at 50 and 90, the centre runs to the roof, the south at 66 and 90
  const tubes = [
    { x0: x - 34.5, x1: x - 11.5, front: 50, top: 90 },
    { x0: x - 11.5, x1: x + 11.5, front: 108, top: 108 },
    { x0: x + 11.5, x1: x + 34.5, front: 66, top: 90 },
  ];
  // the faces in shade
  poly(d, pl, boxPts(x + 34.5, Y(90), x + 42, U), tn.side);
  poly(d, pl, boxPts(x + 11.5, Y(108), x + 19, Y(90)), tn.side);
  for (const b of tubes) {
    box(d, pl, b.x0, Y(b.front), b.x1, U, shade(tn.front, Y(108), 0));
    if (b.top > b.front) box(d, pl, b.x0, Y(b.top), b.x1, Y(b.front), shade(tn.recess, Y(108), Y(50), 0.1, 0.1));
  }
  d.lineStyle({ square: true, blend: 'alpha' });
  // windows, six bays to a tube; the mechanical floors are louvred bands
  const mech = (r: number) => (r >= 29 && r <= 31) || (r >= 64 && r <= 65) || (r >= 88 && r <= 89) || (r >= 104 && r <= 105);
  tubes.forEach((b, i) => {
    const w = win(tn, seed + i * 3, t, 0.12);
    grid(d, pl, { x0: b.x0, x1: b.x1, yb: 0, r0: under(FH), cols: 6, rows: b.top, fh: FH, gw: 0.6, gh: 0.55, at: (c, r) => (mech(r) ? null : w(c, r)) });
  });
  for (const b of tubes) for (const [r0, r1] of [[29, 32], [64, 66], [88, 90], [104, 106]]) {
    if (r0 >= b.top) continue;
    for (let k = 0; k < 4; k++) {
      const y = Y(r0) - ((k + 0.5) / 4) * (r1 - r0) * FH;
      pseg(d, pl, b.x0 + 0.6, y, b.x1 - 0.6, y, 0.9, tn.side);
    }
  }
  // the joints between the tubes, the moonlit edges and the ledges of each setback
  pseg(d, pl, x - 11.5, U, x - 11.5, Y(90), 0.8, tn.side);
  pseg(d, pl, x + 11.5, U, x + 11.5, Y(90), 0.8, tn.side);
  pseg(d, pl, x - 34.5, U, x - 34.5, Y(90), 1.2, tn.edge);
  pseg(d, pl, x - 11.5, Y(90), x - 11.5, Y(108), 1.2, tn.edge);
  for (const b of tubes) {
    if (b.top > b.front) pseg(d, pl, b.x0, Y(b.front), b.x1, Y(b.front), 1.2, tn.edge);
    pseg(d, pl, b.x0, Y(b.top), b.x1, Y(b.top), 1.6, tn.edge);
  }
  // the two masts, banded, each with its light
  for (const [mx, mh] of [[x - 6, 86], [x + 6, 79]]) {
    pseg(d, pl, mx, Y(108), mx, Y(108) - mh, 2.6, mixc(MAST, tn.front, 0.25), 0.9, MAST);
    for (let k = 1; k < 4; k++) pseg(d, pl, mx - 1.5, Y(108) - (mh * k) / 4, mx + 1.5, Y(108) - (mh * k) / 4, 1.1, MAST);
  }
  d.flush();
  tip(d, pl, x - 6, Y(108) - 86, t, 0.1);
  tip(d, pl, x + 6, Y(108) - 79, t, 0.6);
  d.flush();
}

export function hancock(d: Draw, pl: Plane, x: number, tn: Tone, t: number, seed = 23) {
  const H = 344, FH = H / 100, b = 40, tp = 24.5;
  if (!pl.ok || !pl.sees(x - b, -460, x + b + 10, 0)) return;
  const hw = (y: number) => (y > 0 ? b : lerp(b, tp, -y / H));
  // the short face, in shade, then the long face
  poly(d, pl, [x + b, U, x + b + 10, U, x + b + 10, 0, x + tp + 6, -H, x + tp, -H, x + b, 0], tn.side);
  poly(d, pl, [x - b, U, x + b, U, x + b, 0, x + tp, -H, x - tp, -H, x - b, 0], shade(tn.front, -H, 0));
  d.lineStyle({ square: true, blend: 'alpha' });
  // windows: a grid that narrows with the building
  const w = win(tn, seed, t, 0.1);
  for (let r = under(FH); r < 100; r++) {
    if (r >= 90 && r < 93) continue;
    const yc = -(r + 0.56) * FH, h = hw(yc) - 2.4, n = 14;
    const gw = ((2 * h) / n) * 0.55;
    const p = pl.X(x, yc);
    if (p[1] < -40 || p[1] > 1120) continue;
    for (let c = 0; c < n; c++) {
      const xc = x - h + ((c + 0.5) / n) * 2 * h;
      let col = w(c, r);
      if (r >= 94 && r <= 96) col = L('fluoro', 0.95 * tn.light);   // the observatory, lit all round
      if (col) pseg(d, pl, xc - gw / 2, yc, xc + gw / 2, yc, FH * 0.55, col);
    }
  }
  // the X-braces, five tiers of eighteen floors, the ties and the corner columns
  const st = tn.struct;
  for (let k = 0; k < 5; k++) {
    const y0 = -k * 18 * FH, y1 = -(k + 1) * 18 * FH;
    pseg(d, pl, x - hw(y0) + 1.3, y0, x + hw(y1) - 1.3, y1, 2.3, st);
    pseg(d, pl, x + hw(y0) - 1.3, y0, x - hw(y1) + 1.3, y1, 2.3, st);
    pseg(d, pl, x - hw(y1), y1, x + hw(y1), y1, 2.0, st);
  }
  pseg(d, pl, x - b + 1.2, U, x - b + 1.2, 0, 2.4, tn.edge);
  pseg(d, pl, x - b + 1.2, 0, x - tp + 1.2, -H, 2.4, tn.edge);
  pseg(d, pl, x + b - 1.1, 0, x + tp - 1.1, -H, 2.2, st);
  pseg(d, pl, x - tp, -H, x + tp, -H, 1.8, tn.edge);
  // its two masts
  for (const [mx, mh] of [[x - 9, 113], [x + 9, 104]]) {
    pseg(d, pl, mx, -H, mx, -H - mh, 3.2, mixc(MAST, tn.front, 0.3), 1.0, MAST);
    pseg(d, pl, mx - 2.2, -H - mh * 0.45, mx + 2.2, -H - mh * 0.45, 1.3, MAST);
  }
  d.flush();
  tip(d, pl, x - 9, -H - 113, t, 0.3);
  tip(d, pl, x + 9, -H - 104, t, 0.8);
  d.flush();
}

export function aon(d: Draw, pl: Plane, x: number, tn: Tone, t: number, seed = 37) {
  const H = 346, FH = H / 83, w = 29.5;
  if (!pl.ok || !pl.sees(x - w, -H - 10, x + w + 8, 0)) return;
  poly(d, pl, boxPts(x + w, -H, x + w + 8, U), tn.side);
  box(d, pl, x - w, -H, x + w, U, shade(tn.pale, -H, 0, 0.2, 0.25));
  d.lineStyle({ square: true, blend: 'alpha' });
  // narrow windows between twenty pale piers
  const g = win(tn, seed, t, 0.08);
  const dark = mixc(tn.glass, tn.side, 0.3);
  grid(d, pl, { x0: x - w, x1: x + w, yb: 0, r0: under(FH), cols: 20, rows: 79, fh: FH, gw: 0.42, gh: 0.72, at: (c, r) => (g(c, r) === tn.glass ? dark : g(c, r)) });
  const pier = mixc(tn.pale, hex('#66709f'), 0.5 * tn.light);
  for (let c = 0; c <= 20; c++) {
    const px = x - w + (c / 20) * 2 * w;
    pseg(d, pl, px, U, px, -H + 1, c === 0 ? 1.4 : 0.8, c === 0 ? tn.edge : pier);
  }
  d.flush();
  // the crown, washed in light from below
  const top = -H, band = 6 * FH;
  d.fill([boxPts(x - w, top, x + w, top + band)], { c0: withA(hex('#c9d6ff', 0.95 * tn.light), 0.05), c1: withA(hex('#c9d6ff', 0.95 * tn.light), 0.6), from: [0, top], to: [0, top + band] }, pl.m, 'add');
  d.lineStyle({ square: true, blend: 'alpha' });
  pseg(d, pl, x - w, top, x + w, top, 1.5, hex('#dfe7ff', 1.15 * tn.light));
  d.flush();
}

/** one corncob: 65 floors, the lowest 19 a spiral of parked cars, then petals of balconies */
function cob(d: Draw, pl: Plane, cx: number, tn: Tone, t: number, seed: number) {
  const r = 16, FH = 2.75, top = -65 * FH, park = -19 * FH, flats = -20 * FH, last = -61 * FH;
  // the silhouette: straight below, scalloped by the balconies above
  const edge = (y: number) => {
    if (y > flats || y < last) return r;
    const u = ((-y + flats) / FH) % 1;
    return r + 2.4 * Math.sin(Math.PI * u);
  };
  const ys: number[] = [U, 0, park, flats];
  for (let i = 0; i <= 41 * 8; i++) ys.push(flats - (i / 8) * FH);
  ys.push(last, top);
  const rev = (p: number[]) => { const o: number[] = []; for (let i = p.length - 2; i >= 0; i -= 2) o.push(p[i], p[i + 1]); return o; };
  /** the part of the round body between a and b (shares of the radius, -1 left .. 1 right) */
  const band = (a: number, b: number, c: RGBA | import('../engine/draw').Paint) => {
    const left: number[] = [], right: number[] = [];
    for (const y of ys) { const e = edge(y); left.push(cx + a * e, y); right.push(cx + b * e, y); }
    poly(d, pl, [...left, ...rev(right)], c);
  };
  // the round body: the middle, a lit flank, the flank in shade
  band(-1, 1, shade(tn.front, top, 0));
  band(-1, -0.5, shade(mixc(tn.front, tn.edge, 0.5), top, 0));
  band(0.45, 1, tn.side);
  d.lineStyle({ square: true, blend: 'alpha' });
  // floor slabs: the corncob's rows
  const slab = mixc(tn.edge, tn.pale, 0.2);
  for (let f = 20; f <= 61; f++) {
    const y = -f * FH;
    pseg(d, pl, cx - r + 0.2, y, cx + r - 0.2, y, 0.6, slab);
  }
  // flats behind the balconies
  for (let f = 20; f < 61; f++) {
    const yc = -(f + 0.55) * FH;
    for (let c = 0; c < 7; c++) {
      if (ih(seed, f * 13 + c, 9) > 0.32) continue;
      const u = ((c + 0.5) / 7) * 2 - 1;
      const xc = cx + u * r * 0.82;
      const k = ih(seed, f * 13 + c, 8);
      pseg(d, pl, xc - 1.3, yc, xc + 1.3, yc, FH * 0.48, k > 0.3 ? L('filament', (0.8 + 0.4 * k) * tn.light) : L('fluoro', 0.8 * tn.light));
    }
  }
  // the garage: ramps and the lights of a few cars
  for (let f = 1; f < 19; f++) {
    const y = -f * FH;
    pseg(d, pl, cx - r, y + 0.7, cx + r, y - 0.7, 0.6, mixc(tn.side, tn.edge, 0.45));
  }
  d.flush();
  d.dotStyle({ blend: 'add' });
  for (let k = 0; k < 9; k++) {
    const f = 1 + Math.floor(hash2(seed, k) * 17), u = hash2(k, seed * 1.3) * 2 - 1;
    const p = pl.X(cx + u * r * 0.85, -(f + 0.4) * FH);
    d.dot([p[0], p[1], 0], Math.max(0.6, 0.5 * pl.s), hash2(k * 7, seed) > 0.5 ? L('tail', 0.9 * tn.light) : L('halide', 0.8 * tn.light), 0.4);
  }
  d.flush();
  d.lineStyle({ square: true, blend: 'alpha' });
  pseg(d, pl, cx - r, top, cx + r, top, 1.4, tn.edge);
  pseg(d, pl, cx - r - 0.5, park, cx + r + 0.5, park, 1.0, tn.edge);
  d.flush();
}

export function marina(d: Draw, pl: Plane, x: number, tn: Tone, t: number, seed = 51) {
  if (!pl.ok || !pl.sees(x - 45, -190, x + 45, 0)) return;
  cob(d, pl, x - 22, tn, t, seed);
  cob(d, pl, x + 22, tn, t, seed + 5);
}

export function trump(d: Draw, pl: Plane, x: number, tn: Tone, t: number, seed = 61) {
  const steps: [number, number, number][] = [[-U, 60, 30], [60, 115, 26], [115, 200, 22], [200, 360, 18]];
  if (!pl.ok || !pl.sees(x - 30, -430, x + 38, 0)) return;
  const silver = mixc(tn.pale, tn.front, 0.35);
  for (const [y0, y1, hw] of steps) {
    poly(d, pl, boxPts(x + hw, -y1, x + hw + 7, -y0), tn.side);
    box(d, pl, x - hw, -y1, x + hw, -y0, shade(silver, -360, 0));
  }
  d.lineStyle({ square: true, blend: 'alpha' });
  const FH = 3.6;
  steps.forEach(([y0, y1, hw], i) => {
    const g = win(tn, seed + i, t, 0.1);
    const glass = mixc(tn.glass, silver, 0.25);
    grid(d, pl, { x0: x - hw, x1: x + hw, yb: -y0, cols: Math.round(hw / 2.6), rows: Math.floor((y1 - y0) / FH), fh: FH, gw: 0.72, gh: 0.6, at: (c, r) => { const k = g(c, r); return k === tn.glass ? glass : k; } });
  });
  for (const [, y1, hw] of steps) pseg(d, pl, x - hw, -y1, x + hw, -y1, 1.3, tn.edge);
  pseg(d, pl, x - 30, U, x - 30, -60, 1.0, tn.edge);
  pseg(d, pl, x, -360, x, -423, 2.4, MAST, 0.6, MAST);
  d.flush();
  tip(d, pl, x, -423, t, 0.45, 0.8);
  d.flush();
}

/** Two Prudential Plaza: a slab, then chevrons stepping up to a spire */
export function prudential(d: Draw, pl: Plane, x: number, tn: Tone, t: number, seed = 71) {
  const H = 232, w = 24;
  if (!pl.ok || !pl.sees(x - w, -310, x + w + 8, 0)) return;
  poly(d, pl, boxPts(x + w, -H, x + w + 7, U), tn.side);
  box(d, pl, x - w, -H, x + w, U, shade(tn.front, -H, 0));
  // the chevrons, each a little higher and narrower, a lit seam between them
  for (let k = 0; k < 4; k++) {
    const hw = w - k * 5.2, y = -H - k * 9;
    poly(d, pl, [x - hw, y, x + hw, y, x, y - hw * 0.62], k % 2 ? tn.front : mixc(tn.front, tn.edge, 0.25));
  }
  d.lineStyle({ square: true, blend: 'alpha' });
  for (let k = 0; k < 4; k++) {
    const hw = w - k * 5.2, y = -H - k * 9;
    pseg(d, pl, x - hw, y, x, y - hw * 0.62, 0.9, hex('#ffd9a0', 1.05 * tn.light));
    pseg(d, pl, x, y - hw * 0.62, x + hw, y, 0.9, hex('#ffd9a0', 1.05 * tn.light));
  }
  const g = win(tn, seed, t, 0.12);
  grid(d, pl, { x0: x - w, x1: x + w, yb: 0, r0: under(H / 64), cols: 16, rows: 64, fh: H / 64, at: g });
  pseg(d, pl, x, -H - 40, x, -303, 1.8, MAST, 0.5, MAST);
  d.flush();
  tip(d, pl, x, -303, t, 0.9, 0.7);
  d.flush();
}

export type Generic = { x: number; w: number; h: number; seed: number; crown?: 'flat' | 'step' | 'mast' | 'pyramid' | 'tank' | 'drum'; fh?: number; busy?: number };

/** an ordinary tower of the skyline: a face, its shaded side, a crown, its windows */
export function tower(d: Draw, pl: Plane, g: Generic, tn: Tone, t: number) {
  const { x, w, h } = g, hw = w / 2, fh = g.fh ?? 3.9;
  if (!pl.ok || !pl.sees(x - hw, -h - 60, x + hw + 10, 0)) return;
  const sd = Math.min(9, w * 0.22);
  const step = g.crown === 'step' ? Math.min(h * 0.18, 40) : 0;
  poly(d, pl, boxPts(x + hw, -h + step, x + hw + sd, U), tn.side);
  box(d, pl, x - hw, -h + step, x + hw, U, shade(tn.front, -h, 0));
  if (step) {
    poly(d, pl, boxPts(x + hw * 0.62, -h, x + hw * 0.62 + sd, -h + step), tn.side);
    box(d, pl, x - hw * 0.62, -h, x + hw * 0.62, -h + step, tn.recess);
  }
  if (g.crown === 'pyramid') poly(d, pl, [x - hw, -h, x + hw, -h, x, -h - w * 0.55], tn.recess);
  if (g.crown === 'drum') box(d, pl, x - hw * 0.55, -h - 14, x + hw * 0.55, -h, tn.recess);
  d.lineStyle({ square: true, blend: 'alpha' });
  const rows = Math.floor((h - step) / fh), cols = Math.max(2, Math.round(w / 3.4));
  const o = win(tn, g.seed, t, g.busy ?? 0.12);
  grid(d, pl, { x0: x - hw, x1: x + hw, yb: 0, r0: under(fh), cols, rows, fh, at: o });
  if (step) grid(d, pl, { x0: x - hw * 0.62, x1: x + hw * 0.62, yb: -h + step, cols: Math.max(2, Math.round(cols * 0.62)), rows: Math.floor(step / fh), fh, at: o });
  pseg(d, pl, x - hw, U, x - hw, -h + step, 0.9, tn.edge);
  pseg(d, pl, x - hw, -h + step, x + hw, -h + step, 1.2, tn.edge);
  if (g.crown === 'drum') for (let k = 0; k < 7; k++) {
    const px = x - hw * 0.45 + (k / 6) * hw * 0.9;
    pseg(d, pl, px, -h - 2, px, -h - 12, 1.1, hex('#e4ecff', 1.05 * tn.light));
  }
  if (g.crown === 'mast') pseg(d, pl, x + hw * 0.3, -h, x + hw * 0.3, -h - 40, 1.6, MAST, 0.6, MAST);
  if (g.crown === 'tank') {
    pseg(d, pl, x - hw * 0.5, -h, x - hw * 0.5, -h - 6, 0.6, tn.edge);
    pseg(d, pl, x - hw * 0.15, -h, x - hw * 0.15, -h - 6, 0.6, tn.edge);
    box(d, pl, x - hw * 0.62, -h - 13, x - hw * 0.03, -h - 6, tn.recess);
    poly(d, pl, [x - hw * 0.66, -h - 13, x + hw * 0.01, -h - 13, x - hw * 0.325, -h - 17], tn.recess);
  }
  d.flush();
  if (g.crown === 'mast') tip(d, pl, x + hw * 0.3, -h - 40, t, hash2(g.seed, 1), 0.7);
  d.flush();
}

const farCache = new Map<string, { pts: number[][]; lights: [number, number, number][] }>();

/** a low far skyline in one tone, only a few windows awake, a few of them twinkling */
export function far(d: Draw, pl: Plane, x0: number, x1: number, c: RGBA, t: number, seed = 5, hMax = 140) {
  if (!pl.ok) return;
  const key = `${x0}|${x1}|${seed}|${hMax}`;
  let g = farCache.get(key);
  if (!g) {
    let x = x0, i = 0;
    const pts: number[][] = [], lights: [number, number, number][] = [];
    while (x < x1) {
      const w = 18 + ih(seed, i, 1) * 46, h = 20 + Math.pow(ih(seed, i, 2), 1.8) * hMax;
      pts.push(boxPts(x, -h, x + w, U));
      if (ih(seed, i, 3) > 0.7) pts.push([x + w * 0.3, -h, x + w * 0.7, -h, x + w * 0.5, -h - w * 0.5]);
      const n = Math.floor(h / 6);
      for (let k = 0; k < n; k++) for (let cc = 0; cc < Math.floor(w / 5); cc++) {
        if (ih(seed + i, k * 31 + cc, 4) < 0.08) lights.push([x + 2.5 + cc * 5, -k * 6 - 3, ih(seed + i, k * 31 + cc, 6)]);
      }
      x += w + 2 + ih(seed, i, 5) * 10;
      i++;
    }
    g = { pts, lights };
    farCache.set(key, g);
  }
  d.fill(g.pts, c, pl.m);
  d.lineStyle({ square: true, blend: 'alpha' });
  for (const [lx, ly, h] of g.lights) {
    const tw = h > 0.92 ? 0.6 + 0.4 * Math.sin(t * (3 + 4 * h) + h * 40) : 1;
    pseg(d, pl, lx - 1.2, ly, lx + 1.2, ly, 3, h > 0.5 ? L('sodium', 0.4 * tw) : L('halide', 0.28 * tw));
  }
  d.flush();
}
