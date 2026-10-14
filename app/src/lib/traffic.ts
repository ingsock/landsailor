// Traffic on Chicago's expressways: cars as pairs of lights moving along the real carriageways,
// drawn as short light trails. Positions are a pure function of time.
import { Draw } from '../engine/draw';
import { RGBA, mulberry32, withA } from '../engine/math';

export type Way = { c: number; oneway: boolean; name: string; lanes: number; pts: number[][]; cum: number[]; len: number };

export async function loadWays(): Promise<Way[]> {
  const raw = await (await fetch('/data/geo/chi_traffic.json')).json();
  return raw.map((w: any) => {
    const cum = [0];
    for (let i = 1; i < w.pts.length; i++) cum.push(cum[i - 1] + Math.hypot(w.pts[i][0] - w.pts[i - 1][0], w.pts[i][1] - w.pts[i - 1][1]));
    return { ...w, cum, len: cum[cum.length - 1] };
  });
}

/** point and unit direction at arc length s along a way */
export function along(w: Way, s: number): [number, number, number, number] {
  s = Math.max(0, Math.min(w.len, s));
  let lo = 0, hi = w.cum.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (w.cum[m] <= s) lo = m; else hi = m; }
  const a = w.pts[lo], b = w.pts[hi];
  const L = w.cum[hi] - w.cum[lo] || 1;
  const t = (s - w.cum[lo]) / L;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, (b[0] - a[0]) / L, (b[1] - a[1]) / L];
}

export type TrafficOpts = {
  classes?: number[];
  /** cars per km per lane */
  density?: number;
  /** metres per second (time-lapse speeds are fine) */
  speed?: number;
  /** trail length in metres */
  trail?: number;
  head?: RGBA;
  tail?: RGBA;
  width?: number;
  seed?: number;
  /** only ways passing within this box (metres) */
  box?: [number, number, number, number];
  /** drive on the right: offset lights to the right of the way's direction by this many metres */
  side?: number;
  /** the camera's forward direction on the map (east, south): cars coming toward it show headlights */
  view?: [number, number];
  fog?: [number, number, number];
};

/** draw the traffic at time t: each car a short streak from its lights back along the road */
export function drawTraffic(d: Draw, ways: Way[], t: number, o: TrafficOpts = {}) {
  const rnd = mulberry32(o.seed || 11);
  const speed = o.speed ?? 40;
  const trail = o.trail ?? 40;
  const dens = o.density ?? 6;
  const head = o.head || [1, 1, 1, 1];
  const tail = o.tail || [1, 0.2, 0.1, 1];
  const w = o.width ?? 1.2;
  d.lineStyle({ blend: 'add', fog: o.fog });
  const vw = o.view || [0, -1];
  for (const way of ways) {
    if (o.classes && !o.classes.includes(way.c)) continue;
    if (o.box) {
      const [x0, y0, x1, y1] = o.box;
      const p = way.pts[0], q = way.pts[way.pts.length - 1];
      if (Math.max(p[0], q[0]) < x0 || Math.min(p[0], q[0]) > x1 || Math.max(p[1], q[1]) < y0 || Math.min(p[1], q[1]) > y1) continue;
    }
    const n = Math.max(1, Math.round((way.len / 1000) * dens * Math.max(1, way.lanes)));
    const dirs = way.oneway ? [1] : [1, -1];
    for (const dir of dirs) {
      for (let i = 0; i < n; i++) {
        const off = rnd() * way.len;
        const v = speed * (0.8 + 0.4 * rnd());
        let s = (off + v * t) % way.len;
        if (dir < 0) s = way.len - s;
        const [x, y, dx, dy] = along(way, s);
        const [bx, by] = along(way, s - dir * trail);
        const sx = -dy * dir * (o.side ?? 0), sy = dx * dir * (o.side ?? 0);
        // a car coming toward the camera shows its headlights, one going away its tail lights
        const toward = dx * dir * vw[0] + dy * dir * vw[1] < 0;
        const col = toward ? head : tail;
        d.seg([x + sx, y + sy, 0], [bx + sx, by + sy, 0], w, col, w * 0.6, withA(col, 0));
      }
    }
  }
  d.flush();
  d.lineStyle({});
}
