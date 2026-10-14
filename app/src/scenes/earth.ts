// "...at my demand" / "Lightbringer". The Earth at night from O'Hare's side: every route out of
// O'Hare arcs away at once (burst motion: launched on the beat, outward), a ring of light running
// out over the ground with them; when a route lands, its city flashes, and from then on lights run
// out along it like the flights it carries. Then the turn into the chorus: the globe's lights switch
// on country by country, in staccato, in the order of how much of each country had electricity in
// 1998 (World Bank via Our World in Data), each country's lights and towns at its own share as the
// years run on to 2024; LIGHTBRINGER lights its letters like filaments.
//
// The globe (lib/globe.ts): NASA's Black Marble read through a curve that keeps the faint lights,
// every town of 10,000 people or more as a point of light sized by its population (Natural Earth),
// stars, the air on the limb, moonlight on the sea, a faint graticule.
import { Camera } from '../engine/camera';
import { Scene, ShotFrame } from '../engine/engine';
import { V3, chain, clamp, ease, hex, lerp, prog, rotX, rotY, withA, translate, glide, hash1, fract } from '../engine/math';
import { Score } from '../engine/score';
import { at } from '../lib/chart';
import { arc, sphere } from '../lib/geo';
import { Globe } from '../lib/globe';
import { SetLine, drawLine, lamp, layLine, label, letterOn } from '../lib/lyric';
import { GlyphGeom, glyphModel } from '../engine/text';
import { L, NIGHT } from '../lib/palette';

const R = 1000;
const ORD: [number, number] = [-87.9048, 41.9786];

type Route = { to: [number, number]; city: string; pts: number[]; cum: number[]; len: number; launch: number; seed: number };

export class Earth extends Scene {
  score!: Score;
  globe!: Globe;
  routes: Route[] = [];
  elec!: Record<string, [number[], number[]]>;
  codes!: Record<string, string>;
  nameOf = new Map<string, string>();
  order: string[] = [];
  /** the latest share with electricity of each country (0..1), for the towns when every light is on */
  share = new Map<string, number>();

  async init() {
    this.score = this.ctx.data.get('score');
    this.globe = await Globe.create(this.ctx.d, R, this.ctx.data);
    const fl = await (await fetch('/data/geo/flights.json')).json();
    const line = this.score.line('All your wonders');
    // the burst: launched just before "at", a little apart
    const t0 = line.words[3].start - 0.3;
    this.routes = (fl.fromORD as any[]).map((a, i) => {
      const pts = arc(ORD, [a.lon, a.lat], R, 0.16, 72);
      const cum = [0];
      for (let j = 1; j < pts.length / 3; j++) {
        cum.push(cum[j - 1] + Math.hypot(pts[j * 3] - pts[j * 3 - 3], pts[j * 3 + 1] - pts[j * 3 - 2], pts[j * 3 + 2] - pts[j * 3 - 1]));
      }
      return { to: [a.lon, a.lat] as [number, number], city: a.city, pts, cum, len: cum[cum.length - 1], launch: t0 + (i % 12) * 0.035, seed: hash1(i * 7.13 + 0.5) };
    });
    const ch = this.ctx.data.get('charts').elec;
    this.elec = ch.series; this.codes = ch.codes;
    Object.entries(this.codes).forEach(([n, c]) => this.nameOf.set(c, n));
    // countries ordered by their share with electricity in 1998: the lit ones first
    const iso = Object.keys(this.elec).filter((n) => this.codes[n] && !this.codes[n].startsWith('OWID') && !this.codes[n].startsWith('WB_'));
    const s98 = (n: string) => at(this.elec[n], 1998) ?? at(this.elec[n], 2000) ?? 0;
    iso.sort((a, b) => s98(b) - s98(a));
    this.order = iso.map((n) => this.codes[n]);
    for (const n of iso) {
      const ys = this.elec[n][1];
      if (ys.length) this.share.set(this.codes[n], ys[ys.length - 1] / 100);
    }
  }

  draw(f: ShotFrame) {
    const part = f.shot.params!.part as string;
    return part === 'routes' ? this.routesShot(f) : this.lightShot(f);
  }

  /** a model that turns the globe so (lon, lat) faces the camera, then by extra yaw */
  face(lon: number, lat: number, yaw = 0) {
    return chain(translate(960, 540, 1400), rotX(lat * Math.PI / 180), rotY(lon * Math.PI / 180 + yaw));
  }

  /** every light on: the Black Marble as it is, the towns at their country's share with electricity */
  allOn() {
    this.globe.setLevels((iso) => [1, 0, iso ? this.share.get(iso) ?? 1 : 1]);
  }

  /** the point a fraction u of the way along a route (by length) */
  along(r: Route, u: number): V3 {
    const s = clamp(u) * r.len;
    let lo = 0, hi = r.cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (r.cum[m] <= s) lo = m; else hi = m; }
    const k = r.cum[hi] > r.cum[lo] ? (s - r.cum[lo]) / (r.cum[hi] - r.cum[lo]) : 0;
    const p = r.pts;
    return [lerp(p[lo * 3], p[hi * 3], k), lerp(p[lo * 3 + 1], p[hi * 3 + 1], k), lerp(p[lo * 3 + 2], p[hi * 3 + 2], k)];
  }

  routesShot(f: ShotFrame) {
    const { d, fonts } = this.ctx;
    const t = f.t;
    this.ctx.clear(hex('#010207'));
    const k = glide(f.p);
    // out of the board, low over Chicago, pulling back and round to the east as the routes go
    const cam = Camera.home();
    // the dolly is quickest at the start and still going at the end (and after it)
    const zk = k <= 1 ? 1.4 * k - 0.4 * k * k : 1 + 0.6 * (k - 1);
    cam.pos = [960 + lerp(-60, 40, k), 540 + lerp(70, -10, k), lerp(-300, -1650, zk)];
    cam.target = [960, 540 + lerp(-40, 30, k), 1400];
    cam.roll = lerp(-0.16, 0.06, k);
    cam.fov = 0.72;
    d.setCamera(cam);
    const M = this.face(ORD[0] + lerp(-4, 46, k), ORD[1] + lerp(4, -14, k), 0);
    this.allOn();
    const line = this.score.line('All your wonders');
    const t0 = line.words[3].start - 0.3;
    // the burst runs out over the ground from O'Hare, the lights flaring as it passes
    const wa = (t - t0) / 2.0;
    const wave = wa > 0 && wa < 1.2 ? { lon: ORD[0], lat: ORD[1], angle: ease.outQuad(clamp(wa)) * 1.9 + 0.02, width: 0.08, gain: 1.6 * (1 - clamp(wa)), glow: 0.02 * (1 - clamp(wa)), color: L('halide', 1) } : null;
    this.globe.drawAll(M, {
      globe: { time: t, seaLevel: 1, wave, grat: [0.05, 0.085, 0.2, 0.4] },
      // the sky turns a quarter as far as the globe: enough to be felt, slow enough to stay points
      stars: { time: t, rot: this.face((ORD[0] + lerp(-4, 46, k)) * 0.25, (ORD[1] + lerp(4, -14, k)) * 0.25) },
      towns: { time: t, twinkle: 0.35 },
    });
    // the routes, each grown from O'Hare in a burst
    d.setModel(M);
    d.lineStyle({ blend: 'max' });
    const heads: V3[] = [];
    const lands: [V3, number][] = [];
    for (const r of this.routes) {
      const p = clamp((t - r.launch) / 1.1);
      if (p <= 0) continue;
      const n = r.pts.length / 3;
      const grown = ease.outCubic(p);
      const m = Math.max(2, Math.ceil((n - 1) * grown) + 1);
      for (let j = 0; j + 1 < m; j++) {
        const u = j / (n - 1);
        // brighter toward the front while it is flying out; settles to a thin line
        const front = clamp(1 - (grown - u) * 3.5);
        // dimmer where they all leave O'Hare together, so the hub is a star and not a blot
        const a = lerp(0.3, 1.5, front * (1 - 0.6 * p * p)) * (0.3 + 0.7 * clamp(u / 0.14));
        d.seg([r.pts[j * 3], r.pts[j * 3 + 1], r.pts[j * 3 + 2]], [r.pts[j * 3 + 3], r.pts[j * 3 + 4], r.pts[j * 3 + 5]], 1.25, L('halide', a * 0.7));
      }
      if (p < 1) heads.push(this.along(r, grown));
      else lands.push([[r.pts[r.pts.length - 3], r.pts[r.pts.length - 2], r.pts[r.pts.length - 1]], t - (r.launch + 1.1)]);
    }
    d.flush();
    // lights running out along the routes after they land: the flights they carry
    d.lineStyle({ blend: 'add' });
    for (const r of this.routes) {
      if (t < r.launch + 0.8) continue;
      const rate = (0.55 + 0.35 * r.seed) / Math.max(0.4, r.len / 900);
      for (let q = 0; q < 2; q++) {
        const ph = (t - r.launch) * rate + r.seed + q * 0.5;
        if (ph < 1) continue;      // the first pass is the burst itself
        const u = fract(ph);
        const tail = 0.07;
        for (let s = 0; s < 6; s++) {
          const u0 = u - (tail * s) / 6, u1 = u - (tail * (s + 1)) / 6;
          if (u1 < 0) break;
          const a = (1 - s / 6) * 1.1 * Math.sin(Math.PI * clamp(u));
          d.seg(this.along(r, u0), this.along(r, u1), 1.6, L('halide', a), 1.6, L('halide', a * 0.75));
        }
      }
    }
    d.flush();
    d.lineStyle({});
    // the heads of the burst, and each city flashing as its route lands
    d.dotStyle({ blend: 'add' });
    for (const p of heads) d.dot(p, 3.2, L('halide', 2.2), 1);
    for (const [p, s] of lands) {
      if (s > 0.45) continue;
      const e = clamp(s / 0.45);
      d.dot(p, lerp(2.5, 6, ease.outCubic(e)), withA(L('halide', 1.5), (1 - e) * (1 - e)), 0.6);
    }
    // O'Hare itself, flaring on the launch
    const ord = sphere(ORD[0], ORD[1], R * 1.001);
    const fl = Math.exp(-Math.max(0, t - t0) / 0.35);
    d.dot(ord, 4 + 26 * fl, L('halide', 1.2 + 2.5 * fl), 1);
    d.flush();
    d.setModel(null);
    d.depth(false);
    // AT MY DEMAND, big, over the globe, set on the screen
    d.setCamera(Camera.home());
    const sl = layLine(fonts, line, null, { size: 150, axes: { wdth: 112, wght: 800 }, upper: true });
    // only the last three words: rebuild from them
    const part = { ...sl, words: sl.words.slice(3) };
    const w0 = part.words[0].x;
    part.words = part.words.map((w) => ({ ...w, x: w.x - w0 }));
    const width = part.words[part.words.length - 1].x + part.words[part.words.length - 1].run.width;
    drawLine(d, part, 960 - width / 2, 960, t, { light: 'led', glass: prog(t, line.words[3].start - 0.6, line.words[3].start) });
    return { bloom: 0.38, threshold: 0.85 };
  }

  /** a set line as filaments: each letter's outline a glowing wire in faint glass, catching as it
   *  is sung, so the globe is seen through the letters */
  wire(sl: SetLine, x: number, y: number, t: number) {
    const d = this.ctx.d;
    sl.words.forEach((sw, wi) => {
      const n = sw.letters;
      sw.run.glyphs.forEach((g, gi) => {
        if (!g.geo.mesh) return;
        const dt = sw.word ? t - letterOn(sw.word, gi, n) : 1;
        const k = sw.run.scale, gx = x + sw.x + g.x, gy = y + g.y;
        const hot = dt >= 0;
        const c = hot ? lamp('filament', dt, 1.7, wi * 31 + gi) : withA(NIGHT.glassHi, 0.9);
        // the bulb's glass, faintly lit by its wire
        d.fillMesh(g.geo.mesh, hot ? [c[0] * 0.1, c[1] * 0.1, c[2] * 0.1, 0.28] : withA(NIGHT.glass, 0.3), glyphModel(null, gx, gy, k), 'alpha');
        d.lineStyle({ glow: hot ? 3.5 : 0, blend: 'max' });
        for (const ct of boundary(g.geo)) {
          const pts: number[] = [];
          for (let i = 0; i < ct.length; i += 2) pts.push(gx + ct[i] * k, gy - ct[i + 1] * k, 0);
          d.poly(pts, hot ? 3.2 : 1.6, c);
        }
        d.flush();
      });
    });
    d.lineStyle({});
  }

  lightShot(f: ShotFrame) {
    const { d, fonts } = this.ctx;
    const t = f.t;
    const sc = this.score;
    this.ctx.clear(hex('#010207'));
    const lb = sc.line('Lightbringer');
    // the globe turns from the Americas to Africa and Europe while the lights come on
    const k = glide(f.p);
    const cam = Camera.home();
    cam.pos = [960 + lerp(-40, 40, k), 540 + lerp(60, -30, k), lerp(-1350, -1650, k)];
    cam.target = [960, 560, 1400];
    cam.roll = lerp(0.05, -0.04, k);
    cam.fov = 0.72;
    d.setCamera(cam);
    const lon = lerp(-62, 16, k), lat = lerp(24, 6, k);
    const M = this.face(lon, lat);
    // staccato: a group of countries snaps on with each half-beat from the downbeat, every group
    // on by the third beat; the years run on from 1998 to 2024 meanwhile
    const beat = sc.beatAt(t) - sc.beatAt(lb.start);
    const steps = Math.max(0, Math.floor(beat * 2) + 1);
    const G = 7;
    const per = Math.ceil(this.order.length / G);
    const onIdx = new Map<string, number>();
    this.order.forEach((iso, i) => onIdx.set(iso, Math.floor(i / per)));
    const year = lerp(1998, 2024, prog(t, lb.start, lb.start + 1.75, ease.inOutSine));
    this.globe.setLevels((iso) => {
      if (!iso) return 0;
      const g0 = onIdx.get(iso);
      // countries the chart has no number for are lit as they are, in white, with the last group
      const g = g0 ?? G - 1;
      if (g >= steps) return 0;
      const since = (beat * 2 - g) / 2;
      // the moment a country switches, it flickers like a tube catching
      const flick = since < 0.06 ? 0.3 : since < 0.1 ? 1 : since < 0.14 ? 0.15 : 1;
      if (g0 === undefined) return [flick, 1, flick];
      const n = this.nameOf.get(iso)!;
      const s = this.elec[n];
      const v = (at(s, year) ?? (year < s[0][0] ? s[1][0] : s[1][s[1].length - 1]) ?? 0) / 100;
      return v * flick;
    });
    this.globe.drawAll(M, {
      globe: { time: t, light: L('sodium', 1.25), grat: [0.05, 0.085, 0.2, 0.5], border: [0.07, 0.09, 0.18, 0.6] },
      stars: { time: t, rot: this.face(lon * 0.25, lat * 0.25) },
      towns: { time: t, twinkle: 0.4, gain: 1.15 },
    });
    d.depth(false);
    d.setModel(null);
    // LIGHTBRINGER, huge; each letter a filament catching
    const probe = layLine(fonts, lb, null, { size: 100, axes: { wdth: 125, wght: 640 }, upper: true, tracking: 0.035 });
    const size = (1720 / probe.width) * 100;
    const sl = layLine(fonts, lb, null, { size, axes: { wdth: 125, wght: 640 }, upper: true, tracking: 0.035 });
    d.setCamera(Camera.home());
    this.wire(sl, 960 - sl.width / 2, 540 + size * 0.36, t);
    // the chart's own label, small, top-left
    label(d, fonts, 'Share of the population with access to electricity', 120, 120, 28, withA(hex('#d7deee'), 0.9), { font: 'pass', axes: { wght: 650 } });
    label(d, fonts, `${Math.floor(year)} · each country's lights scaled by its share · World Bank via Our World in Data`, 120, 156, 16, NIGHT.note);
    return { bloom: 0.45, threshold: 0.85 };
  }
}

/** the outline a glyph is seen to have: its contours without the parts that run inside the glyph
 *  (a variable font's letters are drawn from overlapping pieces), as open polylines in font units */
const outlines = new WeakMap<GlyphGeom, Float32Array[]>();
function boundary(geo: GlyphGeom): Float32Array[] {
  const hit = outlines.get(geo);
  if (hit) return hit;
  const cs = geo.contours;
  // nonzero winding number of the glyph at (x, y)
  const wind = (x: number, y: number) => {
    let w = 0;
    for (const c of cs) {
      const n = c.length / 2;
      for (let i = 0; i < n; i++) {
        const ax = c[i * 2], ay = c[i * 2 + 1], bx = c[((i + 1) % n) * 2], by = c[((i + 1) % n) * 2 + 1];
        if (ay <= y) { if (by > y && (bx - ax) * (y - ay) - (x - ax) * (by - ay) > 0) w++; }
        else if (by <= y && (bx - ax) * (y - ay) - (x - ax) * (by - ay) < 0) w--;
      }
    }
    return w;
  };
  const eps = 3;
  const out: Float32Array[] = [];
  for (const c0 of cs) {
    // straight edges are cut into short pieces first: a stem's edge is outside above and below
    // a crossbar and inside where the crossbar meets it
    const r: number[] = [];
    const m0 = c0.length / 2;
    for (let i = 0; i < m0; i++) {
      const ax = c0[i * 2], ay = c0[i * 2 + 1], bx = c0[((i + 1) % m0) * 2], by = c0[((i + 1) % m0) * 2 + 1];
      const pieces = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 6));
      for (let q = 0; q < pieces; q++) r.push(ax + ((bx - ax) * q) / pieces, ay + ((by - ay) * q) / pieces);
    }
    const c = new Float32Array(r);
    const n = c.length / 2;
    const keep: boolean[] = [];
    for (let i = 0; i < n; i++) {
      const ax = c[i * 2], ay = c[i * 2 + 1], bx = c[((i + 1) % n) * 2], by = c[((i + 1) % n) * 2 + 1];
      const L = Math.hypot(bx - ax, by - ay) || 1;
      const mx = (ax + bx) / 2, my = (ay + by) / 2, nx = -(by - ay) / L, ny = (bx - ax) / L;
      keep.push((wind(mx + nx * eps, my + ny * eps) !== 0) !== (wind(mx - nx * eps, my - ny * eps) !== 0));
    }
    // runs of kept edges become polylines; a contour kept whole stays closed
    if (keep.every(Boolean)) {
      const a = new Float32Array(c.length + 2); a.set(c); a[c.length] = c[0]; a[c.length + 1] = c[1];
      out.push(a);
      continue;
    }
    const s0 = keep.indexOf(false);
    let run: number[] = [];
    for (let j = 1; j <= n; j++) {
      const i = (s0 + j) % n;
      if (keep[i]) {
        if (!run.length) run.push(c[i * 2], c[i * 2 + 1]);
        const e = (i + 1) % n;
        run.push(c[e * 2], c[e * 2 + 1]);
      } else if (run.length) { out.push(new Float32Array(run)); run = []; }
    }
    if (run.length) out.push(new Float32Array(run));
  }
  outlines.set(geo, out);
  return out;
}

export { sphere };
