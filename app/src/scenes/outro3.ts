// OUTRO, "Shield my eyes no more / Oh, I am altered now for good / Shield these eyes no more".
// THE STATE CHANGE. The sun comes up over Lake Michigan, east of the city, and floods everything
// (flood motion: the light rises until it fills the frame). After it the film is ink on paper: what
// was light is now printed, and nothing needs a lamp to be seen.
// - Altered for good: since 1990 the economy of the United Kingdom has grown while its emissions
//   have halved, and others with it (diverge motion: two lines opening like scissors).
// - The last picture is the first, changed: Chicago's address grid in daylight, every line drawn.
import { Camera } from '../engine/camera';
import { LineMesh } from '../engine/draw';
import { Scene, ShotFrame } from '../engine/engine';
import { RGBA, chain, clamp, ease, hex, lerp, mixc, prog, scale, translate, withA, glide, smooth } from '../engine/math';
import { Score } from '../engine/score';
import { groundModel, loadCity, roadMesh } from '../lib/city';
import { drawLine, label, layLine } from '../lib/lyric';
import { DAY, L } from '../lib/palette';
import { dawnSky } from './outro1';
import { clouds } from '../lib/backdrop';

const PX = 0.1;
const MILE = 1609.34;

export class Outro3 extends Scene {
  score!: Score;
  ch: any;
  streets!: LineMesh; major!: LineMesh; rail!: LineMesh; water!: LineMesh;
  async init() {
    const { d } = this.ctx;
    this.score = this.ctx.data.get('score');
    this.ch = this.ctx.data.get('charts');
    const city = await loadCity(this.ctx);
    this.streets = roadMesh(d, city.streets);
    this.major = roadMesh(d, city.major);
    this.rail = roadMesh(d, city.rail, { width: [1.2, 1.6, 1.2], alpha: [1, 1, 1] });
    this.water = roadMesh(d, city.water, { width: [2.0, 1.4], alpha: [1, 0.9] });
  }

  draw(f: ShotFrame) {
    const p = f.shot.params!.part as string;
    if (p === 'sunrise') return this.sunrise(f);
    if (p === 'altered') return this.altered(f);
    return this.last(f);
  }

  echoLine(prefix: string) { return this.score.lines.find((l) => l.echo && l.text.startsWith(prefix))!; }

  sunrise(f: ShotFrame) {
    const { d, fonts } = this.ctx;
    const t = f.t;
    const call = this.score.line('Shield my eyes');
    const echo = this.echoLine('Shield your');
    const rise = ease.inOutSine(prog(t, call.start - 0.3, call.end + 0.1));
    // the sky: from blue hour to full day, through the sun's own colour
    const sky = rise < 0.5 ? mixc(dawnSky(0.95), hex('#f2c98e'), rise * 2) : mixc(hex('#f2c98e'), DAY.paper, (rise - 0.5) * 2);
    this.ctx.clear(sky);
    // the clouds over the lake light up from below, then the day swallows them
    clouds(this.ctx.d, t, 0.55 + 0.45 * rise, { seed: 17, n: 11, top: 180, bottom: 660, alpha: 1 - smooth((rise - 0.42) / 0.3) });
    const cam = Camera.home();
    cam.pos = [960, 540 - 40 * rise, -1600];
    d.setCamera(cam);
    // the lake's horizon and the sun coming up out of it
    const HZ = 700;
    // the sun first, then the lake over it, so it comes up from behind the horizon, not through the water
    const sy = lerp(HZ + 80, 360, ease.outCubic(rise));
    const sunR = 70;
    d.dotStyle({ blend: 'add' });
    d.dot([960, sy, 0], sunR, mixc(hex('#ff8a3a', 3), hex('#fff6e8', 4), rise), 0.2);
    d.dot([960, sy, 0], sunR * 6, withA(hex('#ffb070', 0.8 * (1 - rise * 0.6)), 1), 1);
    d.flush();
    d.rect(0, HZ, 1920, 380, { c0: mixc(hex('#0b1424'), hex('#c9c3b5'), rise), c1: mixc(hex('#04070d'), hex('#dcd6ca'), rise), from: [0, HZ], to: [0, 1080] });
    // its reflection on the water
    d.lineStyle({ blend: 'add' });
    for (let i = 0; i < 30; i++) {
      const y = HZ + 8 + i * 12;
      const w = (30 - i) * 4 + 30 * Math.sin(t * 3 + i);
      d.seg([960 - w, y, 0], [960 + w, y, 0], 2, withA(hex('#ffcf9a', 1.4 * (1 - rise * 0.5)), 1 - i / 30));
    }
    d.flush();
    d.lineStyle({});
    // the words: lamps while it is dark, ink once the day is up
    const sl = layLine(fonts, call, null, { size: 120, axes: { wdth: 112, wght: 880 }, upper: true, maxWidth: 1700 });
    const inkNow = rise > 0.42;
    drawLine(d, sl, 960 - sl.width / 2, 250, t, { light: inkNow ? 'ink' : 'filament', glass: 0.7 });
    const el = layLine(fonts, echo, null, { font: 'pass', size: 46, axes: { wght: 600 }, upper: true, tracking: 0.06 });
    drawLine(d, el, 960 - el.width / 2, 330, t, { light: inkNow ? 'ink' : 'sodium', glass: 0.5 });
    // the flood itself: exposure climbing to white, then settling to paper
    const flood = Math.sin(clamp((rise - 0.28) / 0.34) * Math.PI);
    return { bloom: 0.4 * (1 - rise), threshold: 0.9, flash: 0.38 * flood, flashColor: [1, 0.98, 0.94] };
  }

  altered(f: ShotFrame) {
    const { d, fonts } = this.ctx;
    const t = f.t;
    const call = this.score.line('altered now for good');
    const echo = this.echoLine('Altered now');
    this.ctx.clear(DAY.paper);
    const cam = Camera.home();
    const k = glide(f.p);
    cam.pos = [960 + lerp(-50, 50, k), 540, lerp(-1550, -1650, k)];
    d.setCamera(cam);
    // change since 1990, %: GDP and CO2, for the countries that did both
    const X0 = 220, X1 = 1500, Y0 = 640;
    const X = (y: number) => X0 + ((y - 1990) / (2024 - 1990)) * (X1 - X0);
    const Y = (pc: number) => Y0 - pc * 3.0;
    const open = ease.inOutCubic(prog(t, call.start - 0.2, echo.end));
    const yr = lerp(1990, 2024, open);
    d.lineStyle({ blend: 'alpha', dash: [6, 0.5] });
    for (const pc of [-50, 0, 50, 100]) d.seg([X0, Y(pc), 0], [X1, Y(pc), 0], 1, withA(DAY.rule, 1));
    d.flush();
    d.lineStyle({});
    for (const pc of [-50, 0, 50, 100]) label(d, fonts, `${pc > 0 ? '+' : ''}${pc}%`, X0 - 12, Y(pc) + 6, 16, DAY.inkSoft, { align: 'right' });
    for (const y of [1990, 2000, 2010, 2020]) label(d, fonts, String(y), X(y), Y(-60) + 30, 16, DAY.inkSoft, { align: 'center' });
    const countries = ['United Kingdom', 'Germany', 'France', 'Sweden', 'United States', 'Denmark'];
    const used: number[] = [];
    countries.forEach((n, i) => {
      const s = this.ch.decouple.series[n];
      if (!s) return;
      const i0 = s.years.indexOf(1990);
      if (i0 < 0) return;
      const g0 = s.gdp[i0], c0 = s.co2[i0];
      const G: number[] = [], C: number[] = [];
      for (let j = i0; j < s.years.length && s.years[j] <= yr; j++) {
        G.push(X(s.years[j]), Y((s.gdp[j] / g0 - 1) * 100), 0);
        C.push(X(s.years[j]), Y((s.co2[j] / c0 - 1) * 100), 0);
      }
      const main = i === 0;
      d.lineStyle({ blend: 'alpha' });
      d.poly(G, main ? 3.2 : 1.3, main ? DAY.ink : withA(DAY.inkSoft, 0.7));
      d.poly(C, main ? 3.2 : 1.3, main ? DAY.tailInk : withA(DAY.tailInk, 0.45));
      d.flush();
      d.lineStyle({});
      if (main && G.length >= 3) {
        const gv = ((s.gdp[Math.min(s.years.length - 1, i0 + Math.round(yr - 1990))] / g0) - 1) * 100;
        const cv = ((s.co2[Math.min(s.years.length - 1, i0 + Math.round(yr - 1990))] / c0) - 1) * 100;
        label(d, fonts, `UK GDP ${gv >= 0 ? '+' : ''}${gv.toFixed(0)}%`, G[G.length - 3] + 12, G[G.length - 2] + 5, 18, DAY.ink, { font: 'pass', axes: { wght: 700 } });
        label(d, fonts, `UK CO₂ ${cv.toFixed(0)}%`, C[C.length - 3] + 12, C[C.length - 2] + 5, 18, DAY.tailInk, { font: 'pass', axes: { wght: 700 } });
        used.push(C[C.length - 2] + 5 - 6, C[C.length - 2] + 5 + 6); // the others keep clear of it
      } else if (G.length >= 3 && yr > 2018) {
        let ly = C[C.length - 2] + 5;
        while (used.some((u) => Math.abs(u - ly) < 14)) ly += 14;
        used.push(ly);
        label(d, fonts, n, C[C.length - 3] + 10, ly, 12, withA(DAY.tailInk, 0.7));
      }
    });
    label(d, fonts, 'Change in GDP and in CO₂ emissions since 1990', X0, 180, 28, DAY.ink, { font: 'pass', axes: { wght: 700 } });
    label(d, fonts, 'Production-based emissions; GDP adjusted for inflation. Data: Global Carbon Budget; World Bank, via Our World in Data', X0, 210, 14, DAY.inkSoft);
    const head = layLine(fonts, call, null, { size: 70, axes: { wdth: 108, wght: 820 }, upper: true });
    drawLine(d, { ...head, words: head.words.slice(0, 5) }, X0, 960, t, { light: 'ink', glass: 1 });
    const good = layLine(fonts, null, 'for good', { font: 'serifItalic', size: 150, axes: {} });
    good.words.forEach((w, i) => (w.word = call.words[5 + i]));
    drawLine(d, good, X0 + head.words[4].x + head.words[4].run.width + 30, 970, t, { light: 'ink', glass: 1 });
    const el = layLine(fonts, echo, null, { font: 'pass', size: 40, axes: { wght: 650 }, upper: true, tracking: 0.06 });
    drawLine(d, el, 1700 - el.width, 1040, t, { light: 'ink', glass: 1 });
    return { bloom: 0, threshold: 9 };
  }

  last(f: ShotFrame) {
    const { d, fonts } = this.ctx;
    const t = f.t;
    const call = this.score.line('Shield these eyes', 0);
    const echo = this.score.lines.filter((l) => l.echo && l.text.startsWith('Shield these'))[0];
    this.ctx.clear(DAY.paper);
    // the first picture, changed: the same grid from straight above, in ink, every line
    // rising all the way to the end, slower and slower (even in log height, so the speed reads as one
    // long breath), and turning a little
    const back = ease.outQuad(prog(t, f.shot.start, f.shot.end));
    const h0 = 700 * Math.pow(4300 / 700, back);
    const cam = Camera.orbit([lerp(60, -150, back), 0, lerp(40, 200, back)], h0, lerp(0.02, -0.1, back), Math.PI / 2 - 0.004);
    cam.near = 1;
    d.setCamera(cam);
    const G = groundModel(PX, 0, 0, 0);
    d.lines(this.water, { model: G, color: withA(DAY.taxiInk, 0.9), blend: 'alpha' });
    d.lines(this.streets, { model: G, color: withA(DAY.inkSoft, 0.55), blend: 'alpha', wScale: 0.8 });
    d.lines(this.major, { model: G, color: withA(DAY.ink, 0.85), blend: 'alpha' });
    d.lines(this.rail, { model: G, color: withA(DAY.tailInk, 0.75), blend: 'alpha' });
    // the axes of the address grid, as at the start
    d.setModel(G);
    d.lineStyle({ blend: 'alpha' });
    const span = 40 * MILE;
    d.seg([-span, 0, 0], [span * 0.25, 0, 0], 1.6, DAY.ink);
    d.seg([0, -span, 0], [0, span, 0], 1.6, DAY.ink);
    for (let k = -20; k <= 20; k++) {
      if (!k) continue;
      d.seg([k * MILE, -90, 0], [k * MILE, 90, 0], 1.2, DAY.ink);
      d.seg([-90, k * MILE, 0], [90, k * MILE, 0], 1.2, DAY.ink);
    }
    d.flush();
    d.lineStyle({});
    d.setModel(null);
    const upp = (h0 * 2 * Math.tan(cam.fov / 2)) / 1080;
    const gap = (14 * upp) / PX;
    const lab = (txt: string, x: number, y: number, align: 'left' | 'center') => {
      const base = chain(G, translate(x, y, 0), scale(upp / PX, upp / PX, 1));
      label(d, fonts, txt, 0, 0, 17, DAY.ink, { align, base, tracking: 0.04 });
    };
    const every = h0 > 2000 ? 4 : h0 > 1200 ? 2 : 1;
    for (let k = 1; k <= 24; k++) {
      if (k % every) continue;
      lab(`${k * 800} W`, -k * MILE, -gap, 'center');
      lab(`${k * 800} N`, gap, -k * MILE + gap * 0.4, 'left');
      lab(`${k * 800} S`, gap, k * MILE + gap * 0.4, 'left');
    }
    lab('0   STATE & MADISON', gap, -gap, 'left');
    // the line, in ink
    d.setCamera(Camera.home());
    const sl = layLine(fonts, call, null, { size: 104, axes: { wdth: 112, wght: 880 }, upper: true, maxWidth: 1720 });
    drawLine(d, sl, 960 - sl.width / 2, 980, t, { light: 'ink', glass: 1 });
    if (echo) {
      const el = layLine(fonts, echo, null, { font: 'pass', size: 40, axes: { wght: 650 }, upper: true, tracking: 0.06 });
      drawLine(d, el, 960 - el.width / 2, 1040, t, { light: 'ink', glass: 1 });
    }
    // the end: the music fades, and so does everything but the paper
    const fade = prog(t, this.score.barTime(108), this.score.audio.duration - 1.5);
    return { bloom: 0, threshold: 9, flash: fade, flashColor: [DAY.paper[0], DAY.paper[1], DAY.paper[2]] };
  }
}

export type { RGBA };
void L;
