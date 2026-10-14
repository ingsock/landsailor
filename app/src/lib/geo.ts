// The world: countries (Natural Earth) on a flat map in the Natural Earth projection, the globe
// as a textured sphere (NASA's Black Marble at night), great-circle routes between cities.
import { Ctx } from '../engine/engine';
import { Draw, FillMesh, TexMesh } from '../engine/draw';
import { V3 } from '../engine/math';

const D2R = Math.PI / 180;

/** Natural Earth projection (Šavrič, Patterson, Jenny 2011); returns [x, y] with y up */
export function ne(lon: number, lat: number): [number, number] {
  const l = lon * D2R, p = lat * D2R;
  const p2 = p * p, p4 = p2 * p2, p6 = p4 * p2, p8 = p4 * p4, p10 = p8 * p2, p12 = p6 * p6;
  const x = l * (0.8707 - 0.131979 * p2 - 0.013791 * p4 + 0.003971 * p10 - 0.001529 * p12);
  const y = p * (1.007226 + 0.015085 * p2 - 0.044475 * p6 + 0.028874 * p8 - 0.005916 * p10);
  return [x, y];
}

/** a point on a sphere of radius R centred at the origin; north pole at -y (screen up) */
export function sphere(lon: number, lat: number, R: number): V3 {
  const l = lon * D2R, p = lat * D2R;
  return [R * Math.cos(p) * Math.sin(l), -R * Math.sin(p), -R * Math.cos(p) * Math.cos(l)];
}

export type Country = { iso: string; name: string; pop: number; rings: number[][][]; mesh?: FillMesh | null; outline?: number[][] };

/** countries as fill meshes in map units (px = units * k), y down */
export async function loadCountries(ctx: Ctx, k = 300): Promise<Country[]> {
  const key = `countries:${k}`;
  if (ctx.data.has(key)) return ctx.data.get(key);
  const raw: Country[] = await (await fetch('/data/geo/countries.json')).json();
  for (const c of raw) {
    const contours: number[][] = [];
    for (const ring of c.rings) {
      const flat: number[] = [];
      for (const [lon, lat] of ring) { const [x, y] = ne(lon, lat); flat.push(x * k, -y * k); }
      contours.push(flat);
    }
    c.outline = contours;
    c.mesh = ctx.d.makeFill(contours);
  }
  ctx.data.set(key, raw);
  return raw;
}

/** a UV sphere: equirectangular texture coordinates, u = 0 at lon -180 */
export function sphereMesh(d: Draw, R: number, nLon = 128, nLat = 64): TexMesh {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let j = 0; j <= nLat; j++) {
    const lat = 90 - (180 * j) / nLat;
    for (let i = 0; i <= nLon; i++) {
      const lon = -180 + (360 * i) / nLon;
      pos.push(...sphere(lon, lat, R));
      uv.push(i / nLon, j / nLat);
    }
  }
  for (let j = 0; j < nLat; j++)
    for (let i = 0; i < nLon; i++) {
      const a = j * (nLon + 1) + i, b = a + 1, c = a + nLon + 1, e = c + 1;
      idx.push(a, c, b, b, c, e);
    }
  return d.makeTexMesh(new Float32Array(pos), new Float32Array(uv), new Uint32Array(idx));
}

/** great-circle points from a to b (lon/lat), lifted to an arc of height h*R at the middle */
export function arc(a: [number, number], b: [number, number], R: number, h = 0.12, n = 48): number[] {
  const va = sphere(a[0], a[1], 1), vb = sphere(b[0], b[1], 1);
  const dot = Math.max(-1, Math.min(1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]));
  const om = Math.acos(dot);
  const out: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    let p: V3;
    if (om < 1e-6) p = va;
    else {
      const s0 = Math.sin((1 - t) * om) / Math.sin(om), s1 = Math.sin(t * om) / Math.sin(om);
      p = [va[0] * s0 + vb[0] * s1, va[1] * s0 + vb[1] * s1, va[2] * s0 + vb[2] * s1];
    }
    const lift = 1 + h * Math.sin(Math.PI * t) * Math.min(1, om / 1.2);
    out.push(p[0] * R * lift, p[1] * R * lift, p[2] * R * lift);
  }
  return out;
}

export async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  await img.decode();
  return img;
}
