// CHORUS 1, "Here's where I was born", and the bars after it.
// The high-voltage line comes in over Chicago at night and reaches State & Madison, the zero of the
// city's grid. On "Here's" a ring of light opens there, the way a map marks a place, and the camera
// pulls back and keeps pulling back: the street grid, the city's lights in the Black Marble, the
// Midwest, the continent, the whole lit Earth with every town and every air route on it. The ring
// runs out over the ground ahead of the camera, lighting what it passes, until on "born" it is drawn
// round the planet itself: the place is the modern Earth. (Natural Earth, NASA Black Marble 2016,
// OpenFlights, OpenStreetMap.)
// Then the chart of what being born there means: of every hundred children born in
// the world, how many die before they are five, 1800 to 2024 (43 then, 4 now). A hundred lights are
// born, a row to a beat (birth motion: each pops in with an overshoot and a halo); the ones the
// year would lose go dark, fewer each time.
import { Camera } from '../engine/camera';
import { LineMesh, DotMesh } from '../engine/draw';
import { Scene, ShotFrame } from '../engine/engine';
import { RGBA, V3, chain, clamp, ease, hex, lerp, prog, spring, withA, translate, scale, mulberry32, glide, rotX, rotY } from '../engine/math';
import { Score } from '../engine/score';
import { at, path } from '../lib/chart';
import { lampMesh, loadCity, roadMesh } from '../lib/city';
import { Globe } from '../lib/globe';
import { RouteSet } from '../lib/globe_routes';
import { drawLine, drawOnPath, label, layLine } from '../lib/lyric';
import { L, NIGHT } from '../lib/palette';
import { stars } from '../lib/backdrop';

// the 'here' world: K world units to the metre, Chicago's State & Madison at the origin, the Earth
// below it (its centre at +z, the camera above at -z), north up the screen and east to the right
const EARTH_M = 6371008.8;
const K = 0.02;
const RW = EARTH_M * K;
const CHI: [number, number] = [-87.62778, 41.88194];

export class Born extends Scene {
  score!: Score;
  roads!: LineMesh;
  lamps!: DotMesh;
  streets!: LineMesh;
  streetLamps!: DotMesh;
  water!: LineMesh;
  child!: [number[], number[]];
  globe!: Globe;
  air!: RouteSet;
  async init() {
    const { d } = this.ctx;
    this.score = this.ctx.data.get('score');
    const city = await loadCity(this.ctx);
    // each street keeps its distance from State & Madison, so the ring can light it as it passes;
    // the side streets (which OpenStreetMap was asked for only in the inner city) apart, to go first
    const dist = { key1: (_ax: number, _ay: number, _bx: number, _by: number, _c: number, k: number) => k };
    this.roads = roadMesh(d, city.major, dist);
    this.lamps = lampMesh(d, city.major, { spacing: 70, radius: 1, jitter: 5, seed: 21 });
    this.streets = roadMesh(d, city.streets, dist);
    this.streetLamps = lampMesh(d, city.streets, { spacing: 70, radius: 1, jitter: 5, seed: 22 });
    this.water = roadMesh(d, city.water, { width: [1.6, 1.0], alpha: [0.9, 0.7] });
    this.child = this.ctx.data.get('charts').child.series.World;
    this.globe = await Globe.create(d, 1000, this.ctx.data);
    const fl = await (await fetch('/data/geo/flights.json')).json();
    // the long routes only (1,200 km and more): the web between cities, not the haze inside a country
    const gc = (r: number[]) => {
      const [a, b, c, e] = r.map((x) => (x * Math.PI) / 180);
      return 6371 * Math.acos(Math.min(1, Math.sin(b) * Math.sin(e) + Math.cos(b) * Math.cos(e) * Math.cos(a - c)));
    };
    this.air = new RouteSet(d, (fl.routes as [number, number, number, number][]).filter((r) => gc(r) >= 1200), 1000, CHI, { lift: 0.05, width: 0.7, flights: 700 });
  }

  draw(f: ShotFrame) {
    return f.shot.params!.part === 'here' ? this.here(f) : this.births(f);
  }

  /** the camera's height (metres) at progress p through 'here': an exponential pull-back, quickest
   *  between "where" and "born", never at rest (it keeps rising past both ends) */
  altitude(p: number): number {
    return Math.pow(10, 3.6 + 3.7 / (1 + Math.exp(-(p - 0.42) / 0.07)) + 0.1 * p);
  }

  /** screen radius (px) of the Earth's disc, and of a ring on the ground `psi` (radians) round the
   *  point straight below, from height h (world units) */
  limbPx(h: number, F: number) { return (F * RW) / Math.sqrt((RW + h) * (RW + h) - RW * RW); }
  ringPx(psi: number, h: number, F: number) { return (F * RW * Math.sin(psi)) / (h + RW * (1 - Math.cos(psi))); }

  here(f: ShotFrame) {
    const { d, fonts } = this.ctx;
    const t = f.t;
    this.ctx.clear(hex('#010207'));
    const line = this.score.line("Here's where");
    const bw = line.words[4];
    const tHere = line.words[0].start;
    const pAt = (x: number) => (x - f.shot.start) / f.dur;
    const Hm = this.altitude(f.p), H = Hm * K;
    const L10 = Math.log10(Hm);
    const fov = 0.7, F = 540 / Math.tan(fov / 2);
    // the camera: a slant over the city, travelling east with the line, then straight down from
    // ever higher; after "born" the Earth turns under it
    const tilt = prog(t, f.shot.start - 0.35, tHere - 0.05, ease.inOutSine);
    const beta = lerp(0.92, Math.PI / 2, tilt);
    const heading = lerp(0.5, 0, tilt);
    const tx = lerp(-2600, 0, ease.outCubic(tilt)) * K, ty = lerp(900, 0, ease.outCubic(tilt)) * K;
    const back = (H * Math.cos(beta)) / Math.sin(beta);
    const cam = new Camera();
    cam.pos = [tx - Math.sin(heading) * back, ty + Math.cos(heading) * back, -H];
    cam.target = [tx, ty, 0];
    cam.roll = lerp(-0.1, 0, tilt) + 0.035 * prog(t, bw.start - 0.6, f.shot.end + 0.4, ease.inOutSine);
    cam.fov = fov;
    cam.near = H * 0.15;
    cam.far = H + RW * 3;
    d.setCamera(cam);
    // the Earth: Chicago straight below until "born", then the planet turns east under the camera
    const spin = prog(t, bw.start - 0.2, f.shot.end + 0.5, (x) => x * x * (3 - 2 * x) * 0.8 + 0.2 * x);
    const lon = lerp(CHI[0], -45, spin), lat = lerp(CHI[1], 12, spin);
    const sg = RW / 1000;
    const Mg = chain(translate(0, 0, RW), scale(sg, sg, sg), rotX((lat * Math.PI) / 180), rotY((lon * Math.PI) / 180));
    // the ring: opens on "Here's" round State & Madison, runs out over the ground faster than the
    // camera rises, reaches the edge of the Earth on "born", and is then drawn round the planet
    const limb = this.limbPx(H, F);
    const hB = this.altitude(pAt(bw.start)) * K;
    const limbB = this.limbPx(hB, F);
    const open = clamp((t - tHere + 0.05) / 0.35);
    let rRing = 0, psi = 0;
    if (t >= tHere - 0.05) {
      if (t < bw.start) {
        const g = prog(t, tHere + 0.2, bw.start, (x) => 1 - Math.pow(1 - x, 1.6));
        rRing = Math.min(lerp(200, limbB, g) * ease.outBack(open, 1.3), limb * 0.999);
        // the angle on the ground that is drawn at that radius
        let lo = 0, hi = Math.acos(RW / (RW + H));
        for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (this.ringPx(m, H, F) < rRing) lo = m; else hi = m; }
        psi = lo;
      } else {
        rRing = limb * lerp(1, 1.12, prog(t, bw.start, bw.start + 0.7, ease.outCubic));
        const pl = Math.acos(RW / (RW + H));
        psi = lerp(pl, Math.PI, prog(t, bw.start, bw.start + 1.2, ease.inOutSine));
      }
    }
    const wave = psi > 0 ? { lon: CHI[0], lat: CHI[1], angle: psi, width: clamp(psi * 0.12, 2e-5, 0.04), gain: 1.5, glow: 0.018 * prog(L10, 5.6, 6.4), color: L('halide', 1) } : null;
    // what is seen at each height: the street grid; then the Black Marble (seen close, each of its
    // 3 km pixels a point of light) and the towns; then the routes, and the whole lit Earth
    const cityA = 1 - prog(L10, 5.3, 5.8);
    const marble = 0.4 * prog(L10, 4.9, 5.4) + 0.6 * prog(L10, 5.7, 6.3);
    const townA = prog(L10, 4.45, 5.1);
    this.globe.setLevels(() => 1);
    const lift = 1 + 0.5 * prog(t, f.shot.end - 0.35, f.shot.end + 0.3);
    this.globe.drawAll(Mg, {
      globe: { time: t, fade: marble * lift, seaLevel: 1, wave, curve: [0.03, 1.0, 0.85, 0.2 + 0.6 * prog(L10, 5.9, 6.6)], grat: [0.05, 0.085, 0.2, 0.3 * prog(L10, 5.8, 6.6)], spill: 0.06 },
      stars: { time: t, gain: prog(L10, 5.5, 6.6), rot: chain(rotX((lat * Math.PI) / 720), rotY((lon * Math.PI) / 720)) },
      towns: { time: t, gain: 1.1 * townA * lift, twinkle: 0.45, wave },
    });
    // the world's air routes, lit by the ring as it passes over them
    if (psi > 0 && L10 > 5.2) {
      // fainter as the Earth gets smaller and more of them share each pixel
      const a = 0.03 * prog(L10, 5.2, 6.2) * clamp(limb / 1500, 0.35, 1);
      this.air.draw(Mg, {
        // on inside the ring, off beyond it; brightest at its front
        reveal: psi - Math.min(0.25, psi * 0.3), soft: Math.min(0.25, psi * 0.3), color: [a * 0.9, a * 0.95, a * 1.15, 1],
        pulseAt: psi - 0.01, pulseWidth: 0.018, pulseGain: 2.5, cull: [0, 0, RW, RW * 1.25],
      });
      this.air.drawFlights(Mg, t, { reveal: psi, color: L('halide', 0.8 * prog(L10, 5.6, 6.4)), size: 1.1, trail: 0.05 });
    }
    d.depth(false);
    // the city: its streets, its lamps, the lake shore and the river, the line that brings the power
    if (cityA > 0.002) {
      const Mc = scale(K, K, K);
      const ringM = psi * EARTH_M;
      const sideA = cityA * (1 - prog(L10, 4.3, 4.75));
      const pulse = { pulseAt: psi > 0 ? ringM : -1e9, pulseWidth: Math.max(60, ringM * 0.15), pulseGain: 2.2 * (1 - prog(L10, 4.3, 4.6)) };
      // the map's edge is where the data stops, not where the city does: from high up it is drawn
      // as a disc that closes in on the Loop, so no edge of it is seen
      const shrink = prog(L10, 4.35, 5.4);
      const edge = { reveal: lerp(16000, 3500, shrink), soft: lerp(10000, 6000, shrink) };
      if (sideA > 0.002) d.lines(this.streets, { model: Mc, color: withA(L('sodium', 0.4), sideA), ...pulse, ...edge });
      d.lines(this.roads, { model: Mc, color: withA(L('sodium', 0.4), cityA), ...pulse, ...edge });
      d.lines(this.water, { model: Mc, color: withA(L('halide', 0.3), cityA), ...edge });
      if (sideA > 0.002) d.dots(this.streetLamps, { model: Mc, color: withA(L('sodium', 1.2), sideA), world: true, rScale: 7 * K, rClamp: [0.6, 3.2], ...edge });
      d.dots(this.lamps, { model: Mc, color: withA(L('sodium', 1.2), cityA), world: true, rScale: 7 * K, rClamp: [0.6, 3.2], ...edge });
      // the high-voltage line, from the west, and the current running in along it
      d.setModel(Mc);
      d.lineStyle({ glow: 2.5 });
      const W0: V3 = [-70000, 2600, -30], W1: V3 = [0, 0, -30];
      d.seg(W0, W1, 3, withA(L('sodium', 1.7), cityA));
      d.flush();
      d.lineStyle({});
      d.dotStyle({ blend: 'add' });
      const run = prog(t, f.shot.start - 0.45, tHere - 0.2, ease.inQuad);
      if (run > 0 && run < 1) d.dot([lerp(W0[0], W1[0], run), lerp(W0[1], W1[1], run), -30], 9, L('halide', 2.4 * cityA), 1);
      const hit = t > tHere - 0.2 ? Math.exp(-(t - (tHere - 0.2)) / 0.3) : 0;
      if (hit > 0.01) d.dot([0, 0, -30], 8 + 26 * hit, L('halide', 2.0 * hit * cityA), 1);
      d.flush();
      d.setModel(null);
    }
    // on the screen: the ring, the line round its top, and *born*
    const centre = cam.project([0, 0, t < bw.start ? 0 : RW]);
    d.setCamera(Camera.home());
    if (rRing > 1) {
      const pts: number[] = [];
      for (let i = 0; i <= 160; i++) { const a = (i / 160) * Math.PI * 2; pts.push(centre[0] + Math.cos(a) * rRing, centre[1] + Math.sin(a) * rRing, 0); }
      d.lineStyle({ glow: 3 });
      d.poly(pts, 2.2, withA(L('halide', 1.5), clamp(open * 1.5)));
      d.flush();
      d.lineStyle({});
    }
    const sl = layLine(fonts, line, null, { size: 54, axes: { wdth: 112, wght: 780 }, upper: true, tracking: 0.02 });
    const head = { ...sl, words: sl.words.slice(0, 4) };
    const hw = head.words[3].x + head.words[3].run.width;
    const rr = Math.max(rRing, 220) + 20;
    const along = (s: number): [number, number, number] => {
      const a = (s - hw / 2) / rr;
      return [centre[0] + Math.sin(a) * rr, centre[1] - Math.cos(a) * rr, a];
    };
    drawOnPath(d, head, along, 0, t, { light: 'led', glass: 0.85 * prog(t, tHere - 0.5, tHere), alpha: 1 });
    const born = layLine(fonts, null, 'born', { font: 'serifItalic', size: 210, axes: {} });
    born.words[0].word = bw;
    drawLine(d, born, 960 - born.width / 2, centre[1] + Math.min(rRing, 600) * 0.62 + 40, t, { light: 'filament', intensity: 1.25, glass: prog(t, bw.start - 0.6, bw.start) });
    return { bloom: 0.4, threshold: 0.88 };
  }

  births(f: ShotFrame) {
    const { d, fonts } = this.ctx;
    const t = f.t;
    const sc = this.score;
    this.ctx.clear(hex('#020308'));
    // still among the stars the Earth was seen in: the hundred lights are born as new ones
    stars(d, t, { seed: 27, n: 240, alpha: 0.55 });
    const [t0, t1] = (f.shot.params!.span as [number, number]) || [f.shot.start, f.shot.end];
    const view = (f.shot.params!.view as number) || 0;
    // the years run 1800 -> 2024 across both shots; each beat a row of ten is born
    const yr = Math.round(lerp(1800, 2024, ease.inOutSine(prog(t, t0 + 0.2, t1 - 0.5))));
    const rate = (at(this.child, yr) ?? 43) / 100;
    const cam = Camera.home();
    const k = glide(f.p);
    if (view === 0) {
      // close on the hundred lights as they are born, their count above them
      cam.pos = [lerp(440, 520, k), lerp(430, 470, k), lerp(-1050, -1150, k)];
      cam.target = [lerp(470, 500, k), 470, 0];
      cam.roll = lerp(-0.04, 0.02, k);
    } else {
      cam.pos = [960 + lerp(-80, 80, k), 540, lerp(-1500, -1650, k)];
      cam.target = [960, 540, 0];
    }
    d.setCamera(cam);
    // the grid of a hundred
    const GX = 230, GY = 270, step = 54;
    const beat0 = sc.beatAt(t0);
    const beats = sc.beatAt(t) - beat0;
    const rnd = mulberry32(17);
    // which of the hundred this year loses: the first `lost` in a fixed shuffled order
    const order = Array.from({ length: 100 }, (_, i) => i).sort(() => rnd() - 0.5);
    const rank = new Array(100);
    order.forEach((v, i) => (rank[v] = i));
    const lost = Math.round(rate * 100);
    d.dotStyle({ blend: 'add' });
    for (let i = 0; i < 100; i++) {
      const row = Math.floor(i / 10), col = i % 10;
      const bornAt = row * 0.5 + col * 0.04;     // half a beat per row
      const age = (beats - bornAt) * (60 / sc.audio.bpm);
      if (age < 0) continue;
      const pop = spring(age, 3.2, 0.35);
      const x = GX + col * step, y = GY + row * step;
      const dies = rank[i] < lost;
      const fade = dies ? clamp((age - 0.35) / 0.4) : 0;
      const c: RGBA = dies ? withA(L('filament', 1.4), 1 - 0.85 * fade) : L('filament', 1.4);
      d.dot([x, y, 0], 14 * pop, c, 0.25);
      if (age < 0.4) d.dot([x, y, 0], 30 * (age / 0.4), withA(L('filament', 0.6), 1 - age / 0.4), 1);
    }
    d.flush();
    label(d, fonts, `${100 - lost} OF 100 LIVE TO FIVE`, GX - 14, GY - 70, 30, L('halide', 1.0), { font: 'passMono', axes: { wght: 600 } });
    label(d, fonts, String(yr), GX + 9 * step + 14, GY - 70, 30, NIGHT.note, { align: 'right' });
    // beside it, the chart: child mortality falling from 43% to 4%, drawn as the years pass; the
    // close view is only the lights, and the cut to the wide one finds the chart beside them
    if (view === 0) return { bloom: 0.3, threshold: 0.95 };
    const X0 = 980, X1 = 1760, Y0 = 790, Y1 = 290;
    const X = (y: number) => X0 + ((y - 1800) / (2024 - 1800)) * (X1 - X0);
    const Y = (v: number) => Y0 + (v / 50) * (Y1 - Y0);
    d.lineStyle({ dash: [6, 0.5] });
    for (const v of [10, 20, 30, 40]) d.seg([X0, Y(v), 0], [X1, Y(v), 0], 1, NIGHT.hair);
    d.flush();
    d.lineStyle({});
    for (const v of [10, 20, 30, 40]) label(d, fonts, `${v}%`, X0 - 10, Y(v) + 5, 15, NIGHT.note, { align: 'right' });
    for (const y of [1800, 1900, 2000]) label(d, fonts, String(y), X(y), Y0 + 32, 15, NIGHT.note, { align: 'center' });
    const pts = path(this.child, X as any, Y as any, yr);
    d.lineStyle({ glow: 2 });
    d.poly(pts, 3, L('filament', 1.3));
    d.flush();
    d.lineStyle({});
    label(d, fonts, 'Child mortality: share of children who die before their fifth birthday', X0 - 60, Y1 - 60, 22, hex('#d7deee'), { font: 'pass', axes: { wght: 650 } });
    label(d, fonts, 'World, 1800–2024. Data: Gapminder; UN IGME, via Our World in Data', X0 - 60, Y1 - 32, 14, NIGHT.noteDim);
    return { bloom: 0.3, threshold: 0.95 };
  }
}
