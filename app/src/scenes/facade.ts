// CHORUS 1, "Tamer of night". Chicago's towers spell messages in their lit windows; here a dark
// Miesian slab spells the line, a word as it is sung, each window a fluorescent tube catching
// (flicker, then on). The camera pulls back on a multiplane stand and the skyline comes out from
// behind it as a night illustration: flat blocks in two or three tones, windows as clean grids,
// Willis Tower's stepped tubes, the Hancock's X-braces, the Aon's pale slab, Marina City's
// corncobs, Trump Tower and Two Prudential; a moon, haze, aircraft lights and the masts' beacons.
import { Scene, ShotFrame } from '../engine/engine';
import { clamp, glide, lerp, mixc, withA } from '../engine/math';
import { Line, Score } from '../engine/score';
import { lamp } from '../lib/lyric';
import { L } from '../lib/palette';
import { NITE, Plane, Tone, UNDER, View, aircraft, box, boxPts, cloud, dots, grid, haze, moon, office, poly, pseg, shade, sky, stars, through, tone } from '../lib/build_style';
import { Generic, aon, far, hancock, marina, prudential, tower, trump, willis } from '../lib/build_chicago';

/** the slab that carries the words: 82 bays of 1.5 m, 56 floors of 4 m */
const COLS = 82, FLOORS = 56, BAY = 1.5, FH = 4;
const X0 = -(COLS * BAY) / 2;
const FONT = { wght: 820 }, TRACK = 0.035;

type Item = { z: number; draw: (pl: Plane, tn: Tone, t: number) => void };

/** haze at a layer's foot, thickening down into the glow below it */
function foot(d: import('../engine/draw').Draw, pl: Plane, a: number) {
  if (!pl.ok) return;
  const c = mixc(NITE.glow, NITE.haze, 0.5);
  haze(d, -8000, -170, 8000, 90, c, 0, a, pl.m);
  d.fill([boxPts(-8000, 89, 8000, UNDER + 400)], withA(c, a), pl.m);
}

export class Facade extends Scene {
  score!: Score;
  items: Item[] = [];
  async init() {
    this.score = this.ctx.data.get('score');
    const d = this.ctx.d;
    // the skyline behind the slab (x in metres, z behind it), back to front
    const g = (o: Generic, z: number): Item => ({ z, draw: (pl, tn, t) => tower(d, pl, o, tn, t) });
    this.items = [
      g({ x: -1150, w: 44, h: 200, seed: 12, crown: 'mast' }, 1150),
      g({ x: 1280, w: 50, h: 230, seed: 10, crown: 'flat' }, 1150),
      { z: 1000, draw: (pl, tn, t) => prudential(d, pl, 860, tn, t) },
      g({ x: 300, w: 36, h: 205, seed: 9, crown: 'step' }, 950),
      { z: 850, draw: (pl, tn, t) => trump(d, pl, -700, tn, t) },
      g({ x: -380, w: 38, h: 170, seed: 8, crown: 'pyramid' }, 700),
      { z: 650, draw: (pl, tn, t) => hancock(d, pl, 400, tn, t) },
      g({ x: 1010, w: 40, h: 170, seed: 13, crown: 'step' }, 620),
      { z: 520, draw: (pl, tn, t) => aon(d, pl, -40, tn, t) },
      { z: 450, draw: (pl, tn, t) => willis(d, pl, -340, tn, t) },
      g({ x: 560, w: 46, h: 160, seed: 7, crown: 'mast' }, 380),
      g({ x: 240, w: 30, h: 150, seed: 6, crown: 'drum' }, 300),
      g({ x: -560, w: 40, h: 120, seed: 3, crown: 'tank' }, 260),
      { z: 160, draw: (pl, tn, t) => marina(d, pl, -170, tn, t) },
      g({ x: 160, w: 40, h: 96, seed: 5, crown: 'tank' }, 130),
    ];
  }

  draw(f: ShotFrame) {
    const { d } = this.ctx;
    const t = f.t;
    this.ctx.clear(NITE.skyTop);
    const line = this.score.line('Tamer of night');
    // the camera: close on TAMER, then back and up until the skyline stands round the slab,
    // never at rest (it carries on past both ends of the shot)
    const g = glide(f.p);
    const v: View = {
      x: through(f.p, [0, 4, 24, 50]),
      y: through(f.p, [-176, -160, -180, -234]),
      d: Math.exp(lerp(Math.log(75), Math.log(560), g)),
      roll: through(f.p, [0.022, 0.012, -0.002, -0.012]),
    };
    const near = new Plane(v, 0);
    // the sky: deep at the top, the city's own glow low down
    sky(d, [[0, NITE.skyTop], [330, NITE.skyHigh], [640, NITE.skyMid], [860, NITE.skyLow], [1060, NITE.glow]]);
    stars(d, t, 150, 7, 720, -v.x * 0.02, -v.y * 0.02, 0.9);
    // the moon, far enough that it hardly moves
    const mx = 1585 - (v.x - 50) * 0.03, my = 228 - (v.y + 232) * 0.03;
    moon(d, mx, my, 42);
    // clouds cut from paper, lit along their tops, drifting across the moon
    const lit = mixc(NITE.moon, NITE.skyMid, 0.8), body = mixc(NITE.skyHigh, NITE.skyMid, 0.6);
    const wind = (t - 35) * 24;
    const cx = (k: number) => -(v.x - 50) * k, cy = (k: number) => -(v.y + 232) * k;
    cloud(d, mx - 150 + wind + cx(0.06), my + 84 + cy(0.06), 290, 58, 3, lit, body);
    cloud(d, 520 + wind * 0.7 + cx(0.05), 340 + cy(0.05), 360, 46, 8, mixc(lit, body, 0.4), body);
    cloud(d, 1080 + wind * 0.8 + cx(0.04), 130 + cy(0.04), 210, 36, 5, mixc(lit, body, 0.25), body);
    // an aircraft on its way down to O'Hare, crossing high up
    const ax = lerp(2050, 380, clamp((t - 34.2) / 3.0));
    aircraft(d, ax, 120 + (2050 - ax) * 0.05, t, -1, 1.1, 0.2);
    // the far city in one tone, and its haze
    const fz = new Plane(v, 2600);
    far(d, fz, -3800, 3800, mixc(NITE.front, NITE.haze, 0.55), t, 5, 150);
    foot(d, fz, 0.45);
    // the skyline, back to front, each depth a little deeper in the haze
    let group = this.items[0].z, prev = group;
    for (const it of this.items) {
      const pl = new Plane(v, it.z);
      if (!pl.ok) continue;
      if (group - it.z > 150) { foot(d, new Plane(v, prev), 0.26); group = it.z; }
      it.draw(pl, tone(clamp((it.z - 120) / 1400)), t);
      prev = it.z;
    }
    foot(d, new Plane(v, prev), 0.3);
    // the slab and its words
    this.slab(near, t, line);
    foot(d, near, 0.3);
    d.lineStyle({});
    return { bloom: 0.42, threshold: 0.85, knee: 0.5 };
  }

  /** the dark slab and the line in its windows */
  slab(pl: Plane, t: number, line: Line) {
    const { d, fonts } = this.ctx;
    const tn = tone(0);
    const W = COLS * BAY, top = -FLOORS * FH;
    const face = mixc(tn.front, tn.side, 0.35);
    // the shaded flank, the face
    poly(d, pl, boxPts(X0 + W, top, X0 + W + 16, UNDER), tn.side);
    box(d, pl, X0, top - 3, X0 + W, UNDER, shade(face, top, 0, 0.12, 0.15));
    // the words, as windows: TAMER on one line, OF NIGHT under it
    const lit = new Map<number, [number, number]>();
    const set = (txt: string, wi: number, ox: number, topFloor: number) => {
      const m = dots(fonts, txt, 11, 'pass', FONT, TRACK);
      for (const [cx, ry] of m.dots) {
        const c = ox + cx, r = topFloor - ry;
        if (c < 0 || c >= COLS || r < 0 || r >= FLOORS) continue;
        lit.set(r * COLS + c, [wi, cx / Math.max(1, m.width)]);
      }
    };
    const wT = dots(fonts, 'TAMER', 11, 'pass', FONT, TRACK).width;
    set('TAMER', 0, Math.floor((COLS - wT) / 2), 48);
    const wO = dots(fonts, 'OF', 11, 'pass', FONT, TRACK).width, wN = dots(fonts, 'NIGHT', 11, 'pass', FONT, TRACK).width;
    const ox = Math.floor((COLS - (wO + 6 + wN)) / 2);
    set('OF', 1, ox, 34);
    set('NIGHT', 2, ox + wO + 6, 34);
    d.lineStyle({ square: true, blend: 'alpha' });
    const glass = mixc(tn.glass, tn.side, 0.45);
    grid(d, pl, {
      x0: X0, x1: X0 + W, yb: 0, r0: -Math.ceil(UNDER / FH), cols: COLS, rows: FLOORS - 2, fh: FH, gw: 0.82, gh: 0.7,
      at: (c, r) => {
        const k = lit.get(r * COLS + c);
        if (k) {
          const w = line.words[k[0]];
          const dt = t - (w.start + k[1] * Math.min(0.3, w.end - w.start));
          return dt < 0 ? glass : lamp('fluoro', dt, 1.05);
        }
        if (r === 0) return withA(L('filament', 0.9), 1);
        // the message's floors are kept dark round it
        if (r >= 22 && r <= 50) return glass;
        return office(91, c, r, t, 0.05, 0.9) ?? glass;
      },
    });
    // the mullions, Mies's I-beams, run the whole height
    const mull = mixc(tn.edge, face, 0.45);
    for (let c = 0; c <= COLS; c++) {
      const x = X0 + c * BAY;
      pseg(d, pl, x, UNDER, x, top + 2 * FH, c === 0 ? 0.55 : 0.16, c === 0 ? tn.edge : mull);
    }
    // the plant floors at the top, louvred, and the parapet's edge
    for (let k = 0; k < 6; k++) {
      const y = top + 2 * FH - (k + 0.5) * ((2 * FH) / 6);
      pseg(d, pl, X0 + 0.4, y, X0 + W - 0.4, y, 0.55, tn.side);
    }
    pseg(d, pl, X0, top - 3, X0 + W, top - 3, 0.9, tn.edge);
    d.flush();
  }
}
