// Drawing for the risograph look (post.ts, uLook 5). The scene is still drawn as light on a dark
// ground; the print turns warm light into the pink ink and white or cool light into the blue, each
// through its own halftone screen. These helpers go the other way: from the ink a shape should
// print in to the light that prints it, so a scene can be designed as a two-colour print.
//
//   ink(p, b)   p: pink density, b: blue density, 0 (bare paper) .. 1 (solid)
//
// What the press can do: a solid blue carries a few pink dots and a solid pink a very few blue
// ones (the grade reads every light as some of both); the two together print as a deep violet.
// PAPER is drawn as black: it knocks a shape out of whatever is under it.
import { Draw, Paint } from '../engine/draw';
import { M4, RGBA, clamp, lerp } from '../engine/math';
import { glyphModel } from '../engine/text';
import { LightKind, SetLine, lamp, letterOn } from './lyric';

const s2l = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const lumaOf = (c: ArrayLike<number>) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

const cache = new Map<string, RGBA>();

/** the press runs heavy: post.ts closes the middle tones up toward solid with
 *  smoothstep(HEAVY0, HEAVY1, density) before the screen. Kept in step with it here. */
const HEAVY0 = 0.05, HEAVY1 = 0.78;
/** the density to ask for so that, after the press's curve, the screen prints y */
function unheavy(y: number): number {
  if (y <= 0.002) return 0;
  if (y >= 0.999) return HEAVY1 + 0.03;
  const s = 0.5 - Math.sin(Math.asin(1 - 2 * y) / 3);   // inverse of 3s² - 2s³
  return HEAVY0 + s * (HEAVY1 - HEAVY0);
}

/** the light (linear RGBA) that prints as pink coverage p and blue coverage b */
export function ink(p: number, b: number, a = 1): RGBA {
  p = clamp(p); b = clamp(b);
  const key = `${p.toFixed(3)},${b.toFixed(3)}`;
  let c = cache.get(key);
  if (!c) { c = solve(unheavy(p), unheavy(b)); cache.set(key, c); }
  return [c[0], c[1], c[2], a];
}

function solve(P: number, B: number): RGBA {
  if (P < 0.004 && B < 0.004) return [0, 0, 0, 1];
  // the print's two densities from a display colour s: luma(s) * (0.35 + 1.33 w) and
  // luma(s) * (1.45 - 1.16 w), w = clamp((s.r - s.b) * 1.8); pick w from the ratio, then luma
  const w = B < 1e-4 ? 1 : clamp((1.45 * (P / B) - 0.35) / (1.33 + 1.16 * (P / B)));
  const k1 = 0.35 + 1.33 * w, k2 = 1.45 - 1.16 * w;
  const D = w < 1 ? w / 1.8 : 0.5556;
  let l = Math.min(Math.max(P / k1, B / k2), 1 - 0.0722 * D);
  let disp: number[];
  if (l >= 0.2126 * D) {
    if (l - 0.9278 * D >= 0) { const b0 = l - 0.9278 * D; disp = [b0 + D, b0 + D, b0]; }
    else { const g = (l - 0.2126 * D) / (0.7152 * D); disp = [D, g * D, 0]; }
  } else {
    // too faint to be that warm: a dark red, solved for the pink
    if (P >= B) l = (-0.35 + Math.sqrt(0.1225 + 45.04 * P)) / 22.52;
    disp = [Math.min(1, l / 0.2126), 0, 0];
  }
  let lin = disp.map((v) => s2l(clamp(v)));
  // undo the grade's tone curve (it compresses linear luma above 0.6)
  const lo = lumaOf(lin);
  if (lo > 0.6) { const v = lo - 0.6, li = 0.6 + v / (1 - 1.1 * v); lin = lin.map((x) => (x * li) / lo); }
  return [lin[0], lin[1], lin[2], 1];
}

export const PAPER: RGBA = [0, 0, 0, 1];
export const PINK = (k = 1) => ink(k, 0);
export const BLUE = (k = 1) => ink(0, k);
/** both inks over each other: the darkest colour the press has */
export const BOTH = (k = 1) => ink(k, k);

/** a shot drawn for the press: no light spills (it would print as a haze of dots) */
export const PRINT_POST = { threshold: 50, knee: 0.01 };

// ------------------------------------------------------------------------------- sung type

export type InkLineOpts = {
  /** how the letter comes on: the lamp of the scene, read as ink (a tube stutters, a filament warms) */
  light: LightKind;
  /** [pink, blue] once lit, and before (the ghost of the letter on the plate) */
  on: [number, number];
  ghost?: [number, number];
  base?: M4 | null;
  alpha?: number;
  /** per-glyph extra transform after it lights: returns [dx, dy, rot, sx, sy] */
  jiggle?: (wi: number, gi: number, dt: number) => [number, number, number, number, number] | null;
};

/** a sung line in ink: each letter prints as the voice reaches it, in its lamp's manner */
export function inkLine(d: Draw, sl: SetLine, x: number, y: number, t: number, o: InkLineOpts) {
  const ghost = o.ghost ?? [o.on[0] * 0.12, o.on[1] * 0.12];
  const full = lumaOf(lamp(o.light, 10));
  sl.words.forEach((sw, wi) => {
    const n = sw.letters;
    sw.run.glyphs.forEach((g, gi) => {
      if (!g.geo.mesh) return;
      const on = sw.word ? letterOn(sw.word, gi, n) : -1e9;
      const dt = t - on;
      // the lamp's brightness against its settled brightness is how much ink is down
      const k = dt < 0 ? 0 : clamp(lumaOf(lamp(o.light, dt)) / full, 0, 1);
      const p = lerp(ghost[0], o.on[0], k), b = lerp(ghost[1], o.on[1], k);
      if (p < 0.004 && b < 0.004) return;
      let gx = x + sw.x + g.x, gy = y + g.y, rot = 0, sx = 1, sy = 1;
      if (o.jiggle && dt >= 0) {
        const j = o.jiggle(wi, gi, dt);
        if (j) { gx += j[0]; gy += j[1]; rot = j[2]; sx = j[3]; sy = j[4]; }
      }
      d.fillMesh(g.geo.mesh, ink(p, b, o.alpha ?? 1), glyphModel(o.base || null, gx, gy, sw.run.scale, rot, sx, sy), 'alpha');
    });
  });
}

// ------------------------------------------------------------------------------- shapes

/** contours are flat [x, y, x, y, ...] arrays; a layer is many contours filled in one go */
export type Contour = number[];

export function rectC(x: number, y: number, w: number, h: number): Contour {
  return [x, y, x + w, y, x + w, y + h, x, y + h];
}

export function circleC(cx: number, cy: number, r: number, n = 0): Contour {
  const m = n || Math.max(10, Math.min(48, Math.round(r * 6 + 10)));
  const o: number[] = [];
  for (let i = 0; i < m; i++) { const a = (i / m) * Math.PI * 2; o.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
  return o;
}

export function ellipseC(cx: number, cy: number, rx: number, ry: number, n = 28): Contour {
  const o: number[] = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; o.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry); }
  return o;
}

/** a rectangle with rounded corners (radius per corner: tl, tr, br, bl), y down */
export function rrectC(x: number, y: number, w: number, h: number, r: number | [number, number, number, number], seg = 5): Contour {
  const rr = typeof r === 'number' ? [r, r, r, r] : r;
  const lim = Math.min(w, h) / 2;
  const [tl, tr, br, bl] = rr.map((v) => Math.min(v, lim));
  const o: number[] = [];
  const arc = (cx: number, cy: number, rad: number, a0: number) => {
    if (rad <= 0) { o.push(cx, cy); return; }
    for (let i = 0; i <= seg; i++) { const a = a0 + (i / seg) * (Math.PI / 2); o.push(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad); }
  };
  arc(x + tl, y + tl, tl, Math.PI);
  arc(x + w - tr, y + tr, tr, -Math.PI / 2);
  arc(x + w - br, y + h - br, br, 0);
  arc(x + bl, y + h - bl, bl, Math.PI / 2);
  return o;
}

/** the same contour wound the other way: inside another, it cuts a hole */
export function holeC(c: Contour): Contour {
  const o: number[] = [];
  for (let i = c.length - 2; i >= 0; i -= 2) o.push(c[i], c[i + 1]);
  return o;
}

/** transform a contour by a 2D affine [a, b, c, d, e, f]: x' = a x + c y + e, y' = b x + d y + f */
export function xform(c: Contour, m: [number, number, number, number, number, number]): Contour {
  const o: number[] = new Array(c.length);
  for (let i = 0; i < c.length; i += 2) { const x = c[i], y = c[i + 1]; o[i] = m[0] * x + m[2] * y + m[4]; o[i + 1] = m[1] * x + m[3] * y + m[5]; }
  return o;
}

/** fill a set of contours in one paint (one stencil, one cover) */
export function fillAll(d: Draw, cs: Contour[], paint: Paint, model: M4 | null = null) {
  if (cs.length) d.fill(cs, paint, model, 'alpha');
}

// ------------------------------------------------------------------------------- motion

/** a value through keyframes [t, v]: a smooth curve (monotone between keys) that keeps its end
 *  speeds beyond the first and last key, so a camera on it never comes to rest */
export function track(t: number, keys: [number, number][]): number {
  const n = keys.length;
  if (n === 1) return keys[0][1];
  const sl = (i: number) => (keys[i + 1][1] - keys[i][1]) / (keys[i + 1][0] - keys[i][0]);
  const tan = (i: number) => {
    if (i === 0) return sl(0);
    if (i === n - 1) return sl(n - 2);
    const a = sl(i - 1), b = sl(i);
    if (a * b <= 0) return 0.5 * (a + b) * 0.35; // a turn: slow through it, never stop dead
    return (2 * a * b) / (a + b);                 // harmonic mean keeps it monotone
  };
  if (t <= keys[0][0]) return keys[0][1] + tan(0) * (t - keys[0][0]);
  if (t >= keys[n - 1][0]) return keys[n - 1][1] + tan(n - 1) * (t - keys[n - 1][0]);
  let i = 0;
  while (i < n - 2 && t > keys[i + 1][0]) i++;
  const [t0, v0] = keys[i], [t1, v1] = keys[i + 1];
  const h = t1 - t0, s = (t - t0) / h;
  const m0 = tan(i) * h, m1 = tan(i + 1) * h;
  const s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * v0 + (s3 - 2 * s2 + s) * m0 + (-2 * s3 + 3 * s2) * v1 + (s3 - s2) * m1;
}
