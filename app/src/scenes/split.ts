// VERSE 3, "Split the world open / Delve ever deeper in my alchemic arts".
// The street plan seen from above cracks along Madison Street, the zero line of the address grid,
// and its halves are thrown apart as slabs with a thickness (fracture motion: rigid, sudden, then
// inertia): their cut faces are sections of the ground in light, rubble falls, and far down a seam
// of light. The camera tips over the chasm and goes down into it. Down in the opening, the camera
// dives along a logarithmic axis, one order of magnitude after another (exponential dive: each
// decade passes in the same time), past the transistors on one chip: 2,308 in 1971, 58 billion in
// 2021. Sand made to think: the alchemy.
import { Camera } from '../engine/camera';
import { Scene, ShotFrame, timeOf } from '../engine/engine';
import { V3, chain, clamp, ease, hex, lerp, prog, spring, translate, withA, rotZ, rotX, scale, mixc, mulberry32, hash1, noise1, mulc } from '../engine/math';
import { Score } from '../engine/score';
import { loadCity } from '../lib/city';
import { drawLine, label, layLine } from '../lib/lyric';
import { L, NIGHT } from '../lib/palette';
import { stream } from '../lib/backdrop';
import { Rift, track } from '../lib/alchemy_rift';
import { Lattice, drawDie } from '../lib/alchemy_chip';

const smoothstepJS = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// the plan: px per metre, and State & Madison where the shot before leaves it on screen
const S = 0.075, OX = 839.6, OY = 383.7;

type Chunk = { x: number; side: 0 | 1; t0: number; size: number; spin: [number, number]; drift: number; pts: number[] };
type Grit = { x: number; side: 0 | 1; t0: number; r: number; drift: number };
type Ember = { x: number; y: number; t0: number; life: number; sp: number; r: number };
type Glint = { x: number; y: number; len: number; ph: number; rate: number; side: 0 | 1 };

export class Split extends Scene {
  score!: Score;
  rift!: Rift;
  tr!: [number[], number[]];
  chunks: Chunk[] = [];
  grit: Grit[] = [];
  embers: Ember[] = [];
  lattice: Lattice | null = null;
  glints: Glint[] = [];
  async init() {
    this.score = this.ctx.data.get('score');
    const city = await loadCity(this.ctx);
    this.rift = new Rift(this.ctx.d, city, { S, ox: OX, oy: OY, x0: -2600, x1: 4400, step: 22, H: 900, seed: 71 });
    this.tr = this.ctx.data.get('charts').transistors.series.World;
    // rubble: chunks and grit that break from the cut edges as the slabs part
    const rnd = mulberry32(5);
    const open = this.score.line('Split the world').words[3].start;
    for (let i = 0; i < 150; i++) {
      const n = 4 + Math.floor(rnd() * 3), size = 5 + 22 * rnd() * rnd();
      const pts: number[] = [];
      for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2 + rnd() * 0.6; const r = 0.6 + 0.4 * rnd(); pts.push(Math.cos(a) * r, Math.sin(a) * r); }
      this.chunks.push({ x: lerp(-500, 2500, rnd()), side: rnd() < 0.5 ? 0 : 1, t0: open + 0.03 + 0.9 * rnd() * rnd(), size, spin: [(rnd() - 0.5) * 9, (rnd() - 0.5) * 7], drift: 20 + 60 * rnd(), pts });
    }
    for (let i = 0; i < 420; i++) this.grit.push({ x: lerp(-700, 2700, rnd()), side: rnd() < 0.5 ? 0 : 1, t0: open + 0.02 + 1.4 * rnd() * rnd(), r: 0.7 + 1.3 * rnd(), drift: 10 + 50 * rnd() });
    // glints on the lake: the city's light and the chasm's on the water east of the shore
    for (let i = 0; i < 900; i++) {
      const y = this.rift.cy + (rnd() - 0.5) * 2400;
      const x = this.rift.shoreX(y) + 14 + Math.pow(rnd(), 1.6) * 1500;
      this.glints.push({ x, y, len: 3 + 12 * rnd() * rnd(), ph: rnd() * 6.283, rate: 1 + 3 * rnd(), side: this.rift.side(x, y) > 0 ? 0 : 1 });
    }
    for (let i = 0; i < 260; i++) this.embers.push({ x: lerp(-700, 2700, rnd()), y: rnd() - 0.5, t0: open + 0.1 + 1.6 * rnd(), life: 0.7 + 1.2 * rnd(), sp: 240 + 520 * rnd(), r: 0.8 + 1.6 * rnd() });
  }

  draw(f: ShotFrame) {
    return f.shot.params!.part === 'split' ? this.split(f) : this.dive(f);
  }

  // ------------------------------------------------------------------------------------- split
  split(f: ShotFrame) {
    const { d, fonts } = this.ctx;
    const t = f.t;
    const R = this.rift;
    const line = this.score.line('Split the world');
    const [wSplit, , wWorld, wOpen] = line.words;
    const bg = hex('#020307');
    this.ctx.clear(bg);

    // the fracture: the crack runs across on "Split", jolts on "world", is thrown open on "open",
    // and the slabs keep drifting apart after (inertia: nothing stops)
    const run = ease.outCubic(prog(t, wSplit.start - 0.03, wSplit.start + 0.36));
    const open = Math.max(0, spring(t - wOpen.start + 0.02, 1.2, 0.62));
    const gapAt = (tt: number) => {
      const o = Math.max(0, spring(tt - wOpen.start + 0.02, 1.2, 0.62));
      const j = 2.5 * prog(tt, wSplit.start + 0.25, wSplit.start + 0.4) + 7 * Math.max(0, spring(tt - wWorld.start, 4, 0.5));
      return j * (1 - Math.min(1, o * 3)) + 330 * o + 40 * Math.max(0, tt - wOpen.start);
    };
    const gap = gapAt(t);
    const sag = 0.03 * open + 0.008 * Math.max(0, t - wOpen.start);
    const yaw = 0.018 * open;
    const pivot = 900;
    const M = [R.model(0, gap, sag, yaw, pivot), R.model(1, gap, sag, yaw, pivot)];
    // the light that comes up out of the chasm
    const light = clamp(gap / 60) * (0.75 + 0.25 * Math.sin(t * 11) * Math.sin(t * 7.3));

    // camera: at first exactly where the shot before leaves the plan (straight down, a little roll,
    // still backing away); with the crack it slides west over the city and tips to look north
    // across the opening, then comes over the chasm and goes down into it toward the seam
    // (keys: position, target, roll)
    const k = track(t, [
      [158.86, [961, 540, -1552, 960, 540, 0, 0.047]],
      [159.06, [961, 540, -1567, 960, 540, 0, 0.047]],
      [159.5, [780, 540, -1500, 780, 455, 0, 0.02]],
      [wOpen.start, [650, 820, -1240, 650, 420, 40, -0.04]],
      [160.35, [580, 1010, -800, 580, 392, 380, -0.12]],
      [160.8, [500, 470, -900, 500, 384, 900, -0.2]],
      [161.35, [480, 400, -220, 480, 384, 940, -0.27]],
    ]);
    const cam = new Camera();
    cam.pos = [k[0], k[1], k[2]];
    cam.target = [k[3], k[4], k[5]];
    cam.roll = k[6];
    cam.near = 2;
    // a jolt of the ground on the crack and on the opening
    const shake = (t0: number, a: number) => (t > t0 ? a * Math.exp(-(t - t0) / 0.22) : 0);
    const sh = shake(wSplit.start, 5) + shake(wOpen.start, 9);
    cam.shift = [sh * noise1(t * 37), sh * noise1(t * 41 + 9)];
    d.setCamera(cam);
    d.depth(true);

    const glow = L('filament', 1.0);
    const rim = L('sodium', 0.9);
    // the cut faces, then everything else tested against them
    if (gap > 0.4) for (const s of [0, 1] as const) R.drawWall(M[s], s, { light, time: t, cam: cam.pos, glow, rim });

    // the floor far down: a river of light along the seam
    if (gap > 0.4) R.drawFloor(R.H + 40, { gap: gap + 60, light, time: t, hot: L('halide', 1.6), warm: L('filament', 1.4), deep: L('filamentLow', 0.5) });

    // rubble falling into the chasm: dark chunks lit from under, grit, and pieces of street
    if (gap > 2) this.rubble(t, gap, gapAt, light);

    // the slabs' tops: the night ground, hiding what is below them
    for (const s of [0, 1] as const) d.fill([R.top[s]], withA(bg, 1), M[s], 'alpha');
    // the chasm's light spilling onto the ground along its edges
    if (gap > 2) {
      for (const s of [0, 1] as const) {
        const sg = s === 0 ? -1 : 1;
        const e = R.edge(-1200, 3400);
        const poly: number[] = [];
        for (let i = 0; i < e.length; i += 2) poly.push(e[i], e[i + 1]);
        poly.push(3400, R.cy + sg * 260, -1200, R.cy + sg * 260);
        d.fill([poly], { c0: withA(mulc(L('filament', 1), 0.16 * light), 1), c1: [0, 0, 0, 0], from: [0, R.cy], to: [0, R.cy + sg * 240] }, chain(M[s], translate(0, 0, -0.3)), 'add');
      }
    }

    // the streets: at first the quiet lines of the shot before; the crack's light runs out along
    // them from the cut, and the lamps near it come on
    const quiet = mixc(hex('#3a4f86'), L('sodium', 0.4), 0.35);
    const reach = -270 + 600 * ease.outCubic(prog(t, wSplit.start + 0.12, wOpen.end + 0.4));
    for (const s of [0, 1] as const) {
      const lift = chain(translate(0, 0, -0.6), M[s]);
      d.lines(R.halves[s], { model: lift, color: withA(quiet, 1.1), wScale: 1 });
      d.lines(R.halves[s], { model: lift, color: L('sodium', 0.75), wScale: 1.05, reveal: reach, soft: 260, pulseAt: lerp(R.x0, 2400, run), pulseWidth: 160, pulseGain: 2.5 * (1 - prog(t, wSplit.start + 0.3, wSplit.start + 0.6)) });
      d.lines(R.water[s], { model: lift, color: withA(hex('#5a7fd0', 0.7), 1), wScale: 1 });
      d.dots(R.lamps[s], { model: lift, reveal: reach * 0.7, soft: 200, color: L('sodium', 1.25), rScale: 1.0, flicker: 0.2, time: t });
    }

    // the lake: glints of the city's light near the shore, and of the chasm's along the crack
    // before it opens, the running crack's own white light catches the water near it
    const crackOn = (1 - prog(t, wOpen.start, wOpen.start + 0.3)) * prog(t, wSplit.start, wSplit.start + 0.15);
    this.lake(t, M, Math.max(light, 0.8 * crackOn), lerp(R.x0 + 1400, 3300, run));

    // the cut edges: white-hot as they break, cooling to the streets' amber
    if (gap > 0.4) {
      const e = R.edge(-1200, 3400);
      const hotC = mixc(L('halide', 2.2), L('sodium', 1.1), prog(t, wOpen.start, wOpen.start + 0.8));
      for (const s of [0, 1] as const) {
        d.setModel(chain(translate(0, 0, -0.8), M[s]));
        d.lineStyle({ glow: 3 });
        d.poly(e, 1.6, hotC, { dim: 2 });
        d.flush();
      }
      d.setModel(null);
      d.lineStyle({});
    }

    // sparks and embers rising out of the opening
    if (gap > 2) this.sparks(t, gap, light);
    // warm air and dust rising out of the opening, lit from below
    if (gap > 2) this.haze(t, gap, light);

    // before the opening: the crack running across, white-hot, its head throwing sparks
    if (open < 0.05 && t > wSplit.start - 0.05) {
      const xf = lerp(R.x0 + 1400, 3300, run);
      const e = R.edge(R.x0 + 1400, xf);
      const pts: number[] = [];
      for (let i = 0; i < e.length; i += 2) pts.push(e[i], e[i + 1], -1);
      const fade = 1 - prog(t, wOpen.start - 0.05, wOpen.start + 0.05);
      d.setModel(null);
      d.lineStyle({ glow: 4 });
      d.poly(pts, 2.2, withA(L('halide', 2.4), fade));
      d.flush();
      d.lineStyle({});
      if (run < 1) {
        d.dotStyle({ blend: 'add' });
        const hy = R.crackY(xf);
        for (let i = 0; i < 24; i++) {
          const a = hash1(i * 3.1 + Math.floor(t * 60)) * Math.PI * 2, r = 4 + 26 * hash1(i * 7.7 + Math.floor(t * 60));
          d.dot([xf - 8 - r * 0.6 + Math.cos(a) * r, hy + Math.sin(a) * r, -2], 1.3, L('halide', 1.6), 0.5);
        }
        d.dot([xf, hy, -2], 10, L('halide', 0.9), 1);
        d.flush();
      }
    }

    // SPLIT THE on the north slab, WORLD OPEN on the south: painted on the ground, carried apart
    const sl = layLine(fonts, line, null, { size: 118, axes: { wdth: 115, wght: 880 }, upper: true });
    const a = { ...sl, words: sl.words.slice(0, 2) };
    const b = { ...sl, words: sl.words.slice(2).map((w, i, arr) => ({ ...w, x: w.x - arr[0].x })) };
    // as the camera comes down over them they fade, so no letter passes the lens
    const near = (x: number, y: number) => clamp((Math.hypot(cam.pos[0] - x, cam.pos[1] - y, cam.pos[2]) - 420) / 520);
    const ya = R.cy - 62, yb = R.cy + 52 + 90, xb = 230;
    drawLine(d, a, 90, ya, t, { light: 'led', glass: 0.8, base: chain(M[0], translate(0, 0, -1.5)), alpha: near(90 + a.width * 0.3, ya - 45 - gap / 2) });
    drawLine(d, b, xb, yb, t, { light: 'led', glass: 0.8, base: chain(M[1], translate(0, 0, -1.5)), alpha: near(xb + (sl.width - sl.words[2].x) * 0.5, yb - 45 + gap / 2) });
    d.depth(false);
    return { bloom: 0.34, threshold: 0.9 };
  }

  /** rubble breaking from the edges as they part: chunks tumbling, grit, and bits of street */
  private rubble(t: number, gap: number, gapAt: (t: number) => number, light: number) {
    const { d } = this.ctx;
    const R = this.rift;
    const G = 1500; // px/s/s
    const edgeAt = (x: number, side: 0 | 1, t0: number): V3 => {
      const g = gapAt(t0);
      return [x, R.crackY(x) + (side === 0 ? -g / 2 : g / 2), 0];
    };
    const lit = (z: number) => Math.exp(-(R.H - z) / 260) * 2.2 + 0.25;
    d.setModel(null);
    for (const c of this.chunks) {
      const a = t - c.t0;
      if (a <= 0) continue;
      const p0 = edgeAt(c.x, c.side, c.t0);
      const v = (gapAt(c.t0 + 0.02) - gapAt(c.t0)) / 0.02 / 2;   // the slab's speed when it let go
      const dir = c.side === 0 ? -1 : 1;
      const z = 0.5 * G * a * a + 30 * a;
      if (z > R.H - 10) continue;
      const pos: V3 = [p0[0], p0[1] + dir * v * a * 0.6 - dir * c.drift * a, z];
      const m = chain(translate(pos[0], pos[1], pos[2]), rotZ(c.spin[0] * a), rotX(c.spin[1] * a), scale(c.size, c.size, 1));
      // dark rock, the side toward the seam catching its light
      const lc = withA(mulc(L('filament', 1), 0.15 + 0.55 * lit(z) * light), 1);
      d.fill([c.pts], { c0: hex('#060508'), c1: lc, from: [0, -0.2], to: [0, 1.1] }, m, 'alpha');
    }
    d.lineStyle({});
    // grit: points of light where they catch the glow
    d.dotStyle({ blend: 'add' });
    for (const g of this.grit) {
      const a = t - g.t0;
      if (a <= 0) continue;
      const p0 = edgeAt(g.x, g.side, g.t0);
      const dir = g.side === 0 ? -1 : 1;
      const z = 0.5 * G * a * a + 60 * a;
      if (z > R.H - 6) continue;
      d.dot([p0[0], p0[1] - dir * g.drift * a, z], g.r, withA(L('filament', 0.2 + 0.45 * lit(z) * light), 1), 0.4);
    }
    d.flush();
    // pieces of the streets that ran across the crack
    d.lineStyle({ glow: 1.5 });
    R.loose.forEach((s, i) => {
      if (i % 5) return;
      const t0 = this.score.line('Split the world').words[3].start + 0.05 + 0.5 * hash1(i * 1.7);
      const a = t - t0;
      if (a <= 0) return;
      const side = s[4] as 0 | 1, dir = side === 0 ? -1 : 1;
      const g = gapAt(t0);
      const z = 0.5 * G * a * a;
      if (z > R.H - 10) return;
      const mx = (s[0] + s[2]) / 2, my = (s[1] + s[3]) / 2 + dir * g / 2;
      const m = chain(translate(mx, my - dir * 30 * a, z), rotZ((hash1(i) - 0.5) * 6 * a), rotX((hash1(i + 9) - 0.5) * 8 * a));
      d.setModel(m);
      d.seg([s[0] - (s[0] + s[2]) / 2, s[1] - (s[1] + s[3]) / 2, 0], [s[2] - (s[0] + s[2]) / 2, s[3] - (s[1] + s[3]) / 2, 0], s[5] * 0.8, L('sodium', 0.9 * (1 - z / R.H)));
    });
    d.flush();
    d.setModel(null);
    d.lineStyle({});
  }

  /** glints on the water, drifting and twinkling, each lit by what is nearest: the shore or the crack */
  private lake(t: number, M: Float32Array[], light: number, head: number) {
    const { d } = this.ctx;
    const R = this.rift;
    const cityC = L('sodium', 1), seamC = L('filament', 1);
    for (const s of [0, 1] as const) {
      d.setModel(chain(M[s], translate(0, 0, -0.4)));
      d.lineStyle({ blend: 'add' });
      for (const g of this.glints) {
        if (g.side !== s) continue;
        const shore = R.shoreX(g.y);
        const off = g.x - shore;
        const nearShore = Math.exp(-off / 260);
        const dc = Math.abs(R.side(g.x, g.y));
        const nearCrack = Math.exp(-dc / 200) * light * (g.x < head ? 1 : 0);
        const tw = Math.pow(0.5 + 0.5 * Math.sin(t * g.rate + g.ph), 3);
        const a = tw * (0.08 + 0.4 * nearShore + 1.1 * nearCrack);
        if (a < 0.01) continue;
        const x = g.x + 6 * Math.sin(t * 0.4 + g.ph);
        d.seg([x - g.len / 2, g.y, 0], [x + g.len / 2, g.y, 0], 1.1, withA(mixc(cityC, seamC, clamp(nearCrack * 2)), a));
      }
      d.flush();
      d.lineStyle({});
      d.setModel(null);
    }
  }

  /** dust and warm air rising out of the chasm: soft lights that grow and thin as they rise */
  private haze(t: number, gap: number, light: number) {
    const { d } = this.ctx;
    const R = this.rift;
    const open = this.score.line('Split the world').words[3].start;
    d.dotStyle({ world: true, blend: 'add' });
    for (let i = 0; i < 70; i++) {
      const life = 1.6 + 1.2 * hash1(i * 3.3);
      const t0 = open + (hash1(i * 7.1) - 0.3) * life;
      const ph = (t - t0) / life;
      if (ph <= 0) continue;
      const u = ph - Math.floor(ph);
      if (t - open < u * life) continue;
      const x = lerp(-600, 2600, hash1(i * 1.9)) + 40 * Math.sin(t * 0.7 + i);
      const y = R.crackY(x) + (hash1(i * 5.3) - 0.5) * gap * 0.45;
      const z = R.H * (1 - u) - 120 * u * u;
      const r = 40 + 120 * u;
      const a = Math.sin(u * Math.PI) * (0.035 + 0.035 * hash1(i)) * light;
      d.dot([x, y, z], r, withA(mixc(L('filamentLow', 1), L('filament', 1), u), a), 1);
    }
    d.flush();
    d.dotStyle({});
  }

  /** sparks thrown up out of the chasm, and embers rising from the seam on its warm air */
  private sparks(t: number, gap: number, light: number) {
    const { d } = this.ctx;
    const R = this.rift;
    d.dotStyle({ blend: 'add' });
    for (const e of this.embers) {
      const a = t - e.t0;
      if (a <= 0 || a > e.life) continue;
      const z = R.H - e.sp * a * (1 + a);
      const x = e.x + 18 * Math.sin(a * 3 + e.x);
      const y = R.crackY(e.x) + e.y * gap * 0.8 + 10 * Math.sin(a * 2.3 + e.t0 * 7);
      const fade = Math.sin((a / e.life) * Math.PI);
      d.dot([x, y, z], e.r, withA(mixc(L('filamentLow', 1.6), L('filament', 2.0), hash1(e.x)), fade * light), 0.5);
    }
    d.flush();
  }

  // -------------------------------------------------------------------------------------- dive
  /** the dive's clock: the camera's depth in decades (10^e transistors), one decade a beat, the
   *  die of 10^3 passed on the first beat after "Delve" */
  diveE(t: number): number {
    const sc = this.score;
    const line = sc.line('Delve ever deeper');
    const t3 = sc.beatTime(Math.ceil(sc.beatAt(line.start)));
    return 3 + (t - t3) / (60 / sc.audio.bpm);
  }

  dive(f: ShotFrame) {
    const { d, fonts } = this.ctx;
    const t = f.t;
    const sc = this.score;
    const line = sc.line('Delve ever deeper');
    this.ctx.clear(hex('#030208'));
    const DZ = 1400, RD = 520, CX = 960, CY = 540;
    const e = this.diveE(t);
    const zc = (e - 3) * DZ;
    const cam = new Camera();
    const sway = 1 - clamp((e - 10.8) / 1.5);
    cam.pos = [CX + 46 * Math.sin(t * 1.1) * sway, CY + 34 * Math.cos(t * 0.9) * sway, zc];
    cam.target = [CX, CY, zc + 1000];
    cam.roll = 0.36 * t + 0.35 * Math.sin(t * 0.7);
    cam.near = 2;
    cam.far = 60000;
    d.setCamera(cam);

    // the crystal below the last chip: silicon, the sand the chips are made of
    const zl = (11 - 3) * DZ;
    if (e > 9.4) {
      if (!this.lattice) this.lattice = new Lattice(CX, CY, zl - 300, zl + 5600, 360, 4);
      const la = clamp((e - 9.5) / 0.8);
      this.lattice.draw(d, cam, { from: zc, to: zc + 3200, atom: L('halide', 0.75), bond: withA(hex('#8fa8ff', 0.3), 1), r: 10, alpha: la, fog: [700, 2600], pulse: 1.2, time: t,
        speed: DZ / (60 / sc.audio.bpm), roll: 0.36 + 0.35 * 0.7 * Math.cos(t * 0.7) });
      // a few of its atoms named, upright as they pass: silicon
      const A = this.lattice.atoms;
      for (let i = 0; i < A.length; i += 3) {
        if (hash1(i * 0.731 + 0.3) > 0.022) continue;
        const z = A[i + 2], D = z - zc;
        if (D < 260 || D > 1800) continue;
        const x = A[i], y = A[i + 1];
        if (Math.hypot(x - cam.pos[0], y - cam.pos[1]) > 0.5 * D) continue;
        // kept to the middle of the frame, clear of the words, and only while it moves slowly enough
        // across the screen to stay one label in a blurred frame
        const [sx, sy] = cam.project([x, y, z]);
        if (sx < 260 || sx > 1660 || sy < 240 || sy > 860) continue;
        const v = d.focal() * Math.hypot(x - cam.pos[0], y - cam.pos[1]) * (DZ / (60 / sc.audio.bpm)) / (D * D);
        const a = la * smoothstepJS(260, 640, D) * (1 - smoothstepJS(1200, 1800, D)) * clamp(1.5 - (v / 120) / 6);
        if (a <= 0.01) continue;
        label(d, fonts, 'Si', 9, -9, 15, withA(L('filament', 1.3), a), { font: 'passMono', axes: { wght: 700 }, base: chain(translate(x, y, z), rotZ(cam.roll)), blend: 'add' });
      }
    }

    // the layers, farthest first, each hiding what lies beyond it: the dies, a decade deeper each
    // and finer each; between them the chips of that decade, each at its own depth, its year
    // passing like a milepost
    const [ys, vs] = this.tr;
    const Z = (v: number) => (Math.log10(v) - 3) * DZ;
    // the count is read at the frame's own time, so it never shows two numbers at once
    const zcF = (this.diveE(timeOf(f.frame)) - 3) * DZ;
    let last = -1;
    for (let i = 0; i < ys.length; i++) if (Z(vs[i]) <= zcF) last = i;
    const items: { z: number; draw: () => void }[] = [];
    for (let k = 10; k >= 3; k--) {
      const z = (k - 3) * DZ;
      const D = z - zc;
      if (D < 30 || D > 5200) continue;
      const a = smoothstepJS(0.2 * DZ, 0.62 * DZ, D) * Math.min(1, Math.exp(-(D / DZ - 0.95) * 2.4));
      if (a <= 0.003) continue;
      items.push({ z, draw: () => {
        // vias rising from this die to the one above: lines of light up the shaft
        const ang = k * 0.37;
        if (k > 3) {
          d.lineStyle({ blend: 'add', fog: [1800, 4200, 0] });
          for (let i = 0; i < 16; i++) {
            const th = ang + (i / 16) * Math.PI * 2 + 0.2;
            const r = RD * (i % 2 ? 0.98 : 0.7);
            const x = CX + Math.cos(th) * r, y = CY + Math.sin(th) * r;
            d.seg([x, y, z - DZ], [x, y, z], 1.3, withA(L('filament', 0.3), 1), 1.3, withA(L('filament', 0.8), 1));
          }
          d.flush();
          d.lineStyle({});
        }
        drawDie(d, { cx: CX, cy: CY, z, R: RD, ang, e: k, seed: k * 1.618, alpha: a, time: t });
        // the die's marking: its decade, in its corner
        const base = chain(translate(CX, CY, z - 0.5), rotZ(ang));
        const sup = '⁰¹²³⁴⁵⁶⁷⁸⁹';
        const txt = '10' + String(k).split('').map((c) => sup[+c]).join('');
        label(d, fonts, txt, -RD * 0.93, -RD * 0.95 + 6, 34, withA(L('filament', 1.1), a), { font: 'pass', axes: { wght: 700 }, base, blend: 'add' });
      } });
    }
    for (let i = 0; i < ys.length; i++) {
      const z = Z(vs[i]);
      const D = z - zc;
      if (D < 40 || D > 4200) continue;
      const th = -Math.PI / 2 + (ys[i] - 1971) * 0.45;
      const x = CX + Math.cos(th) * RD * 1.32, y = CY + Math.sin(th) * RD * 1.32;
      const a = smoothstepJS(40, 400, D) * (1 - smoothstepJS(2600, 4200, D));
      items.push({ z: z + 0.1, draw: () => {
        d.dotStyle({ blend: 'add' });
        d.dot([x, y, z], 4, withA(L('filament', 2.2), a), 0.5);
        d.flush();
        // held upright on the screen however the camera turns
        label(d, fonts, String(ys[i]), 14, 8, 30, withA(L('filament', 1.0), a), { font: 'passMono', axes: { wght: 600 }, base: chain(translate(x, y, z), rotZ(cam.roll)), blend: 'add' });
      } });
    }
    items.sort((p, q) => q.z - p.z).forEach((it) => it.draw());

    // what streams past the fall
    stream(d, t, zc + 900, DZ / (60 / sc.audio.bpm), { n: 380, color: hex('#ffcf9a', 1.1), r0: 300, r1: 1500 });

    // the count of the last chip passed, and its year, over a shade that keeps them readable
    d.setCamera(Camera.home());
    d.rect(0, 900, 1920, 180, { c0: [0, 0, 0, 0], c1: [0.004, 0.003, 0.008, 0.82], from: [0, 900], to: [0, 1000] });
    d.rect(0, 0, 1920, 210, { c0: [0.004, 0.003, 0.008, 0.6], c1: [0, 0, 0, 0], from: [0, 90], to: [0, 210] });
    if (last >= 0) {
      const v = Math.round(vs[last]);
      const fresh = clamp((zcF - Z(vs[last])) / 200);
      const big = v.toLocaleString('en-US');
      label(d, fonts, big, 960, 1002, 64, mixc(L('halide', 1.8), L('filament', 1.15), fresh), { font: 'passMono', axes: { wght: 700 }, align: 'center' });
      label(d, fonts, `TRANSISTORS ON ONE CHIP · ${ys[last]}`, 960, 1040, 19, L('filament', 0.9), { font: 'passMono', axes: { wght: 500 }, align: 'center' });
    }
    label(d, fonts, 'Transistors per microprocessor. Data: Karl Rupp (2022), via Our World in Data', 960, 1068, 13, NIGHT.noteDim, { align: 'center' });
    const sl = layLine(fonts, line, null, { size: 92, axes: { wdth: 112, wght: 840 }, upper: true, maxWidth: 1720 });
    drawLine(d, sl, 960 - sl.width / 2, 140, t, { light: 'filament', glass: 0.75 });
    return { bloom: 0.34, threshold: 0.9 };
  }
}
