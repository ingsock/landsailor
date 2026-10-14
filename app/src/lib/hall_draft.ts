// Drafting for the blueprint shots (the data hall, the wall in section). A technical drawing drawn
// as light, so that the blueprint grade (post.ts, look 4) prints it as white ink on cyanotype blue:
// line weight is brightness and width, a cut is hatched, a face is a pale wash, and the drawing
// carries its furniture (dimension strings, level marks, callouts on leaders, a title block, the
// sheet's border with its grid references). Everything here is drawn in a flat local plane whose
// model matrix the caller gives, so the same drawing can stand in the picture plane or lie in 3D.
import { Draw } from '../engine/draw';
import { Fonts } from '../engine/text';
import { M4, RGBA, V3, chain, cross, hex, mulberry32, norm, rotZ, translate, withA } from '../engine/math';
import { label } from './lyric';

/** ink: a line's weight as light (1 prints solid white; 0.1 a pale blue line) */
export const INK = (i: number, a = 1): RGBA => hex('#eef4ff', i, a);
/** an opaque face of a given (small) brightness: a wash of pale blue that hides what is behind it */
export const TONE = (i: number): RGBA => hex('#ffffff', i, 1);
/** the ground itself: paints a shape out of the drawing */
export const GROUND: RGBA = [0, 0, 0, 1];

/** a model whose local x runs along u and local y along v, with its origin at o */
export function basis(o: V3, u: V3, v: V3): M4 {
  const n = norm(cross(u, v));
  const m = new Float32Array(16);
  m[0] = u[0]; m[1] = u[1]; m[2] = u[2];
  m[4] = v[0]; m[5] = v[1]; m[6] = v[2];
  m[8] = n[0]; m[9] = n[1]; m[10] = n[2];
  m[12] = o[0]; m[13] = o[1]; m[14] = o[2]; m[15] = 1;
  return m;
}
/** the plane z = c (local x, y are world x, y) */
export const planeZ = (c: number): M4 => translate(0, 0, c);
/** the plane x = c, local x running along +z, local y along +y */
export const planeX = (c: number): M4 => basis([c, 0, 0], [0, 0, 1], [0, 1, 0]);
/** the plane y = c, local x along +x, local y along +z */
export const planeY = (c: number): M4 => basis([0, c, 0], [1, 0, 0], [0, 0, 1]);

/** a closed rectangle as a contour */
export const rectC = (x0: number, y0: number, x1: number, y1: number): number[] => [x0, y0, x1, y0, x1, y1, x0, y1];

/** clip the infinite line p + t·dir to a convex polygon (flat xy pairs, either winding): [t0, t1] or null */
function clipConvex(px: number, py: number, dx: number, dy: number, poly: ArrayLike<number>): [number, number] | null {
  let t0 = -1e9, t1 = 1e9;
  const n = poly.length / 2;
  // winding sign, so the inside is on the same side of every edge
  let area = 0;
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; area += poly[i * 2] * poly[j * 2 + 1] - poly[j * 2] * poly[i * 2 + 1]; }
  const sg = area >= 0 ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = poly[i * 2], ay = poly[i * 2 + 1], bx = poly[j * 2], by = poly[j * 2 + 1];
    // inward normal of edge a->b
    const nx = -(by - ay) * sg, ny = (bx - ax) * sg;
    const num = nx * (px - ax) + ny * (py - ay);
    const den = nx * dx + ny * dy;
    if (Math.abs(den) < 1e-12) { if (num < 0) return null; continue; }
    const t = -num / den;
    if (den > 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  return [t0, t1];
}

/** parallel hatching across a convex polygon: lines at angle `ang` (radians, y down), `step` apart */
export function hatch(d: Draw, poly: ArrayLike<number>, step: number, ang: number, w: number, c: RGBA, o: { phase?: number; dash?: number; z?: number } = {}) {
  const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
  let s0 = Infinity, s1 = -Infinity;
  for (let i = 0; i < poly.length; i += 2) { const s = poly[i] * nx + poly[i + 1] * ny; s0 = Math.min(s0, s); s1 = Math.max(s1, s); }
  const z = o.z ?? 0;
  const ph = o.phase ?? 0;
  for (let s = Math.ceil((s0 - ph) / step) * step + ph; s <= s1; s += step) {
    const px = nx * s, py = ny * s;
    const r = clipConvex(px, py, dx, dy, poly);
    if (!r || r[1] - r[0] < 1e-6) continue;
    if (o.dash) {
      // broken hatching (earth): short dashes along each line, staggered line to line
      const off = ((s / step) % 2) * o.dash;
      for (let t = r[0] + off; t < r[1]; t += o.dash * 2) {
        const te = Math.min(r[1], t + o.dash);
        d.seg([px + dx * t, py + dy * t, z], [px + dx * te, py + dy * te, z], w, c);
      }
    } else d.seg([px + dx * r[0], py + dy * r[0], z], [px + dx * r[1], py + dy * r[1], z], w, c);
  }
}

/** an outline through flat xy pairs */
export function outline(d: Draw, pts: ArrayLike<number>, w: number, c: RGBA, closed = true, z = 0) {
  const n = pts.length / 2;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const j = (i + 1) % n;
    d.seg([pts[i * 2], pts[i * 2 + 1], z], [pts[j * 2], pts[j * 2 + 1], z], w, c);
  }
}

/** stipple (gypsum, concrete): dots scattered evenly over a rectangle, fixed by a seed */
export function stipple(d: Draw, x0: number, y0: number, x1: number, y1: number, per: number, r: number, c: RGBA, seed = 1, z = 0) {
  const rnd = mulberry32(seed);
  const n = Math.round(Math.abs((x1 - x0) * (y1 - y0)) * per);
  d.dotStyle({ world: true, blend: 'add' });
  for (let i = 0; i < n; i++) d.dot([x0 + rnd() * (x1 - x0), y0 + rnd() * (y1 - y0), z], r * (0.6 + 0.8 * rnd()), c, 0);
}

/** concrete in section: stipple and small aggregate triangles */
export function concrete(d: Draw, x0: number, y0: number, x1: number, y1: number, unit: number, c: RGBA, seed = 3, z = 0) {
  const rnd = mulberry32(seed);
  const n = Math.round(Math.abs((x1 - x0) * (y1 - y0)) / (unit * unit) * 0.5);
  d.dotStyle({ world: true, blend: 'add' });
  for (let i = 0; i < n; i++) {
    const cx = x0 + rnd() * (x1 - x0), cy = y0 + rnd() * (y1 - y0);
    if (rnd() < 0.3) {
      const s = unit * (0.25 + 0.35 * rnd()), a = rnd() * 6.283;
      const p = [0, 1, 2].map((k) => [cx + Math.cos(a + k * 2.094) * s, cy + Math.sin(a + k * 2.094) * s]);
      for (let k = 0; k < 3; k++) {
        const q = p[k], q2 = p[(k + 1) % 3];
        // keep the aggregate inside the cut
        if (Math.min(q[1], q2[1]) < y0 || Math.max(q[1], q2[1]) > y1 || Math.min(q[0], q2[0]) < x0 || Math.max(q[0], q2[0]) > x1) continue;
        d.seg([q[0], q[1], z], [q2[0], q2[1], z], 0.8, c);
      }
    } else d.dot([cx, cy, z], unit * 0.08, c, 0);
  }
}

/** batt insulation in section: a continuous line of loops between y0 and y1 */
export function loops(d: Draw, x0: number, x1: number, y0: number, y1: number, w: number, c: RGBA, z = 0) {
  // a prolate trochoid: a point on a wheel's spoke beyond its rim, so the curve loops back on
  // itself once a turn, the way an architect draws a batt of mineral wool
  const h = y1 - y0, pitch = Math.abs(h) * 0.55;
  const n = Math.max(1, Math.round((x1 - x0) / pitch));
  const step = (x1 - x0) / n, bx = step * 0.36;
  const pts: number[] = [];
  const m = 22 * n;
  for (let k = 0; k <= m; k++) {
    const th = (k / m) * n * Math.PI * 2;
    const x = x0 + (step * th) / (Math.PI * 2) - bx * Math.sin(th);
    const y = y0 + h * (0.5 - 0.46 * Math.cos(th));
    pts.push(Math.max(x0, Math.min(x1, x)), y, z);
  }
  d.poly(pts, w, c);
}

/** an architect's dimension: a line between two points, offset to one side, with extension lines,
 *  slashes at the ends, and the figure over it */
export function dim(d: Draw, fonts: Fonts, M: M4 | null, ax: number, ay: number, bx: number, by: number, text: string,
  o: { off?: number; size?: number; c?: RGBA; tc?: RGBA; tick?: number; w?: number; gap?: number; above?: boolean; reveal?: number } = {}) {
  const L = Math.hypot(bx - ax, by - ay);
  if (L < 1e-6) return;
  const ux = (bx - ax) / L, uy = (by - ay) / L;
  const nx = uy, ny = -ux;                      // to the left of a->b (up for a line running right)
  const off = o.off ?? 0, c = o.c || INK(0.5), w = o.w ?? 0.9, tick = o.tick ?? (o.size ?? 12) * 0.45;
  const rv = o.reveal ?? 1;
  if (rv <= 0) return;
  const pax = ax + nx * off, pay = ay + ny * off, pbx = bx + nx * off, pby = by + ny * off;
  d.setModel(M);
  d.lineStyle({});
  const ext = Math.sign(off || 1) * tick * 0.8, gap = (o.gap ?? tick * 0.5) * Math.sign(off || 1);
  // extension lines from the object (with a small gap) past the dimension line
  if (Math.abs(off) > 1e-6) {
    d.seg([ax + nx * gap, ay + ny * gap, 0], [pax + nx * ext, pay + ny * ext, 0], w * 0.7, c);
    d.seg([bx + nx * gap, by + ny * gap, 0], [pbx + nx * ext, pby + ny * ext, 0], w * 0.7, c);
  }
  const ex = pax + (pbx - pax) * rv, ey = pay + (pby - pay) * rv;
  d.seg([pax - ux * tick * 0.6, pay - uy * tick * 0.6, 0], [ex + ux * tick * 0.6 * rv, ey + uy * tick * 0.6 * rv, 0], w, c);
  // the slashes, at 45 degrees across each end
  const sx = (ux + nx) * 0.7071 * tick * 0.6, sy = (uy + ny) * 0.7071 * tick * 0.6;
  d.seg([pax - sx, pay - sy, 0], [pax + sx, pay + sy, 0], w * 1.6, c);
  if (rv >= 1) d.seg([pbx - sx, pby - sy, 0], [pbx + sx, pby + sy, 0], w * 1.6, c);
  d.flush();
  if (rv < 0.999 || !text) { d.setModel(null); return; }
  const size = o.size ?? 12;
  const mx = (pax + pbx) / 2 + nx * size * 0.45, my = (pay + pby) / 2 + ny * size * 0.45;
  const ang = Math.atan2(uy, ux);
  const base = chain(M || translate(0, 0, 0), translate(mx, my, 0), rotZ(ang));
  label(d, fonts, text, 0, 0, size, o.tc || c, { align: 'center', base, font: 'passMono', axes: { wght: 500 } });
  d.setModel(null);
}

/** a level mark: a short line, an open triangle standing on it, and the level's figure */
export function level(d: Draw, fonts: Fonts, M: M4 | null, x: number, y: number, text: string, o: { size?: number; c?: RGBA; len?: number; left?: boolean } = {}) {
  const s = o.size ?? 12, c = o.c || INK(0.6), len = o.len ?? s * 6;
  const dir = o.left ? -1 : 1;
  d.setModel(M);
  d.lineStyle({});
  d.seg([x, y, 0], [x + dir * len, y, 0], 0.9, c);
  const tx = x + dir * s * 0.9;
  d.seg([tx - s * 0.42, y - s * 0.72, 0], [tx + s * 0.42, y - s * 0.72, 0], 0.9, c);
  d.seg([tx - s * 0.42, y - s * 0.72, 0], [tx, y, 0], 0.9, c);
  d.seg([tx + s * 0.42, y - s * 0.72, 0], [tx, y, 0], 0.9, c);
  d.flush();
  label(d, fonts, text, tx + dir * s * 0.8, y - s * 0.32, s, c, { base: M, align: o.left ? 'right' : 'left', font: 'passMono', axes: { wght: 500 } });
  d.setModel(null);
}

/** a callout: a dot on the thing, a leader out to a shoulder, a numbered circle and a note */
export function callout(d: Draw, fonts: Fonts, M: M4 | null, ax: number, ay: number, bx: number, by: number, num: string, text: string,
  o: { size?: number; c?: RGBA; tc?: RGBA; right?: boolean; reveal?: number; sub?: string; mask?: boolean } = {}) {
  const rv = o.reveal ?? 1;
  if (rv <= 0) return;
  const s = o.size ?? 12, c = o.c || INK(0.55), tc = o.tc || INK(0.9);
  const dir = o.right === false ? -1 : 1;
  const sh = s * 1.6;            // the shoulder
  d.setModel(M);
  d.lineStyle({});
  // the leader draws itself out from the thing it names
  const k1 = Math.min(1, rv * 1.6), k2 = Math.max(0, Math.min(1, rv * 1.6 - 0.6));
  const mx = ax + (bx - ax) * k1, my = ay + (by - ay) * k1;
  d.seg([ax, ay, 0], [mx, my, 0], 0.8, c);
  if (k2 > 0) d.seg([bx, by, 0], [bx + dir * sh * k2, by, 0], 0.8, c);
  d.dotStyle({ world: true, blend: 'add' });
  d.dot([ax, ay, 0], s * 0.16, withA(c, 1), 0);
  d.flush();
  if (rv >= 0.85) {
    const r = s * 0.78;
    const cx = bx + dir * (sh + r);
    if (o.mask) {
      // a mask behind the note, so it reads over the drawing
      const w = Math.max(text.length, o.sub ? o.sub.length * 0.8 : 0) * s * 0.62 + r * 2 + s;
      const x0 = dir > 0 ? cx - r - s * 0.3 : cx + r + s * 0.3 - w, y0 = by - r - s * 0.3, y1 = by + (o.sub ? s * 1.9 : r + s * 0.3);
      d.fill([[x0, y0, x0 + w, y0, x0 + w, y1, x0, y1]], [0, 0, 0, 0.92], M, 'alpha');
    }
    const pts: number[] = [];
    for (let i = 0; i <= 40; i++) { const a = (i / 40) * Math.PI * 2; pts.push(cx + Math.cos(a) * r, by + Math.sin(a) * r, 0); }
    d.lineStyle({});
    d.poly(pts, 0.9, c);
    d.flush();
    label(d, fonts, num, cx, by + s * 0.36, s * 0.92, tc, { base: M, align: 'center', font: 'pass', axes: { wght: 700 } });
    const tx = cx + dir * (r + s * 0.5);
    label(d, fonts, text, tx, by + s * 0.36, s, tc, { base: M, align: dir > 0 ? 'left' : 'right', font: 'passMono', axes: { wght: 600 } });
    if (o.sub) label(d, fonts, o.sub, tx, by + s * 1.55, s * 0.8, withA(c, 1), { base: M, align: dir > 0 ? 'left' : 'right', font: 'passMono', axes: { wght: 400 } });
  }
  d.setModel(null);
}

/** an arrowhead (filled) at (x, y) pointing along (dx, dy) */
export function arrowHead(d: Draw, M: M4 | null, x: number, y: number, dx: number, dy: number, s: number, c: RGBA) {
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  d.fill([[x, y, x - ux * s + nx * s * 0.42, y - uy * s + ny * s * 0.42, x - ux * s - nx * s * 0.42, y - uy * s - ny * s * 0.42]], c, M, 'add');
}

/** the sheet: a border inset from the frame, its grid references, in screen space */
export function sheet(d: Draw, fonts: Fonts, o: { inset?: number; c?: RGBA; cols?: number; rows?: number; alpha?: number } = {}) {
  const a = o.alpha ?? 1;
  if (a <= 0.001) return;
  const m = o.inset ?? 26, c = withA(o.c || INK(0.42), a), cols = o.cols ?? 8, rows = o.rows ?? 5;
  const x0 = m, y0 = m, x1 = 1920 - m, y1 = 1080 - m, band = 16;
  d.setModel(null);
  d.lineStyle({});
  outline(d, rectC(x0, y0, x1, y1), 1.6, c);
  outline(d, rectC(x0 + band, y0 + band, x1 - band, y1 - band), 0.8, c);
  for (let i = 1; i < cols; i++) {
    const x = x0 + band + ((x1 - x0 - 2 * band) * i) / cols;
    d.seg([x, y0, 0], [x, y0 + band, 0], 0.8, c);
    d.seg([x, y1 - band, 0], [x, y1, 0], 0.8, c);
  }
  for (let j = 1; j < rows; j++) {
    const y = y0 + band + ((y1 - y0 - 2 * band) * j) / rows;
    d.seg([x0, y, 0], [x0 + band, y, 0], 0.8, c);
    d.seg([x1 - band, y, 0], [x1, y, 0], 0.8, c);
  }
  d.flush();
  const tc = withA(o.c || INK(0.42), a);
  for (let i = 0; i < cols; i++) {
    const x = x0 + band + ((x1 - x0 - 2 * band) * (i + 0.5)) / cols;
    label(d, fonts, String(i + 1), x, y0 + band * 0.78, 10, tc, { align: 'center' });
    label(d, fonts, String(i + 1), x, y1 - band * 0.22, 10, tc, { align: 'center' });
  }
  for (let j = 0; j < rows; j++) {
    const y = y0 + band + ((y1 - y0 - 2 * band) * (j + 0.5)) / rows + 4;
    const ch = 'ABCDEFGH'[j];
    label(d, fonts, ch, x0 + band / 2, y, 10, tc, { align: 'center' });
    label(d, fonts, ch, x1 - band / 2, y, 10, tc, { align: 'center' });
  }
}

/** a value along keys [t, v] by a cubic through them (tangents from the neighbours), carrying on at
 *  the end tangents before the first key and after the last, so a camera on it never stops */
export function spline(t: number, keys: [number, number][]): number {
  const n = keys.length;
  const tan = (i: number) => {
    const a = keys[Math.max(0, i - 1)], b = keys[Math.min(n - 1, i + 1)];
    return (b[1] - a[1]) / (b[0] - a[0] || 1);
  };
  if (t <= keys[0][0]) return keys[0][1] + tan(0) * (t - keys[0][0]);
  if (t >= keys[n - 1][0]) return keys[n - 1][1] + tan(n - 1) * (t - keys[n - 1][0]);
  let i = 0;
  while (i < n - 2 && t > keys[i + 1][0]) i++;
  const [t0, v0] = keys[i], [t1, v1] = keys[i + 1];
  const h = t1 - t0, u = (t - t0) / h;
  const m0 = tan(i) * h, m1 = tan(i + 1) * h;
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * v0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * v1 + (u3 - u2) * m1;
}
