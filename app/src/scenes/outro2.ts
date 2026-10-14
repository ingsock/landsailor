// OUTRO, "Great lifebringer / The price that we've paid / Time that you made it known /
// I want to be your bride in full".
// - Life expectancy for sixteen countries and the world, 1770-2023, every line at once in the
//   growing light (chorus motion: all the lines draw together, each labelled at its end).
// - The price: the temperature anomaly beside the Living Planet Index (wildlife populations down
//   73% since 1970), and THE PRICE in the face whose weight is the Arctic's ice, melting as its
//   year runs from 1979 to 2050 (melt motion: downward, thinning).
// - Made known: the sources of every chart in the film, unrolling like a footnote (reveal motion).
// - The vow: the gift and the price on one chart, two strands twisted into one braid.
// Behind all four, one dawn over Lake Michigan (DawnSky, below): the glow of the sun still under the
// lake's horizon, clouds lit from below and warmer shot by shot, the last stars and the morning star
// going, a far aircraft's contrail already in the sun, gulls low over the water. It is drawn from the
// song's time, not the shot's, so it runs on unbroken through the joins and into the sunrise.
import { Camera } from '../engine/camera';
import { Draw } from '../engine/draw';
import { Scene, ShotFrame } from '../engine/engine';
import { FS_VS, Prog, compile } from '../engine/gl';
import { RGBA, V3, TAU, clamp, ease, easeOn, hex, lerp, mixc, mulc, prog, withA, fbm1, glide, hash1, smooth } from '../engine/math';
import { Score } from '../engine/score';
import { at } from '../lib/chart';
import { drawLine, label, layLine, letterOn } from '../lib/lyric';
import { L } from '../lib/palette';
import { dawnSky, drawDawn } from './outro1';
import { stars } from '../lib/backdrop';

/** type and hairlines that read against the blue hour (NIGHT's are made for the dark) */
const DAWN = {
  hair: hex('#b9c7ea', 1, 0.2),
  hairDim: hex('#b9c7ea', 1, 0.1),
  note: hex('#b3bfdc'),
  noteDim: hex('#8f9bbb'),
  title: hex('#eef2fb'),
};

export class Outro2 extends Scene {
  score!: Score;
  ch: any;
  sky!: DawnSky;
  /** the dawn's span: from "Great lifebringer" to where the sun comes up */
  t0 = 0; t1 = 1;
  async init() {
    this.score = this.ctx.data.get('score');
    this.ch = this.ctx.data.get('charts');
    this.sky = new DawnSky(this.ctx.gl);
    this.t0 = this.score.line('Great lifebringer').start;
    this.t1 = this.score.line('Shield my eyes').start;
  }

  draw(f: ShotFrame) {
    const p = f.shot.params!.part as string;
    if (p === 'life') return this.life(f);
    if (p === 'price') return this.price(f);
    if (p === 'known') return this.known(f);
    return this.bride(f);
  }

  echoLine(prefix: string) { return this.score.lines.find((l) => l.echo && l.text.startsWith(prefix))!; }

  /** the dawn behind every shot here: one sky, as a function of the song's time */
  dawn(t: number): DawnParams {
    const { d } = this.ctx;
    const u = (t - this.t0) / (this.t1 - this.t0);
    const P = dawnParams(u);
    this.ctx.clear(dawnSky(P.k));
    drawDawn(d, P.k);
    this.sky.pass(d, 0, t, P);
    stars(d, t, { seed: 14, n: 220, bottom: 640, alpha: clamp((0.86 - P.k) / 0.28) });
    morningStar(d, t, P);
    aircraft(d, t, P);
    this.sky.pass(d, 1, t, P);
    glints(d, t, P);
    gulls(d, t, P);
    d.setCamera(Camera.home());
    return P;
  }

  life(f: ShotFrame) {
    const { d, fonts } = this.ctx;
    const t = f.t;
    const call = this.score.line('Great lifebringer');
    const echo = this.echoLine('Great');
    this.dawn(t);
    const cam = Camera.home();
    const k = glide(f.p);
    cam.pos = [960 + lerp(-60, 60, k), 540, lerp(-1550, -1650, k)];
    cam.target = [960, 540, 0];
    d.setCamera(cam);
    const X0 = 220, X1 = 1560, Y0 = 880, Y1 = 330;
    const X = (y: number) => X0 + ((y - 1770) / (2023 - 1770)) * (X1 - X0);
    const Y = (a: number) => Y0 + ((a - 20) / (90 - 20)) * (Y1 - Y0);
    // the years run quickly through the sparse early centuries and slow where the lines rise; the
    // pen is still moving when it reaches 2023
    const xr = (t - (call.start - 0.3)) / (call.end + 0.05 - (call.start - 0.3));
    const yr = Math.min(2023, lerp(1770, 2023, easeOn(xr, ease.outQuad, 0.2)));
    // the grid writes itself in as the shot arrives
    const gw = easeOn((t - (f.shot.start - 0.45)) / 1.1, ease.outCubic, 0.1);
    const gx = lerp(X0, X1, clamp(gw));
    d.lineStyle({ dash: [6, 0.5] });
    for (const a of [30, 40, 50, 60, 70, 80]) d.seg([X0, Y(a), 0], [gx, Y(a), 0], 1, a % 20 === 10 ? DAWN.hair : DAWN.hairDim);
    d.flush();
    d.lineStyle({});
    d.seg([X0, Y0, 0], [gx, Y0, 0], 1.2, withA(DAWN.hair, 0.32));
    for (const y of [1800, 1850, 1900, 1950, 2000]) if (X(y) < gx) d.seg([X(y), Y0, 0], [X(y), Y0 + 7, 0], 1.2, withA(DAWN.hair, 0.4));
    d.flush();
    const ga = clamp(gw * 1.4);
    for (const a of [30, 50, 70]) label(d, fonts, `${a} years`, X0 - 14, Y(a) + 5, 15, withA(DAWN.noteDim, ga), { align: 'right' });
    for (const y of [1800, 1850, 1900, 1950, 2000]) label(d, fonts, String(y), X(y), Y0 + 30, 15, withA(DAWN.noteDim, ga * clamp((gx - X(y)) / 40)), { align: 'center' });
    // every country, fine and cool; the world, warm and thick. Where a country has no measurement
    // for more than five years the line between is dotted, and each measured stretch is drawn solid
    const ents = Object.keys(this.ch.life.series);
    const heads: { n: string; x: number; y: number; v: number; c: RGBA; world: boolean; last: number }[] = [];
    for (const n of ents) {
      const s = this.ch.life.series[n] as [number[], number[]];
      const world = n === 'World';
      const last = s[1][s[1].length - 1];
      const c: RGBA = world ? L('filament', 1.35) : withA(mixc(hex('#9fb4e6', 0.85), hex('#ffd9b0', 0.95), clamp((last - 55) / 30)), 0.62);
      const tr = traces(s, yr, X, Y);
      if (!tr.head) continue;
      const hx = tr.head[0];
      // the newest few years burn a little brighter, like the end of a long exposure
      const burn = (x: number): RGBA => { const b = 1 + (world ? 0.25 : 0.7) * Math.exp(-(hx - x) / 60); return [c[0] * b, c[1] * b, c[2] * b, Math.min(1, c[3] * b)]; };
      d.lineStyle({ glow: world ? 2.4 : 0.6 });
      for (const r of tr.runs) d.poly(r, world ? 3.2 : 1.15, (i) => burn(r[i * 3]));
      d.flush();
      d.lineStyle({ dash: [2.5, 0.45] });
      for (const g of tr.gaps) d.seg([g[0], g[1], 0], [g[3], g[4], 0], world ? 2.2 : 1, withA(c, c[3] * (world ? 0.8 : 0.55)));
      d.flush();
      d.lineStyle({});
      if (world) {
        // the world's estimates where it has them: Riley's benchmark years before 1950
        d.dotStyle({ blend: 'add' });
        for (let i = 0; i < s[0].length && s[0][i] <= yr && s[0][i] < 1950; i++) d.dot([X(s[0][i]), Y(s[1][i]), 0], 2.6, withA(L('filament', 1.2), 0.9), 0.4);
        d.flush();
      }
      heads.push({ n, x: hx, y: tr.head[1], v: tr.head[2], c, world, last });
    }
    // the heads glow; the world's beats
    const beat = Math.pow(Math.max(0, Math.sin(t * 7.4)), 12) + 0.6 * Math.pow(Math.max(0, Math.sin(t * 7.4 - 0.9)), 12);
    for (const h of heads) glowHead(d, [h.x, h.y, 0], h.world ? L('filament', 1.4) : withA(h.c, 1), h.world ? 4.2 : 1.9, h.world ? beat : 0);
    // the names, once the lines near the present: kept apart, each joined to its line
    const la = smooth((yr - 1984) / 18);
    if (la > 0.01) {
      // in the order the lines end in (2023), highest first
      const ys = dodge(heads.map((h) => h.y + 4.5), 16.5, heads.map((h) => -h.last - (h.world ? 0.01 : 0)));
      const lx = heads.length ? heads[0].x + 24 : 0;
      d.lineStyle({});
      heads.forEach((h, i) => {
        if (Math.abs(ys[i] - 4.5 - h.y) > 2) d.seg([h.x + 5, h.y, 0], [lx - 5, ys[i] - 4.5, 0], 0.8, withA(h.c, 0.45 * la));
      });
      d.flush();
      heads.forEach((h, i) => {
        const col = h.world ? L('filament', 1.25, la) : withA(DAWN.note, la);
        const w = label(d, fonts, h.n, lx, ys[i], h.world ? 15 : 13, col, h.world ? { font: 'pass', axes: { wght: 700 } } : {});
        label(d, fonts, h.v.toFixed(0), lx + w + 7, ys[i], h.world ? 15 : 13, h.world ? L('filament', 1.25, la) : withA(mixc(h.c, DAWN.title, 0.5), la), h.world ? { font: 'pass', axes: { wght: 700 } } : {});
      });
    }
    label(d, fonts, 'Life expectancy at birth, 1770–2023', X0, 268, 24, DAWN.title, { font: 'pass', axes: { wght: 650 } });
    label(d, fonts, 'Data: Riley (2005); Zijdeman et al.; UN WPP, via Our World in Data. Dotted: years with no estimate', X0, 294, 14, DAWN.noteDim);
    const sl = layLine(fonts, call, null, { size: 120, axes: { wdth: 115, wght: 880 }, upper: true });
    drawLine(d, sl, X0, 150, t, { light: 'filament', glass: 0.7 });
    const el = layLine(fonts, echo, null, { font: 'pass', size: 40, axes: { wght: 600 }, upper: true, tracking: 0.06 });
    drawLine(d, el, X0 + 4, 210, t, { light: 'sodium', glass: 0.5 });
    return { bloom: 0.25, threshold: 1.0 };
  }

  price(f: ShotFrame) {
    const { d, fonts } = this.ctx;
    const t = f.t;
    const call = this.score.line('The price');
    const echo = this.echoLine('The price');
    this.dawn(t);
    // the camera sinks as the words melt
    const k = glide(f.p);
    const cam = Camera.home();
    cam.pos = [960 + lerp(-75, 80, k), lerp(390, 640, k), lerp(-1420, -1700, k)];
    cam.target = [960, lerp(475, 560, k), 0];
    cam.roll = lerp(0.035, -0.03, k);
    d.setCamera(cam);
    // the years run out as the line is sung, so that the price is there to read before the shot goes
    const r0 = call.start - 0.2, r1 = call.end - 0.45;
    const run = clamp(easeOn((t - r0) / (r1 - r0), ease.inOutSine, 0.2));
    // left: temperature anomaly 1850-2025; right: Living Planet Index 1970-2022 (1 = 1970)
    const tp = this.ch.temp.series.World as [number[], number[]];
    const lp = this.ch.lpi.series.World as [number[], number[]];
    const TY = 2025; // HadCRUT5's last full year (the table's 2026 is the year so far)
    const XA = (y: number) => 180 + ((y - 1850) / (TY - 1850)) * 700, YA = (v: number) => 800 - v * 230;
    const XB = (y: number) => 1040 + ((y - 1970) / (2022 - 1970)) * 700, YB = (v: number) => 820 - v * 320;
    const ya = lerp(1850, TY, run), yb = lerp(1970, 2022, run);
    // the grids write themselves in with the shot
    const gw = clamp(easeOn((t - (f.shot.start - 0.35)) / 1.0, ease.outCubic, 0.1));
    d.lineStyle({ dash: [6, 0.5] });
    for (const v of [0.5, 1.0, 1.5]) d.seg([180, YA(v), 0], [lerp(180, 880, gw), YA(v), 0], 1, DAWN.hairDim);
    for (const v of [0.25, 0.5, 0.75]) d.seg([1040, YB(v), 0], [lerp(1040, 1740, gw), YB(v), 0], 1, DAWN.hairDim);
    d.seg([1040, YB(1), 0], [lerp(1040, 1740, gw), YB(1), 0], 1.2, DAWN.hair);
    d.flush();
    d.lineStyle({});
    d.seg([180, YA(0), 0], [lerp(180, 880, gw), YA(0), 0], 1.2, withA(DAWN.hair, 0.3));
    d.flush();
    for (const v of [0, 0.5, 1.0, 1.5]) label(d, fonts, v === 0 ? '0 °C' : `+${v.toFixed(1)}`, 168, YA(v) + 5, 14, withA(DAWN.noteDim, gw), { align: 'right' });
    for (const v of [0.25, 0.5, 0.75, 1]) label(d, fonts, `${Math.round(v * 100)}%`, 1028, YB(v) + 5, 14, withA(DAWN.noteDim, gw), { align: 'right' });
    // the warming above the pre-industrial line, and what the wildlife index has lost since 1970: a
    // hairline for each year between its line and where it began, in the price's red, brightest at the line
    const tpPts = linePts(tp, ya, XA, YA, 1850);
    const lpPts = linePts(lp, yb, XB, YB, 1970);
    d.lineStyle({ blend: 'add' });
    for (let y = 1850; y <= ya; y++) {
      const v = at(tp, y) ?? 0;
      if (v <= 0.02) continue;
      d.seg([XA(y), YA(0), 0], [XA(y), YA(v), 0], 1, withA(L('tail', 0.6), 0), undefined, withA(L('tail', 0.6), 0.16 + 0.22 * clamp(v / 1.4)));
    }
    for (let y = 1971; y <= yb; y++) {
      const v = at(lp, y) ?? 1;
      d.seg([XB(y), YB(1), 0], [XB(y), YB(v), 0], 1, withA(L('tail', 0.6), 0), undefined, withA(L('tail', 0.6), 0.3));
    }
    d.flush();
    d.lineStyle({});
    // the temperature in the colour of its own anomaly: cool white below the line it began from,
    // warming through white to the price's red, burning hotter the higher it goes
    const tcol = (v: number): RGBA => v < 0.3
      ? mixc(hex('#a9bfff', 1.0), hex('#ffe2c8', 1.05), clamp((v + 0.25) / 0.55))
      : mixc(hex('#ffe2c8', 1.05), L('tail', 1.5), clamp((v - 0.3) / 0.85));
    d.lineStyle({ glow: 2.2 });
    d.poly(tpPts, 2.2, (i) => tcol(at(tp, Math.min(ya, 1850 + i)) ?? 0));
    // the index thins as it falls
    d.poly(lpPts, (i) => 1.0 + 2.4 * (at(lp, lerp(1970, yb, i / Math.max(1, lpPts.length / 3 - 1))) ?? 1), L('halide', 1.2));
    d.flush();
    d.lineStyle({});
    const tv = at(tp, ya) ?? 0, lv = at(lp, yb) ?? 1;
    if (run > 0) {
      glowHead(d, [XA(ya), YA(tv), 0], tcol(tv), 3.2, 0);
      glowHead(d, [XB(yb), YB(lv), 0], L('halide', 1.2), 3, 0);
      label(d, fonts, `${tv >= 0 ? '+' : '−'}${Math.abs(tv).toFixed(1)} °C`, XA(ya) + 12, YA(tv) - 10, 18, mulc(tcol(tv), 1.1), { font: 'pass', axes: { wght: 700 } });
      label(d, fonts, String(Math.round(ya)), XA(ya) + 12, YA(tv) + 9, 12, withA(DAWN.noteDim, 0.9));
      label(d, fonts, `${lv < 1 ? '−' : ''}${Math.abs(Math.round((lv - 1) * 100))}%`, XB(yb) + 12, YB(lv) + 6, 18, L('halide', 1.15), { font: 'pass', axes: { wght: 700 } });
      label(d, fonts, String(Math.round(yb)), XB(yb) + 12, YB(lv) + 24, 12, withA(DAWN.noteDim, 0.9));
    }
    label(d, fonts, `Global temperature change from pre-industrial, 1850–${TY}`, 180, 880, 18, DAWN.title, { font: 'pass', axes: { wght: 650 } });
    label(d, fonts, 'Data: Met Office HadCRUT5, via Our World in Data', 180, 904, 12, DAWN.noteDim);
    label(d, fonts, 'Living Planet Index: average change in wildlife populations since 1970', 1040, 880, 18, DAWN.title, { font: 'pass', axes: { wght: 650 } });
    label(d, fonts, 'Data: WWF and ZSL Living Planet Report 2024, via Our World in Data', 1040, 904, 12, DAWN.noteDim);
    // THE PRICE, melting: its year runs with the line and its echo, its letters sag, and drops of light
    // fall from them
    const year = lerp(1979, 2050, ease.inOutSine(prog(t, call.start - 0.2, echo.end)));
    const sl = layLine(fonts, call, null, { font: 'climate', size: 150, axes: { YEAR: year }, upper: true, maxWidth: 1700 });
    const sx = 960 - sl.width / 2, sy = 300;
    const sag = (wi: number, gi: number) => Math.max(0, (year - 2000) / 50) * 18 * (0.5 + 0.5 * fbm1(wi * 3 + gi * 1.7));
    drawLine(d, sl, sx, sy, t, { light: 'led', glass: 0.7, jiggle: (wi, gi) => [0, sag(wi, gi), 0, 1, 1] });
    drips(d, sl, sx, sy, t, year, sag);
    const el = layLine(fonts, echo, null, { font: 'pass', size: 40, axes: { wght: 600 }, upper: true, tracking: 0.06 });
    drawLine(d, el, 960 - el.width / 2, 400, t, { light: 'sodium', glass: 0.5 });
    return { bloom: 0.25, threshold: 1.0 };
  }

  known(f: ShotFrame) {
    const { d, fonts } = this.ctx;
    const t = f.t;
    const call = this.score.line('Time that you made');
    const echo = this.echoLine('Time that');
    this.dawn(t);
    // the list lies back like a page on a desk and the camera travels down it as it unrolls
    const k = glide(f.p);
    const cam = new Camera();
    cam.pos = [lerp(820, 900, k), lerp(-200, 120, k), lerp(-1250, -1100, k)];
    cam.target = [lerp(860, 900, k), lerp(400, 620, k), 0];
    cam.roll = lerp(0.06, -0.02, k);
    d.setCamera(cam);
    // the footnote of the film: every source, written out line by line behind a lamp
    const sources = [
      'Fouquin & Hugot (CEPII 2016) · merchandise exports', 'ICAO via World Bank · air passengers', 'World Bank · access to electricity',
      'NASA Earth Observatory · Black Marble 2016', 'ERA5 via Open-Meteo · Chicago temperature 2023', 'Energy Institute; Smil · primary energy',
      'Gapminder; UN IGME · child mortality', 'FAO · fruit supply, calorie supply, cereal yield', 'Moatsos (2021) · extreme poverty',
      'HYDE; UN WPP · population, urbanization, median age', 'Global Carbon Budget · CO₂ emissions', 'Met Office HadCRUT5 · temperature anomaly',
      'ITU via World Bank · internet use', 'Karl Rupp · transistors per microprocessor', 'van Zanden et al.; UNESCO · literacy',
      'Riley; Zijdeman et al.; UN WPP · life expectancy', 'WWF/ZSL · Living Planet Index', 'OpenStreetMap contributors · Chicago',
      'Natural Earth · countries and cities', 'OpenFlights.org · routes from O’Hare',
    ];
    // written out by the end of the sung line, before the vow dissolves in
    const reveal = clamp(easeOn((t - (call.start - 0.1)) / (call.end - 0.1 - (call.start - 0.1)), ease.inOutSine, 0.25));
    const pos = reveal * sources.length;
    const scroll = Math.max(0, pos - 12) * 34;
    const fadeTop = (y: number) => clamp((y - 400) / 60); // rows fade as they scroll up, clear of the words
    const cNum = L('sodium', 0.95), cSrc = hex('#dfe6f6'), cWhat = DAWN.noteDim;
    let lamp: V3 | null = null;
    sources.forEach((s, i) => {
      if (i > pos) return;
      const y = 480 + i * 34 - scroll;
      const a = fadeTop(y);
      if (a <= 0.01) return;
      const [src, what] = s.split(' · ');
      const parts: [string, RGBA][] = [[`${String(i + 1).padStart(2, '0')}  `, cNum], [src, cSrc], [` · ${what}`, cWhat]];
      const total = parts.reduce((n, p) => n + p[0].length, 0);
      let left = Math.ceil(clamp(pos - i) * total);
      let x = 380;
      for (const [txt, c] of parts) {
        if (left <= 0) break;
        x += label(d, fonts, txt.slice(0, left), x, y, 18, withA(c, c[3] * a));
        left -= txt.length;
      }
      if (pos - i < 1) lamp = [x + 6, y - 6, 0];
    });
    if (lamp) {
      // the print head moves fast: a short trail of light behind it
      const lp = lamp as V3;
      d.lineStyle({ glow: 1.5 });
      d.seg([lp[0] - 26, lp[1], 0], lp, 2.2, withA(L('filament', 1.2), 0), undefined, withA(L('filament', 1.5), 1));
      d.flush();
      d.lineStyle({});
      glowHead(d, lp, L('filament', 1.5), 2.6, 0);
    }
    const ty = 440 - scroll;
    label(d, fonts, 'All charts: Our World in Data (CC BY 4.0)', 380, ty, 20, withA(DAWN.title, fadeTop(ty + 30)), { font: 'pass', axes: { wght: 650 } });
    d.lineStyle({});
    d.seg([380, ty + 14, 0], [380 + 220 * clamp(pos), ty + 14, 0], 1.2, withA(DAWN.hair, 0.5 * fadeTop(ty + 30)));
    d.flush();
    d.setCamera(Camera.home());
    // (set to fit: at its full size the line ran off the right of the frame)
    const sl = layLine(fonts, call, null, { size: 96, axes: { wdth: 110, wght: 860 }, upper: true, maxWidth: 1560 });
    drawLine(d, sl, 260, 190, t, { light: 'led', glass: 0.7 });
    const el = layLine(fonts, echo, null, { font: 'pass', size: 40, axes: { wght: 600 }, upper: true, tracking: 0.06 });
    drawLine(d, el, 1660 - el.width, 1000, t, { light: 'sodium', glass: 0.5 });
    return { bloom: 0.25, threshold: 1.0 };
  }

  bride(f: ShotFrame) {
    const { d, fonts } = this.ctx;
    const t = f.t;
    const call = this.score.line('I want to be your bride');
    const echo = this.echoLine('Oh be my bride');
    this.dawn(t);
    const cam = Camera.home();
    const k = glide(f.p);
    cam.pos = [960, 540, lerp(-1500, -1700, k)];
    cam.roll = lerp(0.02, -0.02, k);
    d.setCamera(cam);
    // gift and price on one chart: the world's life expectancy (25-75 years) and its CO2 emissions
    // (0-40 billion tonnes a year), each on its own scale. The two lines are the data and stay where
    // the data puts them; between them a ribbon of light twists, so that the strand that leaves from
    // the gift reaches the price and back, and where the two lines close, at the end, it is one
    const life = this.ch.life.series.World as [number[], number[]];
    const co2 = this.ch.co2.series.World as [number[], number[]];
    const X = (y: number) => 200 + ((y - 1850) / (2023 - 1850)) * 1520;
    const lifeY = (y: number) => 780 - (((at(life, y) ?? 29.3) - 25) / 50) * 420;
    const co2Y = (y: number) => 780 - ((at(co2, y) ?? 0.2) / 40) * 420;
    const w5 = call.words[5].start;
    const run = clamp(easeOn((t - (call.start - 0.2)) / (w5 - (call.start - 0.2)), ease.inOutSine, 0.2));
    const tw = easeOn((t - (w5 - 0.3)) / (call.end + 0.3 - (w5 - 0.3)), ease.inOutCubic, 0.15);
    const twist = clamp(tw, 0, 1.6);
    const yEnd = lerp(1850, 2023, run);
    if (run > 0) {
      const N = Math.max(2, Math.ceil((yEnd - 1850) * 2));
      const ra: number[] = [], rb: number[] = [], s1: number[] = [], s2: number[] = [], z: number[] = [], cs: number[] = [];
      for (let i = 0; i <= N; i++) {
        const y = lerp(1850, yEnd, i / N);
        const x = X(y), ya = lifeY(y), yb = co2Y(y);
        const mid = (ya + yb) / 2, half = (yb - ya) / 2;
        // the twist travels along the braid, five years a second, from the moment it begins
        const ph = twist * (TAU / 14) * (y - 1850 - (t - w5) * 5);
        const c = Math.cos(ph), s = Math.sin(ph);
        ra.push(x, ya, 0); rb.push(x, yb, 0);
        s1.push(x, mid - half * c, 0); s2.push(x, mid + half * c, 0);
        z.push(s); cs.push(c);
      }
      const gift = L('filament', 1.25), price = L('tail', 1.2);
      // the ribbon between the strands: threads across it, the gift's face or the price's as it turns
      const ribbon = smooth(twist * 1.5);
      if (ribbon > 0.01) {
        d.lineStyle({ blend: 'add' });
        for (let i = 0; i <= N; i += 1) {
          const c = cs[i], face = c >= 0 ? gift : price;
          const a = ribbon * (0.06 + 0.2 * Math.abs(c));
          d.seg([s1[i * 3], s1[i * 3 + 1], 0], [s2[i * 3], s2[i * 3 + 1], 0], 1, withA(mulc(face, 0.6), a));
        }
        d.flush();
      }
      // the two strands: thick and bright where they come toward us, thin and dim behind, with
      // light running along each toward the present
      const strand = (pts: number[], base: RGBA, sign: number, phase: number) => {
        d.lineStyle({ glow: 2 });
        d.poly(pts, (i) => 1.3 + (2.3 * Math.max(0, sign * z[i]) - 0.4 * Math.max(0, -sign * z[i])) * ribbon, (i) => {
          const fr = 0.5 + 0.5 * sign * z[i] * ribbon;
          const x = pts[i * 3];
          let bead = 0;
          for (let j = 0; j < 3; j++) { const xb = 120 + ((t * 150 + j * 560 + phase) % 1680); bead += Math.exp(-(((x - xb) / 38) ** 2)); }
          return withA(mulc(base, (0.32 + 0.88 * fr) * (1 + 1.2 * bead * ribbon * fr)), 1);
        });
        d.flush();
      };
      strand(s1, gift, 1, 0);
      strand(s2, price, -1, 280);
      // the data itself, always where it is: two fine rails along the edges of the braid
      d.lineStyle({ glow: 0.8 });
      d.poly(ra, 1.25, withA(L('filament', 1.15), 0.8 + 0.2 * (1 - ribbon)));
      d.poly(rb, 1.25, withA(L('tail', 1.2), 0.8 + 0.2 * (1 - ribbon)));
      d.flush();
      d.lineStyle({});
      const hl: V3 = [X(yEnd), lifeY(yEnd), 0], hc: V3 = [X(yEnd), co2Y(yEnd), 0];
      glowHead(d, hl, gift, 3.2, 0);
      glowHead(d, hc, price, 3.2, 0);
      // where the two begin, and where they have come to: each value over its name, the gift's
      // above its line and the price's below, kept apart as the two lines close
      const sa = clamp(run * 8);
      label(d, fonts, '29 years', X(1850) - 12, lifeY(1850) + 4, 14, withA(L('filament', 1.1), sa), { font: 'pass', axes: { wght: 700 }, align: 'right' });
      label(d, fonts, '0.2 billion t', X(1850) - 12, co2Y(1850) + 12, 14, withA(mixc(L('tail', 1.4), hex('#ffd0c8', 1.2), 0.25), sa), { font: 'pass', axes: { wght: 700 }, align: 'right' });
      const la = smooth((yEnd - 1975) / 30);
      if (la > 0.01) {
        const lv = at(life, yEnd) ?? 73, cv = at(co2, yEnd) ?? 38;
        const ys = dodge([hl[1] - 22, hc[1] + 22], 40);
        const lx = hl[0] + 16;
        label(d, fonts, `${lv.toFixed(0)} years`, lx, ys[0], 17, withA(L('filament', 1.3), la), { font: 'pass', axes: { wght: 700 } });
        label(d, fonts, 'life expectancy', lx, ys[0] + 14, 11, withA(L('filament', 0.95), la), { tracking: 0.03 });
        label(d, fonts, `${cv.toFixed(0)} billion t`, lx, ys[1], 17, withA(L('tail', 1.35), la), { font: 'pass', axes: { wght: 700 } });
        label(d, fonts, 'CO₂ a year', lx, ys[1] + 14, 11, withA(L('tail', 1.1), la), { tracking: 0.03 });
      }
    }
    label(d, fonts, 'The gift and the price, World, 1850–2023: life expectancy (25–75 years) and CO₂ emissions (0–40 billion tonnes a year), each on its own scale', 200, 880, 15, DAWN.note);
    label(d, fonts, 'Data: Riley (2005); Zijdeman et al.; UN WPP; Global Carbon Budget, via Our World in Data', 200, 902, 12, DAWN.noteDim);
    // the vow in the serif; the answer in the infrastructure's face
    const head = layLine(fonts, call, null, { size: 76, axes: { wdth: 108, wght: 820 }, upper: true });
    drawLine(d, { ...head, words: head.words.slice(0, 5) }, 200, 200, t, { light: 'led', glass: 0.7 });
    const vow = layLine(fonts, null, 'bride in full', { font: 'serifItalic', size: 170, axes: {} });
    vow.words.forEach((w, i) => (w.word = call.words[5 + i]));
    drawLine(d, vow, 200, 360, t, { light: 'filament', intensity: 1.2, glass: prog(t, call.words[5].start - 0.5, call.words[5].start) });
    const el = layLine(fonts, echo, null, { font: 'pass', size: 44, axes: { wght: 600 }, upper: true, tracking: 0.06 });
    drawLine(d, el, 204, 450, t, { light: 'sodium', glass: 0.5 });
    return { bloom: 0.25, threshold: 1.0 };
  }
}

// ---------------------------------------------------------------------------------------------
// chart helpers

/** a series up to year `upTo` as measured stretches (solid) and the gaps of more than `gap` years
 *  between measurements (drawn dotted), with the head: where the pen is, and its value */
function traces(s: [number[], number[]], upTo: number, X: (y: number) => number, Y: (v: number) => number, gap = 5) {
  const [xs, ys] = s;
  const runs: number[][] = [], gaps: number[][] = [];
  let run: number[] = [];
  let head: [number, number, number] | null = null;
  for (let i = 0; i < xs.length; i++) {
    const wide = i > 0 && xs[i] - xs[i - 1] > gap;
    if (xs[i] > upTo) {
      if (i > 0 && xs[i - 1] <= upTo) {
        const v = lerp(ys[i - 1], ys[i], (upTo - xs[i - 1]) / (xs[i] - xs[i - 1]));
        if (wide) gaps.push([X(xs[i - 1]), Y(ys[i - 1]), 0, X(upTo), Y(v), 0]);
        else run.push(X(upTo), Y(v), 0);
        head = [X(upTo), Y(v), v];
      }
      break;
    }
    if (wide) {
      if (run.length >= 6) runs.push(run);
      gaps.push([X(xs[i - 1]), Y(ys[i - 1]), 0, X(xs[i]), Y(ys[i]), 0]);
      run = [];
    }
    run.push(X(xs[i]), Y(ys[i]), 0);
    head = [X(xs[i]), Y(ys[i]), ys[i]];
  }
  if (run.length >= 6) runs.push(run);
  return { runs, gaps, head };
}

/** a series from `from` up to year `upTo` (interpolated end) as flat xyz, a point a year */
function linePts(s: [number[], number[]], upTo: number, X: (y: number) => number, Y: (v: number) => number, from: number): number[] {
  const out: number[] = [];
  if (upTo <= from) return out;
  for (let y = from; y < upTo; y += 1) { const v = at(s, y); if (v !== null) out.push(X(y), Y(v), 0); }
  const v = at(s, upTo);
  if (v !== null) out.push(X(upTo), Y(v), 0);
  return out;
}

/** labels kept from colliding: wished-for y's in, placed y's out, at least `gap` apart and as near
 *  their wishes as they can be (a cluster of touching labels sits centred on its members' wishes).
 *  `order` fixes their order top to bottom, so that labels whose lines cross never swap places */
function dodge(want: number[], gap: number, order?: number[]): number[] {
  const key = order ?? want;
  const idx = want.map((_, i) => i).sort((a, b) => key[a] - key[b]);
  const ws = idx.map((i) => want[i]);
  const cs = ws.map((w, i) => ({ i0: i, n: 1, y: w }));
  for (let again = true; again;) {
    again = false;
    for (let j = 0; j + 1 < cs.length; j++) {
      const a = cs[j], b = cs[j + 1];
      if (a.y + a.n * gap > b.y + 1e-6) {
        const n = a.n + b.n;
        let s = 0;
        for (let m = 0; m < n; m++) s += ws[a.i0 + m] - m * gap;
        cs.splice(j, 2, { i0: a.i0, n, y: s / n });
        again = true;
        break;
      }
    }
  }
  const out = new Array<number>(want.length);
  for (const c of cs) for (let m = 0; m < c.n; m++) out[idx[c.i0 + m]] = c.y + m * gap;
  return out;
}

/** the glowing head of a line being drawn: a hot core in a soft halo, beating if asked */
function glowHead(d: Draw, p: V3, c: RGBA, r: number, beat: number) {
  d.dotStyle({ blend: 'add' });
  d.dot(p, r * 3.4 * (1 + 0.35 * beat), withA(c, 0.2 + 0.15 * beat), 1);
  d.dot(p, r * (1 + 0.2 * beat), mulc(withA(c, 1), 1.5 + beat), 0.45);
  d.flush();
}

/** drops of light running off THE PRICE as its year passes 2000: from about half the letters,
 *  each falling from where the letter has sagged to, faster as it goes, and fading */
function drips(d: Draw, sl: ReturnType<typeof layLine>, x0: number, y0: number, t: number, year: number, sag: (wi: number, gi: number) => number) {
  const melt = clamp((year - 2004) / 30);
  if (melt <= 0) return;
  d.lineStyle({ glow: 1.2 });
  d.dotStyle({ blend: 'add' });
  sl.words.forEach((sw, wi) => {
    sw.run.glyphs.forEach((g, gi) => {
      if (!g.geo.mesh || !sw.word) return;
      const h = hash1(wi * 37.1 + gi * 7.3);
      if (h < 0.42) return;
      const lit = letterOn(sw.word, gi, sw.letters);
      const period = 0.5 + 0.7 * hash1(h * 91.7);
      const begin = lit + 0.2 + h * 0.4;
      if (t < begin) return;
      const k = sw.run.scale;
      const bx = x0 + sw.x + g.x + (g.geo.bbox[0] + (g.geo.bbox[2] - g.geo.bbox[0]) * (0.25 + 0.5 * hash1(h * 13.1))) * k;
      const by = y0 + sag(wi, gi) - g.geo.bbox[1] * k + 1;
      const n0 = Math.floor((t - begin) / period);
      for (let m = Math.max(0, n0 - 1); m <= n0; m++) {
        const age = t - (begin + m * period);
        if (age < 0 || age > 0.62) continue;
        const fall = 0.5 * 950 * age * age;
        const v = 950 * age;
        const a = melt * (1 - age / 0.62) * (age < 0.08 ? age / 0.08 : 1);
        const c = withA(L('halide', 0.95), a);
        d.seg([bx, by + fall - Math.min(30, v * 0.03 + 3), 0], [bx, by + fall, 0], 1.6, withA(c, 0), undefined, c);
        d.dot([bx, by + fall, 0], 1.6, withA(L('halide', 1.4), a), 0.4);
      }
    });
  });
  d.flush();
  d.lineStyle({});
}

// ---------------------------------------------------------------------------------------------
// the dawn

type DawnParams = {
  u: number; k: number;
  /** the lake's horizon on screen, and how far it has risen from its first place */
  hz: number; shift: number;
  top: RGBA; low: RGBA; flat: RGBA; flatK: number;
  sun: [number, number, number]; sunC: RGBA;
  band: RGBA; bandH: number;
  lit: RGBA; dark: RGBA; cover: number;
  deep: RGBA;
};

/** the dawn at u: 0 at "Great lifebringer", 1 where the sunrise begins (both from the score) */
function dawnParams(u: number): DawnParams {
  const k = 0.62 + 0.34 * u;
  const uc = clamp(u, 0, 1.1);
  // the camera lowers its eyes to the lake as the sun comes: the horizon rises, slowly, then more
  const hz = 1012 - 302 * Math.pow(uc, 2.2);
  const shift = hz - 1012;
  // drawDawn's gradient, for what the lake mirrors
  const top = mixc(hex('#020309'), hex('#1c2a48'), clamp(k));
  const low = mixc(hex('#04060e'), mixc(hex('#3c4f78'), hex('#8a7a86'), clamp((k - 0.6) / 0.4)), clamp(k));
  // toward the sky the sunrise begins with: blue-grey, the warmth all in the glow over the sun
  const flat = dawnSky(0.95);
  const flatK = 0.85 * smooth((u - 0.5) / 0.5);
  const warm = smooth(uc * 1.1);
  const band = mulc(mixc(hex('#8073a8'), hex('#ff9150'), warm), 0.04 + 0.2 * Math.pow(uc, 1.4));
  const bandH = 50 + 110 * uc;
  const sun: [number, number, number] = [960, hz + 140 - 100 * uc, 210 + 130 * uc];
  const sunC = mulc(hex('#ffb070'), 0.02 + 0.66 * uc * uc);
  const lit = mulc(uc < 0.5 ? mixc(hex('#8c7db4'), hex('#f08ea2'), uc / 0.5) : mixc(hex('#f08ea2'), hex('#ffb47c'), (uc - 0.5) / 0.5), 0.34 + 0.6 * uc);
  const dark = mixc(hex('#161c33'), hex('#2e3150'), uc);
  const deep = mixc(hex('#121a30'), hex('#0b1424'), uc);
  return { u, k, hz, shift, top, low, flat, flatK, sun, sunC, band, bandH, lit, dark, cover: 0.5, deep };
}

const DAWN_FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform vec2 uRes; uniform float uPx; uniform float uTime;
uniform int uMode;                  // 0: the dawn's light on the sky, and the lake; 1: the clouds
uniform float uHz;                  // the horizon's y (px of the 1080-line frame, from the top)
uniform vec3 uTop; uniform vec3 uLow; uniform vec3 uFlat; uniform float uFlatK;
uniform vec3 uSun;                  // the glow of the sun under the horizon: x, y, radius (px)
uniform vec3 uSunC;
uniform vec4 uBand;                 // the warm band along the horizon: colour, height (px)
uniform vec3 uLit; uniform vec3 uDark; uniform float uCover;
uniform vec3 uDeep;
float h21(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * vn(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
// the light of the coming day, added to the sky: a band along the horizon, the glow over the sun
vec3 dawnLight(vec2 px){
  float above = max(uHz - px.y, 0.0);
  vec3 c = uBand.rgb * exp(-above / uBand.w);
  vec2 d = (px - uSun.xy) / vec2(uSun.z * 1.35, uSun.z);
  return c + uSunC * exp(-0.5 * dot(d, d));
}
vec3 skyAt(vec2 px){
  float g = clamp((px.y + 100.0) / 1280.0, 0.0, 1.0);
  return mix(mix(uTop, uLow, g), uFlat, uFlatK) + dawnLight(px);
}
// a deck of cloud seen from below, in perspective to the horizon: its density, and how much of the
// light from under the horizon it catches (thin edges and the sides toward the sun the most)
vec2 deck(vec2 px, float alt, float sc, float stretch, float drift, float cover, float seed){
  float e = uHz - px.y;
  if (e < 3.0) return vec2(0.0);
  float D = alt * 1600.0 / e;
  vec2 q = vec2(((px.x - 960.0) * D / 1600.0 + uTime * drift) / (sc * stretch), D / sc) + seed;
  float n = fbm(q) * 0.7 + fbm(q * 2.7 + 7.3) * 0.3;
  float thr = 1.0 - cover;
  float dens = smoothstep(thr, thr + 0.18, n) * smoothstep(3.0, 50.0, e);
  if (dens <= 0.0) return vec2(0.0);
  vec2 q2 = q + vec2(0.0, 0.04);
  float n2 = fbm(q2) * 0.7 + fbm(q2 * 2.7 + 7.3) * 0.3;
  float rim = clamp((n - n2) * 10.0, 0.0, 1.0);
  float thin = 1.0 - smoothstep(0.0, 0.28, n - thr);
  return vec2(dens, clamp(0.2 + 0.45 * thin + 0.7 * rim, 0.0, 1.3));
}
vec4 clouds(vec2 px){
  float e = max(uHz - px.y, 0.0);
  float sunward = exp(-pow((px.x - uSun.x) / 1100.0, 2.0)) * (0.45 + 0.55 * exp(-e / 380.0));
  vec2 hi = deck(px, 2600.0, 2400.0, 4.0, 5.0, uCover * 0.8, 3.1);
  vec2 lo = deck(px, 760.0, 1400.0, 1.7, 9.0, uCover, 11.7);
  vec3 cHi = mix(uDark, uLit * 1.2, clamp(hi.y * (0.6 + 0.6 * sunward), 0.0, 1.0));
  vec3 cLo = mix(uDark, uLit, clamp(lo.y * sunward * 1.15, 0.0, 1.0));
  float aHi = hi.x * 0.5, aLo = lo.x * 0.88;
  return vec4(cHi * aHi * (1.0 - aLo) + cLo * aLo, aHi * (1.0 - aLo) + aLo);
}
void main(){
  vec2 px = vec2(vUv.x, 1.0 - vUv.y) * uRes / uPx;
  if (uMode == 1) {
    if (px.y >= uHz) { o = vec4(0.0); return; }
    o = clouds(px);
    return;
  }
  if (px.y < uHz) { o = vec4(uFlat * uFlatK + dawnLight(px), uFlatK); return; }
  // the lake, as a plane seen from just above it: long low swells across the view with a finer chop
  // on them, drifting in to the shore; each is faded out where it would be finer than a pixel, so
  // the far water is a calm mirror. The sky is mirrored in it, stretched down by the swell
  float b = max(px.y - uHz, 0.3);
  float D = 96000.0 / b;
  vec2 w = vec2((px.x - 960.0) * D / 1600.0, D);
  float aSw = 1.0 - smoothstep(0.1, 0.3, 96000.0 / (b * b * 90.0));
  float aCh = 1.0 - smoothstep(0.1, 0.3, 96000.0 / (b * b * 16.0));
  float sw = (fbm(vec2(w.x / 1100.0, w.y / 90.0 + uTime * 0.3)) - 0.5) * aSw;
  float ch = (vn(vec2(w.x / 170.0, w.y / 16.0 + uTime * 0.9)) - 0.5) * aCh;
  float slope = sw * 1.5 + ch * 0.8;
  vec2 m = vec2(px.x + slope * (1.0 + b * 0.02), min(uHz - 1.0, uHz - 1.0 - b + slope * (2.0 + b * 0.4)));
  vec4 cl = clouds(m);
  vec3 refl = skyAt(m) * (1.0 - cl.a) + cl.rgb;
  float R = mix(0.07, 0.55, exp(-b / 140.0));
  vec3 c = mix(uDeep, refl, R) * (1.0 + 0.35 * slope);
  // (the glints of the sun's path are drawn over this as lines: see glints())
  // the line where the water meets the sky
  c += (uBand.rgb * 1.2 + uSunC * 0.6) * exp(-b / 1.5);
  o = vec4(c, 1.0);
}`;

/** one full-frame pass of the dawn: mode 0, the light on the sky and the lake; mode 1, the clouds */
class DawnSky {
  private p: Prog;
  private vao: WebGLVertexArrayObject;
  constructor(private gl: WebGL2RenderingContext) {
    this.p = compile(gl, FS_VS, DAWN_FS, 'dawnSky');
    this.vao = gl.createVertexArray()!;
  }
  pass(d: Draw, mode: 0 | 1, t: number, P: DawnParams) {
    const gl = this.gl, u = this.p.u;
    d.flush();
    gl.useProgram(this.p.p);
    gl.uniform2f(u.uRes, d.res[0], d.res[1]);
    gl.uniform1f(u.uPx, d.res[1] / 1080);
    gl.uniform1f(u.uTime, t);
    gl.uniform1i(u.uMode, mode);
    gl.uniform1f(u.uHz, P.hz);
    gl.uniform3f(u.uTop, P.top[0], P.top[1], P.top[2]);
    gl.uniform3f(u.uLow, P.low[0], P.low[1], P.low[2]);
    gl.uniform3f(u.uFlat, P.flat[0], P.flat[1], P.flat[2]);
    gl.uniform1f(u.uFlatK, P.flatK);
    gl.uniform3f(u.uSun, P.sun[0], P.sun[1], P.sun[2]);
    gl.uniform3f(u.uSunC, P.sunC[0], P.sunC[1], P.sunC[2]);
    gl.uniform4f(u.uBand, P.band[0], P.band[1], P.band[2], P.bandH);
    gl.uniform3f(u.uLit, P.lit[0], P.lit[1], P.lit[2]);
    gl.uniform3f(u.uDark, P.dark[0], P.dark[1], P.dark[2]);
    gl.uniform1f(u.uCover, P.cover);
    gl.uniform3f(u.uDeep, P.deep[0], P.deep[1], P.deep[2]);
    gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.STENCIL_TEST); gl.depthMask(false);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
    d.stats.calls++;
  }
}

/** a camera for the dawn's objects: the page, tilted with the horizon */
function skyCam(P: DawnParams): Camera {
  const c = Camera.home();
  c.shift = [0, P.shift];
  return c;
}

/** Venus, the morning star, low in the east: the last light left when the stars have gone */
function morningStar(d: Draw, t: number, P: DawnParams) {
  const a = (1 - smooth((P.u - 0.72) / 0.36)) * clamp((P.u + 0.3) / 0.3);
  if (a <= 0.01) return;
  d.setCamera(skyCam(P));
  d.dotStyle({ blend: 'add' });
  const tw = 0.92 + 0.08 * Math.sin(t * 5.3);
  d.dot([1696, 176, 0], 7, withA(hex('#fff1dc', 0.5), 0.35 * a * tw), 1);
  d.dot([1696, 176, 0], 1.9, withA(hex('#fff4e6', 1.7), a * tw), 0.5);
  d.flush();
}

/** a far aircraft, high enough to be in the sun already: its contrail lit gold, its strobes */
function aircraft(d: Draw, t: number, P: DawnParams) {
  const w = (P.u + 0.08) / 1.3;
  if (w < 0 || w > 1.05) return;
  d.setCamera(skyCam(P));
  const at0 = (s: number): V3 => [lerp(-90, 2010, s), lerp(128, 58, s) + 10 * Math.sin(s * 2.1), 0];
  const p = at0(w);
  const sec = 1.3 * 13.2; // seconds per unit of w (the dawn's span), near enough
  const lit = mixc(hex('#e8c6d6'), hex('#ffd9b0'), clamp(P.u));
  const pts: number[] = [];
  const n = 60;
  for (let i = 0; i <= n; i++) { const s = Math.max(0, w - (i / n) * 0.42); const q = at0(s); pts.push(q[0], q[1], 0); }
  d.lineStyle({ glow: 1.5 });
  d.poly(pts, (i) => 1.1 + (i / n) * 0.42 * sec * 0.32, (i) => {
    const age = (i / n) * 0.42 * sec;
    return withA(mulc(lit, 0.55 + 0.35 * P.u), clamp(age / 0.4) * Math.exp(-age / 4.5) * 0.85);
  });
  d.flush();
  d.lineStyle({});
  d.dotStyle({ blend: 'add' });
  d.dot(p, 1.2, withA(hex('#dfe6ff', 0.9), 1), 0.4);
  const st = (t % 1.25);
  if (st < 0.05 || (st > 0.13 && st < 0.17)) d.dot(p, 2.4, withA(hex('#ffffff', 3), 1), 0.6);
  if ((t + 0.4) % 1.0 < 0.18) d.dot([p[0] - 3, p[1] + 1, 0], 1.6, withA(L('tail', 2), 1), 0.6);
  d.flush();
}

/** the path of the sun on the water, drawn as the sunrise draws it: horizontal glints under the glow,
 *  widest at the horizon and narrowing toward us, each one breaking and lengthening as the swell runs */
function glints(d: Draw, t: number, P: DawnParams) {
  const I = P.sunC[0];
  if (I < 0.03) return;
  d.setCamera(skyCam(P));
  d.lineStyle({ blend: 'add' });
  const col = hex('#ffcf9a');
  const rows = 34;
  for (let j = 0; j < rows; j++) {
    const y = 1012 + 4 + 6.2 * j + 0.13 * j * j;
    const wide = (P.sun[2] * 0.75) * (1 - j / (rows + 6));
    const fade = (1 - j / rows) * (0.55 + 0.45 * Math.exp(-j / 6));
    for (let k = 0; k < 3; k++) {
      const h = hash1(j * 13.7 + k * 3.1), h2 = hash1(j * 5.3 + k * 11.9);
      const cx = 960 + (h - 0.5) * 2 * wide * (k === 0 ? 0.35 : 1);
      const len = (5 + 22 * h2 + 0.5 * j) * (0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(t * (1.6 + 2.6 * h2) + h * 40), 1.5));
      const edge = Math.exp(-Math.pow((cx - 960) / (wide + 1), 2));
      const a = I * 1.6 * fade * edge;
      if (a < 0.004) continue;
      d.seg([cx - len, y, 0], [cx + len, y, 0], 1.3 + 0.05 * j, withA(mulc(col, a), 1));
    }
  }
  d.flush();
  d.lineStyle({});
}

/** gulls low over the water, dark against the glow, crossing toward the city as the light comes */
function gulls(d: Draw, t: number, P: DawnParams) {
  const w = (P.u - 0.4) / 0.6;
  if (w < -0.05 || w > 1.15) return;
  d.setCamera(skyCam(P));
  d.lineStyle({ blend: 'alpha' });
  const col = withA(mixc(hex('#141826'), hex('#2a2534'), clamp(P.u)), 0.9);
  const flock: [number, number, number][] = [[0, 0, 14], [26, -9, 12], [48, 4, 13], [70, -15, 11], [96, -3, 12], [128, -19, 10], [150, 2, 11]];
  flock.forEach(([dx, dy, s], i) => {
    const x = lerp(2010, 1300, w) + dx + 9 * Math.sin(t * 0.7 + i * 1.9);
    const y = 1012 - 50 + dy + 4 * Math.sin(t * 1.1 + i * 2.7);
    const ph = t * (5.6 + 0.9 * hash1(i * 7.7)) + i * 1.3;
    const up = Math.sin(ph);
    const e = s * (0.24 * up + 0.04), tip = s * (0.05 - 0.36 * Math.sin(ph - 0.7));
    const pts = [x - s, y - tip, 0, x - s * 0.46, y - e, 0, x, y + s * 0.08, 0, x + s * 0.46, y - e, 0, x + s, y - tip, 0];
    d.poly(pts, (j) => (j === 2 ? 2.2 : j === 1 || j === 3 ? 1.7 : 0.9), col);
  });
  d.flush();
  d.lineStyle({});
}
