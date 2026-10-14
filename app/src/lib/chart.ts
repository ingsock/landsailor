// Charts in the manner of Our World in Data: a line per entity labelled at its end, hairline
// grids, a title and a source line. Drawn in a local plane (px) that a model matrix places in
// the world, so a chart can stand, lie down as ground, or be flown through.
import { Draw, Paint } from '../engine/draw';
import { M4, RGBA, clamp, lerp, withA } from '../engine/math';
import { Fonts } from '../engine/text';
import { label } from './lyric';
import { NIGHT } from './palette';

export type Scale = ((v: number) => number) & { d0: number; d1: number; r0: number; r1: number; log: boolean; inv: (p: number) => number };

export function lin(d0: number, d1: number, r0: number, r1: number): Scale {
  const f = ((v: number) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0)) as Scale;
  f.d0 = d0; f.d1 = d1; f.r0 = r0; f.r1 = r1; f.log = false;
  f.inv = (p) => d0 + ((p - r0) / (r1 - r0)) * (d1 - d0);
  return f;
}
export function logS(d0: number, d1: number, r0: number, r1: number): Scale {
  const l0 = Math.log10(d0), l1 = Math.log10(d1);
  const f = ((v: number) => r0 + ((Math.log10(Math.max(v, 1e-30)) - l0) / (l1 - l0)) * (r1 - r0)) as Scale;
  f.d0 = d0; f.d1 = d1; f.r0 = r0; f.r1 = r1; f.log = true;
  f.inv = (p) => Math.pow(10, l0 + ((p - r0) / (r1 - r0)) * (l1 - l0));
  return f;
}

export function niceTicks(d0: number, d1: number, n = 5): number[] {
  const span = d1 - d0;
  const step0 = span / n;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const err = step0 / mag;
  const step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(d0 / step) * step; v <= d1 + step * 1e-6; v += step) out.push(Math.round(v / step) * step);
  return out;
}
export function logTicks(d0: number, d1: number): number[] {
  const out: number[] = [];
  for (let e = Math.ceil(Math.log10(d0)); e <= Math.floor(Math.log10(d1)); e++) out.push(Math.pow(10, e));
  return out;
}

/** a series as [years, values] -> value at year x (linear between points; null outside) */
export function at(s: [number[], number[]], x: number): number | null {
  const [xs, ys] = s;
  if (!xs.length || x < xs[0] || x > xs[xs.length - 1]) return null;
  let lo = 0, hi = xs.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= x) lo = m; else hi = m; }
  if (xs[hi] === xs[lo]) return ys[lo];
  return lerp(ys[lo], ys[hi], (x - xs[lo]) / (xs[hi] - xs[lo]));
}

/** chart-space points of a series up to year `upTo` (interpolated end), as flat xyz */
export function path(s: [number[], number[]], X: Scale, Y: Scale, upTo = Infinity, from = -Infinity, step = 0): number[] {
  const [xs, ys] = s;
  const out: number[] = [];
  const push = (x: number, y: number) => out.push(X(x), Y(y), 0);
  let started = false;
  for (let i = 0; i < xs.length; i++) {
    if (xs[i] < from) continue;
    if (xs[i] > upTo) {
      if (i > 0 && xs[i - 1] <= upTo) { const v = at(s, upTo); if (v !== null) push(upTo, v); }
      break;
    }
    if (!started && from > -Infinity && i > 0 && xs[i - 1] < from) { const v = at(s, from); if (v !== null) push(from, v); }
    started = true;
    if (step > 0 && i > 0 && xs[i] - xs[i - 1] > step) {
      // densify long gaps so curves bent by the camera stay smooth
      const n = Math.ceil((xs[i] - xs[i - 1]) / step);
      for (let k = 1; k < n; k++) { const xx = xs[i - 1] + ((xs[i] - xs[i - 1]) * k) / n; push(xx, lerp(ys[i - 1], ys[i], k / n)); }
    }
    push(xs[i], ys[i]);
  }
  return out;
}

export type GridOpts = {
  base?: M4 | null;
  color?: RGBA;
  text?: RGBA;
  xTicks?: number[];
  yTicks?: number[];
  xFmt?: (v: number) => string;
  yFmt?: (v: number) => string;
  size?: number;
  alpha?: number;
  /** draw from x0 to x(progress) only, for a grid that writes itself */
  reveal?: number;
  noYLines?: boolean;
  dash?: boolean;
};

/** gridlines at y ticks (dashed hairlines, the OWID way), a baseline, tick labels */
export function grid(d: Draw, fonts: Fonts, X: Scale, Y: Scale, o: GridOpts = {}) {
  const a = o.alpha ?? 1;
  const col = withA(o.color || NIGHT.hair, (o.color || NIGHT.hair)[3] * a);
  const txt = withA(o.text || NIGHT.note, (o.text || NIGHT.note)[3] * a);
  const size = o.size || 15;
  const x0 = X.r0, x1 = lerp(X.r0, X.r1, o.reveal ?? 1);
  d.setModel(o.base || null);
  if (!o.noYLines) {
    d.lineStyle({ dash: o.dash === false ? null : [6, 0.5] });
    for (const v of o.yTicks || []) d.seg([x0, Y(v), 0], [x1, Y(v), 0], 1, col);
  }
  d.lineStyle({});
  d.seg([x0, Y.r0, 0], [x1, Y.r0, 0], 1.2, withA(col, Math.min(1, col[3] * 1.6)));
  d.flush();
  for (const v of o.yTicks || []) label(d, fonts, (o.yFmt || String)(v), X.r0 - 12, Y(v) + size * 0.35, size, txt, { align: 'right', base: o.base });
  for (const v of o.xTicks || []) {
    const px = X(v);
    if (px > x1 + 1) continue;
    label(d, fonts, (o.xFmt || String)(v), px, Y.r0 + size * 1.6, size, txt, { align: 'center', base: o.base });
  }
  d.setModel(null);
}

/** a chart's title block, top-left: a title in the infrastructure's face, a subtitle in mono */
export function titleBlock(d: Draw, fonts: Fonts, x: number, y: number, title: string, sub: string | null, o: { base?: M4 | null; alpha?: number; size?: number; color?: RGBA; subColor?: RGBA } = {}) {
  const a = o.alpha ?? 1;
  const s = o.size || 30;
  const c = o.color || [0.82, 0.86, 0.95, 1];
  label(d, fonts, title, x, y, s, withA(c, a), { font: 'pass', axes: { wght: 600 }, base: o.base });
  if (sub) label(d, fonts, sub, x, y + s * 1.05, s * 0.56, withA(o.subColor || NIGHT.note, a), { font: 'passMono', axes: { wght: 400 }, base: o.base });
}

export function sourceLine(d: Draw, fonts: Fonts, x: number, y: number, text: string, o: { base?: M4 | null; alpha?: number; color?: RGBA } = {}) {
  label(d, fonts, text, x, y, 13, withA(o.color || NIGHT.noteDim, o.alpha ?? 1), { font: 'passMono', axes: { wght: 400 }, base: o.base });
}

export const fmt = {
  pct: (v: number) => `${Math.round(v)}%`,
  int: (v: number) => Math.round(v).toLocaleString('en-US'),
  year: (v: number) => String(Math.round(v)),
  dec1: (v: number) => v.toFixed(1),
  big: (v: number) => {
    const a = Math.abs(v);
    if (a >= 1e12) return `${+(v / 1e12).toFixed(1)} trillion`;
    if (a >= 1e9) return `${+(v / 1e9).toFixed(1)} billion`;
    if (a >= 1e6) return `${+(v / 1e6).toFixed(1)} million`;
    if (a >= 1e3) return `${+(v / 1e3).toFixed(0)},000`;
    return String(+v.toFixed(2));
  },
  pow10: (v: number) => {
    const e = Math.round(Math.log10(v));
    const sup = '⁰¹²³⁴⁵⁶⁷⁸⁹';
    return '10' + String(e).split('').map((c) => (c === '-' ? '⁻' : sup[+c])).join('');
  },
};

/** draw a polyline in chart space with an optional head dot and glow */
export function line(d: Draw, pts: number[], w: number, c: RGBA | ((i: number, n: number) => RGBA), o: { base?: M4 | null; glow?: number; head?: number; headColor?: RGBA } = {}) {
  d.setModel(o.base || null);
  d.lineStyle({ glow: o.glow || 0 });
  d.poly(pts, w, c);
  if (o.head && pts.length >= 3) {
    const n = pts.length;
    d.dotStyle({});
    d.dot([pts[n - 3], pts[n - 2], pts[n - 1]], o.head, o.headColor || (typeof c === 'function' ? c(n / 3 - 1, n / 3) : c), 0.5);
  }
  d.flush();
  d.lineStyle({});
  d.setModel(null);
}

export function fillArea(d: Draw, top: number[], bottom: number[], paint: Paint, base: M4 | null = null, blend: 'alpha' | 'add' = 'alpha') {
  // top and bottom are flat xyz; polygon = top forward + bottom backward
  const poly: number[] = [];
  for (let i = 0; i < top.length; i += 3) poly.push(top[i], top[i + 1]);
  for (let i = bottom.length - 3; i >= 0; i -= 3) poly.push(bottom[i], bottom[i + 1]);
  if (poly.length < 6) return;
  d.fill([poly], paint, base, blend);
}

export { clamp };
