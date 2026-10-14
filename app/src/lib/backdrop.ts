// What lives behind the subject of a shot, so that no frame is ever still: stars, motes of dust in
// the light, warm air rising (seen by a thermal camera), the clouds of the blue hour, particles
// streaming past a fall. None of it carries data; all of it is drawn faint, under the chart.
import { Camera } from '../engine/camera';
import { Draw } from '../engine/draw';
import { RGBA, fract, hash2, lerp, mixc, mulberry32, withA, hex } from '../engine/math';

/** stars over the page, each twinkling at its own rate, drifting a little with the sky */
export function stars(d: Draw, t: number, o: { seed?: number; n?: number; alpha?: number; top?: number; bottom?: number; drift?: number } = {}) {
  const rnd = mulberry32(o.seed ?? 11);
  const n = o.n ?? 260, a = o.alpha ?? 1, y0 = o.top ?? -20, y1 = o.bottom ?? 1100, drift = o.drift ?? 4;
  d.setCamera(Camera.home());
  d.dotStyle({ blend: 'add' });
  for (let i = 0; i < n; i++) {
    const x = fract(rnd() + (t * drift) / 2000) * 2000 - 40, y = lerp(y0, y1, rnd());
    const big = rnd(), rate = 0.6 + rnd() * 2.4, ph = rnd() * 6.283;
    const tw = 0.55 + 0.45 * Math.sin(t * rate + ph);
    const c: RGBA = big > 0.93 ? hex('#ffe2b8', 1.1) : big > 0.75 ? hex('#cfe0ff', 0.9) : hex('#aab8d8', 0.55);
    d.dot([x, y, 0], big > 0.93 ? 1.6 : 1.0, withA(c, a * tw * (0.35 + 0.65 * big)), 0.6);
  }
  d.flush();
}

/** motes of dust or pollen afloat in the light: a few sharp and near, more soft and far */
export function motes(d: Draw, t: number, o: { seed?: number; n?: number; color?: RGBA; alpha?: number; rise?: number } = {}) {
  const rnd = mulberry32(o.seed ?? 5);
  const n = o.n ?? 70, c = o.color ?? hex('#ffd7a3', 0.8), a = o.alpha ?? 1, rise = o.rise ?? 18;
  d.setCamera(Camera.home());
  d.dotStyle({ blend: 'add' });
  for (let i = 0; i < n; i++) {
    const depth = rnd();                       // 0 far .. 1 near
    const sp = rise * (0.4 + depth * 1.2);
    const x0 = rnd() * 2100 - 90, y0 = rnd() * 1300;
    const sway = 26 * Math.sin(t * (0.3 + rnd() * 0.5) + rnd() * 6.283);
    const x = x0 + sway, y = ((y0 - t * sp) % 1300 + 1300) % 1300 - 110;
    const r = depth > 0.85 ? 7 + 9 * depth : 1.2 + 2.2 * depth;
    const soft = depth > 0.85 ? 1 : 0.5;
    const tw = 0.7 + 0.3 * Math.sin(t * (1 + rnd() * 2) + i);
    d.dot([x, y, 0], r, withA(c, a * tw * (depth > 0.85 ? 0.12 : 0.25 + 0.5 * depth)), soft);
  }
  d.flush();
}

/** warm air rising: big soft plumes, which a thermal camera shows as slow violet-red wisps */
export function plumes(d: Draw, t: number, o: { seed?: number; n?: number; heat?: number; y0?: number } = {}) {
  const rnd = mulberry32(o.seed ?? 21);
  const n = o.n ?? 26, heat = o.heat ?? 1, base = o.y0 ?? 1150;
  d.setCamera(Camera.home());
  d.dotStyle({ blend: 'add' });
  for (let i = 0; i < n; i++) {
    const x0 = rnd() * 2000 - 40, sp = 30 + rnd() * 50, life = 9 + rnd() * 6;
    const ph = fract(rnd() + t / life);
    const y = base - ph * 1350;
    const x = x0 + 60 * Math.sin(t * 0.4 + i) * ph;
    const r = 60 + 160 * ph;
    const a = Math.sin(ph * Math.PI) * heat;
    d.dot([x, y, 0], r, withA(hex('#ffb070', 0.05 + 0.035 * rnd()), a), 1);
    void sp;
  }
  d.flush();
}

/** the blue hour's clouds: long thin streaks, dark above, lit from below as the sun nears (k 0..1) */
export function clouds(d: Draw, t: number, k: number, o: { seed?: number; n?: number; top?: number; bottom?: number; alpha?: number } = {}) {
  const rnd = mulberry32(o.seed ?? 3);
  const n = o.n ?? 9, y0 = o.top ?? 80, y1 = o.bottom ?? 620, a = o.alpha ?? 1;
  d.setCamera(Camera.home());
  const lit = mixc(hex('#3a3f63'), mixc(hex('#c9708a'), hex('#ffb37a'), Math.max(0, k * 1.4 - 0.4)), Math.min(1, k * 1.3));
  const dark = mixc(hex('#0d1226'), hex('#3a3555'), k);
  for (let i = 0; i < n; i++) {
    const depth = rnd();
    const y = lerp(y0, y1, rnd());
    const w = 380 + 900 * rnd(), h = 8 + 26 * rnd() * (0.4 + depth);
    const sp = 6 + 18 * depth;
    const x = ((rnd() * 2600 + t * sp) % 2600) - 600;
    // a streak: a flat ellipse, its underside catching the light
    const pts: number[] = [];
    const m = 28;
    for (let j = 0; j <= m; j++) {
      const u = j / m, ang = u * Math.PI * 2;
      const wob = 1 + 0.18 * Math.sin(ang * 3 + i) * Math.sin(ang * 5 + depth * 7);
      pts.push(x + (Math.cos(ang) * w) / 2, y + Math.sin(ang) * (h / 2) * wob);
    }
    d.fill([pts], { c0: withA(dark, 0.9 * a), c1: withA(lit, (0.55 + 0.4 * depth) * a), from: [0, y - h / 2], to: [0, y + h / 2] }, null, 'alpha');
  }
}

/** particles streaming past a camera that falls along +z (world space, around an axis at cx, cy) */
export function stream(d: Draw, t: number, depth: number, speed: number, o: { cx?: number; cy?: number; seed?: number; n?: number; color?: RGBA; r0?: number; r1?: number } = {}) {
  const rnd = mulberry32(o.seed ?? 31);
  const n = o.n ?? 300, cx = o.cx ?? 960, cy = o.cy ?? 540, c = o.color ?? hex('#ffd7a3', 1.2);
  const r0 = o.r0 ?? 260, r1 = o.r1 ?? 1400, span = 7000;
  d.lineStyle({ blend: 'add', fog: [3000, 7000, 0.0] });
  for (let i = 0; i < n; i++) {
    const ang = rnd() * Math.PI * 2, rad = lerp(r0, r1, Math.sqrt(rnd()));
    const z = depth - 900 + fract(rnd() - depth / span) * span;
    const len = Math.min(600, 30 + speed * 0.06);
    const x = cx + Math.cos(ang) * rad, y = cy + Math.sin(ang) * rad;
    const h = hash2(i, 7);
    d.seg([x, y, z], [x, y, z + len], 1.2 + 1.5 * h, withA(c, 0.25 + 0.5 * h));
  }
  d.flush();
  d.lineStyle({});
}
