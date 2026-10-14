// Every nail shown (scenes/outro1.ts, nails): Chicago taken apart into its layers, each a plate of
// the same square of the city lifted off the one under it, as in an exploded drawing. Here: the
// layers cut to the plate's square (segments clipped exactly at its edge, so the plates have clean
// edges), their lengths as mapped, and the lake's outline on the plate.
import { Segs } from './city';
import { shoreAtY } from './relight_city';

export type Box = [number, number, number, number];

/** the segments of `segs` (ax ay bx by class key) inside the box, cut at its edges (Liang-Barsky) */
export function clipSegs(segs: Segs, box: Box, classes?: number[]): Float32Array {
  const [x0, y0, x1, y1] = box;
  const out: number[] = [];
  const n = segs.length / 6;
  for (let i = 0; i < n; i++) {
    const ax = segs[i * 6], ay = segs[i * 6 + 1], bx = segs[i * 6 + 2], by = segs[i * 6 + 3], cls = segs[i * 6 + 4], k = segs[i * 6 + 5];
    if (classes && !classes.includes(cls)) continue;
    const dx = bx - ax, dy = by - ay;
    let t0 = 0, t1 = 1;
    const p = [-dx, dx, -dy, dy], q = [ax - x0, x1 - ax, ay - y0, y1 - ay];
    let ok = true;
    for (let j = 0; j < 4; j++) {
      if (p[j] === 0) { if (q[j] < 0) { ok = false; break; } continue; }
      const r = q[j] / p[j];
      if (p[j] < 0) { if (r > t1) { ok = false; break; } if (r > t0) t0 = r; }
      else { if (r < t0) { ok = false; break; } if (r < t1) t1 = r; }
    }
    if (!ok || t1 - t0 < 1e-6) continue;
    out.push(ax + dx * t0, ay + dy * t0, ax + dx * t1, ay + dy * t1, cls, k);
  }
  return new Float32Array(out);
}

/** kilometres of the segments (optionally of some classes) */
export function lengthKm(segs: Segs, classes?: number[]): number {
  let s = 0;
  const n = segs.length / 6;
  for (let i = 0; i < n; i++) {
    if (classes && !classes.includes(segs[i * 6 + 4])) continue;
    s += Math.hypot(segs[i * 6 + 2] - segs[i * 6], segs[i * 6 + 3] - segs[i * 6 + 1]);
  }
  return s / 1000;
}

/** the lake on the plate: from the shore along the box's height to its east edge (flat xy, metres);
 *  and the shore itself as a polyline */
export function lakeOnPlate(shore: Float32Array, box: Box, step = 60): { poly: number[]; line: number[] } {
  const [x0, y0, x1, y1] = box;
  const pts: number[] = [];
  for (let y = y0; y <= y1 + 1e-6; y += step) {
    const x = Math.max(x0, Math.min(x1, shoreAtY(shore, y) - 40));
    pts.push(x, Math.min(y, y1));
  }
  const poly = pts.slice();
  poly.push(x1, y1, x1, y0);
  const line: number[] = [];
  for (let i = 0; i < pts.length; i += 2) line.push(pts[i], pts[i + 1], 0);
  return { poly, line };
}
