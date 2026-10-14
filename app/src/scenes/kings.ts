// VERSE 2, "Every commoner made a king".
// Isotype, after Otto Neurath and Gerd Arntz, printed in two inks: a hundred figures, one for each
// hundredth of the world. In 1820 seventy-six of them stand in the dark band of extreme poverty
// along the bottom (cost-of-basic-needs measure). The years run to 2018 while the line is sung, at
// an even pace, and whenever the share falls past a figure it springs up out of the band into the
// rows above (elevation motion: each lifted on its own spring, straight up its column, the last
// ones from deepest down); when the share rises again, as in the world wars, a figure drops back.
// Ten are left. The counts ride with the crowds, one rising, one sinking; a small chart of the same
// share runs under the year. On "king" every figure out of the band is crowned. COMMONER is set in
// the plain mono; *king* in the serif, in the warm ink.
import { Camera } from '../engine/camera';
import { FillMesh } from '../engine/draw';
import { Scene, ShotFrame } from '../engine/engine';
import { chain, clamp, glide, lerp, rotZ, scale, spring, translate } from '../engine/math';
import { Score } from '../engine/score';
import { at } from '../lib/chart';
import { label, layLine } from '../lib/lyric';
import { BLUE, BOTH, Contour, PAPER, PINK, PRINT_POST, circleC, holeC, inkLine, rectC, rrectC } from '../lib/print_ink';

const COLS = 25;
const PX = 70;                 // column pitch
const X0 = 960 - 12 * PX;      // first column's centre
const FH = 72;                 // a figure's height
const RP = 82;                 // row pitch
const footBand = (b: number) => 1044 - b * RP;            // band rows, 0 at the bottom
const BAND_TOP = footBand(3) - FH - 20;                   // the band's top edge
const footUp = (u: number) => BAND_TOP - 20 - u * RP;     // rows above the band, 0 nearest it
/** figure r's column: the band fills from the right, the rows above from the left, so each
 *  figure keeps its column when it rises */
const colOf = (r: number) => COLS - 1 - (r % COLS);

/** a figure in the manner of Gerd Arntz, feet at the origin, height 1, y down */
function figure(cheer: boolean): Contour[] {
  const c: Contour[] = [circleC(0, -0.875, 0.112, 28)];
  if (!cheer) {
    c.push(rrectC(-0.205, -0.742, 0.41, 0.36, [0.11, 0.11, 0.025, 0.025], 6));
    // the arms, parted from the body by two slits
    c.push(holeC(rectC(-0.137, -0.655, 0.02, 0.273)), holeC(rectC(0.117, -0.655, 0.02, 0.273)));
  } else {
    c.push(rrectC(-0.125, -0.742, 0.25, 0.36, [0.07, 0.07, 0.02, 0.02], 5));
    for (const s of [-1, 1]) {
      // an arm raised, from the shoulder up and out
      const ax = s * 0.15, ay = -0.7, a = s * 0.42;
      const ca = Math.cos(a), sa = Math.sin(a);
      const wv = 0.075, len = 0.33;
      const pts = [[-wv / 2, 0], [wv / 2, 0], [wv / 2, -len], [-wv / 2, -len]];
      c.push(pts.flatMap(([x, y]) => [ax + x * ca - y * sa, ay + x * sa + y * ca]));
    }
  }
  c.push(rectC(-0.107, -0.4, 0.094, 0.4), rectC(0.013, -0.4, 0.094, 0.4));
  return c;
}

/** a crown, its band's middle at the origin, about 0.34 wide */
function crown(): Contour[] {
  return [
    [-0.15, 0, 0.15, 0, 0.17, -0.17, 0.085, -0.075, 0, -0.19, -0.085, -0.075, -0.17, -0.17],
    circleC(-0.17, -0.19, 0.03, 10), circleC(0, -0.215, 0.032, 10), circleC(0.17, -0.19, 0.03, 10),
    rectC(-0.15, 0.0, 0.3, 0.05),
  ];
}

type Ev = { t: number; dir: number };

export class Kings extends Scene {
  score!: Score;
  pov!: [number[], number[]];
  stand: FillMesh | null = null;
  cheer: FillMesh | null = null;
  crownM: FillMesh | null = null;
  span: [number, number] = [0, 0];
  ev: Ev[][] = [];
  up0: boolean[] = [];
  /** the most and fewest ever in the band, 1820-2018 */
  nMax = 100;
  nMin = 0;
  /** the rows the two counts sit in, as steps in time */
  upRow: { t: number; v: number }[] = [];
  bandRow: { t: number; v: number }[] = [];

  async init() {
    this.score = this.ctx.data.get('score');
    this.pov = this.ctx.data.get('charts').poverty.series.World;
    const d = this.ctx.d;
    this.stand = d.makeFill(figure(false));
    this.cheer = d.makeFill(figure(true));
    this.crownM = d.makeFill(crown());
    // the years run 1820 -> 2018 at an even pace, from "Every" until just before "king"
    const line = this.score.line('Every commoner');
    this.span = [line.start + 0.05, line.words[4].start - 0.06];
    // figure r is in the band while it is one of the round(share) poorest: find when each one
    // leaves (or comes back), stepping through the series a month at a time
    const N = (y: number) => Math.round(at(this.pov, y) ?? 75.6);
    const tOf = (y: number) => lerp(this.span[0], this.span[1], (y - 1820) / (2018 - 1820));
    this.ev = Array.from({ length: 100 }, () => []);
    this.up0 = Array.from({ length: 100 }, (_, r) => r >= N(1820));
    const upRowOf = (n: number) => Math.min(3, Math.floor((99 - n) / COLS) + 1);  // the row above the risen
    const bandRowOf = (n: number) => Math.min(3, Math.floor((n - 1) / COLS) + 1); // the row above the poor
    let prev = N(1820);
    this.nMax = prev; this.nMin = prev;
    this.upRow = [{ t: -1e9, v: upRowOf(prev) }];
    this.bandRow = [{ t: -1e9, v: bandRowOf(prev) }];
    for (let y = 1820; y <= 2018 + 1e-9; y += 1 / 12) {
      const cur = N(Math.min(y, 2018));
      this.nMax = Math.max(this.nMax, cur); this.nMin = Math.min(this.nMin, cur);
      if (cur < prev) for (let r = cur; r < prev; r++) this.ev[r].push({ t: tOf(y), dir: 1 });
      if (cur > prev) for (let r = prev; r < cur; r++) this.ev[r].push({ t: tOf(y), dir: -1 });
      if (upRowOf(cur) !== this.upRow[this.upRow.length - 1].v) this.upRow.push({ t: tOf(y) + 0.1, v: upRowOf(cur) });
      if (bandRowOf(cur) !== this.bandRow[this.bandRow.length - 1].v) this.bandRow.push({ t: tOf(y) + 0.1, v: bandRowOf(cur) });
      prev = cur;
    }
  }

  /** 0 in the band, 1 out of it, on springs (may overshoot) */
  lift(r: number, t: number): number {
    let v = this.up0[r] ? 1 : 0;
    for (const e of this.ev[r]) v += e.dir * spring(t - e.t, 1.9, 0.52);
    return v;
  }

  /** a stepped value eased by springs from step to step */
  sprung(steps: { t: number; v: number }[], t: number): number {
    let v = steps[0].v;
    for (let i = 1; i < steps.length; i++) v += (steps[i].v - steps[i - 1].v) * spring(t - steps[i].t, 3.2, 0.6);
    return v;
  }

  draw(f: ShotFrame) {
    const { d, fonts } = this.ctx;
    const t = f.t;
    const line = this.score.line('Every commoner');
    const w = line.words;
    this.ctx.clear([0, 0, 0]);
    const yr = lerp(1820, 2018, clamp((t - this.span[0]) / (this.span[1] - this.span[0])));
    const share = at(this.pov, yr) ?? 75.6;
    const inBand = Math.round(share);
    // the camera: a slow pull back that keeps going, drifting down (the next shot comes from below)
    const k = glide(f.p);
    const zoom = lerp(1.045, 0.975, k);
    const cx = 960 + lerp(-12, 10, k), cy = lerp(526, 556, k);
    const cam = Camera.home();
    cam.pos = [cx, cy, -1600 / zoom];
    cam.target = [cx, cy, 0];
    d.setCamera(cam);
    // ------------------------------------------------------------------ the band, and its count
    d.rect(-400, BAND_TOP, 2720, 900, BOTH());
    // ------------------------------------------------------------------ the crowd
    // the places: where each figure stood in the band, and where it will stand above it
    for (let r = 0; r < 100; r++) {
      const b = Math.floor(r / COLS), x = X0 + colOf(r) * PX;
      if (r < this.nMax) d.fillMesh(this.stand, BOTH(0.7), chain(translate(x, footBand(b), 0), scale(FH, FH, 1)));
      if (r >= this.nMin) d.fillMesh(this.stand, PINK(0.16), chain(translate(x, footUp(3 - b), 0), scale(FH, FH, 1)));
    }
    // the count of the poor, sinking with them, on a plate of the band's ink over the places
    const bandY = footBand(0) - this.sprung(this.bandRow, t) * RP;
    d.rect(X0 - 36, bandY - FH - 4, 568, FH + 8, BOTH());
    label(d, fonts, `IN EXTREME POVERTY  ${inBand} OF 100`, X0 - 18, bandY - 22, 28, PAPER, { font: 'passMono', axes: { wght: 700 } });
    // the count of the risen, riding the row above them, on a plate of paper over the places
    const upY = footUp(0) - this.sprung(this.upRow, t) * RP;
    d.rect(X0 + (COLS - 1) * PX + 36 - 648, upY - FH - 4, 648, FH + 8, PAPER);
    label(d, fonts, `NOT IN EXTREME POVERTY  ${100 - inBand} OF 100`, X0 + (COLS - 1) * PX + 18, upY - 22, 28, PINK(), { font: 'passMono', axes: { wght: 700 }, align: 'right' });
    // figures in the band are cut out of it; out of it they are inked, and crowned on "king"
    const kingT = w[4].start;
    for (let r = 0; r < 100; r++) {
      const b = Math.floor(r / COLS), c = colOf(r);
      const x = X0 + c * PX;
      const yb = footBand(b), yu = footUp(3 - b);
      const lf = this.lift(r, t);
      const v = (this.lift(r, t + 0.008) - this.lift(r, t - 0.008)) / 0.016;
      const y = lerp(yb, yu, lf);
      // stretched while it flies, squashed as it lands
      const speed = v * (yb - yu);
      const st = clamp(speed / 2600, -0.22, 0.32);
      const sy = 1 + st, sx = 1 - st * 0.45;
      const flying = Math.abs(speed) > 260;
      const out = lf > 0.1;
      // crowned on "king", in a wave across the crowd from the left
      const order = c + (3 - b) * 3;
      const tc = kingT + 0.02 + order * 0.018;
      const crowned = r >= inBand && lf > 0.5 && t > tc;
      const hop = crowned ? 16 * Math.max(0, Math.sin(Math.min(1, (t - tc) / 0.34) * Math.PI)) : 0;
      // after the crowning a wave runs through the kings, left to right, again and again: each
      // hops and raises its arms as it passes
      const ph = (t - kingT - 0.95) * 1.6 - c * 0.045 - (3 - b) * 0.012;
      const wv = crowned && ph > 0 ? Math.max(0, Math.sin((ph - Math.floor(ph)) * Math.PI * 2)) : 0;
      const swell = 13 * Math.pow(wv, 3);
      const yy = y - hop - swell;
      const mesh = flying || (crowned && t - tc < 0.45) || wv > 0.55 ? this.cheer : this.stand;
      d.fillMesh(mesh, out ? PINK() : PAPER, chain(translate(x, yy, 0), scale(FH * sx, FH * sy, 1)));
      if (crowned) {
        const pop = spring(t - tc, 2.6, 0.38);
        d.fillMesh(this.crownM, BLUE(), chain(translate(x, yy - FH * 0.95 * sy - 22 * (1 - pop), 0), scale(FH * 0.86 * pop, FH * 0.86 * pop, 1)));
      }
    }
    // ------------------------------------------------------------------ the year and the chart
    label(d, fonts, String(Math.round(yr)), 1838, 150, 140, BLUE(), { font: 'pass', axes: { wght: 850 }, align: 'right' });
    const CX0 = 1360, CX1 = 1838, CY0 = 292, CY1 = 186;
    const X = (y: number) => CX0 + ((y - 1820) / 198) * (CX1 - CX0);
    const Y = (v: number) => CY0 + (v / 100) * (CY1 - CY0);
    const xs = this.pov[0], ys = this.pov[1];
    const top: number[] = [];
    for (let i = 0; i < xs.length && xs[i] <= yr; i++) top.push(X(xs[i]), Y(ys[i]));
    top.push(X(yr), Y(share));
    if (top.length >= 4) {
      // under the line, the share in extreme poverty, in the band's ink; over it, the rest
      d.fill([[...top, X(yr), CY0, X(1820), CY0]], BOTH());
      const back: number[] = [];
      for (let i = top.length - 2; i >= 0; i -= 2) back.push(top[i], top[i + 1]);
      d.fill([[X(1820), CY1, X(yr), CY1, ...back]], PINK(0.55));
    }
    d.lineStyle({});
    d.seg([CX0, CY0, 0], [CX1, CY0, 0], 2, BLUE());
    d.seg([X(yr), CY1 - 8, 0], [X(yr), CY0 + 6, 0], 2.5, BLUE());
    d.flush();
    for (const yy of [1820, 1900, 1950, 2018]) label(d, fonts, String(yy), X(yy), CY0 + 21, 15, BLUE(), { font: 'passMono', axes: { wght: 600 }, align: yy === 1820 ? 'left' : yy === 2018 ? 'right' : 'center' });
    label(d, fonts, `${share.toFixed(0)}%`, X(yr) + 9, Y(share) - 6, 19, BLUE(), { font: 'passMono', axes: { wght: 700 } });
    label(d, fonts, 'Share of the world in extreme poverty (cost of basic needs)', CX1, CY0 + 44, 15, BLUE(), { font: 'pass', axes: { wght: 700 }, align: 'right' });
    label(d, fonts, 'Data: Moatsos (2021), via Our World in Data', CX1, CY0 + 63, 13, BLUE(0.85), { font: 'passMono', axes: { wght: 500 }, align: 'right' });
    // ------------------------------------------------------------------ the line
    const plain = layLine(fonts, line, null, { font: 'passMono', size: 84, axes: { wght: 700 }, upper: true });
    const first = { ...plain, words: plain.words.slice(0, 2) };
    inkLine(d, first, 84, 128, t, { light: 'led', on: [1, 1], ghost: [0.1, 0.1] });
    const made = { ...plain, words: plain.words.slice(2, 4).map((sw, i, arr) => ({ ...sw, x: sw.x - arr[0].x })) };
    inkLine(d, made, 84, 236, t, { light: 'led', on: [1, 1], ghost: [0.1, 0.1] });
    // king: beside them, in the serif, landing on its word with a spring; its crown drops onto the k
    const king = layLine(fonts, null, 'king', { font: 'serifItalic', size: 250, axes: {} });
    king.words[0].word = w[4];
    const kx = 822, ky = 258;
    const kt = t - w[4].start;
    const bounce = kt < 0 ? 0 : 1 - spring(kt, 2.2, 0.35);
    inkLine(d, king, kx, ky, t, { light: 'filament', on: [1, 0], ghost: [0.07, 0.02], jiggle: () => [0, -bounce * 26, 0, 1, 1] });
    if (kt > 0) {
      const pop = spring(kt - 0.05, 2.0, 0.42);
      d.fillMesh(this.crownM, BOTH(), chain(translate(kx + 52, ky - 172 - bounce * 26 - 60 * (1 - pop), 0), rotZ(-0.25 * (1 - pop) - 0.14), scale(160 * pop, 160 * pop, 1)));
    }
    return { ...PRINT_POST };
  }
}
