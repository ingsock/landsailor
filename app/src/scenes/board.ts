// VERSE 1, "All your wonders at my demand": a split-flap departures board at O'Hare. Real
// destinations from O'Hare (OpenFlights), and in the destination column, a word to a row, the
// line as it is sung. Flaps run through the drum in order and land on the sung word on time
// (mechanical motion: discrete, clattering, then still).
import { Camera } from '../engine/camera';
import { Scene, ShotFrame } from '../engine/engine';
import { RGBA, clamp, ease, hex, lerp, prog, withA, chain, translate, rotY, glide } from '../engine/math';
import { Score } from '../engine/score';
import { glyphModel, setRun } from '../engine/text';
import { L, NIGHT } from '../lib/palette';

const DRUM = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:.-';
const RATE = 46; // flaps a second

type Cell = { from: string; to: string; t0: number };

export class Board extends Scene {
  score!: Score;
  dests: string[] = [];

  async init() {
    this.score = this.ctx.data.get('score');
    const fl = await (await fetch('/data/geo/flights.json')).json();
    const want = ['Tokyo', 'London', 'Frankfurt', 'Doha', 'Mexico City', 'Seoul', 'Dublin', 'Hong Kong', 'Istanbul', 'Delhi', 'Sao Paulo', 'Reykjavik'];
    const have = new Set((fl.fromORD as any[]).map((a) => a.city));
    this.dests = want.filter((c) => have.has(c)).map((c) => c.toUpperCase());
    while (this.dests.length < 8) this.dests.push('TORONTO');
  }

  /** the character a cell shows at time t, and how far through a flap it is */
  cell(c: Cell, t: number): [string, string, number] {
    const a = DRUM.indexOf(c.from), b = DRUM.indexOf(c.to);
    const steps = (b - a + DRUM.length) % DRUM.length;
    // the flaps start early enough to land on t0
    const start = c.t0 - steps / RATE;
    const k = (t - start) * RATE;
    if (k <= 0 || steps === 0) return [k <= 0 ? c.from : c.to, c.to, 0];
    if (k >= steps) return [c.to, c.to, 0];
    const i = Math.floor(k);
    return [DRUM[(a + i) % DRUM.length], DRUM[(a + i + 1) % DRUM.length], k - i];
  }

  draw(f: ShotFrame) {
    const { d, fonts } = this.ctx;
    const t = f.t;
    const sc = this.score;
    this.ctx.clear(hex('#020308'));
    const line = sc.line('All your wonders');
    // the camera slides along the board and closes in, a little rotated
    const cam = Camera.home();
    const k = glide(f.p);
    // along the destination column, closing a little; the words stay whole in the frame
    cam.pos = [lerp(820, 880, k), lerp(430, 470, k), lerp(-1900, -1500, k)];
    cam.target = [lerp(860, 940, k), lerp(470, 500, k), 0];
    cam.roll = lerp(-0.03, 0.015, k);
    d.setCamera(cam);
    const base = chain(translate(0, 0, 0), rotY(0));

    const cw = 46, ch = 64, gap = 6, rowH = 92;
    const x0 = 150, y0 = 190;
    const cols = { time: 0, dest: 6, flight: 21, gate: 29, rem: 34 };
    const head = withA(NIGHT.note, 0.9);
    const lab = (s: string, x: number, y: number) => {
      const r = setRun(fonts, 'passMono', s, 22, { wght: 600 }, 0.08);
      r.glyphs.forEach((g) => g.geo.mesh && d.fillMesh(g.geo.mesh, head, glyphModel(base, x + g.x, y + g.y, r.scale)));
    };
    lab('TIME', x0, y0 - 30); lab('DESTINATION', x0 + cols.dest * (cw + gap), y0 - 30);
    lab('FLIGHT', x0 + cols.flight * (cw + gap), y0 - 30); lab('GATE', x0 + cols.gate * (cw + gap), y0 - 30);
    lab('REMARKS', x0 + cols.rem * (cw + gap), y0 - 30);
    const words = line.words.map((w) => w.w.replace(/[^A-Za-z]/g, '').toUpperCase());
    const rows = 8;
    for (let r = 0; r < rows; r++) {
      const y = y0 + r * rowH;
      const word = r < words.length ? words[r] : null;
      const w = r < words.length ? line.words[r] : null;
      const dest = this.dests[r % this.dests.length];
      const hh = 18 + Math.floor((r * 7) / 4), mm = (5 + r * 15) % 60;
      const time = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      const flight = ['UA', 'AA', 'LH', 'QR', 'AM', 'KE', 'EI', 'CX'][r % 8] + String(880 + r * 37);
      const gate = ['C17', 'K9', 'M12', 'M3', 'L8', 'M7', 'C24', 'M18'][r % 8];
      const sungRow = w ? t >= w.start : false;
      // each row's destination flips to its word, landing as the word is sung
      const destText = word ? word.padEnd(14) : dest.padEnd(14);
      const prevText = dest.padEnd(14);
      const flipAt = w ? w.start : 0;
      const rem = sungRow ? 'NOW BOARDING' : r < words.length ? 'ON TIME' : 'SCHEDULED';
      const put = (text: string, from: string, col: number, t0: number, color: RGBA) => {
        for (let i = 0; i < text.length; i++) {
          const c: Cell = { from: from[i] || ' ', to: text[i] || ' ', t0: t0 + i * 0.018 };
          const [cur, next, ph] = this.cell(c, t);
          this.flap(cur, next, ph, x0 + (col + i) * (cw + gap), y, cw, ch, color);
        }
      };
      const dim = hex('#e9e2cf', 0.85);
      put(time, time, cols.time, 0, dim);
      put(destText, prevText, cols.dest, w ? flipAt : 0, sungRow ? L('filament', 1.25) : dim);
      put(flight.padEnd(7), flight.padEnd(7), cols.flight, 0, dim);
      put(gate.padEnd(4), gate.padEnd(4), cols.gate, 0, dim);
      const remPrev = r < words.length ? 'ON TIME     ' : 'SCHEDULED   ';
      put(rem.padEnd(12), remPrev, cols.rem, w ? flipAt + 0.08 : 0, sungRow ? L('sodium', 1.4) : withA(dim, 0.8));
    }
    return { bloom: 0.25, threshold: 0.95 };
  }

  /** one flap cell: the character, and during a flip the falling half */
  flap(cur: string, next: string, ph: number, x: number, y: number, w: number, h: number, color: RGBA) {
    const { d, fonts } = this.ctx;
    // the cell's face
    d.rect(x, y, w, h, hex('#15181f', 1));
    d.rect(x, y + h / 2 - 1, w, 2, hex('#05060a', 1));
    const show = ph < 0.5 ? cur : next;
    if (show !== ' ') {
      const r = setRun(fonts, 'pass', show, h * 0.86, { wght: 700 });
      const g = r.glyphs[0];
      if (g && g.geo.mesh) {
        // the flap folding: the glyph squashes toward the split line and opens again
        const sy = Math.abs(Math.cos(ph * Math.PI));
        const gx = x + (w - g.adv) / 2;
        const baseY = y + h * 0.5 + (h * 0.62) / 2;
        const mid = y + h / 2;
        const m = glyphModel(null, gx + g.x, mid + (baseY - mid) * sy, r.scale, 0, 1, sy);
        d.fillMesh(g.geo.mesh, color, m, 'alpha');
      }
    }
    void prog;
  }
}
