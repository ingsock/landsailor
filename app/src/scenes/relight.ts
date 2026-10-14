// VERSE 3, "Mmm, mmm". The power comes back: from the zero of the city's grid the lamps relight in
// rings, a ring a beat, as at dusk, while the rail lines still carry the cold current the lightning
// left in them (cascade motion: re-energising outward). Seen from the air, the way a night flight
// sees a city: the lamps strike and settle into their pools, the glow comes back into the haze and
// the last of the storm's cloud is lit from below as the rings pass under it, the stars of the
// blackout fade out behind that glow, the mist over the streets takes the light, the lake holds the
// sky, and the first cars wake and move off. The warm light wins; the cold current fades.
// Two views: above the cloud over the Loop, the first rings striking from State & Madison (out of
// the monitor's last point of light); then low under the cloud from the south, the rings running
// out to the horizon, the camera lifting its eyes toward the road it is about to become.
import { Camera } from '../engine/camera';
import { DotMesh, LineMesh } from '../engine/draw';
import { Scene, ShotFrame } from '../engine/engine';
import { V3, chain, clamp, ease, hex, lerp, mixc, prog, scale, translate, withA, glide } from '../engine/math';
import { Score } from '../engine/score';
import { groundModel, loadCity, roadMesh } from '../lib/city';
import { label } from '../lib/lyric';
import { L, NIGHT } from '../lib/palette';
import { loadWays } from '../lib/traffic';
import { Loop3D, sharedLoop } from '../lib/loop3d';
import { AirOpts, RelightAir, WakeTraffic, farLamps, relightLamps, shoreTable } from '../lib/relight_city';

const PX = 0.1;

export class Relight extends Scene {
  score!: Score;
  plan!: LineMesh;
  litMajor!: LineMesh;
  litFast!: LineMesh;
  far!: DotMesh;
  litMinor!: LineMesh;
  railOut!: LineMesh;
  railIn!: LineMesh;
  water!: LineMesh;
  lamps!: DotMesh;
  pools!: DotMesh;
  air!: RelightAir;
  cars!: WakeTraffic;
  loop!: Loop3D;
  /** the ring's radius over time, for finding when it reached a place */
  ringT: number[] = []; ringR: number[] = []; t0 = 0;

  async init() {
    const { d, gl } = this.ctx;
    this.score = this.ctx.data.get('score');
    const city = await loadCity(this.ctx);
    const all = new Float32Array(city.major.length + city.streets.length);
    all.set(city.major, 0); all.set(city.streets, city.major.length);
    const dist = (_a: number, _b: number, _c: number, _d: number, _cls: number, k: number) => k;
    this.plan = roadMesh(d, all);
    this.litMajor = roadMesh(d, city.major, { classes: [2, 3, 4], key1: dist });
    this.litFast = roadMesh(d, city.major, { classes: [0, 1], key1: dist });
    this.litMinor = roadMesh(d, city.streets, { classes: [5], key1: dist });
    // the cold current: shown beyond the ring (k0 = minus the distance), pulses running out (k1)
    this.railOut = roadMesh(d, city.rail, { width: [1.5, 1.9, 1.5], alpha: [1, 1, 1], key: (_a, _b, _c, _d, _cls, k) => -k, key1: dist });
    this.railIn = roadMesh(d, city.rail, { width: [1.1, 1.4, 1.1], alpha: [1, 1, 1] });
    this.water = roadMesh(d, city.water, { width: [1.6, 1.0], alpha: [1, 0.8] });
    this.lamps = relightLamps(d, [city.major, city.streets], { spacing: 80, pool: false, seed: 5, classes: [0, 1, 2, 3, 4, 5] });
    this.pools = relightLamps(d, [city.major, city.streets], { spacing: 80, pool: true, seed: 5, classes: [0, 1, 2, 3, 4, 5] });
    const shore = shoreTable(city);
    this.air = new RelightAir(gl, d, shore);
    this.far = farLamps(d, shore, { R: 80000, box: [-14000, -9800, 2600, 9200], seed: 9 });
    const ways = this.ctx.data.get('ways') || (await loadWays());
    this.ctx.data.set('ways', ways);
    this.loop = await sharedLoop(this.ctx);
    this.cars = new WakeTraffic(ways, { classes: [0, 1], density: 8, seed: 17, box: [-30000, -30000, 15000, 30000] });
    // the ring's radius, tabulated, so a place can find when the light reached it
    const hum = this.score.line('Mmm');
    this.t0 = hum.start - 0.2;
    for (let i = 0; i <= 3600; i++) { const t = this.t0 + i / 240; this.ringT.push(t); this.ringR.push(this.ringAt(t)); }
  }

  /** the lit radius (m) at t: a ring a beat from the first hum, each beat a quick spread and a breath */
  ringAt(t: number): number {
    const sc = this.score;
    const b = sc.beatAt(t) - sc.beatAt(sc.line('Mmm').start - 0.04);
    if (b <= 0) return 0;
    const w = Math.floor(b), fr = b - w;
    const st = w + ease.outCubic(clamp(fr / 0.55));
    // and in the last bars the light runs out past the city to the horizon
    return 140 + 880 * Math.pow(st, 1.34) + 260 * Math.pow(Math.max(0, st - 7), 3.2);
  }

  /** seconds since the ring reached radius r (negative before) */
  since(r: number, t: number): number {
    const R = this.ringR;
    if (r > R[R.length - 1]) return -1;
    let lo = 0, hi = R.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (R[m] < r) lo = m; else hi = m; }
    return t - this.ringT[hi];
  }

  draw(f: ShotFrame) {
    const { d, fonts } = this.ctx;
    const t = f.t;
    const sc = this.score;
    const hum = sc.line('Mmm');
    const view = (f.shot.params?.view as number) || 0;
    const ring = this.ringAt(t);
    // the beat's flare at the front of the ring
    const b = sc.beatAt(t) - sc.beatAt(hum.start - 0.04);
    const flare = b > 0 ? Math.exp(-(b - Math.floor(b)) / 0.22) : 0;
    // how far the warm light has won, over both views (0 at the first hum, 1 at the road)
    const won = prog(t, hum.start, hum.start + 6.2, ease.inOutSine);

    const k = glide(f.p);
    let cam: Camera;
    if (view === 0) {
      // above the cloud over the Loop, looking down through the hole the storm left in it: State &
      // Madison in the middle of the frame where the monitor's last point of light went out; the
      // camera climbs and turns as the rings run out under it
      cam = Camera.orbit([lerp(-20, 60, k), 0, lerp(10, 190, k)], lerp(420, 640, k), lerp(0.6, 0.12, k), lerp(1.08, 0.86, k));
      cam.fov = 0.9;
    } else {
      // low under the cloud from the south, along the lake shore, flying north and lifting its eyes
      // from the streets below to the horizon as the rings run out to it
      const pos: V3 = [lerp(110, 30, k), lerp(-118, -86, k), lerp(-820, -330, k)];
      // ending with the horizon where the road's will be
      const at: V3 = [lerp(-260, -400, k), 0, lerp(-40, 650, k)];
      cam = new Camera();
      cam.pos = pos; cam.target = at;
      cam.roll = lerp(-0.05, 0.015, k);
      cam.fov = lerp(0.95, 0.82, k);
    }
    cam.near = 1; cam.far = 400000;
    d.setCamera(cam);

    // the air: night, the glow of what is lit, the stars of the blackout behind it, the last cloud
    const air: AirOpts = {
      ring, soft: 700, lit: 1, front: 3 * flare * (1 - 0.6 * won),
      zen: hex('#02040c'), hor: hex('#0b1228'), glow: hex('#ff9070', 1),
      ground: hex('#04070f'), cloud: hex('#4a5a82', 0.03), cloudGlow: hex('#ff9488', 1),
      glowGain: view === 0 ? 0.06 : 0.1, stars: lerp(1.5, 0.35, won), vis: 36000, haze: 1, hazeEl: 0,
      deck: [1650, view === 0 ? 0.6 : 0.5, 2300, 9], deckGlow: 0.085, clear: view === 0 ? 1300 : 0,
      mist: [160, 0.0011, 480, 0.13],
    };
    this.ctx.clear(hex('#020309'));
    this.air.under(cam, t, air);

    const G = groundModel(PX, 0, 0, 0);
    const fog: [number, number, number] = view === 0 ? [2500, 9000, 0.25] : [1500, 26000, 0.08];
    // the Loop's towers, their windows coming on with the first ring; drawn first, so that what is on
    // the ground behind them is hidden and what is in front of them is not
    const office = 0.26 * ease.outCubic(clamp((t - hum.start - 0.05) / 1.1));
    this.loop.draw(cam, { office, officeI: 0.85, officeC: [1.0, 0.78, 0.5], reveal: -1e9, base: [0.0035, 0.004, 0.008], roof: [0.006, 0.006, 0.01],
      glass: [0.002, 0.0025, 0.005], edge: [0.5, 0.33, 0.2], edgeI: 0.2 + 0.6 * office, fog });
    d.depth(true);
    // the dark plan: the lines the lightning showed, still there, faint and cold
    d.lines(this.plan, { model: G, color: withA(mixc(hex('#1f2c4c'), NIGHT.plan, won), 0.8), fog, wScale: 0.9 });
    d.lines(this.water, { model: G, color: withA(hex('#4fa6d8', 0.35), 1), fog });
    // the rails: the cold current beyond the ring, pulses running out along them, fading as the warm wins
    const cold = 1 - 0.75 * won;
    d.lines(this.railIn, { model: G, color: withA(hex('#5c7fa3', 0.32), 1), fog });
    d.lines(this.railOut, { model: G, reveal: -ring, soft: 900, color: withA(hex('#7fe0ff', 0.85 * cold), 1), fog,
      pulseAt: ring + ((t * 5200) % 9000), pulseWidth: 900, pulseGain: 1.6 * cold, wScale: 1.1 });
    // the lit streets: arterials and expressways in sodium, the side streets fainter, the front flaring
    d.lines(this.litMinor, { model: G, reveal: ring, soft: 600, color: L('sodium', 0.16), fog, wScale: 0.9 });
    d.lines(this.litMajor, { model: G, reveal: ring, soft: 500, color: L('sodium', 0.55), fog,
      pulseAt: ring, pulseWidth: 260, pulseGain: 1.4 * flare + 0.5 });
    // the expressways lit lower, so the streams of cars on them read
    d.lines(this.litFast, { model: G, reveal: ring, soft: 500, color: L('sodium', 0.3), fog,
      pulseAt: ring, pulseWidth: 260, pulseGain: 2.2 * flare + 0.6 });
    // the lamps: their pools on the ground, then the lamps themselves, each flaring as it strikes
    // the suburbs out to the horizon
    d.dots(this.far, { model: G, reveal: ring, soft: 900, color: [1.15, 1.15, 1.15, 1], world: true, rScale: 0.6, rClamp: [0.6, 1.7], flicker: 0.2, time: t, fog });
    d.dots(this.pools, { model: G, reveal: ring, soft: 350, color: [0.02, 0.02, 0.02, 1], world: true, rScale: 0.75, rClamp: [0.9, 18], fog });
    d.dots(this.lamps, { model: G, reveal: ring, soft: 350, color: [1.3, 1.3, 1.3, 1], world: true, rScale: 0.5, rClamp: [0.7, 2.1], flicker: 0.18, time: t, fog });
    const fl = 0.6 + 1.6 * flare;
    d.dots(this.lamps, { model: G, reveal: ring, soft: 350, color: [2.2 * fl, 2.1 * fl, 2.0 * fl, 1], world: true, rScale: 0.9, rClamp: [1.0, 3.0],
      k1Range: [ring - 160, ring + 300], fog });
    // the first cars, waking as the light reaches them
    const fwd = cam.basis().f;
    d.setModel(G);
    this.cars.draw(d, (r) => this.since(r, t), { speed: 38, trail: 190, width: view === 0 ? 2.0 : 1.8,
      head: L('halide', 2.8), tail: L('tail', 2.6), view: [fwd[0], -fwd[2]], fog });
    d.setModel(null);
    d.depth(false);

    // the air over it all: the cloud lit from below, the mist, the haze
    this.air.over(cam, t, air);

    // the zero of the address grid, where it starts again (as at the film's first frame)
    if (view === 0) {
      const a = clamp(1 - prog(t, hum.start + 0.9, hum.start + 1.8)) * prog(t, hum.start - 0.1, hum.start + 0.3);
      if (a > 0.01) {
        const upp = (Math.hypot(cam.pos[0], cam.pos[1], cam.pos[2]) * 2 * Math.tan(cam.fov / 2)) / 1080;
        const base = chain(G, translate(70, -70, 0), scale(upp / PX, upp / PX, 1));
        label(d, fonts, '0   STATE & MADISON', 0, 0, 17, withA(NIGHT.note, a), { base, tracking: 0.04 });
      }
    }
    return { bloom: 0.34, threshold: 0.85 };
  }
}
