// VERSE 1, "Landsailor, sail on time / Rain or shine, I know you can".
// The road is the chart. An expressway at night whose course is world trade: a year every 45 m
// along it, and its drift to the left is merchandise exports as a share of world GDP (1827-2014).
// It is seen the way a long exposure sees a road at night: streams of head and tail lights,
// sodium lamps on the median, wet asphalt smearing every light, the skyline against the glow.
// The traffic never slows (convoy motion: constant speed, no easing). LANDSAILOR is painted
// across the lanes and lights as it is sung; a message sign answers the next line; then the
// camera climbs until the road is the chart, and dives to its far end.
import { Camera } from '../engine/camera';
import { Scene, ShotFrame } from '../engine/engine';
import { RGBA, V3, chain, clamp, fbm1, glide, hex, lerp, rotX, scale, smooth, translate, withA } from '../engine/math';
import { Line, Score } from '../engine/score';
import { at } from '../lib/chart';
import { label } from '../lib/lyric';
import { L, NIGHT } from '../lib/palette';
import { Look, NIGHT_LOOK, NightRoad, RoadPath, Span } from '../lib/road_night';
import { Sign, paintWord, rotYm, signDots } from '../lib/road_signs';
import { prepareCall } from '../lib/road_call';

const Y0 = 1827, Y1 = 2014;
const ZPY = 45;          // metres of road per year
const XPP = 70;          // metres of drift per percentage point
const LEAD = 12;         // points of straight road (50 m each) before 1827, where the words are painted
const xOf = (pct: number) => -(pct - 7) * XPP;

// where things stand along the road (arc length, m)
// halfway between the median's poles (every 45 m), so no pole stands in a word
const WORD_A = 472.5, WORD_B = 517.5, WORD_C = 562.5;
const SIGN = 1430;

/** a camera at pos looking along (yaw, pitch); y is down, pitch > 0 looks down */
function rig(pos: V3, yaw: number, pitch: number, roll = 0, fov = 0.9): Camera {
  const c = new Camera();
  c.pos = pos;
  const cp = Math.cos(pitch);
  c.target = [pos[0] + Math.sin(yaw) * cp * 100, pos[1] + Math.sin(pitch) * 100, pos[2] + Math.cos(yaw) * cp * 100];
  c.roll = roll; c.fov = fov; c.near = 0.5;
  return c;
}

export class TradeRoad extends Scene {
  score!: Score;
  road!: RoadPath;
  night!: NightRoad;
  s1827 = 600;
  s2014 = 0;
  /** airliners on approach to O'Hare, crossing the sky: positions at t = 0 and velocities (m/s) */
  planes: { p: V3; v: V3 }[] = [];

  async init() {
    // nothing in this scene may stop the rest of the film from loading
    try { this.build(); } catch (e) { console.error('traderoad init', e); }
  }

  build() {
    this.score = this.ctx.data.get('score');
    const charts = this.ctx.data.get('charts');
    const s = charts.trade.series.World as [number[], number[]];
    // centreline, one point per year, smoothed a little so the road can be driven
    const raw: [number, number][] = [];
    for (let y = Y0; y <= Y1; y++) raw.push([(at(s, y) ?? 7), (y - Y0) * ZPY]);
    // more trade drifts the road to -x, which is up on the screen once the camera looks down
    // with the road running left to right
    // a gaussian over six years either side keeps the road drivable and the trend true
    const sm = raw.map((p, i) => {
      let a = 0, n = 0;
      for (let k = -15; k <= 15; k++) {
        const wgt = Math.exp(-(k * k) / (2 * 6 * 6));
        const q = raw[clamp(i + k, 0, raw.length - 1)];
        a += q[0] * wgt; n += wgt;
      }
      return [xOf(a / n), p[1]] as [number, number];
    });
    const pts: V3[] = sm.map(([x, z]) => [x, 0, z]);
    // lead-in: 600 m of straight road before 1827, where the painted words sit
    for (let k = 1; k <= LEAD; k++) pts.unshift([pts[0][0], 0, -k * 50]);
    // past 2014 the road runs on, unlit and empty: the chart ends where its data ends
    const n = pts.length, a = pts[n - 2], b = pts[n - 1];
    const dl = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1;
    for (let k = 1; k <= 34; k++) pts.push([b[0] + ((b[0] - a[0]) / dl) * 50 * k, 0, b[2] + ((b[2] - a[2]) / dl) * 50 * k]);
    this.road = new RoadPath(pts);
    this.s1827 = this.road.cum[LEAD];
    this.s2014 = this.road.cum[LEAD + (Y1 - Y0)];
    // the city's cross streets go over the road on bridges, one every decade; a gantry with a
    // guide sign, and the gantry of the message sign
    const spans: Span[] = [];
    for (let dec = 1820; dec <= 2010; dec += 10) spans.push({ s: this.sAtZ((dec - Y0) * ZPY), kind: 'bridge' });
    spans.push({ s: 985, kind: 'gantry' });
    spans.push({ s: SIGN, kind: 'gantry', panel: true });
    try {
      this.night = new NightRoad(this.ctx, this.road, {
        lampEvery: 45, lampFrom: 0, lampTo: this.s2014,
        spans,
        traffic: { from: 0, to: this.s2014, seed: 5 },
        city: [-4800, -3500, 3400, 12600],
        data: [this.s1827, this.s2014],
        medianFrom: 650,
      });
    } catch (e) {
      // never stop the film from loading over this scene
      console.error('traderoad init', e);
    }
    try { prepareCall(this.ctx); } catch (e) { console.error('call road', e); }
    // one over the first verse's road, one beyond the message sign
    const fly = (p: V3, v: V3, t: number): { p: V3; v: V3 } => ({ p: [p[0] - v[0] * t, p[1] - v[1] * t, p[2] - v[2] * t], v });
    this.planes = [
      fly([-1650, -520, 3300], [64, 3.5, -16], 13),
      fly(this.road.P(SIGN + 3800, 1100, -470), [-58, 3, 14], 18.6),
    ];
  }

  /** arc length where the road reaches z (z only grows along it) */
  sAtZ(z: number): number {
    const p = this.road.pts, c = this.road.cum;
    if (z <= p[0][2]) return 0;
    for (let i = 1; i < p.length; i++) if (p[i][2] >= z) return lerp(c[i - 1], c[i], (z - p[i - 1][2]) / ((p[i][2] - p[i - 1][2]) || 1));
    return this.road.len;
  }

  /** a camera on the road at s, `off` to the right, h above it, looking at the road `ahead` metres on */
  roadCam(s: number, off: number, h: number, ahead: number, aOff: number, aH: number, t: number, shake = 1): Camera {
    const R = this.road;
    const c = new Camera();
    const p = R.P(s, off, -h);
    // a little give, as of a camera on a moving vehicle
    const k = 0.06 * shake;
    c.pos = [p[0] + fbm1(t * 6.3) * k, p[1] + fbm1(t * 8.9 + 17) * k * 0.8, p[2]];
    const q = R.P(s + ahead, aOff, -aH);
    c.target = [q[0] + fbm1(t * 2.1 + 5) * k * 6, q[1] + fbm1(t * 2.7 + 9) * k * 4, q[2]];
    c.roll = fbm1(t * 1.7 + 3) * 0.006 * shake;
    c.fov = 0.9; c.near = 0.5;
    return c;
  }

  /** the camera of part 3 (also where part 4 starts) */
  signCam(p: number, t: number): Camera {
    // a dolly zoom: the long lens holds the sign large from far off, and widens as the camera closes in
    const g = glide(p);
    const s = 1352 + 58 * g;
    const c = this.roadCam(s, 3.0, 6.0 + 0.3 * Math.sin(p * 2.2), 70, 0, 8.4, t, 1);
    c.fov = 0.52 + 0.43 * g;
    return c;
  }

  camera(part: number, f: ShotFrame): Camera {
    const t = f.t, p = f.p;
    const R = this.road;
    if (part === 1) {
      // in level from the city's lights, then tipping down onto the painted word and over it
      const g = glide(p);
      const s = 424 + 46 * g;
      const pos = R.P(s, lerp(5.2, 4.0, g), -(8.4 - 3.8 * g));
      const [tx, tz] = R.T(s);
      const c = rig(pos, Math.atan2(tx, tz) - 0.07, 0.035 + 0.2 * g, 0, 0.9);
      return this.shake(c, t, 1);
    }
    if (part === 2) {
      // climbing behind LANDSAILOR / SAIL ON TIME, keeping them below as they are sung, until the
      // road ahead begins to drift
      const g = glide(p);
      const s = 472 + 66 * g;
      const h = 4.3 * Math.exp(3.45 * g);
      const c = new Camera();
      c.pos = R.P(s, lerp(4.0, 1.5, clamp(g)), -h);
      c.target = R.P(490 + 70 * g + 160 * g * g * g, lerp(2.0, 0.5, clamp(g)), 0);
      c.roll = 0.03 * Math.sin(p * 2.4 + 0.4);
      c.fov = 0.9; c.near = 0.5;
      return this.shake(c, t, 0.6);
    }
    if (part === 3) return this.signCam(p, t);
    // part 4: up until the road reads as the chart, then down to its far end
    return this.chartCam(f);
  }

  /** a little give, as of a camera on a moving vehicle */
  shake(c: Camera, t: number, k: number): Camera {
    const a = 0.06 * k;
    c.pos = [c.pos[0] + fbm1(t * 6.3) * a, c.pos[1] + fbm1(t * 8.9 + 17) * a * 0.8, c.pos[2]];
    c.target = [c.target[0] + fbm1(t * 2.1 + 5) * a * 6, c.target[1] + fbm1(t * 2.7 + 9) * a * 4, c.target[2]];
    c.roll += fbm1(t * 1.7 + 3) * 0.006 * k;
    return c;
  }

  /** the climb from the road to the chart and the dive to its end, in one unbroken move: a camera
   *  that looks at a point, both carried along keyframes; altitude by ratios, so the zoom is even */
  chartCam(f: ShotFrame): Camera {
    const p = f.p, t = f.t;
    const R = this.road;
    // the start: part 3's camera, still driving on
    const p3dur = this.score.word('Rain or shine', 'can').start + 0.6 - this.score.line('Rain or shine').start;
    const c0 = this.signCam(1 + f.lt / p3dur, t);
    // the top: over the chart's middle, drifting toward 2014; more trade up, the years running right
    const alt = 6300, tilt = 0.07;
    const midX = -620, midZ = 3880 + 380 * (p - 0.55);
    const topT: V3 = [midX, 0, midZ];
    // the dive: straight down onto the chart's far end, keeping its orientation, so 2014 comes to
    // the middle of the frame and the next picture can open out of it
    const end = R.P(this.s2014, 0, 0);
    const eAlt = 260;
    const eT: V3 = [end[0], 0, end[2]];
    const up = smooth(clamp(p / 0.5)) * 0.92 + 0.08 * clamp(p / 0.5);
    // the dive: first the end comes to the middle (by the time the next picture starts to open),
    // and the fall keeps speeding up into it
    const kC = smooth(clamp((p - 0.58) / 0.27));
    const fall = Math.pow(Math.max(0, p - 0.6) / 0.57, 1.7);
    const hUp = Math.exp(lerp(Math.log(-c0.pos[1]), Math.log(alt), up));
    const h = hUp * Math.pow(eAlt / alt, fall);
    // first straight up over the sign, then swinging out over the chart
    const kU = smooth(clamp((up - 0.12) / 0.86)), kT = smooth(clamp((up - 0.08) / 0.72));
    const mixv = (a: V3, b: V3, k: number): V3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
    // the point the camera looks at, and above which it comes to hover (a little to the side, so
    // more trade stays up the frame): from the road ahead, to the chart's middle, to its end
    const tgt = mixv(mixv(c0.target, topT, kT), eT, kC);
    const over: V3 = [tgt[0] + h * Math.tan(tilt), 0, tgt[2]];
    const pos = mixv(c0.pos, over, kU);
    pos[1] = -h;
    const c = new Camera();
    c.pos = pos; c.target = tgt;
    c.fov = lerp(c0.fov, 0.9, smooth(clamp(up * 2)));
    c.near = Math.max(0.5, h * 0.02);
    return c;
  }

  /** the traffic's clock: real time on the road, a time-lapse as the camera climbs (never a jump) */
  clock(part: number, f: ShotFrame): number {
    if (part !== 4) return f.t;
    // integrate the speed-up from the start of the shot
    const n = 48;
    let extra = 0;
    const p1 = f.p;
    if (p1 <= 0) return f.t;
    for (let i = 0; i < n; i++) {
      const pp = ((i + 0.5) / n) * p1;
      extra += 7 * smooth(clamp(pp / 0.5)) * (1 - 0.6 * smooth(clamp((pp - 0.7) / 0.4)));
    }
    return f.t + (extra / n) * p1 * f.dur;
  }

  draw(f: ShotFrame) {
    const { d } = this.ctx;
    if (!this.night) { this.ctx.clear(hex('#02040a')); return; }
    const t = f.t;
    const part = f.shot.params!.part as number;
    const sc = this.score;
    const l0 = sc.line('Landsailor'), l1 = sc.line('sail on time'), l2 = sc.line('Rain or shine');

    const cam = this.camera(part, f);
    d.setCamera(cam);
    const camH = -cam.pos[1];
    const hi = clamp((camH - 60) / 2500);
    const look: Look = {
      ...NIGHT_LOOK,
      fog: lerp(1 / 2600, 1 / 9000, hi),
      streets: lerp(1, 0.75, hi),
      carpet: lerp(1, 0.75, hi),
      mist: 1 - smooth(clamp((camH - 30) / 400)),
    };
    const nr = this.night;
    const dimOut = part === 4 ? 0.8 * smooth(clamp((camH - 200) / 1400)) : 0;
    // seen from high enough that single cars are less than a pixel, the streams merge into lines
    nr.begin(cam, t, look, { tau: this.clock(part, f), dimOut, far: part === 4 ? smooth(clamp((camH - 700) / 2600)) : 0 });

    // the message sign is lit from part 3 on; elsewhere it is dark glass far off
    const sign = this.sign(l2, t);
    nr.drawReflections(() => signDots(nr, sign, t));
    nr.drawSky();
    nr.drawRoad();
    // painted words lie on the road
    paintWord(nr, l0, 'LANDSAILOR', WORD_A, t);
    paintWord(nr, l1, 'LANDSAILOR', WORD_B, t, 0);
    paintWord(nr, l1, 'SAIL ON TIME', WORD_C, t, 1);
    d.depth(true);
    nr.drawStructures();
    nr.drawPoles();
    nr.drawCity();
    nr.lampHeads();
    nr.traffic();
    nr.planes(this.planes);
    nr.motes();
    nr.drawFar();
    signDots(nr, sign, t);
    d.flush();
    d.depth(false);
    nr.drawMist();
    if (part === 4) this.chart(f, camH);
    return { bloom: 0.34, threshold: 0.85 };
  }

  // ------------------------------------------------------------------------------- the chart
  chart(f: ShotFrame, camH: number) {
    const { d } = this.ctx;
    const a = smooth(clamp((camH - 1800) / 2600));
    if (a <= 0.01) return;
    const R = this.road;
    const fog: [number, number, number] = [9000, 30000, 0.2];
    // gridlines lie on the city's own arterials (every 5 points), dashed the way the charts are
    d.lineStyle({ world: true, dash: [160, 0.5], fog });
    for (const pct of [5, 10, 15, 20, 25]) {
      const zEnd = (Y1 - Y0) * ZPY + 300;
      const gc = withA(NIGHT.note, a * (pct === 5 ? 0.5 : 0.32));
      d.seg([xOf(pct), -0.5, -600], [xOf(pct), -0.5, zEnd], pct === 5 ? 14 : 10, gc, pct === 5 ? 14 : 10, gc, 0, zEnd + 600);
    }
    d.flush();
    d.lineStyle({});
    // the data's two ends, ticked
    const z0 = 0, z1 = (Y1 - Y0) * ZPY;
    d.lineStyle({ world: true, fog });
    for (const z of [z0, z1]) {
      const x = R.P(this.sAtZ(z))[0];
      d.seg([x - 120, -0.5, z], [x + 120, -0.5, z], 10, withA(L('halide', 0.8), a));
    }
    d.flush();
    d.lineStyle({});
    const note = withA(NIGHT.note, a);
    for (const pct of [5, 10, 15, 20, 25]) this.chartText(`${pct}%`, xOf(pct) - 30, -680, 130, note, 'passMono', 'right');
    for (let y = 1840; y <= 2010; y += 20) this.chartText(String(y), xOf(5) + 230, (y - Y0) * ZPY, 120, note, 'passMono', 'center');
    this.chartText('1827', R.P(this.sAtZ(z0))[0] + 210, z0, 110, withA(NIGHT.noteDim, a), 'passMono', 'center');
    this.chartText('2014', R.P(this.sAtZ(z1))[0] - 250, z1, 110, withA(L('halide', 0.85), a), 'passMono', 'center');
    this.chartText('Merchandise exports as a share of world GDP', xOf(27.5), -600, 230, withA(hex('#d7deee'), a), 'pass', 'left', { wght: 650 });
    // the road is the series smoothed so it can be driven; the chart says so
    this.chartText('1827–2014, smoothed (six-year gaussian). Data: Fouquin & Hugot (CEPII 2016), via Our World in Data', xOf(27.5) + 260, -600, 110, withA(NIGHT.noteDim, a), 'passMono', 'left');
    void f;
  }

  /** chart type lying on the ground, reading along the road (+z) with its top toward more trade (-x) */
  chartText(text: string, x: number, z: number, size: number, c: RGBA, font = 'passMono', align: 'left' | 'center' | 'right' = 'left', axes: Record<string, number> = { wght: 500 }) {
    const base = chain(translate(x, -0.6, z), rotYm(-Math.PI / 2), rotX(-Math.PI / 2));
    label(this.ctx.d, this.ctx.fonts, text, 0, 0, size, c, { font, axes, align, base });
  }

  // ------------------------------------------------------------------------------- the message sign
  /** RAIN OR SHINE, then I KNOW YOU CAN from "I"; dark before the line is near */
  sign(line: Line, t: number): Sign {
    const first = t < line.words[3].start - 0.05;
    const ln = first ? { text: 'RAIN OR SHINE', words: line.words.slice(0, 3) } : { text: 'I KNOW YOU CAN', words: line.words.slice(3) };
    return { s: SIGN, top: 9.3, pitch: 0.18, lines: [ln], dark: line.start - 0.4 };
  }
}
