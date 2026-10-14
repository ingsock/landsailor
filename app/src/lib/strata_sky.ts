// The bed and the nails (scenes/outro1.ts) are one place on one clock: the block of strata over a
// sea of cloud at the first light, then the city taken apart on top of it. Their shots share this
// camera, sky and data, so the dissolve between them is the block itself coming apart.
import { Camera } from '../engine/camera';
import { Draw } from '../engine/draw';
import { RGBA, clamp, glide, hex, lerp, mixc, mulberry32, withA } from '../engine/math';
import { Score } from '../engine/score';
import { at } from './chart';
import { AirOpts, RelightAir } from './relight_city';

/** px of the block per billion tonnes (1 px = 4.2 Gt), and the block's width and depth (px) */
export const BED_PX = 0.24;
export const BED_W = 1320;
export const BED_D = 800;
/** the nails: the piece of the city taken apart, metres east and south of State & Madison (on the
 *  bed's block at 0.1 px a metre) */
export const NAIL_BOX: [number, number, number, number] = [-9900, -4000, 3300, 4000];

export type Bed = { dec: number; years: string; gt: number; h0: number; h1: number; land: number; col: RGBA };

/** the beds of the strata, a decade each: its years, what it emitted (Gt, from the cumulative
 *  series), where it lies in the stack (px up), when it lands (on the sung line), and its stone */
export function layBeds(sc: Score, co2cum: [number[], number[]]): { beds: Bed[]; top: number; total: number } {
  const cum = (y: number) => (y < co2cum[0][0] ? 0 : at(co2cum, Math.min(y, 2024)) ?? 0);
  const call = sc.line('In the bed');
  const echo = sc.lines.find((l) => l.echo && l.text.startsWith('In the bed'))!;
  // a ramp of stone by decade: the pale sandstone of the first coal, through ochre and rust, to the
  // near black of the last decades
  const stone = ['#e0cfa9', '#d2b182', '#c3955e', '#ad7845', '#975d36', '#7f4a2d', '#683b27', '#552f22', '#43261d'].map((c) => hex(c));
  const beds: Bed[] = [];
  let h = 0;
  for (let dec = 1750; dec <= 2020; dec += 10) {
    // the decade's emissions: the cumulative total at its last year less that at the year before it
    const gt = cum(Math.min(dec + 9, 2024)) - cum(dec - 1);
    const f = ((dec - 1750) / 270) * (stone.length - 1), i = Math.min(stone.length - 2, Math.floor(f));
    beds.push({ dec, years: dec === 2020 ? '2020–24' : `${dec}s`, gt, h0: h, h1: h + gt * BED_PX, land: 0, col: mixc(stone[i], stone[i + 1], f - i) });
    h += gt * BED_PX;
  }
  // when each lands: from the 1950s on, a bed each half beat, the last on the beat of the echo's
  // "made"; the thin beds before them in a quick fall as the line begins, faster as they thin
  const hb = 30 / sc.audio.bpm;
  const last = sc.beatTime(Math.round(sc.beatAt(echo.end - 0.3)));
  const N = beds.length, heavy = beds.findIndex((b) => b.dec === 1950);
  const first = last - (N - 1 - heavy) * hb;
  const before = beds[heavy].h0 / BED_PX;
  beds.forEach((b, i) => {
    b.land = i >= heavy ? last - (N - 1 - i) * hb : lerp(Math.min(first - 0.55, call.start - 0.25), first - 0.07, Math.pow(b.h0 / BED_PX / before, 0.5));
  });
  return { beds, top: h, total: cum(2024) };
}

/** the heat of each bed at t: it lands hot and cools; the last decades keep some of it */
export function bedHeat(beds: Bed[], t: number): number[] {
  const N = beds.length;
  return beds.map((b, i) => (t < b.land ? 0.8 : Math.max(0.6 * Math.pow(i / (N - 1), 9), 0.95 * Math.exp(-(t - b.land) / 0.45))));
}

/** progress over both shots, beyond 0..1 in their joins */
export function bnU(sc: Score, t: number): number {
  const a = sc.line('In the bed').start, b = sc.line('Great lifebringer').start;
  return (t - a) / (b - a);
}

/** the sky goes on paling from where the road left it (0.38) to where life begins (0.62) */
export function bnDawn(sc: Score, t: number): number { return 0.38 + 0.24 * clamp(bnU(sc, t), -0.1, 1.1); }

/** the camera rounds the block from the side of the dawn and rises as the city comes apart; it never
 *  rests, and carries on through both joins */
export function bnCam(sc: Score, bedTop: number, t: number, jolt = 0): Camera {
  const g = glide(bnU(sc, t), 0.25);
  // low enough over the bed to see the dawn over the cloud, then up as the plates rise
  const gp = Math.max(0, g);
  const rise = Math.max(0, g - 0.36) / 0.64;
  const ty = -200 - (bedTop + 120) * Math.pow(Math.min(rise, 1.25), 1.3);
  const pitch = 0.12 + 0.1 * g + 0.2 * gp * gp;
  const cam = Camera.orbit([lerp(-30, 40, g), ty + jolt, lerp(-20, 30, g)], lerp(2150, 2850, g), lerp(-0.55, 0.32, g), pitch, 0, 0.78);
  cam.near = 10; cam.far = 60000;
  return cam;
}

/** the dawn sky (the colours of outro1's drawDawn), and far below the block a sea of cloud drifting,
 *  its tops catching the first light in the east: the relit city's cloud deck, seen from above */
export function bnSky(air: RelightAir, cam: Camera, t: number, dawn: number) {
  const c = cam.clone();
  // the cloud lies 700 px under the foot of the block, and the ground 500 px under the cloud
  c.pos = [cam.pos[0], cam.pos[1] - 1200, cam.pos[2]];
  c.target = [cam.target[0], cam.target[1] - 1200, cam.target[2]];
  const k = clamp(dawn);
  const zen = mixc(hex('#020309'), hex('#1c2a48'), k);
  const hor = mixc(hex('#04060e'), mixc(hex('#3c4f78'), hex('#8a7a86'), clamp((k - 0.6) / 0.4)), k);
  const warm = clamp((dawn - 0.36) / 0.3);
  const o: AirOpts = {
    ring: 0, soft: 1, lit: 0,
    zen, hor, glow: hex('#000000'), ground: mixc(hex('#04060c'), hex('#0e1424'), warm),
    cloud: mixc(hex('#6a74a8', 0.085), hex('#a890b0', 0.13), warm), cloudGlow: hex('#000000'),
    glowGain: 0, stars: 1.1 * clamp((0.62 - dawn) / 0.24), vis: 70000, haze: 1, hazeEl: 0,
    deck: [5000, 0.55, 4200, 160], deckGlow: 0, clear: 0, deckFar: 110000,
    mist: [1, 0, 1, 0],
    dawn: [0.42, 0.9, 0.06 + 0.18 * warm], dawnC: hex('#ff9e70'),
  };
  air.under(c, t, o);
  air.over(c, t, o);
}

/** ash settling through the air in front of the dawn (world, around the block) */
export function bnAsh(d: Draw, t: number) {
  d.dotStyle({ world: true, blend: 'add' });
  const rnd = mulberry32(77);
  for (let j = 0; j < 90; j++) {
    const x = (rnd() * 2 - 1) * 1700, z = (rnd() * 2 - 1) * 1100 - 300, sp = 22 + 36 * rnd();
    const y = -1500 + ((rnd() * 1900 + t * sp) % 1900);
    const r = 1.2 + 1.5 * rnd(), a = 0.3 + 0.4 * rnd();
    d.dot([x + 30 * Math.sin(t * 0.7 + j), y, z], r, withA(hex('#c8cede', 0.22), a), 0.8);
  }
  d.flush();
}
