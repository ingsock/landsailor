// VERSE 2, "Landsailor / Deepwinter strawberry / Endless summer, ever spring".
// A year as a wheel of months, turning (rotation motion: the hand sweeps the seasons). Strawberries
// ripen around Chicago in June; on "strawberry" the winter months light too, because the trucks
// bring them anyway. The ring is as thick as the world's fruit supply per person, which more than
// doubles from 1961 to 2023 as the wheel turns. On "Endless summer" every month burns amber.
import { Camera } from '../engine/camera';
import { Scene, ShotFrame } from '../engine/engine';
import { RGBA, TAU, clamp, ease, hex, lerp, mixc, prog, withA, glide, mulberry32 } from '../engine/math';
import { Score } from '../engine/score';
import { at } from '../lib/chart';
import { drawLine, drawOnPath, label, layLine } from '../lib/lyric';
import { L, NIGHT } from '../lib/palette';

const CX = 960, CY = 560;
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export class Wheel extends Scene {
  score!: Score;
  fruit!: [number[], number[]];
  async init() {
    this.score = this.ctx.data.get('score');
    this.fruit = this.ctx.data.get('charts').fruit.series.World;
  }

  /** behind the wheel, for the print: a summer sun in halftone, and strawberries drifting by */
  backdrop(t: number) {
    const { d } = this.ctx;
    d.setCamera(Camera.home());
    const pulse = 1 + 0.06 * Math.sin(t * 2.2);
    d.rect(-100, -100, 2120, 1280, { c0: L('sodium', 0.15 * pulse), c1: withA(hex('#000000'), 0), from: [CX, CY], to: [CX + 900, CY], radial: true }, null, 'add');
    const rnd = mulberry32(9);
    for (let i = 0; i < 16; i++) {
      const s = 34 + 60 * rnd();
      const x = ((rnd() * 2300 + t * (14 + 22 * rnd())) % 2300) - 190;
      const y = 60 + rnd() * 960 + 18 * Math.sin(t * 0.9 + i);
      const rot = (rnd() - 0.5) * 0.9 + 0.25 * Math.sin(t * 0.7 + i * 2);
      const c = Math.cos(rot), sn = Math.sin(rot);
      const P = (u: number, v: number): [number, number] => [x + (u * c - v * sn) * s, y + (u * sn + v * c) * s];
      // the berry: wide at the shoulders, pointed below
      const body: number[] = [];
      for (let j = 0; j <= 40; j++) {
        const th = (j / 40) * TAU;
        const w = 0.55 * Math.sin(th) * Math.pow(0.5 + 0.5 * Math.cos(th), 0.35);
        body.push(...P(w, -0.62 * Math.cos(th)));
      }
      d.fill([body], L('sodium', 0.17), null, 'add');
      // its crown of leaves, in the other ink
      const crown: number[] = [];
      for (let j = 0; j < 10; j++) {
        const a = Math.PI + (j / 10) * TAU, r = j % 2 ? 0.12 : 0.34;
        crown.push(...P(Math.sin(a) * r, -0.6 + Math.cos(a) * r * 0.45));
      }
      d.fill([crown], L('halide', 0.24), null, 'add');
    }
  }

  draw(f: ShotFrame) {
    const { d, fonts } = this.ctx;
    const t = f.t;
    const sc = this.score;
    this.ctx.clear(hex('#020308'));
    this.backdrop(t);
    const ls = sc.line('Landsailor', 2), dw = sc.line('Deepwinter'), es = sc.line('Endless summer');
    // the years run with the wheel: 1961 at the start of the shot to 2023 by the end of "ever spring"
    const yr = lerp(1961, 2023, ease.inOutSine(prog(t, ls.start, es.end)));
    const kg = at(this.fruit, yr) ?? 40;
    // the hand turns a full year per bar, then faster on "Endless summer"
    const bars = (t - ls.start) / (240 / sc.audio.bpm);
    const spin = t < es.start ? bars : (es.start - ls.start) / (240 / sc.audio.bpm) + ((t - es.start) / (240 / sc.audio.bpm)) * 2.5;
    const hand = -Math.PI / 2 + spin * TAU;
    const view = (f.shot.params?.view as number) ?? 0;
    const cam = Camera.home();
    const k = glide(f.p);
    if (view === 0) {
      // the ring, turning a little against the hand
      cam.pos = [CX + lerp(120, -60, k), CY + lerp(-60, 40, k), lerp(-1900, -2150, k)];
      cam.target = [CX, CY, 0];
      cam.roll = lerp(0.12, -0.05, k);
    } else if (view === 1) {
      // close, down the wheel's face: from the winter months at the top to June at the bottom
      const y = lerp(CY - 330, CY + 330, ease.inOutCubic(prog(t, dw.words[0].start - 0.1, dw.words[1].start + 0.2)));
      cam.pos = [CX + lerp(-80, 80, k), y, lerp(-1080, -900, k)];
      cam.target = [CX, y, 0];
      cam.roll = lerp(-0.06, 0.04, k);
    } else {
      // wide, and turning with the summer that never ends
      cam.pos = [CX, CY, lerp(-2350, -1900, k)];
      cam.target = [CX, CY, 0];
      cam.roll = lerp(0.35, -0.25, ease.inOutQuad(k));
    }
    d.setCamera(cam);
    const R0 = 200, R1 = R0 + 3.6 * kg; // the ring's thickness is the fruit supply
    const summer = ease.inOutCubic(prog(t, es.start, es.words[1].end));
    for (let m = 0; m < 12; m++) {
      const a0 = -Math.PI / 2 + (m / 12) * TAU + 0.025, a1 = -Math.PI / 2 + ((m + 1) / 12) * TAU - 0.025;
      // strawberries: local in June; winter months join on "strawberry"; everything on "Endless summer"
      const local = m === 5 || m === 4 || m === 6;
      const winterOn = t >= dw.words[1].start + (m <= 1 || m === 11 ? 0 : 0.2) + (m === 11 ? 0 : m * 0.04);
      const on = local || (winterOn && (m <= 2 || m >= 10)) || summer > (m / 12) * 0.9;
      const passed = (((hand + Math.PI / 2) / TAU) % 1) * 12 > m || spin > 1;
      let c: RGBA;
      if (!on || !passed) c = hex('#141b2b', 1);
      else c = mixc(local ? L('sodium', 1.2) : mixc(L('halide', 1.0), L('sodium', 1.1), summer), L('sodium', 1.3), summer);
      const pts: number[] = [];
      const n = 16;
      for (let i = 0; i <= n; i++) { const a = lerp(a0, a1, i / n); pts.push(CX + Math.cos(a) * R1, CY + Math.sin(a) * R1); }
      for (let i = n; i >= 0; i--) { const a = lerp(a0, a1, i / n); pts.push(CX + Math.cos(a) * R0, CY + Math.sin(a) * R0); }
      d.fill([pts], { c0: withA(c, 0.35), c1: c, from: [CX, CY], to: [CX + Math.cos((a0 + a1) / 2) * R1, CY + Math.sin((a0 + a1) / 2) * R1] }, null, 'add');
      const am = (a0 + a1) / 2;
      label(d, fonts, MONTHS[m], CX + Math.cos(am) * (R1 + 34), CY + Math.sin(am) * (R1 + 34) + 6, 17, NIGHT.note, { align: 'center' });
    }
    // the hand
    d.lineStyle({ glow: 2 });
    d.seg([CX, CY, 0], [CX + Math.cos(hand) * (R1 + 10), CY + Math.sin(hand) * (R1 + 10), 0], 2.5, L('halide', 1.5));
    d.flush();
    d.lineStyle({});
    // the number in the middle
    label(d, fonts, `${kg.toFixed(0)} kg`, CX, CY + 10, 54, L('halide', 1.0), { font: 'pass', axes: { wght: 700 }, align: 'center' });
    label(d, fonts, `OF FRUIT A PERSON, ${Math.round(yr)}`, CX, CY + 44, 15, NIGHT.note, { align: 'center' });
    label(d, fonts, 'Fruit supply per person, World. Data: FAO, via Our World in Data', 120, 1010, 16, NIGHT.noteDim);
    // the sung lines around the ring
    const Rt = R1 + 96;
    if (t < dw.start - 0.2) {
      const sl = layLine(fonts, ls, null, { size: 70, axes: { wdth: 120, wght: 850 }, upper: true });
      drawOnPath(d, sl, (s) => { const a = -Math.PI / 2 - 0.9 + s / Rt; return [CX + Math.cos(a) * Rt, CY + Math.sin(a) * Rt, a + Math.PI / 2]; }, 0, t, { light: 'sodium' });
    } else if (t < es.start - 0.2) {
      const sl = layLine(fonts, dw, null, { size: 62, axes: { wdth: 116, wght: 820 }, upper: true });
      // DEEPWINTER over the winter months (top, around JAN), STRAWBERRY over June
      const deep = { ...sl, words: [sl.words[0]] };
      drawOnPath(d, deep, (s) => { const a = -Math.PI / 2 - 0.62 + s / Rt; return [CX + Math.cos(a) * Rt, CY + Math.sin(a) * Rt, a + Math.PI / 2]; }, 0, t, { light: 'led' });
      const straw = { ...sl, words: [{ ...sl.words[1], x: 0 }] };
      const w = straw.words[0].run.width;
      drawOnPath(d, straw, (s) => { const a = Math.PI / 2 + 0.55 - s / Rt; return [CX + Math.cos(a) * Rt, CY + Math.sin(a) * Rt, a - Math.PI / 2]; }, 0, t, { light: 'sodium', intensity: 1.2 });
      void w;
    } else {
      const sl = layLine(fonts, es, null, { size: 66, axes: { wdth: 118, wght: 840 }, upper: true });
      drawOnPath(d, { ...sl, words: sl.words.slice(0, 2) }, (s) => { const a = -Math.PI / 2 - 1.15 + s / Rt; return [CX + Math.cos(a) * Rt, CY + Math.sin(a) * Rt, a + Math.PI / 2]; }, 0, t, { light: 'sodium', intensity: 1.15 });
      const ever = { ...sl, words: sl.words.slice(2).map((w, i, arr) => ({ ...w, x: w.x - arr[0].x })) };
      drawOnPath(d, ever, (s) => { const a = Math.PI / 2 + 0.75 - s / Rt; return [CX + Math.cos(a) * Rt, CY + Math.sin(a) * Rt, a - Math.PI / 2]; }, 0, t, { light: 'sodium', intensity: 1.15 });
    }
    void drawLine;
    return { bloom: 0.3, threshold: 0.95 };
  }
}
