// BRIDGE. The storm has taken the power. The voice goes on without words, and the film asks what the
// light was for by taking it away, one wordless phrase at a time:
// - the grid fails: a fault runs out along Chicago's power lines (OpenStreetMap) from a substation,
//   sparking along each line it kills, and the city's lamps go out behind it, street by street;
// - fire comes back: candles appear in the dark windows, and above the roofs the world's energy runs
//   back from 2025 to 1800, when 98% of it was burned wood, straw and dung;
// - a hundred candles: the hundred children of the births, now in candle light, and the years run
//   back to 1800, when 43 of them did not live to five; a candle goes out for each;
// - the stars come back: the clouds part over the dark city and the Milky Way is there, the sky of
//   1800, which our light now hides from a third of humanity;
// - the storm closes in again, lit from inside, lower and lower over the streets, until the strike
//   (the next scene, 'lines').
import { Camera } from '../engine/camera';
import { DotMesh, LineMesh } from '../engine/draw';
import { Scene, ShotFrame } from '../engine/engine';
import { RGBA, V3, clamp, ease, hex, lerp, mixc, mulberry32, prog, withA, fract, glide, hash2, invLerp, smooth } from '../engine/math';
import { Score } from '../engine/score';
import { at, path } from '../lib/chart';
import { CityData, groundModel, loadCity, roadMesh } from '../lib/city';
import { label } from '../lib/lyric';
import { L, NIGHT } from '../lib/palette';
import { Flash, StormSky } from '../lib/storm_sky';
import { Rain } from '../lib/rain';
import { Loop3D, sharedLoop } from '../lib/loop3d';
import { Way, drawTraffic, loadWays } from '../lib/traffic';

const PX = 0.1;
const FIRE: RGBA = hex('#ff9a48', 1);
const CANDLE: RGBA = hex('#ff9a48', 1.15);
const GHOST: RGBA = hex('#7fe0ff', 1);

type Ev = { t: number; x: number; y: number; r: number; k: number };

export class Bridge extends Scene {
  score!: Score;
  charts: any;
  city!: CityData;
  streets!: LineMesh;
  water!: LineMesh;
  litStreets!: LineMesh;
  lamps!: DotMesh;
  powerLive!: LineMesh;
  powerDead!: LineMesh;
  candles!: DotMesh;
  ways!: Way[];
  sky!: StormSky;
  rainFx!: Rain;
  loop!: Loop3D;
  origin: [number, number] = [0, 0];
  maxD = 60000;
  flashes: Ev[] = [];
  phrases: [number, number][] = [];

  async init() {
    const { d, gl } = this.ctx;
    this.score = this.ctx.data.get('score');
    this.charts = this.ctx.data.get('charts');
    const city = (this.city = await loadCity(this.ctx));
    this.ways = this.ctx.data.get('ways') || (await loadWays());
    this.ctx.data.set('ways', this.ways);
    this.sky = new StormSky(gl, d);
    this.rainFx = new Rain(gl, d);
    this.loop = await sharedLoop(this.ctx);
    // the fault starts at the substation nearest the Loop's west side
    let best = 1e12;
    const P = city.power;
    for (let i = 0; i < P.length; i += 6) {
      if (P[i + 4] !== 3) continue;
      const x = (P[i] + P[i + 2]) / 2, y = (P[i + 1] + P[i + 3]) / 2;
      const dd = Math.hypot(x + 2600, y - 600);
      if (dd < best) { best = dd; this.origin = [x, y]; }
    }
    const [ox, oy] = this.origin, maxD = this.maxD;
    // how far the fault has to run to reach a place: its distance from the substation, bent by a slow
    // noise so the front is ragged, as a cascade through a network is, and not a circle
    const vn2 = (x: number, y: number) => {
      const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), e = hash2(xi + 1, yi + 1);
      return lerp(lerp(a, b, sx), lerp(c, e, sx), sy);
    };
    const reach = (x: number, y: number) => Math.hypot(x - ox, y - oy) * (0.75 + 0.5 * vn2(x / 2600 + 7, y / 2600 + 3)) + 900 * vn2(x / 700, y / 700);
    const dist = (ax: number, ay: number, bx: number, by: number) => reach((ax + bx) / 2, (ay + by) / 2);
    const all = new Float32Array(city.major.length + city.streets.length);
    all.set(city.major, 0); all.set(city.streets, city.major.length);
    this.streets = roadMesh(d, all);
    this.water = roadMesh(d, city.water, { width: [1.8, 1.2], alpha: [1, 0.8] });
    // what goes out: lamps and lit streets keyed by how far they lie beyond the fault's front
    this.litStreets = roadMesh(d, city.major, { classes: [0, 1, 2, 3, 4], key: (ax, ay, bx, by) => maxD - dist(ax, ay, bx, by) });
    this.powerLive = roadMesh(d, P, { width: [2.2, 1.4, 1.2, 1.6], alpha: [1, 0.85, 0.7, 1], key: (ax, ay, bx, by) => maxD - dist(ax, ay, bx, by) });
    this.powerDead = roadMesh(d, P, { width: [2.2, 1.4, 1.2, 1.6], alpha: [1, 0.85, 0.7, 1], key: (ax, ay, bx, by) => dist(ax, ay, bx, by) });
    const rnd = mulberry32(41);
    const lamps: number[] = [], candles: number[] = [];
    for (let i = 0; i < all.length; i += 6) {
      const ax = all[i], ay = all[i + 1], bx = all[i + 2], by = all[i + 3], cls = all[i + 4];
      const len = Math.hypot(bx - ax, by - ay);
      if (len < 1) continue;
      const ux = (bx - ax) / len, uy = (by - ay) / len;
      // street lamps every 85 m
      for (let s = rnd() * 85; s < len; s += 85) {
        const x = ax + ux * s, y = ay + uy * s;
        lamps.push(x, y, 0, 1, 1, 1, 1, cls <= 2 ? 1.25 : 1.0, 0.55, maxD - reach(x, y), rnd());
      }
      // candles: in the windows of the houses along the side streets, a few to a block
      if (cls >= 5) for (let s = rnd() * 40; s < len; s += 40) {
        if (rnd() > 0.34) continue;
        const side = rnd() < 0.5 ? -1 : 1, off = 9 + rnd() * 14;
        const x = ax + ux * s - uy * off * side, y = ay + uy * s + ux * off * side;
        candles.push(x, y, 0, 1, 1, 1, 1, 0.35 + rnd() * 0.2, 0.8, rnd() * 1000, rnd()); // a lit window, a few metres of glow
      }
    }
    this.lamps = d.makeDots(new Float32Array(lamps));
    this.candles = d.makeDots(new Float32Array(candles));
    // the voice's wordless phrases, those closer than half a second taken as one
    for (const [a, b] of this.score.vocalise) {
      const last = this.phrases[this.phrases.length - 1];
      if (last && a - last[1] < 0.5) last[1] = b; else this.phrases.push([a, b]);
    }
    // lightning inside the clouds: strokes in pairs, rarer at first, more and nearer toward the hit
    const hit = this.score.barTime(65);
    const r2 = mulberry32(77);
    for (let t = this.score.barTime(55); t < hit - 0.15;) {
      const k = clamp((t - (hit - 22)) / 22);
      this.flashes.push({ t, x: 150 + r2() * 1620, y: 90 + r2() * 300, r: 220 + r2() * 260, k: 0.12 + 0.3 * k * k + 0.08 * r2() });
      t += lerp(1.9, 0.75, k) * (0.6 + 0.8 * r2());
    }
  }

  /** the light of the clouds' lightning at t, as the sky shader's flashes */
  cloudFlashes(t: number, gain = 1, hz = 540): Flash[] {
    const out: Flash[] = [];
    for (const e of this.flashes) {
      const dt = t - e.t;
      if (dt < 0 || dt > 0.6) continue;
      // two strokes, the second a little brighter
      const s = Math.exp(-dt / 0.05) * 0.8 + (dt > 0.07 ? Math.exp(-(dt - 0.07) / 0.07) : 0);
      out.push([e.x, hz - e.y, e.r, e.k * s * gain]);
      if (out.length === 4) break;
    }
    return out;
  }

  draw(f: ShotFrame) {
    const view = (f.shot.params?.view as number) ?? 0;
    if (view === 2) return this.candleRoom(f);
    return this.city3(f, view);
  }

  /** forked bolts in the distance, from the cloud base to the horizon, on the strongest flashes:
   *  a jagged channel with a few thinner branches, seen for the stroke's tenth of a second */
  bolts(t: number, hz: number, gain: number, min = 0.22) {
    const { d } = this.ctx;
    d.setCamera(Camera.home());
    d.lineStyle({ glow: 5, blend: 'add' });
    for (const e of this.flashes) {
      const dt = t - e.t;
      if (dt < 0 || dt > 0.16 || e.k < min) continue;
      const s = (dt < 0.03 ? 1 : Math.exp(-(dt - 0.03) / 0.03)) + (dt > 0.07 && dt < 0.12 ? 0.6 : 0);
      const rnd = mulberry32(Math.floor(e.t * 1000));
      const top = hz - e.y, len = Math.max(40, hz - top + 4);
      const n = 16;
      const main: number[] = [];
      let x = e.x;
      for (let i = 0; i <= n; i++) {
        main.push(x, top + (len * i) / n, 0);
        x += (rnd() - 0.5) * (len / n) * 1.3;
      }
      const c = withA(L('lightning', 2.4 * s * gain), 1);
      d.poly(main, 2.2, c);
      // branches from the upper half, going down and away
      for (let b = 0; b < 3; b++) {
        const i0 = 2 + Math.floor(rnd() * (n / 2));
        let bx = main[i0 * 3], by = main[i0 * 3 + 1];
        const dir = rnd() < 0.5 ? -1 : 1;
        const br: number[] = [bx, by, 0];
        for (let k = 0; k < 6; k++) {
          bx += dir * (6 + rnd() * 16); by += 8 + rnd() * 14;
          br.push(bx, by, 0);
        }
        d.poly(br, 1.1, withA(L('lightning', 1.2 * s * gain), 1));
      }
    }
    d.flush();
    d.lineStyle({});
  }

  // ------------------------------------------------------------------ the city, the sky, the storm
  city3(f: ShotFrame, view: number) {
    const { d, fonts } = this.ctx;
    const t = f.t;
    const sc = this.score;
    const g = glide(f.p);
    this.ctx.clear(hex('#010103'));
    const [ox, oy] = this.origin;
    const OW: V3 = [ox * PX, 0, -oy * PX];
    let cam: Camera;
    let cover = 0.92, stars = 0, flashGain = 1, rainA = 0.6, rainN = 320;
    // a camera at pos looking along yaw (0 north, pi/2 east), pitch down (> 0) or up (< 0)
    const look = (pos: V3, yaw: number, pitch: number) => {
      const c = new Camera();
      c.pos = pos;
      c.target = [pos[0] + Math.sin(yaw) * Math.cos(pitch) * 100, pos[1] + Math.sin(pitch) * 100, pos[2] + Math.cos(yaw) * Math.cos(pitch) * 100];
      return c;
    };
    if (view === 0) {
      // over the substation where it starts, the fault running out from it
      cam = Camera.orbit([OW[0] + lerp(-60, 80, g), 0, OW[2] + lerp(40, 160, g)], lerp(1700, 2300, g), lerp(0.45, 0.2, g), 0.92);
      flashGain = 0.6; rainA = 0.35;
    } else if (view === 1) {
      // low over the dark west side toward the Loop, under the clouds
      cam = look([lerp(-560, -430, g), -42, lerp(-40, 0, g)], 1.47 + 0.05 * g, 0.07);
      rainA = 0.55;
    } else if (view === 3) {
      // west of the Loop, looking east past its towers: the clouds part and the sky of 1800 is there
      const p3 = this.phrases[2] || [f.shot.start + 0.3, f.shot.end - 1];
      const open = smooth(invLerp(p3[0] - 1.2, p3[0] + 0.8, t)) * (1 - smooth(invLerp(f.shot.end - 1.0, f.shot.end + 0.6, t)));
      // as the clouds part, the camera looks up into the sky that is there again
      // (far enough back that the towers are a skyline under the sky, Willis its spire)
      cam = look([lerp(-470, -440, g), -26, lerp(-18, 6, g)], 1.55 + lerp(-0.06, 0.05, g), lerp(-0.05, -0.17, ease.inOutSine(open)) - 0.02 * g);
      cover = lerp(0.92, 0.12, open);
      stars = open;
      flashGain = 0.25 + 0.75 * (1 - open);
      rainA = 0.5 * (1 - open);
    } else if (view === 4) {
      // the storm closes in: high over the city again, pushing in under the clouds, which come
      // lower and are lit from inside, more and more often
      cam = look([lerp(-760, -480, g), lerp(-130, -80, g), lerp(-280, -170, g)], 1.22 + 0.2 * g, lerp(0.15, 0.1, g));
      cover = 1.0; flashGain = 1.25; rainA = 0.8; rainN = 420;
    } else {
      // the bar before the strike: low over the dark streets, sliding toward the Loop
      cam = Camera.orbit([-900 + f.lt * 160, 0, -200 + f.lt * 80], 520, 2.2 + f.lt * 0.03, 0.22);
      cover = 1.0; flashGain = 1.5; rainA = 0.9; rainN = 460;
    }
    cam.near = 1;
    const G = groundModel(PX, 0, 0, 0);
    // the sky first, then the towers against it
    const hz = StormSky.horizonOf(cam);
    const fl = this.cloudFlashes(t, flashGain, hz);
    const flash = fl.reduce((s, q) => s + q[3], 0);
    this.sky.draw(t, { horizon: hz, cover, stars, galaxy: stars, galaxyAngle: -1.05, galaxyOffset: -60, flashes: fl, pan: cam.pos[0] * 0.8, soft: 30,
      hor: [0.0045 + 0.012 * stars, 0.0042 + 0.012 * stars, 0.0075 + 0.02 * stars] });
    if (hz > 0 && view >= 3) this.bolts(t, hz, flashGain * (1 - stars));
    d.setCamera(cam);
    // the fault: the failed part of the grid dark, the live part a faint hum, the front a spark;
    // the city's lamps go out behind it
    const t0 = sc.barTime(55);
    const R = view === 0 ? 30000 * Math.pow(clamp(invLerp(t0 + 0.15, t0 + 1.9, t)), 1.6) : this.maxD + 1;
    const fog: [number, number, number] = [lerp(3000, 1500, view === 1 || view === 5 ? 1 : 0), 16000, 0.12];
    // each flash shows the city's lines for an instant: the strike to come, foretold
    const dim = 1.6 + (view >= 4 ? 7 : 2.2) * flash;
    d.lines(this.streets, { model: G, color: withA(hex('#26345c', dim), 1), fog });
    d.lines(this.water, { model: G, color: withA(hex('#3b5a8a', dim * 0.9), 1), fog });
    if (view === 0) {
      d.lines(this.litStreets, { model: G, reveal: this.maxD - R, soft: 400, color: L('sodium', 0.5), fog });
      d.dots(this.lamps, { model: G, reveal: this.maxD - R, soft: 300, color: L('sodium', 1.3), world: true, rScale: 0.9, rClamp: [0.7, 3], flicker: 0.2, time: t, fog });
      d.lines(this.powerLive, { model: G, reveal: this.maxD - R, soft: 200, color: withA(L('halide', 0.85), 1), fog, glow: 1,
        pulseAt: this.maxD - ((t - t0) * 9000) % 30000, pulseWidth: 1400, pulseGain: 1.6 });
      // the dying lines spark just behind the front as it passes along them
      d.lines(this.powerDead, { model: G, reveal: R, soft: 200, color: withA(hex('#3a4258', 1.2), 1), fog, pulseAt: R - 420, pulseWidth: 520, pulseGain: 22, glow: 1 });
      // where it starts: the substation's breakers fail in a burst of light
      const since = t - (t0 + 0.12);
      if (since > 0 && since < 0.8) {
        d.dotStyle({ world: true, blend: 'add' });
        const u = since / 0.8;
        d.dot(OW, 14 + 40 * Math.sqrt(u), withA(L('halide', 1.4 * (1 - u) * (1 - u)), 1), 1);
        d.dot(OW, 4, withA(L('halide', 5 * Math.max(0, 1 - since / 0.25)), 1), 0.6);
        d.flush();
      }
    } else {
      d.lines(this.powerDead, { model: G, color: withA(mixc(hex('#2a3044', 1.2), hex('#9fdcff', 1), clamp(flash * (view >= 4 ? 2.5 : 0.8))), 1), fog });
    }
    // candles in the windows, more and more of them as the dark goes on
    const lit = 1000 * Math.pow(clamp(invLerp(t0 + 1.6, sc.barTime(65) - 2, t)), 0.8) * 0.2;
    if (lit > 0) d.dots(this.candles, { model: G, reveal: lit, soft: 60, color: CANDLE, world: true, rScale: 1, rClamp: [1.1, 2.4], flicker: 0.35, time: t, fog });
    // a few cars still driving, their lights the only ones that move
    d.setModel(G);
    const fwd = cam.basis().f;
    drawTraffic(d, this.ways, t, { classes: [0], density: 0.35, speed: 110, trail: 70, width: 1.4, head: L('halide', 0.8), tail: L('tail', 0.8), side: 0, view: [fwd[0], -fwd[2]], fog });
    d.setModel(null);
    // downtown in three dimensions, standing over everything on the ground: its offices lit until
    // the fault reaches them, then only candles in a few windows; the walls catch each flash
    const candles = 0.004 + 0.022 * clamp(invLerp(t0 + 1.6, sc.barTime(65) - 2, t));
    this.loop.draw(cam, {
      office: view === 0 ? 0.34 : 0, officeI: 1.1, reveal: view === 0 ? R : 1e9, origin: this.origin,
      candle: candles, candleI: 1.4, time: t,
      // under the stars the towers are silhouettes against the sky's glow, their edges only faint
      edge: mixc(hex('#3a4a72'), hex('#7f93c0'), stars).slice(0, 3), edgeI: 0.5 + 0.2 * stars + 6 * flash,
      flash: 0.35 * flash, flashC: [0.5, 0.56, 0.85], flashDir: [0, 1, 0.3], fog,
    });
    // the ghost of the world's energy, running back to the fire (the first phrase)
    if (view === 1) this.energyGhost(t);
    if (view === 3) this.skyNote(t, stars);
    // the rain, in gusts as the storm builds, lit by its own lightning
    const gust = view >= 4 ? 0.14 + 0.2 * Math.max(0, Math.sin(t * 0.9) * Math.sin(t * 0.37 + 1)) : 0.14;
    this.rainFx.draw(f.frame, { amount: rainA, wind: gust, lit: 1 + 4 * flash, density: rainN / 320, pan: [-cam.pos[0] * 2, 0] });
    void fonts; void label; void hash2;
    return { bloom: 0.32, threshold: 0.9 };
  }

  /** the world's energy by share of source, run back from 2025 to 1800, over the roofs: the line of
   *  the fire's share is the history; the cursor runs back along it; the fire rises in the glass to the
   *  share of its year, until it is nearly all */
  energyGhost(t: number) {
    const { d, fonts } = this.ctx;
    const p1 = this.phrases[0] || [t, t + 2];
    const e = this.charts.energy;
    const ys: number[] = e.years, Ls: Record<string, number[]> = e.layers;
    const k = ease.inOutSine(clamp(invLerp(p1[0] - 0.2, p1[1] + 0.5, t)));
    const yr = lerp(2025, 1800, k);
    const appear = clamp(invLerp(p1[0] - 0.9, p1[0] - 0.1, t));
    const X0 = 360, X1 = 1560, Y0 = 380, Y1 = 150;
    const X = (y: number) => X0 + ((y - 1800) / 225) * (X1 - X0);
    const Y = (s: number) => Y0 + s * (Y1 - Y0);
    const shareI = (i: number) => {
      let tot = 0;
      for (const s in Ls) tot += Ls[s][i] || 0;
      return (Ls['Traditional biomass'][i] || 0) / tot;
    };
    const shareAt = (y: number) => {
      const j = Math.max(1, ys.findIndex((v) => v >= y));
      const u = clamp((y - ys[j - 1]) / Math.max(1, ys[j] - ys[j - 1]));
      return lerp(shareI(j - 1), shareI(j), u);
    };
    const sNow = shareAt(yr);
    d.setCamera(Camera.home());
    // the fire, risen to the share of the year: its top edge alive like flames
    const lvl: number[] = [];
    for (let i = 0; i <= 60; i++) {
      const x = lerp(X0, X1, i / 60);
      const lick = (Math.sin(x * 0.045 + t * 7.3) * 0.5 + Math.sin(x * 0.11 - t * 11.1) * 0.35) * 5 * appear;
      lvl.push(x, Y(sNow) + lick);
    }
    lvl.push(X1, Y0, X0, Y0);
    d.fill([lvl], { c0: withA(L('filament', 0.55), 0.7 * appear), c1: withA(FIRE, 0.22 * appear), from: [0, Y(sNow)], to: [0, Y0] }, null, 'add');
    // the history, a ghost, and the cursor running back along it
    const hist: number[] = [];
    for (let i = 0; i < ys.length; i++) hist.push(X(ys[i]), Y(shareI(i)), 0);
    d.lineStyle({ glow: 2 });
    d.poly(hist, 1.6, withA(GHOST, 0.55 * appear));
    d.seg([X(yr), Y1 - 18, 0], [X(yr), Y0 + 10, 0], 1.6, withA(GHOST, 0.9 * appear));
    d.flush();
    d.lineStyle({ dash: [7, 0.5] });
    d.seg([X0, Y(1), 0], [X1, Y(1), 0], 1, withA(GHOST, 0.4 * appear));
    d.seg([X0, Y0, 0], [X1, Y0, 0], 1, withA(GHOST, 0.4 * appear));
    d.flush();
    d.dotStyle({});
    d.dot([X(yr), Y(sNow), 0], 5, withA(L('filament', 2), appear), 0.5);
    d.flush();
    d.lineStyle({});
    // the year and the share ride the cursor, above the chart, never on the fire
    const yTxt = `${Math.round(yr)}`, pTxt = `  ${Math.round(sNow * 100)}% FROM BURNING WOOD, STRAW AND DUNG`;
    if (X(yr) > 1150) {
      const pw = label(d, fonts, pTxt, X(yr) + 6, Y1 - 26, 13, withA(L('filament', 1.1), appear), { align: 'right' });
      label(d, fonts, yTxt, X(yr) + 6 - pw, Y1 - 26, 26, withA(GHOST, appear), { font: 'passMono', axes: { wght: 600 }, align: 'right' });
    } else {
      const w = label(d, fonts, yTxt, X(yr) - 6, Y1 - 26, 26, withA(GHOST, appear), { font: 'passMono', axes: { wght: 600 } });
      label(d, fonts, pTxt, X(yr) - 6 + w, Y1 - 26, 13, withA(L('filament', 1.1), appear));
    }
    for (const y of [1800, 1900, 2000]) label(d, fonts, String(y), X(y), Y0 + 26, 13, withA(NIGHT.note, appear), { align: 'center' });
    label(d, fonts, 'The world’s energy: the share that is fire, run back from 2025', X0, Y1 - 78, 20, withA(hex('#d7deee', 0.9), appear), { font: 'pass', axes: { wght: 650 } });
    label(d, fonts, 'Primary energy from traditional biomass. Data: Energy Institute; Smil (2017), via Our World in Data', X0, Y1 - 58, 13, withA(NIGHT.noteDim, appear));
  }

  /** what the parted clouds show, said once, small */
  skyNote(t: number, a: number) {
    const { d, fonts } = this.ctx;
    if (a < 0.02) return;
    d.setCamera(Camera.home());
    d.rect(-20, 830, 1960, 270, { c0: withA(hex('#000000'), 0), c1: withA(hex('#000000'), 0.93 * a), from: [0, 830], to: [0, 905] }, null, 'alpha');
    const c = withA(hex('#d7deee', 0.95), a);
    label(d, fonts, 'With its lamps out, the city has the sky of 1800 again.', 120, 928, 22, c, { font: 'pass', axes: { wght: 650 } });
    label(d, fonts, 'Our light hides the Milky Way from a third of humanity, and from nearly 80% of North Americans.', 120, 958, 15, withA(NIGHT.note, a));
    label(d, fonts, 'Data: Falchi et al., The new world atlas of artificial night sky brightness, Science Advances (2016)', 120, 982, 12, withA(NIGHT.noteDim, a));
    void t;
  }

  // ------------------------------------------------------------------ the hundred candles
  candleRoom(f: ShotFrame) {
    const { d, fonts } = this.ctx;
    const t = f.t;
    const p2 = this.phrases[1] || [f.shot.start + 0.2, f.shot.end - 1.5];
    this.ctx.clear(hex('#030202'));
    const cam = Camera.home();
    const g = glide(f.p);
    cam.pos = [960 + lerp(-40, 40, g), 540 + lerp(20, -20, g), lerp(-1680, -1460, g)];
    cam.roll = lerp(-0.02, 0.015, g);
    d.setCamera(cam);
    // the years run back with the phrase; each candle stands for a child of the births
    const yr = lerp(2024, 1800, ease.inOutSine(clamp(invLerp(p2[0] - 0.1, p2[1] + 0.6, t))));
    const child = this.charts.child.series.World as [number[], number[]];
    const rateAt = (y: number) => (at(child, y) ?? 43) / 100;
    const lost = Math.round(rateAt(yr) * 100);
    // the same shuffled order as the births, so the same children are lost
    const rnd = mulberry32(17);
    const order = Array.from({ length: 100 }, (_, i) => i).sort(() => rnd() - 0.5);
    const rank = new Array(100);
    order.forEach((v, i) => (rank[v] = i));
    // when each candle went out: the time the count of the lost passed its rank
    const outAt = (i: number) => {
      const target = rank[i] + 0.5;
      if (rateAt(2024) * 100 >= target) return -1e9;        // lost even now: never lit in this scene
      // search the run for the moment the lost first exceed its rank
      const tA = p2[0] - 0.1, tB = p2[1] + 0.6;
      let lo = tA, hi = tB;
      if (rateAt(lerp(2024, 1800, 1)) * 100 < target) return 1e9;
      for (let k = 0; k < 20; k++) {
        const m = (lo + hi) / 2;
        const y = lerp(2024, 1800, ease.inOutSine(clamp(invLerp(tA, tB, m))));
        if (rateAt(y) * 100 >= target) hi = m; else lo = m;
      }
      return hi;
    };
    const GX = 250, GY = 300, step = 70;
    // beside them, the chart, run back: the line grows from 2024 toward 1800 as the candles go out
    const X0 = 1060, X1 = 1760, Y0 = 800, Y1 = 300;
    const X = (y: number) => X0 + ((y - 1800) / 224) * (X1 - X0), Y = (v: number) => Y0 + (v / 50) * (Y1 - Y0);
    d.lineStyle({ dash: [6, 0.5] });
    for (const v of [10, 20, 30, 40]) d.seg([X0, Y(v), 0], [X1, Y(v), 0], 1, withA(NIGHT.hair, 1));
    d.flush();
    d.lineStyle({ glow: 3 });
    d.poly(path(child, X as any, Y as any, 2024, yr, 1), 2.6, withA(GHOST, 0.85));
    d.flush();
    d.lineStyle({});
    const cv = at(child, yr) ?? 43;
    d.dotStyle({});
    d.dot([X(yr), Y(cv), 0], 5, withA(GHOST, 1.4), 0.5);
    d.flush();
    d.dotStyle({ blend: 'add' });
    for (let i = 0; i < 100; i++) {
      const row = Math.floor(i / 10), col = i % 10;
      const x = GX + col * step, y = GY + row * step;
      const to = outAt(i);
      const since = t - to;
      // the wax
      d.rect(x - 5, y + 2, 10, 26, { c0: withA(hex('#f3e2c4', 0.22), 1), c1: withA(hex('#f3e2c4', 0.04), 1), from: [0, y + 2], to: [0, y + 28] }, null, 'add');
      if (to < -1e8) continue;
      const alive = since < 0 ? 1 : clamp(1 - since / 0.28);
      const ph = i * 1.7;
      const fl = 1 + 0.14 * Math.sin(t * 9.3 + ph) + 0.08 * Math.sin(t * 23.1 + ph * 2.1);
      const sway = 2.2 * Math.sin(t * 3.1 + ph);
      if (alive > 0) {
        const hgt = 21 * fl * alive, wid = 5.2 * (0.6 + 0.4 * alive);
        const flame: number[] = [];
        for (let k = 0; k <= 24; k++) {
          const th = (k / 24) * Math.PI * 2;
          const w = wid * Math.sin(th) * Math.pow(0.5 - 0.5 * Math.cos(th), 0.55);
          flame.push(x + w + sway * (0.5 + 0.5 * Math.cos(th)), y - hgt * (0.5 + 0.5 * Math.cos(th)));
        }
        d.fill([flame], { c0: L('filament', 2.2 * alive), c1: withA(hex('#ff6a20', 1.5 * alive), 1), from: [0, y - hgt], to: [0, y] }, null, 'add');
        d.dot([x, y - 9, 0], 13 * fl, withA(FIRE, 0.1 * alive), 1);
      }
      if (since >= 0 && since < 2.2) {
        // the ember on the wick, then the smoke going up
        d.dot([x, y - 1, 0], 2.2, withA(hex('#ff3a1a', 1.6), clamp(1 - since / 0.9)), 0.5);
        d.flush();
        d.lineStyle({ blend: 'add' });
        const sm: number[] = [];
        for (let k = 0; k < 18; k++) {
          const u = k / 17, hh = u * 90 * clamp(since / 1.2);
          sm.push(x + Math.sin(u * 7 + since * 3 + ph) * 6 * u, y - 4 - hh, 0);
        }
        d.poly(sm, 1.4, withA(hex('#9aa3b5', 0.5), clamp(1 - since / 2.2) * 0.8));
        d.flush();
        d.lineStyle({});
        d.dotStyle({ blend: 'add' });
      }
    }
    d.flush();
    d.setCamera(Camera.home());
    const live = 100 - lost;
    label(d, fonts, `${live} OF 100 LIVE TO FIVE`, GX - 14, GY - 76, 30, withA(L('filament', 1.2), 1), { font: 'passMono', axes: { wght: 600 } });
    label(d, fonts, String(Math.round(yr)), GX + 9 * step + 14, GY - 76, 30, withA(GHOST, 0.9), { font: 'passMono', align: 'right' });
    for (const v of [10, 20, 30, 40]) label(d, fonts, `${v}%`, X0 - 10, Y(v) + 5, 14, NIGHT.note, { align: 'right' });
    for (const y of [1800, 1900, 2000]) label(d, fonts, String(y), X(y), Y0 + 30, 14, NIGHT.note, { align: 'center' });
    label(d, fonts, `${cv.toFixed(0)}% DIE BEFORE FIVE`, X(yr) + 12, Y(cv) - 12, 16, withA(GHOST, 1.2));
    label(d, fonts, 'Child mortality, run back from 2024', X0 - 60, Y1 - 60, 20, hex('#d7deee', 0.9), { font: 'pass', axes: { wght: 650 } });
    label(d, fonts, 'Share of children who die before their fifth birthday, World. Data: Gapminder; UN IGME, via Our World in Data', X0 - 60, Y1 - 36, 13, NIGHT.noteDim);
    return { bloom: 0.38, threshold: 0.85 };
  }
}
