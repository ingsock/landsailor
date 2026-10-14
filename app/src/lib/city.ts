// Chicago from OpenStreetMap: streets as GPU line meshes in metres east and south of State &
// Madison (the zero of the city's address grid), and street lamps sampled along them.
import { Ctx } from '../engine/engine';
import { DotMesh, Draw, LineMesh } from '../engine/draw';
import { M4, chain, rotX, scale, translate, mulberry32 } from '../engine/math';

export type Segs = Float32Array; // ax ay bx by class key, per segment

export async function loadSegs(url: string): Promise<Segs> {
  const r = await fetch(url);
  if (!r.ok) return new Float32Array(0);
  return new Float32Array(await r.arrayBuffer());
}

export const ROAD = { motorway: 0, trunk: 1, primary: 2, secondary: 3, tertiary: 4, residential: 5, service: 6 };
const W = [2.6, 2.1, 1.6, 1.25, 1.0, 0.6, 0.38];
const A = [1, 0.95, 0.85, 0.72, 0.62, 0.42, 0.28];

/** segments -> line mesh; each segment keeps k0 = distance from the origin (m), k1 = class */
export function roadMesh(d: Draw, segs: Segs, o: { classes?: number[]; width?: number[]; alpha?: number[]; key?: (ax: number, ay: number, bx: number, by: number, cls: number, k: number) => number;
  key1?: (ax: number, ay: number, bx: number, by: number, cls: number, k: number) => number } = {}): LineMesh {
  const n = segs.length / 6;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const ax = segs[i * 6], ay = segs[i * 6 + 1], bx = segs[i * 6 + 2], by = segs[i * 6 + 3], cls = segs[i * 6 + 4], k = segs[i * 6 + 5];
    if (o.classes && !o.classes.includes(cls)) continue;
    const w = (o.width || W)[cls] ?? 0.5, a = (o.alpha || A)[cls] ?? 0.4;
    out.push(ax, ay, 0, bx, by, 0, 1, 1, 1, a, w, o.key ? o.key(ax, ay, bx, by, cls, k) : k, o.key1 ? o.key1(ax, ay, bx, by, cls, k) : cls);
  }
  return d.makeLines(new Float32Array(out));
}

/** lamps every `spacing` metres along the streets of the given classes */
export function lampMesh(d: Draw, segs: Segs, o: { classes?: number[]; spacing?: number; radius?: number; seed?: number; jitter?: number } = {}): DotMesh {
  const n = segs.length / 6;
  const rnd = mulberry32(o.seed || 7);
  const sp = o.spacing || 70;
  const out: number[] = [];
  let carry = 0;
  for (let i = 0; i < n; i++) {
    const ax = segs[i * 6], ay = segs[i * 6 + 1], bx = segs[i * 6 + 2], by = segs[i * 6 + 3], cls = segs[i * 6 + 4];
    if (o.classes && !o.classes.includes(cls)) continue;
    const L = Math.hypot(bx - ax, by - ay);
    let s = carry;
    while (s < L) {
      const t = s / L;
      const x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
      const r = (o.radius || 1.1) * (cls <= 2 ? 1.25 : 1);
      out.push(x + (rnd() - 0.5) * (o.jitter || 0), y + (rnd() - 0.5) * (o.jitter || 0), 0, 1, 1, 1, 1, r, 0.55, Math.hypot(x, y), rnd());
      s += sp;
    }
    carry = s - L;
  }
  return d.makeDots(new Float32Array(out));
}

/** the map lying flat as ground: metres -> world px, north away from the camera.
 *  `pxPerM` scales, (cx, cz) is where the origin sits on the ground plane at height y. */
export function groundModel(pxPerM: number, cx = 960, cz = 0, y = 0): M4 {
  // local (east, south, 0) -> world (east, 0, -south)... we keep south toward the viewer
  return chain(translate(cx, y, cz), rotX(-Math.PI / 2), scale(pxPerM, pxPerM, 1));
}

/** the map standing as the picture plane (top-down view at the home camera) */
export function planModel(pxPerM: number, cx = 960, cy = 540): M4 {
  return chain(translate(cx, cy, 0), scale(pxPerM, pxPerM, 1));
}

export type CityData = { major: Segs; streets: Segs; rail: Segs; water: Segs; power: Segs; runways: Segs; meta: any };

export async function loadCity(ctx: Ctx): Promise<CityData> {
  if (ctx.data.has('city')) return ctx.data.get('city');
  const [major, streets, rail, water, power, runways, meta] = await Promise.all([
    loadSegs('/data/geo/chi_major.bin'), loadSegs('/data/geo/chi_streets.bin'), loadSegs('/data/geo/chi_rail.bin'),
    loadSegs('/data/geo/chi_water.bin'), loadSegs('/data/geo/chi_power.bin'), loadSegs('/data/geo/ord_runways.bin'),
    fetch('/data/geo/chicago.json').then((r) => r.json()),
  ]);
  const c = { major, streets, rail, water, power, runways, meta };
  ctx.data.set('city', c);
  return c;
}
