// The dive (verse 3, "Delve ever deeper in my alchemic arts"): one die after another, a decade of
// transistors deeper each, drawn the way chips are designed and photographed: a seal ring and
// bond pads round the edge; a floorplan of blocks inside (standard-cell rows with their gates,
// memory arrays, buses with their vias, repeated cores, an inductor's spiral), its features finer
// by the square root of ten each decade, until they are finer than a pixel and only their colour
// is left, as in a die shot of a modern chip. Below the last one, the crystal the chips are made
// of. The layouts are invented; only the decades and the counts beside them are data.
import { Camera } from '../engine/camera';
import { Draw } from '../engine/draw';
import { compile, Prog } from '../engine/gl';
import { M4, RGBA, V3, chain, rotZ, translate } from '../engine/math';

const DIE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 corner;
uniform mat4 uVP; uniform mat4 uModel;
out vec2 vQ; out vec3 vW;
void main(){
  vQ = corner;
  vec4 w = uModel * vec4(corner, 0.0, 1.0);
  vW = w.xyz;
  gl_Position = uVP * w;
}`;

const DIE_FS = `#version 300 es
precision highp float;
in vec2 vQ; in vec3 vW;
uniform float uE;       // the decade: 10^uE transistors
uniform float uSeed;
uniform float uA;       // how visible (fog, and fading as the camera passes through)
uniform float uTime;
uniform float uGain;
out vec4 o;
float h11(float n){ return fract(sin(n * 127.1 + uSeed * 31.7 + 311.7) * 43758.5453); }
float h21(vec2 p){ p = fract(p * vec2(443.897, 441.423) + uSeed * 0.37); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
float FW = 0.001;   // die units per pixel
// an anti-aliased band of half width w around d = 0 (die units)
float band(float d, float w){ return 1.0 - smoothstep(w - FW * 0.75, w + FW * 0.75, abs(d)); }
// a line's half width, never more than a couple of pixels however close the die comes, so a die
// near the lens stays drawn in hairlines instead of thick bars that motion blur turns into bands
float hw(float w){ return min(w, 1.6 * FW); }
// lines every P (die units), half width w; finer than a few pixels they fade to their mean cover
float lines(float x, float P, float w){
  w = hw(w);
  float d = (fract(x / P + 0.5) - 0.5) * P;
  float k = smoothstep(1.2, 3.5, P / FW);
  // finer than a pixel: only a dim haze of what is there, as in a die shot
  return mix(0.14 * min(1.0, 2.0 * w / P), band(d, w), k);
}
// a filled box test with soft edges: q inside [lo, hi]
float box(vec2 q, vec2 lo, vec2 hi){
  vec2 a = smoothstep(lo - FW, lo + FW, q) * (1.0 - smoothstep(hi - FW, hi + FW, q));
  return a.x * a.y;
}
float outline(vec2 q, vec2 lo, vec2 hi, float w){
  w = hw(w);
  vec2 c = (lo + hi) * 0.5, h = (hi - lo) * 0.5;
  vec2 d = abs(q - c) - h;
  float sd = max(d.x, d.y);
  return band(sd, w) * step(min(d.x, d.y), w + FW);
}
vec3 TYPE[5] = vec3[5](vec3(1.0, 0.70, 0.32), vec3(0.52, 0.50, 1.0), vec3(1.0, 0.46, 0.22), vec3(0.35, 0.95, 0.75), vec3(1.0, 0.42, 0.68));
void main(){
  FW = max(max(fwidth(vQ.x), fwidth(vQ.y)), 1e-6);
  FW = min(FW, 0.5);
  vec2 p = vQ;
  float e = uE;
  // a transistor's pitch on this die: 2,300 of them would fill it about 48 by 48
  float P = 0.075 * pow(10.0, -(e - 3.0) * 0.5);
  vec3 c = vec3(0.0);
  // the substrate: faintly lit, so the die reads as a plate
  float inDie = box(p, vec2(-1.0), vec2(1.0));
  c += vec3(0.05, 0.035, 0.09) * 0.12 * inDie;
  // seal ring and scribe line
  c += vec3(1.0, 0.72, 0.38) * (outline(p, vec2(-0.985), vec2(0.985), 0.004) + 0.7 * outline(p, vec2(-0.965), vec2(0.965), 0.0025)) * 0.9;
  // bond pads round the edge: more of them each decade
  float nPad = floor(clamp(4.0 * pow(1.55, e - 3.0), 4.0, 44.0));
  {
    vec2 a = abs(p);
    float side = a.x > a.y ? p.y : p.x;          // position along the nearest edge
    float edge = max(a.x, a.y);
    float cell = 1.8 / nPad;
    float k = (side + 0.9) / cell;
    float id = floor(k);
    float f = fract(k) - 0.5;
    float ps = 0.32;                            // pad size, as a share of its cell
    float inPad = step(abs(f), ps) * step(0.86, edge) * step(edge, 0.94) * step(-0.9, side) * step(side, 0.9);
    float rw = hw(0.0025);
    float rim = band(abs(f) * cell - ps * cell, rw) * step(0.86, edge) * step(edge, 0.94) + band(edge - 0.86, rw) * step(abs(f), ps) + band(edge - 0.94, rw) * step(abs(f), ps);
    c += vec3(0.85, 0.88, 1.0) * (inPad * 0.05 + rim * 0.8);
    // a lead from each pad into the core
    c += vec3(1.0, 0.55, 0.25) * band(f * cell, hw(0.003)) * step(0.8, edge) * step(edge, 0.86) * 0.7;
  }
  // the core: blocks split again and again, more blocks each decade, routing channels between
  vec2 lo = vec2(-0.8), hi = vec2(0.8);
  float id = 1.0;
  int levels = int(clamp(3.0 + (e - 3.0) * 0.7, 3.0, 9.0));
  for (int i = 0; i < 9; i++) {
    if (i >= levels) break;
    vec2 sz = hi - lo;
    bool vert = sz.x > sz.y * (0.75 + 0.5 * h11(id * 1.7));
    float r = 0.32 + 0.36 * h11(id * 3.1 + 1.0);
    if (vert) { float m = lo.x + sz.x * r; if (p.x < m) { hi.x = m; id = id * 2.0; } else { lo.x = m; id = id * 2.0 + 1.0; } }
    else { float m = lo.y + sz.y * r; if (p.y < m) { hi.y = m; id = id * 2.0; } else { lo.y = m; id = id * 2.0 + 1.0; } }
  }
  float inCore = box(p, vec2(-0.8), vec2(0.8));
  float gap = max(0.006, 2.5 * P);
  vec2 blo = lo + gap, bhi = hi - gap;
  float inBlk = box(p, blo, bhi);
  // routing channels: buses running between the blocks
  float ch = (1.0 - inBlk) * inCore;
  c += vec3(1.0, 0.5, 0.22) * ch * 0.22 * max(lines(p.x, P * 0.9, P * 0.12), lines(p.y, P * 0.9, P * 0.12));
  // early chips are random logic and buses; later ones are mostly memory and repeated cores
  float u = h11(id * 5.31 + 0.7);
  float late = smoothstep(4.0, 9.0, e);
  float type;
  if (u < mix(0.55, 0.18, late)) type = 0.0;
  else if (u < mix(0.62, 0.48, late)) type = 1.0;
  else if (u < mix(0.9, 0.58, late)) type = 2.0;
  else if (u < mix(0.95, 0.94, late)) type = 3.0;
  else type = 4.0;
  vec3 col = TYPE[int(type)];
  vec2 q = p - blo;
  float pat = 0.0, dots = 0.0;
  if (type < 0.5) {
    // standard cells: rows between power rails, cells of many widths, a gate here and there
    float row = floor(q.y / P);
    float fy = fract(q.y / P);
    float cw = P * 0.5;
    float cx = floor(q.x / cw);
    float wall = step(0.66, h21(vec2(cx, row)));
    pat += lines(q.y, P, P * 0.05) * 1.3;
    pat += band(fract(q.x / cw) * cw, P * 0.025) * wall * step(0.1, fy) * step(fy, 0.9) * 0.8 * smoothstep(2.5, 6.0, cw / FW);
    pat += band((fract(q.x / cw) - 0.5) * cw, P * 0.02) * step(0.55, h21(vec2(cx * 1.7, row * 0.3))) * step(0.25, fy) * step(fy, 0.75) * 0.5 * smoothstep(1.5, 4.0, cw / FW);
  } else if (type < 1.5) {
    // a memory array: bit cells in a fine grid, every eighth line a strap
    vec2 cell = vec2(P * 0.55, P * 0.38);
    pat += 0.32 * max(lines(q.x, cell.x, P * 0.025), lines(q.y, cell.y, P * 0.025));
    pat += 1.1 * max(lines(q.x, cell.x * 8.0, P * 0.05), lines(q.y, cell.y * 8.0, P * 0.05));
    vec2 f = (fract(q / cell) - 0.5) * cell;
    dots += 0.5 * band(length(f), P * 0.05) * smoothstep(2.0, 5.0, cell.y / FW);
  } else if (type < 2.5) {
    // a bus: wide parallel tracks, vias where they change layer
    bool horiz = h11(id * 9.1) > 0.5;
    float x = horiz ? q.y : q.x, y = horiz ? q.x : q.y;
    float Pt = P * 0.7;
    pat += lines(x, Pt, Pt * 0.22) * 0.9;
    float k = floor(x / Pt), m = floor(y / (Pt * 3.0));
    vec2 f = vec2((fract(x / Pt) - 0.5) * Pt, (fract(y / (Pt * 3.0)) - 0.5) * Pt * 3.0);
    dots += step(0.7, h21(vec2(k, m))) * band(max(abs(f.x), abs(f.y)), Pt * 0.18) * 1.5;
  } else if (type < 3.5) {
    // repeated cores: the block tiled with copies of one design, mirrored
    vec2 n = vec2(2.0 + floor(h11(id * 2.3) * 3.0), 2.0 + floor(h11(id * 4.9) * 2.0));
    vec2 ts = (bhi - blo) / n;
    vec2 tq = fract(q / ts);
    tq = mix(tq, 1.0 - tq, step(0.5, fract(floor(q / ts) * 0.5)));
    vec2 tp = tq * ts;
    pat += outline(tp, vec2(0.0), ts, max(P * 0.08, FW * 0.6)) * 1.3;
    float cache = step(tq.y, 0.42);
    pat += cache * 0.3 * max(lines(tp.x, P * 0.5, P * 0.025), lines(tp.y, P * 0.35, P * 0.025));
    pat += cache * 0.9 * band(tq.y * ts.y - 0.42 * ts.y, max(P * 0.06, FW * 0.5));
    pat += (1.0 - cache) * 0.7 * lines(tp.y, P, P * 0.05);
  } else {
    // an inductor's square spiral, a capacitor bank around it
    vec2 cc = (bhi - blo) * 0.5;
    vec2 d = abs(q - cc);
    float r = max(d.x, d.y);
    float R = min(cc.x, cc.y) * 0.8;
    float Pr = max(R / 7.0, P * 1.5);
    pat += lines(r, Pr, Pr * 0.16) * step(r, R) * step(R * 0.25, r) * 1.2;
    pat += 0.5 * step(R, r) * max(lines(q.x, P * 1.6, P * 0.25), lines(q.y, P * 1.6, P * 0.25));
  }
  // the block's boundary in gold; a few blocks busier than the rest, their light coming and going
  float bo = outline(p, blo, bhi, max(0.0018, P * 0.12));
  float busy = 0.55 + 0.9 * smoothstep(0.55, 1.0, sin(uTime * (1.3 + 2.0 * h11(id * 7.7)) + h11(id * 3.3) * 6.28) * 0.5 + 0.5) * step(0.6, h11(id * 8.1));
  c += (col * (pat * 0.38 * busy + 0.006) + vec3(1.0, 0.95, 0.85) * dots * 0.7) * inBlk;
  c += vec3(1.0, 0.75, 0.42) * bo * 0.85 * inCore;
  // a slow shimmer across the die, as the light catches a die under a microscope
  float sh = 0.85 + 0.15 * sin(dot(p, vec2(3.1, 2.3)) * 2.0 + uTime * 2.2 + uSeed);
  c *= sh * uGain * uA;
  if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);
  // the die is a plate: it hides what lies under it (premultiplied: dark where nothing is drawn)
  o = vec4(c, inDie * 0.9 * uA);
}`;

let dieProg: Prog | null = null;
let quadVao: WebGLVertexArrayObject | null = null;

function quad(d: Draw): WebGLVertexArrayObject {
  if (quadVao) return quadVao;
  const gl = d.gl;
  quadVao = gl.createVertexArray()!;
  gl.bindVertexArray(quadVao);
  const b = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
  gl.bindVertexArray(null);
  return quadVao;
}

/** one die, a square of half side R (world units) centred on (cx, cy) at depth z, turned by ang */
export function drawDie(d: Draw, o: { cx: number; cy: number; z: number; R: number; ang: number; e: number; seed: number; alpha: number; time: number; gain?: number }) {
  const gl = d.gl;
  if (!dieProg) dieProg = compile(gl, DIE_VS, DIE_FS, 'die');
  const p = dieProg;
  d.flush();
  const m: M4 = chain(translate(o.cx, o.cy, o.z), rotZ(o.ang), new Float32Array([o.R, 0, 0, 0, 0, o.R, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]));
  gl.useProgram(p.p);
  gl.uniformMatrix4fv(p.u.uVP, false, d.vp);
  gl.uniformMatrix4fv(p.u.uModel, false, m);
  gl.uniform1f(p.u.uE, o.e);
  gl.uniform1f(p.u.uSeed, o.seed);
  gl.uniform1f(p.u.uA, o.alpha);
  gl.uniform1f(p.u.uTime, o.time);
  gl.uniform1f(p.u.uGain, o.gain ?? 1);
  gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.disable(gl.STENCIL_TEST); gl.disable(gl.CULL_FACE);
  gl.bindVertexArray(quad(d));
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.bindVertexArray(null);
  d.stats.calls++;
}

/** the silicon crystal: atoms of a diamond lattice (lattice constant a) in a block around the
 *  axis, from z0 to z1, with their four bonds each */
export class Lattice {
  atoms: number[] = [];
  bonds: number[] = [];
  constructor(public cx: number, public cy: number, public z0: number, public z1: number, public a: number, n: number) {
    // the diamond cubic basis, in units of a / 4
    const B: V3[] = [[0, 0, 0], [0, 2, 2], [2, 0, 2], [2, 2, 0], [3, 3, 3], [3, 1, 1], [1, 3, 1], [1, 1, 3]];
    const q = a / 4;
    const nz = Math.ceil((z1 - z0) / a);
    const seen = new Set<string>();
    // the crystal is turned a little off the axis of the fall, so its columns do not stack up
    const ax = 0.21, ay = 0.13, zm = (z0 + z1) / 2;
    const rot = (x: number, y: number, z: number): V3 => {
      let lx = x - cx, ly = y - cy, lz = z - zm;
      const y1 = ly * Math.cos(ax) - lz * Math.sin(ax), z1_ = ly * Math.sin(ax) + lz * Math.cos(ax);
      ly = y1; lz = z1_;
      const x2 = lx * Math.cos(ay) + lz * Math.sin(ay), z2 = -lx * Math.sin(ay) + lz * Math.cos(ay);
      lx = x2; lz = z2;
      return [cx + lx, cy + ly, zm + lz];
    };
    for (let k = 0; k < nz; k++) for (let j = -n; j < n; j++) for (let i = -n; i < n; i++) {
      for (const b of B) {
        const x = cx + (i * 4 + b[0]) * q, y = cy + (j * 4 + b[1]) * q, z = z0 + (k * 4 + b[2]) * q;
        const key = `${i * 4 + b[0]},${j * 4 + b[1]},${k * 4 + b[2]}`;
        if (seen.has(key)) continue;
        seen.add(key);
        this.atoms.push(...rot(x, y, z));
        // bonds from the atoms of the second sublattice (odd coordinates) to their four neighbours
        if (b[0] % 2 === 1) {
          const dirs: V3[] = (b[0] + b[1] + b[2]) % 4 === 3 ? [[-1, -1, -1], [-1, 1, 1], [1, -1, 1], [1, 1, -1]] : [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
          for (const dd of dirs) this.bonds.push(...rot(x, y, z), ...rot(x + dd[0] * q, y + dd[1] * q, z + dd[2] * q));
        }
      }
    }
  }

  draw(d: Draw, cam: Camera, o: { from: number; to: number; atom: RGBA; bond: RGBA; r: number; alpha: number; fog: [number, number]; pulse?: number; time?: number;
    /** the camera's speed along the axis (units/s) and its roll rate (rad/s): what moves too far
     *  across the screen while the shutter is open fades, so it never breaks into a comb of copies */
    speed?: number; roll?: number }) {
    const zc = cam.pos[2];
    const cx = cam.pos[0], cy = cam.pos[1];
    const focal = d.focal();
    const shutter = 0.5 / 60;
    const steady = (x: number, y: number, dz: number) => {
      const rho = Math.hypot(x - cx, y - cy);
      const v = focal * rho * ((o.speed ?? 0) / (dz * dz) + Math.abs(o.roll ?? 0) / dz);
      const spread = v * shutter;
      return spread <= 6 ? 1 : Math.pow(6 / spread, 1.5);
    };
    // only what the camera can see: a cone around its axis
    const vis = (x: number, y: number, z: number) => Math.hypot(x - cx, y - cy) < 0.75 * (z - zc) + 120;
    const f = (z: number) => {
      const dz = z - zc;
      const near = Math.min(1, Math.max(0, (dz - 160) / 640));
      const far = 1 - Math.min(1, Math.max(0, (dz - o.fog[0]) / (o.fog[1] - o.fog[0])));
      return near * far * o.alpha;
    };
    // sizes are worked out on screen and held to a few pixels, so nothing near the lens turns
    // into a bar (a world-wide stroke close up is a slab, and motion blur makes it a block)
    const px = (w: number, dz: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, (w * focal) / Math.max(dz, 1)));
    d.lineStyle({ blend: 'add' });
    for (let i = 0; i < this.bonds.length; i += 6) {
      const z = (this.bonds[i + 2] + this.bonds[i + 5]) / 2;
      if (z < o.from || z > o.to) continue;
      if (!vis(this.bonds[i], this.bonds[i + 1], z)) continue;
      const a = f(z) * steady((this.bonds[i] + this.bonds[i + 3]) / 2, (this.bonds[i + 1] + this.bonds[i + 4]) / 2, z - zc);
      if (a <= 0.01) continue;
      // now and then a bond carries a pulse: the crystal thinking
      const hb = Math.abs((Math.sin(i * 12.9898) * 43758.5453) % 1);
      const hit = o.pulse && hb > 0.75 ? Math.pow(Math.max(0, Math.sin(((o.time ?? 0) * 1.7 + hb * 40) * Math.PI)), 10) * o.pulse : 0;
      const w = px(o.r * 0.22, z - zc, 0.7, 2.2) * (1 + 0.4 * hit);
      const c: RGBA = [o.bond[0] * (1 - hit) + 1.6 * hit, o.bond[1] * (1 - hit) + 1.05 * hit, o.bond[2] * (1 - hit) + 0.5 * hit, o.bond[3] * a];
      d.seg([this.bonds[i], this.bonds[i + 1], this.bonds[i + 2]], [this.bonds[i + 3], this.bonds[i + 4], this.bonds[i + 5]], w, c);
    }
    d.flush();
    d.lineStyle({});
    d.dotStyle({ blend: 'add' });
    for (let i = 0; i < this.atoms.length; i += 3) {
      const z = this.atoms[i + 2];
      if (z < o.from || z > o.to) continue;
      if (!vis(this.atoms[i], this.atoms[i + 1], z)) continue;
      const a = f(z) * steady(this.atoms[i], this.atoms[i + 1], z - zc);
      if (a <= 0.01) continue;
      d.dot([this.atoms[i], this.atoms[i + 1], z], px(o.r, z - zc, 1.2, 9), [o.atom[0], o.atom[1], o.atom[2], o.atom[3] * a], 0.7);
    }
    d.flush();
    d.dotStyle({});
  }
}
