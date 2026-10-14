// CHORUS 2, "Feed me beyond my means".
// In 1798 Malthus wrote that population would always outrun food. The chart's frame is drawn at
// the means he foresaw; the world's population (0.6 billion in 1700, 8.1 billion now) climbs, meets
// the frame's top and breaks through it (overflow motion: pressure, a crack, then free), and the
// camera tilts up to follow the line out of the chart.
import { Camera } from '../engine/camera';
import { Scene, ShotFrame } from '../engine/engine';
import { clamp, ease, hex, lerp, prog, withA, spring, easeOn, invLerp, glide } from '../engine/math';
import { Score } from '../engine/score';
import { at, path } from '../lib/chart';
import { drawLine, label, layLine } from '../lib/lyric';
import { L, NIGHT } from '../lib/palette';

export class Malthus extends Scene {
  score!: Score;
  pop!: [number[], number[]];
  async init() {
    this.score = this.ctx.data.get('score');
    this.pop = this.ctx.data.get('charts').pop.series.World;
  }

  draw(f: ShotFrame) {
    const { d, fonts } = this.ctx;
    const t = f.t;
    const line = this.score.line('Feed me beyond');
    this.ctx.clear(hex('#020308'));
    // the frame holds 0-3 billion: the means; beyond it the line goes on
    const X0 = 260, X1 = 1500, Y0 = 860, YT = 360;
    const X = (y: number) => X0 + ((y - 1700) / (2023 - 1700)) * (X1 - X0);
    const Y = (b: number) => Y0 + (b / 3) * (YT - Y0);
    const yr = lerp(1700, 2023, ease.inOutSine(prog(t, line.start - 0.25, line.words[3].start)));
    const v = at(this.pop, yr) ?? 0.6;
    // the break: when the line reaches the top edge (around 1960) the frame cracks open
    const tBreak = line.words[2].start;
    const broke = t >= tBreak;
    const crack = spring(t - tBreak, 2.5, 0.3);
    const cam = Camera.home();
    // a slow push while the line climbs, then up and out through the break, never at rest
    const up = Math.max(0, easeOn(invLerp(tBreak, line.end + 0.3, t), ease.inOutCubic, 0.25));
    const g = glide(f.p);
    cam.pos = [lerp(900, 1250, up) + 40 * g, lerp(560, -260, up), lerp(-1550, -1900, up) + 90 * g];
    cam.target = [lerp(900, 1300, up), lerp(560, -120, up), 0];
    cam.roll = lerp(0, -0.06, up);
    d.setCamera(cam);
    // the frame: four hairlines; the top one bends up and snaps where the line goes through
    d.lineStyle({});
    const fc = withA(hex('#8d98b3', 1), 1);
    d.seg([X0, Y0, 0], [X1, Y0, 0], 1.4, fc);
    d.seg([X0, Y0, 0], [X0, YT, 0], 1.2, fc);
    d.seg([X1, Y0, 0], [X1, YT, 0], 1.2, fc);
    const xb = X(1960);
    if (!broke) {
      // pressure: the top bows up where the line pushes
      const push = clamp((v - 2.4) / 0.6);
      const pts: number[] = [];
      for (let i = 0; i <= 40; i++) {
        const x = lerp(X0, X1, i / 40);
        const bow = push * 14 * Math.exp(-((x - X(yr)) ** 2) / (2 * 90 * 90));
        pts.push(x, YT - bow, 0);
      }
      d.poly(pts, 1.4, fc);
    } else {
      // snapped: the two halves of the top edge spring back, a gap where the line went through
      const gap = 40 + 30 * crack;
      d.seg([X0, YT, 0], [xb - gap, YT - 18 * (1 - crack) - 6, 0], 1.4, fc);
      d.seg([xb + gap, YT - 18 * (1 - crack) - 6, 0], [X1, YT, 0], 1.4, fc);
    }
    d.flush();
    // a note on the timeline, as the chart's own annotation: when Malthus said it could not be done
    d.lineStyle({ dash: [6, 0.5] });
    d.seg([X(1798), Y0, 0], [X(1798), Y(1.6), 0], 1.1, withA(L('tail', 0.9), 0.85));
    d.flush();
    d.lineStyle({});
    label(d, fonts, '1798 · MALTHUS: POPULATION', X(1798) + 10, Y(1.6) + 4, 15, withA(L('tail', 0.95), 0.95));
    label(d, fonts, 'WILL ALWAYS OUTRUN FOOD', X(1798) + 10, Y(1.6) + 24, 15, withA(L('tail', 0.95), 0.95));
    // gridlines and labels
    for (const b of [1, 2, 3]) label(d, fonts, `${b} billion`, X0 - 14, Y(b) + 6, 16, NIGHT.note, { align: 'right' });
    for (const y of [1750, 1800, 1850, 1900, 1950, 2000]) label(d, fonts, String(y), X(y), Y0 + 32, 16, NIGHT.note, { align: 'center' });
    // the line: population, beyond the frame once it breaks
    const pts = path(this.pop, X as any, Y as any, yr, 1700, 2);
    d.lineStyle({ glow: 3 });
    d.poly(pts, 3.2, L('filament', 1.4));
    d.flush();
    d.lineStyle({});
    // the value at the head
    label(d, fonts, `${v.toFixed(1)} BILLION · ${Math.round(yr)}`, X(yr) + 18, Y(v) - 12, 18, L('halide', 1.0));
    label(d, fonts, 'World population, 1700–2023', X0, YT - 60, 28, withA(hex('#d7deee'), 1 - up * 0.6), { font: 'pass', axes: { wght: 650 } });
    label(d, fonts, 'Data: HYDE, Gapminder, UN WPP, via Our World in Data', X0, YT - 30, 15, withA(NIGHT.noteDim, 1 - up * 0.6));
    // the line: FEED ME inside the frame, BEYOND MY MEANS out past the broken edge
    const sl = layLine(fonts, line, null, { size: 96, axes: { wdth: 115, wght: 860 }, upper: true });
    const a = { ...sl, words: sl.words.slice(0, 2) };
    drawLine(d, a, X0 + 30, Y0 - 60, t, { light: 'filament', glass: 0.75 });
    const b = { ...sl, words: sl.words.slice(2).map((w, i, arr) => ({ ...w, x: w.x - arr[0].x })) };
    drawLine(d, b, xb + 60, YT - 220 - 160 * up, t, { light: 'filament', intensity: 1.2, glass: prog(t, line.words[2].start - 0.4, line.words[2].start) });
    return { bloom: 0.3, threshold: 0.95 };
  }
}
