// What is written on the night road: words painted across the lanes, and the message sign's amber
// lamps. Shared by the verse-1 road and its return in the outro.
import { RGBA, chain, hex, rotX, scale, translate } from '../engine/math';
import { Line, Word } from '../engine/score';
import { glyphModel, setRun } from '../engine/text';
import { matrix } from './dotmatrix';
import { lamp, letterOn } from './lyric';
import { L } from './palette';
import { NightRoad } from './road_night';

/** rotation about world y (turning on the ground) */
export function rotYm(a: number) {
  const m = new Float32Array(16); m[5] = 1; m[15] = 1;
  const c = Math.cos(a), s = Math.sin(a);
  m[0] = c; m[2] = -s; m[8] = s; m[10] = c;
  return m;
}

/** a word painted across the lanes at arc length s, letters stretched along the road so a driver
 *  reads them; each letter flares as the voice reaches it and stays lit (retroreflective paint) */
export function paintWord(nr: NightRoad, line: Line, text: string, s: number, t: number, wordIdx = 0, o: { width?: number; stretch?: number } = {}) {
  const d = nr.d, fonts = nr.ctx.fonts, R = nr.road;
  const c = R.P(s, 0);
  const dz = nr.depth(c);
  if (dz < -40 || dz > 900) return;
  const run = setRun(fonts, 'pass', text, 100, { wght: 800 }, 0.04);
  const width = o.width ?? 24;          // across both carriageways
  const k = width / run.width;          // metres per px of the run
  const E = o.stretch ?? 3.6;           // elongation along the road, for a reader at a low angle
  const [tx, tz] = R.T(s);
  const ang = Math.atan2(tx, tz);
  // glyph space: x across (right), y up -> along the road (+z away)
  const base = chain(translate(c[0], -0.01, c[2]), rotYm(ang), rotX(-Math.PI / 2), scale(k, k * E, 1), translate(-run.width / 2, 0, 0));
  const words = line.words;
  for (let i = 0; i < run.glyphs.length; i++) {
    const g = run.glyphs[i];
    if (!g.geo.mesh) continue;
    // the sung word this letter belongs to
    const before = text.slice(0, g.cl);
    const wi = wordIdx + before.split(/\s+/).length - 1;
    const w = words[Math.min(words.length - 1, wi)];
    const wordStart = before.lastIndexOf(' ') + 1;
    const inWord = g.cl - wordStart;
    const wordLen = (text.slice(wordStart).split(' ')[0] || '').length;
    const dt = t - letterOn(w, inWord, Math.max(1, wordLen));
    // road paint under the lamps until the voice reaches it; then it flares and stays lit
    const col: RGBA = dt < 0 ? hex('#b8aa98', 0.07, 0.95) : lamp('strobe', dt, 0.8);
    d.fillMesh(g.geo.mesh, col, glyphModel(base, g.x, 0, run.scale), 'alpha');
  }
}

export type SignLine = { text: string; words: (Word | null)[] };
export type Sign = { s: number; top: number; pitch: number; lines: SignLine[]; gap?: number; dark?: number };

/** a message sign's amber lamps: each word dim just before it is sung, lit at the voice. Drawn
 *  directly and mirrored (for the wet road); lit signs also light the mist */
export function signDots(nr: NightRoad, sg: Sign, t: number) {
  const d = nr.d, fonts = nr.ctx.fonts, R = nr.road;
  const c0 = R.P(sg.s, 0);
  const dz = nr.depth(c0);
  if (dz < -20 || dz > 1600) return;
  const mirror = nr.mirror;
  const amber = L('sodium', 1);
  d.dotStyle({ world: false, blend: 'add' });
  let litN = 0, allN = 0;
  sg.lines.forEach((ln, li) => {
    const m = matrix(fonts, ln.text, 9);
    const wordCols: number[] = [];
    let col = 0;
    for (const w of ln.text.split(' ')) { wordCols.push(col); col += matrix(fonts, w, 9).width + matrix(fonts, ' ', 9).width; }
    const ox = -(m.width * sg.pitch) / 2;
    const top = sg.top - li * (9 + (sg.gap ?? 3)) * sg.pitch;
    for (const [cx, ry] of m.dots) {
      let wi = 0;
      for (let k = 0; k < wordCols.length; k++) if (cx >= wordCols[k]) wi = k;
      const w = ln.words[Math.min(wi, ln.words.length - 1)];
      const dt = w ? t - w.start : -1e9;
      let I: number;
      if (sg.dark !== undefined && t < sg.dark) I = 0.012;
      else if (dt < -0.35) I = 0.02;
      else if (dt < 0) I = 0.12;
      else I = 2.3 + 2.5 * Math.exp(-dt / 0.08);
      allN++;
      if (dt >= 0) litN++;
      const p = R.P(sg.s - 0.72, ox + (cx + 0.5) * sg.pitch, -(top - ry * sg.pitch));
      const [r, k] = nr.px(p, sg.pitch * (mirror ? 0.7 : 0.42), mirror ? 1.6 : 0.6);
      if (r <= 0) continue;
      const e = I * k;
      d.dot(nr.M(p), r, [amber[0] * e, amber[1] * e, amber[2] * e, 1], mirror ? 0.9 : 0.35);
    }
  });
  d.flush();
  if (!mirror && litN > 0) {
    const share = litN / Math.max(1, allN);
    for (const o of [-6, -2, 2, 6]) nr.mistLight(R.P(sg.s - 1.5, o, -(sg.top - 0.8)), amber, 0.5 * share);
  }
}
