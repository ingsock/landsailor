// Type: fonts through HarfBuzz (shaping, kerning, variable axes) and glyph outlines flattened into
// contours, kept on the GPU per (font, glyph, axes). Positions come from the shaper, never from
// adding up widths letter by letter.
import createHarfBuzz from 'harfbuzzjs/hb.js';
import hbjs from 'harfbuzzjs/hbjs.js';
import hbWasm from 'harfbuzzjs/hb.wasm?url';
import { Draw, FillMesh, Paint, Blend } from './draw';
import { M4, chain, rotZ, scale, translate, mul } from './math';

export type Axes = Record<string, number>;

type HBFont = { font: any; face: any; blob: any; upem: number; axes: { tag: string; min: number; def: number; max: number }[] };

export type Glyph = {
  gid: number;
  /** cluster: index (UTF-16) of the first character this glyph draws */
  cl: number;
  /** pen position and offsets in font units */
  x: number; y: number; ax: number;
};

export type Shaped = { font: string; axes: Axes; upem: number; glyphs: Glyph[]; width: number; text: string };

export type GlyphGeom = { contours: Float32Array[]; mesh: FillMesh | null; bbox: [number, number, number, number] };

const SUB = 16; // shaper scale: font units * SUB, for sub-unit precision

let HB: any = null;

export class Fonts {
  private fonts = new Map<string, HBFont>();
  private geo = new Map<string, GlyphGeom>();
  private shapeCache = new Map<string, Shaped>();
  private buf: any = null;
  constructor(public d: Draw) {}

  static async init(d: Draw): Promise<Fonts> {
    if (!HB) {
      const mod = await (createHarfBuzz as any)({ locateFile: () => hbWasm });
      HB = (hbjs as any)(mod);
    }
    return new Fonts(d);
  }

  async load(name: string, url: string) {
    const ab = await (await fetch(url)).arrayBuffer();
    const blob = HB.createBlob(ab);
    const face = HB.createFace(blob, 0);
    const font = HB.createFont(face);
    const upem = face.upem as number;
    font.setScale(upem * SUB, upem * SUB);
    const infos = face.getAxisInfos ? face.getAxisInfos() : {};
    const axes = Object.entries(infos).map(([tag, v]: [string, any]) => ({ tag, min: v.min, def: v.default, max: v.max }));
    this.fonts.set(name, { font, face, blob, upem, axes });
  }

  has(name: string) { return this.fonts.has(name); }
  axesOf(name: string) { return this.fonts.get(name)!.axes; }
  upem(name: string) { return this.fonts.get(name)!.upem; }

  private key(axes: Axes) {
    return Object.keys(axes).sort().map((k) => `${k}${q(k, axes[k])}`).join(',');
  }

  private setAxes(f: HBFont, axes: Axes) {
    const v: Axes = {};
    for (const a of f.axes) v[a.tag] = clampAxis(a, axes[a.tag] ?? a.def);
    f.font.setVariations(quantize(v));
  }

  /** shape a run of text; positions in font units. features e.g. 'kern,-liga' */
  shape(font: string, text: string, axes: Axes = {}, features = '-liga,-clig'): Shaped {
    const f = this.fonts.get(font);
    if (!f) throw new Error('no font ' + font);
    const k = `${font}|${this.key(axes)}|${features}|${text}`;
    const hit = this.shapeCache.get(k);
    if (hit) return hit;
    this.setAxes(f, axes);
    const b = HB.createBuffer();
    b.addText(text);
    b.guessSegmentProperties();
    HB.shape(f.font, b, features);
    const out = b.json() as { g: number; cl: number; ax: number; dx: number; dy: number }[];
    b.destroy();
    let pen = 0;
    const glyphs: Glyph[] = out.map((g) => {
      const gl: Glyph = { gid: g.g, cl: g.cl, x: (pen + g.dx) / SUB, y: g.dy / SUB, ax: g.ax / SUB };
      pen += g.ax;
      return gl;
    });
    const s: Shaped = { font, axes: { ...axes }, upem: f.upem, glyphs, width: pen / SUB, text };
    if (this.shapeCache.size > 20000) this.shapeCache.clear();
    this.shapeCache.set(k, s);
    return s;
  }

  /** outline of one glyph (font units, y up), with its GPU fill mesh */
  glyph(font: string, gid: number, axes: Axes = {}): GlyphGeom {
    const k = `${font}|${gid}|${this.key(axes)}`;
    const hit = this.geo.get(k);
    if (hit) { this.geo.delete(k); this.geo.set(k, hit); return hit; }
    const f = this.fonts.get(font)!;
    this.setAxes(f, axes);
    const path: string = f.font.glyphToPath(gid);
    const contours = flattenPath(path, 1 / SUB);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const c of contours) for (let i = 0; i < c.length; i += 2) {
      if (c[i] < x0) x0 = c[i]; if (c[i] > x1) x1 = c[i];
      if (c[i + 1] < y0) y0 = c[i + 1]; if (c[i + 1] > y1) y1 = c[i + 1];
    }
    const g: GlyphGeom = { contours, mesh: this.d.makeFill(contours), bbox: [x0, y0, x1, y1] };
    this.geo.set(k, g);
    if (this.geo.size > 6000) {
      // evict the least recently used quarter
      let n = 1500;
      for (const [kk, gg] of this.geo) { this.d.freeFill(gg.mesh); this.geo.delete(kk); if (--n <= 0) break; }
    }
    return g;
  }
}

function clampAxis(a: { min: number; max: number }, v: number) { return Math.max(a.min, Math.min(a.max, v)); }

/** axes are quantized so that animation reuses outlines: width to 0.5, weight to 2, others to 0.25 */
function q(tag: string, v: number) {
  if (tag === 'wght') return Math.round(v / 2) * 2;
  if (tag === 'wdth') return Math.round(v * 2) / 2;
  if (tag === 'YEAR') return Math.round(v);
  return Math.round(v * 4) / 4;
}
function quantize(a: Axes): Axes { const o: Axes = {}; for (const k in a) o[k] = q(k, a[k]); return o; }

/** SVG path (M L Q C Z, absolute) -> closed contours as flat xy arrays */
export function flattenPath(d: string, s = 1): Float32Array[] {
  const out: Float32Array[] = [];
  let cur: number[] = [];
  let x = 0, y = 0;
  const re = /([MLQCZ])([^MLQCZ]*)/g;
  let m: RegExpExecArray | null;
  const push = () => {
    if (cur.length >= 6) {
      // drop a closing duplicate of the first point
      const n = cur.length;
      if (Math.abs(cur[n - 2] - cur[0]) < 1e-6 && Math.abs(cur[n - 1] - cur[1]) < 1e-6) cur.length = n - 2;
      out.push(new Float32Array(cur));
    }
    cur = [];
  };
  while ((m = re.exec(d))) {
    const cmd = m[1];
    const v = m[2].trim().length ? m[2].trim().split(/[\s,]+/).map(Number) : [];
    if (cmd === 'M') { push(); x = v[0] * s; y = v[1] * s; cur.push(x, y); }
    else if (cmd === 'L') { x = v[0] * s; y = v[1] * s; cur.push(x, y); }
    else if (cmd === 'Q') {
      const cx = v[0] * s, cy = v[1] * s, ex = v[2] * s, ey = v[3] * s;
      const L = Math.hypot(cx - x, cy - y) + Math.hypot(ex - cx, ey - cy);
      const n = Math.max(2, Math.min(28, Math.ceil(L / 10)));
      for (let i = 1; i <= n; i++) {
        const t = i / n, u = 1 - t;
        cur.push(u * u * x + 2 * u * t * cx + t * t * ex, u * u * y + 2 * u * t * cy + t * t * ey);
      }
      x = ex; y = ey;
    } else if (cmd === 'C') {
      const c1x = v[0] * s, c1y = v[1] * s, c2x = v[2] * s, c2y = v[3] * s, ex = v[4] * s, ey = v[5] * s;
      const L = Math.hypot(c1x - x, c1y - y) + Math.hypot(c2x - c1x, c2y - c1y) + Math.hypot(ex - c2x, ey - c2y);
      const n = Math.max(2, Math.min(32, Math.ceil(L / 10)));
      for (let i = 1; i <= n; i++) {
        const t = i / n, u = 1 - t;
        cur.push(u * u * u * x + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * ex,
          u * u * u * y + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * ey);
      }
      x = ex; y = ey;
    } else if (cmd === 'Z') { push(); }
  }
  push();
  return out;
}

// ---------------------------------------------------------------------------------------------
// Setting type: a run laid out in pixels, drawn glyph by glyph so each can move and light alone.

export type SetGlyph = {
  gid: number; cl: number; ch: string;
  /** pen x and baseline offset in px, relative to the run's origin */
  x: number; y: number; adv: number;
  geo: GlyphGeom;
};
export type Run = { font: string; size: number; axes: Axes; text: string; glyphs: SetGlyph[]; width: number; ascent: number; scale: number };

export function setRun(fonts: Fonts, font: string, text: string, size: number, axes: Axes = {}, tracking = 0, features?: string): Run {
  const sh = fonts.shape(font, text, axes, features);
  const k = size / sh.upem;
  const glyphs: SetGlyph[] = [];
  let extra = 0;
  for (let i = 0; i < sh.glyphs.length; i++) {
    const g = sh.glyphs[i];
    const geo = fonts.glyph(font, g.gid, axes);
    glyphs.push({ gid: g.gid, cl: g.cl, ch: text[g.cl] || '', x: g.x * k + extra, y: -g.y * k, adv: g.ax * k + tracking * size, geo });
    extra += tracking * size;
  }
  const width = sh.width * k + tracking * size * Math.max(0, sh.glyphs.length - 1);
  return { font, size, axes, text, glyphs, width, ascent: 0, scale: k };
}

/** the model matrix that puts glyph geometry (font units, y up) at pen (x, y) in px with size k */
export function glyphModel(base: M4 | null, x: number, y: number, k: number, rot = 0, sx = 1, sy = 1): M4 {
  let m = chain(translate(x, y, 0), rot ? rotZ(rot) : scale(1, 1, 1), scale(k * sx, -k * sy, 1));
  if (base) m = mul(base, m);
  return m;
}

/** draw a whole run in one paint at (x, y) baseline-left, under an optional base transform */
export function drawRun(d: Draw, run: Run, x: number, y: number, paint: Paint | ((i: number, g: SetGlyph) => Paint | null), base: M4 | null = null, blend: Blend = 'alpha') {
  for (let i = 0; i < run.glyphs.length; i++) {
    const g = run.glyphs[i];
    if (!g.geo.mesh) continue;
    const p = typeof paint === 'function' ? paint(i, g) : paint;
    if (!p) continue;
    d.fillMesh(g.geo.mesh, p, glyphModel(base, x + g.x, y + g.y, run.scale), blend);
  }
}

/** cap height of a font in px at a size (from the outline of 'H') */
export function capHeight(fonts: Fonts, font: string, size: number, axes: Axes = {}): number {
  const sh = fonts.shape(font, 'H', axes);
  const g = fonts.glyph(font, sh.glyphs[0].gid, axes);
  return (g.bbox[3] * size) / sh.upem;
}
