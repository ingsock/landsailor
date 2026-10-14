// The data hall, drawn as an architect's cutaway: the building cut open at z = 0 (section A-A, the
// cut drawn in heavy line and hatching: the ground, the duct bank where the fibre comes in, the slab,
// the raised floor on its pedestals, the racks in section with every server in them, the trays) and
// its ceiling taken away ("removed for clarity", drawn dashed where it was), so that from above
// the hall runs away in perspective: rows of racks as solid boxes, their status lights blinking each
// at its own rate, cable trays and fibre runners overhead with light running along the fibres, the
// cold aisles' perforated tiles breathing mist, the air handlers on the walls turning. Nobody is in
// it. Units are metres; y is down, z runs away from the cut; y = 0 is the raised floor's surface,
// y = 0.6 the slab it stands on.
import { Camera } from '../engine/camera';
import { Draw } from '../engine/draw';
import { RGBA, V3, fract, hash2, lerp, mulberry32, withA } from '../engine/math';
import { L } from './palette';
import { INK, TONE, GROUND, arrowHead, concrete, hatch, outline, planeX, planeY, planeZ, rectC } from './hall_draft';

export const POD = 4.8;            // cold aisle, rack, hot aisle, rack
export const RACK_D = 1.2, RACK_H = 2.0, RACK_W = 0.6, U = 0.0445;
export const HALL_L = 24;          // the hall's depth beyond the cut
export const CEIL = -3.4, PLENUM = 0.6, SLAB = 0.9, GROUND_Y = 2.2;
export const TRAY_Y = -2.45, RUNNER_Y = -2.8;
const PODS = [-3, -2, -1, 0, 1, 2];
export const X_MIN = -15.6, X_MAX = 15.6;   // the hall's walls (inner faces)
const WALL = 0.35;

type Led = { y: number; z: number; rate: number; ph: number; duty: number; kind: number };
type Device = { u0: number; n: number; leds: Led[] };
export type Row = { x0: number; x1: number; front: -1 | 1; racks: Device[][] };
export type Aisle = { x0: number; x1: number; cold: boolean };

/** a rack, filled with devices from the floor up (1U to 4U, blanking panels between) */
function stack(rnd: () => number): Device[] {
  const out: Device[] = [];
  let u = 1 + Math.floor(rnd() * 2);
  while (u < 41) {
    const r = rnd();
    const n = r < 0.42 ? 1 : r < 0.75 ? 2 : r < 0.9 ? 4 : 3;
    if (u + n > 42) break;
    if (rnd() < 0.12) { u += n; continue; }           // a blank
    const leds: Led[] = [];
    const m = 1 + Math.floor(rnd() * (n > 1 ? 3 : 2));
    for (let i = 0; i < m; i++) {
      const k = rnd();
      leds.push({ y: (u + n * (0.3 + 0.4 * rnd())) * U, z: 0.05 + 0.07 * i + 0.25 * (k > 0.7 ? 1 : 0), rate: 0.6 + 9 * rnd() * rnd(), ph: rnd(), duty: 0.25 + 0.6 * rnd(),
        kind: k > 0.965 ? 3 : k > 0.9 ? 2 : k > 0.55 ? 1 : 0 });
    }
    out.push({ u0: u, n, leds });
    u += n;
  }
  return out;
}

const circ = (cx: number, cy: number, r: number, n = 24): number[] => {
  const p: number[] = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; p.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
  return p;
};

export class DataHall {
  rows: Row[] = [];
  aisles: Aisle[] = [];
  /** where the fibre comes up out of the duct bank (x) */
  entry = 5.9;
  constructor() {
    const rnd = mulberry32(42);
    for (const k of PODS) {
      const x = k * POD;
      this.aisles.push({ x0: x, x1: x + 1.2, cold: true });
      this.rows.push({ x0: x + 1.2, x1: x + 2.4, front: -1, racks: [] });
      this.aisles.push({ x0: x + 2.4, x1: x + 3.6, cold: false });
      this.rows.push({ x0: x + 3.6, x1: x + 4.8, front: 1, racks: [] });
    }
    const last = PODS[PODS.length - 1] * POD + POD;
    this.aisles.push({ x0: last, x1: last + 1.2, cold: true });
    const n = Math.round(HALL_L / RACK_W);
    for (const r of this.rows) for (let i = 0; i < n; i++) r.racks.push(stack(rnd));
  }

  /** the side of a row the camera sees, or null if it is straight above it */
  side(r: { x0: number; x1: number }, cam: Camera): number | null {
    return cam.pos[0] > r.x1 ? r.x1 : cam.pos[0] < r.x0 ? r.x0 : null;
  }

  /** everything behind the cut, in perspective: faces first (they fill the depth buffer), then the
   *  lines and lights that lie on them */
  beyond(d: Draw, t: number, cam: Camera, beat = -1) {
    const far = HALL_L, e = 0.012;
    d.depth(true);
    // ---- faces
    d.rect(X_MIN - 3, 0, X_MAX - X_MIN + 3, far, TONE(0.003), planeY(0));
    // the walls that stand, the far one and the right one (inner faces), cut where the ceiling was
    d.rect(X_MIN - 3, CEIL, X_MAX - X_MIN + 3, -CEIL, TONE(0.007), planeZ(far));
    d.rect(0, CEIL, far, -CEIL, TONE(0.005), planeX(X_MAX));
    for (const r of this.rows) {
      const sx = this.side(r, cam);
      const isFront = sx !== null && ((r.front > 0 && sx === r.x1) || (r.front < 0 && sx === r.x0));
      if (sx !== null) d.rect(0, -RACK_H, far - 0.6, RACK_H, TONE(isFront ? 0.008 : 0.004), planeX(sx));
      d.rect(r.x0, 0, r.x1 - r.x0, far - 0.6, TONE(0.011), planeY(-RACK_H));
      d.rect(r.x0, -RACK_H, r.x1 - r.x0, RACK_H, TONE(0.006), planeZ(far - 0.6));
    }
    // the hot aisles' containment: a glazed roof over each
    for (const a of this.aisles) if (!a.cold) d.rect(a.x0, 0, a.x1 - a.x0, far - 0.6, TONE(0.006), planeY(-RACK_H - 0.02));
    // the air handlers along the right wall: boxes standing against it
    for (let z = 2.2; z < far - 2; z += 5.4) {
      const x0 = X_MAX - 0.9;
      d.rect(z, -1.95, 2.4, 1.95, TONE(0.008), planeX(x0));
      d.rect(x0, z, 0.9, 2.4, TONE(0.012), planeY(-1.95));
    }
    // ---- lines, fading with distance like the light in a long room
    const fog: [number, number, number] = [16, 52, 0.35];
    d.lineStyle({ fog });
    const edge = INK(0.5), det = INK(0.2), faint = INK(0.09);
    // the far wall and the right wall
    d.setModel(planeZ(far - e));
    outline(d, rectC(X_MIN - 3, CEIL, X_MAX, 0), 1.2, edge);
    outline(d, rectC(-0.5, -2.15, 0.5, 0), 0.9, edge);
    d.flush();
    d.setModel(planeX(X_MAX - e));
    outline(d, rectC(0, CEIL, far, 0), 1.2, edge);
    d.flush();
    // the walls' tops, cut: hatched strips; and where the ceiling was, dashed ("removed for clarity")
    d.setModel(planeY(CEIL - e));
    hatch(d, rectC(X_MIN - 3, far, X_MAX + WALL, far + WALL), 0.12, -Math.PI / 4, 0.7, INK(0.4));
    hatch(d, rectC(X_MAX, 0, X_MAX + WALL, far), 0.12, -Math.PI / 4, 0.7, INK(0.4));
    outline(d, rectC(X_MIN - 3, far, X_MAX + WALL, far + WALL), 1.6, INK(0.9));
    outline(d, rectC(X_MAX, 0, X_MAX + WALL, far + WALL), 1.6, INK(0.9));
    d.lineStyle({ dash: [0.5, 0.55], fog });
    outline(d, rectC(X_MIN - 3, 0, X_MAX, far), 0.9, INK(0.32), false);
    d.lineStyle({ fog });
    d.flush();
    d.setModel(null);
    // the air handlers: their fronts, each with two fans turning behind a grille
    for (let z = 2.2; z < far - 2; z += 5.4) {
      d.setModel(planeX(X_MAX - 0.9 - e));
      outline(d, rectC(z, -1.95, z + 2.4, 0), 1.1, edge);
      for (let y = -1.85; y < -1.2; y += 0.08) d.seg([z + 0.1, y, 0], [z + 2.3, y, 0], 0.5, faint);
      for (const fz of [z + 0.65, z + 1.75]) {
        const fy = -0.62;
        outline(d, circ(fz, fy, 0.42, 40), 0.9, det);
        const sp = t * 6 + fz;
        for (let b = 0; b < 5; b++) {
          const a = sp + (b * Math.PI * 2) / 5;
          d.seg([fz, fy, 0], [fz + Math.cos(a) * 0.38, fy + Math.sin(a) * 0.38, 0], 0.9, INK(0.32));
        }
      }
      d.flush();
    }
    d.setModel(null);
    // floor tiles in the aisles, the cold aisles' perforated tiles marked
    d.setModel(planeY(-e));
    for (const a of this.aisles) {
      for (let x = a.x0; x <= a.x1 + 1e-6; x += 0.6) d.seg([x, 0, 0], [x, far, 0], 0.7, det);
      for (let z = 0; z <= far; z += 0.6) d.seg([a.x0, z, 0], [a.x1, z, 0], 0.6, faint);
      if (a.cold) for (let z = 0.6; z < far; z += 1.2) for (let x = a.x0; x < a.x1 - 0.1; x += 0.6) {
        for (let i = 1; i < 5; i++) d.seg([x + 0.08, z + i * 0.12, 0], [x + 0.52, z + i * 0.12, 0], 0.5, faint);
      }
    }
    d.flush();
    d.setModel(null);
    // rows: edges, rack divisions, the servers' faces on the side the camera sees
    d.lineStyle({ fog });
    const zEnd = far - 0.6;
    for (const r of this.rows) {
      const sx = this.side(r, cam);
      const top = -RACK_H - e;
      d.seg([r.x0 - e, top, 0], [r.x0 - e, top, zEnd], 1.3, edge);
      d.seg([r.x1 + e, top, 0], [r.x1 + e, top, zEnd], 1.3, edge);
      d.seg([r.x0 - e, top, zEnd], [r.x1 + e, top, zEnd], 1.1, edge);
      // the rack divisions on the top, and the vents
      for (let i = 1; i < r.racks.length; i++) d.seg([r.x0, top, i * RACK_W], [r.x1, top, i * RACK_W], 0.7, det);
      for (let i = 0; i < r.racks.length; i++) {
        const z0 = i * RACK_W;
        d.seg([r.x0 + 0.35, top, z0 + 0.15], [r.x1 - 0.35, top, z0 + 0.15], 0.5, faint);
        d.seg([r.x0 + 0.35, top, z0 + 0.45], [r.x1 - 0.35, top, z0 + 0.45], 0.5, faint);
      }
      if (sx === null) continue;
      const X = sx + (sx === r.x1 ? e : -e);
      d.seg([X, -e, 0], [X, -e, zEnd], 1.2, edge);
      d.seg([X, -RACK_H, zEnd], [X, 0, zEnd], 1.1, edge);
      const isFront = (r.front > 0 && sx === r.x1) || (r.front < 0 && sx === r.x0);
      for (let i = 0; i < r.racks.length; i++) {
        const z0 = i * RACK_W;
        if (i) d.seg([X, -RACK_H, z0], [X, 0, z0], 0.9, det);
        if (isFront) {
          // device by device: the joints between them; far off, only the bigger ones
          const near = z0 < 14;
          for (const dv of r.racks[i]) {
            if (!near && dv.n < 2) continue;
            const y = -dv.u0 * U;
            d.seg([X, y, z0 + 0.03], [X, y, z0 + RACK_W - 0.03], 0.55, faint);
          }
        } else {
          // the backs: power strips and the cables hanging down them
          d.seg([X, -1.9, z0 + 0.06], [X, -0.1, z0 + 0.06], 0.6, faint);
          d.seg([X, -1.9, z0 + 0.54], [X, -0.1, z0 + 0.54], 0.6, faint);
          const h = hash2(i, r.x0);
          d.seg([X, -1.95, z0 + 0.2 + 0.2 * h], [X, -0.05, z0 + 0.25 + 0.15 * h], 0.5, faint);
        }
      }
    }
    // the containment roofs: frames and glazing bars; doors at the far end
    for (const a of this.aisles) if (!a.cold) {
      const y = -RACK_H - 0.02 - e;
      for (let z = 0; z < zEnd; z += 1.2) {
        d.seg([a.x0, y, z], [a.x1, y, z], 0.8, det);
        d.seg([a.x0 + 0.1, y, z + 0.1], [a.x1 - 0.1, y, z + 1.1], 0.5, faint);
      }
      d.seg([a.x0, y, zEnd], [a.x1, y, zEnd], 1, edge);
      d.setModel(planeZ(zEnd - e));
      outline(d, rectC(a.x0 + 0.05, -RACK_H, a.x1 - 0.05, 0), 0.9, edge);
      d.seg([(a.x0 + a.x1) / 2, -RACK_H, 0], [(a.x0 + a.x1) / 2, 0, 0], 0.7, det);
      d.flush();
      d.setModel(null);
    }
    // the cable trays: ladders over the rows on rods up to where the ceiling was, cables in them
    for (const r of this.rows) {
      const xc = (r.x0 + r.x1) / 2, a = xc - 0.25, b = xc + 0.25;
      d.seg([a, TRAY_Y, 0], [a, TRAY_Y, far], 1.1, edge);
      d.seg([b, TRAY_Y, 0], [b, TRAY_Y, far], 1.1, edge);
      d.seg([a, TRAY_Y - 0.1, 0], [a, TRAY_Y - 0.1, far], 0.7, det);
      d.seg([b, TRAY_Y - 0.1, 0], [b, TRAY_Y - 0.1, far], 0.7, det);
      for (let z = 0.15; z < far; z += 0.3) d.seg([a, TRAY_Y, z], [b, TRAY_Y, z], 0.6, det);
      for (let c = 0; c < 3; c++) d.seg([a + 0.12 + c * 0.13, TRAY_Y - 0.03, 0], [a + 0.12 + c * 0.13, TRAY_Y - 0.03, far], 0.6, faint);
      for (let z = 1.5; z < far; z += 3) {
        d.seg([a, TRAY_Y, z], [a, CEIL, z], 0.55, faint);
        d.seg([b, TRAY_Y, z], [b, CEIL, z], 0.55, faint);
      }
    }
    // fibre runners over the cold aisles
    for (const a of this.aisles) if (a.cold) {
      const xc = (a.x0 + a.x1) / 2;
      for (const x of [xc - 0.15, xc + 0.15]) {
        d.seg([x, RUNNER_Y, 0], [x, RUNNER_Y, far], 1, edge);
        d.seg([x, RUNNER_Y - 0.08, 0], [x, RUNNER_Y - 0.08, far], 0.6, det);
      }
      for (let z = 0.75; z < far; z += 3) d.seg([xc, RUNNER_Y - 0.08, z], [xc, CEIL, z], 0.55, faint);
    }
    d.flush();
    // light running along the fibres: short pulses, some going away, some coming
    d.lineStyle({ blend: 'add', fog: [18, 56, 0.45] });
    const rp = mulberry32(17);
    const zc = (z: number) => Math.max(0, Math.min(far, z));
    for (const a of this.aisles) if (a.cold) {
      const xc = (a.x0 + a.x1) / 2;
      for (let p = 0; p < 6; p++) {
        const dir = rp() < 0.5 ? 1 : -1, v = 9 + 9 * rp(), off = rp();
        const z = fract(off + (dir * t * v) / (far + 6)) * (far + 6) - 3;
        const len = 0.9 + 1.4 * rp();
        const x = xc + (rp() - 0.5) * 0.16;
        const head: V3 = [x, RUNNER_Y - 0.04, zc(z)], tail: V3 = [x, RUNNER_Y - 0.04, zc(z - dir * len)];
        d.seg(head, tail, 1.8, L('halide', 3), 0.6, L('halide', 0));
      }
    }
    // on every beat a burst leaves the cut along every runner at once and runs to the far wall
    if (beat >= 0) {
      const ph = fract(beat), z = ph * (far + 3);
      const k = 1 - 0.6 * ph;
      for (const a of this.aisles) if (a.cold) {
        const xc = (a.x0 + a.x1) / 2;
        for (const x of [xc - 0.05, xc + 0.05]) d.seg([x, RUNNER_Y - 0.04, zc(z)], [x, RUNNER_Y - 0.04, zc(z - 2.6)], 2.2, L('halide', 3.4 * k), 0.8, L('halide', 0));
      }
    }
    for (const r of this.rows) {
      const xc = (r.x0 + r.x1) / 2;
      for (let p = 0; p < 3; p++) {
        const dir = rp() < 0.5 ? 1 : -1, v = 6 + 8 * rp(), off = rp();
        const z = fract(off + (dir * t * v) / (far + 6)) * (far + 6) - 3;
        const x = xc - 0.13 + 0.13 * Math.floor(rp() * 3);
        d.seg([x, TRAY_Y - 0.03, zc(z)], [x, TRAY_Y - 0.03, zc(z - dir * 1.4)], 1.3, L('sodium', 2), 0.5, L('sodium', 0));
      }
    }
    d.flush();
    // the status lights, each at its own rate
    d.dotStyle({ world: true, blend: 'add' });
    const kinds: RGBA[] = [L('halide', 2.4), L('taxi', 3), L('sodium', 2.6), L('tail', 2.6)];
    for (const r of this.rows) {
      if ((r.front > 0 && cam.pos[0] <= r.x1) || (r.front < 0 && cam.pos[0] >= r.x0)) continue;
      const X = (r.front > 0 ? r.x1 : r.x0) + r.front * 0.02;
      for (let i = 0; i < r.racks.length - 1; i++) {
        const z0 = i * RACK_W;
        for (const dv of r.racks[i]) for (const l of dv.leds) {
          // steady, slow, or busy: busy lights flicker with traffic
          const on = l.rate > 6 ? hash2(Math.floor(t * 24), l.ph * 97 + i) < l.duty : fract(t * l.rate + l.ph) < l.duty;
          if (on) d.dot([X, -l.y, z0 + l.z], 0.016, kinds[l.kind], 0.3);
        }
      }
    }
    d.flush();
    // cold air off the perforated tiles: a mist that rises a little and drifts toward the racks
    const rm = mulberry32(5);
    for (const a of this.aisles) if (a.cold) {
      for (let p = 0; p < 30; p++) {
        const z = rm() * (far - 2) + 0.8, x0 = lerp(a.x0 + 0.2, a.x1 - 0.2, rm()), life = 3 + 3 * rm();
        const ph = fract(rm() + t / life);
        const x = x0 + (rm() - 0.5) * 0.6 * ph, y = -0.05 - ph * (0.5 + 1.0 * rm());
        d.dot([x, y, z], 0.2 + 0.4 * ph, withA(INK(0.045), Math.sin(ph * Math.PI)), 1);
      }
    }
    d.flush();
    d.depth(false);
  }

  /** the cut, at z = 0: what the section plane passes through, in heavy line and hatching */
  cut(d: Draw, t: number) {
    const M = planeZ(0);
    const cutW = 2.2, cutC = INK(1.0), mid = INK(0.4), thin = INK(0.2);
    const hx0 = X_MIN - 3, hx1 = X_MAX + WALL;
    d.setModel(M);
    // knock the cut's solids out of what is behind them
    const solids: number[][] = [rectC(hx0, PLENUM, hx1, GROUND_Y), rectC(hx0, 0, hx1, 0.035), rectC(X_MAX, CEIL, X_MAX + WALL, PLENUM)];
    for (const r of this.rows) solids.push(rectC(r.x0, -RACK_H, r.x1, 0));
    d.fill(solids, GROUND, M);
    d.lineStyle({});
    // ---- the ground, hatched in broken lines; the slab, concrete
    hatch(d, rectC(hx0, SLAB, hx1, GROUND_Y), 0.2, -Math.PI / 4, 0.7, INK(0.16), { dash: 0.14 });
    concrete(d, hx0, PLENUM, hx1, SLAB, 0.08, INK(0.34), 7);
    d.seg([hx0, PLENUM, 0], [hx1, PLENUM, 0], cutW, cutC);
    d.seg([hx0, SLAB, 0], [hx1, SLAB, 0], cutW * 0.7, cutC);
    d.seg([hx0, GROUND_Y, 0], [hx1, GROUND_Y, 0], cutW * 0.7, cutC);
    d.seg([hx0, 0, 0], [hx0, GROUND_Y, 0], cutW * 0.7, cutC);
    d.seg([hx1, PLENUM, 0], [hx1, GROUND_Y, 0], cutW * 0.7, cutC);
    // the duct bank under the slab, where the fibre comes in from the street
    const db = { x0: this.entry - 0.95, x1: this.entry + 1.25, y0: 1.15, y1: 1.95 };
    d.fill([rectC(db.x0, db.y0, db.x1, db.y1)], GROUND, M);
    concrete(d, db.x0, db.y0, db.x1, db.y1, 0.06, INK(0.32), 11);
    d.lineStyle({});
    outline(d, rectC(db.x0, db.y0, db.x1, db.y1), 1.7, cutC);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
      const cx = db.x0 + 0.38 + i * 0.5, cy = db.y0 + 0.22 + j * 0.36;
      d.fill([circ(cx, cy, 0.12)], GROUND, M);
      outline(d, circ(cx, cy, 0.12), 1, INK(0.75));
    }
    // the service entrance: a conduit up out of the duct bank, through the slab, into the plenum,
    // the fibre in it lit, light going up into the building
    const sx = this.entry;
    d.fill([rectC(sx - 0.065, 0.04, sx + 0.065, db.y0)], GROUND, M);
    d.seg([sx - 0.065, 0.04, 0], [sx - 0.065, db.y0, 0], 1.2, INK(0.8));
    d.seg([sx + 0.065, 0.04, 0], [sx + 0.065, db.y0, 0], 1.2, INK(0.8));
    d.flush();
    d.lineStyle({ blend: 'add' });
    for (let p = 0; p < 3; p++) {
      const y = db.y0 + 0.2 - fract(t * 0.9 + p / 3) * (db.y0 + 0.1);
      d.seg([sx, Math.min(db.y0, y + 0.25), 0], [sx, Math.max(0.04, y), 0], 2.2, L('halide', 0), 2.2, L('halide', 3));
    }
    d.flush();
    d.lineStyle({});
    // ---- the raised floor: tiles on pedestals, and the plenum under them
    d.seg([hx0, 0, 0], [hx1, 0, 0], cutW, cutC);
    d.seg([hx0, 0.035, 0], [hx1, 0.035, 0], 0.9, mid);
    for (let x = Math.ceil(hx0 / 0.6) * 0.6; x <= hx1; x += 0.6) {
      d.seg([x, 0.035, 0], [x, PLENUM, 0], 0.9, mid);
      d.seg([x - 0.06, 0.05, 0], [x + 0.06, 0.05, 0], 1.1, mid);
      d.seg([x - 0.08, PLENUM - 0.01, 0], [x + 0.08, PLENUM - 0.01, 0], 1.3, mid);
    }
    d.flush();
    d.lineStyle({ blend: 'alpha' });
    for (const a of this.aisles) if (a.cold) {
      // perforated tiles: the joints left open
      for (let x = a.x0 + 0.06; x < a.x1 - 0.04; x += 0.07) d.seg([x, 0.004, 0], [x + 0.03, 0.004, 0], 2.6, GROUND);
    }
    d.flush();
    d.lineStyle({});
    // the right wall, cut
    hatch(d, rectC(X_MAX, CEIL, X_MAX + WALL, PLENUM), 0.1, -Math.PI / 4, 0.7, INK(0.32));
    outline(d, rectC(X_MAX, CEIL, X_MAX + WALL, PLENUM), cutW, cutC);
    // ---- the racks in section: frame, every device in it, its lights at the front
    for (const r of this.rows) {
      const fx = r.front > 0 ? r.x1 : r.x0, bx = r.front > 0 ? r.x0 : r.x1;
      const dx = r.front;
      outline(d, rectC(r.x0, -RACK_H, r.x1, 0), cutW, cutC);
      d.seg([fx - dx * 0.08, -RACK_H + 0.05, 0], [fx - dx * 0.08, -0.05, 0], 1.2, mid);
      d.seg([bx + dx * 0.12, -RACK_H + 0.05, 0], [bx + dx * 0.12, -0.05, 0], 1.2, mid);
      for (const dv of r.racks[0]) {
        const y0 = -(dv.u0 + dv.n) * U + 0.003, y1 = -dv.u0 * U - 0.003;
        const xa = fx - dx * 0.06, xb = fx - dx * (0.06 + (dv.n > 2 ? 0.95 : 0.8));
        outline(d, [xa, y0, xb, y0, xb, y1, xa, y1], 0.7, thin);
        if (dv.n >= 2) d.seg([lerp(xa, xb, 0.12), y0 + 0.008, 0], [lerp(xa, xb, 0.12), y1 - 0.008, 0], 0.6, thin);
      }
      outline(d, rectC(r.x0 + 0.02, -RACK_H, r.x1 - 0.02, -RACK_H + 0.06), 0.9, mid);
    }
    d.flush();
    // the hot aisles' containment roofs, in section
    for (const a of this.aisles) if (!a.cold) {
      d.fill([rectC(a.x0, -RACK_H - 0.05, a.x1, -RACK_H)], GROUND, M);
      outline(d, rectC(a.x0, -RACK_H - 0.05, a.x1, -RACK_H), 1.5, cutC);
    }
    // the trays in section: ladders with their cables, fibre runners with their fibres
    for (const r of this.rows) {
      const xc = (r.x0 + r.x1) / 2;
      outline(d, [xc - 0.25, TRAY_Y - 0.1, xc - 0.25, TRAY_Y, xc + 0.25, TRAY_Y, xc + 0.25, TRAY_Y - 0.1], 1.4, cutC, false);
      for (let i = 0; i < 9; i++) {
        const cx = xc - 0.2 + (i % 5) * 0.1 + (i >= 5 ? 0.05 : 0), cy = TRAY_Y - 0.025 - (i >= 5 ? 0.045 : 0);
        outline(d, circ(cx, cy, 0.022, 10), 0.7, mid);
      }
    }
    for (const a of this.aisles) if (a.cold) {
      const xc = (a.x0 + a.x1) / 2;
      outline(d, [xc - 0.15, RUNNER_Y - 0.08, xc - 0.15, RUNNER_Y, xc + 0.15, RUNNER_Y, xc + 0.15, RUNNER_Y - 0.08], 1.2, cutC, false);
    }
    d.flush();
    d.dotStyle({ world: true, blend: 'add' });
    for (const a of this.aisles) if (a.cold) {
      const xc = (a.x0 + a.x1) / 2;
      for (let i = 0; i < 3; i++) {
        const lit = 0.5 + 0.5 * Math.sin(t * (5 + i * 2.3) + a.x0);
        d.dot([xc - 0.07 + i * 0.07, RUNNER_Y - 0.03, 0], 0.017, L('halide', 0.6 + 2.4 * lit), 0.4);
      }
    }
    // the lights at the devices' fronts, in section
    for (const r of this.rows) {
      const fx = r.front > 0 ? r.x1 : r.x0;
      for (const dv of r.racks[0]) for (const l of dv.leds) {
        const on = fract(t * l.rate + l.ph) < l.duty;
        if (on) d.dot([fx - r.front * 0.035, -l.y, 0], 0.012, l.kind === 2 ? L('sodium', 2.4) : L('halide', 2.2), 0.3);
      }
    }
    d.flush();
    // ---- the air: cold out of the plenum, up through the tiles and into the racks' fronts; hot
    // out of their backs and up out of the containment. Dashed lines that flow.
    const flow = (pts: number[], speed: number, c: RGBA) => {
      d.lineStyle({ dash: [0.2, 0.55, -t * speed] });
      d.poly(pts, 1.2, c, { dim: 2 });
      d.flush();
      d.lineStyle({});
      const n = pts.length / 2;
      arrowHead(d, M, pts[n * 2 - 2], pts[n * 2 - 1], pts[n * 2 - 2] - pts[n * 2 - 4], pts[n * 2 - 1] - pts[n * 2 - 3], 0.13, c);
    };
    const cold = L('taxi', 0.9), hot = L('sodium', 0.75);
    for (const a of this.aisles) {
      const xc = (a.x0 + a.x1) / 2;
      if (a.cold) {
        flow([xc - 0.9, 0.42, xc - 0.3, 0.4, xc - 0.12, 0.12, xc - 0.12, -0.7, xc - 0.45, -1.15], 0.9, cold);
        flow([xc + 0.9, 0.42, xc + 0.3, 0.4, xc + 0.12, 0.12, xc + 0.12, -0.7, xc + 0.45, -1.15], 0.9, cold);
      } else {
        flow([xc - 0.42, -1.0, xc - 0.12, -1.6, xc - 0.1, -2.6, xc - 0.3, -3.2], 1.1, hot);
        flow([xc + 0.42, -1.0, xc + 0.12, -1.6, xc + 0.1, -2.6, xc + 0.3, -3.2], 1.1, hot);
      }
    }
    d.setModel(null);
  }
}
