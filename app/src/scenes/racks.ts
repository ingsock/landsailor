// VERSE 3, "Headless and faceless / Tireless and seamless, behind these walls".
// Drawn as an architect's sheets, which the blueprint grade prints as white ink on cyanotype blue.
// The data hall as a cutaway (hall_rack.ts): section A-A through the building, its ceiling removed,
// rows of racks running away in perspective, nobody in them; status lights blinking each at its own
// rate (blink motion: many small independent clocks), light running along the fibres overhead and a
// burst down every runner on the beat, cold air rising off the perforated tiles. Then the wall
// (hall_wall.ts): section B-B through an exterior wall, every layer hatched as it is drawn, and in its
// service cavity the chart of the share of the world using the internet, 1990-2025 (ITU via World
// Bank): every country a hairline, the world a fibre in a conduit; the detail sheet goes down onto the
// fibre and runs along it with its packets of light (packet motion: discrete, fast, never touching).
// The sung line is each sheet's title.
import { Camera } from '../engine/camera';
import { Scene, ShotFrame } from '../engine/engine';
import { V3, clamp, hex, lerp, glide } from '../engine/math';
import { Line, Score } from '../engine/score';
import { drawLine, label, layLine } from '../lib/lyric';
import { WallSection } from '../lib/hall_wall';
import { DataHall, GROUND_Y, HALL_L, PLENUM, RACK_H, RUNNER_Y, TRAY_Y, X_MAX, X_MIN, CEIL } from '../lib/hall_rack';
import { GROUND, INK, callout, dim, level, outline, planeY, planeZ, rectC, sheet, spline } from '../lib/hall_draft';

export class Racks extends Scene {
  score!: Score;
  hall = new DataHall();
  wallS!: WallSection;
  async init() {
    this.score = this.ctx.data.get('score');
    this.wallS = new WallSection(this.ctx.data.get('charts').internet.series);
  }

  draw(f: ShotFrame) {
    return f.shot.params!.part === 'racks' ? this.racks(f) : this.wall(f);
  }

  racks(f: ShotFrame) {
    const { d, fonts } = this.ctx;
    const t = f.t;
    const line = this.score.line('Headless');
    this.ctx.clear(hex('#000000'));
    const k = glide(f.p);
    // high over the cutaway, three-quarters on; the camera slides along the cut (right, the way the
    // whip into the wall goes) and leans in a little
    const cam = new Camera();
    const x = lerp(-2.6, 3.4, k);
    cam.pos = [x, lerp(-12.4, -11.6, k), lerp(-13.6, -12.6, k)];
    cam.target = [x + 2.4, -0.6, 9];
    cam.fov = 0.85;
    cam.near = 0.5; cam.far = 400;
    d.setCamera(cam);
    this.hall.beyond(d, t, cam, this.score.beatAt(t));
    this.hall.cut(d, t);
    // the drawing's notes, in the planes they measure
    const rv = clamp((t - line.start + 0.25) / 1.5);
    const s = 0.2;
    dim(d, fonts, planeZ(0), 0, GROUND_Y, 1.2, GROUND_Y, '1200', { off: -0.5, size: s, reveal: clamp(rv * 4), c: INK(0.6) });
    dim(d, fonts, planeZ(0), 1.2, GROUND_Y, 2.4, GROUND_Y, '1200', { off: -0.5, size: s, reveal: clamp(rv * 4 - 0.4), c: INK(0.6) });
    dim(d, fonts, planeZ(0), 2.4, GROUND_Y, 3.6, GROUND_Y, '1200', { off: -0.5, size: s, reveal: clamp(rv * 4 - 0.8), c: INK(0.6) });
    dim(d, fonts, planeZ(0), 3.6, GROUND_Y, 4.8, GROUND_Y, '1200', { off: -0.5, size: s, reveal: clamp(rv * 4 - 1.2), c: INK(0.6) });
    dim(d, fonts, planeZ(0), 6.0, 0, 6.0, -RACK_H, '2000 · 42U', { off: -0.45, size: s, reveal: clamp(rv * 3 - 0.3), c: INK(0.6) });
    dim(d, fonts, planeY(-RACK_H - 0.04), 3.0, 0, 3.0, HALL_L - 0.6, '24 000', { off: 0.0, size: 0.34, reveal: clamp(rv * 2 - 0.2), c: INK(0.6) });
    level(d, fonts, planeZ(0), X_MIN - 2.9, 0, '+0.600', { size: s, len: 2.2 });
    level(d, fonts, planeZ(0), X_MIN - 2.9, PLENUM, '±0.000', { size: s, len: 2.2 });
    // callouts, on leaders from the things they name out into the margin
    d.setCamera(Camera.home());
    const P = (p: V3) => cam.project(p);
    const notes: [V3, number, number, string, string, number][] = [
      [[0.6, -0.02, 5.4], -1, 0, 'COLD AISLE', 'PERFORATED TILES, AIR FROM BELOW', 0.0],
      [[3.0, -RACK_H - 0.04, 7.2], 1, -1, 'HOT AISLE CONTAINMENT', '', 0.12],
      [[-4.2, RUNNER_Y - 0.05, 9.5], -1, -1, 'FIBRE RUNNER', '', 0.24],
      [[6.0, TRAY_Y - 0.05, 4.0], 1, -1, 'CABLE TRAY', '', 0.36],
      [[X_MAX - 0.9, -1.2, 12.0], 1, 0, 'AIR HANDLER', 'FANS RUN, NOBODY THERE', 0.48],
      [[this.hall.entry, 1.6, 0], 1, 1, 'SERVICE ENTRANCE', 'FIBRE IN FROM THE STREET', 0.6],
    ];
    notes.forEach(([p, sxs, sys, txt, sub, delay], i) => {
      const [ax, ay] = P(p);
      const bx = ax + sxs * (90 + 30 * Math.abs(sys)), by = ay + (sys || -0.4) * 70;
      callout(d, fonts, null, ax, ay, bx, by, String(i + 1), txt, { size: 17, reveal: clamp((rv - delay) * 2.2), right: sxs > 0, sub: sub || undefined, mask: true });
    });
    const [nx, ny] = P([X_MIN + 2, CEIL, HALL_L - 3]);
    label(d, fonts, 'CEILING REMOVED FOR CLARITY', nx, ny, 13, INK(0.45), { font: 'passMono', axes: { wght: 500 } });
    this.titleBlock(f, line, 'SECTION A–A · DATA HALL 2 · CUTAWAY · SCALE 1:50', ['LIGHTS-OUT OPERATION', 'OCCUPANCY 0', 'DWG A-207']);
    return { bloom: 0.34, threshold: 0.9 };
  }

  /** the sheet's border and a title block across its top: the sung line is the drawing's title */
  titleBlock(f: ShotFrame, line: Line, sub: string, fields: string[], alpha = 1) {
    const { d, fonts } = this.ctx;
    const t = f.t;
    sheet(d, fonts, { alpha });
    const x0 = 42, y0 = 42, x1 = 1878, y1 = 196, xs = 1440;
    d.rect(x0, y0, x1 - x0, y1 - y0, GROUND);
    d.lineStyle({});
    outline(d, rectC(x0, y0, x1, y1), 1.3, INK(0.55, alpha));
    d.seg([xs, y0, 0], [xs, y1, 0], 1, INK(0.45, alpha));
    fields.forEach((s, i) => {
      const y = y0 + ((y1 - y0) * (i + 1)) / fields.length;
      if (i < fields.length - 1) d.seg([xs, y, 0], [x1, y, 0], 0.8, INK(0.35, alpha));
      label(d, fonts, s, xs + 18, y - (y1 - y0) / fields.length / 2 + 6, 15, INK(0.75, alpha), { font: 'passMono', axes: { wght: 500 } });
    });
    d.flush();
    const sl = layLine(fonts, line, null, { size: 100, axes: { wdth: 112, wght: 860 }, upper: true, maxWidth: xs - x0 - 60 });
    drawLine(d, sl, x0 + 26, y0 + 98, t, { light: 'led', glass: 0.8, alpha });
    label(d, fonts, sub, x0 + 28, y1 - 18, 17, INK(0.62, alpha), { font: 'passMono', axes: { wght: 500 } });
  }

  wall(f: ShotFrame) {
    const { d, fonts } = this.ctx;
    const t = f.t;
    const line = this.score.line('Tireless and seamless');
    const view = (f.shot.params!.view as number) || 0;
    this.ctx.clear(hex('#000000'));
    // the chart draws as the line is sung: 1990 on "Tireless", 2025 by "these"
    // (the flat early years go by quickly, the world's from 2005 more slowly)
    const tw = line.words, tEnd = tw[4].start + 0.3;
    const yr = clamp(spline(t, [[tw[0].start - 0.2, 1990], [tw[0].start + 0.75, 2005], [tw[3].start, 2012.5], [tEnd, 2025]]), 1990, 2025);
    // the camera: in A it follows the drawing as it runs right; it ends with the fibre, a little
    // behind the head, where the zoom into B goes (1360, 520); B starts there 2.4 times closer,
    // follows the head to 2025, and pulls back over the whole sheet
    const P: [number, number] = [1360, 520];
    const F = this.wallS.point(2009.5);
    const m1 = 1.12;
    const C1: [number, number] = [F[0] - (P[0] - 960) / m1, F[1] - (P[1] - 540) / m1];
    // the camera looks at a point L of the sheet from distance r (1600 / r is the magnification),
    // tilted by th away from square-on, looking along the sheet in direction psi
    let Lx: number, Ly: number, m: number, th = 0;
    const psi = Math.PI - 0.36;
    if (view === 0) {
      const k = glide(f.p);
      m = lerp(1.0, m1, k);
      Lx = lerp(C1[0] - 260, C1[0], k);
      Ly = lerp(C1[1] - 20, C1[1], k);
    } else {
      // B: square-on at the zoom, then tipping down onto the sheet and running along the fibre with
      // its packets to 2025, then rising off it until the whole sheet is square-on again
      const mb = m1 * 2.4;
      const t0 = f.shot.start, tH = line.words[4].start + 0.3, t2 = f.shot.end;
      const Cb0: [number, number] = [F[0] - (P[0] - 960) / mb, F[1] - (P[1] - 540) / mb];
      const A = this.wallS.point(2013.5), H = this.wallS.point(2024.5);
      const keys = [t0, t0 + 0.6, tH, tH + 0.9, t2];
      const sp = (v: number[]) => spline(t, keys.map((k, i) => [k, v[i]] as [number, number]));
      Lx = sp([Cb0[0], A[0] - 60, H[0] - 150, H[0] - 260, 650]);
      Ly = sp([Cb0[1], A[1] + 20, H[1] + 40, H[1] + 90, 711]);
      m = Math.exp(sp([Math.log(mb), Math.log(2.6), Math.log(3.1), Math.log(1.9), Math.log(0.86)]));
      th = Math.max(0, sp([0, 0.62, 0.78, 0.35, 0]));
    }
    const r = 1600 / m;
    const cam = Camera.home();
    cam.pos = [Lx - r * Math.sin(th) * Math.cos(psi), Ly - r * Math.sin(th) * Math.sin(psi), -r * Math.cos(th)];
    cam.target = [Lx, Ly, 0];
    cam.roll = view === 0 ? 0 : 0.03 * Math.sin(th * 2);
    cam.near = 1;
    d.setCamera(cam);
    // in A, the detail bubble draws itself round the fibre before the zoom goes in; in B, the
    // fibre's own section comes up beside its end
    const bubble = view === 0 ? clamp((t - (f.shot.end - 0.75)) / 0.45) : 0;
    const inset = view === 1 ? clamp((t - (line.words[4].start - 0.2)) / 0.5) : 0;
    this.wallS.draw(d, fonts, t, yr, m, clamp((t - line.start + 0.25) / 1.1), bubble, inset);
    d.setCamera(Camera.home());
    if (view === 0) {
      const sl = { ...line, words: line.words.slice(0, 3) } as Line;
      this.titleBlock(f, sl, 'SECTION B–B · EXTERIOR WALL · SCALE 1:5', ['SHEET A-301', 'INTERNET USERS, 1990–2025', 'ITU · WORLD BANK · OWID']);
    } else {
      const sl = { ...line, words: line.words.slice(3) } as Line;
      if (inset > 0) this.wallS.crossSection(d, fonts, t, inset);
      this.titleBlock(f, sl, 'DETAIL 1 · CONDUIT AND FIBRE · SCALE 2:1', ['SHEET A-302', 'PACKETS OF LIGHT', 'WORLD 2025: 74% ONLINE']);
    }
    return { bloom: 0.32, threshold: 0.9 };
  }
}
