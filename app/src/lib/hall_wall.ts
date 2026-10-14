// The wall, drawn as an architect's plan section through an exterior wall (scale 1:5): gypsum board,
// the service cavity between the studs, sheathing, mineral wool, the air cavity with its ties, the
// brick, each hatched the way it is drawn. The service cavity is the chart: share of the population
// using the internet, 1990-2025 (ITU via World Bank, Our World in Data). Every country is a hairline
// in it; the world, from 2005 when its series begins, is a single-mode fibre in a conduit, and the
// conduit's walls, the fibre's jacket, buffer, cladding and core are all drawn, so that close up the
// light can be seen running in it in packets of bits (packet motion: discrete, fast, never touching).
// The studs stand every five years. Units are sheet pixels; y is down; the interior is at the top.
import { Draw } from '../engine/draw';
import { Fonts } from '../engine/text';
import { clamp, fract, mulberry32 } from '../engine/math';
import { at, path } from './chart';
import { label } from './lyric';
import { L } from './palette';
import { GROUND, INK, callout, hatch, loops, outline, rectC, stipple } from './hall_draft';

export const Y0 = 1990, Y1 = 2025;
export const XA = 0, XW = 1500;
/** the layers, top (interior) to bottom (exterior) */
export const LAY = { gyp0: 434, gyp1: 456, cav1: 890, sh1: 900, ins1: 946, air1: 974, br1: 1046 };
const YB = 860, YH = 4.0;
export const X = (y: number) => XA + ((y - Y0) / (Y1 - Y0)) * XW;
export const Y = (p: number) => YB - p * YH;
const WX0 = -760, WX1 = 2360;          // the wall's extent on the sheet

type Series = [number[], number[]];
const HIGHLIGHT = ['South Korea', 'United States', 'China', 'Brazil', 'India', 'Nigeria'];

/** offset a polyline (flat xy) by d along its left normal, mitred */
function offset(p: number[], dd: number): number[] {
  const n = p.length / 2, out: number[] = [];
  for (let i = 0; i < n; i++) {
    const ax = p[Math.max(0, i - 1) * 2], ay = p[Math.max(0, i - 1) * 2 + 1];
    const bx = p[Math.min(n - 1, i + 1) * 2], by = p[Math.min(n - 1, i + 1) * 2 + 1];
    let tx = bx - ax, ty = by - ay;
    const l = Math.hypot(tx, ty) || 1;
    tx /= l; ty /= l;
    out.push(p[i * 2] - ty * dd, p[i * 2 + 1] + tx * dd);
  }
  return out;
}
const xyz = (p: number[], z = 0) => { const o: number[] = []; for (let i = 0; i < p.length; i += 2) o.push(p[i], p[i + 1], z); return o; };

/** a point and unit direction at arc length s along a polyline (flat xy, with its cumulative lengths) */
function along(p: number[], cum: number[], s: number): [number, number, number, number] {
  const n = cum.length;
  s = Math.max(0, Math.min(cum[n - 1], s));
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
  const L = cum[hi] - cum[lo] || 1, u = (s - cum[lo]) / L;
  const dx = (p[hi * 2] - p[lo * 2]) / L, dy = (p[hi * 2 + 1] - p[lo * 2 + 1]) / L;
  return [p[lo * 2] + (p[hi * 2] - p[lo * 2]) * u, p[lo * 2 + 1] + (p[hi * 2 + 1] - p[lo * 2 + 1]) * u, dx, dy];
}

export class WallSection {
  world: Series;
  countries: { name: string; s: Series; hi: boolean }[] = [];
  constructor(series: Record<string, Series>) {
    this.world = series.World;
    for (const [name, s] of Object.entries(series)) {
      if (name === 'World' || name.includes('(WB)') || s[0].length < 8) continue;
      this.countries.push({ name, s, hi: HIGHLIGHT.includes(name) });
    }
  }

  /** the world's fibre as a flat xy path up to year yr (it begins in 2005) */
  fibre(yr: number): number[] {
    const p = path(this.world, X as any, Y as any, yr);
    const o: number[] = [];
    for (let i = 0; i < p.length; i += 3) o.push(p[i], p[i + 1]);
    return o;
  }
  /** where the fibre is at year y */
  point(y: number): [number, number] { return [X(y), Y(at(this.world, Math.max(2005, Math.min(2025, y))) ?? 0)]; }

  /** the wall and its layers (static), then the chart drawn up to year yr; m is the camera's
   *  magnification, for the detail that only shows close up */
  draw(d: Draw, fonts: Fonts, t: number, yr: number, m: number, notes: number, bubble = 0, inset = 0) {
    d.setModel(null);
    d.lineStyle({});
    const cutC = INK(1), mid = INK(0.55), thin = INK(0.25);
    // ---- the layers
    // gypsum board: stippled
    stipple(d, WX0, LAY.gyp0, WX1, LAY.gyp1, 0.012, 0.9, INK(0.4), 3);
    d.lineStyle({});
    // the vapour control layer: dashed, on the cavity's warm side
    d.lineStyle({ dash: [14, 0.6] });
    d.seg([WX0, LAY.gyp1 + 3, 0], [WX1, LAY.gyp1 + 3, 0], 1, INK(0.4));
    d.lineStyle({});
    // sheathing: a tight hatch
    hatch(d, rectC(WX0, LAY.cav1, WX1, LAY.sh1), 4, Math.PI / 4, 0.6, INK(0.3));
    // mineral wool: loops
    loops(d, WX0, WX1, LAY.sh1 + 3, LAY.ins1 - 3, 0.8, INK(0.36));
    // the air cavity, its ties across it every 600
    for (let x = WX0 + 60; x < WX1; x += 240) {
      const pts: number[] = [];
      for (let k = 0; k <= 6; k++) pts.push(x + (k % 2 ? 7 : -7), LAY.ins1 + 2 + (k / 6) * (LAY.air1 + 14 - LAY.ins1), 0);
      d.poly(pts, 0.9, INK(0.45));
    }
    // brick: hatched at 45, the joints of the stretchers
    hatch(d, rectC(WX0, LAY.air1, WX1, LAY.br1), 9, -Math.PI / 4, 0.7, INK(0.28));
    for (let x = WX0 + 20; x < WX1; x += 118) {
      d.seg([x, LAY.air1, 0], [x, LAY.br1, 0], 0.9, mid);
      d.seg([x + 5, LAY.air1, 0], [x + 5, LAY.br1, 0], 0.9, mid);
    }
    // the layers' lines; the wall's two faces heavy
    for (const y of [LAY.gyp1, LAY.cav1, LAY.sh1, LAY.ins1, LAY.air1]) d.seg([WX0, y, 0], [WX1, y, 0], y === LAY.cav1 || y === LAY.gyp1 ? 1.3 : 1, mid);
    d.seg([WX0, LAY.gyp0, 0], [WX1, LAY.gyp0, 0], 2.4, cutC);
    d.seg([WX0, LAY.br1, 0], [WX1, LAY.br1, 0], 2.4, cutC);
    // the studs: every five years, timber in section
    for (let y = Y0; y <= Y1; y += 5) {
      const x = X(y);
      d.seg([x - 8, LAY.gyp1, 0], [x - 8, LAY.cav1, 0], 1.1, mid);
      d.seg([x + 8, LAY.gyp1, 0], [x + 8, LAY.cav1, 0], 1.1, mid);
      for (let yy = LAY.gyp1; yy < LAY.cav1 - 4; yy += 42) d.seg([x - 8, yy, 0], [x + 8, Math.min(LAY.cav1, yy + 42), 0], 0.6, thin);
    }
    // the studs beyond the chart (the wall goes on), and the chart's gridlines, dashed like battens
    for (let x = X(Y0) - 214; x > WX0; x -= 214) {
      d.seg([x - 8, LAY.gyp1, 0], [x - 8, LAY.cav1, 0], 1.1, mid);
      d.seg([x + 8, LAY.gyp1, 0], [x + 8, LAY.cav1, 0], 1.1, mid);
    }
    for (let x = X(Y1) + 214; x < WX1; x += 214) {
      d.seg([x - 8, LAY.gyp1, 0], [x - 8, LAY.cav1, 0], 1.1, mid);
      d.seg([x + 8, LAY.gyp1, 0], [x + 8, LAY.cav1, 0], 1.1, mid);
    }
    d.flush();
    d.lineStyle({ dash: [22, 0.55] });
    for (const p of [25, 50, 75, 100]) d.seg([X(Y0), Y(p), 0], [X(Y1), Y(p), 0], 0.8, INK(0.16));
    d.flush();
    d.lineStyle({});
    for (const p of [0, 25, 50, 75, 100]) label(d, fonts, `${p}%`, X(Y0) - 16, Y(p) + 5, 14, INK(0.6), { align: 'right' });
    // ---- the chart: every country a hairline, the six named a little brighter; laid out first in
    // pencil (the whole of it, faint), then inked as the years are drawn
    const yrC = Math.min(yr, Y1);
    d.lineStyle({});
    for (const c of this.countries) d.poly(path(c.s, X as any, Y as any, Y1), 0.6, INK(0.028));
    d.flush();
    for (const c of this.countries) if (!c.hi) {
      const p = path(c.s, X as any, Y as any, yrC);
      d.poly(p, 0.7, INK(0.075));
    }
    d.flush();
    const tags: { name: string; x: number; y: number }[] = [];
    for (const c of this.countries) if (c.hi) {
      const p = path(c.s, X as any, Y as any, yrC);
      d.poly(p, 1.1, INK(0.3));
      const last = c.s[0][c.s[0].length - 1];
      if (yrC >= last - 0.01) tags.push({ name: c.name, x: X(last) + 12, y: Y(at(c.s, last)!) + 5 });
    }
    d.flush();
    // the names at the lines' ends, kept apart
    tags.sort((a, b) => a.y - b.y);
    const ts = 14 / Math.sqrt(m);
    for (let i = 1; i < tags.length; i++) tags[i].y = Math.max(tags[i].y, tags[i - 1].y + ts * 1.25);
    for (const g of tags) label(d, fonts, g.name, g.x, g.y, ts, INK(0.55), { font: 'passMono' });
    // the drawing's front: a T-square riding across as the years are drawn
    if (yr < Y1 - 0.05 && yr > Y0) {
      const x = X(yr);
      d.lineStyle({});
      d.seg([x, LAY.gyp1, 0], [x, LAY.br1 + 30, 0], 1, INK(0.5));
      d.seg([x - 5, LAY.gyp1, 0], [x + 5, LAY.gyp1, 0], 2, INK(0.7));
      d.flush();
    }
    // ---- the world: the conduit, and the fibre in it
    const f = this.fibre(yr);
    if (f.length >= 4) {
      // the conduit masks what it passes over (studs, hairlines), then its walls
      d.lineStyle({ blend: 'alpha', world: true });
      d.poly(xyz(f), 22, GROUND);
      d.flush();
      d.lineStyle({});
      for (const o of [11, -11]) d.poly(xyz(offset(f, o)), 1.4, INK(0.85));
      for (const o of [9, -9]) d.poly(xyz(offset(f, o)), 0.7, INK(0.35));
      // couplings along it, every so often
      const cum = [0];
      for (let i = 2; i < f.length; i += 2) cum.push(cum[cum.length - 1] + Math.hypot(f[i] - f[i - 2], f[i + 1] - f[i - 1]));
      const len = cum[cum.length - 1];
      for (let s = 60; s < len - 10; s += 130) {
        const [px, py, dx, dy] = along(f, cum, s);
        for (const k of [-6, 6]) d.seg([px + dx * k - dy * 13, py + dy * k + dx * 13, 0], [px + dx * k + dy * 13, py + dy * k - dx * 13, 0], 0.9, INK(0.6));
      }
      // the fibre: jacket, aramid, buffer, cladding (these only part when seen close)
      d.poly(xyz(offset(f, 5.4)), 0.9, INK(0.45));
      d.poly(xyz(offset(f, -5.4)), 0.9, INK(0.45));
      if (m > 1.6) {
        const a = clamp((m - 1.6) / 0.8);
        d.poly(xyz(offset(f, 3.3)), 0.7, INK(0.32 * a));
        d.poly(xyz(offset(f, -3.3)), 0.7, INK(0.32 * a));
        d.poly(xyz(offset(f, 2.0)), 0.8, INK(0.6 * a));
        d.poly(xyz(offset(f, -2.0)), 0.8, INK(0.6 * a));
        // aramid yarn: a loose wave each side between jacket and buffer
        for (const sg of [1, -1]) {
          const wav: number[] = [];
          for (let s = 0; s < len; s += 2.5) {
            const [px, py, dx, dy] = along(f, cum, s);
            const o = sg * (4.35 + 0.55 * Math.sin(s * 1.1 + sg));
            wav.push(px - dy * o, py + dx * o, 0);
          }
          d.poly(wav, 0.5, INK(0.22 * a));
        }
      }
      d.flush();
      // the core, lit
      d.lineStyle({ glow: 2.5 });
      d.poly(xyz(f), 1.6, L('halide', 0.9));
      d.flush();
      // packets: trains of eight bits running along the core, all at the speed of light (here, of
      // the drawing); close up, each bit is a pulse bouncing between the cladding's walls
      d.lineStyle({ blend: 'add' });
      const v = 240, gap = 92, bit = 3.4;
      const rp = mulberry32(9);
      const n = Math.ceil(len / gap) + 2;
      for (let i = 0; i < n; i++) {
        const head = fract(i / n + (t * v) / (n * gap)) * n * gap;
        if (head > len) continue;
        const code = Math.floor(rp() * 255) | 0x81;
        for (let b = 0; b < 8; b++) {
          if (!((code >> b) & 1)) continue;
          const s1 = head - b * bit * 1.8, s0 = s1 - bit;
          if (s0 < 0) continue;
          const [ax, ay, dx, dy] = along(f, cum, s0), [bx, by] = along(f, cum, s1);
          if (m > 1.6) {
            // the bounce: total internal reflection, a zigzag inside the cladding
            const zig = (s: number) => 1.6 * (fract(s / 9) < 0.5 ? fract(s / 9) * 4 - 1 : 3 - fract(s / 9) * 4);
            const za = zig(s0), zb = zig(s1);
            d.seg([ax - dy * za, ay + dx * za, 0], [bx - dy * zb, by + dx * zb, 0], 2.4, L('halide', 3.4));
          } else d.seg([ax, ay, 0], [bx, by, 0], 2.4, L('halide', 2.8));
        }
      }
      d.flush();
      d.lineStyle({});
      // where the world's series begins, and its head
      const [sx, sy] = [f[0], f[1]];
      outline(d, [sx - 13, sy - 14, sx - 7, sy - 14, sx - 7, sy + 14, sx - 13, sy + 14], 1.2, INK(0.85));
      label(d, fonts, 'WORLD FROM 2005', sx - 18, sy + 18 + 16 / m, 13 / Math.sqrt(m), INK(0.6), { align: 'left', font: 'passMono' });
      const hx = f[f.length - 2], hy = f[f.length - 1];
      d.dotStyle({ world: true, blend: 'add' });
      d.dot([hx, hy, 0], 7, L('halide', 1.4), 1);
      d.dot([hx, hy, 0], 2.2, L('halide', 3), 0.3);
      d.flush();
      const wv = at(this.world, Math.min(yr, Y1));
      if (wv !== null) {
        const ls = 28 / m;
        label(d, fonts, `WORLD ${wv.toFixed(0)}%`, hx + 16, hy - ls * 0.9, ls, INK(1), { font: 'passMono', axes: { wght: 700 } });
        label(d, fonts, String(Math.floor(Math.min(yr, Y1))), hx + 16, hy - ls * 2.1, ls * 0.75, INK(0.6), { font: 'passMono' });
      }
    }
    // ---- the notes
    // the years, as the dimension string along the outside of the wall
    const dy = 1092;
    d.lineStyle({});
    d.seg([X(Y0) - 30, dy, 0], [X(Y1) + 30, dy, 0], 0.9, INK(0.55));
    for (let y = Y0; y <= Y1; y += 5) {
      const x = X(y);
      d.seg([x, LAY.br1 + 10, 0], [x, dy + 10, 0], 0.7, INK(0.4));
      d.seg([x - 6, dy + 6, 0], [x + 6, dy - 6, 0], 1.6, INK(0.7));
      label(d, fonts, String(y), x, dy - 10, 14, INK(0.75), { align: 'center' });
    }
    d.flush();
    // the layers, named on leaders off the wall's left end
    const notesL: [number, string, string][] = [
      [(LAY.gyp0 + LAY.gyp1) / 2, 'GYPSUM BOARD 13', ''], [(LAY.gyp1 + LAY.cav1) / 2, 'SERVICE CAVITY', 'STUDS AT 5 YEARS'],
      [(LAY.cav1 + LAY.sh1) / 2, 'SHEATHING 12', ''], [(LAY.sh1 + LAY.ins1) / 2, 'MINERAL WOOL 75', ''],
      [(LAY.ins1 + LAY.air1) / 2, 'CAVITY 50, TIES AT 600', ''], [(LAY.air1 + LAY.br1) / 2, 'BRICK 90', ''],
    ];
    notesL.forEach(([y, txt, sub], i) => {
      const ty = 520 + i * 62;
      callout(d, fonts, null, -100 - i * 22, y, -160, ty, String(i + 1), txt, { size: 15, right: false, reveal: clamp(notes * 1.6 - i * 0.12), sub: sub || undefined, mask: true });
    });
    // the conduit, named
    if (f.length >= 4 && yr > 2008) {
      const [px, py] = this.point(2007);
      callout(d, fonts, null, px, py + 11, px + 90, py + 120, '7', 'CONDUIT 25, SINGLE-MODE FIBRE', { size: 15, reveal: clamp((yr - 2008) / 2.5), sub: 'THE WORLD, SHARE ONLINE', mask: true });
    }
    // the detail bubble: where the next sheet looks
    if (bubble > 0) {
      const [px, py] = this.point(2009.5);
      const r = 70;
      d.lineStyle({ dash: [16, 0.6, t * 30] });
      const pts: number[] = [];
      for (let i = 0; i <= 72 * bubble; i++) { const a = (i / 72) * Math.PI * 2 - 1.2; pts.push(px + Math.cos(a) * r, py + Math.sin(a) * r, 0); }
      d.poly(pts, 1.3, INK(0.85));
      d.flush();
      d.lineStyle({});
      if (bubble > 0.6) {
        const bx = px + r * 0.72, by = py - r * 0.72;
        d.seg([bx, by, 0], [bx + 40, by - 40, 0], 1, INK(0.7));
        d.flush();
        outline(d, circleXY(bx + 62, by - 62, 22), 1.3, INK(0.9));
        d.seg([bx + 40, by - 62, 0], [bx + 84, by - 62, 0], 1, INK(0.9));
        d.flush();
        label(d, fonts, '1', bx + 62, by - 68, 15, INK(1), { align: 'center', font: 'pass', axes: { wght: 700 } });
        label(d, fonts, 'A-302', bx + 62, by - 46, 11, INK(0.8), { align: 'center', font: 'passMono' });
      }
    }
    // the caption
    label(d, fonts, 'Share of the population using the internet, 1990–2025', X(Y0), 1150, 24, INK(0.95), { font: 'pass', axes: { wght: 650 } });
    label(d, fonts, 'Every country a hairline; the world, from 2005, the fibre. Data: ITU, via World Bank and Our World in Data', X(Y0), 1178, 14, INK(0.55), { font: 'passMono' });
  }

  /** section C-C through the fibre: core, cladding, coating, buffer, aramid, jacket, as rings,
   *  the core lit by whatever is passing */
  crossSection(d: Draw, fonts: Fonts, t: number, a: number) {
    // a detail panel in the sheet's corner (screen space): framed, opaque
    const bx0 = 1488, by0 = 752, bx1 = 1862, by1 = 1036;
    d.setModel(null);
    d.fill([rectC(bx0, by0, bx1, by1)], [0, 0, 0, a], null, 'alpha');
    d.lineStyle({});
    outline(d, rectC(bx0, by0, bx1, by1), 1.3, INK(0.6 * a));
    d.flush();
    const cx = bx0 + 112, cy = by0 + 118, R = 84;
    const rings: [number, string, number][] = [[1, 'JACKET 2.0 mm', 0.9], [0.62, 'BUFFER 900 µm', 0.55], [0.36, 'COATING 250 µm', 0.45], [0.2, 'CLADDING 125 µm', 0.7], [0.055, 'CORE 9 µm', 1]];
    d.setModel(null);
    d.fill([circleXY(cx, cy, R * 1.02)], [0, 0, 0, 0.95 * a], null, 'alpha');
    d.lineStyle({});
    rings.forEach(([r, , w]) => outline(d, circleXY(cx, cy, R * r, 72), r === 1 ? 2 : 1, INK(w * a)));
    // aramid: short strokes between buffer and jacket
    for (let i = 0; i < 36; i++) {
      const ang = (i / 36) * Math.PI * 2;
      const r0 = R * 0.7, r1 = R * 0.92;
      d.seg([cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0, 0], [cx + Math.cos(ang + 0.12) * r1, cy + Math.sin(ang + 0.12) * r1, 0], 0.6, INK(0.3 * a));
    }
    d.flush();
    // the core: light arriving, a packet's bits
    const on = fract(t * 6.5) < 0.55 ? 1 : 0.35;
    d.dotStyle({ world: true, blend: 'add' });
    d.dot([cx, cy, 0], R * 0.06, L('halide', 3 * on * a), 0.2);
    d.dot([cx, cy, 0], R * 0.2, L('halide', 0.5 * on * a), 1);
    d.flush();
    // the rings named, the section named
    rings.forEach(([r, txt], i) => {
      const ang = -0.9 + i * 0.32;
      const ax = cx + Math.cos(ang) * R * r, ay = cy + Math.sin(ang) * R * r;
      const lx = cx + R * 1.45, ly = cy - R * 0.8 + i * 33;
      d.lineStyle({});
      d.seg([ax, ay, 0], [lx - 6, ly - 4, 0], 0.6, INK(0.45 * a));
      d.flush();
      label(d, fonts, txt, lx, ly, 13, INK(0.8 * a), { font: 'passMono' });
    });
    label(d, fonts, 'SECTION C–C', bx0 + 20, by1 - 34, 16, INK(0.95 * a), { font: 'pass', axes: { wght: 700 } });
    label(d, fonts, 'SINGLE-MODE FIBRE · 10:1 · LIGHT IN THE CORE', bx0 + 20, by1 - 14, 11, INK(0.6 * a), { font: 'passMono' });
  }
}

function circleXY(cx: number, cy: number, r: number, n = 48): number[] {
  const p: number[] = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; p.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
  return p;
}
