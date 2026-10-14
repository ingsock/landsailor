// CHORUS 2, "Earthbreaker / Noble and prized".
// A field at night under a tractor's work lights. On the downbeat a plough cuts across it (plough
// motion: one fast stroke, then the furrows multiply behind it), and EARTHBREAKER is cut into the
// soil, its letters made of furrows. Then the chart grows out of the ground: the world's cereal
// yield and five countries', 1961-2024, as rows of stalks that sprout and sway (growth motion:
// organic, springy, each stalk a little late).
import { Camera } from '../engine/camera';
import { Scene, ShotFrame } from '../engine/engine';
import { RGBA, V3, clamp, ease, hex, lerp, prog, spring, withA, hash1, chain, translate, rotX, glide } from '../engine/math';
import { Score } from '../engine/score';
import { at } from '../lib/chart';
import { matrix } from '../lib/dotmatrix';
import { label, lamp, layLine, drawLine } from '../lib/lyric';
import { L, NIGHT } from '../lib/palette';

const SOIL = '#1a1410';

export class Field extends Scene {
  score!: Score;
  cereal!: Record<string, [number[], number[]]>;
  async init() {
    this.score = this.ctx.data.get('score');
    this.cereal = this.ctx.data.get('charts').cereal.series;
  }

  draw(f: ShotFrame) {
    return f.shot.params!.part === 'plough' ? this.plough(f) : this.yields(f);
  }

  plough(f: ShotFrame) {
    const { d, fonts } = this.ctx;
    const t = f.t;
    const line = this.score.line('Earthbreaker');
    this.ctx.clear(hex('#030303'));
    // the field lies flat; furrows run along x; the camera skims it, then rises
    const k = glide(f.p);
    // low behind the plough, then up and over to look down on the word cut into the soil
    const cam = new Camera();
    cam.pos = [lerp(-24, 30, k), lerp(-14, -78, k), lerp(-26, -14, k)];
    cam.target = [lerp(10, 30, k), 0, lerp(18, 24, k)];
    cam.roll = lerp(0.12, 0, k);
    cam.fov = 1.0; cam.near = 0.1;
    d.setCamera(cam);
    const fog: [number, number, number] = [40, 160, 0.05];
    // the plough's stroke: a bright cut racing across, furrows multiplying behind
    const cut = ease.outExpo(prog(t, line.start - 0.05, line.start + 0.5));
    const spread = ease.outCubic(prog(t, line.start + 0.1, line.end + 0.3));
    d.lineStyle({ world: true, fog });
    for (let r = -40; r <= 40; r++) {
      const z = 20 + r * 0.9;
      const reach = Math.abs(r) <= 0 ? cut : clamp(spread * 42 / Math.abs(r)) * cut;
      if (reach <= 0) continue;
      const x0 = -60, x1 = lerp(-60, 120, reach);
      d.seg([x0, 0, z], [x1, 0, z], 0.06, withA(hex('#c08048', 0.8), 0.9));
    }
    d.flush();
    // the cutting edge: a hot point
    d.dotStyle({ world: true, blend: 'add' });
    d.dot([lerp(-60, 120, cut), -0.1, 20], 0.5, L('filament', 3 * (1 - cut) + 0.3), 0.7);
    d.flush();
    // EARTHBREAKER cut into the soil: each letter's dots become short furrow strokes, lit as sung
    const m = matrix(fonts, 'EARTHBREAKER', 11, 'pass', { wght: 800 });
    const pitch = 0.8;
    const w = line.words[0];
    const ox = 30 - (m.width * pitch) / 2, oz = 20 + 11 * pitch * 0.9;
    d.lineStyle({ world: true, blend: 'add', fog });
    for (const [cx, ry] of m.dots) {
      const gi = Math.min(11, Math.floor((cx / m.width) * 12));
      const on = w.start + (gi / 12) * Math.min(1.0, w.end - w.start);
      const dt = t - on;
      const c: RGBA = dt < 0 ? hex('#2a2016', 1) : lamp('filament', dt, 0.8);
      const x = ox + cx * pitch, z = oz - ry * pitch * 0.9;
      d.seg([x - 0.34, -0.02, z], [x + 0.34, -0.02, z], 0.22, c);
    }
    d.flush();
    d.lineStyle({});
    // work lights from the tractor's side, warm pools on the soil
    d.dotStyle({ world: true, blend: 'add' });
    for (let i = 0; i < 6; i++) d.dot([lerp(-60, 120, cut) - 4 - i * 0.9, -2.2, 18 + (i % 2) * 4], 0.18, L('halide', 2.0), 0.6);
    d.flush();
    void SOIL; void label; void layLine; void drawLine; void at; void chain; void translate; void rotX; void hash1; void spring; void NIGHT;
    return { bloom: 0.3, threshold: 0.95 };
  }

  yields(f: ShotFrame) {
    const { d, fonts } = this.ctx;
    const t = f.t;
    const line = this.score.line('Noble and prized');
    this.ctx.clear(hex('#030304'));
    const ents = ['World', 'United States', 'China', 'India', 'Brazil', 'Nigeria'];
    // the chart: years along x (1961-2024), one row of stalks per country going back in z,
    // each stalk's height its yield (tonnes per hectare)
    const X = (y: number) => (y - 1961) * 0.9;
    const H = (v: number) => v * 4.2;
    const k = glide(f.p);
    const cam = new Camera();
    cam.pos = [lerp(-14, 8, k), lerp(-22, -30, k), lerp(-46, -52, k)];
    cam.target = [lerp(26, 34, k), -8, 8];
    cam.fov = 0.95; cam.near = 0.1;
    d.setCamera(cam);
    const fog: [number, number, number] = [70, 200, 0.1];
    // the years grow in as the line is sung: a wave of sprouting from left to right
    const grow = (y: number) => {
      const tY = lerp(line.start - 0.2, line.end + 0.1, (y - 1961) / 63);
      return spring(t - tY, 2.0, 0.45);
    };
    // gridlines at 2, 4, 6, 8 t/ha, standing behind the rows
    d.lineStyle({ world: true, dash: [2, 0.5], fog });
    for (const v of [2, 4, 6, 8]) d.seg([0, -H(v), 30], [X(2024), -H(v), 30], 0.05, withA(NIGHT.hair, 1));
    d.flush();
    d.lineStyle({});
    for (const v of [2, 4, 6, 8]) label(d, fonts, `${v} t/ha`, -1, 0, 1.5, NIGHT.note, { align: 'right', base: chain(translate(0, -H(v) + 0.5, 30)) });
    // stalks
    d.lineStyle({ world: true, blend: 'add', fog });
    ents.forEach((name, row) => {
      const s = this.cereal[name];
      if (!s) return;
      const z = 2 + row * 4.5;
      const world = name === 'World';
      for (let y = 1961; y <= 2024; y++) {
        const v = at(s, y);
        if (v === null) continue;
        const g = grow(y);
        if (g <= 0) continue;
        const h = H(v) * g;
        // sway: each stalk bends a little in its own time
        const sway = Math.sin(t * 2.3 + y * 0.7 + row) * 0.15 * h / 10;
        const x = X(y);
        const c: RGBA = world ? L('filament', 1.25) : withA(L('sodium', 0.75), 1);
        d.seg([x, 0, z], [x + sway, -h, z], world ? 0.16 : 0.1, c, world ? 0.08 : 0.05, withA(c, 1.3));
        // the ear at the top
        d.seg([x + sway, -h, z], [x + sway * 1.2, -h - 0.6 * g, z], world ? 0.32 : 0.2, withA(c, 1.4));
      }
      label(d, fonts, name, X(2024) + 1.2, 0, 1.6, world ? L('filament', 1.1) : NIGHT.note, { font: 'pass', axes: { wght: 600 }, base: chain(translate(0, -H(at(s, 2024) ?? 3) + 0.4, z)) });
    });
    d.flush();
    d.lineStyle({});
    for (const y of [1970, 1990, 2010]) label(d, fonts, String(y), X(y), 2.4, 1.4, NIGHT.note, { align: 'center', base: chain(translate(0, 0, 1)) });
    // title, and the line
    const tb = chain(translate(0, -H(9.2), 30));
    label(d, fonts, 'Cereal yield, tonnes per hectare, 1961–2024', 0, 0, 2.6, hex('#d7deee'), { font: 'pass', axes: { wght: 650 }, base: tb });
    label(d, fonts, 'Data: FAO, via Our World in Data', 0, 2.0, 1.3, NIGHT.noteDim, { base: tb });
    const sl = layLine(fonts, line, null, { size: 120, axes: { wdth: 115, wght: 850 }, upper: true, maxWidth: 1700 });
    d.setCamera(Camera.home());
    drawLine(d, sl, 960 - sl.width / 2, 980, t, { light: 'filament', glass: 0.75 });
    void hash1;
    return { bloom: 0.3, threshold: 0.95 };
  }
}
