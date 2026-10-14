// CHORUS 2, "But there's a storm outside your door / I'm a child no more".
// The world's CO2 emissions, 1750-2024, rise behind the city as a dark mass, and the global
// temperature anomaly is drawn by lightning: shown in a flash on the music's accents, then only
// as an afterimage (turbulence motion: gusts, shake, rain). STORM is set in Climate Crisis, a face
// whose weight is a year of Arctic sea ice: it thins as the temperature line climbs.
// Then the world's median age climbing from 22 to 30 years (aging motion: slow, heavy, settling),
// and the city's lights begin to fail.
import { Camera } from '../engine/camera';
import { Scene, ShotFrame } from '../engine/engine';
import { RGBA, clamp, ease, hex, lerp, prog, withA, fbm1, hash2, mulberry32, fract, glide } from '../engine/math';
import { Score } from '../engine/score';
import { at, path } from '../lib/chart';
import { drawLine, label, layLine } from '../lib/lyric';
import { L, NIGHT } from '../lib/palette';
import { Rain } from '../lib/rain';
import { Loop3D, sharedLoop } from '../lib/loop3d';

export class Storm extends Scene {
  score!: Score;
  co2!: [number[], number[]];
  temp!: [number[], number[]];
  median!: [number[], number[]];
  rainFx!: Rain;
  loop!: Loop3D;
  async init() {
    this.score = this.ctx.data.get('score');
    this.rainFx = new Rain(this.ctx.gl, this.ctx.d);
    this.loop = await sharedLoop(this.ctx);
    const ch = this.ctx.data.get('charts');
    this.co2 = ch.co2.series.World; this.temp = ch.temp.series.World; this.median = ch.median.series.World;
  }

  draw(f: ShotFrame) {
    return f.shot.params!.part === 'storm' ? this.storm(f) : this.child(f);
  }

  /** downtown seen from the lake at night, across the bottom of the frame: its windows lit, or
   *  failing; its faces catching the lightning */
  city(t: number, fail: number, flash = 0, restore: Camera | null = null) {
    const PX = 0.1;
    // from a boat five kilometres out, a little south of Madison, looking level and west at the
    // skyline; the picture's centre lowered so the skyline stands along the bottom, under the words
    const drift = Math.sin(t * 0.21) * 60;
    const cam = new Camera();
    cam.pos = [(5600 + drift) * PX, -40 * PX, -(260 + drift * 0.5) * PX];
    cam.target = [-400 * PX, -40 * PX, -(40) * PX];
    cam.fov = 0.32; cam.near = 5; cam.shift = [0, 475];
    cam.roll = Math.sin(t * 0.37) * 0.004;
    this.loop.draw(cam, {
      office: 0.26 * (1 - fail), officeI: 1.2, candle: 0, time: t,
      edge: [0.14, 0.17, 0.26], edgeI: 0.6 + 2 * flash,
      flash: 0.18 * flash, flashC: [0.5, 0.56, 0.85], flashDir: [-0.6, 0.7, 0.2],
      fog: [450, 1100, 0.5],
    });
    this.ctx.d.setCamera(restore || Camera.home());
  }

  storm(f: ShotFrame) {
    const { d, fonts } = this.ctx;
    const t = f.t;
    const sc = this.score;
    const line = sc.line('storm outside');
    this.ctx.clear(hex('#020307'));
    const gust = fbm1(t * 1.7) * 1.0;
    const cam = Camera.home();
    cam.pos = [960 + gust * 18, 560 + fbm1(t * 2.3 + 9) * 12, -1600];
    cam.target = [960 + gust * 6, 560, 0];
    cam.roll = gust * 0.015;
    d.setCamera(cam);
    const X0 = 180, X1 = 1740, Y0 = 880, Y1 = 200;
    const yr = lerp(1750, 2024, ease.inOutSine(prog(t, line.start - 0.4, line.words[4].start)));
    const X = (y: number) => X0 + ((y - 1750) / (2024 - 1750)) * (X1 - X0);
    const Yc = (g: number) => Y0 + (g / 40) * (Y1 - Y0);
    // CO2 as a mass: the area under the curve, dark, with a churning edge
    const top: number[] = [];
    for (let y = 1750; y <= yr; y += 2) {
      const v = at(this.co2, y) ?? 0;
      top.push(X(y), Yc(v) + fbm1(y * 0.05 + t * 2.0) * 10 * (v / 40));
    }
    if (top.length >= 4) {
      const poly = [...top, X(Math.min(yr, 2024)), Y0, X0, Y0];
      d.fill([poly], { c0: hex('#1a1e28', 1), c1: hex('#07080d', 1), from: [0, Y1], to: [0, Y0] }, null, 'alpha');
      const edge: number[] = [];
      for (let i = 0; i < top.length; i += 2) edge.push(top[i], top[i + 1], 0);
      d.lineStyle({});
      d.poly(edge, 1.5, hex('#8d98b3', 0.8));
      d.flush();
    }
    label(d, fonts, `${(at(this.co2, yr) ?? 0).toFixed(1)} BILLION TONNES OF CO₂ · ${Math.round(yr)}`, X(yr) - 10, Yc(at(this.co2, yr) ?? 0) - 18, 16, NIGHT.note, { align: 'right' });
    // lightning: the temperature anomaly, shown in a flash on every other beat (under three a second)
    const bt = sc.beatAt(t);
    const since = ((bt % 2) + 2) % 2 * (60 / sc.audio.bpm);
    const flash = Math.exp(-since / 0.07);
    const after = Math.exp(-since / 0.5);
    const Yt = (v: number) => 470 - v * 220;
    if (yr > 1850) {
      const tp = path(this.temp, X as any, Yt as any, yr, 1850, 0);
      // jag it like a bolt: small perpendicular offsets that change each flash
      const seed = Math.floor(t * 8);
      const jag: number[] = [];
      for (let i = 0; i < tp.length; i += 3) jag.push(tp[i], tp[i + 1] + (hash2(i, seed) - 0.5) * 10, 0);
      d.lineStyle({ glow: 3 });
      d.poly(jag, 2.4, withA(L('lightning', 0.35 + 2.2 * flash), clamp(0.12 + 0.88 * after)));
      d.flush();
      d.lineStyle({});
      const tv = at(this.temp, yr) ?? 0;
      label(d, fonts, `${tv >= 0 ? '+' : ''}${tv.toFixed(1)} °C`, X(yr) + 14, Yt(tv) + 6, 18, withA(L('lightning', 1.0), clamp(0.3 + after)));
    }
    // rain, gusting, lit by the lightning that draws the temperature
    this.rainFx.draw(f.frame, { amount: 0.75, wind: 0.2 + 0.12 * gust, lit: 1.1 + 2.5 * flash, pan: [gust * 40, 0] });
    this.city(t, 0, flash, cam);
    label(d, fonts, 'Annual CO₂ emissions from fossil fuels and industry, and global temperature anomaly', X0, 120, 22, hex('#d7deee'), { font: 'pass', axes: { wght: 650 } });
    label(d, fonts, 'World, 1750–2024. Data: Global Carbon Budget; Met Office HadCRUT5, via Our World in Data', X0, 146, 14, NIGHT.noteDim);
    // the line: BUT THERE'S A, then STORM in the melting face, then OUTSIDE YOUR DOOR
    const sl = layLine(fonts, line, null, { size: 70, axes: { wdth: 110, wght: 800 }, upper: true });
    drawLine(d, { ...sl, words: sl.words.slice(0, 3) }, X0, 330, t, { light: 'led', glass: 0.7 });
    const sw = line.words[3];
    // the face's year follows the temperature line, and stops short of the most melted, to stay a word
    const year = lerp(1979, 2036, clamp((yr - 1979) / (2024 - 1979)));
    const storm = layLine(fonts, null, 'STORM', { font: 'climate', size: 200, axes: { YEAR: year } });
    storm.words[0].word = sw;
    drawLine(d, storm, X0, 560, t, { light: 'lightning', intensity: 0.9, glass: prog(t, sw.start - 0.5, sw.start),
      jiggle: (_w, gi) => [fbm1(t * 9 + gi) * 3 * (1 + flash * 4), fbm1(t * 7 + gi * 3) * 3, 0, 1, 1] });
    const rest = { ...sl, words: sl.words.slice(4).map((w, i, arr) => ({ ...w, x: w.x - arr[0].x })) };
    drawLine(d, rest, X0, 680, t, { light: 'led', glass: prog(t, line.words[4].start - 0.4, line.words[4].start) });
    // no flash of the whole frame: the lightning is in the line (a few percent of linear white is
    // already a grey veil on screen)
    return { bloom: 0.35, threshold: 0.9 };
  }

  child(f: ShotFrame) {
    const { d, fonts } = this.ctx;
    const t = f.t;
    const line = this.score.line('child no more');
    this.ctx.clear(hex('#020307'));
    const cam = Camera.home();
    const sink = glide(f.p);
    cam.pos = [960, 540 + sink * 60, -1600 + sink * 120];
    cam.target = [960, 540 + sink * 30, 0];
    d.setCamera(cam);
    const X0 = 220, X1 = 1500, Y0 = 820, Y1 = 260;
    const yr = lerp(1950, 2023, ease.inOutQuad(prog(t, line.start - 0.2, line.words[2].end + 0.2)));
    const X = (y: number) => X0 + ((y - 1950) / (2023 - 1950)) * (X1 - X0);
    const Y = (a: number) => Y0 + ((a - 18) / (34 - 18)) * (Y1 - Y0);
    d.lineStyle({ dash: [6, 0.5] });
    for (const a of [20, 25, 30]) d.seg([X0, Y(a), 0], [X1, Y(a), 0], 1, NIGHT.hair);
    d.flush();
    d.lineStyle({});
    for (const a of [20, 25, 30]) label(d, fonts, `${a} years`, X0 - 12, Y(a) + 6, 16, NIGHT.note, { align: 'right' });
    for (const y of [1950, 1975, 2000, 2020]) label(d, fonts, String(y), X(y), Y0 + 32, 16, NIGHT.note, { align: 'center' });
    d.lineStyle({ glow: 2 });
    d.poly(path(this.median, X as any, Y as any, yr), 3, L('halide', 1.1));
    d.flush();
    d.lineStyle({});
    const age = at(this.median, yr) ?? 22;
    label(d, fonts, `${age.toFixed(1)} YEARS`, X(yr) + 16, Y(age) + 6, 18, L('halide', 1.0));
    label(d, fonts, 'Median age of the world’s population, 1950–2023', X0, 170, 26, hex('#d7deee'), { font: 'pass', axes: { wght: 650 } });
    label(d, fonts, 'Data: UN World Population Prospects, via Our World in Data', X0, 200, 15, NIGHT.noteDim);
    // CHILD shrinks and dims as it is sung; NO MORE lands heavy
    const sl = layLine(fonts, line, null, { size: 110, axes: { wdth: 108, wght: 860 }, upper: true });
    const cw = line.words[2];
    const shrink = ease.inOutCubic(prog(t, cw.start, line.end));
    drawLine(d, { ...sl, words: sl.words.slice(0, 2) }, X0, 430, t, { light: 'led', glass: 0.7 });
    const child = layLine(fonts, null, 'CHILD', { size: 110, axes: { wdth: lerp(108, 80, shrink), wght: lerp(860, 250, shrink) } });
    child.words[0].word = cw;
    drawLine(d, child, X0 + sl.words[2].x, 430, t, { light: 'led', glass: 0.7, alpha: 1 - 0.55 * shrink });
    const nm = { ...sl, words: sl.words.slice(3).map((w, i, arr) => ({ ...w, x: w.x - arr[0].x })) };
    drawLine(d, nm, X0, 580, t, { light: 'led', intensity: 1.1, glass: prog(t, line.words[3].start - 0.4, line.words[3].start),
      jiggle: (wi) => [0, (1 - ease.outBack(clamp((t - line.words[3 + wi].start) / 0.35), 1.6)) * -30, 0, 1, 1] });
    // and the lights begin to fail
    const fail = ease.inQuad(prog(t, line.end - 0.3, f.shot.end));
    this.city(t, fail, 0, cam);
    return { bloom: 0.3, threshold: 0.95, exposure: 1 - 0.35 * fail };
  }
}
