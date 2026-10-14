// Downtown Chicago in three dimensions: every OpenStreetMap building of the Loop, the river and
// Streeterville, extruded to its height, drawn as the rest of the film draws the city: dark masses
// whose edges catch a fine line of light, with a grid of windows in the walls. Windows are lit as
// offices (until a fault reaches them, when they go dark) or as candles, flickering, a few to a wall;
// the lightning lights the faces turned toward it. Depth-tested, so the towers hide one another.
import { Camera } from '../engine/camera';
import { Draw } from '../engine/draw';
import { Prog, compile } from '../engine/gl';

const PX = 0.1; // world units per metre, as the city's ground model

const VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aP;
layout(location=1) in vec3 aN;
layout(location=2) in vec4 aU;     // u along the wall (m), v up (m), wall length (m), kind (0 wall, 1 roof)
layout(location=3) in vec4 aB;     // building id, height (m), centre east, centre south (m)
uniform mat4 uVP;
out vec3 vN; out vec4 vU; out vec4 vB; out float vW; out vec3 vP;
void main(){
  gl_Position = uVP * vec4(aP, 1.0);
  vN = aN; vU = aU; vB = aB; vW = gl_Position.w; vP = aP;
}`;

const FS = `#version 300 es
precision highp float;
in vec3 vN; in vec4 vU; in vec4 vB; in float vW; in vec3 vP;
out vec4 o;
uniform vec3 uBase; uniform vec3 uRoof; uniform vec3 uEdge; uniform float uEdgeI;
uniform vec4 uOffice;    // lit share, intensity, the fault's reach (m: dark within it of uOrigin), -
uniform vec2 uOrigin;    // where the fault starts (m east, m south)
uniform vec4 uCandle;    // lit share, intensity, time, -
uniform vec3 uOfficeC; uniform vec3 uCandleC; uniform vec3 uGlass;
uniform vec3 uFlashC; uniform float uFlash; uniform vec3 uFlashDir;
uniform vec3 uFog;       // near, far, floor
float h21(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
void main(){
  vec3 n = normalize(vN);
  bool roof = vU.w > 0.5;
  // two tones by which way a wall faces, darker toward the ground; roofs a little lighter
  vec3 c = roof ? uRoof : uBase * (0.75 + 0.25 * abs(n.x)) * (0.55 + 0.45 * clamp(vU.y / 60.0, 0.0, 1.0));
  float H = vB.y;
  if (!roof) {
    // the windows: a floor every 3.8 m, a bay every 3.1 m, the ground floor and the crown blank
    vec2 g = vec2(vU.x / 3.1, vU.y / 3.8);
    vec2 cell = floor(g), f = fract(g);
    vec2 fw = fwidth(g) * 0.8;
    float pane = smoothstep(0.2 - fw.x, 0.2 + fw.x, f.x) * (1.0 - smoothstep(0.8 - fw.x, 0.8 + fw.x, f.x))
               * smoothstep(0.24 - fw.y, 0.24 + fw.y, f.y) * (1.0 - smoothstep(0.78 - fw.y, 0.78 + fw.y, f.y));
    float inside = step(1.0, cell.y) * step(vU.y, H - 4.0) * step(0.6, vU.x) * step(vU.x, vU.z - 0.6);
    float reach = length(vB.zw - uOrigin);
    // near: each window lit or dark on its own
    float r = h21(cell + vB.x * 7.31);
    float office = step(r, uOffice.x) * step(uOffice.z, reach) * (0.6 + 0.4 * h21(cell + 3.7 + vB.x));
    float candle = step(1.0 - uCandle.x, h21(cell * 1.7 + vB.x * 3.1 + 11.0));
    float fl = 0.75 + 0.25 * sin(uCandle.z * (7.0 + 9.0 * r) + r * 40.0) * sin(uCandle.z * 3.1 + r * 9.0);
    vec3 winCell = uOfficeC * office * uOffice.y + uCandleC * candle * uCandle.y * fl;
    vec3 nearC = mix(c, uGlass + winCell, pane * inside);
    // far, where a window is under a couple of pixels: windows lit together in blocks of four bays
    // and two floors, as an office floor is left on at night; the rest dark glass. (Each window's
    // own hash would only alias into static, and their average is a flat grey wall.)
    // (a block is four bays of one floor: a lit strip along the floor, as office floors are lit)
    vec2 gb = g / vec2(4.0, 1.0);
    vec2 bc = floor(gb), bf = fract(gb), fb = fwidth(gb);
    float bpane = smoothstep(0.06 - fb.x, 0.06 + fb.x, bf.x) * (1.0 - smoothstep(0.94 - fb.x, 0.94 + fb.x, bf.x))
                * smoothstep(0.28 - fb.y, 0.28 + fb.y, bf.y) * (1.0 - smoothstep(0.74 - fb.y, 0.74 + fb.y, bf.y));
    float rb = h21(bc + vB.x * 5.17);
    float ob = step(rb, uOffice.x * 0.6) * step(uOffice.z, reach) * (0.55 + 0.45 * h21(bc + 1.3 + vB.x));
    float cb = step(1.0 - uCandle.x * 1.5, h21(bc * 1.3 + vB.x * 2.9 + 4.0));
    vec3 farW = uOfficeC * ob * uOffice.y * 0.55 + uCandleC * cb * uCandle.y * 0.4 * fl;
    vec3 farC = mix(c, uGlass, 0.35 * inside) + farW * bpane * inside;
    float fine = smoothstep(0.16, 0.42, max(fw.x, fw.y));
    c = mix(nearC, farC, fine);
  }
  // a fine line of light on the edges: the real corners (where the wall turns; a wall's flags say
  // which of its ends is one), the parapet, the roofline. A mast (no wall length) is all edge.
  float cf = floor(vU.w * 10.0 + 0.5);
  float sc = mod(cf, 2.0), ec = step(1.5, cf);
  float eu = min(sc > 0.5 ? vU.x : 1e3, ec > 0.5 ? vU.z - vU.x : 1e3);
  if (vU.z <= 0.0) eu = -1.0;
  float ev = roof ? 1e3 : H - vU.y;
  float fu = max(fwidth(vU.x), 1e-4), fv = max(fwidth(vU.y), 1e-4);
  float edge = roof ? 0.0 : max(1.0 - smoothstep(0.0, 1.1 * fu, eu), 1.0 - smoothstep(0.0, 1.1 * fv, ev));
  c += uEdge * uEdgeI * edge;
  // lightning: the faces turned toward it
  float lf = clamp(dot(n, -uFlashDir), 0.0, 1.0) * 0.85 + 0.15;
  c += uFlashC * uFlash * lf * (roof ? 1.2 : 1.0) + uEdge * uFlash * 3.0 * edge;
  // the haze, as the city's lines are fogged
  float fog = uFog.y > uFog.x ? mix(uFog.z, 1.0, 1.0 - smoothstep(uFog.x, uFog.y, vW)) : 1.0;
  o = vec4(c * fog, 1.0);
}`;

type Bld = { h: number; hmin?: number; name: string; pts: number[][] };

export type LoopOpts = {
  base?: number[]; roof?: number[]; edge?: number[]; edgeI?: number; glass?: number[];
  office?: number; officeI?: number; officeC?: number[]; reveal?: number; origin?: [number, number];
  candle?: number; candleI?: number; candleC?: number[]; time?: number;
  flash?: number; flashC?: number[]; flashDir?: [number, number, number];
  fog?: [number, number, number];
};

export class Loop3D {
  private prog: Prog;
  private vao: WebGLVertexArrayObject | null = null;
  private count = 0;
  ready = false;
  names: Record<string, [number, number, number]> = {};   // a few landmarks: world x, z, height (world units)

  constructor(public gl: WebGL2RenderingContext, public d: Draw) {
    this.prog = compile(gl, VS, FS, 'loop3d');
  }

  /** load the buildings */
  async load(url = '/data/geo/chi_loop_buildings.json') {
    const r = await fetch(url);
    if (!r.ok) return;
    const bl: Bld[] = await r.json();
    const out: number[] = [];
    let id = 0;
    for (const b of bl) {
      let pts = b.pts.map((p) => [p[0], -p[1]]);            // to (east, south)
      if (pts.length > 3 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts = pts.slice(0, -1);
      if (pts.length < 3) continue;
      // anticlockwise in (east, north), so outward normals are to the right of each edge
      let area = 0;
      for (let i = 0; i < pts.length; i++) { const a = pts[i], c = pts[(i + 1) % pts.length]; area += a[0] * c[1] - c[0] * a[1]; }
      const H = Math.max(4, Math.min(b.h || 12, 560));
      const H0 = Math.max(0, Math.min(b.hmin || 0, H - 1));    // a part may start above the ground
      // a mast (Willis's antennas): tall and a few metres across; kept, and drawn without windows
      const mast = Math.abs(area) < 60 && H > 150;
      if (Math.abs(area) < 30 && !mast) continue;             // sheds, kiosks
      if (area < 0) pts.reverse();
      id++;
      const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      const W = (e: number, s: number, h: number) => [e * PX, -h * PX, -s * PX];
      const push = (p: number[], n: number[], u: number[], kind: number) => out.push(p[0], p[1], p[2], n[0], n[1], n[2], u[0], u[1], u[2], kind, id, H, cx, cy);
      // which vertices are real corners: where the outline turns by more than 25 degrees (an
      // outline traced in many short pieces along a curve or a straight wall has none)
      const np = pts.length;
      const corner = pts.map((p, i) => {
        const q = pts[(i + np - 1) % np], r = pts[(i + 1) % np];
        const ax = p[0] - q[0], ay = p[1] - q[1], bx = r[0] - p[0], by = r[1] - p[1];
        const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
        if (la < 1e-6 || lb < 1e-6) return false;
        return (ax * bx + ay * by) / (la * lb) < Math.cos((25 * Math.PI) / 180);
      });
      // walls (a mast's wall length is given as 0: no windows, and the shader lights it as an edge);
      // a wall's kind carries its corner flags: 0.1 its start is a corner, 0.2 its end
      for (let i = 0; i < np; i++) {
        const a = pts[i], c = pts[(i + 1) % np];
        const L = Math.hypot(c[0] - a[0], c[1] - a[1]);
        if (L < 0.3) continue;
        const Lw = mast ? 0 : L;
        const k = (corner[i] ? 0.1 : 0) + (corner[(i + 1) % np] ? 0.2 : 0);
        // outward normal in (east, south): the edge turned to its right
        const nx = (c[1] - a[1]) / L, ns = -(c[0] - a[0]) / L;
        const n = [nx, 0, -ns];
        const A0 = W(a[0], a[1], H0), C0 = W(c[0], c[1], H0), A1 = W(a[0], a[1], H), C1 = W(c[0], c[1], H);
        push(A0, n, [0, H0, Lw], k); push(C0, n, [L, H0, Lw], k); push(C1, n, [L, H, Lw], k);
        push(A0, n, [0, H0, Lw], k); push(C1, n, [L, H, Lw], k); push(A1, n, [0, H, Lw], k);
      }
      // the roof, and an underside for a part that floats
      for (const [i, j, k] of earcut(pts)) {
        for (const q of [pts[i], pts[j], pts[k]]) push(W(q[0], q[1], H), [0, -1, 0], [q[0], q[1], 0], 1);
        if (H0 > 0) for (const q of [pts[i], pts[k], pts[j]]) push(W(q[0], q[1], H0), [0, 1, 0], [q[0], q[1], 0], 1);
      }
      if (b.name && H > 250) this.names[b.name] = [cx * PX, -cy * PX, H * PX];
    }
    const data = new Float32Array(out);
    const gl = this.gl;
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    const vb = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const S = 14 * 4;
    const at = (loc: number, n: number, off: number) => { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, S, off * 4); };
    at(0, 3, 0); at(1, 3, 3); at(2, 4, 6); at(3, 4, 10);
    gl.bindVertexArray(null);
    this.count = data.length / 14;
    this.ready = true;
  }

  draw(cam: Camera, o: LoopOpts = {}) {
    if (!this.ready || !this.vao) return;
    const gl = this.gl, p = this.prog, u = p.u, d = this.d;
    d.flush();
    gl.useProgram(p.p);
    gl.uniformMatrix4fv(u.uVP, false, cam.viewProj(d.res[0] / d.res[1]));
    gl.uniform3fv(u.uBase, o.base ?? [0.006, 0.007, 0.012]);
    gl.uniform3fv(u.uRoof, o.roof ?? [0.008, 0.009, 0.015]);
    gl.uniform3fv(u.uEdge, o.edge ?? [0.16, 0.2, 0.32]);
    gl.uniform1f(u.uEdgeI, o.edgeI ?? 1);
    gl.uniform3fv(u.uGlass, o.glass ?? [0.004, 0.005, 0.009]);
    gl.uniform4f(u.uOffice, o.office ?? 0, o.officeI ?? 1, o.reveal ?? -1e9, 0);
    gl.uniform2fv(u.uOrigin, o.origin ?? [0, 0]);
    gl.uniform4f(u.uCandle, o.candle ?? 0, o.candleI ?? 1, o.time ?? 0, 0);
    gl.uniform3fv(u.uOfficeC, o.officeC ?? [0.9, 0.86, 0.7]);
    gl.uniform3fv(u.uCandleC, o.candleC ?? [1.0, 0.55, 0.2]);
    gl.uniform3fv(u.uFlashC, o.flashC ?? [0.5, 0.55, 0.8]);
    gl.uniform1f(u.uFlash, o.flash ?? 0);
    gl.uniform3fv(u.uFlashDir, o.flashDir ?? [0.3, 0.8, 0.5]);
    gl.uniform3fv(u.uFog, o.fog ?? [0, 0, 1]);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.BLEND); gl.disable(gl.STENCIL_TEST); gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, this.count);
    gl.bindVertexArray(null);
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
    d.stats.calls++;
  }
}

/** ear clipping of a simple polygon (anticlockwise in east, north): triangles as index triples */
function earcut(pts: number[][]): [number, number, number][] {
  const n = pts.length;
  const idx = Array.from({ length: n }, (_, i) => i);
  const out: [number, number, number][] = [];
  // footprints are stored (east, south) here, so the polygon is clockwise in (east, south)
  const cross = (a: number[], b: number[], c: number[]) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const sign = Math.sign(polyArea(pts)) || 1;
  const inTri = (p: number[], a: number[], b: number[], c: number[]) => {
    const d1 = cross(a, b, p) * sign, d2 = cross(b, c, p) * sign, d3 = cross(c, a, p) * sign;
    return d1 > 0 && d2 > 0 && d3 > 0;
  };
  let guard = 0;
  while (idx.length > 3 && guard++ < n * n) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i + idx.length - 1) % idx.length], ib = idx[i], ic = idx[(i + 1) % idx.length];
      const a = pts[ia], b = pts[ib], c = pts[ic];
      if (cross(a, b, c) * sign <= 0) continue;               // reflex
      let ear = true;
      for (const j of idx) { if (j === ia || j === ib || j === ic) continue; if (inTri(pts[j], a, b, c)) { ear = false; break; } }
      if (!ear) continue;
      out.push([ia, ib, ic]);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (idx.length === 3) out.push([idx[0], idx[1], idx[2]]);
  else if (idx.length > 3) for (let i = 1; i < idx.length - 1; i++) out.push([idx[0], idx[i], idx[i + 1]]);
  return out;
}

function polyArea(pts: number[][]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return a / 2;
}

/** the one copy of downtown, shared by every scene that shows it */
export async function sharedLoop(ctx: { gl: WebGL2RenderingContext; d: Draw; data: Map<string, any> }): Promise<Loop3D> {
  if (!ctx.data.has('loop3d')) {
    const l = new Loop3D(ctx.gl, ctx.d);
    ctx.data.set('loop3d', l.load().then(() => l));
  }
  return ctx.data.get('loop3d');
}
