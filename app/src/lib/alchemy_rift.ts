// The split (verse 3, "Split the world open"): Chicago's street plan cracks along Madison Street,
// the zero line of the city's address grid, and the two halves are thrown apart as slabs with a
// thickness. Each slab's cut face is a geological section drawn in light: the street level's crust,
// the pipes and conduits under it, laminated clay, gravel, the dolomite bedrock's beds and joints,
// and fissures that glow from the seam of light far down in the chasm. None of the section is data.
//
// Plan space: the plan lies at z = 0 in pixels of the home frame (x east, y south); depth below the
// street is +z. The crack runs east-west; north of it is one slab, south of it the other.
import { DotMesh, Draw, LineMesh } from '../engine/draw';
import { compile, Prog } from '../engine/gl';
import { M4, RGBA, chain, mulberry32, rotX, rotZ, translate } from '../engine/math';
import type { CityData } from './city';

const ROAD_W = [2.6, 2.1, 1.6, 1.25, 1.0, 0.6, 0.38];
const ROAD_A = [1, 0.95, 0.85, 0.72, 0.62, 0.42, 0.28];

const WALL_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aP;   // plan x, y; depth z
layout(location=1) in vec4 aS;   // arc length along the crack, facet normal (plan, facing south), facet id
uniform mat4 uVP; uniform mat4 uModel; uniform float uSide;
out vec2 vSZ; out vec3 vN; out vec3 vW; out float vId;
void main(){
  vec4 w = uModel * vec4(aP, 1.0);
  vW = w.xyz;
  vSZ = vec2(aS.x, aP.z);
  vN = mat3(uModel) * vec3(aS.y * uSide, aS.z * uSide, 0.0);
  vId = aS.w;
  gl_Position = uVP * w;
}`;

const WALL_FS = `#version 300 es
precision highp float;
in vec2 vSZ; in vec3 vN; in vec3 vW; in float vId;
uniform float uH;        // depth of the seam below the street (px)
uniform float uLight;    // how much of the seam's light reaches the walls (0 shut .. 1 open)
uniform float uTime;
uniform vec3 uCam;
uniform vec3 uGlow;      // the seam's light
uniform vec3 uRim;       // the streets' light at the cut edge
uniform vec3 uCool;      // the night's light on the upper rock
uniform float uSeed;
out vec4 o;
float h11(float n){ return fract(sin(n * 127.1 + uSeed * 17.0 + 311.7) * 43758.5453); }
float h21(vec2 p){ p = fract(p * vec2(443.897, 441.423) + uSeed * 0.1); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
// an anti-aliased line where d = 0, half width w (in the section's px); fw is the size of a
// pixel in the section, taken once outside any branch
float FW = 1.0;
float ln(float d, float w){ return 1.0 - smoothstep(w - FW, w + FW, abs(d)); }
float wob(float s, float k){ return 5.0 * sin(s * 0.011 + k * 1.7) + 3.0 * sin(s * 0.029 + k * 4.1) + 4.0 * (vn(vec2(s * 0.018, k * 3.3)) - 0.5); }
// the colour of heat: dull red, orange, gold, white
vec3 heatC(float k){
  vec3 c0 = vec3(0.30, 0.03, 0.012), c1 = vec3(1.0, 0.22, 0.03), c2 = vec3(1.0, 0.62, 0.22), c3 = vec3(1.0, 0.93, 0.78);
  if (k < 0.33) return mix(c0, c1, k / 0.33);
  if (k < 0.66) return mix(c1, c2, (k - 0.33) / 0.33);
  return mix(c2, c3, (k - 0.66) / 0.34);
}
void main(){
  // only the face that looks into the chasm is drawn
  if (dot(vN, uCam - vW) <= 0.0) discard;
  float s = vSZ.x, z = vSZ.y;
  // seen edge-on a wall's derivatives explode: keep them finite (an inf here made NaNs, and the
  // bloom spread them into black blocks)
  FW = clamp(max(fwidth(s), fwidth(z)), 1e-3, 400.0);
  float H = uH;
  // strata: the street's crust, utilities, clay, gravel, bedrock, the deep
  float b0 = 9.0 + 0.4 * wob(s, 0.0);
  float b1 = 86.0 + wob(s, 1.0);
  float b2 = 205.0 + 1.6 * wob(s, 2.0);
  float b3 = 300.0 + 1.8 * wob(s, 3.0);
  float b4 = 560.0 + 2.5 * wob(s, 4.0);
  float b5 = 760.0 + 3.0 * wob(s, 5.0);
  float edge = ln(z - b0, 0.7) + ln(z - b1, 0.6) + ln(z - b2, 0.7) + ln(z - b3, 0.6) + ln(z - b4, 0.8) + ln(z - b5, 0.7);
  float pat = 0.0;     // faint patterns inside the strata
  float hot = 0.0;     // things that carry light of their own
  float fib = 0.0;     // fibre bundles: the hidden lines, lit from inside
  vec3 pipe = vec3(0.0);
  if (z < b1 && z > b0) {
    // utilities: pipes and conduits in section, a few fibre bundles lit from inside
    float cell = floor(s / 46.0);
    for (int k = -1; k <= 1; k++) {
      float c = cell + float(k);
      float hp = h11(c * 1.37 + 2.0);
      if (hp < 0.3) continue;
      float r = 3.0 + 11.0 * h11(c * 2.11 + 5.0);
      vec2 ctr = vec2(c * 46.0 + 23.0 + (h11(c * 3.7) - 0.5) * 20.0, mix(b0 + r + 4.0, b1 - r - 4.0, h11(c * 5.3 + 1.0)));
      float dd = length(vec2(s, z) - ctr) - r;
      float ring = ln(dd, 0.75);
      if (h11(c * 7.1) > 0.72) {
        // a fibre conduit: a ring of bright cores
        vec2 q = vec2(s, z) - ctr;
        float a = atan(q.y, q.x);
        float cores = ln(length(q) - r * 0.55, 0.9) * smoothstep(0.2, 0.9, sin(a * 5.0 + c));
        fib += cores;
        pipe += vec3(0.6) * ring;
      } else {
        pipe += vec3(1.0) * ring;
      }
    }
  } else if (z < b2) {
    // laminated clay: thin wavy layers
    float zz = z + 3.0 * sin(s * 0.02 + z * 0.05);
    pat += 0.55 * ln((fract(zz / 7.0) - 0.5) * 7.0, 0.45) * step(0.35, vn(vec2(s * 0.015, floor(zz / 7.0))));
  } else if (z < b3) {
    // gravel and sand: a stipple
    vec2 g = vec2(s, z) / 7.0;
    vec2 id = floor(g), f = fract(g) - 0.5;
    float r = h21(id);
    vec2 off = vec2(h21(id + 3.1), h21(id + 5.7)) - 0.5;
    float dd = length(f - off * 0.5);
    pat += (r > 0.45 ? 1.0 - smoothstep(0.12, 0.12 + FW / 7.0 * 1.5, dd) : 0.0) * 0.8;
  } else if (z < b4) {
    // dolomite: beds and the joints across them, offset bed by bed like masonry
    float bed = floor((z - b3) / 34.0);
    float per = 70.0 + 50.0 * h11(bed + 3.0);
    float j = s / per + h11(bed) * 3.0;
    pat += 0.7 * ln((fract(j) - 0.5) * per, 0.6) * step(0.25, h11(floor(j) + bed * 13.0));
    pat += 0.5 * ln(z - b3 - (bed + 1.0) * 34.0, 0.5);
  } else if (z < b5) {
    // older beds, thicker, with long cracks
    float bed = floor((z - b4) / 52.0);
    pat += 0.45 * ln(z - b4 - (bed + 1.0) * 52.0 + 4.0 * sin(s * 0.013 + bed), 0.6);
  }
  // fissures that glow from below: jagged, a few, brighter deeper
  {
    float c = floor(s / 80.0);
    float fx = c * 80.0 + 40.0 + (h11(c * 9.1) - 0.5) * 50.0;
    float top = mix(b3, b5, h11(c * 4.3));
    float jag = 14.0 * (vn(vec2(z * 0.035, c * 1.7)) - 0.5) + 6.0 * (vn(vec2(z * 0.12, c * 2.9)) - 0.5);
    float fis = ln(s - fx - jag, 0.5 + 0.9 * smoothstep(top, H, z)) * smoothstep(top, top + 120.0, z) * step(0.62, h11(c * 6.7));
    hot += fis * smoothstep(top, H, z) * 1.6;
  }
  // light: the seam far down, its heat climbing the walls as the chasm opens (dull red high up,
  // through orange and gold to white near it); the night's cold on the upper rock; the street's
  // light along the cut edge
  float dz = max(H - z, 0.0);
  float I = uLight * (exp(-dz / 150.0) * 2.4 + exp(-dz / 430.0) * 0.75 + 0.03);
  vec3 heat = heatC(clamp(I * 0.45, 0.0, 1.0));
  float facet = 0.85 + 0.3 * h11(vId * 1.31 + 0.5);
  vec3 rock = vec3(0.020, 0.015, 0.013) * facet;
  vec3 c = uCool * 0.03 * exp(-z / 170.0) * (1.0 - 0.6 * clamp(I, 0.0, 1.0)) + rock * (0.25 + I * 0.9) * heat * 3.0;
  // the strata's edges and textures catch the light more than the faces between them
  c += heat * (edge * (0.12 + 0.9 * I) + pat * (0.04 + 0.38 * I)) * facet;
  c += mix(uCool * 0.5, heat, smoothstep(0.0, 0.6, I)) * edge * 0.18 * exp(-z / 260.0);
  c += heatC(1.0) * hot * (0.3 + I) * uLight;
  c += vec3(0.55, 0.8, 1.0) * fib * 1.3;
  c += mix(uRim, heat, 0.3) * pipe * (0.22 + 0.5 * exp(-z / 60.0) + 0.5 * I);
  c += uRim * (exp(-z / 3.5) * 1.6 + ln(z - b0, 0.8) * 0.35);
  // the air of the chasm glows near the seam
  c += heat * smoothstep(H * 0.55, H, z) * 0.25 * uLight;
  if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);
  o = vec4(c, 1.0);
}`;

// the chasm's floor: a river of light along the seam, slow currents running in it
const FLOOR_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aP;
uniform mat4 uVP; uniform float uZ;
out vec2 vP;
void main(){ vP = aP; gl_Position = uVP * vec4(aP, uZ, 1.0); }`;

const FLOOR_FS = `#version 300 es
precision highp float;
in vec2 vP;
uniform sampler2D uJ;    // the crack's offset north of its line, along x
uniform vec3 uJx;        // x0, step, count
uniform float uCy; uniform float uTime; uniform float uGap; uniform float uLight;
uniform vec3 uHot; uniform vec3 uWarm; uniform vec3 uDeep;
out vec4 o;
float h21(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * vn(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
vec3 heat(float k){
  vec3 c0 = vec3(0.30, 0.03, 0.012), c1 = vec3(1.0, 0.22, 0.03), c2 = vec3(1.0, 0.62, 0.22), c3 = vec3(1.0, 0.93, 0.78);
  if (k < 0.33) return mix(c0, c1, k / 0.33);
  if (k < 0.66) return mix(c1, c2, (k - 0.33) / 0.33);
  return mix(c2, c3, (k - 0.66) / 0.34);
}
void main(){
  float f = (vP.x - uJx.x) / uJx.y;
  float j = texture(uJ, vec2((clamp(f, 0.0, uJx.z - 1.0) + 0.5) / uJx.z, 0.5)).r;
  float dy = vP.y - (uCy - j);
  float w = max(uGap * 0.5, 6.0);
  float a = abs(dy);
  // currents: noise carried along the seam, crusts darkening on the slower water at its edges
  float n = fbm(vec2(vP.x / 90.0 - uTime * 0.9, dy / 40.0)) * 0.65 + fbm(vec2(vP.x / 26.0 + uTime * 1.7, dy / 12.0)) * 0.35;
  float crust = smoothstep(0.45, 0.7, fbm(vec2(vP.x / 34.0 - uTime * 0.4, dy / 18.0) + 7.0)) * smoothstep(w * 0.25, w * 0.9, a);
  float k = exp(-a / (w * 0.45)) * (0.6 + 0.8 * n);
  vec3 c = heat(clamp(k, 0.0, 1.0)) * (0.35 + 2.2 * k) * (1.0 - 0.75 * crust);
  c += uHot * exp(-a / 5.0) * 2.6 + uHot * exp(-a / 22.0) * 0.6;
  c += heat(0.25) * exp(-a / (w * 1.5)) * 0.35;
  c *= uLight;
  if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);
  o = vec4(c, 1.0);
}`;

export class Rift {
  /** px per metre of the plan, and where the city's zero (State & Madison) lies */
  readonly S: number; readonly ox: number; readonly oy: number;
  /** the line the crack follows (y of Madison Street in plan px) and its run along x */
  readonly cy: number; readonly x0: number; readonly x1: number; readonly step: number;
  /** the crack's offset north of the line at each node */
  readonly J: Float32Array;
  readonly H: number;
  halves: LineMesh[] = [];
  water: LineMesh[] = [];
  lamps: DotMesh[] = [];
  /** street pieces close to the crack, which break off and fall: x0 y0 x1 y1 side width */
  loose: number[][] = [];
  /** the two top faces, as contours in plan px */
  top: number[][] = [];
  /** the lake's shore: the easternmost street in each band of y (plan px), from y0 every dy */
  shore: { y0: number; dy: number; x: Float32Array } = { y0: 0, dy: 1, x: new Float32Array(0) };
  private wall: { vao: WebGLVertexArrayObject; count: number };
  private prog: Prog;
  private floorProg: Prog;
  private floorVao: WebGLVertexArrayObject;
  private jTex: WebGLTexture;

  constructor(public d: Draw, city: CityData, o: { S: number; ox: number; oy: number; x0: number; x1: number; step?: number; H?: number; seed?: number }) {
    this.S = o.S; this.ox = o.ox; this.oy = o.oy;
    this.cy = o.oy;           // Madison Street: y = 0 m
    this.x0 = o.x0; this.x1 = o.x1; this.step = o.step ?? 22; this.H = o.H ?? 900;
    const rnd = mulberry32(o.seed ?? 71);
    const K = Math.ceil((this.x1 - this.x0) / this.step) + 1;
    this.J = new Float32Array(K);
    let prev = 0;
    for (let k = 0; k < K; k++) {
      const x = this.x0 + k * this.step;
      // a fracture: a slow wander off the street's line, and the jag of a fresh break
      const low = 16 * Math.sin(x / 520 + 1.3) + 9 * Math.sin(x / 197 + 0.4);
      const zig = (rnd() * 2 - 1) * 9;
      this.J[k] = low + zig + prev * 0.35;
      prev = zig;
    }
    this.buildStreets(city, rnd);
    this.buildShore(city);
    this.buildTop();
    this.prog = compile(d.gl, WALL_VS, WALL_FS, 'riftWall');
    this.wall = this.buildWall();
    this.floorProg = compile(d.gl, FLOOR_VS, FLOOR_FS, 'riftFloor');
    const gl = d.gl;
    this.floorVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.floorVao);
    const fb = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, fb);
    const fy0 = this.cy - 1400, fy1 = this.cy + 1400;
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([this.x0, fy0, this.x1, fy0, this.x0, fy1, this.x0, fy1, this.x1, fy0, this.x1, fy1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.bindVertexArray(null);
    // the crack's offsets as a 1-pixel-high float texture, for the floor's seam
    this.jTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.jTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, this.J.length, 1, 0, gl.RED, gl.FLOAT, this.J);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  /** the crack's offset north of Madison's line at plan x */
  jag(x: number): number {
    const f = (x - this.x0) / this.step;
    const i = Math.max(0, Math.min(this.J.length - 2, Math.floor(f)));
    const t = Math.max(0, Math.min(1, f - i));
    return this.J[i] + (this.J[i + 1] - this.J[i]) * t;
  }
  /** y of the crack at plan x */
  crackY(x: number): number { return this.cy - this.jag(x); }
  /** > 0 north of the crack, < 0 south; |value| ~ distance in px */
  side(x: number, y: number): number { return this.crackY(x) - y; }

  private buildStreets(city: CityData, rnd: () => number) {
    const S = this.S, ox = this.ox, oy = this.oy;
    const segN: number[][] = [[], []], lampN: number[][] = [[], []], waterN: number[][] = [[], []];
    const push = (out: number[][], ax: number, ay: number, bx: number, by: number, w: number, a: number) => {
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      const sd = this.side(mx, my);
      out[sd > 0 ? 0 : 1].push(ax, ay, 0, bx, by, 0, 1, 1, 1, a, w, Math.abs(sd), mx);
    };
    const clip = (out: number[][], ax: number, ay: number, bx: number, by: number, w: number, a: number) => {
      const sa = this.side(ax, ay), sb = this.side(bx, by);
      if ((sa > 0) === (sb > 0)) { push(out, ax, ay, bx, by, w, a); return; }
      // the street is cut where the crack crosses it
      let lo = 0, hi = 1;
      for (let i = 0; i < 18; i++) {
        const m = (lo + hi) / 2;
        const sm = this.side(ax + (bx - ax) * m, ay + (by - ay) * m);
        if ((sm > 0) === (sa > 0)) lo = m; else hi = m;
      }
      const cx = ax + (bx - ax) * lo, cyy = ay + (by - ay) * lo;
      const dx = ax + (bx - ax) * hi, dyy = ay + (by - ay) * hi;
      push(out, ax, ay, cx, cyy, w, a);
      push(out, dx, dyy, bx, by, w, a);
    };
    const roads = [city.major, city.streets];
    for (const segs of roads) {
      const n = segs.length / 6;
      for (let i = 0; i < n; i++) {
        const cls = segs[i * 6 + 4];
        const ax = ox + S * segs[i * 6], ay = oy + S * segs[i * 6 + 1], bx = ox + S * segs[i * 6 + 2], by = oy + S * segs[i * 6 + 3];
        const w = ROAD_W[cls] ?? 0.5, a = ROAD_A[cls] ?? 0.4;
        clip(segN, ax, ay, bx, by, w, a);
        // pieces of the bigger streets right at the crack break off and fall
        if (cls <= 4 && rnd() < 0.5) {
          const mx = (ax + bx) / 2, my = (ay + by) / 2, sd = this.side(mx, my);
          if (Math.abs(sd) < 14 && mx > -600 && mx < 2600 && Math.hypot(bx - ax, by - ay) > 1.5) this.loose.push([ax, ay, bx, by, sd > 0 ? 0 : 1, w]);
        }
        // lamps every 85 m along the streets (not the service roads)
        if (cls <= 5) {
          const L = Math.hypot(bx - ax, by - ay) / S;
          for (let s = rnd() * 85; s < L; s += 85) {
            const t = s / L;
            const x = ax + (bx - ax) * t + (rnd() - 0.5) * 0.4, y = ay + (by - ay) * t + (rnd() - 0.5) * 0.4;
            const sd = this.side(x, y);
            lampN[sd > 0 ? 0 : 1].push(x, y, 0, 1, 1, 1, 1, cls <= 2 ? 1.25 : 1.0, 0.55, Math.abs(sd), rnd());
          }
        }
      }
    }
    {
      const segs = city.water, n = segs.length / 6;
      for (let i = 0; i < n; i++) {
        const cls = segs[i * 6 + 4];
        const ax = ox + S * segs[i * 6], ay = oy + S * segs[i * 6 + 1], bx = ox + S * segs[i * 6 + 2], by = oy + S * segs[i * 6 + 3];
        clip(waterN, ax, ay, bx, by, cls === 0 ? 1.6 : 1.0, cls === 0 ? 1 : 0.8);
      }
    }
    this.halves = segN.map((s) => this.d.makeLines(new Float32Array(s)));
    this.water = waterN.map((s) => this.d.makeLines(new Float32Array(s)));
    this.lamps = lampN.map((s) => this.d.makeDots(new Float32Array(s)));
  }

  /** the shore of the lake, from the city's own streets: Lake Shore Drive runs along it */
  private buildShore(city: CityData) {
    const S = this.S, ox = this.ox, oy = this.oy;
    const y0 = oy - 2600, y1 = oy + 2600, dy = 8;
    const n = Math.ceil((y1 - y0) / dy);
    const xs = new Float32Array(n).fill(-1e9);
    for (const segs of [city.major, city.streets]) {
      for (let i = 0; i < segs.length; i += 6) {
        for (const k of [0, 2]) {
          const x = ox + S * segs[i + k], y = oy + S * segs[i + k + 1];
          const j = Math.floor((y - y0) / dy);
          if (j >= 0 && j < n && x > xs[j]) xs[j] = x;
        }
      }
    }
    // fill gaps, then smooth: the shore is a soft line, a little off the last street
    for (let j = 1; j < n; j++) if (xs[j] < -1e8) xs[j] = xs[j - 1];
    for (let j = n - 2; j >= 0; j--) if (xs[j] < -1e8) xs[j] = xs[j + 1];
    const sm = new Float32Array(n);
    for (let j = 0; j < n; j++) {
      let m = -1e9;
      for (let k = -3; k <= 3; k++) m = Math.max(m, xs[Math.max(0, Math.min(n - 1, j + k))]);
      sm[j] = m + 6;
    }
    this.shore = { y0, dy, x: sm };
  }
  shoreX(y: number): number {
    const s = this.shore, j = Math.max(0, Math.min(s.x.length - 1, Math.floor((y - s.y0) / s.dy)));
    return s.x[j];
  }

  /** the crack as a polyline of plan points (x, y) from x0 to x1 */
  edge(from = this.x0, to = this.x1): number[] {
    const out: number[] = [];
    const k0 = Math.max(0, Math.floor((from - this.x0) / this.step)), k1 = Math.min(this.J.length - 1, Math.ceil((to - this.x0) / this.step));
    for (let k = k0; k <= k1; k++) {
      const x = Math.min(to, Math.max(from, this.x0 + k * this.step));
      out.push(x, this.crackY(x));
    }
    return out;
  }

  private buildTop() {
    const e = this.edge();
    const far = 9000;
    const north: number[] = [...e, this.x1, this.cy - far, this.x0, this.cy - far];
    const south: number[] = [];
    for (let i = e.length - 2; i >= 0; i -= 2) south.push(e[i], e[i + 1]);
    south.push(this.x0, this.cy + far, this.x1, this.cy + far);
    this.top = [north, south];
  }

  private buildWall() {
    const gl = this.d.gl;
    const e = this.edge();
    const H = this.H + 220;
    const v: number[] = [];
    let s = 0;
    for (let i = 0; i + 3 < e.length; i += 2) {
      const ax = e[i], ay = e[i + 1], bx = e[i + 2], by = e[i + 3];
      const L = Math.hypot(bx - ax, by - ay) || 1;
      // the facet's normal in the plan, facing south (toward the south slab)
      const nx = -(by - ay) / L, ny = (bx - ax) / L;
      const id = i / 2;
      const P = (x: number, y: number, z: number, ss: number) => v.push(x, y, z, ss, nx, ny, id);
      P(ax, ay, 0, s); P(ax, ay, H, s); P(bx, by, 0, s + L);
      P(bx, by, 0, s + L); P(ax, ay, H, s); P(bx, by, H, s + L);
      s += L;
    }
    const data = new Float32Array(v);
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 12);
    gl.bindVertexArray(null);
    return { vao, count: data.length / 7 };
  }

  /** the motion of a slab: apart by half the gap, its cut edge sagging toward the chasm, a yaw */
  model(side: 0 | 1, gap: number, sag: number, yaw: number, pivotX: number): M4 {
    const sg = side === 0 ? -1 : 1;           // north moves north (-y), south moves south
    const R = 1400;                           // the slab tips about a line this far from the crack
    const py = this.cy + sg * R;
    return chain(
      translate(0, sg * gap / 2, 0),
      translate(pivotX, this.cy, 0), rotZ(sg * yaw), translate(-pivotX, -this.cy, 0),
      translate(0, py, 0), rotX(-sg * sag), translate(0, -py, 0),
    );
  }

  /** the floor of light at depth z, along the seam; drawn with the depth test, writing depth */
  drawFloor(z: number, o: { gap: number; light: number; time: number; hot: RGBA; warm: RGBA; deep: RGBA }) {
    const d = this.d, gl = d.gl, p = this.floorProg;
    d.flush();
    gl.useProgram(p.p);
    gl.uniformMatrix4fv(p.u.uVP, false, d.vp);
    gl.uniform1f(p.u.uZ, z);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.jTex);
    gl.uniform1i(p.u.uJ, 0);
    gl.uniform3f(p.u.uJx, this.x0, this.step, this.J.length);
    gl.uniform1f(p.u.uCy, this.cy);
    gl.uniform1f(p.u.uTime, o.time);
    gl.uniform1f(p.u.uGap, o.gap);
    gl.uniform1f(p.u.uLight, o.light);
    gl.uniform3f(p.u.uHot, o.hot[0], o.hot[1], o.hot[2]);
    gl.uniform3f(p.u.uWarm, o.warm[0], o.warm[1], o.warm[2]);
    gl.uniform3f(p.u.uDeep, o.deep[0], o.deep[1], o.deep[2]);
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
    gl.disable(gl.STENCIL_TEST); gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(this.floorVao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
    gl.depthMask(false);
    d.stats.calls++;
  }

  /** the cut faces: drawn with the depth test, writing depth */
  drawWall(m: M4, side: 0 | 1, o: { light: number; time: number; cam: [number, number, number]; glow: RGBA; rim: RGBA; cool?: RGBA }) {
    const d = this.d, gl = d.gl, p = this.prog;
    d.flush();
    gl.useProgram(p.p);
    gl.uniformMatrix4fv(p.u.uVP, false, d.vp);
    gl.uniformMatrix4fv(p.u.uModel, false, m);
    gl.uniform1f(p.u.uSide, side === 0 ? 1 : -1);
    gl.uniform1f(p.u.uH, this.H);
    gl.uniform1f(p.u.uLight, o.light);
    gl.uniform1f(p.u.uTime, o.time);
    gl.uniform3fv(p.u.uCam, o.cam);
    gl.uniform3f(p.u.uGlow, o.glow[0], o.glow[1], o.glow[2]);
    gl.uniform3f(p.u.uRim, o.rim[0], o.rim[1], o.rim[2]);
    const c = o.cool || [0.3, 0.4, 0.7, 1];
    gl.uniform3f(p.u.uCool, c[0], c[1], c[2]);
    gl.uniform1f(p.u.uSeed, side === 0 ? 1.3 : 4.7);
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
    gl.disable(gl.STENCIL_TEST); gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(this.wall.vao);
    gl.drawArrays(gl.TRIANGLES, 0, this.wall.count);
    gl.bindVertexArray(null);
    gl.depthMask(false);
    d.stats.calls++;
  }
}

/** values through keyframes [time, values] on a smooth curve (Catmull-Rom tangents) that never
 *  comes to rest: before the first key and after the last it carries on at the speed it had */
export function track(t: number, keys: [number, number[]][]): number[] {
  const n = keys.length;
  const tan = (i: number, j: number) => {
    const a = keys[Math.max(0, i - 1)], b = keys[Math.min(n - 1, i + 1)];
    return (b[1][j] - a[1][j]) / Math.max(1e-6, b[0] - a[0]);
  };
  const m = keys[0][1].length;
  if (t <= keys[0][0]) return keys[0][1].map((v, j) => v + tan(0, j) * (t - keys[0][0]));
  if (t >= keys[n - 1][0]) return keys[n - 1][1].map((v, j) => v + tan(n - 1, j) * (t - keys[n - 1][0]));
  let i = 0;
  while (i < n - 2 && t > keys[i + 1][0]) i++;
  const [t0, p0] = keys[i], [t1, p1] = keys[i + 1];
  const h = t1 - t0, u = (t - t0) / h;
  const h00 = 2 * u * u * u - 3 * u * u + 1, h10 = u * u * u - 2 * u * u + u, h01 = -2 * u * u * u + 3 * u * u, h11 = u * u * u - u * u;
  const out: number[] = [];
  for (let j = 0; j < m; j++) out.push(h00 * p0[j] + h10 * h * tan(i, j) + h01 * p1[j] + h11 * h * tan(i + 1, j));
  return out;
}
