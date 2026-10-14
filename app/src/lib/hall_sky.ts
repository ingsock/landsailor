// Cloud decks seen from above at night, drawn in one full-screen pass over the city: each deck a
// plane at its own height between the camera and the ground, its density from noise in the deck's
// own coordinates (so it holds still on the ground and slides by in parallax as the camera rises),
// drifting with the wind, its thin edges lit from below by the city's sodium glow and its tops by a
// little moonlight. A deck the camera is passing through fades, so it never veils the frame.
import { Camera } from '../engine/camera';
import { Draw } from '../engine/draw';
import { FS_VS, Prog, compile } from '../engine/gl';

const FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform vec2 uRes; uniform float uPx; uniform float uTime;
uniform vec3 uCam; uniform vec2 uR; uniform vec2 uD; uniform float uF;
uniform vec4 uDeck[3];   // z of the deck (world), cover 0..1, feature scale (world units), alpha
uniform vec2 uWind;      // world units per second
uniform vec3 uGlow; uniform vec3 uTop;
float h21(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 6; i++){ s += a * vn(p); p = p * 2.07 + 13.7; a *= 0.5; } return s; }
void main(){
  vec2 px = vec2(vUv.x, 1.0 - vUv.y) * uRes / uPx - vec2(960.0, 540.0);
  vec3 acc = vec3(0.0); float A = 0.0;
  // from the lowest deck up, each over the one below it (the nearer the camera, the later)
  for (int i = 0; i < 3; i++) {
    vec4 dk = uDeck[i];
    if (dk.w <= 0.0) continue;
    float dist = dk.x - uCam.z;
    if (dist <= 0.0) continue;
    vec2 q = uCam.xy + (px.x * uR + px.y * uD) * dist / uF;
    vec2 p = (q - uWind * uTime * (1.0 + 0.3 * float(i))) / dk.z;
    float n = fbm(p + float(i) * 7.3);
    float n2 = fbm(p * 3.1 + 2.0);
    float th = 1.0 - dk.y;
    float dens = smoothstep(th, th + 0.22, n * 0.8 + n2 * 0.2);
    // the deck the camera is in: no veil; far below, a little less
    float near = smoothstep(0.0, 140.0, dist);
    float a = dens * dk.w * near;
    float core = smoothstep(th + 0.08, th + 0.4, n);
    vec3 c = mix(uGlow * (0.7 + 0.6 * n2), uTop * (0.6 + 0.8 * n2), core);
    acc = acc * (1.0 - a) + c * a;
    A = A + a * (1.0 - A);
  }
  o = vec4(acc, A);
}`;

export type Deck = [number, number, number, number];

export class CloudDecks {
  private prog: Prog;
  private vao: WebGLVertexArrayObject;
  constructor(public gl: WebGL2RenderingContext, public d: Draw) {
    this.prog = compile(gl, FS_VS, FS, 'hallClouds');
    this.vao = gl.createVertexArray()!;
  }

  /** decks: up to three [z, cover, scale, alpha], the lowest (z nearest 0) first */
  draw(t: number, cam: Camera, decks: Deck[], o: { wind?: [number, number]; glow?: number[]; top?: number[] } = {}) {
    const gl = this.gl, p = this.prog, u = p.u;
    this.d.flush();
    const b = cam.basis();
    gl.useProgram(p.p);
    gl.uniform2f(u.uRes, this.d.res[0], this.d.res[1]);
    gl.uniform1f(u.uPx, this.d.res[1] / 1080);
    gl.uniform1f(u.uTime, t);
    gl.uniform3f(u.uCam, cam.pos[0], cam.pos[1], cam.pos[2]);
    gl.uniform2f(u.uR, b.r[0], b.r[1]);
    gl.uniform2f(u.uD, b.d[0], b.d[1]);
    gl.uniform1f(u.uF, 540 / Math.tan(cam.fov / 2));
    const dk = new Float32Array(12);
    decks.slice(0, 3).forEach((x, i) => dk.set(x, i * 4));
    gl.uniform4fv(u.uDeck, dk);
    gl.uniform2fv(u.uWind, o.wind ?? [1.2, 0.4]);
    gl.uniform3fv(u.uGlow, o.glow ?? [0.05, 0.026, 0.008]);
    gl.uniform3fv(u.uTop, o.top ?? [0.012, 0.016, 0.026]);
    gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.STENCIL_TEST); gl.depthMask(false);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
    this.d.stats.calls++;
  }
}
