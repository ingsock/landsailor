// The bed that we've made (scenes/outro1.ts, bed): the world's cumulative CO2 as a block of strata in
// a geological block diagram, a layer a decade, each as thick as what the decade emitted. Drawn by
// one shader for the block's faces: every point of a face finds its layer by its height (the beds'
// boundaries undulate a little, as beds do), then takes that layer's stone: its colour by decade, a
// grain at two scales, the fine laminae inside it, specks of coal and quartz, a dark seam on each
// bedding plane, the light of the dawn on it, and the heat of a layer just laid down glowing in its
// seams and veins until it cools. Depth-tested, so the falling layers pass behind and in front.
import { Camera } from '../engine/camera';
import { Draw } from '../engine/draw';
import { Prog, compile } from '../engine/gl';
import { RGBA, V3 } from '../engine/math';

export const MAX_LAYERS = 32;

const VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aP;
layout(location=1) in vec3 aN;
layout(location=2) in vec2 aUV;
layout(location=3) in vec2 aHM;   // height in the stack (px, up), layer (-1: find it by height)
uniform mat4 uVP;
out vec3 vN; out vec2 vUV; out float vH; out float vMode; out vec3 vW;
void main(){
  gl_Position = uVP * vec4(aP, 1.0);
  vN = aN; vUV = aUV; vH = aHM.x; vMode = aHM.y; vW = aP;
}`;

const FS = `#version 300 es
precision highp float;
in vec3 vN; in vec2 vUV; in float vH; in float vMode; in vec3 vW;
uniform float uB[${MAX_LAYERS + 1}];   // the bottom of each layer (px up the stack); uB[uN] its top
uniform vec3 uCol[${MAX_LAYERS}];
uniform float uHeat[${MAX_LAYERS}];
uniform int uN;
uniform int uNL;         // how many beds are laid in the stack
uniform vec3 uL;          // toward the low light of the dawn
uniform vec3 uSkyC;       // the sky's light from above
uniform vec3 uSunC;       // the dawn's light
uniform vec3 uRim;        // the edge catching the sky
uniform float uTime;
out vec4 o;
float h21(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
float bnd(int i){ return uB[clamp(i, 0, uN)]; }
/** the undulation of bedding plane i along the face, never more than a third of the thinner bed beside it */
float wob(int i, float s){
  if (i <= 0 || i >= uNL) return 0.0;
  float t0 = bnd(i) - bnd(i - 1), t1 = bnd(i + 1) - bnd(i);
  float a = 0.33 * min(min(t0, t1), 9.0);
  return a * (vn(vec2(s / 170.0 + float(i) * 3.7, float(i) * 1.3)) * 2.0 - 1.0 + 0.4 * (vn(vec2(s / 41.0, float(i) * 7.1)) - 0.5));
}
void main(){
  vec3 n = normalize(vN);
  bool top = n.y < -0.5;
  float s = vUV.x;
  float h = vH;
  int li;
  float wk = 0.0;
  if (vMode >= -0.5) li = int(vMode + 0.5);
  else {
    wk = 1.0;
    li = max(uNL - 1, 0);
    for (int i = 1; i < ${MAX_LAYERS}; i++) {
      if (i >= uNL) break;
      if (h < bnd(i) + wob(i, s)) { li = i - 1; break; }
    }
  }
  // the bed's own tone: neighbours differ, as sandstone and shale do
  float hb = h21(vec2(float(li) * 7.13, 3.1));
  float tone = 0.68 + 0.6 * hb;
  vec3 base = uCol[li] * tone;
  // some beds are grey shale, some redder
  float lum = dot(base, vec3(0.2126, 0.7152, 0.0722));
  base = mix(base, vec3(lum) * vec3(0.92, 0.96, 1.06), step(0.62, h21(vec2(float(li), 9.7))) * 0.55);
  float lb = bnd(li) + wob(li, s) * wk, lt = bnd(li + 1) + wob(li + 1, s) * wk;
  vec2 q = top ? vUV : vec2(s, h);
  // how many face px a screen px covers: fine detail fades where it would only shimmer
  vec2 dq = fwidth(q);
  float px = max(dq.x, dq.y);
  float fine = 1.0 - smoothstep(0.6, 2.2, px);
  float mid = 1.0 - smoothstep(3.0, 10.0, px);
  // grain at three scales
  float g = (vn(q / 1.6) - 0.5) * fine * 0.5 + (vn(q / 6.0) - 0.5) * mid * 0.5 + (vn(q / vec2(90.0, 30.0) + float(li)) - 0.5) * 0.45;
  // laminae: fine lines inside the bed, a little warped
  float per = 2.2 + 3.2 * h21(vec2(float(li), 1.0));
  float lamv = (h + 4.0 * vn(vec2(s / 120.0, float(li) * 2.1))) / per;
  float lam = top ? 0.0 : (smoothstep(0.7, 0.95, abs(fract(lamv) * 2.0 - 1.0)) - 0.25) * mid;
  // specks: coal, more in the later beds; and quartz
  vec2 cell = floor(q / 2.6);
  float sp = h21(cell + float(li) * 13.1);
  float coal = step(1.0 - (0.02 + 0.08 * float(li) / float(uN)), sp) * fine;
  float quartz = step(sp, 0.016) * fine;
  vec3 c = base * (1.0 + 0.5 * g) * (1.0 - 0.16 * lam);
  c = mix(c, base * 0.28, coal);
  c = mix(c, base * 1.5 + vec3(0.02), quartz);
  // the bedding plane at the top of each bed: a dark seam, a pale lip under it
  float seamW = max(0.7 * px, 0.45);
  float dTop = lt - h;
  float seam = top ? 0.0 : 1.0 - smoothstep(0.0, seamW * 1.6, dTop);
  float lip = top ? 0.0 : smoothstep(seamW * 1.4, seamW * 2.2, dTop) * (1.0 - smoothstep(seamW * 2.2, seamW * 3.6, dTop));
  float notTop = float(li < uNL - 1 || vMode >= -0.5);
  seam *= step(0.0, dTop + 0.001) * notTop;
  c *= (1.0 - 0.55 * seam) * (1.0 + 0.25 * lip * notTop * mid);
  // the top: dried and cracked into plates; a hot bed glows in its cracks
  float crack = 0.0;
  if (top) {
    vec2 cp = q / 90.0;
    vec2 ip = floor(cp), fp = fract(cp);
    float d1 = 8.0, d2 = 8.0;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 gg = vec2(float(i), float(j));
      vec2 oo = vec2(h21(ip + gg + float(li) * 3.0), h21(ip + gg + 17.0 + float(li) * 3.0)) * 0.8 + 0.1;
      float dd = length(gg + oo - fp);
      if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) d2 = dd;
    }
    float e = (d2 - d1) * 90.0;
    // seen at a grazing angle the cracks would only shimmer: they fade to their average
    float sharp = 1.0 - smoothstep(8.0, 20.0, px);
    crack = mix(0.12, 1.0 - smoothstep(0.5, 0.5 + 1.8 * max(px, 0.6), e), sharp);
    c *= 1.0 - 0.6 * crack * mid;
  }
  // the light: the pale sky from above and the low dawn from one side
  float ndl = max(dot(n, uL), 0.0);
  float sky = top ? 1.0 : 0.55 + 0.25 * (vn(q / 300.0) - 0.5);
  vec3 col = c * (uSkyC * sky + uSunC * ndl);
  // the heat of a bed just laid down: in the cracks of its top, in its seams and in thin veins
  float heat = uHeat[li];
  if (heat > 0.001) {
    vec3 hc = mix(vec3(1.0, 0.13, 0.02), vec3(1.0, 0.55, 0.16), heat);
    float gs;
    if (top) gs = 0.05 + 2.4 * crack;
    else {
      float vein = smoothstep(0.8, 0.95, vn(vec2(s / 70.0, h / 1.8) + float(li) * 5.0));
      float edge = 1.0 - smoothstep(0.0, 2.6, min(h - lb, dTop));
      gs = 0.05 + 1.5 * vein + 1.5 * edge;
    }
    col += hc * heat * heat * gs * 1.25;
  }
  o = vec4(col, 1.0);
}`;

/** one box of the block: the stack from h0 to h1 (px up), or a single layer, placed with its foot at y */
export type BedBox = { h0: number; h1: number; foot: number; layer: number; scale: number; top: number };

export class StrataBed {
  prog: Prog;
  vao: WebGLVertexArrayObject;
  buf: WebGLBuffer;
  constructor(public gl: WebGL2RenderingContext, public d: Draw, public W: number, public D: number) {
    this.prog = compile(gl, VS, FS, 'strataBed');
    this.vao = gl.createVertexArray()!;
    this.buf = gl.createBuffer()!;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    const S = 10 * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, S, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, S, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, S, 24);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 2, gl.FLOAT, false, S, 32);
    gl.bindVertexArray(null);
  }

  /** the faces of the boxes (world: x right, y down, z away; the block centred on x = z = 0) */
  draw(cam: Camera, boxes: BedBox[], u: { bounds: number[]; cols: RGBA[]; heat: number[]; laid: number; light: V3; sky: RGBA; sun: RGBA; t: number }) {
    const gl = this.gl, d = this.d, p = this.prog;
    const W2 = this.W / 2, D2 = this.D / 2;
    const v: number[] = [];
    const quad = (P: V3[], n: V3, uv: [number, number][], hs: number[], mode: number) => {
      for (const i of [0, 1, 2, 0, 2, 3]) v.push(P[i][0], P[i][1], P[i][2], n[0], n[1], n[2], uv[i][0], uv[i][1], hs[i], mode);
    };
    for (const b of boxes) {
      // world y of a stack height: the foot at b.foot, heights scaled by the box's squash
      const Y = (h: number) => b.foot - (h - b.h0) * b.scale;
      const y0 = Y(b.h0), y1 = Y(b.h1);
      const m = b.layer;
      // front (toward -z), back, left, right, top
      quad([[-W2, y1, -D2], [W2, y1, -D2], [W2, y0, -D2], [-W2, y0, -D2]], [0, 0, -1], [[-W2, b.h1], [W2, b.h1], [W2, b.h0], [-W2, b.h0]], [b.h1, b.h1, b.h0, b.h0], m);
      quad([[W2, y1, D2], [-W2, y1, D2], [-W2, y0, D2], [W2, y0, D2]], [0, 0, 1], [[W2, b.h1], [-W2, b.h1], [-W2, b.h0], [W2, b.h0]], [b.h1, b.h1, b.h0, b.h0], m);
      quad([[-W2, y1, D2], [-W2, y1, -D2], [-W2, y0, -D2], [-W2, y0, D2]], [-1, 0, 0], [[D2 + 900, b.h1], [-D2 + 900, b.h1], [-D2 + 900, b.h0], [D2 + 900, b.h0]], [b.h1, b.h1, b.h0, b.h0], m);
      quad([[W2, y1, -D2], [W2, y1, D2], [W2, y0, D2], [W2, y0, -D2]], [1, 0, 0], [[-D2 - 900, b.h1], [D2 - 900, b.h1], [D2 - 900, b.h0], [-D2 - 900, b.h0]], [b.h1, b.h1, b.h0, b.h0], m);
      quad([[-W2, y1, D2], [W2, y1, D2], [W2, y1, -D2], [-W2, y1, -D2]], [0, -1, 0], [[-W2, D2], [W2, D2], [W2, -D2], [-W2, -D2]], [b.h1, b.h1, b.h1, b.h1], b.top);
    }
    d.flush();
    gl.useProgram(p.p);
    gl.uniformMatrix4fv(p.u.uVP, false, cam.viewProj());
    const B = new Float32Array(MAX_LAYERS + 1); B.set(u.bounds.slice(0, MAX_LAYERS + 1));
    gl.uniform1fv(p.u.uB, B);
    const C = new Float32Array(MAX_LAYERS * 3); u.cols.slice(0, MAX_LAYERS).forEach((c, i) => C.set([c[0], c[1], c[2]], i * 3));
    gl.uniform3fv(p.u.uCol, C);
    const Hh = new Float32Array(MAX_LAYERS); Hh.set(u.heat.slice(0, MAX_LAYERS));
    gl.uniform1fv(p.u.uHeat, Hh);
    gl.uniform1i(p.u.uN, Math.min(MAX_LAYERS, u.cols.length));
    gl.uniform1i(p.u.uNL, Math.min(MAX_LAYERS, u.laid));
    gl.uniform3fv(p.u.uL, u.light);
    gl.uniform3f(p.u.uSkyC, u.sky[0], u.sky[1], u.sky[2]);
    gl.uniform3f(p.u.uSunC, u.sun[0], u.sun[1], u.sun[2]);
    if (p.u.uRim) gl.uniform3f(p.u.uRim, 0, 0, 0);
    gl.uniform1f(p.u.uTime, u.t);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.DYNAMIC_DRAW);
    gl.disable(gl.BLEND); gl.disable(gl.STENCIL_TEST); gl.disable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
    gl.drawArrays(gl.TRIANGLES, 0, v.length / 10);
    gl.bindVertexArray(null);
    gl.depthMask(false); gl.disable(gl.DEPTH_TEST);
    d.stats.calls++;
  }
}
