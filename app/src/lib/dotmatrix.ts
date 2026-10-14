// Dot-matrix lettering, as on a highway's variable message sign: a glyph's outline sampled on a
// grid of lamps (nonzero winding), so any text in any of the film's faces can be set in dots.
import { Fonts, setRun } from '../engine/text';

const cache = new Map<string, { dots: [number, number][]; width: number; rows: number }>();

function inside(contours: Float32Array[], x: number, y: number): boolean {
  let wn = 0;
  for (const c of contours) {
    const n = c.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const x0 = c[i * 2], y0 = c[i * 2 + 1], x1 = c[j * 2], y1 = c[j * 2 + 1];
      if (y0 <= y) { if (y1 > y && (x1 - x0) * (y - y0) - (x - x0) * (y1 - y0) > 0) wn++; }
      else if (y1 <= y && (x1 - x0) * (y - y0) - (x - x0) * (y1 - y0) < 0) wn--;
    }
  }
  return wn !== 0;
}

/** dots (in units of one lamp pitch, y down, baseline at row `rows`) for a line of text, `rows` lamps tall at cap height */
export function matrix(fonts: Fonts, text: string, rows = 9, font = 'pass', axes = { wght: 700 }): { dots: [number, number][]; width: number; rows: number } {
  const key = `${font}|${rows}|${JSON.stringify(axes)}|${text}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const size = 1000;
  const run = setRun(fonts, font, text, size, axes, 0.12);
  // cap height from 'H'
  const H = setRun(fonts, font, 'H', size, axes).glyphs[0].geo.bbox[3] * run.scale;
  const pitch = H / rows;
  const dots: [number, number][] = [];
  const seen = new Set<string>();
  for (const g of run.glyphs) {
    const k = run.scale;
    const [bx0, , bx1] = g.geo.bbox;
    if (!isFinite(bx0)) continue;
    const c0 = Math.floor((g.x + bx0 * k) / pitch), c1 = Math.ceil((g.x + bx1 * k) / pitch);
    for (let cx = c0; cx <= c1; cx++) {
      for (let ry = -2; ry <= rows + 1; ry++) {
        const px = (cx + 0.5) * pitch, py = (rows - ry - 0.5) * pitch; // py: height above baseline
        const fx = (px - g.x) / k, fy = py / k;
        const id = `${cx},${ry}`;
        if (!seen.has(id) && inside(g.geo.contours, fx, fy)) { seen.add(id); dots.push([cx, ry]); }
      }
    }
  }
  const width = Math.ceil(run.width / pitch);
  const out = { dots, width, rows };
  cache.set(key, out);
  return out;
}
