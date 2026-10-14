// The globe's towns: every Natural Earth populated place of 10,000 people or more as a point of
// light sized by its population, on the sphere, switched with its country's level (the same
// per-country table the Black Marble is scaled by), twinkling a little as lights seen through air
// do. The big towns are steady and whiter at the core; the small ones are amber and flicker more.
import { Draw } from '../engine/draw';
import { compile, Prog } from '../engine/gl';
import { M4, RGBA } from '../engine/math';
import type { Globe } from './globe';

const VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 corner;
layout(location=1) in vec4 aP;      // lon, lat (degrees), population, seed
layout(location=2) in float aC;     // country index on the id map (-1: none)
uniform mat4 uVP; uniform mat4 uModel;
uniform vec3 uCam; uniform vec4 uSphere;    // centre (world), radius (world)
uniform float uR;                            // the globe's radius (object)
uniform vec2 uRes; uniform float uPx; uniform float uFocal;
uniform sampler2D uLevels; uniform float uDefault;
uniform vec2 uTime;                          // seconds, twinkle amount
uniform vec4 uSize;                          // world radius at a million people, exponent, min px, max px
uniform vec2 uGain;                          // brightness, minimum population shown
uniform vec4 uWave; uniform vec4 uWaveP;
out vec4 vC; out vec2 vQ; out float vR;
uniform vec3 uCol0; uniform vec3 uCol1; uniform vec3 uNeutral;
float h(float n){ return fract(sin(n * 127.1 + 311.7) * 43758.5453); }
void main(){
  float pop = aP.z;
  if (pop < uGain.y) { gl_Position = vec4(3.0, 3.0, 3.0, 1.0); return; }
  float lon = radians(aP.x), lat = radians(aP.y);
  vec3 u = vec3(cos(lat) * sin(lon), -sin(lat), -cos(lat) * cos(lon));
  vec3 w = (uModel * vec4(u * uR * 1.0008, 1.0)).xyz;
  // behind the sphere: gone; toward the limb: fading as the ground turns away
  vec3 nrm = normalize(w - uSphere.xyz);
  float nv = dot(nrm, normalize(uCam - w));
  float vis = smoothstep(0.0, 0.3, nv);
  vec4 lv = aC < -0.5 ? vec4(uDefault, 0.0, uDefault, 0.0) : texelFetch(uLevels, ivec2(int(mod(aC, 256.0)), int(floor(aC / 256.0))), 0);
  float level = lv.b;
  if (vis <= 0.0 || level <= 0.002) { gl_Position = vec4(3.0, 3.0, 3.0, 1.0); return; }
  vec4 c = uVP * vec4(w, 1.0);
  if (c.w < 0.5) { gl_Position = vec4(3.0, 3.0, 3.0, 1.0); return; }
  float big = clamp((log(pop) / log(10.0) - 4.0) / 3.2, 0.0, 1.0);   // 0 at 10,000 .. 1 at 16 million
  float rw = uSize.x * pow(pop / 1e6, uSize.y);
  float r = rw * uFocal * uPx / c.w;
  float fade = 1.0;
  // however close, a town is never drawn bigger than its population allows
  float rmin = uSize.z * uPx, rmax = uSize.w * uPx * (0.3 + 0.7 * big);
  // too small to see: keep a point of light, dimmed (a town stays visible from orbit)
  if (r < rmin) { fade = max(sqrt(r / rmin), 0.45); r = rmin; }
  r = min(r, rmax);
  // twinkle: two slow beats per light, more for the small ones
  float s1 = h(aP.w), s2 = h(aP.w + 7.3), s3 = h(aP.w + 3.1);
  float tw = 1.0 + uTime.y * (1.25 - big) * (0.65 * sin(uTime.x * (1.7 + 2.6 * s1) + 6.2832 * s2) + 0.35 * sin(uTime.x * (4.1 + 3.3 * s3) + 6.2832 * s1));
  float band = 0.0;
  if (uWave.w > 0.5) {
    float ang = acos(clamp(dot(u, uWave.xyz), -1.0, 1.0));
    band = exp(-pow((ang - uWaveP.x) / max(uWaveP.y, 1e-5), 2.0));
  }
  float b = uGain.x * (0.30 + 0.32 * (log(pop) / log(10.0) - 4.0)) * level * tw * vis * fade * (1.0 + uWaveP.z * band);
  vec3 col = mix(mix(uCol0, uCol1, 0.25 + 0.6 * big), uNeutral, lv.g);
  float ext = r * 3.0 + 1.5;
  vec2 sp = (c.xy / c.w * 0.5 + 0.5) * uRes + corner * ext;
  gl_Position = vec4(sp / uRes * 2.0 - 1.0, c.z / c.w, 1.0);
  vC = vec4(col * b, 1.0); vQ = corner * ext; vR = max(r, 0.35);
}`;

const FS = `#version 300 es
precision highp float;
in vec4 vC; in vec2 vQ; in float vR;
out vec4 o;
void main(){
  float d = length(vQ) / vR;
  // a hot core and the glow of the town around it
  float a = exp(-d * d * 1.8) + 0.07 * exp(-d * 1.7);
  if (a < 0.003) discard;
  o = vec4(vC.rgb * a, a);
}`;

export type TownOpts = {
  time?: number;
  twinkle?: number;
  /** brightness, and the smallest town shown */
  gain?: number; minPop?: number;
  /** world radius of a town of a million at this globe's scale (object units), exponent, px clamps */
  size?: [number, number, number, number];
  /** level for towns not in any country of the map */
  level?: number;
  color0?: RGBA; color1?: RGBA; neutral?: RGBA;
  wave?: { lon: number; lat: number; angle: number; width: number; gain: number } | null;
};

export class GlobeTowns {
  prog: Prog;
  vao: WebGLVertexArrayObject;
  count: number;
  constructor(public d: Draw, public globe: Globe, places: [number, number, number, string | null][]) {
    const gl = d.gl;
    this.prog = compile(gl, VS, FS, 'globeTowns');
    const data = new Float32Array(places.length * 5);
    places.forEach((p, i) => {
      const ci = p[3] ? globe.isoToIdx.get(p[3]) : undefined;
      data.set([p[0], p[1], p[2], i * 0.6180339 + (p[0] * 0.013 + p[1] * 0.021), ci === undefined ? -1 : ci], i * 5);
    });
    this.count = places.length;
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    const quad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 20, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 20, 16);
    gl.vertexAttribDivisor(2, 1);
    gl.bindVertexArray(null);
  }

  draw(model: M4, o: TownOpts = {}) {
    const d = this.d, gl = d.gl, p = this.prog, g = this.globe;
    d.flush();
    const fr = g.frame(model);
    gl.useProgram(p.p);
    gl.uniformMatrix4fv(p.u.uVP, false, d.vp);
    gl.uniformMatrix4fv(p.u.uModel, false, model);
    gl.uniform3fv(p.u.uCam, d.cam.pos);
    gl.uniform4f(p.u.uSphere, fr.c[0], fr.c[1], fr.c[2], fr.r);
    gl.uniform1f(p.u.uR, g.R);
    gl.uniform2f(p.u.uRes, d.res[0], d.res[1]);
    gl.uniform1f(p.u.uPx, d.px);
    gl.uniform1f(p.u.uFocal, d.focal());
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, g.levelsTex);
    gl.uniform1i(p.u.uLevels, 0);
    gl.uniform1f(p.u.uDefault, o.level ?? 0);
    gl.uniform2f(p.u.uTime, o.time ?? 0, o.twinkle ?? 0.3);
    const scale = fr.r / g.R;
    const sz = o.size || [g.R * 0.0022, 0.34, 0.75, 5.5];
    gl.uniform4f(p.u.uSize, sz[0] * scale, sz[1], sz[2], sz[3]);
    gl.uniform2f(p.u.uGain, o.gain ?? 1, o.minPop ?? 0);
    const c0 = o.color0 || [1.0, 0.42, 0.09, 1], c1 = o.color1 || [1.0, 0.82, 0.56, 1], cn = o.neutral || [0.78, 0.84, 1.0, 1];
    gl.uniform3f(p.u.uCol0, c0[0], c0[1], c0[2]);
    gl.uniform3f(p.u.uCol1, c1[0], c1[1], c1[2]);
    gl.uniform3f(p.u.uNeutral, cn[0], cn[1], cn[2]);
    const w = o.wave;
    if (w) {
      const l = (w.lon * Math.PI) / 180, q = (w.lat * Math.PI) / 180;
      gl.uniform4f(p.u.uWave, Math.cos(q) * Math.sin(l), -Math.sin(q), -Math.cos(q) * Math.cos(l), 1);
      gl.uniform4f(p.u.uWaveP, w.angle, w.width, w.gain, 0);
    } else {
      gl.uniform4f(p.u.uWave, 0, 0, -1, 0);
      gl.uniform4f(p.u.uWaveP, 0, 1, 0, 0);
    }
    gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE);
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
    gl.disable(gl.STENCIL_TEST); gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.count);
    gl.bindVertexArray(null);
    d.stats.dots += this.count; d.stats.calls++;
  }
}
