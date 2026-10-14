// OUTRO, "Landsailor (I'm your landsailor) / In the bed that we've made / May every nail be shown".
// The calls and their echoes: she sings, and the world answers in its own lettering.
// - The road again: LANDSAILOR painted across the lanes, and the message sign answers I'M YOUR
//   LANDSAILOR in its amber dots.
// - The bed we have made: the world's cumulative CO2, 1750-2024, laid down decade by decade as
//   strata (sedimentation motion: each layer drops and settles on the last). The sky begins to pale.
// - Every nail shown: Chicago taken apart into its layers, lifted one above another like an
//   exploded drawing (explode motion: everything apart along one axis, each layer labelled).
import { Camera } from '../engine/camera';
import { DotMesh, LineMesh } from '../engine/draw';
import { Scene, ShotFrame } from '../engine/engine';
import { RGBA, V3, chain, clamp, ease, hex, lerp, mixc, mulberry32, prog, spring, translate, withA, rotX, rotY, scale, glide } from '../engine/math';
import { Line, Score } from '../engine/score';
import { at } from '../lib/chart';
import { groundModel, lampMesh, loadCity, roadMesh } from '../lib/city';
import { matrix } from '../lib/dotmatrix';
import { drawLine, label, lamp, layLine } from '../lib/lyric';
import { L, NIGHT } from '../lib/palette';
import { drawCall } from '../lib/road_call';
import { clouds, stars } from '../lib/backdrop';
import { BedBox, StrataBed } from '../lib/strata_bed';
import { BED_D, BED_PX, BED_W, Bed, NAIL_BOX, bedHeat, bnAsh, bnCam, bnDawn, bnSky, layBeds } from '../lib/strata_sky';
import { AirOpts, RelightAir, WakeTraffic, shoreTable } from '../lib/relight_city';
import { clipSegs, lakeOnPlate, lengthKm } from '../lib/strata_plates';
import { loadWays } from '../lib/traffic';

const PX = 0.1;

/** the sky from night to the first pale light: 0 night, 1 blue hour */
export function dawnSky(k: number): RGBA {
  return mixc(hex('#020309'), hex('#2a3a5c'), clamp(k));
}

/** the same sky as a gradient over the frame: deeper above, paling toward the eastern horizon below */
export function drawDawn(d: import('../engine/draw').Draw, k: number) {
  d.setCamera(Camera.home());
  const top = mixc(hex('#020309'), hex('#1c2a48'), clamp(k));
  const low = mixc(hex('#04060e'), mixc(hex('#3c4f78'), hex('#8a7a86'), clamp((k - 0.6) / 0.4)), clamp(k));
  d.rect(-200, -200, 2320, 1480, { c0: top, c1: low, from: [0, -100], to: [0, 1180] }, null, 'alpha');
}

export class Outro1 extends Scene {
  score!: Score;
  co2cum!: [number[], number[]];
  strata!: StrataBed;
  /** the sea of cloud under the bed and the plates, at dawn */
  deck!: RelightAir;
  bedTop = 0;
  co2Total = 0;
  nStreets!: LineMesh; nMajor!: LineMesh; nRail!: LineMesh; nPower!: LineMesh; nWater!: LineMesh; nLamps!: DotMesh;
  nLake!: { poly: number[]; line: number[] };
  nKm: Record<string, number> = {};
  nCars!: WakeTraffic;
  beds: Bed[] = [];
  async init() {
    const { d } = this.ctx;
    this.score = this.ctx.data.get('score');
    this.co2cum = this.ctx.data.get('charts').co2cum.series.World;
    const city = await loadCity(this.ctx);
    this.strata = new StrataBed(this.ctx.gl, d, BED_W, BED_D);
    this.deck = new RelightAir(this.ctx.gl, d, new Float32Array(256).fill(1e6));
    const lb = layBeds(this.score, this.co2cum);
    this.beds = lb.beds; this.bedTop = lb.top; this.co2Total = lb.total;
    // the plates of the exploded city: its layers cut to the square
    const box = NAIL_BOX;
    const cs = clipSegs(city.streets, box), cm = clipSegs(city.major, box), cr = clipSegs(city.rail, box), cp = clipSegs(city.power, box), cw = clipSegs(city.water, box);
    const dist = (_a: number, _b: number, _c: number, _d: number, _cls: number, kk: number) => kk;
    this.nStreets = roadMesh(d, cs);
    this.nMajor = roadMesh(d, cm);
    this.nRail = roadMesh(d, cr, { width: [1.3, 1.7, 1.3], alpha: [1, 1, 1], key1: dist });
    this.nPower = roadMesh(d, cp, { width: [1.6, 1.1, 1.0, 1.3], alpha: [1, 0.85, 0.75, 1], key1: dist });
    this.nWater = roadMesh(d, cw, { width: [1.8, 1.5], alpha: [1, 0.9] });
    const both = new Float32Array(cm.length + cs.length); both.set(cm, 0); both.set(cs, cm.length);
    this.nLamps = lampMesh(d, both, { spacing: 95, radius: 1, jitter: 6, seed: 4 });
    this.nLake = lakeOnPlate(shoreTable(city), box);
    this.nKm = { streets: lengthKm(cs), major: lengthKm(cm), rail: lengthKm(cr), power: lengthKm(cp, [0, 1, 2]), water: lengthKm(cw, [1]) };
    const ways = this.ctx.data.get('ways') || (await loadWays());
    this.ctx.data.set('ways', ways);
    this.nCars = new WakeTraffic(ways, { classes: [0, 1, 2], density: 5, seed: 23, box });
  }

  draw(f: ShotFrame) {
    const p = f.shot.params!.part as string;
    if (p === 'call') return this.call(f);
    if (p === 'bed') return this.bed(f);
    return this.nails(f);
  }

  /** echo words spread over their span, a word at a time, in the infrastructure's own type */
  echo(l: Line, t: number) { return l.words.filter((w) => t >= w.start).length; }

  call(f: ShotFrame) {
    // the road of the first verse again at the first blue of morning (lib/road_call.ts): the sky
    // from this scene's dawn, LANDSAILOR painted across the lanes, the sign answering in amber
    return drawCall(this.ctx, this.score, f, { drawDawn });
  }

  bed(f: ShotFrame) {
    // In the bed that we've made: the world's cumulative CO2 as strata, a bed a decade, each as
    // thick as what that decade emitted (1 px = 4.2 billion tonnes). The beds fall and land with
    // their weight, hot, and cool to stone; the block hangs over a sea of cloud at the first light.
    const { d, fonts } = this.ctx;
    const t = f.t;
    const sc = this.score;
    const call = sc.line('In the bed');
    const echo = sc.lines.find((l) => l.echo && l.text.startsWith('In the bed'))!;
    const dawn = bnDawn(sc, t);
    this.ctx.clear(dawnSky(dawn));
    const beds = this.beds;
    const N = beds.length;
    // what is laid; the weight of each landing pressing the stack down, and the camera with it
    let laid = 0;
    for (const b of beds) if (t >= b.land) laid++;
    let squash = 1, jolt = 0;
    for (const b of beds) {
      const dt = t - b.land;
      if (dt <= 0 || dt > 1.5) continue;
      const w = Math.min(1, b.gt / 300);
      squash -= 0.045 * w * Math.exp(-dt * 5.5) * Math.cos(dt * 23);
      jolt += 7 * w * Math.exp(-dt * 9) * Math.sin(dt * 34);
    }
    const cam = bnCam(sc, this.bedTop, t, jolt);
    d.setCamera(cam);
    bnSky(this.deck, cam, t, dawn);
    d.setCamera(cam);

    const top = laid ? beds[laid - 1].h1 : 0;
    const heat = bedHeat(this.beds, t);
    const boxes: BedBox[] = [];
    if (laid > 0) boxes.push({ h0: 0, h1: top, foot: 0, layer: -1, scale: squash, top: laid - 1 });
    const FALL = 0.36, DROP = 220;
    beds.forEach((b, i) => {
      const u = (t - (b.land - FALL)) / FALL;
      // a bed thinner than a few px settles as a seam (its top would show as a sheet far heavier
      // than it is); the thick ones fall with their weight
      if (u < 0 || u >= 1 || b.h1 - b.h0 < 2.5) return;
      const lift = DROP * (1 - u * u);
      boxes.push({ h0: b.h0, h1: b.h1, foot: -b.h0 * squash - lift, layer: i, scale: 1, top: i });
    });
    const bounds = beds.map((b) => b.h0).concat([beds[N - 1].h1]);
    this.strata.draw(cam, boxes, { bounds, cols: beds.map((b) => b.col), heat, laid, light: [0.62, -0.45, -0.64],
      sky: withA(mixc(hex('#7d8fb8'), hex('#b4b6c8'), clamp((dawn - 0.38) / 0.3)), 0.55), sun: hex('#ffc49a', 0.95), t });

    // sparks where a bed lands, thrown out of the seam and falling away
    const W2 = BED_W / 2, D2 = BED_D / 2;
    d.dotStyle({ world: true, blend: 'add' });
    beds.forEach((b, i) => {
      const dt = t - b.land;
      if (dt <= 0 || dt > 1.1) return;
      const rnd = mulberry32(1000 + i * 17);
      const n = Math.round(3 + 39 * Math.min(1, b.gt / 300));
      const y0 = -b.h0 * squash;
      for (let j = 0; j < n; j++) {
        const side = rnd() < 0.7;
        const x = side ? (rnd() * 2 - 1) * W2 : W2;
        const z = side ? -D2 : (rnd() * 2 - 1) * D2;
        const sp = 160 + 420 * rnd(), up = 120 + 380 * rnd(), life = 0.45 + 0.6 * rnd();
        const vx = side ? (rnd() - 0.5) * 160 : sp, vz = side ? -sp : (rnd() - 0.5) * 160;
        const sz = 1.3 + 1.4 * rnd();
        if (dt > life) continue;
        const p: V3 = [x + vx * dt, y0 - up * dt + 0.5 * 1100 * dt * dt, z + vz * dt];
        const fade = 1 - dt / life;
        const hot = mixc(hex('#ffd29a', 2.6), hex('#ff5a1e', 1.2), dt / life);
        d.dot(p, sz, withA(hot, fade * fade), 0.6);
      }
    });
    d.flush();
    bnAsh(d, t);

    // the scale up the block's near edge: billions of tonnes laid since 1750
    const P = (x: number, h: number, z: number): V3 => [x, -h * squash, z];
    d.lineStyle({});
    const ruleC = withA(hex('#c9d2e6', 0.7), 0.8);
    const rx = -W2 - 40;
    d.seg(P(rx, 0, -D2), P(rx, Math.max(top, 1), -D2), 1.2, ruleC);
    for (let g = 0; g <= 1800; g += 250) {
      if (g * BED_PX > top + 0.5) break;
      d.seg(P(rx - 16, g * BED_PX, -D2), P(rx, g * BED_PX, -D2), 1.2, ruleC);
    }
    d.flush();
    const ticks: [number, number, string][] = [];
    for (let g = 250; g <= 1750; g += 250) {
      if (g * BED_PX > top + 0.5) continue;
      const [x, y] = cam.project(P(rx - 24, g * BED_PX, -D2));
      ticks.push([x, y, g.toLocaleString('en-US')]);
    }
    // the beds named beside the block: the thick ones each, the thin early ones together; right of
    // whichever right-hand edge the camera sees
    const rightOf = (h: number): [number, number] => {
      const a = cam.project(P(W2, h, -D2)), b = cam.project(P(W2, h, D2));
      return [Math.max(a[0], b[0]) + 26, a[1]];
    };
    const names: { x: number; y: number; s: string; a: number }[] = [];
    beds.forEach((b, i) => {
      if (i < 15 || t < b.land) return;
      const [x, y] = rightOf((b.h0 + b.h1) / 2);
      names.push({ x, y, s: `${b.years}  ${b.gt.toFixed(0)} Gt`, a: clamp((t - b.land) / 0.25) });
    });
    if (laid >= 15) {
      const g = beds.slice(0, 15).reduce((a, b) => a + b.gt, 0);
      const [x, y] = rightOf(beds[14].h1 / 2);
      names.push({ x, y, s: `1750–1899  ${g.toFixed(0)} Gt`, a: clamp((t - beds[14].land) / 0.25) });
    }
    d.setCamera(Camera.home());
    for (const [x, y, s] of ticks) label(d, fonts, s, x, y + 5, 13, withA(hex('#c9d2e6', 0.8), 1), { align: 'right' });
    names.sort((A, B) => B.y - A.y);
    let lastY = 1e9;
    for (const n of names) {
      const y = Math.min(n.y, lastY - 17);
      lastY = y;
      label(d, fonts, n.s, n.x, y + 5, 14, withA(hex('#dfe5f2', 0.85), n.a));
    }
    // the count: what is laid, in billions of tonnes, to the year of the last bed down
    const lastBed = laid ? beds[laid - 1] : null;
    const sum = lastBed ? beds.slice(0, laid).reduce((a, b) => a + b.gt, 0) : 0;
    const yr = lastBed ? Math.min(lastBed.dec + 9, 2024) : 1750;
    label(d, fonts, Math.round(sum).toLocaleString('en-US'), 150, 958, 54, L('filament', 1.15), { font: 'passMono', axes: { wght: 600 } });
    label(d, fonts, `BILLION TONNES OF CO₂ LAID DOWN, 1750–${yr}`, 150, 992, 17, withA(hex('#dfe5f2', 0.9), 1), { font: 'pass', axes: { wght: 600 }, tracking: 0.04 });
    label(d, fonts, 'Cumulative CO₂ emissions, a bed a decade. Data: Global Carbon Budget (2025), via Our World in Data', 150, 1020, 13, withA(hex('#aab4cc', 0.6), 1));
    // the call above, the echo answering below in the infrastructure's face
    // once both are sung they give way, in the join, to the next line in the same place
    const gone = 1 - prog(t, echo.end - 0.02, echo.end + 0.09);
    const sl = layLine(fonts, call, null, { size: 92, axes: { wdth: 110, wght: 860 }, upper: true });
    drawLine(d, sl, 150, 150, t, { light: 'led', glass: 0.7, alpha: gone });
    const el = layLine(fonts, echo, null, { font: 'pass', size: 44, axes: { wght: 600 }, upper: true, tracking: 0.06 });
    drawLine(d, el, 154, 214, t, { light: 'sodium', glass: 0.5, alpha: gone });
    return { bloom: 0.3, threshold: 0.9 };
  }

  nails(f: ShotFrame) {
    // May every nail be shown: Chicago taken apart. On the bed, a 13 x 8 km piece of the city
    // around the Loop, its layers lifted off one another as in an exploded drawing: plates of glass,
    // each glowing in the light of what it carries, called out by number, the dashed lines of the
    // drawing up their corners; the bed of strata under them all; the sea of cloud below.
    const { d, fonts } = this.ctx;
    const t = f.t;
    const sc = this.score;
    const call = sc.line('May every nail');
    const echo = sc.lines.find((l) => l.echo && l.text.startsWith('May every'))!;
    const dawn = bnDawn(sc, t);
    this.ctx.clear(dawnSky(dawn));
    const cam = bnCam(sc, this.bedTop, t);
    d.setCamera(cam);
    bnSky(this.deck, cam, t, dawn);
    d.setCamera(cam);

    // the bed under it all, as it was laid
    const beds = this.beds;
    const N = beds.length;
    this.strata.draw(cam, [{ h0: 0, h1: this.bedTop, foot: 0, layer: -1, scale: 1, top: N - 1 }], {
      bounds: beds.map((b) => b.h0).concat([beds[N - 1].h1]), cols: beds.map((b) => b.col), heat: bedHeat(this.beds, t), laid: N,
      light: [0.62, -0.45, -0.64], sky: withA(mixc(hex('#7d8fb8'), hex('#b4b6c8'), clamp((dawn - 0.38) / 0.3)), 0.55), sun: hex('#ffc49a', 0.95), t });
    bnAsh(d, t);

    // the explode: the plates lift off the bed on "May", each a moment after the one under it, and
    // open a little wider on "shown"
    const shown = sc.word('May every nail', 'shown').start;
    const NP = 6;
    const gap = (i: number) => spring(t - (call.start - 0.1 + 0.085 * i), 1.3, 0.62) * 72 + spring(t - (shown - 0.12), 1.5, 0.6) * 24;
    const ys: number[] = [];
    let y = -this.bedTop;
    for (let i = 0; i < NP; i++) { y -= gap(i); ys.push(y); }

    const W2 = BED_W / 2, D2 = BED_D / 2;
    const [bx0, by0, bx1, by1] = NAIL_BOX;
    const mx = (bx0 + bx1) / 2, my = (by0 + by1) / 2;
    const model = (yy: number) => groundModel(PX, -mx * PX, my * PX, yy);
    const km = (v: number) => `${Math.round(v).toLocaleString('en-US')} km`;
    const fwd = cam.basis().f;
    const plates: { name: string; fact: string; col: RGBA; draw: (M: Float32Array) => void }[] = [
      { name: 'LAKE AND RIVER', fact: `${km(this.nKm.water)} of river and canal`, col: hex('#62b8ff'), draw: (M) => {
        d.fill([this.nLake.poly], { c0: hex('#0d2a55', 1, 0.9), c1: hex('#123a70', 1, 0.9), from: [bx1, 0], to: [bx0, 0] }, M, 'alpha');
        d.setModel(M); d.lineStyle({ glow: 1.5 }); d.poly(this.nLake.line, 1.6, hex('#8fd0ff', 1.2)); d.flush(); d.lineStyle({}); d.setModel(null);
        d.lines(this.nWater, { model: M, color: withA(hex('#7fd0ff', 1.1), 1), wScale: 1.1 });
      } },
      { name: 'STREETS', fact: `${km(this.nKm.streets)} of side street`, col: hex('#dfe8ff'), draw: (M) => {
        d.lines(this.nStreets, { model: M, color: withA(L('halide', 1.25), 1), wScale: 1.9 });
      } },
      { name: 'STREET LAMPS', fact: 'a lamp drawn every 95 m of street', col: hex('#ffb35a'), draw: (M) => {
        d.dots(this.nLamps, { model: M, color: L('sodium', 1.3), world: true, rScale: 0.8, rClamp: [0.6, 2.2], flicker: 0.15, time: t });
      } },
      { name: 'ARTERIALS AND EXPRESSWAYS', fact: `${km(this.nKm.major)} of carriageway, and its traffic`, col: hex('#ffa53a'), draw: (M) => {
        d.lines(this.nMajor, { model: M, color: withA(L('sodium', 0.75), 1), wScale: 1.0 });
        d.setModel(M);
        this.nCars.draw(d, () => t - 150, { speed: 30, trail: 140, width: 1.5, head: L('halide', 2.2), tail: L('tail', 2.0), view: [fwd[0], -fwd[2]], clip: NAIL_BOX });
        d.setModel(null);
      } },
      { name: 'RAIL', fact: `${km(this.nKm.rail)} of track`, col: hex('#7fe8ff'), draw: (M) => {
        d.lines(this.nRail, { model: M, color: withA(hex('#7fe0ff', 1.0), 1), wScale: 1.0, pulseAt: (t * 4200) % 9000, pulseWidth: 700, pulseGain: 1.2 });
      } },
      { name: 'POWER LINES', fact: `${km(this.nKm.power)} of line, and the substations`, col: hex('#b99bff'), draw: (M) => {
        d.lines(this.nPower, { model: M, color: withA(hex('#b494ff', 1.25), 1), wScale: 1.15, pulseAt: (t * 6000) % 12000, pulseWidth: 900, pulseGain: 1.6 });
      } },
    ];
    // the plates fade in on the bed as the dissolve brings them
    const inA = clamp((t - (call.start - 0.25)) / 0.3);

    // the drawing's dashed lines up the corners, from the bed to the top plate
    const H = -this.bedTop - ys[NP - 1];
    d.lineStyle({ dash: [10, 0.5] });
    for (const [cx, cz] of [[-W2, -D2], [W2, -D2], [W2, D2], [-W2, D2]] as [number, number][]) d.seg([cx, -this.bedTop, cz], [cx, ys[NP - 1], cz], 1, withA(hex('#dfe5f2', 0.55), clamp(H / 120) * inA));
    d.flush();
    d.lineStyle({});

    // the plates, from the bottom up: a slab of dark glass with its edges lit, and on it its layer
    const TH = 8;
    plates.forEach((p, i) => {
      const yy = ys[i];
      const c = p.col;
      const glass = mixc(hex('#0b1530'), mixc(c, hex('#000000'), 0.85), 0.35);
      const side = withA(mixc(glass, c, 0.18), 0.85 * inA);
      d.rect(-W2, 0, BED_W, TH, { c0: withA(mixc(glass, c, 0.3), 0.9 * inA), c1: side, from: [0, 0], to: [0, TH] }, translate(0, yy, -D2), 'alpha');
      const sx = cam.pos[0] > 0 ? W2 : -W2;
      d.rect(-D2, 0, BED_D, TH, { c0: withA(mixc(glass, c, 0.22), 0.9 * inA), c1: side, from: [0, 0], to: [0, TH] }, chain(translate(sx, yy, 0), rotY(-Math.PI / 2)), 'alpha');
      // its face: the glass, a mile grid etched in it
      const M = model(yy);
      const ga = (i === 0 ? 0.8 : 0.34) * inA;
      d.fill([[bx0, by0, bx1, by0, bx1, by1, bx0, by1]], { c0: withA(glass, ga), c1: withA(mixc(glass, c, 0.08), ga + 0.1 * inA), from: [0, by0], to: [0, by1] }, M, 'alpha');
      d.setModel(M);
      d.lineStyle({});
      const MILE = 1609.34;
      for (let gx = Math.ceil(bx0 / MILE) * MILE; gx < bx1; gx += MILE) d.seg([gx, by0, 0], [gx, by1, 0], 1, withA(c, 0.13 * inA));
      for (let gy = Math.ceil(by0 / MILE) * MILE; gy < by1; gy += MILE) d.seg([bx0, gy, 0], [bx1, gy, 0], 1, withA(c, 0.13 * inA));
      d.flush();
      d.setModel(null);
      // its edges, catching the light
      d.lineStyle({ glow: 1.4 });
      const e = withA(mixc(c, hex('#ffffff'), 0.3), 0.95 * inA);
      const Q: V3[] = [[-W2, yy, -D2], [W2, yy, -D2], [W2, yy, D2], [-W2, yy, D2]];
      for (let j = 0; j < 4; j++) d.seg(Q[j], Q[(j + 1) % 4], 1.4, e);
      d.seg([-W2, yy + TH, -D2], [W2, yy + TH, -D2], 1, withA(e, 0.5 * inA));
      d.flush();
      d.lineStyle({});
      // what it carries, just above the glass
      if (inA > 0.02) p.draw(model(yy - 1.5));
    });

    // the callouts: from each part's near corner out to its number and name; the bed is part 1
    d.setCamera(Camera.home());
    const parts = [{ name: "THE BED WE'VE MADE", fact: `${Math.round(this.co2Total).toLocaleString('en-US')} billion tonnes of the world's CO₂`, col: hex('#e0a070'), y: -this.bedTop * 0.5 }]
      .concat(plates.map((p, i) => ({ name: p.name, fact: p.fact, col: p.col, y: ys[i] })));
    const anchors = parts.map((p, i) => {
      const a = cam.project([W2, p.y, -D2]), b = cam.project([W2, p.y, D2]);
      const q = a[0] >= b[0] ? a : b;
      return { p, i, x: q[0], y: q[1] };
    });
    let lastY = 1e9;
    const LX = 1545;
    for (const a of anchors.sort((A, B) => B.y - A.y)) {
      const on = clamp((t - (call.start + 0.1 + 0.14 * a.i)) / 0.3);
      if (on <= 0) continue;
      const ly = Math.min(a.y, lastY - 46);
      lastY = ly;
      const c = withA(mixc(a.p.col, hex('#ffffff'), 0.25), on);
      d.lineStyle({});
      d.seg([a.x + 4, a.y, 0], [a.x + 40, ly, 0], 1, withA(c, 0.8 * on));
      d.seg([a.x + 40, ly, 0], [LX - 20, ly, 0], 1, withA(c, 0.8 * on));
      d.flush();
      d.dotStyle({});
      d.dot([a.x, a.y, 0], 3, withA(a.p.col, on), 0.3);
      d.flush();
      // the number in its balloon
      const ring: number[] = [];
      for (let j = 0; j <= 40; j++) { const u = (j / 40) * Math.PI * 2; ring.push(LX + Math.cos(u) * 15, ly + Math.sin(u) * 15, 0); }
      d.poly(ring, 1.3, c);
      d.flush();
      label(d, fonts, String(a.i + 1), LX, ly + 6, 16, c, { align: 'center', axes: { wght: 600 } });
      label(d, fonts, a.p.name, LX + 26, ly + 1, 17, c, { font: 'pass', axes: { wght: 650 }, tracking: 0.05 });
      label(d, fonts, a.p.fact, LX + 26, ly + 21, 12, withA(hex('#c3cbdc', 0.75), on));
    }
    label(d, fonts, 'Chicago around the Loop, 13 × 8 km, taken apart.', 1880, 1004, 13, withA(hex('#aab4cc', 0.6), 1), { align: 'right' });
    label(d, fonts, 'Lengths as mapped in OpenStreetMap.', 1880, 1024, 13, withA(hex('#aab4cc', 0.6), 1), { align: 'right' });
    // the call above, the echo answering below in the infrastructure's face
    // (its unlit glass shows only once the bed's line, in the same place, has gone)
    const glass = prog(t, call.start - 0.04, call.start + 0.08);
    const sl = layLine(fonts, call, null, { size: 92, axes: { wdth: 110, wght: 860 }, upper: true });
    drawLine(d, sl, 150, 150, t, { light: 'led', glass: 0.7 * glass });
    const el = layLine(fonts, echo, null, { font: 'pass', size: 44, axes: { wght: 600 }, upper: true, tracking: 0.06 });
    drawLine(d, el, 154, 214, t, { light: 'sodium', glass: 0.5 * glass });
    void lamp; void rotX; void prog; void ease; void scale; void clouds; void stars;
    return { bloom: 0.3, threshold: 0.9 };
  }
}
