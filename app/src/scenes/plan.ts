// INTRO. Chicago at dusk from straight above, as the chart it already is: State Street and
// Madison Street are the axes of the city's address grid (800 numbers to a mile, zero where they
// cross). The lamps come on in rings from the zero point, a ring a beat; then the camera tips
// down onto the Kennedy Expressway, where the traffic is already flowing toward O'Hare.
// Three views, cut on the bars: straight down on the zero point; the city at a slant as the rings
// run out across it; from high above, down onto the Kennedy.
import { Camera } from '../engine/camera';
import { LineMesh, DotMesh } from '../engine/draw';
import { Scene, ShotFrame } from '../engine/engine';
import { V3, clamp, ease, hex, lerp, mixc, prog, withA, chain, translate, rotX, scale, glide, invLerp } from '../engine/math';
import { Score } from '../engine/score';
import { CityData, groundModel, lampMesh, loadCity, roadMesh } from '../lib/city';
import { label } from '../lib/lyric';
import { L, NIGHT } from '../lib/palette';
import { Way, drawTraffic, loadWays } from '../lib/traffic';

const PX = 0.1; // world units per metre
const MILE = 1609.34;

export class Plan extends Scene {
  city!: CityData;
  plan!: LineMesh;
  lit!: LineMesh;
  lamps!: DotMesh;
  ways!: Way[];
  score!: Score;

  async init() {
    const { d } = this.ctx;
    this.score = this.ctx.data.get('score');
    this.city = await loadCity(this.ctx);
    const all = new Float32Array(this.city.major.length + this.city.streets.length);
    all.set(this.city.major, 0); all.set(this.city.streets, this.city.major.length);
    this.plan = roadMesh(d, all);
    this.lit = roadMesh(d, this.city.major, { classes: [0, 1, 2, 3, 4] });
    this.lamps = lampMesh(d, all, { classes: [0, 1, 2, 3, 4, 5], spacing: 85, radius: 1.0, jitter: 6 });
    this.ways = this.ctx.data.get('ways') || (await loadWays());
    this.ctx.data.set('ways', this.ways);
  }

  draw(f: ShotFrame) {
    const { d, fonts } = this.ctx;
    const t = f.t;
    const sc = this.score;
    const b3 = sc.barTime(3), b5 = sc.barTime(5), vox = sc.line('Landsailor').start;
    const view = (f.shot.params?.view as number) ?? 0;
    // dusk: the last blue goes out of the ground as the lamps come on
    this.ctx.clear(mixc(hex('#0b1226'), hex('#03050c'), view === 0 ? ease.inOutSine(clamp(f.p)) : 1));

    // end: low over the Kennedy near Ohio St, looking NW along it toward O'Hare
    const endPos: V3 = [-520, -32, 320];
    const endAt: V3 = [-1500, 0, 1050];
    let cam: Camera;
    let h0: number; // the camera's distance to its target on the ground, for the labels' size
    let tilt = 0;
    if (view === 0) {
      // straight down on the zero point, pulling back (evenly to the eye: in log height) and turning
      const k = glide(f.p, 0.35);
      h0 = 520 * Math.pow(1500 / 520, k);
      cam = Camera.orbit([lerp(60, 0, k), 0, lerp(40, 60, k)], h0, 0.02 - 0.14 * k, Math.PI / 2 - 0.004);
    } else if (view === 1) {
      // the city at a slant, the rings running out from the zero point across it
      const k = glide(f.p);
      h0 = lerp(1900, 2800, k);
      cam = Camera.orbit([lerp(-60, -220, k), 0, lerp(120, 300, k)], h0, lerp(0.5, 0.15, k), lerp(1.0, 0.82, k));
    } else {
      // from high above the city, tipping down onto the Kennedy; once down, flying on along it
      // toward O'Hare, so the dissolve into the road finds the camera already travelling
      tilt = ease.inOutCubic(clamp(invLerp(b5, vox - 0.5, t)));
      h0 = 3600;
      const top = Camera.orbit([-150, 0, 200], h0, 0, Math.PI / 2 - 0.004);
      const s0 = t - (vox - 1.6), v = 28, ramp = 0.8;
      const travel = s0 <= 0 ? 0 : s0 < ramp ? (v * s0 * s0) / (2 * ramp) : v * (s0 - ramp / 2);
      const fl = Math.hypot(endAt[0] - endPos[0], endAt[2] - endPos[2]);
      const fx = ((endAt[0] - endPos[0]) / fl) * travel, fz = ((endAt[2] - endPos[2]) / fl) * travel;
      cam = new Camera();
      cam.pos = [lerp(top.pos[0], endPos[0], tilt) + fx, lerp(top.pos[1], endPos[1], ease.inOutQuad(tilt)), lerp(top.pos[2], endPos[2], tilt) + fz];
      cam.target = [lerp(top.target[0], endAt[0], tilt) + fx, 0, lerp(top.target[2], endAt[2], tilt) + fz];
      cam.roll = 0.05 * Math.sin(tilt * Math.PI);
    }
    cam.near = 1;
    d.setCamera(cam);
    const G = groundModel(PX, 0, 0, 0);
    const fwd = cam.basis().f;
    // haze: far things fade toward a floor, so the horizon glows instead of burning
    const fog: [number, number, number] = view === 1 ? [3000, 14000, 0.12] : [lerp(9000, 900, tilt), lerp(30000, 4200, tilt), 0.12];

    // the plan of streets: there before any lamp, a little brighter at the very first frame
    const planC = mixc(hex('#33467a'), NIGHT.plan, prog(t, 0, 2.5, ease.outQuad));
    d.lines(this.plan, { model: G, color: withA(planC, 1), wScale: 0.9, fog });

    // lamps: the Loop is already lit at the first frame; then rings from the zero point, a ring a beat
    const beats = Math.max(0, sc.beatAt(t) - sc.beatAt(b3));
    const ring = 650 + (beats <= 0 ? 0 : 900 * Math.pow(beats, 1.45));
    const pulse = 1 + 0.35 * sc.hit('bass', t, 0.2);
    // the city's own glow in the air over it, sodium in the haze (and the first frame is not black)
    if (view < 2) {
      d.setModel(G);
      d.dotStyle({ world: true, blend: 'add' });
      const glowR = 650 + ring * 0.35;
      // densest at the first frame, close over the Loop, thinning as the camera climbs out of it
      const thick = view === 0 ? lerp(2.6, 1.2, clamp(f.p)) : 1.2;
      for (const [r, a] of [[1.0, 0.010], [0.6, 0.014], [0.32, 0.02]] as [number, number][]) d.dot([0, 0, 0], glowR * r * PX, L('sodium', a * thick), 1);
      d.flush();
      d.setModel(null);
    }
    d.lines(this.lit, { model: G, reveal: ring, soft: 1400, color: L('sodium', 0.5 * pulse), wScale: 1.0, fog });
    // lamp radius in world units (a lamp's pool of light, ~9 m), clamped to stay a point far off
    d.dots(this.lamps, { model: G, reveal: ring, soft: 900, color: L('sodium', 1.3), world: true, rScale: 0.9 * lerp(1.0, 0.25, ease.inQuad(tilt)),
      rClamp: [0.7, 3.2], flicker: 0.25, time: t, fog });

    // traffic on the expressways once the lamps reach them
    const ta = prog(t, b3 + 1.0, b5 - 0.6, ease.inOutQuad);
    if (ta > 0) {
      d.setModel(G);
      drawTraffic(d, this.ways, t, { classes: [0], density: lerp(1.6, 3.5, tilt), speed: lerp(380, 120, tilt), trail: lerp(260, 60, tilt),
        width: lerp(1.1, 1.6, tilt), head: L('halide', 0.9 * ta), tail: L('tail', 0.9 * ta), side: 0,
        view: [fwd[0], -fwd[2]], fog });
      d.setModel(null);
    }

    // the axes of the address grid: State (x = 0) and Madison (y = 0), ticked every mile
    const axA = (1 - prog(t, b5, vox - 0.8)) * (0.75 + 0.25 * prog(t, 0, 1.2, ease.outQuad));
    if (axA > 0.01) {
      const span = 40 * MILE;
      d.setModel(G);
      d.lineStyle({});
      const ax = withA(L('halide', 0.9), axA);
      d.seg([-span, 0, 0], [span * 0.25, 0, 0], 1.3, ax);
      d.seg([0, -span, 0], [0, span, 0], 1.3, ax);
      for (let k = -20; k <= 20; k++) {
        if (!k) continue;
        const m = k * MILE;
        d.seg([m, -90, 0], [m, 90, 0], 1, withA(ax, axA * 0.8));
        d.seg([-90, m, 0], [90, m, 0], 1, withA(ax, axA * 0.8));
      }
      d.flush();
      d.setModel(null);
      const tk = withA(NIGHT.note, axA);
      // world units per screen pixel at the ground, so labels keep one size on screen
      const upp = (h0 * 2 * Math.tan(cam.fov / 2)) / 1080;
      const gap = 14 * upp / PX; // metres
      const lab = (txt: string, x: number, y: number, align: 'left' | 'right' | 'center') => {
        // labels lie on the ground; their size is set in screen pixels
        const base = chain(G, translate(x, y, 0), scale(upp / PX, upp / PX, 1));
        label(d, fonts, txt, 0, 0, 17, tk, { align, base, tracking: 0.04 });
      };
      const every = h0 > 1300 ? 4 : h0 > 800 ? 2 : 1;
      for (let k = 1; k <= 24; k++) {
        if (k % every) continue;
        const n = String(k * 800);   // Chicago writes addresses without a comma
        lab(`${n} W`, -k * MILE, -gap, 'center');
        lab(`${n} N`, gap, -k * MILE + gap * 0.4, 'left');
        lab(`${n} S`, gap, k * MILE + gap * 0.4, 'left');
      }
      lab('0   STATE & MADISON', gap, -gap, 'left');
    }
    void rotX; void mixc; void clamp;
    return { bloom: 0.28, threshold: 0.95 };
  }
}
