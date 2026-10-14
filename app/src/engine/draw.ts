// Immediate-mode drawing on the GPU: anti-aliased lines with round caps (screen- or world-width),
// filled shapes by stencil-then-cover (nonzero, any contours, any holes), soft dots, textured quads.
// Colours are linear RGB; light may exceed 1 and blooms in post.
import { Camera } from './camera';
import { H, W, compile, Prog } from './gl';
import { M4, RGBA, V3, m4 } from './math';

export type Blend = 'alpha' | 'add' | 'max' | 'multiply' | 'replace';

const LINE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 corner;
layout(location=1) in vec3 aA;
layout(location=2) in vec3 aB;
layout(location=3) in vec4 aCA;
layout(location=4) in vec4 aCB;
layout(location=5) in vec2 aW;     // width at A, at B
layout(location=6) in vec2 aD;     // distance along the line at A, at B (world units)
uniform mat4 uVP;
uniform mat4 uModel;
uniform vec2 uRes;      // physical pixels
uniform float uPx;      // physical pixels per logical pixel
uniform float uWorldW;  // 1: widths are world units
uniform float uFocal;   // logical pixels per world unit at view depth 1
uniform vec3 uFog;      // start, end (view depth), floor
out vec4 vC;
out vec2 vL;            // x along segment from A (px), y across (px)
out float vLen;
out vec2 vHW;           // half widths at A, B (px)
out float vDist;        // world distance along line
out float vDistPx;
void main(){
  vec4 ca = uVP * uModel * vec4(aA, 1.0);
  vec4 cb = uVP * uModel * vec4(aB, 1.0);
  float nearW = 0.5;
  if (ca.w < nearW && cb.w < nearW) { gl_Position = vec4(3.0, 3.0, 3.0, 1.0); return; }
  float ta = 0.0, tb = 1.0;
  if (ca.w < nearW) { float k = (nearW - ca.w) / (cb.w - ca.w); ca = mix(ca, cb, k); ta = k; }
  if (cb.w < nearW) { float k = (nearW - cb.w) / (ca.w - cb.w); cb = mix(cb, ca, k); tb = 1.0 - k; }
  vec2 sa = (ca.xy / ca.w * 0.5 + 0.5) * uRes;
  vec2 sb = (cb.xy / cb.w * 0.5 + 0.5) * uRes;
  vec2 d = sb - sa;
  float L = length(d);
  vec2 dir = L > 1e-5 ? d / L : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  float wa = mix(aW.x, aW.y, ta), wb = mix(aW.x, aW.y, tb);
  float hwa, hwb;
  if (uWorldW > 0.5) { hwa = 0.5 * wa * uFocal * uPx / ca.w; hwb = 0.5 * wb * uFocal * uPx / cb.w; }
  else { hwa = 0.5 * wa * uPx; hwb = 0.5 * wb * uPx; }
  hwa = max(hwa, 0.0); hwb = max(hwb, 0.0);
  float hw = max(hwa, hwb) + 1.5;
  float e = corner.x * 0.5 + 0.5;          // 0 at A, 1 at B
  vec2 base = mix(sa, sb, e);
  vec2 p = base + dir * corner.x * hw + nrm * corner.y * hw;
  float za = ca.z / ca.w, zb = cb.z / cb.w;
  gl_Position = vec4(p / uRes * 2.0 - 1.0, mix(za, zb, e), 1.0);
  vC = mix(aCA, aCB, mix(ta, tb, e));
  if (uFog.y > uFog.x) vC.a *= mix(uFog.z, 1.0, 1.0 - smoothstep(uFog.x, uFog.y, mix(ca.w, cb.w, e)));
  vL = vec2(e * L + corner.x * hw, corner.y * hw);
  vLen = L;
  vHW = vec2(hwa, hwb);
  vDist = mix(mix(aD.x, aD.y, ta), mix(aD.x, aD.y, tb), e);
  vDistPx = e * L;
}`;

const LINE_FS = `#version 300 es
precision highp float;
in vec4 vC; in vec2 vL; in float vLen; in vec2 vHW; in float vDist; in float vDistPx;
uniform vec4 uDash;   // period, duty (0..1), offset, enabled
uniform float uSquare; // 1 = butt caps
uniform float uGlow;   // 0 = hard edge; >0 = gaussian falloff added outside the core
out vec4 o;
void main(){
  float x = clamp(vL.x, 0.0, vLen);
  float hw = mix(vHW.x, vHW.y, vLen > 0.0 ? x / vLen : 0.0);
  float dist;
  if (uSquare > 0.5) {
    if (vL.x < 0.0 || vL.x > vLen) discard;
    dist = abs(vL.y);
  } else {
    dist = length(vec2(vL.x - x, vL.y));
  }
  float a = clamp(hw - dist + 0.5, 0.0, 1.0);
  if (hw < 0.5) a *= hw * 2.0;           // sub-pixel lines fade instead of thinning
  if (uGlow > 0.0) { a = max(a, exp(-dist * dist / (2.0 * uGlow * uGlow)) * 0.55); }
  if (uDash.w > 0.5) {
    float ph = fract((vDist + uDash.z) / uDash.x);
    float edge = 0.5 * fwidth(vDist / uDash.x) + 1e-4;
    a *= smoothstep(0.0, edge, ph) * (1.0 - smoothstep(uDash.y - edge, uDash.y, ph));
  }
  if (a <= 0.002) discard;
  o = vec4(vC.rgb * vC.a * a, vC.a * a);
}`;

const FILL_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aP;
uniform mat4 uVP;
uniform mat4 uModel;
out vec2 vP;
void main(){ vP = aP; gl_Position = uVP * uModel * vec4(aP, 0.0, 1.0); }`;

const FILL_FS = `#version 300 es
precision highp float;
in vec2 vP;
uniform vec4 uC0;
uniform vec4 uC1;
uniform vec4 uGrad;   // x0,y0,x1,y1 in local units; if x0==x1 && y0==y1 -> solid
uniform float uMode;  // 0 solid/linear, 1 radial (centre x0,y0, radius = |p1-p0|)
out vec4 o;
void main(){
  vec4 c = uC0;
  vec2 g0 = uGrad.xy, g1 = uGrad.zw;
  vec2 dg = g1 - g0;
  float dd = dot(dg, dg);
  if (dd > 0.0) {
    float t = uMode > 0.5 ? clamp(length(vP - g0) / sqrt(dd), 0.0, 1.0) : clamp(dot(vP - g0, dg) / dd, 0.0, 1.0);
    c = mix(uC0, uC1, t);
  }
  o = vec4(c.rgb * c.a, c.a);
}`;

const DOT_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 corner;
layout(location=1) in vec3 aP;
layout(location=2) in vec4 aC;
layout(location=3) in vec2 aR;     // radius, softness (0 hard disc .. 1 gaussian)
uniform mat4 uVP;
uniform mat4 uModel;
uniform vec2 uRes;
uniform float uPx;
uniform float uWorldW;
uniform float uFocal;
out vec4 vC; out vec2 vQ; out float vR; out float vSoft;
void main(){
  vec4 c = uVP * uModel * vec4(aP, 1.0);
  if (c.w < 0.5) { gl_Position = vec4(3.0, 3.0, 3.0, 1.0); return; }
  float r = uWorldW > 0.5 ? aR.x * uFocal * uPx / c.w : aR.x * uPx;
  float ext = r * (aR.y > 0.0 ? 3.0 : 1.0) + 1.5;
  vec2 s = (c.xy / c.w * 0.5 + 0.5) * uRes + corner * ext;
  gl_Position = vec4(s / uRes * 2.0 - 1.0, c.z / c.w, 1.0);
  vC = aC; vQ = corner * ext; vR = r; vSoft = aR.y;
}`;

const DOT_FS = `#version 300 es
precision highp float;
in vec4 vC; in vec2 vQ; in float vR; in float vSoft;
out vec4 o;
void main(){
  float d = length(vQ);
  float hard = clamp(vR - d + 0.5, 0.0, 1.0);
  if (vR < 0.5) hard *= vR * 2.0;
  float a = hard;
  if (vSoft > 0.0) {
    float g = exp(-d * d / (2.0 * vR * vR * 0.6));
    a = mix(hard, g, vSoft);
  }
  if (a < 0.002) discard;
  o = vec4(vC.rgb * vC.a * a, vC.a * a);
}`;

const IMG_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aP;
layout(location=1) in vec2 aUV;
uniform mat4 uVP;
uniform mat4 uModel;
out vec2 vUV;
void main(){ vUV = aUV; gl_Position = uVP * uModel * vec4(aP, 1.0); }`;

const IMG_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform vec4 uTint;
uniform vec4 uLevels;   // black point, white point, gamma, mode (0 rgb, 1 luminance as light)
uniform vec4 uLight;    // colour for luminance mode
out vec4 o;
void main(){
  vec4 t = texture(uTex, vUV);
  vec3 c = t.rgb;
  if (uLevels.w > 0.5) {
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    l = clamp((l - uLevels.x) / max(uLevels.y - uLevels.x, 1e-4), 0.0, 1.0);
    l = pow(l, uLevels.z);
    c = uLight.rgb * l;
  }
  vec4 r = vec4(c * uTint.rgb, t.a * uTint.a);
  o = vec4(r.rgb * r.a, r.a);
}`;

// ---------------------------------------------------------------------------------------------

/** a filled shape kept on the GPU: triangle fans for the stencil, and its bounding box */
export type FillMesh = { vbo: WebGLBuffer; count: number; bbox: [number, number, number, number] };

/** a static set of segments kept on the GPU (city streets, coastlines...), drawn with keys */
export type LineMesh = { vao: WebGLVertexArrayObject; vbo: WebGLBuffer; count: number };

/** a textured triangle mesh (the globe) */
export type TexMesh = { vao: WebGLVertexArrayObject; count: number };

/** a static set of dots (street lamps, windows, cities), drawn with keys */
export type DotMesh = { vao: WebGLVertexArrayObject; count: number };

export type Paint = RGBA | { c0: RGBA; c1: RGBA; from: [number, number]; to: [number, number]; radial?: boolean };

const LINE_FLOATS = 18;
const DOT_FLOATS = 9;

export class Draw {
  gl: WebGL2RenderingContext;
  vp: M4 = m4();
  cam: Camera = new Camera();
  model: M4 = m4();
  px: number;
  res: [number, number];
  private lineProg: Prog;
  private fillProg: Prog;
  private dotProg: Prog;
  private imgProg: Prog;
  private meshProg: Prog;
  private dotMeshProg: Prog;
  private quadBuf: WebGLBuffer;
  private lineVao: WebGLVertexArrayObject;
  private lineBuf: WebGLBuffer;
  private lineData = new Float32Array(LINE_FLOATS * 65536);
  private nLines = 0;
  private lineState = { worldW: 0, dash: [0, 0, 0, 0] as number[], square: 0, glow: 0, blend: 'max' as Blend, fog: [0, 0, 1] as number[] };
  private dotVao: WebGLVertexArrayObject;
  private dotBuf: WebGLBuffer;
  private dotData = new Float32Array(DOT_FLOATS * 65536);
  private nDots = 0;
  private dotState = { worldW: 0, blend: 'add' as Blend };
  private fillVao: WebGLVertexArrayObject;
  private fillBuf: WebGLBuffer;
  private coverBuf: WebGLBuffer;
  private imgVao: WebGLVertexArrayObject;
  private imgBuf: WebGLBuffer;
  private depthOn = false;
  stats = { lines: 0, fills: 0, dots: 0, calls: 0 };

  constructor(gl: WebGL2RenderingContext, physW: number, physH: number) {
    this.gl = gl;
    this.res = [physW, physH];
    this.px = physW / W;
    this.lineProg = compile(gl, LINE_VS, LINE_FS, 'line');
    this.fillProg = compile(gl, FILL_VS, FILL_FS, 'fill');
    this.dotProg = compile(gl, DOT_VS, DOT_FS, 'dot');
    this.imgProg = compile(gl, IMG_VS, IMG_FS, 'image');
    this.meshProg = compile(gl, MESH_VS, LINE_FS_MESH, 'lineMesh');
    this.dotMeshProg = compile(gl, DOTMESH_VS, DOT_FS, 'dotMesh');

    this.quadBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    // lines
    this.lineVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.lineVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    this.lineBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.lineData.byteLength, gl.DYNAMIC_DRAW);
    const S = LINE_FLOATS * 4;
    const attr = (loc: number, n: number, off: number) => {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, n, gl.FLOAT, false, S, off * 4);
      gl.vertexAttribDivisor(loc, 1);
    };
    attr(1, 3, 0); attr(2, 3, 3); attr(3, 4, 6); attr(4, 4, 10); attr(5, 2, 14); attr(6, 2, 16);
    gl.bindVertexArray(null);

    // dots
    this.dotVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.dotVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    this.dotBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dotBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.dotData.byteLength, gl.DYNAMIC_DRAW);
    const SD = DOT_FLOATS * 4;
    const dattr = (loc: number, n: number, off: number) => {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, n, gl.FLOAT, false, SD, off * 4);
      gl.vertexAttribDivisor(loc, 1);
    };
    dattr(1, 3, 0); dattr(2, 4, 3); dattr(3, 2, 7);
    gl.bindVertexArray(null);

    // fills
    this.fillVao = gl.createVertexArray()!;
    this.fillBuf = gl.createBuffer()!;
    this.coverBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.fillBuf);
    gl.bufferData(gl.ARRAY_BUFFER, 4 * 2 * 1_000_000, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.coverBuf);
    gl.bufferData(gl.ARRAY_BUFFER, 4 * 12, gl.DYNAMIC_DRAW);

    // images
    this.imgVao = gl.createVertexArray()!;
    this.imgBuf = gl.createBuffer()!;
    gl.bindVertexArray(this.imgVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.imgBuf);
    gl.bufferData(gl.ARRAY_BUFFER, 4 * 5 * 6, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
    gl.bindVertexArray(null);
  }

  // ---------------------------------------------------------------- state
  setCamera(c: Camera) { this.flush(); this.cam = c; this.vp = c.viewProj(); }
  setModel(m: M4 | null) { this.flush(); this.model = m || m4(); }
  depth(on: boolean) { this.flush(); this.depthOn = on; }
  focal(): number { return (H / 2) / Math.tan(this.cam.fov / 2); }

  private applyBlend(b: Blend) {
    const gl = this.gl;
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    switch (b) {
      case 'alpha': gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); break;
      case 'add': gl.blendFunc(gl.ONE, gl.ONE); break;
      case 'max': gl.blendEquation(gl.MAX); break;
      case 'multiply': gl.blendFunc(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA); break;
      case 'replace': gl.disable(gl.BLEND); break;
    }
  }
  private applyDepth(write = true) {
    const gl = this.gl;
    if (this.depthOn) { gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(write); }
    else { gl.disable(gl.DEPTH_TEST); gl.depthMask(false); }
  }

  flush() { this.flushLines(); this.flushDots(); }

  // ---------------------------------------------------------------- lines
  /** set line style for the following segments (flushes if it changes) */
  lineStyle(o: { world?: boolean; dash?: [number, number, number?] | null; square?: boolean; glow?: number; blend?: Blend; fog?: [number, number, number] } = {}) {
    const s = this.lineState;
    const worldW = o.world ? 1 : 0;
    const dash = o.dash ? [o.dash[0], o.dash[1], o.dash[2] || 0, 1] : [0, 0, 0, 0];
    const square = o.square ? 1 : 0;
    const glow = o.glow || 0;
    // light strokes take the brighter of what is there and what is drawn, so a polyline's
    // overlapping round joins never add up into beads
    const blend = o.blend || 'max';
    const fog = o.fog || [0, 0, 1];
    if (s.worldW !== worldW || s.dash.join() !== dash.join() || s.square !== square || s.glow !== glow || s.blend !== blend || s.fog.join() !== fog.join()) {
      this.flushLines();
      this.lineState = { worldW, dash, square, glow, blend, fog };
    }
  }

  seg(a: V3, b: V3, w: number, c: RGBA, wB = w, cB: RGBA = c, dA = 0, dB = 0) {
    // a dashed segment given no distances runs its dashes from its own start (without this every
    // fragment had phase 0 and the whole dash was discarded)
    if (dA === 0 && dB === 0 && this.lineState.dash[3] > 0.5) dB = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    if (this.nDots) this.flushDots();
    if (this.nLines >= 65536) this.flushLines();
    const o = this.nLines * LINE_FLOATS, d = this.lineData;
    d[o] = a[0]; d[o + 1] = a[1]; d[o + 2] = a[2];
    d[o + 3] = b[0]; d[o + 4] = b[1]; d[o + 5] = b[2];
    d[o + 6] = c[0]; d[o + 7] = c[1]; d[o + 8] = c[2]; d[o + 9] = c[3];
    d[o + 10] = cB[0]; d[o + 11] = cB[1]; d[o + 12] = cB[2]; d[o + 13] = cB[3];
    d[o + 14] = w; d[o + 15] = wB; d[o + 16] = dA; d[o + 17] = dB;
    this.nLines++;
  }

  /** polyline through flat xyz triples (or xy pairs if dim=2, z=0). colour/width may vary per point. */
  poly(pts: ArrayLike<number>, w: number | ((i: number, n: number) => number), c: RGBA | ((i: number, n: number) => RGBA), opts: { dim?: 2 | 3; closed?: boolean; dist?: boolean } = {}) {
    const dim = opts.dim || 3;
    const n = Math.floor(pts.length / dim);
    if (n < 2) return;
    const P = (i: number): V3 => (dim === 3 ? [pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]] : [pts[i * 2], pts[i * 2 + 1], 0]);
    const wf = typeof w === 'number' ? () => w : w;
    const cf = typeof c === 'function' ? c : () => c;
    let acc = 0;
    let prev = P(0);
    const m = opts.closed ? n : n - 1;
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % n;
      const q = P(j);
      const l = Math.hypot(q[0] - prev[0], q[1] - prev[1], q[2] - prev[2]);
      this.seg(prev, q, wf(i, n), cf(i, n), wf(j, n), cf(j, n), acc, acc + l);
      acc += l;
      prev = q;
    }
  }

  flushLines() {
    if (!this.nLines) return;
    const gl = this.gl, p = this.lineProg, s = this.lineState;
    gl.useProgram(p.p);
    gl.uniformMatrix4fv(p.u.uVP, false, this.vp);
    gl.uniformMatrix4fv(p.u.uModel, false, this.model);
    gl.uniform2f(p.u.uRes, this.res[0], this.res[1]);
    gl.uniform1f(p.u.uPx, this.px);
    gl.uniform1f(p.u.uWorldW, s.worldW);
    gl.uniform1f(p.u.uFocal, this.focal());
    gl.uniform4f(p.u.uDash, s.dash[0] || 1, s.dash[1], s.dash[2], s.dash[3]);
    gl.uniform1f(p.u.uSquare, s.square);
    gl.uniform1f(p.u.uGlow, s.glow * this.px);
    gl.uniform3fv(p.u.uFog, s.fog);
    this.applyBlend(s.blend);
    this.applyDepth(false);
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(this.lineVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.lineData, 0, this.nLines * LINE_FLOATS);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.nLines);
    gl.bindVertexArray(null);
    this.stats.lines += this.nLines; this.stats.calls++;
    this.nLines = 0;
  }

  // ---------------------------------------------------------------- dots
  dotStyle(o: { world?: boolean; blend?: Blend } = {}) {
    const worldW = o.world ? 1 : 0, blend = o.blend || 'add';
    if (this.dotState.worldW !== worldW || this.dotState.blend !== blend) { this.flushDots(); this.dotState = { worldW, blend }; }
  }
  dot(p: V3, r: number, c: RGBA, soft = 0) {
    if (this.nLines) this.flushLines();
    if (this.nDots >= 65536) this.flushDots();
    const o = this.nDots * DOT_FLOATS, d = this.dotData;
    d[o] = p[0]; d[o + 1] = p[1]; d[o + 2] = p[2];
    d[o + 3] = c[0]; d[o + 4] = c[1]; d[o + 5] = c[2]; d[o + 6] = c[3];
    d[o + 7] = r; d[o + 8] = soft;
    this.nDots++;
  }
  flushDots() {
    if (!this.nDots) return;
    const gl = this.gl, p = this.dotProg;
    gl.useProgram(p.p);
    gl.uniformMatrix4fv(p.u.uVP, false, this.vp);
    gl.uniformMatrix4fv(p.u.uModel, false, this.model);
    gl.uniform2f(p.u.uRes, this.res[0], this.res[1]);
    gl.uniform1f(p.u.uPx, this.px);
    gl.uniform1f(p.u.uWorldW, this.dotState.worldW);
    gl.uniform1f(p.u.uFocal, this.focal());
    this.applyBlend(this.dotState.blend);
    this.applyDepth(false);
    gl.disable(gl.STENCIL_TEST);
    gl.bindVertexArray(this.dotVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dotBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.dotData, 0, this.nDots * DOT_FLOATS);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.nDots);
    gl.bindVertexArray(null);
    this.stats.dots += this.nDots; this.stats.calls++;
    this.nDots = 0;
  }

  // ---------------------------------------------------------------- fills
  /** build a GPU fill mesh from closed contours of xy pairs (local units) */
  makeFill(contours: ArrayLike<number>[]): FillMesh | null {
    const gl = this.gl;
    let n = 0;
    for (const c of contours) if (c.length >= 6) n += (c.length / 2) * 3;
    if (!n) return null;
    const v = new Float32Array(n * 2);
    let px = Infinity, py = Infinity, qx = -Infinity, qy = -Infinity;
    let ox = 0, oy = 0, found = false;
    for (const c of contours) if (c.length >= 6) { ox = c[0]; oy = c[1]; found = true; break; }
    if (!found) return null;
    let k = 0;
    for (const c of contours) {
      const m = c.length / 2;
      if (m < 3) continue;
      for (let i = 0; i < m; i++) {
        const j = (i + 1) % m;
        v[k++] = ox; v[k++] = oy;
        v[k++] = c[i * 2]; v[k++] = c[i * 2 + 1];
        v[k++] = c[j * 2]; v[k++] = c[j * 2 + 1];
        const x = c[i * 2], y = c[i * 2 + 1];
        if (x < px) px = x; if (y < py) py = y; if (x > qx) qx = x; if (y > qy) qy = y;
      }
    }
    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW);
    return { vbo, count: n, bbox: [px, py, qx, qy] };
  }
  freeFill(m: FillMesh | null) { if (m) this.gl.deleteBuffer(m.vbo); }

  /** fill a mesh with a paint, transformed by `model` (local -> world) */
  fillMesh(mesh: FillMesh | null, paint: Paint, model: M4 | null = null, blend: Blend = 'alpha') {
    if (!mesh) return;
    this.flush();
    const gl = this.gl, p = this.fillProg;
    gl.useProgram(p.p);
    gl.uniformMatrix4fv(p.u.uVP, false, this.vp);
    gl.uniformMatrix4fv(p.u.uModel, false, model || this.model);
    gl.bindVertexArray(this.fillVao);
    // stencil pass
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.enable(gl.STENCIL_TEST);
    gl.stencilMask(0xff);
    gl.stencilFunc(gl.ALWAYS, 0, 0xff);
    gl.stencilOpSeparate(gl.FRONT, gl.KEEP, gl.KEEP, gl.INCR_WRAP);
    gl.stencilOpSeparate(gl.BACK, gl.KEEP, gl.KEEP, gl.DECR_WRAP);
    gl.colorMask(false, false, false, false);
    gl.disable(gl.CULL_FACE);
    if (this.depthOn) { gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false); } else gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
    // cover pass
    gl.colorMask(true, true, true, true);
    gl.stencilFunc(gl.NOTEQUAL, 0, 0xff);
    gl.stencilOp(gl.ZERO, gl.ZERO, gl.ZERO);
    const [x0, y0, x1, y1] = mesh.bbox;
    const cover = new Float32Array([x0, y0, x1, y0, x0, y1, x0, y1, x1, y0, x1, y1]);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.coverBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, cover);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    this.setPaint(paint);
    this.applyBlend(blend);
    this.applyDepth(this.depthOn);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.disable(gl.STENCIL_TEST);
    gl.bindVertexArray(null);
    this.stats.fills++; this.stats.calls += 2;
  }

  /** fill contours given now (uploaded each call) */
  fill(contours: ArrayLike<number>[], paint: Paint, model: M4 | null = null, blend: Blend = 'alpha') {
    const m = this.makeFill(contours);
    if (!m) return;
    this.fillMesh(m, paint, model, blend);
    this.freeFill(m);
  }

  rect(x: number, y: number, w: number, h: number, paint: Paint, model: M4 | null = null, blend: Blend = 'alpha') {
    this.fill([[x, y, x + w, y, x + w, y + h, x, y + h]], paint, model, blend);
  }

  private setPaint(paint: Paint) {
    const gl = this.gl, p = this.fillProg;
    if (Array.isArray(paint)) {
      gl.uniform4fv(p.u.uC0, paint as number[]);
      gl.uniform4fv(p.u.uC1, paint as number[]);
      gl.uniform4f(p.u.uGrad, 0, 0, 0, 0);
      gl.uniform1f(p.u.uMode, 0);
    } else {
      gl.uniform4fv(p.u.uC0, paint.c0 as number[]);
      gl.uniform4fv(p.u.uC1, paint.c1 as number[]);
      gl.uniform4f(p.u.uGrad, paint.from[0], paint.from[1], paint.to[0], paint.to[1]);
      gl.uniform1f(p.u.uMode, paint.radial ? 1 : 0);
    }
  }

  // ---------------------------------------------------------------- images
  /** a textured quad. corners: top-left, top-right, bottom-right, bottom-left (world) */
  image(tex: WebGLTexture, corners: [V3, V3, V3, V3], tint: RGBA = [1, 1, 1, 1], uv: [number, number, number, number] = [0, 0, 1, 1],
    opts: { blend?: Blend; levels?: [number, number, number]; light?: RGBA } = {}) {
    this.flush();
    const gl = this.gl, p = this.imgProg;
    const [u0, v0, u1, v1] = uv;
    const [a, b, c, d] = corners;
    const data = new Float32Array([
      ...a, u0, v0, ...b, u1, v0, ...c, u1, v1,
      ...a, u0, v0, ...c, u1, v1, ...d, u0, v1,
    ]);
    gl.useProgram(p.p);
    gl.uniformMatrix4fv(p.u.uVP, false, this.vp);
    gl.uniformMatrix4fv(p.u.uModel, false, this.model);
    gl.uniform4fv(p.u.uTint, tint as number[]);
    if (opts.levels) {
      gl.uniform4f(p.u.uLevels, opts.levels[0], opts.levels[1], opts.levels[2], 1);
      gl.uniform4fv(p.u.uLight, (opts.light || [1, 1, 1, 1]) as number[]);
    } else gl.uniform4f(p.u.uLevels, 0, 1, 1, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(p.u.uTex, 0);
    this.applyBlend(opts.blend || 'alpha');
    this.applyDepth(false);
    gl.disable(gl.STENCIL_TEST);
    gl.bindVertexArray(this.imgVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.imgBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
    this.stats.calls++;
  }

  // ---------------------------------------------------------------- static dot meshes
  /** dots: flat [x, y, z, r, g, b, a, radius, soft, k0, k1] per dot */
  makeDots(data: Float32Array): DotMesh {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const S = 11 * 4;
    const attr = (loc: number, n: number, off: number) => {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, n, gl.FLOAT, false, S, off * 4);
      gl.vertexAttribDivisor(loc, 1);
    };
    attr(1, 3, 0); attr(2, 4, 3); attr(3, 2, 7); attr(4, 2, 9);
    gl.bindVertexArray(null);
    return { vao, count: data.length / 11 };
  }

  dots(mesh: DotMesh, o: { model?: M4; reveal?: number; soft?: number; rScale?: number; color?: RGBA; world?: boolean; blend?: Blend;
    flicker?: number; time?: number; k1Range?: [number, number]; cull?: [number, number, number, number];
    fog?: [number, number, number]; rClamp?: [number, number] } = {}) {
    this.flush();
    const gl = this.gl, p = this.dotMeshProg;
    gl.useProgram(p.p);
    gl.uniformMatrix4fv(p.u.uVP, false, this.vp);
    gl.uniformMatrix4fv(p.u.uModel, false, o.model || this.model);
    gl.uniform2f(p.u.uRes, this.res[0], this.res[1]);
    gl.uniform1f(p.u.uPx, this.px);
    gl.uniform1f(p.u.uWorldW, o.world ? 1 : 0);
    gl.uniform1f(p.u.uFocal, this.focal());
    gl.uniform2f(p.u.uReveal, o.reveal ?? 1e9, Math.max(1e-6, o.soft ?? 0.0001));
    gl.uniform1f(p.u.uRScale, o.rScale ?? 1);
    gl.uniform4fv(p.u.uColor, (o.color || [1, 1, 1, 1]) as number[]);
    gl.uniform2f(p.u.uFlicker, o.flicker ?? 0, o.time ?? 0);
    gl.uniform2f(p.u.uK1Range, o.k1Range ? o.k1Range[0] : -1e12, o.k1Range ? o.k1Range[1] : 1e12);
    gl.uniform4fv(p.u.uCull, o.cull || [0, 0, 0, 0]);
    gl.uniform3fv(p.u.uCamPos, this.cam.pos);
    gl.uniform3fv(p.u.uFog, o.fog || [0, 0, 1]);
    gl.uniform2fv(p.u.uRClamp, o.rClamp || [0, 0]);
    this.applyBlend(o.blend || 'add');
    this.applyDepth(false);
    gl.disable(gl.STENCIL_TEST);
    gl.bindVertexArray(mesh.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, mesh.count);
    gl.bindVertexArray(null);
    this.stats.dots += mesh.count; this.stats.calls++;
  }

  // ---------------------------------------------------------------- textured triangle meshes
  makeTexMesh(pos: Float32Array, uv: Float32Array, idx: Uint32Array): TexMesh {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const pb = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, pb);
    gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
    const ub = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, ub);
    gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 8, 0);
    const ib = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, count: idx.length };
  }

  texMesh(mesh: TexMesh, tex: WebGLTexture, o: { model?: M4; tint?: RGBA; levels?: [number, number, number]; light?: RGBA; blend?: Blend; depthWrite?: boolean } = {}) {
    this.flush();
    const gl = this.gl, p = this.imgProg;
    gl.useProgram(p.p);
    gl.uniformMatrix4fv(p.u.uVP, false, this.vp);
    gl.uniformMatrix4fv(p.u.uModel, false, o.model || this.model);
    gl.uniform4fv(p.u.uTint, (o.tint || [1, 1, 1, 1]) as number[]);
    if (o.levels) {
      gl.uniform4f(p.u.uLevels, o.levels[0], o.levels[1], o.levels[2], 1);
      gl.uniform4fv(p.u.uLight, (o.light || [1, 1, 1, 1]) as number[]);
    } else gl.uniform4f(p.u.uLevels, 0, 1, 1, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(p.u.uTex, 0);
    this.applyBlend(o.blend || 'alpha');
    if (this.depthOn) { gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(o.depthWrite !== false); }
    else gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CW);
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
    gl.disable(gl.CULL_FACE);
    gl.frontFace(gl.CCW);
    this.stats.calls++;
  }

  // ---------------------------------------------------------------- static line meshes
  /** segments: flat array of [ax, ay, az, bx, by, bz, r, g, b, a, width, k0, k1] per segment */
  makeLines(seg: Float32Array): LineMesh {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, seg, gl.STATIC_DRAW);
    const S = 13 * 4;
    const attr = (loc: number, n: number, off: number) => {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, n, gl.FLOAT, false, S, off * 4);
      gl.vertexAttribDivisor(loc, 1);
    };
    attr(1, 3, 0); attr(2, 3, 3); attr(3, 4, 6); attr(4, 1, 10); attr(5, 2, 11);
    gl.bindVertexArray(null);
    return { vao, vbo, count: seg.length / 13 };
  }

  /** draw a static line mesh. Each segment's alpha = smoothstep over (k0 - soft .. k0) of `reveal`,
   *  times a pulse when |k1 - pulseAt| is small. Width scale and colour multiplier apply to all. */
  lines(mesh: LineMesh, o: { model?: M4; reveal?: number; soft?: number; wScale?: number; color?: RGBA; world?: boolean; blend?: Blend;
    pulseAt?: number; pulseWidth?: number; pulseGain?: number; k1Range?: [number, number]; glow?: number;
    cull?: [number, number, number, number]; fog?: [number, number, number] } = {}) {
    this.flush();
    const gl = this.gl, p = this.meshProg;
    gl.useProgram(p.p);
    gl.uniformMatrix4fv(p.u.uVP, false, this.vp);
    gl.uniformMatrix4fv(p.u.uModel, false, o.model || this.model);
    gl.uniform2f(p.u.uRes, this.res[0], this.res[1]);
    gl.uniform1f(p.u.uPx, this.px);
    gl.uniform1f(p.u.uWorldW, o.world ? 1 : 0);
    gl.uniform1f(p.u.uFocal, this.focal());
    gl.uniform2f(p.u.uReveal, o.reveal ?? 1e9, Math.max(1e-6, o.soft ?? 0.0001));
    gl.uniform1f(p.u.uWScale, o.wScale ?? 1);
    gl.uniform4fv(p.u.uColor, (o.color || [1, 1, 1, 1]) as number[]);
    gl.uniform3f(p.u.uPulse, o.pulseAt ?? -1e9, o.pulseWidth ?? 1, o.pulseGain ?? 0);
    gl.uniform2f(p.u.uK1Range, o.k1Range ? o.k1Range[0] : -1e12, o.k1Range ? o.k1Range[1] : 1e12);
    gl.uniform1f(p.u.uGlow, (o.glow || 0) * this.px);
    gl.uniform4fv(p.u.uCull, o.cull || [0, 0, 0, 0]);
    gl.uniform3fv(p.u.uCamPos, this.cam.pos);
    gl.uniform3fv(p.u.uFog, o.fog || [0, 0, 1]);
    this.applyBlend(o.blend || 'max');
    this.applyDepth(false);
    gl.disable(gl.STENCIL_TEST);
    gl.bindVertexArray(mesh.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, mesh.count);
    gl.bindVertexArray(null);
    this.stats.lines += mesh.count; this.stats.calls++;
  }
}

const MESH_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 corner;
layout(location=1) in vec3 aA;
layout(location=2) in vec3 aB;
layout(location=3) in vec4 aC;
layout(location=4) in float aWid;
layout(location=5) in vec2 aK;
uniform mat4 uVP;
uniform mat4 uModel;
uniform vec2 uRes;
uniform float uPx;
uniform float uWorldW;
uniform float uFocal;
uniform vec2 uReveal;
uniform float uWScale;
uniform vec4 uColor;
uniform vec3 uPulse;
uniform vec2 uK1Range;
uniform vec4 uCull;     // sphere centre (world) and radius; radius 0 = off
uniform vec3 uCamPos;
uniform vec3 uFog;      // start, end (view depth), floor
out vec4 vC; out vec2 vL; out float vLen; out vec2 vHW; out float vDist; out float vDistPx;
void main(){
  float vis = smoothstep(aK.x - uReveal.y, aK.x, uReveal.x);
  if (aK.y < uK1Range.x || aK.y > uK1Range.y) vis = 0.0;
  float pulse = uPulse.z * exp(-pow((aK.y - uPulse.x) / max(uPulse.y, 1e-6), 2.0));
  if (uCull.w > 0.0) {
    // hide what is behind a sphere: a point p is visible if dot(p - c, cam - c) > r^2
    vec3 wa = (uModel * vec4(aA, 1.0)).xyz, wb = (uModel * vec4(aB, 1.0)).xyz;
    vec3 cc = uCamPos - uCull.xyz;
    float r2 = uCull.w * uCull.w;
    float fa = dot(wa - uCull.xyz, cc) / (r2 * 1.0001), fb = dot(wb - uCull.xyz, cc) / (r2 * 1.0001);
    float f = smoothstep(0.96, 1.02, min(fa, fb));
    vis *= f; pulse *= f;
  }
  if (vis <= 0.0 && pulse <= 0.0) { gl_Position = vec4(3.0, 3.0, 3.0, 1.0); return; }
  vec4 ca = uVP * uModel * vec4(aA, 1.0);
  vec4 cb = uVP * uModel * vec4(aB, 1.0);
  float nearW = 0.5;
  if (ca.w < nearW && cb.w < nearW) { gl_Position = vec4(3.0, 3.0, 3.0, 1.0); return; }
  if (ca.w < nearW) { float k = (nearW - ca.w) / (cb.w - ca.w); ca = mix(ca, cb, k); }
  if (cb.w < nearW) { float k = (nearW - cb.w) / (ca.w - cb.w); cb = mix(cb, ca, k); }
  vec2 sa = (ca.xy / ca.w * 0.5 + 0.5) * uRes;
  vec2 sb = (cb.xy / cb.w * 0.5 + 0.5) * uRes;
  vec2 d = sb - sa; float L = length(d);
  vec2 dir = L > 1e-5 ? d / L : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  float w = aWid * uWScale;
  float hwa = uWorldW > 0.5 ? 0.5 * w * uFocal * uPx / ca.w : 0.5 * w * uPx;
  float hwb = uWorldW > 0.5 ? 0.5 * w * uFocal * uPx / cb.w : 0.5 * w * uPx;
  float hw = max(hwa, hwb) + 1.5;
  float e = corner.x * 0.5 + 0.5;
  vec2 p = mix(sa, sb, e) + dir * corner.x * hw + nrm * corner.y * hw;
  gl_Position = vec4(p / uRes * 2.0 - 1.0, mix(ca.z / ca.w, cb.z / cb.w, e), 1.0);
  float fog = uFog.y > uFog.x ? mix(uFog.z, 1.0, 1.0 - smoothstep(uFog.x, uFog.y, mix(ca.w, cb.w, e))) : 1.0;
  vC = aC * uColor * vec4(vec3(1.0 + pulse), max(vis, min(1.0, pulse)) * fog);
  vL = vec2(e * L + corner.x * hw, corner.y * hw);
  vLen = L; vHW = vec2(hwa, hwb); vDist = 0.0; vDistPx = e * L;
}`;

const LINE_FS_MESH = LINE_FS;

const DOTMESH_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 corner;
layout(location=1) in vec3 aP;
layout(location=2) in vec4 aC;
layout(location=3) in vec2 aR;
layout(location=4) in vec2 aK;
uniform mat4 uVP;
uniform mat4 uModel;
uniform vec2 uRes;
uniform float uPx;
uniform float uWorldW;
uniform float uFocal;
uniform vec2 uReveal;
uniform float uRScale;
uniform vec4 uColor;
uniform vec2 uFlicker;   // amount, time
uniform vec2 uK1Range;
uniform vec4 uCull;
uniform vec3 uCamPos;
uniform vec3 uFog;
uniform vec2 uRClamp;   // min, max radius in px when radii are world units
out vec4 vC; out vec2 vQ; out float vR; out float vSoft;
float h(float n){ return fract(sin(n * 127.1 + 311.7) * 43758.5453); }
void main(){
  float vis = smoothstep(aK.x - uReveal.y, aK.x, uReveal.x);
  if (aK.y < uK1Range.x || aK.y > uK1Range.y) vis = 0.0;
  vec3 w = (uModel * vec4(aP, 1.0)).xyz;
  if (uCull.w > 0.0) {
    float f = dot(w - uCull.xyz, uCamPos - uCull.xyz) / (uCull.w * uCull.w);
    vis *= smoothstep(0.98, 1.03, f);
  }
  if (vis <= 0.0) { gl_Position = vec4(3.0, 3.0, 3.0, 1.0); return; }
  vec4 c = uVP * vec4(w, 1.0);
  if (c.w < 0.5) { gl_Position = vec4(3.0, 3.0, 3.0, 1.0); return; }
  float r = (uWorldW > 0.5 ? aR.x * uFocal * uPx / c.w : aR.x * uPx) * uRScale;
  float fade = 1.0;
  if (uWorldW > 0.5 && uRClamp.y > 0.0) {
    float rmin = uRClamp.x * uPx;
    if (r < rmin) { fade = r / rmin; r = rmin; }   // too small to see: keep a pixel, dim it
    r = min(r, uRClamp.y * uPx);
  }
  float ext = r * (aR.y > 0.0 ? 3.0 : 1.0) + 1.5;
  vec2 s = (c.xy / c.w * 0.5 + 0.5) * uRes + corner * ext;
  gl_Position = vec4(s / uRes * 2.0 - 1.0, c.z / c.w, 1.0);
  float fl = 1.0;
  if (uFlicker.x > 0.0) fl = 1.0 - uFlicker.x * step(0.8, h(floor(uFlicker.y * 30.0) + aK.x * 0.37 + aK.y));
  float fog = uFog.y > uFog.x ? mix(uFog.z, 1.0, 1.0 - smoothstep(uFog.x, uFog.y, c.w)) : 1.0;
  vC = aC * uColor * vec4(vec3(fl), vis * fog * fade);
  vQ = corner * ext; vR = max(r, 0.35); vSoft = aR.y;
}`;
