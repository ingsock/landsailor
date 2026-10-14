// The sky around the globe: the air beyond its limb (a glow that thins with height, with the thin
// line of the night's airglow above it), and the stars, which turn with the globe as if the camera
// were flying round it.
import { Draw } from '../engine/draw';
import { compile, Prog } from '../engine/gl';
import { M4, V3, cross, mulberry32, norm, sub } from '../engine/math';
import type { Globe } from './globe';

// ------------------------------------------------------------------------------------- the air
const AIR_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 corner;
uniform mat4 uVP; uniform vec3 uC; uniform vec3 uU; uniform vec3 uV; uniform float uS;
out vec3 vP;
void main(){
  vP = uC + (uU * corner.x + uV * corner.y) * uS;
  gl_Position = uVP * vec4(vP, 1.0);
}`;

const AIR_FS = `#version 300 es
precision highp float;
in vec3 vP;
uniform vec3 uC; uniform float uRw; uniform vec3 uCam;
uniform vec4 uCol;      // the air's colour, strength
uniform vec4 uGlow;     // airglow colour, strength
uniform vec4 uMoon;     // the side of the moon (world dir), how much brighter that side is
uniform vec2 uH;        // scale heights (in radii): the bright layer, the wide haze
out vec4 o;
void main(){
  vec3 D = normalize(vP - uCam);
  vec3 oc = uC - uCam;
  float tca = dot(oc, D);
  float d = sqrt(max(dot(oc, oc) - tca * tca, 0.0));
  float x = (d - uRw) / uRw;
  if (x < 0.0 || tca < 0.0) discard;
  // the side facing the moon is a little brighter
  vec3 radial = normalize((uCam + D * tca) - uC);
  float side = 1.0 + uMoon.w * dot(radial, uMoon.xyz);
  float a = uCol.w * side * (exp(-x / uH.x) + 0.35 * exp(-x / uH.y));
  float g = uGlow.w * exp(-pow((x - 0.011) / 0.0035, 2.0));
  vec3 c = uCol.rgb * a + uGlow.rgb * g;
  float m = max(c.r, max(c.g, c.b));
  if (m < 0.0004) discard;
  o = vec4(c, 0.0);
}`;

export type AirOpts = {
  color?: [number, number, number, number];
  glow?: [number, number, number, number];
  heights?: [number, number];
  moon?: [number, number, number, number];
};

let airProg: Prog | null = null;
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

/** the air beyond the limb: a quad facing the camera through the globe's centre, behind the
 *  sphere's near side, so the depth the sphere wrote hides all of it but the ring outside */
export function drawAir(d: Draw, globe: Globe, model: M4, o: AirOpts = {}) {
  const gl = d.gl;
  d.flush();
  if (!airProg) airProg = compile(gl, AIR_VS, AIR_FS, 'globeAir');
  const p = airProg;
  const { c, r } = globe.frame(model);
  const cam = d.cam.pos;
  const f = norm(sub(c, cam));
  const dist = Math.hypot(c[0] - cam[0], c[1] - cam[1], c[2] - cam[2]);
  let u: V3 = cross(f, [0, 1, 0]);
  if (Math.hypot(...u) < 1e-3) u = cross(f, [1, 0, 0]);
  u = norm(u);
  const v = norm(cross(f, u));
  // the limb's rays meet the quad's plane this far from the centre
  const reach = dist > r * 1.0005 ? (r * dist) / Math.sqrt(dist * dist - r * r) : r * 40;
  const S = Math.min(reach * 1.5, r * 60);
  gl.useProgram(p.p);
  gl.uniformMatrix4fv(p.u.uVP, false, d.vp);
  gl.uniform3fv(p.u.uC, c); gl.uniform3fv(p.u.uU, u); gl.uniform3fv(p.u.uV, v); gl.uniform1f(p.u.uS, S);
  gl.uniform1f(p.u.uRw, r);
  gl.uniform3fv(p.u.uCam, cam);
  gl.uniform4fv(p.u.uCol, o.color || [0.06, 0.16, 0.55, 0.42]);
  gl.uniform4fv(p.u.uGlow, o.glow || [0.25, 0.7, 0.42, 0.09]);
  const m = o.moon || [-0.45, -0.55, -0.7, 0.35];
  const ml = Math.hypot(m[0], m[1], m[2]) || 1;
  gl.uniform4f(p.u.uMoon, m[0] / ml, m[1] / ml, m[2] / ml, m[3]);
  gl.uniform2fv(p.u.uH, o.heights || [0.012, 0.05]);
  gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE);
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false);
  gl.disable(gl.STENCIL_TEST); gl.disable(gl.CULL_FACE);
  gl.bindVertexArray(quad(d));
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.bindVertexArray(null);
  d.stats.calls++;
}

// ----------------------------------------------------------------------------------- the stars
const STAR_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 corner;
layout(location=1) in vec4 aS;     // direction (unit), brightness
layout(location=2) in vec2 aT;     // colour (0 blue .. 1 warm), seed
uniform mat4 uVP; uniform mat3 uRot;
uniform vec2 uRes; uniform float uPx; uniform vec3 uTime;   // seconds, twinkle, gain
out vec4 vC; out vec2 vQ; out float vR;
float h(float n){ return fract(sin(n * 127.1 + 311.7) * 43758.5453); }
void main(){
  vec4 c = uVP * vec4(uRot * aS.xyz, 0.0);
  if (c.w <= 1e-4) { gl_Position = vec4(3.0, 3.0, 3.0, 1.0); return; }
  float b = aS.w;
  float tw = 1.0 + uTime.y * (0.6 * sin(uTime.x * (2.0 + 5.0 * h(aT.y)) + 6.2832 * h(aT.y + 1.7)) + 0.4 * sin(uTime.x * (7.0 + 6.0 * h(aT.y + 4.1))));
  float r = (0.55 + 1.5 * sqrt(b)) * uPx;
  vec3 warm = vec3(1.0, 0.78, 0.55), cool = vec3(0.62, 0.74, 1.0);
  vec3 col = mix(cool, warm, aT.x);
  col = mix(vec3(1.0), col, 0.55);
  float ext = r * 2.5 + 1.0;
  vec2 sp = (c.xy / c.w * 0.5 + 0.5) * uRes + corner * ext;
  gl_Position = vec4(sp / uRes * 2.0 - 1.0, 0.999, 1.0);
  vC = vec4(col * (0.05 + 1.4 * b) * tw * uTime.z, 1.0); vQ = corner * ext; vR = r;
}`;

const STAR_FS = `#version 300 es
precision highp float;
in vec4 vC; in vec2 vQ; in float vR;
out vec4 o;
void main(){
  float d = length(vQ) / vR;
  float a = exp(-d * d * 2.2);
  if (a < 0.004) discard;
  o = vec4(vC.rgb * a, a);
}`;

export type StarOpts = { time?: number; twinkle?: number; gain?: number; rot?: M4 | null };

let starProg: Prog | null = null;
let starVao: WebGLVertexArrayObject | null = null;
let starCount = 0;

function buildStars(d: Draw) {
  const gl = d.gl;
  const rnd = mulberry32(1977);
  const N = 4200;
  const data = new Float32Array(N * 6);
  // a band of the galaxy: a quarter of the stars crowd toward a great circle
  const pole = norm([0.32, -0.62, 0.71] as V3);
  for (let i = 0; i < N; i++) {
    let x: V3;
    if (i % 4 === 0) {
      // near the band: a random direction pulled toward the plane perpendicular to `pole`
      const a = rnd() * Math.PI * 2;
      const e1 = norm(cross(pole, [0, 0, 1])), e2 = cross(pole, e1);
      const lat = (rnd() + rnd() + rnd() - 1.5) * 0.22;
      const cl = Math.cos(lat), sl = Math.sin(lat);
      x = [e1[0] * Math.cos(a) * cl + e2[0] * Math.sin(a) * cl + pole[0] * sl,
        e1[1] * Math.cos(a) * cl + e2[1] * Math.sin(a) * cl + pole[1] * sl,
        e1[2] * Math.cos(a) * cl + e2[2] * Math.sin(a) * cl + pole[2] * sl];
    } else {
      const z = rnd() * 2 - 1, a = rnd() * Math.PI * 2, s = Math.sqrt(1 - z * z);
      x = [s * Math.cos(a), z, s * Math.sin(a)];
    }
    // most stars are faint; a few are bright
    const b = Math.pow(rnd(), 7.0);
    data.set([x[0], x[1], x[2], b, rnd() < 0.25 ? 0.75 + rnd() * 0.25 : rnd() * 0.5, rnd() * 1000], i * 6);
  }
  starVao = gl.createVertexArray()!;
  gl.bindVertexArray(starVao);
  const qb = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, qb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
  const vb = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 24, 0);
  gl.vertexAttribDivisor(1, 1);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 24, 16);
  gl.vertexAttribDivisor(2, 1);
  gl.bindVertexArray(null);
  starCount = N;
}

/** the rotation part of a model matrix, normalized, as a mat3 (column-major) */
export function rotation3(m: M4): Float32Array {
  const s = Math.hypot(m[0], m[1], m[2]) || 1;
  return new Float32Array([m[0] / s, m[1] / s, m[2] / s, m[4] / s, m[5] / s, m[6] / s, m[8] / s, m[9] / s, m[10] / s]);
}

/** stars at infinity, turned with the globe's model (or `rot`) */
export function drawStars(d: Draw, model: M4, o: StarOpts = {}) {
  const gl = d.gl;
  d.flush();
  if (!starProg) starProg = compile(gl, STAR_VS, STAR_FS, 'stars');
  if (!starVao) buildStars(d);
  const p = starProg;
  gl.useProgram(p.p);
  gl.uniformMatrix4fv(p.u.uVP, false, d.vp);
  gl.uniformMatrix3fv(p.u.uRot, false, rotation3(o.rot || model));
  gl.uniform2f(p.u.uRes, d.res[0], d.res[1]);
  gl.uniform1f(p.u.uPx, d.px);
  gl.uniform3f(p.u.uTime, o.time ?? 0, o.twinkle ?? 0.25, o.gain ?? 1);
  gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE);
  gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
  gl.disable(gl.STENCIL_TEST); gl.disable(gl.CULL_FACE);
  gl.bindVertexArray(starVao);
  gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, starCount);
  gl.bindVertexArray(null);
  d.stats.dots += starCount; d.stats.calls++;
}

