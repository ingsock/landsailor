// THE TURN, on the hit at the end of the bridge (the bridge itself is bridge.ts): lightning. It
// strikes the tallest tower, as it does, and for a moment everything is lit at once: every street,
// rail line and power line and the lake shore of Chicago, the lines that are never seen. The bolt
// stays burned in for a moment, a ring of current runs out through the streets, and the lines stay,
// faint, carrying pulses of current out from the Loop as the music builds; downtown stands dark
// among them, its edges lit cold by the afterglow.
import { Camera } from '../engine/camera';
import { LineMesh } from '../engine/draw';
import { Scene, ShotFrame } from '../engine/engine';
import { RGBA, clamp, hex, lerp, prog, withA, mulberry32, fract, mixc, glide, smooth } from '../engine/math';
import { Score } from '../engine/score';
import { groundModel, loadCity, roadMesh } from '../lib/city';
import { label } from '../lib/lyric';
import { L } from '../lib/palette';
import { Rain } from '../lib/rain';
import { Loop3D, sharedLoop } from '../lib/loop3d';
import { StormSky } from '../lib/storm_sky';

const PX = 0.1;
// Willis Tower, the tallest: metres east and south of State & Madison, and its height
const STRIKE: [number, number, number] = [-672, 338, 442];

export class Blackout extends Scene {
  score!: Score;
  streets!: LineMesh;
  rail!: LineMesh;
  water!: LineMesh;
  rainFx!: Rain;
  power!: LineMesh;
  loop!: Loop3D;
  sky!: StormSky;
  async init() {
    const { d } = this.ctx;
    this.score = this.ctx.data.get('score');
    const city = await loadCity(this.ctx);
    this.rainFx = new Rain(this.ctx.gl, d);
    const all = new Float32Array(city.major.length + city.streets.length);
    all.set(city.major, 0); all.set(city.streets, city.major.length);
    this.streets = roadMesh(d, all, { key1: (_a, _b, _c, _d, _cls, k) => k });
    this.rail = roadMesh(d, city.rail, { width: [1.6, 2.0, 1.6], alpha: [1, 1, 1], key1: (_a, _b, _c, _d, _cls, k) => k });
    this.water = roadMesh(d, city.water, { width: [1.8, 1.2], alpha: [1, 0.8] });
    this.power = roadMesh(d, city.power, { width: [2.0, 1.3, 1.1, 1.6], alpha: [1, 0.85, 0.7, 1] });
    this.loop = await sharedLoop(this.ctx);
    this.sky = new StormSky(this.ctx.gl, d);
  }

  /** the bolt, in the picture: from above the frame down to the struck tower's top (sx, sy) */
  bolt(sx: number, sy: number, since: number) {
    const { d } = this.ctx;
    const live = since < 0.22 ? 1 : 0;
    const ghost = Math.exp(-Math.max(0, since - 0.1) / 0.7);
    if (ghost < 0.02) return;
    const rnd = mulberry32(65);
    const top = -40, n = 26;
    const main: number[] = [];
    let x = sx + 260;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const y = lerp(top, sy, u);
      main.push(lerp(x, sx, u * u), y, 0);
      x += (rnd() - 0.5) * 70;
    }
    main[n * 3] = sx; main[n * 3 + 1] = sy;
    const c = live ? L('lightning', 7) : withA(hex('#7fe0ff', 1.6 * ghost), 1);
    d.setCamera(Camera.home());
    d.lineStyle({ glow: live ? 10 : 4, blend: 'add' });
    d.poly(main, live ? 4.5 : 2.2, c);
    for (let b = 0; b < 4; b++) {
      const i0 = 3 + Math.floor(rnd() * (n * 0.6));
      let bx = main[i0 * 3], by = main[i0 * 3 + 1];
      const dir = rnd() < 0.5 ? -1 : 1;
      const br: number[] = [bx, by, 0];
      for (let k = 0; k < 9; k++) { bx += dir * (10 + rnd() * 26); by += 14 + rnd() * 22; br.push(bx, by, 0); }
      d.poly(br, live ? 2 : 1, live ? L('lightning', 3) : withA(hex('#7fe0ff', 0.7 * ghost), 1));
    }
    d.flush();
    d.lineStyle({});
  }

  draw(f: ShotFrame) {
    return this.lines(f);
  }

  /** a world point to the picture's pixels (1920 x 1080, y down), or null behind the camera */
  toScreen(cam: Camera, p: [number, number, number]): [number, number] | null {
    const m = cam.viewProj(1920 / 1080);
    const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
    const y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
    const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
    if (w <= 0) return null;
    return [(x / w * 0.5 + 0.5) * 1920, (0.5 - y / w * 0.5) * 1080];
  }

  lines(f: ShotFrame) {
    const { d, fonts } = this.ctx;
    const t = f.t;
    const sc = this.score;
    const hit = sc.barTime(65);
    const view = (f.shot.params!.view as number) || 0;
    this.ctx.clear(hex('#000102'));
    // the flash: everything at once, white, then the afterimage
    const since = t - hit;
    // the strike: two frames of white, then gone in a fifth of a second, falling evenly to the eye
    // (an exponential in linear light leaves a grey veil long after the strike) and ending at zero;
    // the lines keep its afterimage
    const fall = clamp(1 - (since - 0.034) / 0.2);
    const flash = since < 0.034 ? 1 : fall * fall * fall;
    const after = Math.exp(-since / 2.5);
    const k = glide(f.p);
    const cam = new Camera();
    if (view === 0) {
      // over the whole city as the lightning shows it, settling down toward the Loop
      cam.pos = [lerp(-150, -500, k), lerp(-3600, -2200, k), lerp(-1200, -1300, k)];
      cam.target = [lerp(-150, -80, k), 0, lerp(250, 300, k)];
    } else if (view === 1) {
      // low along the rail lines into the Loop, the current running past
      cam.pos = [lerp(-1500, -500, k), lerp(-180, -120, k), lerp(-600, -40, k)];
      cam.target = [lerp(-300, 200, k), 0, lerp(150, 260, k)];
    } else {
      // rising and turning over the lake shore, the whole web of lines below
      const a = lerp(-0.6, 0.5, k);
      cam.pos = [Math.sin(a) * 2400 - 200, lerp(-600, -2600, k), -Math.cos(a) * 2400 + 300];
      cam.target = [-200, 0, 300];
    }
    cam.near = 1;
    // the storm passing: where the sky is in view, its clouds thin and a few stars show; it still
    // flashes far off now and then
    const hz = StormSky.horizonOf(cam);
    if (hz > 0) {
      const far = (u: number) => { const q = (t - hit - u) % 2.9; return q > 0 && q < 0.5 ? Math.exp(-q / 0.06) * 0.8 + (q > 0.08 ? Math.exp(-(q - 0.08) / 0.08) : 0) : 0; };
      const pass = smooth(prog(t, hit + 1, hit + 11));
      this.sky.draw(t, { horizon: hz, cover: lerp(0.95, 0.55, pass), stars: 0.35 * pass, galaxy: 0.15 * pass, drift: 34, soft: 26, haze: 1,
        flashes: [[1500, hz - 160, 380, 0.18 * far(0.7) * (1 - 0.6 * pass)], [380, hz - 110, 300, 0.12 * far(2.1)]] });
    }
    d.setCamera(cam);
    const G = groundModel(PX, 0, 0, 0);
    const fog: [number, number, number] = [lerp(5000, 1500, k), lerp(16000, 6000, k), 0.1];
    const white = (i: number) => L('lightning', i);
    const cold = (i: number): RGBA => mixc(hex('#7fe0ff', i), L('lightning', i), flash);
    // a ring of current runs out through the streets from the strike, then they stay faint
    const ring = Math.max(0, since) * 5200 + 300;
    d.lines(this.streets, { model: G, color: withA(cold(0.25 + 3.5 * flash), 1), fog, wScale: 0.9,
      pulseAt: ring, pulseWidth: 900, pulseGain: 10 * (1 - smooth(prog(t, hit + 0.3, hit + 4.5))) });
    d.lines(this.water, { model: G, color: withA(cold(0.6 + 3 * flash), 1), fog });
    // the power lines, the most hidden of all: white with current, in pulses at twice the rail's rate
    const pulseP = fract((t - hit) / (120 / sc.audio.bpm)) * 26000;
    d.lines(this.power, { model: G, color: withA(mixc(hex('#cfefff', 0.32 + 0.4 * after), L('lightning', 1), flash).map((v, i) => i < 3 ? v * (1 + 3 * flash) : v) as RGBA, 1), fog,
      pulseAt: pulseP, pulseWidth: 1100, pulseGain: 2.2 * prog(t, hit + 1, hit + 3), glow: 1 });
    // rail: the current goes out from the Loop in pulses, each bar a new one
    const bars = (t - hit) / (240 / sc.audio.bpm);
    const pulseR = fract(bars * 2) * 26000;
    d.lines(this.rail, { model: G, color: withA(cold(0.45 + 3 * flash + 0.6 * after), 1), fog, pulseAt: pulseR, pulseWidth: 2200, pulseGain: 4 * prog(t, hit + 1.5, hit + 4), wScale: 1.1, glow: 1 });
    // seen from high up, the storm's last clouds drift between the camera and the city
    if (view !== 1) this.sky.draw(t, { horizon: -1, veil: 0.55, cover: 0.5, scale: 520, drift: 26, ambient: 1.2, cloud: [0.012, 0.014, 0.022], pan: -cam.pos[0] * 0.4 });
    // downtown, dark among the lines, its edges lit cold by the afterglow
    this.loop.draw(cam, { edge: [0.35, 0.75, 0.95], edgeI: 0.3 + 5 * flash + 1.4 * after, base: [0.004, 0.005, 0.008], roof: [0.006, 0.007, 0.011],
      office: 0, candle: 0.012, candleI: 1.2, time: t, flash: 0.5 * flash, flashC: [0.6, 0.7, 1.0], flashDir: [0, 1, 0], fog });
    // the bolt itself, on the tallest tower (from the high view only)
    if (view === 0 && since < 2.5) {
      const st = this.toScreen(cam, [STRIKE[0] * PX, -STRIKE[2] * PX, -STRIKE[1] * PX]);
      if (st) this.bolt(st[0], st[1], since);
    }
    // the strike lights every drop of the rain for an instant; then the air is clear
    this.rainFx.draw(f.frame, { amount: 0.6 * (1 - smooth(prog(t, hit + 0.05, hit + 0.7))), lit: 1 + 4 * flash, wind: 0.2 });
    label(d, fonts, '', 0, 0, 10, white(1));
    return { bloom: 0.4, threshold: 0.9, flash: 0.85 * flash, flashColor: [0.95, 0.97, 1] };
  }
}
