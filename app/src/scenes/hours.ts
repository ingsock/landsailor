// CHORUS 1, "Blossom of hours unleashed / Make me a lawbender / All equalized / Safe from the
// chill and heat".
// A day as a dial of 24 petals: the night's petals bloom open, lit (bloom motion: radial, elastic).
// The dial unrolls into a year: Chicago's real daily mean temperature in 2023, a wild line that the
// word LAWBENDER rides; then it is pressed flat to the 21 degrees of a heated room (damping: a
// spring settling, overshoot and all), and the chill and the heat are pushed apart.
import { Camera } from '../engine/camera';
import { Scene, ShotFrame } from '../engine/engine';
import { RGBA, TAU, clamp, ease, hex, lerp, mixc, prog, spring, withA, glide } from '../engine/math';
import { Score } from '../engine/score';
import { drawLine, drawOnPath, label, layLine } from '../lib/lyric';
import { L, NIGHT } from '../lib/palette';
import { motes, plumes } from '../lib/backdrop';

const CX = 960, CY = 560;

export class Hours extends Scene {
  score!: Score;
  temp: number[] = [];
  async init() {
    this.score = this.ctx.data.get('score');
    const w = await (await fetch('/data/weather_chicago.json')).json();
    this.temp = w.mean;
  }

  draw(f: ShotFrame) {
    const part = f.shot.params!.part as string;
    if (part === 'dial') return this.dial(f);
    return this.year(f, part);
  }

  // ---------------------------------------------------------------- the day, blooming
  dial(f: ShotFrame) {
    const { d, fonts } = this.ctx;
    const t = f.t;
    this.ctx.clear(hex('#020308'));
    motes(this.ctx.d, t, { seed: 8, n: 90, color: L('sodium', 0.9), rise: 24 });
    const line = this.score.line('Blossom of hours');
    const cam = Camera.home();
    const k = glide(f.p);
    cam.pos = [CX, CY, lerp(-1350, -1150, k)];
    cam.target = [CX, CY, 0];
    cam.roll = lerp(-0.08, 0.06, k);
    cam.pos = [CX, CY, lerp(-1750, -1500, k)];
    d.setCamera(cam);
    const R = 300;
    // hour h at angle: 0h at the top, clockwise
    const ang = (h: number) => -Math.PI / 2 + (h / 24) * TAU;
    // which petals open on which word: the evening on "Blossom", the night on "hours", toward dawn on "unleashed"
    const opens = (h: number) => {
      const night = (h - 18 + 24) % 24; // 0 at 18h .. 11 at 5h
      if (night >= 12) return -1;
      const w = night < 4 ? line.words[0] : night < 8 ? line.words[2] : line.words[3];
      const i = night % 4;
      return w.start + i * 0.09;
    };
    // the dial's rim and hours
    d.lineStyle({});
    const rim: number[] = [];
    for (let i = 0; i <= 96; i++) rim.push(CX + Math.cos((i / 96) * TAU) * (R + 30), CY + Math.sin((i / 96) * TAU) * (R + 30), 0);
    d.poly(rim, 1.2, withA(NIGHT.hair, 1));
    for (let h = 0; h < 24; h++) {
      const a = ang(h);
      d.seg([CX + Math.cos(a) * (R + 22), CY + Math.sin(a) * (R + 22), 0], [CX + Math.cos(a) * (R + 38), CY + Math.sin(a) * (R + 38), 0], h % 6 ? 1 : 2, withA(NIGHT.note, 0.8));
    }
    d.flush();
    for (const h of [0, 6, 12, 18]) {
      const a = ang(h);
      label(d, fonts, String(h).padStart(2, '0') + ':00', CX + Math.cos(a) * (R + 78), CY + Math.sin(a) * (R + 78) + 7, 20, NIGHT.note, { align: 'center' });
    }
    // petals
    for (let h = 0; h < 24; h++) {
      const a0 = ang(h) + 0.02, a1 = ang(h + 1) - 0.02, am = (a0 + a1) / 2;
      const t0 = opens(h);
      const day = t0 < 0;
      const open = day ? 1 : spring(t - t0, 2.6, 0.32);
      const r = R * (day ? 0.92 : 0.18 + 0.82 * Math.max(0, open));
      const pts: number[] = [CX, CY];
      const n = 10;
      for (let i = 0; i <= n; i++) {
        const aa = lerp(a0, a1, i / n);
        // a petal's tip: fuller in the middle of its arc
        const rr = r * (0.82 + 0.18 * Math.sin((i / n) * Math.PI));
        pts.push(CX + Math.cos(aa) * rr, CY + Math.sin(aa) * rr);
      }
      let c: RGBA;
      if (day) c = withA(hex('#1b2233'), 1);
      else if (t < t0) c = withA(hex('#0c111c'), 1);
      else c = mixc(L('sodiumLow', 0.4), L('sodium', 1.1), clamp((t - t0) / 0.4));
      d.fill([pts], { c0: withA(c, 0.25), c1: c, from: [CX, CY], to: [CX + Math.cos(am) * r, CY + Math.sin(am) * r], radial: false }, null, 'add');
    }
    // the line around the rim, from the evening onward
    const sl = layLine(fonts, line, null, { size: 46, axes: { wdth: 110, wght: 700 }, upper: true, tracking: 0.04 });
    const Rt = R + 122; // clear of the hour labels
    const startA = ang(17.4);
    drawOnPath(d, sl, (s) => {
      const a = startA + s / Rt;
      return [CX + Math.cos(a) * Rt, CY + Math.sin(a) * Rt, a + Math.PI / 2];
    }, 0, t, { light: 'sodium', glass: 0.9 });
    label(d, fonts, 'A day in hours. The lit petals are the hours after dark.', 120, 1000, 18, NIGHT.noteDim);
    return { bloom: 0.3, threshold: 0.95 };
  }

  // ---------------------------------------------------------------- the year, bent and equalized
  year(f: ShotFrame, part: string) {
    const { d, fonts } = this.ctx;
    const t = f.t;
    const sc = this.score;
    this.ctx.clear(hex('#020308'));
    plumes(this.ctx.d, t, { seed: part === 'safe' ? 9 : 21, heat: 1 });
    const lb = sc.line('lawbender'), eq = sc.line('All equalized'), sf = sc.line('Safe from');
    const X0 = 170, X1 = 1750, T0 = -20, T1 = 32;
    const Y0 = 900, Y1 = 220;
    const X = (day: number) => X0 + (day / 364) * (X1 - X0);
    const Y = (c: number) => Y0 + ((c - T0) / (T1 - T0)) * (Y1 - Y0);
    const ROOM = 21;
    // unroll: the day dial (a circle) becomes the year's line over the first moments
    const un = ease.inOutCubic(prog(t, lb.start - 0.25, lb.start + 0.55));
    // damping: from "All" the deviation from 21 C rings down like a spring
    const damp = t < eq.start ? 1 : 1 - spring(t - eq.start, 1.25, 0.28);
    const cam = Camera.home();
    const k = glide(f.p);
    cam.pos = [960 + lerp(-60, 60, k), 540, -1600 + (part === 'safe' ? -120 * k : 80 * k)];
    cam.target = [960, 540, 0];
    cam.roll = part === 'safe' ? 0 : 0.02 * Math.sin(t * 2.2);
    d.setCamera(cam);
    // grid: 0, 10, 20, 30 C and the months
    d.lineStyle({ dash: [6, 0.5] });
    for (const c of [-10, 0, 10, 20, 30]) d.seg([X0, Y(c), 0], [X1, Y(c), 0], 1, withA(NIGHT.hair, 0.9 * un));
    d.flush();
    d.lineStyle({});
    for (const c of [-10, 0, 10, 20, 30]) label(d, fonts, `${c} °C`, X0 - 14, Y(c) + 6, 17, withA(NIGHT.note, un), { align: 'right' });
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    months.forEach((m, i) => label(d, fonts, m, X(i * 30.4 + 15), Y0 + 40, 16, withA(NIGHT.note, un), { align: 'center' }));
    // the line: day by day; colour by temperature (cold blue-white, warm amber), toward neutral as it equalizes
    const pts: number[] = [];
    const cols: RGBA[] = [];
    const R = 330;
    for (let i = 0; i < 365; i++) {
      const v = ROOM + (this.temp[i] - ROOM) * damp;
      const lx = X(i), ly = Y(v);
      // where the same day sat on the dial
      const a = -Math.PI / 2 + (i / 365) * TAU;
      const rr = R * (0.6 + 0.4 * (this.temp[i] - T0) / (T1 - T0));
      const dx = CX + Math.cos(a) * rr, dy = CY + Math.sin(a) * rr;
      pts.push(lerp(dx, lx, un), lerp(dy, ly, un), 0);
      const warm = clamp((this.temp[i] - ROOM) / 12), cold = clamp((ROOM - this.temp[i]) / 25);
      const c0 = warm > 0 ? mixc(L('halide', 1.1), L('sodium', 1.5), warm) : mixc(L('halide', 1.1), L('taxi', 1.4), cold);
      cols.push(mixc(L('halide', 1.2), c0, damp));
    }
    d.lineStyle({ glow: 2 });
    d.poly(pts, 2.6, (i) => cols[i]);
    d.flush();
    d.lineStyle({});
    // the room's line, 21 C, faint until the year meets it
    d.lineStyle({ dash: [14, 0.6] });
    d.seg([X0, Y(ROOM), 0], [X1, Y(ROOM), 0], 1.4, withA(L('halide', 0.8), 0.35 + 0.4 * (1 - damp)));
    d.flush();
    d.lineStyle({});
    label(d, fonts, '21 °C INDOORS', X1 + 12, Y(ROOM) + 6, 16, withA(NIGHT.note, un), {});
    // title
    label(d, fonts, 'Chicago, daily mean temperature, 2023', X0, 120, 30, withA(hex('#d7deee'), un), { font: 'pass', axes: { wght: 650 } });
    label(d, fonts, 'Data: ERA5 reanalysis via Open-Meteo', X0, 154, 16, withA(NIGHT.noteDim, un), {});

    // LAWBENDER rides the year
    if (part === 'wave') {
      const sl = layLine(fonts, lb, null, { size: 74, axes: { wdth: 118, wght: 850 }, upper: true, tracking: 0.03 });
      // the letters ride the season, not the day: a course smoothed over five weeks either side
      const smooth: number[] = [];
      for (let i = 0; i < 365; i++) {
        let a = 0, wsum = 0;
        for (let k2 = -36; k2 <= 36; k2++) {
          const j = clamp(i + k2, 0, 364), wg = Math.exp(-(k2 * k2) / (2 * 18 * 18));
          a += pts[j * 3 + 1] * wg; wsum += wg;
        }
        smooth.push(a / wsum);
      }
      const pathAt = (s: number): [number, number, number] => {
        const u = clamp(((s - X0) / (X1 - X0)) * 364, 0, 363.99);
        const i = Math.floor(u), fr = u - i;
        const y = lerp(smooth[i], smooth[Math.min(364, i + 1)], fr);
        const j0 = clamp(i - 8, 0, 364), j1 = clamp(i + 8, 0, 364);
        const ang = Math.atan2(smooth[j1] - smooth[j0], X(j1) - X(j0));
        // ride above the wildest days nearby
        let peak = Infinity;
        for (let k2 = -12; k2 <= 12; k2++) peak = Math.min(peak, pts[clamp(i + k2, 0, 364) * 3 + 1]);
        return [s, Math.min(y - 40, peak - 18), ang];
      };
      // LAWBENDER rides the wild year, and goes out as the year is pressed flat; MAKE ME A with it
      const lwA = 1 - prog(t, eq.start - 0.35, eq.start + 0.25);
      const head = { ...sl, words: sl.words.slice(0, 3) };
      drawLine(d, head, X0 + 40, 1010, t, { light: 'led', glass: 0.8, alpha: lwA });
      const lw = { ...sl, words: [{ ...sl.words[3], x: 0 }] };
      drawOnPath(d, lw, pathAt, X(110), t, { light: 'sodium', intensity: 1.1, glass: 0.9, alpha: lwA });
      // ALL EQUALIZED: letters scattered along the line settle onto the room's line
      const eqSet = layLine(fonts, eq, null, { size: 66, axes: { wdth: 112, wght: 820 }, upper: true, tracking: 0.04, space: 0.6 });
      const ex = 960 - eqSet.width / 2;
      drawLine(d, eqSet, ex, Y(ROOM) - 30, t, {
        light: 'led', glass: prog(t, eq.start - 0.5, eq.start),
        // each letter starts where the season had it and settles onto the room's line with the year
        jiggle: (wi, _gi, g) => {
          const x = ex + eqSet.words[wi].x + g.x;
          const day = clamp(Math.round(((x - X0) / (X1 - X0)) * 364), 0, 364);
          let a = 0;
          for (let k2 = -20; k2 <= 20; k2++) a += this.temp[clamp(day + k2, 0, 364)];
          const dev = (a / 41 - ROOM) * damp;
          return [0, Y(ROOM + dev) - Y(ROOM), 0, 1, 1];
        },
      });
    } else {
      // SAFE FROM THE CHILL AND HEAT: outside, the real year still swings; the room holds its line
      // between them, and the warm days are pushed up and away, the cold days down and away
      const apart = ease.outCubic(prog(t, sf.words[3].start - 0.2, sf.words[5].end));
      const up: number[] = [], dn: number[] = [];
      for (let i = 0; i < 365; i++) {
        let a = 0;
        for (let k2 = -4; k2 <= 4; k2++) a += this.temp[clamp(i + k2, 0, 364)];
        const v = a / 9;
        const dev = (v - ROOM) * (1 + 0.6 * apart);
        if (dev > 0) { up.push(X(i), Y(ROOM + dev) - 40 * apart); dn.push(X(i), Y(ROOM)); }
        else { up.push(X(i), Y(ROOM)); dn.push(X(i), Y(ROOM + dev) + 40 * apart); }
      }
      const band = (pts: number[], c0: RGBA) => {
        const poly: number[] = [...pts];
        for (let i = 364; i >= 0; i--) poly.push(X(i), Y(ROOM));
        d.fill([poly], { c0: withA(c0, 0.5), c1: withA(c0, 0.05), from: [0, 0], to: [0, Y(ROOM)] }, null, 'add');
      };
      band(up, L('sodium', 0.6));
      const poly2: number[] = [...dn];
      for (let i = 364; i >= 0; i--) poly2.push(X(i), Y(ROOM));
      d.fill([poly2], { c0: withA(L('taxi', 0.6), 0.05), c1: withA(L('taxi', 0.6), 0.5), from: [0, Y(ROOM)], to: [0, 1000] }, null, 'add');
      const sl = layLine(fonts, sf, null, { size: 70, axes: { wdth: 112, wght: 800 }, upper: true });
      const safe = { ...sl, words: sl.words.slice(0, 3) };
      drawLine(d, safe, X0 + 40, Y(ROOM) - 26, t, { light: 'led', glass: 0.8 });
      const chill = { ...sl, words: [{ ...sl.words[3], x: 0 }] };
      const and = { ...sl, words: [{ ...sl.words[4], x: 0 }] };
      const heat = { ...sl, words: [{ ...sl.words[5], x: 0 }] };
      drawLine(d, chill, 1180, Y(ROOM) + 120 + 160 * apart, t, { light: 'led', intensity: 1, glass: 0.8, tint: (_w, _g, c) => (c[0] > 0.2 ? mixc(c, L('taxi', 1.5), 0.6) : c) });
      drawLine(d, and, 1180, Y(ROOM) - 26, t, { light: 'led', glass: 0.8 });
      drawLine(d, heat, 1180, Y(ROOM) - 110 - 70 * apart, t, { light: 'sodium', intensity: 1.2, glass: 0.8 });
    }
    return { bloom: 0.3, threshold: 0.95 };
  }
}
