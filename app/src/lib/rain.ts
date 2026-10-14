// Rain, drawn in one full-screen pass over the finished scene: four depths of drops, each drop a
// soft streak tapered at both ends, already as long as its own motion blur, and frozen to the frame
// (every sub-frame of a frame sees the same rain, so the averaging of the sub-frames cannot stack
// copies of a drop into a block). Drops are seen only by the light they catch: faint in the dark,
// brilliant for the instant of a lightning flash.
import { Draw } from '../engine/draw';
import { FS_VS, Prog, compile } from '../engine/gl';

const FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform vec2 uRes; uniform float uPx; uniform float uTime;
uniform float uAmt; uniform float uWind; uniform vec3 uCol; uniform float uLit; uniform vec2 uPan; uniform float uDens;
float h21(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
// one depth of rain: cells of drops, each drop a streak of length len and width wid (px)
float layer(vec2 px, float cell, float len, float wid, float speed, float dens, float seed, float par){
  vec2 p = px + uPan * par;
  p.x -= p.y * uWind;                 // the slant of the fall
  p.y -= uTime * speed;               // the fall
  vec2 sz = vec2(cell, len * 2.4);
  vec2 id = floor(p / sz);
  float a = 0.0;
  for (int k = -1; k <= 1; k++) {
    vec2 c = id + vec2(0.0, float(k));
    if (h21(c + seed) > dens * uDens) continue;
    float x0 = (c.x + 0.2 + 0.6 * h21(c + seed + 3.1)) * sz.x;
    float y0 = (c.y + 0.5 + 0.4 * (h21(c + seed + 7.7) - 0.5)) * sz.y;
    float dy = (p.y - y0) / len;
    if (abs(dy) > 0.5) continue;
    float dx = (p.x - x0) / wid;
    float across = exp(-0.5 * dx * dx);
    float along = smoothstep(0.5, 0.18, abs(dy)) * (0.75 + 0.25 * (dy + 0.5));
    a += across * along * (0.55 + 0.45 * h21(c + seed + 11.0));
  }
  return a;
}
void main(){
  vec2 px = vec2(vUv.x, 1.0 - vUv.y) * uRes / uPx;
  float r = 0.0;
  // long and thin, as rain is to a camera: a streak many times longer than it is wide
  r += layer(px,  8.0,  28.0, 0.55, 1000.0, 0.20, 1.0, 0.15) * 0.30;   // far: fine, dim
  r += layer(px, 15.0,  46.0, 0.70, 1500.0, 0.16, 2.0, 0.35) * 0.42;
  r += layer(px, 30.0,  78.0, 0.95, 2100.0, 0.12, 3.0, 0.65) * 0.50;
  r += layer(px, 70.0, 140.0, 1.90, 3000.0, 0.09, 4.0, 1.00) * 0.22;   // near: wide, soft, out of focus
  o = vec4(uCol * r * uLit * uAmt, 0.0);
}`;

export type RainOpts = {
  amount: number;        // 0..1
  wind?: number;         // the slant: horizontal px per px of fall
  lit?: number;          // the light the drops catch (1 = plain night; a flash adds)
  color?: number[];      // linear
  pan?: [number, number];// the camera's travel across the screen, px (parallax)
  density?: number;      // multiplies every layer's density
};

export class Rain {
  private prog: Prog;
  private vao: WebGLVertexArrayObject;
  constructor(public gl: WebGL2RenderingContext, public d: Draw) {
    this.prog = compile(gl, FS_VS, FS, 'rain');
    this.vao = gl.createVertexArray()!;
  }

  /** frame: the frame number (the rain is frozen to it) */
  draw(frame: number, o: RainOpts) {
    if (o.amount <= 0.001) return;
    const gl = this.gl, p = this.prog, u = p.u;
    this.d.flush();
    gl.useProgram(p.p);
    gl.uniform2f(u.uRes, this.d.res[0], this.d.res[1]);
    gl.uniform1f(u.uPx, this.d.res[1] / 1080);
    gl.uniform1f(u.uTime, frame / 60);
    gl.uniform1f(u.uAmt, o.amount);
    gl.uniform1f(u.uWind, o.wind ?? 0.16);
    gl.uniform3fv(u.uCol, o.color ?? [0.30, 0.34, 0.46]);
    gl.uniform1f(u.uLit, o.lit ?? 1);
    gl.uniform2fv(u.uPan, o.pan ?? [0, 0]);
    gl.uniform1f(u.uDens, o.density ?? 1);
    gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.STENCIL_TEST); gl.depthMask(false);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
    this.d.stats.calls++;
  }
}
