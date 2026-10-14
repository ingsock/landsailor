// The small multiples of "This is my progress": every chart of the film again, each in a city block
// of its own, each drawing itself the way its own scene moved (the convoy's one speed, the takeoff's
// acceleration and its shudder in 2020, the switches' flicker, the spring of the year's
// temperature, the energy's flow, the hundred lights of the births, the turning wheel, the aisles
// gliding out, people lifted out of the band, stalks growing, the population breaking out of its
// frame, towers built floor by floor, the storm's lightning, the slow settling of age, packets, the
// dive through orders of magnitude, the decoding, the heartbeat), and each still moving after.
// Drawn in a panel's own units (PW x PH), placed on the ground by a model matrix.
import { Draw } from '../engine/draw';
import { Fonts } from '../engine/text';
import { M4, RGBA, clamp, ease, fract, hash2, hex, lerp, mixc, mulberry32, withA } from '../engine/math';
import { at, path } from './chart';
import { label } from './lyric';
import { L, NIGHT } from './palette';

export const PW = 280, PH = 280;
const CX0 = 20, CX1 = 260, CY0 = 66, CY1 = 238;

type S = [number[], number[]];
export type MiniCtx = { d: Draw; fonts: Fonts; t: number; age: number; a: number; thin: number; M: M4; beat: number; u: number };
export type Mini = { title: string; foot: string; tint: RGBA; draw: (c: MiniCtx) => string };

const sx = (y0: number, y1: number) => (y: number) => CX0 + ((y - y0) / (y1 - y0)) * (CX1 - CX0);
const sy = (v0: number, v1: number) => (v: number) => CY1 - ((v - v0) / (v1 - v0)) * (CY1 - CY0);
const fade = (c: RGBA, a: number): RGBA => withA(c, c[3] * a);
const dim = (c: RGBA, a: number): RGBA => [c[0] * a, c[1] * a, c[2] * a, c[3]];

/** a point and direction at arc length s along flat xyz points */
function along(p: number[], s: number): [number, number, number, number] {
  let acc = 0;
  for (let i = 3; i < p.length; i += 3) {
    const l = Math.hypot(p[i] - p[i - 3], p[i + 1] - p[i - 2]);
    if (acc + l >= s || i === p.length - 3) {
      const u = l > 0 ? clamp((s - acc) / l) : 0;
      return [p[i - 3] + (p[i] - p[i - 3]) * u, p[i - 2] + (p[i + 1] - p[i - 2]) * u, (p[i] - p[i - 3]) / (l || 1), (p[i + 1] - p[i - 2]) / (l || 1)];
    }
    acc += l;
  }
  return [p[0] || 0, p[1] || 0, 1, 0];
}
function plen(p: number[]): number { let s = 0; for (let i = 3; i < p.length; i += 3) s += Math.hypot(p[i] - p[i - 3], p[i + 1] - p[i - 2]); return s; }

/** a thermal camera's palette, as light: cold violet to hot white */
function iron(x: number, k = 1.3): RGBA {
  const st = ['#2a0c60', '#8a1aa0', '#f0601a', '#ffc72e', '#fff8e0'];
  x = clamp(x) * (st.length - 1);
  const i = Math.min(st.length - 2, Math.floor(x));
  return mixc(hex(st[i], k), hex(st[i + 1], k), x - i);
}

const ENERGY_C: Record<string, string> = {
  'Traditional biomass': '#8a4a1c', Coal: '#b86a1e', Oil: '#d8391f', Gas: '#3f6fe0', Nuclear: '#e9f0ff', Hydropower: '#57a6ff',
  Wind: '#bfe3ff', Solar: '#ffd36a', Biofuels: '#9fd36a', 'Other renewables': '#9aa6bd',
};

export function makeMinis(charts: any, weather: any): Mini[] {
  const W = (k: string): S => charts[k].series.World;
  const line = (c: MiniCtx, pts: number[], w: number, col: RGBA | ((i: number, n: number) => RGBA), glow = 1.5) => {
    c.d.setModel(c.M);
    c.d.lineStyle({ glow: glow * c.thin });
    c.d.poly(pts, w * c.thin, typeof col === 'function' ? (i, n) => fade(col(i, n), c.a) : fade(col, c.a));
    c.d.flush();
    c.d.lineStyle({});
  };
  const base = (c: MiniCtx, y = CY1) => {
    c.d.setModel(c.M);
    c.d.lineStyle({});
    c.d.seg([CX0, y, 0], [CX1, y, 0], 0.8 * c.thin, fade(NIGHT.hair, c.a));
    c.d.flush();
  };
  const minis: Mini[] = [];

  // ---- trade: the convoy, one constant speed, headlights running along the road it draws
  minis.push({ title: 'TRADE', foot: '1827–2014 · EXPORTS / GDP', tint: L('tail', 1.3), draw: (c) => {
    const s = W('trade'), X = sx(1827, 2014), Y = sy(0, 30);
    const yr = lerp(1827, 2014, clamp(c.age / 1.3));
    base(c);
    const p = path(s, X as any, Y as any, yr);
    line(c, p, 1.6, L('tail', 1.1));
    const n = plen(p);
    c.d.lineStyle({ blend: 'add' });
    for (let i = 0; i < 9 && n > 10; i++) {
      const at0 = fract(i / 9 + c.t * 0.22) * n;
      const [x, y] = along(p, at0), [bx, by] = along(p, Math.max(0, at0 - 14));
      c.d.seg([x, y, 0], [bx, by, 0], 2 * c.thin, dim(L('halide', 2.2), c.a), 1 * c.thin, dim(L('tail', 0.6), c.a));
    }
    c.d.flush();
    return `${Math.round(at(s, yr) ?? 0)}%`;
  } });

  // ---- air passengers: the takeoff, accelerating; a shudder in 2020; a strobe on the head
  minis.push({ title: 'AIR PASSENGERS', foot: '1970–2023 · BILLIONS', tint: L('halide', 1.3), draw: (c) => {
    const s = W('air'), X = sx(1970, 2023), Y = sy(0, 5);
    const k = clamp(c.age / 1.25), yr = lerp(1970, 2023, k * k);
    base(c);
    const p = path(s, X as any, Y as any, yr);
    line(c, p, 1.5, L('halide', 1.1));
    if (p.length >= 6) {
      const n = p.length;
      let hx = p[n - 3], hy = p[n - 2];
      const dx = p[n - 3] - p[n - 6], dy = p[n - 2] - p[n - 5], l = Math.hypot(dx, dy) || 1;
      if (yr > 2019.4 && yr < 2021.6) { hx += Math.sin(c.t * 90) * 2.2; hy += Math.cos(c.t * 77) * 2.2; }
      const ux = dx / l, uy = dy / l;
      c.d.fill([[hx + ux * 9, hy + uy * 9, hx - ux * 6 - uy * 6, hy - uy * 6 + ux * 6, hx - ux * 3, hy - uy * 3, hx - ux * 6 + uy * 6, hy - uy * 6 - ux * 6]], fade(L('halide', 1.6), c.a), c.M, 'add');
      const strobe = fract(c.t * 1.3) < 0.07 ? 1 : 0;
      c.d.dotStyle({ world: true, blend: 'add' });
      c.d.dot([hx, hy, 0], (3 + 6 * strobe) * c.u, dim(L('halide', 0.5 + 2.5 * strobe), c.a), 1);
      c.d.flush();
    }
    return `${(at(s, Math.min(yr, 2023)) ?? 0).toFixed(1)} bn`;
  } });

  // ---- electricity: switches, a bar a year snapping on with a tube's flicker
  minis.push({ title: 'ELECTRICITY', foot: '1998–2024 · SHARE WITH ACCESS', tint: L('filament', 1.3), draw: (c) => {
    const s = W('elec'), X = sx(1997.5, 2024.5), Y = sy(60, 100);
    base(c);
    let last = 0;
    s[0].forEach((y, i) => {
      const dt = c.age - (i / s[0].length) * 1.15;
      if (dt < 0) return;
      const on = dt < 0.035 || (dt > 0.07 && dt < 0.1) || dt > 0.15 ? 1 : 0.12;
      const v = s[1][i];
      last = v;
      const bw = (X(1) - X(0)) * 0.62;
      c.d.rect(X(y) - bw / 2, Y(v), bw, Y(60) - Y(v), fade(L('filament', 0.75 * on), c.a), c.M, 'add');
      c.d.rect(X(y) - bw / 2, Y(v) - 1.5, bw, 1.5, fade(L('fluoro', 1.8 * on), c.a), c.M, 'add');
    });
    return `${Math.round(last)}%`;
  } });

  // ---- Chicago 2023: a year of daily temperature, each day springing out from 21 °C
  const tmean: number[] = weather.mean;
  minis.push({ title: 'CHICAGO, 2023', foot: 'DAILY MEAN TEMPERATURE · °C', tint: hex('#f0601a', 1.4), draw: (c) => {
    const Y = sy(-22, 32);
    const n = tmean.length;
    const drawn = Math.floor(clamp(c.age / 1.3) * n);
    base(c);
    c.d.setModel(c.M);
    c.d.lineStyle({ dash: [5, 0.5] });
    c.d.seg([CX0, Y(21), 0], [CX1, Y(21), 0], 0.8 * c.thin, fade(NIGHT.note, 0.6 * c.a));
    c.d.flush();
    const p: number[] = [], cols: RGBA[] = [];
    for (let i = 0; i < drawn; i++) {
      const dt = c.age - (i / n) * 1.3;
      // a damped spring from the flat line out to the day's own temperature
      const w = 2 * Math.PI * 2.1, z = 0.3, wd = w * Math.sqrt(1 - z * z);
      const sp = dt <= 0 ? 0 : 1 - Math.exp(-z * w * dt) * (Math.cos(wd * dt) + (z * w / wd) * Math.sin(wd * dt));
      const v = 21 + (tmean[i] - 21) * sp;
      p.push(CX0 + (i / (n - 1)) * (CX1 - CX0), Y(v), 0);
      cols.push(iron((tmean[i] + 20) / 52, 1.4));
    }
    line(c, p, 1.3, (i) => cols[i] || cols[0], 1);
    return `${Math.round(Math.min(...tmean))} to ${Math.round(Math.max(...tmean))} °C`;
  } });

  // ---- energy by source: a river, its particles carried along each layer
  const en = charts.energy;
  const SRC = Object.keys(en.layers);
  minis.push({ title: 'ENERGY BY SOURCE', foot: '1800–2025 · TWh', tint: hex('#ffd36a', 1.3), draw: (c) => {
    const X = sx(1800, 2025), Y = sy(0, 200000);
    const yr = lerp(1800, 2025, ease.inOutSine(clamp(c.age / 1.4)));
    base(c);
    const ys: number[] = en.years;
    const stack = ys.map((_, i) => { let a = 0; return [0, ...SRC.map((k) => (a += en.layers[k][i] || 0))]; });
    SRC.forEach((k, s) => {
      const top: number[] = [], bot: number[] = [];
      for (let i = 0; i < ys.length && ys[i] <= yr; i++) { top.push(X(ys[i]), Y(stack[i][s + 1])); bot.push(X(ys[i]), Y(stack[i][s])); }
      if (top.length < 4) return;
      const poly = [...top];
      for (let i = bot.length / 2 - 1; i >= 0; i--) poly.push(bot[i * 2], bot[i * 2 + 1]);
      c.d.fill([poly], fade(hex(ENERGY_C[k], 0.55), c.a), c.M, 'add');
    });
    const rnd = mulberry32(3);
    c.d.setModel(c.M);
    c.d.dotStyle({ world: true, blend: 'add' });
    for (let p = 0; p < 70; p++) {
      const s = Math.floor(rnd() * SRC.length);
      const yv = 1800 + fract(rnd() + c.t * (0.08 + 0.04 * rnd())) * 225;
      if (yv > yr) continue;
      const i = Math.max(0, ys.findIndex((y) => y >= yv));
      const lo = stack[i][s], hi = stack[i][s + 1];
      if (hi - lo < 800) continue;
      c.d.dot([X(yv), Y(lerp(lo, hi, rnd())), 0], (1.4) * c.u, dim(hex(ENERGY_C[SRC[s]], 2), c.a), 0.4);
    }
    c.d.flush();
    const i = ys.findIndex((y) => y >= yr);
    const tot = stack[Math.max(0, i < 0 ? ys.length - 1 : i)][SRC.length];
    return `${Math.round(tot / 1000)},000`;
  } });

  // ---- child mortality: a hundred lights, each child who lives to five lit
  minis.push({ title: 'LIVE TO FIVE', foot: '1800–2024 · OF EVERY 100 BORN', tint: L('filament', 1.4), draw: (c) => {
    const s = W('child');
    const yr = lerp(1800, 2024, ease.inOutSine(clamp(c.age / 1.4)));
    const surv = 100 - (at(s, yr) ?? 43);
    c.d.setModel(c.M);
    c.d.dotStyle({ world: true, blend: 'add' });
    for (let i = 0; i < 100; i++) {
      const x = CX0 + 14 + (i % 10) * 23.6, y = CY0 + 10 + Math.floor(i / 10) * 17.4;
      const g = clamp((surv - i) * 1.5);
      if (g <= 0) { c.d.dot([x, y, 0], (2.6) * c.u, dim(hex('#24304f', 1), c.a), 0); continue; }
      const r = 2.6 + 2.6 * ease.outBack(g);
      const tw = 0.85 + 0.15 * Math.sin(c.t * (2 + hash2(i, 3) * 3) + i);
      c.d.dot([x, y, 0], (r) * c.u, dim(L('filament', 1.2 * tw), c.a), 0.5);
    }
    c.d.flush();
    label(c.d, c.fonts, String(Math.round(yr)), CX1, CY1 + 4, 13, fade(NIGHT.noteDim, c.a), { base: c.M, align: 'right' });
    return `${Math.round(surv)} of 100`;
  } });

  // ---- fruit: the year's wheel, turning; a decade a sector
  minis.push({ title: 'FRUIT SUPPLY', foot: '1961–2023 · KG PER PERSON', tint: hex('#ff4f7a', 1.4), draw: (c) => {
    const s = W('fruit');
    const yr = lerp(1961, 2023, ease.inOutSine(clamp(c.age / 1.3)));
    const cx = (CX0 + CX1) / 2, cy = (CY0 + CY1) / 2 + 4, r0 = 20, r1 = 84;
    const rot = c.t * 0.35;
    const R = (v: number) => r0 + (v / 100) * (r1 - r0);
    const A = (y: number) => -Math.PI / 2 + ((y - 1961) / 63) * Math.PI * 1.9 + rot;
    c.d.setModel(c.M);
    c.d.lineStyle({});
    for (const v of [25, 50, 75, 100]) {
      const pts: number[] = [];
      for (let i = 0; i <= 64; i++) { const a = (i / 64) * Math.PI * 2; pts.push(cx + Math.cos(a) * R(v), cy + Math.sin(a) * R(v), 0); }
      c.d.poly(pts, 0.7 * c.thin, fade(NIGHT.hair, c.a));
    }
    for (let y = 1961; y <= 2023; y += 10) c.d.seg([cx + Math.cos(A(y)) * r0, cy + Math.sin(A(y)) * r0, 0], [cx + Math.cos(A(y)) * r1, cy + Math.sin(A(y)) * r1, 0], 0.6 * c.thin, fade(NIGHT.hair, c.a));
    c.d.flush();
    const p: number[] = [];
    for (let i = 0; i < s[0].length && s[0][i] <= yr; i++) p.push(cx + Math.cos(A(s[0][i])) * R(s[1][i]), cy + Math.sin(A(s[0][i])) * R(s[1][i]), 0);
    line(c, p, 1.7, hex('#ff4f7a', 1.3));
    return `${Math.round(at(s, yr) ?? 0)} kg`;
  } });

  // ---- calories: the aisles, gliding out to their lengths, the world's in its own ink
  const kc = Object.entries(charts.kcal.series as Record<string, S>).map(([n, s]) => ({ n, v: s[1][s[1].length - 1] })).sort((a, b) => b.v - a.v);
  minis.push({ title: 'CALORIES', foot: 'KCAL PER PERSON PER DAY · LATEST', tint: hex('#ff5aa0', 1.3), draw: (c) => {
    const X = (v: number) => CX0 + (v / 3900) * (CX1 - CX0);
    const h = (CY1 - CY0) / kc.length;
    kc.forEach((r, i) => {
      const g = ease.outCubic(clamp((c.age - i * 0.05) / 0.7));
      if (g <= 0) return;
      const w = r.n === 'World';
      c.d.rect(CX0, CY0 + i * h + 1, (X(r.v) - CX0) * g, h - 3, fade(w ? hex('#ff5aa0', 1.2) : hex('#4f7dff', 0.55), c.a), c.M, 'add');
      if (w && g > 0.9) label(c.d, c.fonts, 'WORLD', X(r.v) + 5, CY0 + i * h + h - 2, 10, fade(hex('#ff5aa0', 1.2), c.a), { base: c.M });
    });
    const wv = kc.find((r) => r.n === 'World');
    return wv ? `${Math.round(wv.v).toLocaleString('en-US')} kcal` : '';
  } });

  // ---- extreme poverty: people lifted out of the band on springs as the share falls past them
  minis.push({ title: 'EXTREME POVERTY', foot: '1820–2018 · SHARE OF THE WORLD', tint: hex('#ff8fb6', 1.3), draw: (c) => {
    const s = W('poverty'), X = sx(1820, 2018), Y = sy(0, 100);
    const yr = lerp(1820, 2018, ease.inOutSine(clamp(c.age / 1.35)));
    const pov = at(s, yr) ?? 76;
    const p = path(s, X as any, Y as any, yr);
    if (p.length >= 6) {
      const poly: number[] = [];
      for (let i = 0; i < p.length; i += 3) poly.push(p[i], p[i + 1]);
      poly.push(p[p.length - 3], Y(0), p[0], Y(0));
      c.d.fill([poly], fade(hex('#ff5aa0', 0.12), c.a), c.M, 'add');
    }
    line(c, p, 1.4, hex('#ff8fb6', 1.2));
    c.d.setModel(c.M);
    c.d.dotStyle({ world: true, blend: 'add' });
    c.d.lineStyle({});
    for (let i = 0; i < 20; i++) {
      const thr = ((i + 0.5) / 20) * 100;
      const g = ease.outBack(clamp((thr - pov) / 7));
      const x = CX0 + 10 + i * 11.8, yb = CY1 - 12, yt = CY0 + 8 + (i % 3) * 6;
      const y = lerp(yb, yt, g);
      const col = g > 0.5 ? L('halide', 1.1) : hex('#8a5a78', 0.8);
      c.d.dot([x, y - 4, 0], (2.2) * c.u, dim(col, c.a), 0);
      c.d.seg([x, y - 1, 0], [x, y + 6, 0], 1.4 * c.thin, dim(col, c.a));
    }
    c.d.flush();
    return `${Math.round(pov)}%`;
  } });

  // ---- cereal yield: stalks growing, a year each, swaying
  minis.push({ title: 'CEREAL YIELD', foot: '1961–2024 · TONNES PER HECTARE', tint: hex('#ffcf6a', 1.3), draw: (c) => {
    const s = W('cereal'), X = sx(1960, 2025), Y = sy(0, 5);
    base(c);
    c.d.setModel(c.M);
    c.d.lineStyle({});
    let last = 0;
    s[0].forEach((y, i) => {
      const g = ease.outCubic(clamp((c.age - i * 0.017) / 0.5));
      if (g <= 0) return;
      last = s[1][i];
      const x = X(y), h = (Y(0) - Y(s[1][i])) * g;
      const sw = Math.sin(c.t * 1.9 + i * 0.37) * 1.8 * g;
      c.d.seg([x, Y(0), 0], [x + sw, Y(0) - h, 0], 1.1 * c.thin, fade(hex('#d9a441', 0.9), c.a));
      if (g > 0.7) c.d.seg([x + sw, Y(0) - h, 0], [x + sw * 1.3, Y(0) - h - 5, 0], 2.2 * c.thin, fade(hex('#ffcf6a', 1.3), c.a));
    });
    c.d.flush();
    return `${last.toFixed(1)} t`;
  } });

  // ---- population: the line breaks out through the top of its frame
  minis.push({ title: 'POPULATION', foot: '1700–2023 · BILLIONS · AXIS TO 5', tint: L('filament', 1.4), draw: (c) => {
    const s = W('pop'), X = sx(1700, 2023), Y = sy(0, 5);
    const k = clamp(c.age / 1.3), yr = lerp(1700, 2023, k * k * k);
    base(c);
    c.d.setModel(c.M);
    c.d.lineStyle({ dash: [4, 0.5] });
    c.d.seg([CX0, Y(5), 0], [CX1, Y(5), 0], 0.8 * c.thin, fade(NIGHT.note, 0.7 * c.a));
    c.d.flush();
    const p = path(s, X as any, Y as any, yr);
    line(c, p, 1.8, L('filament', 1.25), 2);
    const v = at(s, yr) ?? 0.6;
    if (v > 5.2 && p.length >= 6) {
      const n = p.length;
      label(c.d, c.fonts, `${v.toFixed(1)} bn`, p[n - 3] - 8, p[n - 2] - 6, 13, fade(L('filament', 1.3), c.a), { base: c.M, align: 'right', font: 'passMono', axes: { wght: 700 } });
    }
    return `${v.toFixed(1)} bn`;
  } });

  // ---- urban share: towers, floor by floor, their windows coming on
  minis.push({ title: 'LIVING IN CITIES', foot: '1700–2025 · SHARE OF PEOPLE', tint: L('sodium', 1.4), draw: (c) => {
    const s = W('urban'), Y = sy(0, 60);
    base(c);
    const yrs: number[] = [];
    for (let y = 1700; y <= 2025; y += 25) yrs.push(y);
    const tw = (CX1 - CX0) / yrs.length;
    let last = 0;
    c.d.setModel(c.M);
    c.d.lineStyle({});
    c.d.dotStyle({ world: true, blend: 'add' });
    yrs.forEach((y, i) => {
      const v = at(s, y) ?? 7;
      const h = Y(0) - Y(v), fh = 5.2;
      const floors = Math.max(1, Math.round(h / fh));
      const built = Math.min(floors, Math.floor((c.age - i * 0.07) * 34));
      if (built <= 0) return;
      last = v;
      const x0 = CX0 + i * tw + tw * 0.18, x1 = x0 + tw * 0.64, top = Y(0) - built * fh;
      c.d.seg([x0, Y(0), 0], [x0, top, 0], 0.9 * c.thin, fade(NIGHT.note, c.a));
      c.d.seg([x1, Y(0), 0], [x1, top, 0], 0.9 * c.thin, fade(NIGHT.note, c.a));
      c.d.seg([x0, top, 0], [x1, top, 0], 1.1 * c.thin, fade(L('halide', 0.9), c.a));
      for (let f = 0; f < built; f++) for (let w = 0; w < 2; w++) {
        if (hash2(i * 13 + f, w + Math.floor(c.t * 0.7 + hash2(f, i) * 3)) < 0.45) continue;
        c.d.dot([lerp(x0, x1, 0.3 + 0.4 * w), Y(0) - (f + 0.5) * fh, 0], (1.25) * c.u, dim(L('sodium', 1.4), c.a), 0);
      }
    });
    c.d.flush();
    return `${Math.round(last)}%`;
  } });

  // ---- CO2 and temperature: a dark mass, and the temperature drawn by lightning
  minis.push({ title: 'CO₂ AND TEMPERATURE', foot: '1750–2025 · GT CO2 A YEAR · °C', tint: L('lightning', 1.4), draw: (c) => {
    const co = W('co2'), te = W('temp'), X = sx(1750, 2025), Yc = sy(0, 45), Yt = sy(-0.6, 1.7);
    const yr = lerp(1750, 2025, ease.inOutSine(clamp(c.age / 1.2)));
    base(c);
    const p = path(co, X as any, Yc as any, yr);
    if (p.length >= 6) {
      const poly: number[] = [];
      for (let i = 0; i < p.length; i += 3) poly.push(p[i], p[i + 1]);
      poly.push(p[p.length - 3], Yc(0), p[0], Yc(0));
      c.d.fill([poly], fade(hex('#6c7aa0', 0.22), c.a), c.M, 'add');
    }
    // gusts in the mass
    c.d.setModel(c.M);
    c.d.lineStyle({ blend: 'add' });
    const rnd = mulberry32(8);
    for (let i = 0; i < 26; i++) {
      const u = fract(rnd() + c.t * (0.3 + 0.3 * rnd()));
      const y0 = lerp(1750, 2025, u);
      if (y0 > yr) continue;
      const top = Yc(at(co, y0) ?? 0);
      const yy = lerp(Yc(0), top, 0.2 + 0.7 * rnd());
      const x = X(y0);
      c.d.seg([x, yy, 0], [x - 9, yy + 3 * Math.sin(c.t * 3 + i), 0], 0.9 * c.thin, dim(hex('#aab8d8', 0.5), c.a), 0.9 * c.thin, [0, 0, 0, 0]);
    }
    c.d.flush();
    // the strike: all at once once the mass is up, then again every so often
    const since = c.age - 1.0;
    if (since > 0) {
      const ph = since < 1.9 ? since : fract((since - 1.9) / 2.3) * 2.3;
      const fl = 1 + 3 * Math.exp(-ph / 0.07);
      const jag = Math.exp(-ph / 0.18);
      const tp = path(te, X as any, Yt as any, 2026);
      for (let i = 0; i < tp.length; i += 3) tp[i + 1] += (hash2(i, Math.floor(c.t * 30)) - 0.5) * 14 * jag;
      line(c, tp, 1.4, L('lightning', 0.9 * fl), 2.5);
    }
    const tv = at(te, Math.min(2026, Math.max(1850, yr))) ?? 0;
    return `${tv >= 0.05 ? '+' : tv <= -0.05 ? '−' : ''}${Math.abs(tv).toFixed(1)} °C`;
  } });

  // ---- median age: slow, heavy, settling
  minis.push({ title: 'MEDIAN AGE', foot: '1950–2023 · YEARS', tint: hex('#c9d4ec', 1.2), draw: (c) => {
    const s = W('median'), X = sx(1950, 2023), Y = sy(18, 34);
    const k = clamp(c.age / 1.9), yr = lerp(1950, 2023, ease.inOutQuart(k));
    base(c);
    const p = path(s, X as any, Y as any, yr);
    // the head sags under its own weight and settles
    const sag = 4 * Math.sin(Math.min(1, k) * Math.PI) ** 2;
    if (p.length >= 3) p[p.length - 2] += sag;
    line(c, p, 2.8, hex('#c9d4ec', 1.0), 1);
    return `${(at(s, yr) ?? 22).toFixed(1)}`;
  } });

  // ---- internet: packets along the fibre
  minis.push({ title: 'INTERNET', foot: '2005–2025 · SHARE ONLINE', tint: L('halide', 1.4), draw: (c) => {
    const s = W('internet'), X = sx(2005, 2025), Y = sy(0, 100);
    const yr = lerp(2005, 2025, ease.inOutSine(clamp(c.age / 1.2)));
    base(c);
    const p = path(s, X as any, Y as any, yr);
    line(c, p, 1.5, L('halide', 0.9));
    const n = plen(p);
    c.d.lineStyle({ blend: 'add' });
    for (let i = 0; i < 7 && n > 10; i++) {
      const a0 = fract(i / 7 + c.t * 0.8) * n;
      const [x, y] = along(p, a0), [bx, by] = along(p, Math.max(0, a0 - 7));
      c.d.seg([x, y, 0], [bx, by, 0], 2.6 * c.thin, dim(L('halide', 3), c.a));
    }
    c.d.flush();
    return `${Math.round(at(s, yr) ?? 0)}%`;
  } });

  // ---- transistors: the dive through orders of magnitude, each decade lit as it is passed
  minis.push({ title: 'TRANSISTORS PER CHIP', foot: '1971–2021 · LOG SCALE', tint: hex('#ffb066', 1.3), draw: (c) => {
    const s = W('transistors'), X = sx(1971, 2021), Y = sy(3, 11);
    const yr = lerp(1971, 2021, clamp(c.age / 1.3));
    const ls: S = [s[0], s[1].map((v) => Math.log10(v))];
    const now = at(ls, yr) ?? 3.4;
    c.d.setModel(c.M);
    c.d.lineStyle({});
    for (let e = 3; e <= 11; e++) {
      const lit = now >= e ? Math.exp(-(now - e) * 1.5) : 0;
      c.d.seg([CX0, Y(e), 0], [CX1, Y(e), 0], 0.7 * c.thin, fade(mixc(NIGHT.hair, hex('#ffb066', 1.6), lit), c.a));
    }
    c.d.flush();
    const p = path(ls, X as any, Y as any, yr);
    line(c, p, 1.6, hex('#ffb066', 1.2));
    const v = Math.pow(10, now);
    return v > 1e9 ? `${Math.round(v / 1e9)} bn` : v > 1e6 ? `${Math.round(v / 1e6)} m` : `${Math.round(v / 1e3)},000`;
  } });

  // ---- literacy: scrambled, then decoded, left to right
  minis.push({ title: 'LITERACY', foot: '1820–2024 · SHARE WHO CAN READ', tint: hex('#ffb341', 1.4), draw: (c) => {
    const s = W('literacy'), X = sx(1820, 2024), Y = sy(0, 100);
    const yr = lerp(1820, 2024, clamp(c.age / 1.1));
    base(c);
    const p = path(s, X as any, Y as any, yr);
    for (let i = 0; i < p.length; i += 3) {
      const settle = clamp((c.age - 0.3 - ((p[i] - CX0) / (CX1 - CX0)) * 1.0) / 0.35);
      p[i + 1] += (1 - settle) * (hash2(i, Math.floor(c.t * 18)) - 0.5) * 60;
    }
    line(c, p, 1.4, hex('#ffb341', 1.15));
    const real = Math.round(at(s, yr) ?? 12);
    return c.age < 1.6 ? `${Math.floor(hash2(7, Math.floor(c.t * 20)) * 90 + 10)}%` : `${real}%`;
  } });

  // ---- life expectancy: a monitor's trace, a step on every beat, each with its blip
  minis.push({ title: 'LIFE EXPECTANCY', foot: '1770–2023 · YEARS AT BIRTH', tint: L('monitor', 1.4), draw: (c) => {
    const s = W('life'), X = sx(1770, 2023), Y = sy(20, 80);
    const steps = Math.floor(Math.max(0, c.beat) * 4);
    const yr = Math.min(2023, 1770 + steps * 21);
    base(c);
    const p = path(s, X as any, Y as any, yr);
    line(c, p, 1.6, L('monitor', 1.0), 2);
    if (p.length >= 3) {
      const n = p.length, hx = p[n - 3], hy = p[n - 2];
      const ph = fract(c.beat * 4), k = Math.exp(-ph * 5);
      const blip = [hx, hy, 0, hx + 3, hy, 0, hx + 5, hy - 14 * k, 0, hx + 7, hy + 7 * k, 0, hx + 9, hy, 0, hx + 13, hy - 4 * k, 0, hx + 16, hy, 0];
      line(c, blip, 1.4, L('monitor', 1.6), 2);
    }
    return `${Math.round(at(s, yr) ?? 29)} yrs`;
  } });

  return minis;
}

/** a panel: its ground, frame, title, value and footing, then the mini in it */
export function panel(c: MiniCtx, m: Mini) {
  const { d, fonts } = c;
  d.fill([[0, 0, PW, 0, PW, PH, 0, PH]], [0.004, 0.006, 0.014, 0.96 * Math.min(1, c.a * 1.2)], c.M, 'alpha');
  d.setModel(c.M);
  d.lineStyle({});
  const fr = fade(NIGHT.hair, c.a);
  d.seg([6, 6, 0], [PW - 6, 6, 0], 0.8 * c.thin, fr);
  d.seg([6, PH - 6, 0], [PW - 6, PH - 6, 0], 0.8 * c.thin, fr);
  d.seg([6, 6, 0], [6, PH - 6, 0], 0.8 * c.thin, fr);
  d.seg([PW - 6, 6, 0], [PW - 6, PH - 6, 0], 0.8 * c.thin, fr);
  d.flush();
  const v = m.draw(c);
  d.setModel(null);
  // the title; a subscript two drawn as a small figure, since the font's own reads as a comma
  let tx = CX0;
  m.title.split('₂').forEach((part, i) => {
    if (i) tx += label(d, fonts, '2', tx, 34, 10, fade(NIGHT.note, c.a), { base: c.M, font: 'passMono', axes: { wght: 700 } }) + 1;
    tx += label(d, fonts, part, tx, 30, 15, fade(NIGHT.note, c.a), { base: c.M, font: 'passMono', axes: { wght: 600 } });
  });
  label(d, fonts, v, CX1, 54, 22, fade(m.tint, c.a), { base: c.M, align: 'right', font: 'pass', axes: { wght: 750 } });
  label(d, fonts, m.foot, CX0, PH - 16, 11, fade(NIGHT.noteDim, c.a), { base: c.M, font: 'passMono' });
}
