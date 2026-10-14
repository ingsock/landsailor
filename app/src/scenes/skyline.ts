// CHORUS 2, "Hello, worldmaker / Never deny / Build all my wildest dreams".
// The share of the world living in cities, 1700-2025 (7% to 57%), built as a skyline: a tower for
// each decade and one for the latest year, as tall as the share, a floor for each percentage
// point. Construction motion: blocks of floors dropped in on the eighth notes with the bounce of
// landing, sparks where they land, climbing cranes that ride up with each tower. WORLDMAKER is
// built the same way, slab by slab. On "Never deny" the camera rushes up the newest tower to the
// sign on its roof. Then every city of 300,000 people or more (Natural Earth) rises from the world,
// laid out as a board, as a tower as tall as its population, a million at a time, in a wave from
// west to east.
import { FillMesh } from '../engine/draw';
import { Scene, ShotFrame } from '../engine/engine';
import { RGBA, clamp, ease, hex, lerp, prog, withA, glide, mixc } from '../engine/math';
import { Score } from '../engine/score';
import { at } from '../lib/chart';
import { loadCountries, ne, Country } from '../lib/geo';
import { drawLine, label, layLine } from '../lib/lyric';
import { setRun } from '../engine/text';
import { L, NIGHT } from '../lib/palette';
import { NITE, Plane, View, aircraft, box, buildLine, cloud, crane, crescent, helicopter, ih, land, office, pseg, shade, sky, sparks, stars } from '../lib/build_style';

/** the chart's frame on its plane (px of the wide view) */
const X0 = 200, X1 = 1720, Y0 = 900, PX = 640 / 60;
const X = (y: number) => X0 + ((y - 1700) / 325) * (X1 - X0);
const Y = (p: number) => Y0 - p * PX;
const DX = X(1710) - X(1700);
/** the embankment between the city and its river */
const BANK = 24;

type Tower = { year: number; share: number; x: number; w: number; start: number; steps: number[]; floors: number[]; seed: number };

/** a tower's tone by the age it was built in: brick, then stone, then glass */
function era(year: number): RGBA {
  const brick = hex('#3a2438'), stone = hex('#2f2c50'), glass = hex('#1b2758');
  return year < 1850 ? brick : year < 1950 ? mixc(brick, stone, (year - 1850) / 100) : mixc(stone, glass, Math.min(1, (year - 1950) / 50));
}

export class Skyline extends Scene {
  score!: Score;
  urban!: [number[], number[]];
  towers: Tower[] = [];
  cities: { name: string; pop: number; x: number; y: number; label?: number }[] = [];
  countries: Country[] = [];
  /** the world board: the sea inside the projection's edge, all land in one mesh, its rim and graticule (east, north) */
  sea: FillMesh | null = null;
  land: FillMesh | null = null;
  rim: number[] = [];
  graticule: number[][] = [];
  biggest: Skyline['cities'] = [];
  async init() {
    this.score = this.ctx.data.get('score');
    this.urban = this.ctx.data.get('charts').urban.series.World;
    const c = await (await fetch('/data/geo/cities.json')).json();
    this.cities = c.map((x: any) => { const [px, py] = ne(x.lon, x.lat); return { name: x.name, pop: x.pop, x: px * 300, y: -py * 300 }; });
    this.countries = await loadCountries(this.ctx, 300);
    // the board
    const K = 300, edge: [number, number][] = [];
    for (let la = -90; la <= 90; la += 2) edge.push([180, la]);
    for (let lo = 180; lo >= -180; lo -= 3) edge.push([lo, 90]);
    for (let la = 90; la >= -90; la -= 2) edge.push([-180, la]);
    for (let lo = -180; lo <= 180; lo += 3) edge.push([lo, -90]);
    this.rim = edge.flatMap(([lo, la]) => { const [x, y] = ne(lo, la); return [x * K, y * K]; });
    this.sea = this.ctx.d.makeFill([edge.flatMap(([lo, la]) => { const [x, y] = ne(lo, la); return [x * K, -y * K]; })]);
    this.land = this.ctx.d.makeFill(this.countries.flatMap((k) => k.outline || []));
    for (let lo = -150; lo <= 180; lo += 30) { const p: number[] = []; for (let la = -90; la <= 90; la += 3) { const [x, y] = ne(lo, la); p.push(x * K, y * K); } this.graticule.push(p); }
    for (let la = -60; la <= 60; la += 30) { const p: number[] = []; for (let lo = -180; lo <= 180; lo += 3) { const [x, y] = ne(lo, la); p.push(x * K, y * K); } this.graticule.push(p); }
    // the largest, named as they top out, each label to the side where it collides least
    const side: Record<string, number> = { 'Mexico City': -1, 'Buenos Aires': -1, 'Los Angeles': -1, Delhi: -1, Mumbai: -1, Karachi: -1, Beijing: -1, 'Ōsaka': -1 };
    this.biggest = this.cities.slice(0, 14).map((k) => Object.assign(k, { label: side[k.name] ?? 1 }));
    // the towers: one for each decade 1700-2010, and the newest for 2025 (all data years)
    const sc = this.score, hw = sc.line('Hello, worldmaker');
    const years: number[] = [];
    for (let y = 1700; y <= 2010; y += 10) years.push(y);
    years.push(2025);
    const eighth = 30 / sc.audio.bpm, fb = sc.audio.firstBeat;
    this.towers = years.map((year, i) => {
      const share = at(this.urban, year)!;
      // each tower goes up in six drops on the eighth notes, the starts swept left to right
      const start = hw.start - 0.28 + i * 0.036;
      const k0 = Math.ceil((start - fb) / eighth);
      const steps: number[] = [], floors: number[] = [];
      for (let j = 1; j <= 6; j++) {
        steps.push(fb + (k0 + j - 1) * eighth);
        floors.push(j === 6 ? share : Math.round((share * j) / 6));
      }
      return { year, share, x: X(year), w: DX * (year === 2025 ? 0.7 : 0.74), start, steps, floors, seed: 100 + i };
    });
  }

  draw(f: ShotFrame) {
    return f.shot.params!.part === 'cities' ? this.world(f) : this.urbanChart(f);
  }

  urbanChart(f: ShotFrame) {
    const { d, fonts, gl } = this.ctx;
    const t = f.t;
    const sc = this.score;
    const hw = sc.line('Hello, worldmaker'), nd = sc.line('Never deny');
    this.ctx.clear(NITE.skyTop);
    // the camera: wide on the site, drifting with the work; on "Never deny" a rush up the newest
    // tower to its sign; it keeps moving right into the next shot
    const k = glide(f.p);
    const newest = this.towers[this.towers.length - 1];
    const roofX = newest.x, roofY = Y(newest.share);
    const wide: View = { x: lerp(925, 1015, k), y: lerp(565, 540, k), d: 1600 / lerp(0.95, 1.08, k) };
    const roof: View = { x: roofX - 20 + (t - 94.2) * 70, y: roofY - 40 - (t - 94.2) * 8, d: 1600 / (2.15 + (t - 94.2) * 0.14) };
    const r = ease.inOutCubic(prog(t, nd.start - 0.14, nd.words[1].start - 0.02));
    const v: View = { x: lerp(wide.x, roof.x, r), y: lerp(wide.y, roof.y, r), d: Math.exp(lerp(Math.log(wide.d), Math.log(roof.d), r)) };
    const pl = new Plane(v, 0);
    // the night: the sky, a few stars, a young moon, clouds, a helicopter's searchlight on the work
    sky(d, [[0, NITE.skyTop], [300, NITE.skyHigh], [620, NITE.skyMid], [860, NITE.skyLow], [1040, NITE.glow]]);
    const par = (q: number) => [-(v.x - 960) * q, -(v.y - 540) * q];
    stars(d, t, 110, 21, 620, par(0.02)[0], par(0.02)[1], 0.8);
    const pm = par(0.03);
    crescent(d, 1610 + pm[0], 92 + pm[1], 30, 0.45, -0.5);
    const lit = mixc(NITE.moon, NITE.skyMid, 0.86), body = mixc(NITE.skyHigh, NITE.skyMid, 0.65);
    const wind = (t - 93) * 22;
    const p1 = par(0.08), p2 = par(0.05);
    cloud(d, 1240 + wind + p1[0], 230 + p1[1], 330, 50, 4, lit, body);
    cloud(d, 300 + wind * 0.8 + p2[0], 95 + p2[1], 260, 36, 9, mixc(lit, body, 0.4), body);
    aircraft(d, lerp(-60, 1980, clamp((t - 90.4) / 6.5)), 60 + clamp((t - 90.4) / 6.5) * 30, t, 1, 1.0, 0.6);
    // a helicopter keeps pace with the work, its searchlight on the newest floors, then on the sign
    const fx = lerp(X(1720), X(2025), ease.inOutSine(clamp((t - 90.6) / 3.1)));
    const fy = Y((at(this.urban, Math.min(2025, 1700 + ((fx - X0) / (X1 - X0)) * 325)) ?? 10) * clamp((t - 90.6) / 2.4 + 0.3));
    const fp = pl.X(fx, fy);
    const ph = par(0.1);
    const hx = clamp(fp[0] + 170, 260, 1780) + ph[0] * 0.3, hy = 150 + Math.sin(t * 1.3) * 8 + ph[1];
    helicopter(d, hx, hy, t, 1.15, [fp[0] + Math.sin(t * 2.1) * 20, fp[1] + 8], mixc(NITE.side, NITE.skyHigh, 0.3));
    // the river at the city's foot
    this.river(pl, t);
    // gridlines, dashed, with their labels
    d.lineStyle({ square: true, blend: 'alpha' });
    const gridC = withA(NITE.edge, 0.55);
    for (const p of [10, 20, 30, 40, 50]) {
      for (let x = X0; x < X1 + 60; x += 14) pseg(d, pl, x, Y(p), Math.min(x + 7, X1 + 60), Y(p), 1.2 / Math.max(0.6, pl.s), gridC);
    }
    pseg(d, pl, X0 - 20, Y0, X1 + 80, Y0, 2 / pl.s, mixc(NITE.edge, NITE.glow, 0.3));
    d.flush();
    for (const p of [10, 20, 30, 40, 50]) label(d, fonts, `${p}%`, X0 - 14, Y(p) + 6, 16, NIGHT.note, { align: 'right', base: pl.m });
    for (const y of [1700, 1800, 1900, 2000]) label(d, fonts, String(y), X(y), Y0 + BANK - 6, 14, NIGHT.note, { align: 'center', base: pl.m });
    // the towers, each with its crane while it goes up
    for (const tw of this.towers) this.tower(pl, tw, t);
    // the chart's title and source
    label(d, fonts, 'Share of the population living in urban areas, World, 1700–2025', X0, 170, 26, hex('#d7deee'), { font: 'pass', axes: { wght: 650 }, base: pl.m });
    label(d, fonts, 'A tower for each decade and for 2025, a floor for each percentage point. Data: HYDE (2025), via Our World in Data', X0, 200, 14, NIGHT.noteDim, { base: pl.m });
    // HELLO, small, an LED snapping on; WORLDMAKER built floor by floor; both left behind by the rush
    const away = 1 - ease.inOutSine(clamp(r / 0.55));
    const helloS = layLine(fonts, hw, null, { size: 54, axes: { wdth: 100, wght: 700 }, upper: true });
    drawLine(d, { ...helloS, words: [helloS.words[0]] }, X0 + 20, 330, t, { light: 'led', glass: 0.7, base: pl.m, alpha: away });
    const sl = layLine(fonts, hw, null, { size: 150, axes: { wdth: 112, wght: 880 }, upper: true });
    const wm = { ...sl, words: [{ ...sl.words[1], x: 0 }] };
    buildLine(d, gl, wm, X0 + 20, 500, t, pl, { floors: 7, every: 0.034, light: 'sodium', intensity: 1.05, drop: 18, ghost: withA(NIGHT.glass, 0.5), alpha: away });
    // NEVER DENY: a sign on the roof of the newest tower
    this.sign(pl, t, roofX, roofY, nd);
    d.lineStyle({});
    return { bloom: 0.36, threshold: 0.9, knee: 0.45 };
  }

  /** how many of its drops a tower has had by t */
  stepOf(tw: Tower, t: number): number {
    let j = 0;
    while (j < 6 && t >= tw.steps[j]) j++;
    return j;
  }

  tower(pl: Plane, tw: Tower, t: number) {
    const { d } = this.ctx;
    const j = this.stepOf(tw, t);
    if (j === 0 && t < tw.start) return;
    const x0 = tw.x - tw.w / 2, x1 = tw.x + tw.w / 2, sd = tw.w * 0.2;
    const c = tw.year === 2025 ? hex('#22306a') : era(tw.year);
    const settled = j >= 1 ? (j >= 2 ? tw.floors[j - 2] : 0) : 0;
    const top = j >= 1 ? tw.floors[j - 1] : 0;
    const tl = j >= 1 ? tw.steps[j - 1] : 0;
    const lift = j >= 1 ? -(1 - Math.min(1.2, land(t - tl, 0.08))) * 26 : 0;
    // body: the settled floors, then the block just dropped in
    if (settled > 0) {
      d.fill([[x1, Y(settled), x1 + sd, Y(settled) - 3, x1 + sd, Y0, x1, Y0]], mixc(c, NITE.side, 0.65), pl.m);
      box(d, pl, x0, Y(settled), x1, Y0, shade(c, Y(tw.share), Y0, 0.12, 0.2));
    }
    if (top > settled) {
      d.fill([[x1, Y(top) + lift, x1 + sd, Y(top) + lift - 3, x1 + sd, Y(settled) + lift, x1, Y(settled) + lift]], mixc(c, NITE.side, 0.65), pl.m);
      box(d, pl, x0, Y(top) + lift, x1, Y(settled) + lift, mixc(c, NITE.edge, 0.12));
    }
    // windows: three to a floor, a floor for each point of the share
    d.lineStyle({ square: true, blend: 'alpha' });
    const busy = 0.2 + 0.3 * clamp((tw.year - 1700) / 325);
    const fresh = Math.exp(-(t - tl) / 0.16);
    const cols = 3, gw = (tw.w / cols) * 0.5;
    for (let r = 0; r < Math.ceil(top - 0.35); r++) {
      const inBlock = r >= Math.floor(settled);
      const yc = Y(r + 0.5) + (inBlock ? lift : 0);
      for (let cc = 0; cc < cols; cc++) {
        const xc = x0 + ((cc + 0.5) / cols) * tw.w;
        let col = office(tw.seed, cc, r, t, busy * 1.6, 0.9) ?? mixc(c, NITE.glass, 0.6);
        // a block just set down is lit up through, then its offices settle
        if (inBlock && j >= 1 && fresh > 0.02) col = mixc(col, L('halide', 1.35), fresh * 0.85);
        pseg(d, pl, xc - gw / 2, yc, xc + gw / 2, yc, PX * 0.48, col);
      }
    }
    // the roof's edge, lit
    if (top > 0) pseg(d, pl, x0, Y(top) + lift, x1, Y(top) + lift, 1.6 / Math.max(0.7, pl.s), mixc(NITE.edge, c, 0.2));
    d.flush();
    // sparks where the block landed
    if (j >= 1) sparks(d, pl, tw.x, Y(settled), tl + 0.08, t, tw.seed * 7 + j, 7, tw.w);
    // the climbing crane, until the tower is topped out; then it is taken down (slides away)
    const done = tw.steps[5];
    if (t < done + 0.3) {
      const gone = clamp((t - done) / 0.3);
      const foot = Y(top) + lift;
      const cc = mixc(hex('#d9a032', 0.55), NITE.skyMid, 0.15 + 0.85 * gone);
      const tall = tw.seed % 2 ? 50 : 40;
      crane(d, pl, { x: x1 - 3, y: foot - gone * 30, mast: tall, jib: 54, counter: 17, trolley: 0.5 + 0.3 * Math.sin(t * 2 + tw.seed), drop: 12 + 8 * Math.sin(t * 3 + tw.seed), c: withA(cc, 1 - gone), t, phase: tw.seed * 0.37, dir: -1 });
    }
  }

  /** NEVER DENY on a sign on the newest roof: a dark board ringed with chasing bulbs, on a truss;
   *  it goes up as the tower tops out and its letters light as sung */
  sign(pl: Plane, t: number, rx: number, ry: number, nd: ReturnType<Score['line']>) {
    const { d, fonts } = this.ctx;
    const ndl = layLine(fonts, nd, null, { size: 30, axes: { wdth: 104, wght: 860 }, upper: true });
    const up = ease.outBack(clamp((t - (nd.start - 0.42)) / 0.3), 1.7);
    if (up <= 0) return;
    const W = ndl.width + 22, sx = rx - W / 2, h = 40, legs = 16 * up;
    const bot = ry - legs, topY = bot - h * Math.min(1, up);
    const steel = mixc(NITE.edge, NITE.side, 0.3);
    // the truss: three legs and their bracing
    d.lineStyle({ square: true, blend: 'alpha' });
    const posts = [sx + 10, rx, sx + W - 10];
    for (const px of posts) pseg(d, pl, px, ry, px, bot, 2.2, steel);
    for (let i = 0; i < posts.length - 1; i++) {
      pseg(d, pl, posts[i], ry, posts[i + 1], bot, 0.9, steel);
      pseg(d, pl, posts[i + 1], ry, posts[i], bot, 0.9, steel);
    }
    d.flush();
    // the board, its rim, and the bulbs chasing round it
    box(d, pl, sx, topY, sx + W, bot, mixc(NITE.side, NITE.skyTop, 0.4));
    d.lineStyle({ square: true, blend: 'alpha' });
    pseg(d, pl, sx, topY, sx + W, topY, 1.2, steel);
    pseg(d, pl, sx, bot, sx + W, bot, 1.2, steel);
    d.flush();
    const lit = clamp((t - nd.start + 0.05) / 0.2);
    d.dotStyle({ blend: 'add' });
    const per = 2 * (W + (bot - topY)), n = Math.floor(per / 6);
    for (let i = 0; i < n; i++) {
      let s = (i / n) * per;
      let px: number, py: number;
      if (s < W) { px = sx + s; py = topY + 2.5; } else if ((s -= W) < bot - topY) { px = sx + W - 2.5; py = topY + s; }
      else if ((s -= bot - topY) < W) { px = sx + W - s; py = bot - 2.5; } else { s -= W; px = sx + 2.5; py = bot - s; }
      const on = (i + Math.floor(t * 14)) % 3 === 0 ? 1 : 0.35;
      const p = pl.X(px, py);
      d.dot([p[0], p[1], 0], Math.max(0.7, 0.9 * pl.s), L('filament', (0.25 + 1.4 * on) * lit), 0.35);
    }
    d.flush();
    drawLine(d, ndl, rx - ndl.width / 2, bot - 12 * Math.min(1, up), t, { light: 'sodium', intensity: 1.3, glass: 0.9 * clamp(up), base: pl.m });
    label(d, fonts, `${this.towers[this.towers.length - 1].share.toFixed(0)}% in 2025`, sx + W + 8, ry + 6, 12, withA(NIGHT.note, clamp(up)), { base: pl.m });
  }

  /** the river at the city's foot: the glow on the water, the towers' reflections broken by
   *  ripples, the riverwalk's lamps, and a tour boat going by */
  river(pl: Plane, t: number) {
    const { d } = this.ctx;
    box(d, pl, -2000, Y0 + BANK, 4000, Y0 + 900, { c0: mixc(NITE.glow, NITE.side, 0.5), c1: mixc(NITE.side, NITE.skyTop, 0.5), from: [0, Y0 + BANK], to: [0, Y0 + 190] });
    for (const tw of this.towers) this.reflect(pl, tw, t);
    // the embankment, where the years are cut
    box(d, pl, -2000, Y0, 4000, Y0 + BANK, mixc(NITE.side, NITE.skyTop, 0.2));
    d.lineStyle({ square: true, blend: 'alpha' });
    pseg(d, pl, -2000, Y0 + BANK, 4000, Y0 + BANK, 1.2, mixc(NITE.edge, NITE.side, 0.5));
    d.flush();
    // ripples
    d.lineStyle({ square: true, blend: 'add' });
    for (let i = 0; i < 46; i++) {
      const y = Y0 + BANK + 6 + Math.pow(ih(i, 5, 1), 1.3) * 160;
      const span = X1 - X0 + 400;
      const x = X0 - 200 + ((ih(i, 5, 2) * span + t * (8 + 16 * ih(i, 5, 3))) % span);
      pseg(d, pl, x, y, x + 16 + 50 * ih(i, 5, 4), y, 0.9, withA(NITE.edge, 0.18));
    }
    d.flush();
    // the riverwalk: lamps along the bank and their streaks on the water
    d.lineStyle({ square: true, blend: 'add' });
    for (let x = X0 - 30; x < X1 + 110; x += 34) {
      const wob = Math.sin(t * 3 + x) * 1.2;
      pseg(d, pl, x + wob, Y0 + BANK + 2, x - wob, Y0 + BANK + 36, 2.2, withA(L('sodium', 0.35), 0.5), 0.6, withA(L('sodium', 0.2), 0));
    }
    d.flush();
    d.dotStyle({ blend: 'add' });
    for (let x = X0 - 30; x < X1 + 110; x += 34) {
      const p = pl.X(x, Y0 + 2);
      d.dot([p[0], p[1], 0], Math.max(0.8, 1.0 * pl.s), L('sodium', 1.1), 0.5);
    }
    d.flush();
    // a tour boat with its string of lights, going downstream
    const bx = lerp(X0 - 160, X1 + 60, clamp((t - 90.3) / 6.2)), by = Y0 + 78;
    const hull = mixc(NITE.side, NITE.edge, 0.25);
    d.fill([[bx - 46, by - 6, bx + 50, by - 6, bx + 42, by + 3, bx - 40, by + 3]], hull, pl.m);
    box(d, pl, bx - 34, by - 13, bx + 30, by - 6, mixc(NITE.side, NITE.edge, 0.15));
    d.lineStyle({ square: true, blend: 'alpha' });
    for (let k = 0; k < 9; k++) {
      const wx = bx - 30 + k * 7;
      pseg(d, pl, wx, by - 9.5, wx + 4, by - 9.5, 3.4, L('filament', 0.95 + 0.2 * ih(k, 9, 1)));
    }
    d.flush();
    d.dotStyle({ blend: 'add' });
    for (let k = 0; k <= 12; k++) {
      const u = k / 12, px = lerp(bx - 44, bx + 48, u), py = by - 16 - Math.sin(u * Math.PI) * 5;
      const p = pl.X(px, py);
      d.dot([p[0], p[1], 0], Math.max(0.7, 0.7 * pl.s), L('filament', (k + Math.floor(t * 6)) % 2 ? 1.4 : 0.6), 0.4);
    }
    const q = pl.X(bx + 48, by - 7);
    d.dot([q[0], q[1], 0], Math.max(0.8, 0.9 * pl.s), hex('#5dff8a', 1.3), 0.5);
    d.flush();
    d.lineStyle({ square: true, blend: 'add' });
    for (let k = 0; k < 9; k++) {
      const wx = bx - 30 + k * 7 + Math.sin(t * 4 + k) * 1.2;
      pseg(d, pl, wx, by + 5, wx + 4, by + 16, 3, withA(L('filament', 0.35), 0.5));
    }
    d.flush();
  }

  /** a tower upside down in the water, faint, broken into streaks */
  reflect(pl: Plane, tw: Tower, t: number) {
    const { d } = this.ctx;
    const j = this.stepOf(tw, t);
    if (j === 0) return;
    const top = tw.floors[j - 1];
    const deep = Math.min(top, 15) * PX * 0.85;
    const c = tw.year === 2025 ? hex('#22306a') : era(tw.year);
    const x0 = tw.x - tw.w / 2, x1 = tw.x + tw.w / 2, w0 = Y0 + BANK;
    box(d, pl, x0, w0 + 1, x1, w0 + deep, { c0: withA(mixc(c, NITE.side, 0.2), 0.75), c1: withA(c, 0), from: [0, w0], to: [0, w0 + deep] });
    d.lineStyle({ square: true, blend: 'add' });
    const busy = 0.2 + 0.3 * clamp((tw.year - 1700) / 325);
    for (let r = 0; r < Math.min(Math.ceil(top - 0.35), 14); r++) {
      const y = w0 + (r + 0.5) * PX * 0.85;
      const fade = 0.5 * (1 - r / 14);
      for (let cc = 0; cc < 3; cc++) {
        const col = office(tw.seed, cc, r, t, busy * 1.6, 0.9);
        if (!col) continue;
        const xc = x0 + ((cc + 0.5) / 3) * tw.w + Math.sin(t * 3.1 + r * 1.7 + cc) * (0.6 + r * 0.12);
        pseg(d, pl, xc - 4.5, y, xc + 4.5, y, PX * 0.3, withA(col, fade));
      }
    }
    d.flush();
  }

  /** the world as a board seen from above and to the south (orthographic, dimetric): the sea, the
   *  land, a graticule; each city a tower on it as tall as its population (honest: height is
   *  linear in people), going up a million at a time in a wave from west to east, its lights
   *  pooling on the ground under it */
  world(f: ShotFrame) {
    const { d, fonts } = this.ctx;
    const t = f.t;
    const line = this.score.line('Build all my');
    this.ctx.clear(NITE.skyTop);
    // the view: it pans east with the wave and leans in; never at rest
    const g = glide(f.p);
    const S = Math.exp(lerp(Math.log(1.06), Math.log(1.32), g));
    const cmx = lerp(-210, 420, g), cmy = lerp(40, 105, g);
    const th = lerp(0.26, 0.13, g), ph = lerp(0.57, 0.5, g);
    const cosT = Math.cos(th), sinT = Math.sin(th), sinP = Math.sin(ph), cosP = Math.cos(ph);
    const CX = 960, CY = lerp(640, 700, g);
    /** map (east, north) and a height -> screen px, and the depth (far is larger) */
    const P = (mx: number, my: number, h: number): [number, number, number] => {
      const dx = mx - cmx, dy = my - cmy;
      const u = cosT * dx - sinT * dy, w = sinT * dx + cosT * dy;
      return [CX + S * u, CY - S * (w * sinP + h * cosP), w];
    };
    const M = new Float32Array(16);
    M[0] = S * cosT; M[1] = -S * sinP * sinT; M[4] = S * sinT; M[5] = S * sinP * cosT; M[10] = 1; M[15] = 1;
    M[12] = CX - S * cosT * cmx + S * sinT * cmy; M[13] = CY + S * sinP * (sinT * cmx + cosT * cmy);
    // the night behind the board: a gradient, stars, two satellites crossing
    sky(d, [[0, NITE.skyTop], [380, NITE.skyHigh], [760, NITE.skyMid], [1080, NITE.skyLow]]);
    stars(d, t, 170, 33, 760, -cmx * 0.04, 0, 0.9);
    d.dotStyle({ blend: 'add' });
    for (let i = 0; i < 2; i++) {
      const u = ((t - 95.4) * (0.07 + i * 0.03) + i * 0.4) % 1;
      d.dot([lerp(-20, 1940, u), 70 + i * 110 + u * 60, 0], 1.2, L('halide', 0.9), 0.4);
    }
    d.flush();
    // the board: its edge in shade, the sea, the graticule, the land
    const ME = new Float32Array(M); ME[13] += 22 * S;
    d.fillMesh(this.sea, mixc(NITE.side, NITE.skyTop, 0.3), ME);
    d.fillMesh(this.sea, { c0: hex('#101a44'), c1: hex('#0a1032'), from: [0, -430], to: [0, 430] }, M);
    d.lineStyle({ square: false, blend: 'alpha' });
    const gc = withA(NITE.edge, 0.22);
    for (const pl of this.graticule) {
      for (let i = 0; i + 3 < pl.length; i += 2) {
        const a = P(pl[i], pl[i + 1], 0), b = P(pl[i + 2], pl[i + 3], 0);
        d.seg([a[0], a[1], 0], [b[0], b[1], 0], 0.8, gc);
      }
    }
    for (let i = 0; i + 3 < this.rim.length; i += 2) {
      const a = P(this.rim[i], this.rim[i + 1], 0), b = P(this.rim[i + 2], this.rim[i + 3], 0);
      d.seg([a[0], a[1], 0], [b[0], b[1], 0], 1.4, mixc(NITE.edge, NITE.pale, 0.4));
    }
    d.flush();
    d.fillMesh(this.land, { c0: hex('#26305e'), c1: hex('#1c2350'), from: [0, -430], to: [0, 430] }, M);
    // the cities: a wave from west to east, a million people at a time
    const KH = 13;               // height per million people (map units)
    const RATE = 26;             // millions a second
    const A = 3.4;               // half the footprint (map units)
    type Up = { c: Skyline['cities'][number]; mx: number; my: number; h: number; w: number; land: number; done: boolean; fresh: number };
    const up: Up[] = [];
    for (const c of this.cities) {
      const mx = c.x, my = -c.y;
      const t0 = 95.46 + ((mx + 830) / 1660) * 2.3 + ih(c.pop, mx | 0, 1) * 0.08;
      if (t < t0) continue;
      const n = Math.ceil(c.pop / 1e6), built = Math.min(n, Math.floor((t - t0) * RATE) + 1);
      const tl = t0 + (built - 1) / RATE;
      const below = (built - 1) * 1e6, part = Math.min(c.pop, built * 1e6) - below;
      const h = ((below + part * Math.min(1.25, land(t - tl, 0.035))) / 1e6) * KH;
      up.push({ c, mx, my, h, w: P(mx, my, 0)[2], land: tl, done: built === n, fresh: Math.exp(-(t - tl) / 0.14) });
    }
    // the wave's front, a line of warm light sweeping east over the board
    const xf = -830 + ((t - 95.46) / 2.3) * 1660;
    if (xf > -830 && xf < 830) {
      d.lineStyle({ glow: 7, blend: 'add' });
      let prev: [number, number, number] | null = null;
      for (let la = -88; la <= 88; la += 4) {
        const [ex, ey] = ne(180, la);
        if (Math.abs(xf) > ex * 300 - 2) { prev = null; continue; }
        const p = P(xf, ey * 300, 0);
        if (prev) d.seg([prev[0], prev[1], 0], [p[0], p[1], 0], 1.6, L('sodium', 0.55));
        prev = p;
      }
      d.flush();
      d.lineStyle({});
    }
    // their light pooling on the ground
    d.dotStyle({ blend: 'add' });
    for (const u of up) {
      const p = P(u.mx, u.my, 0);
      if (p[0] < -60 || p[0] > 1980 || p[1] < -60 || p[1] > 1140) continue;
      const r = (2.5 + 2.4 * Math.sqrt(u.c.pop / 1e6)) * S;
      d.dot([p[0], p[1], 0], r, L('sodium', 0.16 + 0.25 * u.fresh), 1);
    }
    d.flush();
    // the towers, far to near: a face to the moon, a face in shade, a lit roof, windows
    up.sort((a, b) => b.w - a.w);
    const west = hex('#4a57a6'), south = hex('#161b4c'), roof = hex('#a3aeea');
    d.lineStyle({ square: true, blend: 'alpha' });
    for (const u of up) {
      const sw = P(u.mx - A, u.my - A, 0), se = P(u.mx + A, u.my - A, 0), nw = P(u.mx - A, u.my + A, 0), ne2 = P(u.mx + A, u.my + A, 0);
      const hp = u.h * cosP * S;
      if (Math.max(se[0], sw[0]) < -20 || Math.min(nw[0], sw[0]) > 1940 || sw[1] < -20 || sw[1] - hp > 1100) continue;
      // west face (to the moon), south face (in shade)
      const wx = (nw[0] + sw[0]) / 2, wb = (nw[1] + sw[1]) / 2;
      d.seg([wx, wb, 0], [wx, wb - hp, 0], Math.max(0.6, sw[0] - nw[0]) + 0.6, west);
      const sx = (sw[0] + se[0]) / 2, sb = (sw[1] + se[1]) / 2;
      d.seg([sx, sb, 0], [sx, sb - hp, 0], Math.max(0.8, se[0] - sw[0]) + 0.4, south);
      // windows on the tall ones: two columns on the south face, one on the west
      if (hp > 26 && se[0] - sw[0] > 5) {
        const rows = Math.floor((hp - 6) / 6.5);
        for (let r = 0; r < rows; r++) {
          const y = sb - 5 - r * 6.5;
          for (let k = 0; k < 2; k++) {
            const col = office(u.c.pop % 997, k, r, t, 0.35, 0.95);
            if (!col) continue;
            const xx = sw[0] + (se[0] - sw[0]) * (k === 0 ? 0.3 : 0.7);
            d.seg([xx - 1.3, y, 0], [xx + 1.3, y, 0], 2.6, col);
          }
          const cw = office(u.c.pop % 991, 3, r, t, 0.25, 0.85);
          if (cw && sw[0] - nw[0] > 2.5) d.seg([wx - 0.7, y - 1.5, 0], [wx + 0.7, y - 1.5, 0], 2.4, cw);
        }
      }
      // the roof, lit, flaring as a block lands
      const ra = [(nw[0] + sw[0]) / 2, (nw[1] + sw[1]) / 2 - hp], rb = [(se[0] + ne2[0]) / 2, (se[1] + ne2[1]) / 2 - hp];
      d.seg([ra[0], ra[1], 0], [rb[0], rb[1], 0], Math.max(1, (sw[1] - nw[1]) * 0.95), mixc(roof, L('filament', 1.6), u.fresh * 0.8));
    }
    d.flush();
    // red lights on the giants, and the names of the largest as they top out
    for (const u of up) {
      if (u.c.pop < 1.2e7) continue;
      const p = P(u.mx, u.my, u.h);
      beaconAt(d, p[0], p[1] - 2, t, u.c.pop % 7 / 7);
    }
    // each name goes to the first place beside its tower top that no larger city's name has taken
    const taken: [number, number, number, number][] = [];
    for (const c of this.biggest) {
      const u = up.find((x) => x.c === c);
      if (!u || !u.done) continue;
      const a = clamp((t - u.land - 0.05) / 0.25);
      const p = P(u.mx, u.my, u.h);
      const name = c.name.toUpperCase(), pop = `${(c.pop / 1e6).toFixed(1)} million`;
      const wd = Math.max(setRun(fonts, 'pass', name, 13, { wght: 700 }).width, setRun(fonts, 'passMono', pop, 11, { wght: 500 }).width);
      const pref = (c.label ?? 1) > 0 ? [1, -1] : [-1, 1];
      let best: [number, number] = [pref[0], 0];
      search: for (const lift of [0, 34, 68, 102]) for (const s of pref) {
        const x0 = s > 0 ? p[0] + 4 : p[0] - 4 - wd, y0 = p[1] - 50 - lift;
        if (!taken.some(([a0, b0, a1, b1]) => x0 < a1 && x0 + wd > a0 && y0 < b1 && y0 + 34 > b0)) { best = [s, lift]; break search; }
      }
      const [s, lift] = best;
      const bx = s > 0 ? p[0] + 4 : p[0] - 4 - wd;
      taken.push([bx, p[1] - 50 - lift, bx + wd, p[1] - 16 - lift]);
      d.rect(bx - 4, p[1] - 50 - lift, wd + 8, 37, withA(NITE.skyTop, 0.55 * a));
      d.lineStyle({ square: true, blend: 'alpha' });
      d.seg([p[0], p[1] - 4, 0], [p[0], p[1] - 16 - lift, 0], 1, withA(NIGHT.note, a));
      d.flush();
      label(d, fonts, name, p[0] + s * 4, p[1] - 20 - lift, 13, withA(hex('#e4e9f8'), a), { font: 'pass', axes: { wght: 700 }, align: s > 0 ? 'left' : 'right' });
      label(d, fonts, pop, p[0] + s * 4, p[1] - 36 - lift, 11, withA(NIGHT.note, a), { align: s > 0 ? 'left' : 'right' });
    }
    // the line, big
    const sl = layLine(fonts, line, null, { size: 104, axes: { wdth: 118, wght: 880 }, upper: true, maxWidth: 1720 });
    drawLine(d, sl, 960 - sl.width / 2, 990, t, { light: 'sodium', intensity: 1.15, glass: 0.75 });
    label(d, fonts, 'Every city of 300,000 people or more, a tower as tall as its population. Data: Natural Earth', 120, 1045, 14, NIGHT.noteDim);
    d.lineStyle({});
    return { bloom: 0.38, threshold: 0.88, knee: 0.45 };
  }
}

/** a red obstruction light on a tower top (screen px) */
function beaconAt(d: import('../engine/draw').Draw, x: number, y: number, t: number, ph: number) {
  const b = 0.25 + 0.75 * (((t * 0.8 + ph) % 1) < 0.35 ? 1 : 0);
  d.dotStyle({ blend: 'add' });
  d.dot([x, y, 0], 4.5, L('tail', 0.35 * b), 1);
  d.dot([x, y, 0], 1.5, L('tail', 2 * b), 0.3);
  d.flush();
}
