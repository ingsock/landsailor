// The sky of the blackout, drawn behind the dark city in one full-screen pass: a sky with no
// city glow in it, the stars and the Milky Way that come back when the lamps are out, and the
// storm's clouds over them, drifting, opening and closing, lit from inside by its lightning.
import { Camera } from '../engine/camera';
import { Draw } from '../engine/draw';
import { FS_VS, Prog, compile } from '../engine/gl';

const FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform vec2 uRes; uniform float uPx; uniform float uTime;
uniform vec2 uHz;          // the horizon: y (px of a 1080-line frame, from the top), softness
uniform vec3 uZen; uniform vec3 uHor;
uniform vec4 uCloud;       // cover 0..1, scale (px), drift (px/s), ambient
uniform vec3 uCloudC;
uniform vec4 uStar;        // stars, galaxy, galaxy angle, galaxy offset (px)
uniform vec4 uFl[4];       // lightning in the clouds: x, y, radius (px), intensity
uniform vec3 uFlC;
uniform float uPan;        // the camera's sideways travel, for the clouds' parallax (px)
uniform float uVeil;       // > 0: only the clouds, as a veil over what is already drawn (a view from above)
uniform float uHaze;       // the glow of the air just below the horizon
float h21(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * vn(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
void main(){
  vec2 px = vec2(vUv.x, 1.0 - vUv.y) * uRes / uPx;
  if (uVeil > 0.0) {
    // clouds seen from above, drifting over the ground: lit faintly from the sky, their edges soft
    vec2 cp = (px + vec2(uPan + uTime * uCloud.z, uTime * uCloud.z * 0.3)) / uCloud.y;
    float n = fbm(cp), n2 = fbm(cp * 2.7 + 5.0);
    float dens = smoothstep(1.02 - uCloud.x, 1.3 - uCloud.x, n * 0.72 + n2 * 0.28);
    vec3 cl = uCloudC * uCloud.w * (0.5 + 1.2 * n2);
    float a = dens * uVeil;
    o = vec4(cl * a, a);
    return;
  }
  float sky = 1.0 - smoothstep(uHz.x - uHz.y, uHz.x + uHz.y, px.y);
  // the glow of the air along the horizon, one band across it
  vec3 glow = uHor * 3.0 * uHaze * exp(-abs(px.y - uHz.x) / 140.0);
  if (sky <= 0.001) { o = vec4(glow, 0.0); return; }
  float h = clamp((uHz.x - px.y) / 1000.0, 0.0, 1.0);
  vec3 c = mix(uHor, uZen, smoothstep(0.0, 0.8, h));
  // the stars: two scales of points, each twinkling at its own rate; the Milky Way a band of soft
  // light with dark lanes of dust through it, and more stars in it
  if (uStar.x > 0.0) {
    vec2 q = px - vec2(960.0, 540.0);
    float ca = cos(uStar.z), sa = sin(uStar.z);
    float across = -q.x * sa + q.y * ca - uStar.w, along = q.x * ca + q.y * sa;
    float band = exp(-across * across / (2.0 * 190.0 * 190.0));
    vec3 st = vec3(0.0);
    for (int k = 0; k < 3; k++) {
      float sc = k == 0 ? 3.0 : k == 1 ? 7.0 : 17.0;
      float keep = (k == 0 ? 0.985 : k == 1 ? 0.978 : 0.975) - (k == 0 ? 0.05 : 0.035) * band * uStar.y;
      vec2 g = px / sc, id = floor(g), f = fract(g) - 0.5;
      float r = h21(id + float(k) * 31.7);
      if (r > keep) {
        vec2 off = vec2(h21(id + 3.1), h21(id + 5.7)) - 0.5;
        float d = length(f - off * 0.6);
        float tw = 0.65 + 0.35 * sin(uTime * (0.8 + 3.0 * h21(id + 9.0)) + r * 40.0);
        float b = (k == 0 ? 0.25 : k == 1 ? 0.8 : 2.4) * pow(h21(id + 11.0), 2.5) * tw;
        vec3 col = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.85, 0.65), h21(id + 2.0));
        // a point well inside its cell, sized in pixels, so no star is cut square
        float rp = (k == 0 ? 0.45 : k == 1 ? 0.7 : 1.1) / sc;
        st += col * b * exp(-d * d / (2.0 * rp * rp));
      }
    }
    float neb = fbm(vec2(along, across) / 170.0 + 3.0) * 0.65 + fbm(vec2(along, across) / 45.0 + 9.0) * 0.35;
    float lanes = smoothstep(0.42, 0.72, fbm(vec2(along / 110.0, across / 26.0) + 8.0)) * exp(-across * across / (2.0 * 70.0 * 70.0));
    vec3 gal = mix(vec3(0.42, 0.5, 0.8), vec3(1.0, 0.86, 0.7), smoothstep(0.35, 0.8, neb) * exp(-abs(along) / 900.0));
    gal *= band * neb * (1.0 - 0.85 * lanes) * 0.11;
    c += (st * (1.0 + 1.5 * band * uStar.y) + gal * uStar.y) * uStar.x * smoothstep(0.0, 0.15, h);
  }
  // the clouds: where the noise is under the cover they are thick; the lightning inside them
  // lights them most where they are thickest
  vec2 cp = (px + vec2(uPan + uTime * uCloud.z, 0.0)) / uCloud.y;
  float n = fbm(cp + vec2(uTime * 0.015, 0.0)), n2 = fbm(cp * 2.7 + 5.0);
  float m = n * 0.72 + n2 * 0.28 + 0.12 * (1.0 - h);
  float dens = smoothstep(1.02 - uCloud.x, 1.22 - uCloud.x, m);
  float L = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 f = uFl[i];
    if (f.w <= 0.0) continue;
    vec2 dd = (px - f.xy) / vec2(f.z, f.z * 0.6);
    L += f.w * exp(-dot(dd, dd));
  }
  float relief = smoothstep(0.3, 0.85, n2) * (0.5 + 0.5 * smoothstep(0.0, 0.5, h));
  vec3 cl = uCloudC * uCloud.w * (0.35 + 1.6 * relief) + uFlC * L * (0.12 + 1.1 * relief * relief);
  c = mix(c, cl, dens);
  c += uFlC * L * 0.05 * (1.0 - dens);
  o = vec4((c + glow) * sky + glow * (1.0 - sky), sky);
}`;

export type Flash = [number, number, number, number]; // x, y, radius (px), intensity

export type StormSkyOpts = {
  horizon: number;        // y of the horizon on screen (px of a 1080-line frame); < 0: none
  soft?: number;
  zen?: number[]; hor?: number[];
  cover: number;          // 0 clear .. 1 overcast
  scale?: number; drift?: number; ambient?: number; cloud?: number[];
  stars?: number; galaxy?: number; galaxyAngle?: number; galaxyOffset?: number;
  flashes?: Flash[]; flashColor?: number[];
  pan?: number;
  veil?: number;          // > 0: draw only the clouds, over what is there, at this opacity
  haze?: number;          // the glow of the air below the horizon
};

export class StormSky {
  private prog: Prog;
  private vao: WebGLVertexArrayObject;
  constructor(public gl: WebGL2RenderingContext, public d: Draw) {
    this.prog = compile(gl, FS_VS, FS, 'stormSky');
    this.vao = gl.createVertexArray()!;
  }

  /** where the horizon falls on screen for a camera with no roll: the y of the 1080-line frame */
  static horizonOf(cam: Camera): number {
    const f = cam.basis().f;
    const below = Math.asin(Math.max(-1, Math.min(1, f[1])));   // world y is down
    const F = 540 / Math.tan(cam.fov / 2);
    return 540 - F * Math.tan(below);
  }

  draw(t: number, o: StormSkyOpts) {
    if (o.horizon <= 0 && !(o.veil && o.veil > 0)) return;
    const gl = this.gl, p = this.prog, u = p.u;
    this.d.flush();
    gl.useProgram(p.p);
    gl.uniform2f(u.uRes, this.d.res[0], this.d.res[1]);
    gl.uniform1f(u.uPx, this.d.res[1] / 1080);
    gl.uniform1f(u.uTime, t);
    gl.uniform2f(u.uHz, o.horizon, o.soft ?? 40);
    gl.uniform3fv(u.uZen, o.zen ?? [0.0014, 0.0018, 0.0042]);
    gl.uniform3fv(u.uHor, o.hor ?? [0.0045, 0.0042, 0.0075]);
    gl.uniform4f(u.uCloud, o.cover, o.scale ?? 420, o.drift ?? 22, o.ambient ?? 1);
    gl.uniform3fv(u.uCloudC, o.cloud ?? [0.010, 0.010, 0.018]);
    gl.uniform4f(u.uStar, o.stars ?? 0, o.galaxy ?? 0, o.galaxyAngle ?? -0.9, o.galaxyOffset ?? 0);
    const fl = new Float32Array(16);
    (o.flashes || []).slice(0, 4).forEach((f, i) => fl.set(f, i * 4));
    gl.uniform4fv(u.uFl, fl);
    gl.uniform3fv(u.uFlC, o.flashColor ?? [0.55, 0.58, 0.85]);
    gl.uniform1f(u.uPan, o.pan ?? 0);
    gl.uniform1f(u.uVeil, o.veil ?? 0);
    gl.uniform1f(u.uHaze, o.haze ?? 0);
    gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.STENCIL_TEST); gl.depthMask(false);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
    this.d.stats.calls++;
  }
}
