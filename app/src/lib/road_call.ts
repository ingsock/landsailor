// OUTRO, the call: "Landsailor" / (I'm your landsailor). The road of the first verse again, at the
// first blue of morning: the sky from the outro's dawn, the city against it, the lamps still on,
// the wet road holding the sky. LANDSAILOR is painted across the lanes and lights as she sings it;
// the message sign answers I'M YOUR / LANDSAILOR in its amber lamps, a word as each is echoed.
import { Camera } from '../engine/camera';
import { Ctx, ShotFrame } from '../engine/engine';
import { PostParams } from '../engine/post';
import { RGBA, V3, clamp, fbm1, glide, hex, lerp, mixc } from '../engine/math';
import { Score } from '../engine/score';
import { Look, NIGHT_LOOK, NightRoad, RoadPath } from './road_night';
import { Sign, paintWord, signDots } from './road_signs';

const SIGN = 362, WORD = 324;
const cache = new WeakMap<Ctx, NightRoad>();

function road(ctx: Ctx): NightRoad {
  let nr = cache.get(ctx);
  if (!nr) {
    // a straight stretch of the same expressway
    const pts: V3[] = [];
    for (let z = -300; z <= 4200; z += 50) pts.push([0, 0, z]);
    const R = new RoadPath(pts);
    nr = new NightRoad(ctx, R, {
      lampEvery: 45, lampFrom: 0, lampTo: R.len,
      spans: [
        { s: 165, kind: 'bridge' },
        { s: SIGN, kind: 'gantry', panel: true, box: [6.45, 10.75, 7.6] },
        { s: 640, kind: 'bridge' },
        { s: 880, kind: 'gantry' },
        { s: 1180, kind: 'bridge' },
        { s: 1720, kind: 'bridge' },
      ],
      traffic: { from: 0, to: R.len, seed: 23, density: 0.9 },
      city: [-3600, -2500, 3600, 9000],
      medianFrom: WORD + 40,
    });
    cache.set(ctx, nr);
  }
  return nr;
}

/** build the outro's road ahead of its first frame (the verse-1 scene calls this as it loads) */
export function prepareCall(ctx: Ctx) { road(ctx); }

/** the call shot, drawn by the outro's scene; `sky` gives its dawn (dawnSky and drawDawn of outro1) */
export function drawCall(ctx: Ctx, score: Score, f: ShotFrame, sky: { drawDawn: (d: import('../engine/draw').Draw, k: number) => void }): Partial<PostParams> {
  const d = ctx.d;
  const t = f.t;
  const nr = road(ctx);
  const R = nr.road;
  const call = score.line('Landsailor', 3);
  const echo = score.lines.find((l) => l.echo && l.text.startsWith("I'm your"))!;
  // the first blue of morning, as the outro's dawn has it
  const k = 0.3 + 0.08 * clamp(f.p, -0.2, 1.2);
  ctx.clear(hex('#02030a'));
  sky.drawDawn(d, k);
  const top = mixc(hex('#020309'), hex('#1c2a48'), clamp(k));
  const low = mixc(hex('#04060e'), mixc(hex('#3c4f78'), hex('#8a7a86'), clamp((k - 0.6) / 0.4)), clamp(k));

  // the camera: on the road at a driver's pace, the long lens widening as the sign comes near
  const g = glide(f.p);
  const s = 268 + 44 * g;
  const cam = new Camera();
  const kk = 0.05;
  const p = R.P(s, 2.4, -5.4);
  cam.pos = [p[0] + fbm1(t * 6.3) * kk, p[1] + fbm1(t * 8.9 + 17) * kk * 0.8, p[2]];
  const q = R.P(s + 70, 0.4, -2.0);
  cam.target = [q[0] + fbm1(t * 2.1 + 5) * kk * 6, q[1] + fbm1(t * 2.7 + 9) * kk * 4, q[2]];
  cam.roll = fbm1(t * 1.7 + 3) * 0.004;
  cam.fov = 0.46 + 0.17 * g;
  cam.near = 0.5;
  d.setCamera(cam);

  const look: Look = {
    ...NIGHT_LOOK,
    zen: top, hor: low,
    glow: hex('#ff9a50', 0.022),
    band: 0.05, dome: 0.1,
    ground: hex('#080b14'),
    windows: 0.85, beacons: 1,
    fog: 1 / 2000, fogH: 90,
    mist: 0.75, carpet: 0.9, streets: 0.8,
    overlay: true,
  };
  nr.begin(cam, t, look);
  // the sign answers word by word as the echo is sung
  const sign: Sign = {
    s: SIGN, top: 10.3, pitch: 0.17, gap: 3,
    lines: [{ text: "I'M YOUR", words: echo.words.slice(0, 2) }, { text: 'LANDSAILOR', words: [echo.words[2]] }],
  };
  nr.drawReflections(() => signDots(nr, sign, t));
  nr.drawSky();
  nr.drawRoad();
  paintWord(nr, call, 'LANDSAILOR', WORD, t);
  d.depth(true);
  nr.drawStructures();
  nr.drawPoles();
  nr.drawCity();
  nr.lampHeads();
  nr.traffic();
  nr.planes([{ p: [-1400 - 60 * 180.4, -480 + 3 * 180.4, 3600 + 12 * 180.4], v: [60, -3, -12] }]);
  nr.motes();
  signDots(nr, sign, t);
  d.flush();
  d.depth(false);
  nr.drawMist();
  void (low as RGBA); void lerp;
  return { bloom: 0.34, threshold: 0.85 };
}
