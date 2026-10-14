// Sung type. Every letter is a lamp: dark glass until the voice reaches it, then it lights the
// way the lamp of its scene lights (a sodium lamp warms from red, a filament flares, an LED
// snaps on, a tube flickers). A line is laid out word by word so each word can have its own
// width and weight, and kerned within the word by the shaper.
import { Draw, Paint } from '../engine/draw';
import { M4, RGBA, clamp, ease, hash1, lerp, mixc, withA } from '../engine/math';
import { Line, Word } from '../engine/score';
import { Axes, Fonts, Run, SetGlyph, glyphModel, setRun } from '../engine/text';
import { DAY, L, LIGHT, NIGHT } from './palette';
import { hex } from '../engine/math';

export type LightKind = 'sodium' | 'filament' | 'led' | 'fluoro' | 'strobe' | 'monitor' | 'tail' | 'taxi' | 'ink' | 'lightning';

/** colour of a lamp `dt` seconds after it was switched on (dt < 0: not yet) */
export function lamp(kind: LightKind, dt: number, intensity = 1, seed = 0): RGBA {
  if (dt < 0) return kind === 'ink' ? withA(DAY.ink, 0.13) : NIGHT.glass;
  const k = intensity;
  switch (kind) {
    case 'led': {
      const a = dt < 0.06 ? 1.9 : lerp(1.9, 1.15, clamp((dt - 0.06) / 0.18));
      return L('halide', a * k);
    }
    case 'filament': {
      const w = ease.outCubic(clamp(dt / 0.16));
      const c = mixc(L('filamentLow', 0.5), L('filament', 1), w);
      const over = dt < 0.25 ? 1 + 0.6 * Math.sin((dt / 0.25) * Math.PI) : 1;
      const flick = dt < 0.4 ? 1 - 0.18 * (hash1(seed * 13 + Math.floor(dt * 60)) > 0.7 ? 1 : 0) : 1;
      return [c[0] * over * flick * 1.15 * k, c[1] * over * flick * 1.15 * k, c[2] * over * flick * 1.15 * k, 1];
    }
    case 'sodium': {
      const w = ease.outQuad(clamp(dt / 0.5));
      const c = mixc(L('sodiumLow', 0.35), L('sodium', 1.25), w);
      return [c[0] * k, c[1] * k, c[2] * k, 1];
    }
    case 'fluoro': {
      // a tube's start: on, off, on, off, on
      const on = dt < 0.035 || (dt > 0.07 && dt < 0.1) || dt > 0.15 ? 1 : 0.08;
      const a = on * (dt < 0.2 ? 1.5 : 1.15);
      return L('fluoro', a * k);
    }
    case 'strobe': {
      const a = 1.0 + 3.5 * Math.exp(-dt / 0.06);
      return L('halide', a * k);
    }
    case 'lightning': {
      const a = 0.9 + 5 * Math.exp(-dt / 0.05);
      return L('lightning', a * k);
    }
    case 'monitor': {
      const a = 1.0 + 1.2 * Math.exp(-dt / 0.15);
      return L('monitor', a * k);
    }
    case 'tail': return L('tail', (1.1 + 0.8 * Math.exp(-dt / 0.1)) * k);
    case 'taxi': return L('taxi', (1.2 + 0.8 * Math.exp(-dt / 0.1)) * k);
    case 'ink': {
      const w = clamp(dt / 0.08);
      return mixc(withA(DAY.ink, 0.13), DAY.ink, w);
    }
  }
}

export type SetWord = { word: Word | null; text: string; run: Run; x: number; letters: number; axes: Axes };
export type SetLine = { line: Line | null; words: SetWord[]; width: number; size: number; font: string };

/** when the voice reaches letter k of n in a word: letters light at a speaking pace, a held note stays lit */
export function letterOn(w: Word, k: number, n: number): number {
  const span = Math.min(Math.max(0.05, w.end - w.start), 0.075 * n + 0.12);
  return w.start + (n <= 1 ? 0 : (span * k) / n);
}

export type LayoutOpts = {
  font?: string;
  size: number;
  axes?: Axes | ((wi: number, w: Word | null) => Axes);
  tracking?: number;
  upper?: boolean;
  /** extra space between words, in ems */
  space?: number;
  /** if the line would be wider than this (px), it is set smaller until it fits */
  maxWidth?: number;
};

/** lay a lyric line out word by word (each word shaped alone, so each can take its own axes) */
export function layLine(fonts: Fonts, line: Line | null, text: string | null, o: LayoutOpts): SetLine {
  const sl = layLine0(fonts, line, text, o);
  if (o.maxWidth && sl.width > o.maxWidth) return layLine0(fonts, line, text, { ...o, size: o.size * (o.maxWidth / sl.width) * 0.995 });
  return sl;
}

function layLine0(fonts: Fonts, line: Line | null, text: string | null, o: LayoutOpts): SetLine {
  const font = o.font || 'mona';
  const words = line ? line.words : (text || '').split(/\s+/).filter(Boolean).map((w) => null as unknown as Word);
  const texts = line ? line.words.map((w) => w.w) : (text || '').split(/\s+/).filter(Boolean);
  const baseAxes = typeof o.axes === 'function' ? o.axes(0, words[0] || null) : o.axes || {};
  const sp = setRun(fonts, font, ' ', o.size, baseAxes).glyphs[0]?.adv ?? o.size * 0.25;
  const out: SetWord[] = [];
  let x = 0;
  texts.forEach((raw, wi) => {
    const tx = o.upper ? raw.toUpperCase() : raw;
    const axes = typeof o.axes === 'function' ? o.axes(wi, words[wi] || null) : o.axes || {};
    const run = setRun(fonts, font, tx, o.size, axes, o.tracking || 0);
    out.push({ word: words[wi] || null, text: tx, run, x, letters: run.glyphs.length, axes });
    x += run.width + sp * (1 + (o.space || 0));
  });
  const width = out.length ? out[out.length - 1].x + out[out.length - 1].run.width : 0;
  return { line, words: out, width, size: o.size, font };
}

export type DrawLineOpts = {
  light: LightKind;
  intensity?: number;
  /** before the line is due, how visible its unlit glass is (0 = hidden) */
  glass?: number;
  glassColor?: RGBA;
  /** base transform (the plane the type lies on) */
  base?: M4 | null;
  /** per-glyph extra transform: returns [dx, dy, rot, sx, sy] in px */
  jiggle?: (wi: number, gi: number, g: SetGlyph, dt: number) => [number, number, number, number, number] | null;
  /** fade the whole line by this alpha */
  alpha?: number;
  blend?: 'alpha' | 'add';
  /** override colour after lighting (e.g. per word) */
  tint?: (wi: number, gi: number, c: RGBA) => RGBA;
};

/** draw a set line with its left baseline at (x, y) */
export function drawLine(d: Draw, sl: SetLine, x: number, y: number, t: number, o: DrawLineOpts) {
  const a = o.alpha ?? 1;
  if (a <= 0.001) return;
  sl.words.forEach((sw, wi) => {
    const n = sw.letters;
    sw.run.glyphs.forEach((g, gi) => {
      if (!g.geo.mesh) return;
      const on = sw.word ? letterOn(sw.word, gi, n) : -1e9;
      const dt = t - on;
      let c: RGBA;
      if (dt < 0) {
        const gc = o.glassColor || (o.light === 'ink' ? withA(DAY.ink, 0.12) : NIGHT.glass);
        c = withA(gc, gc[3] * (o.glass ?? 1));
      } else c = lamp(o.light, dt, o.intensity ?? 1, wi * 31 + gi);
      if (o.tint) c = o.tint(wi, gi, c);
      c = withA(c, c[3] * a);
      if (c[3] <= 0.002) return;
      let gx = x + sw.x + g.x, gy = y + g.y, rot = 0, sx = 1, sy = 1;
      if (o.jiggle) {
        const j = o.jiggle(wi, gi, g, dt);
        if (j) { gx += j[0]; gy += j[1]; rot = j[2]; sx = j[3]; sy = j[4]; }
      }
      d.fillMesh(g.geo.mesh, c, glyphModel(o.base || null, gx, gy, sw.run.scale, rot, sx, sy), o.blend || 'alpha');
    });
  });
}

/** a set line laid along a path: path(s) gives [x, y, angle] at distance s along it (px). Each glyph
 *  sits on the path at its pen position plus `start`, turned to the path's direction. */
export function drawOnPath(d: Draw, sl: SetLine, path: (s: number) => [number, number, number], start: number, t: number, o: DrawLineOpts & { lift?: (wi: number, gi: number) => number } = { light: 'led' }) {
  const a = o.alpha ?? 1;
  sl.words.forEach((sw, wi) => {
    const n = sw.letters;
    sw.run.glyphs.forEach((g, gi) => {
      if (!g.geo.mesh) return;
      const on = sw.word ? letterOn(sw.word, gi, n) : -1e9;
      const dt = t - on;
      let c: RGBA = dt < 0 ? withA(o.glassColor || NIGHT.glass, (o.glassColor || NIGHT.glass)[3] * (o.glass ?? 1)) : lamp(o.light, dt, o.intensity ?? 1, wi * 31 + gi);
      if (o.tint) c = o.tint(wi, gi, c);
      c = withA(c, c[3] * a);
      if (c[3] <= 0.002) return;
      // place the glyph by its centre so it turns about its middle
      const mid = start + sw.x + g.x + g.adv / 2;
      const [px, py, ang] = path(mid);
      const lift = o.lift ? o.lift(wi, gi) : 0;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      // offset back by half the advance along the path direction, and lift normal to it
      const gx = px - ca * (g.adv / 2) + sa * lift, gy = py - sa * (g.adv / 2) - ca * lift;
      d.fillMesh(g.geo.mesh, c, glyphModel(o.base || null, gx, gy, sw.run.scale, ang), o.blend || 'alpha');
    });
  });
}

/** plain text in one paint (labels, signs): returns its width */
export function label(d: Draw, fonts: Fonts, text: string, x: number, y: number, size: number, paint: Paint,
  o: { font?: string; axes?: Axes; tracking?: number; align?: 'left' | 'center' | 'right'; base?: M4 | null; blend?: 'alpha' | 'add' } = {}): number {
  const run = setRun(fonts, o.font || 'passMono', text, size, o.axes || { wght: 500 }, o.tracking || 0);
  const ox = o.align === 'center' ? -run.width / 2 : o.align === 'right' ? -run.width : 0;
  for (const g of run.glyphs) {
    if (!g.geo.mesh) continue;
    d.fillMesh(g.geo.mesh, paint, glyphModel(o.base || null, x + ox + g.x, y + g.y, run.scale), o.blend || 'alpha');
  }
  return run.width;
}

/** the colour a lamp of this kind settles at, for things that are simply on */
export function lit(kind: LightKind, intensity = 1): RGBA { return lamp(kind, 10, intensity); }

export { hex, LIGHT };
