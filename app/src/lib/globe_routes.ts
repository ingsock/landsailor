// The world's air routes (OpenFlights, 2014) as low arcs over the globe, kept on the GPU as one line
// mesh. Each segment carries its angle from a chosen place (radians), so a ring running out from
// that place can switch the routes on as it passes (reveal) and flare them at its front (pulse).
// A share of the routes also carry a light along them, a flight, drawn each frame.
import { Draw, LineMesh } from '../engine/draw';
import { M4, RGBA, V3, apply, fract, lerp, mulberry32 } from '../engine/math';
import { arc } from './geo';
import { unit } from './globe';

type Flight = { pts: Float32Array; cum: Float32Array; len: number; ang: number; seed: number; speed: number };

export class RouteSet {
  mesh: LineMesh;
  flights: Flight[] = [];

  constructor(public d: Draw, routes: [number, number, number, number][], public R: number, from: [number, number],
    o: { lift?: number; width?: number; flights?: number; seed?: number } = {}) {
    const c = unit(from[0], from[1]);
    const lift = o.lift ?? 0.05, w = o.width ?? 0.7;
    const out: number[] = [];
    const rnd = mulberry32(o.seed ?? 5);
    const share = Math.min(1, (o.flights ?? 0) / Math.max(1, routes.length));
    for (const [lon0, lat0, lon1, lat1] of routes) {
      const u0 = unit(lon0, lat0), u1 = unit(lon1, lat1);
      const om = Math.acos(Math.max(-1, Math.min(1, u0[0] * u1[0] + u0[1] * u1[1] + u0[2] * u1[2])));
      if (om < 0.004) continue;
      const n = Math.max(3, Math.min(48, Math.ceil(om / 0.06)));
      const pts = arc([lon0, lat0], [lon1, lat1], R, lift, n);
      const ang0 = Math.acos(Math.max(-1, Math.min(1, u0[0] * c[0] + u0[1] * c[1] + u0[2] * c[2])));
      for (let j = 0; j < n; j++) {
        const ax = pts[j * 3], ay = pts[j * 3 + 1], az = pts[j * 3 + 2];
        const bx = pts[j * 3 + 3], by = pts[j * 3 + 4], bz = pts[j * 3 + 5];
        const mx = ax + bx, my = ay + by, mz = az + bz, ml = Math.hypot(mx, my, mz) || 1;
        const ang = Math.acos(Math.max(-1, Math.min(1, (mx * c[0] + my * c[1] + mz * c[2]) / ml)));
        out.push(ax, ay, az, bx, by, bz, 1, 1, 1, 1, w, ang, ang);
      }
      if (rnd() < share) {
        const cum = new Float32Array(n + 1);
        for (let j = 1; j <= n; j++) cum[j] = cum[j - 1] + Math.hypot(pts[j * 3] - pts[j * 3 - 3], pts[j * 3 + 1] - pts[j * 3 - 2], pts[j * 3 + 2] - pts[j * 3 - 1]);
        // a flight goes one way or the other
        const fwd = rnd() < 0.5;
        const P = new Float32Array(pts);
        if (!fwd) for (let j = 0; j <= n / 2; j++) for (let k = 0; k < 3; k++) { const a = P[j * 3 + k]; P[j * 3 + k] = P[(n - j) * 3 + k]; P[(n - j) * 3 + k] = a; }
        if (!fwd) { const L = cum[n]; const r = new Float32Array(n + 1); for (let j = 0; j <= n; j++) r[j] = L - cum[n - j]; cum.set(r); }
        this.flights.push({ pts: P, cum, len: cum[n], ang: ang0, seed: rnd(), speed: 0.35 + 0.4 * rnd() });
      }
    }
    this.mesh = d.makeLines(new Float32Array(out));
  }

  private at(f: Flight, s: number): V3 {
    let lo = 0, hi = f.cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (f.cum[m] <= s) lo = m; else hi = m; }
    const k = f.cum[hi] > f.cum[lo] ? (s - f.cum[lo]) / (f.cum[hi] - f.cum[lo]) : 0;
    const p = f.pts;
    return [lerp(p[lo * 3], p[hi * 3], k), lerp(p[lo * 3 + 1], p[hi * 3 + 1], k), lerp(p[lo * 3 + 2], p[hi * 3 + 2], k)];
  }

  /** the arcs; `reveal` is the angle from the chosen place up to which they are on */
  draw(model: M4, o: { reveal?: number; soft?: number; color?: RGBA; pulseAt?: number; pulseWidth?: number; pulseGain?: number;
    cull?: [number, number, number, number]; blend?: 'add' | 'max' } = {}) {
    this.d.lines(this.mesh, { model, reveal: o.reveal ?? 10, soft: o.soft ?? 0.3, color: o.color, pulseAt: o.pulseAt, pulseWidth: o.pulseWidth,
      pulseGain: o.pulseGain, cull: o.cull, blend: o.blend || 'add' });
  }

  /** the flights: a light and a short trail running along each route that the ring has reached.
   *  `units` is how many world units a unit of the globe's object space is (the model's scale) */
  drawFlights(model: M4, t: number, o: { reveal?: number; color?: RGBA; size?: number; trail?: number; rate?: number } = {}) {
    const d = this.d;
    const reveal = o.reveal ?? 10, c = o.color || [1, 1, 1, 1], size = o.size ?? 1.6, trail = o.trail ?? 0.06, rate = o.rate ?? 1;
    d.setModel(model);
    d.lineStyle({ blend: 'add' });
    const heads: V3[] = [];
    // the globe in the world, to leave out flights on its far side and low over its limb
    const C: V3 = [model[12], model[13], model[14]];
    const cam = d.cam.pos;
    for (const f of this.flights) {
      if (f.ang > reveal) continue;
      const u = fract(t * f.speed * rate * (2.2 / Math.max(0.3, f.len / this.R)) * 0.25 + f.seed);
      const s = u * f.len;
      const head = this.at(f, s);
      const w = apply(model, head);
      const nx = w[0] - C[0], ny = w[1] - C[1], nz = w[2] - C[2], nl = Math.hypot(nx, ny, nz) || 1;
      const vx = cam[0] - w[0], vy = cam[1] - w[1], vz = cam[2] - w[2], vl = Math.hypot(vx, vy, vz) || 1;
      const facing = (nx * vx + ny * vy + nz * vz) / (nl * vl);
      if (facing < 0.12) continue;
      const a = Math.sin(Math.PI * u) * Math.min(1, (facing - 0.12) / 0.25);
      for (let k = 0; k < 3; k++) {
        const s0 = s - (trail * f.len * k) / 3, s1 = s - (trail * f.len * (k + 1)) / 3;
        if (s1 < 0) break;
        const w0 = (1 - k / 3) * a, w1 = (1 - (k + 1) / 3) * a;
        d.seg(this.at(f, s0), this.at(f, s1), size * 0.7, [c[0] * w0, c[1] * w0, c[2] * w0, 1], size * 0.7, [c[0] * w1, c[1] * w1, c[2] * w1, 1]);
      }
      heads.push(head);
    }
    d.flush();
    d.lineStyle({});
    d.dotStyle({ blend: 'add' });
    for (const h of heads) d.dot(h, size, c, 1);
    d.flush();
    d.setModel(null);
  }
}
