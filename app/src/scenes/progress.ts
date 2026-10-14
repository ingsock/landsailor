// VERSE 3, "This is my progress / When you don't notice my lines at all".
// Every chart of the film at once, small, each in a block of Chicago's street plan: eighteen real
// blocks south of the Eisenhower on the West Side (6 by 3, an eighth of a mile each, found in the
// OpenStreetMap streets), the streets between them the charts' frames, lit, with traffic on them.
// Each chart draws itself in its own manner again (hall_minis.ts), seen at first at a slant, like
// a crane over the street. Then the camera straightens and rises away: the Eisenhower's traffic
// comes into the frame, then the West Side, then cloud decks lit from below slide under the camera,
// then the whole lit city, until the eighteen charts are eighteen blocks among thousands; the
// charts' lines and the sung words thin to nothing, the city's lights go quiet, unnoticed, and the
// camera ends exactly where the next shot's plan begins (split.ts), so the cut is the city cracking.
import { Camera } from '../engine/camera';
import { DotMesh, LineMesh } from '../engine/draw';
import { Scene, ShotFrame } from '../engine/engine';
import { M4, RGBA, chain, clamp, ease, hex, invLerp, lerp, mixc, mulberry32, prog, scale, translate, withA, fract } from '../engine/math';
import { Score } from '../engine/score';
import { lampMesh, loadCity, roadMesh } from '../lib/city';
import { drawLine, layLine } from '../lib/lyric';
import { L } from '../lib/palette';
import { Way, drawTraffic, loadWays } from '../lib/traffic';
import { Mini, PH, PW, makeMinis, panel } from '../lib/hall_minis';
import { CloudDecks } from '../lib/hall_sky';

// the plan as the next shot lays it (split.ts: metres east and south of State & Madison -> world
// px), and where its camera begins, still backing away: this shot ends exactly there
const S = 0.075, OX = 839.6, OY = 383.7;
const BASE: M4 = chain(translate(OX, OY, 0), scale(S, S, 1));
const END = { x: 961, y: 540, z0: 1552, z1: 1567, roll: 0.047 };
// the blocks: streets (metres) bounding six by three blocks, from the street data
const XS = [-6868, -6663, -6462, -6260, -6059, -5854, -5653];
const YS = [912, 1117, 1318, 1524];
const INSET = 13;      // the street's half width and the sidewalk: the panels sit inside the curbs
const HOME = 1600;

export class Progress extends Scene {
  score!: Score;
  minis: Mini[] = [];
  res!: LineMesh;
  majors!: LineMesh;
  ways!: LineMesh;
  rail!: LineMesh;
  water!: LineMesh;
  lamps!: DotMesh;
  traffic!: Way[];
  clouds!: CloudDecks;
  async init() {
    const { d } = this.ctx;
    this.score = this.ctx.data.get('score');
    const charts = this.ctx.data.get('charts');
    const weather = await (await fetch('/data/weather_chicago.json')).json();
    this.minis = makeMinis(charts, weather);
    const city = await loadCity(this.ctx);
    this.res = roadMesh(d, city.streets);
    this.majors = roadMesh(d, city.major, { classes: [2, 3, 4] });
    this.ways = roadMesh(d, city.major, { classes: [0, 1] });
    this.rail = roadMesh(d, city.rail, { width: [1.2, 1.0, 0.8], alpha: [0.8, 0.6, 0.5] });
    this.water = roadMesh(d, city.water, { width: [1.6, 1.2], alpha: [1, 0.8] });
    const all = new Float32Array(city.major.length + city.streets.length);
    all.set(city.major, 0); all.set(city.streets, city.major.length);
    this.lamps = lampMesh(d, all, { classes: [0, 1, 2, 3, 4, 5], spacing: 70, radius: 1.0, jitter: 5, seed: 12 });
    this.traffic = this.ctx.data.get('ways') || (await loadWays());
    this.ctx.data.set('ways', this.traffic);
    this.clouds = new CloudDecks(this.ctx.gl, d);
  }

  /** the camera for any moment of both shots, so the two are one move: close over the eighteen
   *  blocks, rising away slowly while the charts draw, then quicker, ending as split.ts begins */
  camera(t: number): { cam: Camera; dist: number; w: number } {
    const sc = this.score;
    const t0 = sc.line('This is my progress').start - 0.4, ta = sc.line("don't notice").start, t1 = sc.line('Split the world').start;
    // distance, in log: drifting up slowly while the charts draw, then rising away, and leaving
    // at the speed the next shot's camera carries on with
    const D0 = HOME / (1660 / ((XS[6] - XS[0]) * S));
    const v0 = 0.05, v1 = (END.z1 - END.z0) / 0.2 / END.z1;
    const la = Math.log(D0) + v0 * (ta - t0), l1 = Math.log(END.z1);
    let ld: number;
    if (t <= ta) ld = Math.log(D0) + v0 * (t - t0);
    else if (t >= t1) ld = l1 + v1 * (t - t1);
    else {
      const h = t1 - ta, u = (t - ta) / h, u2 = u * u, u3 = u2 * u;
      ld = (2 * u3 - 3 * u2 + 1) * la + (u3 - 2 * u2 + u) * v0 * h + (-2 * u3 + 3 * u2) * l1 + (u3 - u2) * v1 * h;
    }
    const dist = Math.exp(ld);
    const w = clamp((ld - Math.log(D0)) / (l1 - Math.log(D0)), -0.2, 1.2);
    const roll = lerp(0.012, END.roll, ease.inOutSine(clamp(w)));
    // the blocks' centre, and where it sits on screen: under the words at first, and at the end
    // where the next shot's camera sees it
    const gx = (XS[0] + XS[6]) / 2, gy = (YS[0] + YS[3]) / 2;
    const g: [number, number] = [OX + S * gx, OY + S * gy];
    const scr = (dx: number, dy: number, r: number, D: number): [number, number] => {
      const c = Math.cos(r), sn = Math.sin(r), k = HOME / D;
      return [960 + (dx * c + dy * sn) * k, 540 + (-dx * sn + dy * c) * k];
    };
    const s0: [number, number] = [960, 608];
    const s1 = scr(g[0] - END.x, g[1] - END.y, END.roll, END.z1);
    const sp: [number, number] = [lerp(s0[0], s1[0], w), lerp(s0[1], s1[1], w)];
    // the camera's centre that puts the blocks there (the inverse of scr)
    const c = Math.cos(roll), sn = Math.sin(roll), k = dist / HOME;
    const ex = (sp[0] - 960) * k, ey = (sp[1] - 540) * k;
    const cx = g[0] - (ex * c - ey * sn), cy = g[1] - (ex * sn + ey * c);
    // at first the camera looks at the blocks at a slant, from the south, like a crane over the
    // street; it straightens to look straight down as it rises (flat before the clouds)
    const tilt = 0.4 * (1 - ease.inOutSine(clamp(invLerp(t0 + 0.2, ta + 1.3, t))));
    const cam = Camera.home();
    cam.pos = [cx, cy + dist * Math.sin(tilt), -dist * Math.cos(tilt)];
    cam.target = [cx, cy - 6 * Math.sin(tilt), 0];
    cam.roll = roll;
    cam.far = 400000; cam.near = 1;
    return { cam, dist, w };
  }

  draw(f: ShotFrame) {
    const { d, fonts } = this.ctx;
    const t = f.t;
    const sc = this.score;
    const pg = sc.line('This is my progress'), un = sc.line("don't notice");
    const part = f.shot.params!.part as string;
    const { cam, dist } = this.camera(t);
    this.ctx.clear(hex('#03050b'));
    d.setCamera(cam);
    // how far out: 0 over the blocks, 1 over the whole city
    const far = clamp(Math.log(dist / 90) / Math.log(END.z1 / 90));
    // the charts thin to nothing from "my lines" to the end of the line
    const quiet = ease.inOutSine(prog(t, un.words[4].start - 0.2, un.end + 0.6));
    // after the line, the city's lights go quiet too, unnoticed, down to the faint lines the next
    // shot's crack runs along
    const hush = prog(t, un.end + 0.5, sc.line('Split the world').start - 0.12, ease.inOutSine);
    const live = 1 - hush;
    const QUIET = withA(mixc(hex('#3a4f86'), L('sodium', 0.4), 0.35), 1.1);
    // ---- the city: streets, the arterials in sodium, the expressways and their traffic, the
    // rail lines, the lake shore, the lamps
    const ws = lerp(lerp(2.2, 0.85, far), 1, hush);
    d.lines(this.res, { model: BASE, color: mixc(withA(hex('#24345f', 1.0), 1), QUIET, hush), wScale: ws });
    if (live > 0.01) d.lines(this.rail, { model: BASE, color: withA(hex('#4a5890', 0.45 * live), 1), wScale: ws * 0.8 });
    d.lines(this.water, { model: BASE, color: mixc(withA(hex('#3a64b0', 0.6), 1), withA(hex('#5a7fd0', 0.7), 1), hush), wScale: ws });
    d.lines(this.majors, { model: BASE, color: mixc(withA(L('sodium', lerp(0.32, 0.45, far)), 1), QUIET, hush), wScale: ws * 0.95 });
    d.lines(this.ways, { model: BASE, color: mixc(withA(L('sodium', 0.6), 1), QUIET, hush), wScale: ws });
    // the city's own glow in the air over it: over the Loop, and a little over the blocks
    d.setModel(BASE);
    d.dotStyle({ world: true, blend: 'add' });
    for (const [x, y, r, a] of [[0, 300, 5200, 0.012], [-6260, 1218, 2600, 0.006]] as [number, number, number, number][]) d.dot([x, y, 0], r * S, L('sodium', a * far * live), 1);
    d.flush();
    d.setModel(null);
    if (live > 0.01) {
      d.dots(this.lamps, { model: BASE, color: L('sodium', lerp(1.25, 0.95, far) * live), world: true, rScale: 0.6, rClamp: [0.55, lerp(2.4, 1.4, far)], flicker: 0.2, time: t });
      d.setModel(BASE);
      drawTraffic(d, this.traffic, t, { classes: [0, 1], density: 5, speed: 34, trail: lerp(28, 140, far), width: lerp(2.6, 1.0, far),
        head: L('halide', 1.3 * live), tail: L('tail', 1.3 * live), side: 6, view: [0, -1] });
      d.setModel(null);
    }
    // traffic on the streets between the blocks: the frames have cars in them
    this.streetTraffic(t, (1 - 0.7 * far) * live);
    // ---- the charts, a block each
    const born0 = pg.start - 0.18;
    this.minis.forEach((m, i) => {
      const col = i % 6, row = Math.floor(i / 6);
      const x0 = XS[col] + INSET, x1 = XS[col + 1] - INSET, y0 = YS[row] + INSET, y1 = YS[row + 1] - INSET;
      const M = chain(BASE, translate(x0, y0, 0), scale((x1 - x0) / PW, (y1 - y0) / PH, 1));
      const born = born0 + i * 0.06;
      const age = t - born;
      if (age < -0.05) return;
      const a = clamp((age + 0.05) / 0.25) * (1 - quiet);
      if (a <= 0.003) return;
      const beat = sc.beatAt(t) - sc.beatAt(born);
      panel({ d, fonts, t, age: Math.max(0, age), a, thin: lerp(1, 0.15, quiet), M, beat, u: ((x1 - x0) / PW) * S }, m);
    });
    // ---- cloud decks under the rising camera
    const ca = live;
    this.clouds.draw(t, cam, [[-235, 0.45, 220, 0.85 * ca], [-430, 0.34, 380, 0.7 * ca], [-950, 0.2, 700, 0.45 * ca]], { wind: [9, 3], glow: [0.075, 0.04, 0.016], top: [0.016, 0.02, 0.034] });
    // ---- the words, over a little shade at the top of the frame so they read over the traffic
    d.setCamera(Camera.home());
    const shade = 0.55 * (1 - prog(t, un.end + 0.3, un.end + 1.4));
    if (shade > 0.01) d.rect(0, 0, 1920, 300, { c0: [0, 0, 0, shade], c1: [0, 0, 0, 0], from: [0, 40], to: [0, 300] });
    if (part === 'grid') {
      // gone before the next line comes up in its place, so the two never sit on each other
      const sl = layLine(fonts, pg, null, { size: 112, axes: { wdth: 112, wght: 880 }, upper: true, maxWidth: 1700 });
      drawLine(d, sl, 960 - sl.width / 2, 150, t, { light: 'led', glass: 0.7, alpha: 1 - prog(t, pg.end + 0.08, un.start - 0.16, ease.inOutSine) });
    } else {
      // the line thins as it is sung: each word loses weight and width after its own moment, and
      // the whole line goes out after its last word
      const sl = layLine(fonts, un, null, {
        size: 86, upper: true, maxWidth: 1760,
        axes: (wi) => { const q = clamp((t - un.words[wi].start) / 0.9); return { wdth: lerp(110, 78, q * (0.4 + 0.6 * quiet)), wght: lerp(860, 140, ease.inOutSine(q) * (0.35 + 0.65 * quiet)) }; },
      });
      const fadeOut = (1 - prog(t, un.end + 0.2, un.end + 1.4, ease.inOutSine)) * prog(t, un.start - 0.16, un.start - 0.02);
      drawLine(d, sl, 960 - sl.width / 2, 150, t, { light: 'led', glass: 0.6, alpha: fadeOut });
    }
    return { bloom: 0.3, threshold: 0.95 };
  }

  /** cars on the streets between the blocks, both ways, at a city's pace */
  streetTraffic(t: number, a: number) {
    const { d } = this.ctx;
    if (a <= 0.01) return;
    d.setModel(BASE);
    d.lineStyle({ blend: 'add' });
    const rnd = mulberry32(31);
    const lanes: [number, number, number, number][] = [];
    for (const x of XS) lanes.push([x, YS[0] - 120, x, YS[3] + 120]);
    for (const y of YS) lanes.push([XS[0] - 160, y, XS[6] + 160, y]);
    for (const [ax, ay, bx, by] of lanes) {
      const L0 = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / L0, uy = (by - ay) / L0;
      for (let i = 0; i < 4; i++) {
        const dir = rnd() < 0.5 ? 1 : -1, v = 11 + 6 * rnd(), off = rnd();
        const s = fract(off + (dir * t * v) / L0) * L0;
        const x = ax + ux * s, y = ay + uy * s, side = 3.2 * dir;
        const hx = x - uy * side, hy = y + ux * side;
        const col: RGBA = dir > 0 ? L('halide', 1.6 * a) : L('tail', 1.6 * a);
        d.seg([hx, hy, 0], [hx - ux * dir * 16, hy - uy * dir * 16, 0], 2.2, col, 1, [0, 0, 0, 0]);
      }
    }
    d.flush();
    d.lineStyle({});
    d.setModel(null);
  }
}
