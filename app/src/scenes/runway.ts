// VERSE 1, "Cloudraker / Cloudraker, share your finds".
// O'Hare at night, from the approach path to runway 28C: the approach lights' strobes run at the
// threshold twice a second, CLOUDRAKER is painted past it and lights a letter per flash.
// Then the takeoff: the world's air passengers, 1970-2023, flown as a climb beside the runway
// (takeoff motion: a roll that accelerates, a rotation, a climb; a shudder in 2020).
import { Camera } from '../engine/camera';
import { Scene, ShotFrame } from '../engine/engine';
import { RGBA, V3, chain, clamp, ease, hex, lerp, prog, rotX, translate, withA, scale, glide, invLerp, easeOn } from '../engine/math';
import { Line, Score } from '../engine/score';
import { glyphModel, setRun } from '../engine/text';
import { at } from '../lib/chart';
import { CityData, loadCity } from '../lib/city';
import { label, lamp, letterOn } from '../lib/lyric';
import { L, NIGHT } from '../lib/palette';
import { stars } from '../lib/backdrop';

// map (east, south) -> world (x, 0, z=north)
const W = (x: number, ys: number, h = 0): V3 => [x, -h, -ys];

type Rw = { ref: string; width: number; a: [number, number]; b: [number, number] };

export class Runway extends Scene {
  score!: Score;
  city!: CityData;
  rws: Rw[] = [];
  taxi: Float32Array = new Float32Array(0);
  air!: [number[], number[]];

  async init() {
    this.score = this.ctx.data.get('score');
    this.city = await loadCity(this.ctx);
    this.rws = (this.city.meta.runways || []).map((r: any) => ({ ref: r.ref, width: r.width, a: r.pts[0], b: r.pts[r.pts.length - 1] }));
    this.taxi = this.city.runways;
    this.air = this.ctx.data.get('charts').air.series.World;
  }

  /** runway 28C: landing westbound; threshold at its east end */
  main() {
    const r = this.rws.find((x) => x.ref.includes('28C')) || this.rws[0];
    const east = r.a[0] > r.b[0] ? r.a : r.b, west = r.a[0] > r.b[0] ? r.b : r.a;
    const len = Math.hypot(east[0] - west[0], east[1] - west[1]);
    const dir: [number, number] = [(west[0] - east[0]) / len, (west[1] - east[1]) / len];
    return { r, east, west, len, dir };
  }

  draw(f: ShotFrame) {
    const part = f.shot.params!.part as number;
    if (part === 1) return this.approach(f);
    return this.takeoff(f);
  }

  // ------------------------------------------------------------------ the approach
  approach(f: ShotFrame) {
    const { d } = this.ctx;
    const t = f.t;
    this.ctx.clear(hex('#02030a'));
    stars(this.ctx.d, t, { seed: 3, n: 160, bottom: 260, alpha: 0.8 });
    const { r, east, dir, len } = this.main();
    const P = (along: number, across: number, h = 0): V3 => {
      // along: metres from the threshold toward the far end; across: metres right of the landing direction
      const rx = -dir[1], ry = dir[0];
      return W(east[0] + dir[0] * along + rx * across, east[1] + dir[1] * along + ry * across, h);
    };
    // 3 degree glide slope, landing speed
    // short final: over the approach lights to above the threshold, looking down onto the painted word
    // over the approach lights and across the threshold, nosing down onto the painted word
    const out = lerp(230, -95, glide(f.p, 0.15)); // a landing does not slow down to stop mid-air
    const cam = new Camera();
    cam.pos = P(-out, 0, lerp(40, 19, f.p));
    cam.target = P(Math.max(-out + 150, 70), 0, 0);
    cam.fov = 0.95; cam.near = 1;
    cam.roll = 0.02 * Math.sin(t * 1.7);
    d.setCamera(cam);
    const fog: [number, number, number] = [900, 6000, 0.06];

    // every runway's edge lights, and the taxiways' blue
    d.dotStyle({ world: true, blend: 'add' });
    for (const rw of this.rws) {
      const L2 = Math.hypot(rw.b[0] - rw.a[0], rw.b[1] - rw.a[1]);
      const ux = (rw.b[0] - rw.a[0]) / L2, uy = (rw.b[1] - rw.a[1]) / L2;
      const half = rw.width / 2 + 1.5;
      for (let s = 0; s <= L2; s += 60) {
        for (const side of [-1, 1]) {
          const x = rw.a[0] + ux * s - uy * half * side, y = rw.a[1] + uy * s + ux * half * side;
          d.dot(W(x, y, 0.4), 0.9, L('halide', rw === r ? 2.2 : 1.1), 0.5);
        }
      }
    }
    d.flush();
    // taxiway lights: blue, every 30 m along the centrelines
    const tx = this.taxi;
    d.dotStyle({ world: true, blend: 'add' });
    let carry = 0;
    for (let i = 0; i < tx.length / 6; i++) {
      if (tx[i * 6 + 4] !== 1) continue;
      const ax = tx[i * 6], ay = tx[i * 6 + 1], bx = tx[i * 6 + 2], by = tx[i * 6 + 3];
      const Lg = Math.hypot(bx - ax, by - ay);
      for (let s = carry; s < Lg; s += 30) d.dot(W(ax + ((bx - ax) * s) / Lg, ay + ((by - ay) * s) / Lg, 0.3), 0.7, L('taxi', 1.6), 0.5);
      carry = 0;
    }
    d.flush();
    // the runway itself: centreline lights every 15 m (red in the last 300 m), threshold bar in green
    d.dotStyle({ world: true, blend: 'add' });
    for (let s = 0; s <= len; s += 15) {
      const c = s > len - 300 ? L('tail', 1.6) : s > len - 900 && Math.floor(s / 15) % 2 ? L('tail', 1.4) : L('halide', 1.5);
      d.dot(P(s, 0, 0.1), 0.45, c, 0.4);
    }
    for (let k = -14; k <= 14; k++) d.dot(P(-1, k * 2.2, 0.3), 0.6, hex('#36ff8a', 2.0), 0.5);
    for (let k = -14; k <= 14; k++) d.dot(P(len + 1, k * 2.2, 0.3), 0.6, L('tail', 1.8), 0.5);
    // approach lights: a bar every 30 m out to 730 m, and the sequenced flashers running in
    for (let s = 30; s <= 730; s += 30) {
      for (let k = -2; k <= 2; k++) d.dot(P(-s, k * 1.1, 0.8), 0.5, L('halide', 1.4), 0.4);
      if (s === 300) for (let k = -7; k <= 7; k++) d.dot(P(-s, k * 1.2, 0.8), 0.5, L('halide', 1.4), 0.4);
    }
    const ph = (t * 2) % 1; // two runs a second
    const flasher = Math.floor(ph * 24);
    for (let k = 0; k < 24; k++) {
      const s = 730 - k * 30;
      const on = k === flasher;
      if (s < 30) continue;
      d.dot(P(-s, 0, 1.2), on ? 2.5 : 0.4, L('halide', on ? 6 : 0.2), on ? 0.8 : 0.4);
    }
    d.flush();
    // CLOUDRAKER painted past the threshold, reading for the landing direction
    this.painted(this.score.line('Cloudraker'), 'CLOUDRAKER', P, 45, r.width - 4, t, ph);
    void fog; void scale; void rotX;
    return { bloom: 0.32, threshold: 0.9 };
  }

  painted(line: Line, text: string, P: (a: number, b: number, h?: number) => V3, at0: number, width: number, t: number, ph: number) {
    const { d, fonts } = this.ctx;
    const run = setRun(fonts, 'pass', text, 100, { wght: 800 }, 0.06);
    const k = width / run.width, E = 2.2;
    // basis on the ground: x across (right of landing), y along (away from the approach)
    const o = P(at0, 0, 0), ax = P(at0, 1, 0), al = P(at0 + 1, 0, 0);
    const ux: V3 = [ax[0] - o[0], ax[1] - o[1], ax[2] - o[2]], uz: V3 = [al[0] - o[0], al[1] - o[1], al[2] - o[2]];
    const base = new Float32Array([ux[0] * k, ux[1] * k, ux[2] * k, 0, -uz[0] * k * E, -uz[1] * k * E, -uz[2] * k * E, 0, 0, 0, 0, 0, o[0], o[1], o[2], 1]);
    const off = chain(base, translate(-run.width / 2, 0, 0));
    const w = line.words[0];
    run.glyphs.forEach((g, i) => {
      if (!g.geo.mesh) return;
      const on = letterOn(w, i, run.glyphs.length);
      const dt = t - on;
      const col: RGBA = dt < 0 ? hex('#323b4f', 0.9) : lamp('strobe', dt, 0.8);
      d.fillMesh(g.geo.mesh, col, glyphModel(off, g.x, 0, run.scale), 'alpha');
    });
    void ph;
  }

  // ------------------------------------------------------------------ the takeoff chart
  takeoff(f: ShotFrame) {
    const { d, fonts } = this.ctx;
    const t = f.t;
    const sc = this.score;
    this.ctx.clear(hex('#02030a'));
    stars(this.ctx.d, t, { seed: 4, n: 320, bottom: 760 });
    const line = sc.line('share your finds');
    // the chart stands upright along the runway: x = year along the ground, y = passengers as height
    const X0 = 1966, X1 = 2023, MPY = 120, MPB = 520; // metres per year, metres per billion
    const xOf = (y: number) => (y - X0) * MPY;
    const hOf = (b: number) => b * MPB;
    // where the aircraft is: rolls from 1966 to 1970, then flies the data
    const roll0 = line.start - 0.1, fly1 = line.end + 0.35;
    const kRaw = Math.max(0, invLerp(roll0, fly1, t));
    const k = Math.min(1, kRaw);
    // the roll accelerates from rest (1966 to 1970), then the climb holds one speed through the years
    const yr = k < 0.18 ? X0 + 4 * ease.inQuad(k / 0.18) : 1970 + (X1 - 1970) * ((k - 0.18) / 0.82);
    const air = this.air;
    const value = (y: number) => (y < 1970 ? 0.31 * ease.inOutCubic(clamp((y - 1968.2) / 1.8)) : at(air, y) ?? 0);
    // past the last year the line ends, and the aircraft flies on out of the chart, climbing
    const over = (kRaw - k) * ((X1 - 1970) / 0.82) * MPY;
    const ac: V3 = [xOf(yr) + over, -hOf(value(yr)) - over * 0.35, 0];
    // camera: a chase from behind and to the side, then pulling up and back to see the whole climb
    // (never negative: before the pull-back the camera simply chases the rolling aircraft; run
    // backwards it would swing round behind the chart and read it in a mirror)
    const back = Math.max(0, easeOn(invLerp(line.words[2].start, fly1, t), ease.inOutCubic, 0.25));
    const cam = new Camera();
    const shake = (yr > 2019.6 && yr < 2021.5) ? 18 * Math.sin(t * 61) * Math.sin(t * 37) : 0;
    cam.pos = [ac[0] - lerp(420, 2600, back), ac[1] - lerp(60, 900, back) + shake, -lerp(260, 3600, back)];
    cam.target = [ac[0] + lerp(500, -1800, back), ac[1] * lerp(1, 0.55, back), 0];
    cam.fov = 0.9; cam.near = 2;
    d.setCamera(cam);

    // the ground: the runway, edge lights streaming past
    d.dotStyle({ world: true, blend: 'add' });
    for (let x = -800; x <= xOf(X1) + 800; x += 60) for (const z of [-30, 30]) d.dot([x, -0.5, z], 1.2, L('halide', 1.3), 0.5);
    for (let x = -800; x <= xOf(X1) + 800; x += 15) d.dot([x, -0.2, 0], 0.6, L('halide', 0.9), 0.4);
    d.flush();
    // the chart's grid: billions as altitudes, years along the runway
    d.lineStyle({ dash: [80, 0.5] });
    for (let b = 1; b <= 4; b++) d.seg([xOf(1970), -hOf(b), 0], [xOf(X1), -hOf(b), 0], 1.3, hex('#5a6a90', 1.0));
    d.flush();
    d.lineStyle({});
    const vert = chain(translate(0, 0, 0));
    for (let b = 1; b <= 4; b++) label(d, fonts, `${b} billion`, xOf(1970) - 60, -hOf(b) + 22, 60, NIGHT.note, { align: 'right', base: vert });
    for (let y = 1970; y <= 2020; y += 10) label(d, fonts, String(y), xOf(y), 120, 60, NIGHT.note, { align: 'center', base: vert });
    // the flown line so far, bright at the aircraft, and its contrail fading back
    const pts: number[] = [];
    for (let y = 1968; y <= yr; y += 0.25) pts.push(xOf(y), -hOf(value(y)), 0);
    pts.push(xOf(yr), -hOf(value(yr)), 0);
    const n = pts.length / 3;
    d.lineStyle({ glow: 3 });
    d.poly(pts, (i) => lerp(3, 6, i / n), (i) => L('halide', lerp(0.35, 1.6, Math.pow(i / Math.max(1, n - 1), 2))));
    d.flush();
    // after 2023 the data ends; the aircraft leaves only a thin contrail, which is not the chart
    if (over > 0) {
      d.lineStyle({ dash: [24, 0.5] });
      d.seg([xOf(yr), -hOf(value(yr)), 0], [ac[0], ac[1], 0], 1.5, withA(L('halide', 0.5), 0.6));
      d.flush();
    }
    d.lineStyle({});
    // the aircraft: strobe, red to port, green to starboard
    const strobe = (t * 1.2) % 1 < 0.06 ? 8 : 0.0;
    d.dotStyle({ world: true, blend: 'add' });
    d.dot([ac[0], ac[1] - 3, -14], 2.2, L('tail', 2.5), 0.6);
    d.dot([ac[0], ac[1] - 3, 14], 2.2, hex('#36ff8a', 2.5), 0.6);
    if (strobe) d.dot([ac[0], ac[1], 0], 9, L('halide', strobe), 0.9);
    d.dot([ac[0], ac[1], 0], 3, L('halide', 2.5), 0.6);
    d.flush();

    // the data block beside the aircraft, the way a radar screen labels a flight
    const tag = chain(translate(ac[0] + 90, ac[1] - 220, 0));
    const lineW = 70;
    d.setModel(null);
    d.lineStyle({});
    d.seg([ac[0] + 10, ac[1] - 10, 0], [ac[0] + 80, ac[1] - 150, 0], 2, withA(NIGHT.note, 0.8));
    d.flush();
    const call = sc.line('share your finds');
    // line 1: the callsign, lit as sung
    this.blockLine(call, 0, 1, 'CLOUDRAKER', tag, 0, t, 110);
    this.blockLine(call, 1, 4, 'SHARE YOUR FINDS', tag, 140, t, 70);
    const pax = value(yr);
    label(d, fonts, `${yr < 1970 ? '—' : Math.floor(yr)}  ${pax.toFixed(2)} BN PAX`, 0, 230, 52, L('halide', 0.9), { base: tag, font: 'passMono', axes: { wght: 500 } });
    void lineW;
    // title, low and quiet
    if (back > 0.3) {
      const tb = chain(translate(xOf(1970), -hOf(5.3), 0));
      label(d, fonts, 'Air passengers carried, 1970–2023', 0, 0, 120, withA(hex('#d7deee'), prog(back, 0.3, 0.7)), { font: 'pass', axes: { wght: 650 }, base: tb });
      label(d, fonts, 'Passengers on scheduled flights worldwide. Data: ICAO via World Bank, via Our World in Data', 0, 95, 50, withA(NIGHT.noteDim, prog(back, 0.3, 0.7)), { base: tb });
    }
    return { bloom: 0.3, threshold: 0.9 };
  }

  /** words of a sung line, from word i0 to i1 (exclusive), set as one line of a data block */
  blockLine(line: Line, i0: number, i1: number, text: string, base: Float32Array, y: number, t: number, size: number) {
    const { d, fonts } = this.ctx;
    const run = setRun(fonts, 'passMono', text, size, { wght: 700 });
    const words = line.words.slice(i0, i1);
    let wi = 0, li = 0;
    const parts = text.split(' ');
    run.glyphs.forEach((g, i) => {
      if (!g.geo.mesh) return;
      // find the word of this glyph
      let acc = 0, idx = 0;
      for (let k = 0; k < parts.length; k++) { if (g.cl >= acc && g.cl < acc + parts[k].length + 1) { idx = k; break; } acc += parts[k].length + 1; }
      const w = words[Math.min(idx, words.length - 1)];
      const inWord = g.cl - acc;
      const dt = t - letterOn(w, Math.max(0, inWord), parts[idx].length);
      const col = dt < 0 ? NIGHT.glass : lamp('strobe', dt, 0.7);
      d.fillMesh(g.geo.mesh, col, glyphModel(base, g.x, y, run.scale), 'alpha');
      void i; void wi; void li;
    });
  }
}
