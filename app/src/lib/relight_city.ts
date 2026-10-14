// The city's return, seen from the air (scenes/relight.ts): the air over Chicago as the power comes
// back. Two full-screen passes around the city's own lines and lamps:
// - under them, the sky and the ground: the stars of the blackout fading as the glow of the lamps
//   comes back into the haze, the dark land with the carpet of their light, and the lake holding the
//   sky in its small waves;
// - over them, the air: a broken deck of the storm's last cloud lit from below as the rings of lamps
//   pass under it, a low mist that the lamps light, and the haze toward the horizon.
// Also the lamps themselves (a bright point and a soft pool each) and the first cars, which wake and
// move off as the light reaches them. World: the city's ground model (0.1 world units a metre, x
// east, z north, y down); the shaders work in metres east and south of State & Madison.
import { Camera } from '../engine/camera';
import { DotMesh, Draw } from '../engine/draw';
import { FS_VS, Prog, compile } from '../engine/gl';
import { RGBA, clamp, mulberry32 } from '../engine/math';
import { CityData } from './city';
import { Way, along } from './traffic';

export const SHORE_Y0 = -26000;
export const SHORE_STEP = 250;
const SHORE_N = 256;

/** where the lake begins, metres east, for each 250 m band of metres south: the city's eastmost
 *  street in the band (piers dropped by a median), a little out from it */
export function shoreTable(city: CityData): Float32Array {
  const N = SHORE_N;
  const mx = new Float32Array(N).fill(-1e9);
  for (const segs of [city.major, city.streets]) {
    const n = segs.length / 6;
    for (let i = 0; i < n; i++) {
      for (let e = 0; e < 2; e++) {
        const x = segs[i * 6 + e * 2], y = segs[i * 6 + e * 2 + 1];
        const j = Math.floor((y - SHORE_Y0) / SHORE_STEP);
        if (j >= 0 && j < N && x > mx[j]) mx[j] = x;
      }
    }
  }
  const med = new Float32Array(N);
  for (let j = 0; j < N; j++) {
    const w: number[] = [];
    for (let k = -3; k <= 3; k++) { const v = mx[Math.max(0, Math.min(N - 1, j + k))]; if (v > -1e8) w.push(v); }
    w.sort((a, b) => a - b);
    med[j] = w.length >= 3 ? w[w.length >> 1] : 1e6;
  }
  const out = new Float32Array(N);
  for (let j = 0; j < N; j++) {
    let s = 0, n = 0;
    for (let k = -1; k <= 1; k++) { const v = med[Math.max(0, Math.min(N - 1, j + k))]; if (v < 1e5) { s += v; n++; } }
    out[j] = n ? s / n + 90 : 1e6;
  }
  return out;
}

const LIB = `
uniform vec3 uCam; uniform vec3 uRt; uniform vec3 uDn; uniform vec3 uFw;
uniform vec4 uProj; uniform vec2 uRes;
uniform float uTime;
uniform vec4 uRing;      // radius (m), softness (m), the front's flare, how lit the lit part is
uniform vec3 uZen; uniform vec3 uHor; uniform vec3 uGlowC;
uniform vec4 uSkyK;      // glow gain, stars, haze gain, haze: visibility (m)
uniform vec4 uDeck;      // altitude (m), cover, scale (m), drift (m/s)
uniform vec3 uCloudC;    // the clouds by the moon
uniform vec3 uCloudG;    // the colour of the city's light on a cloud
uniform vec4 uDeckK;     // glow from below, clear radius over the Loop (m), how far it is seen (m), -
uniform float uHazeEl;   // the elevation (rad) whose sky colours the haze at the horizon
uniform vec4 uMist;      // top (m), density (per m), wisp scale (m), gain
uniform vec3 uGround;
uniform vec4 uShore[64];
uniform vec4 uDawn;      // toward the dawn (east, north), its strength, -
uniform vec3 uDawnC;
vec3 rayDir(vec2 fc){
  vec2 ndc = fc / uRes * 2.0 - 1.0;
  return normalize(uFw + uRt * ((ndc.x - uProj.z) * uProj.x) - uDn * ((ndc.y - uProj.w) * uProj.y));
}
float h21(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * vn(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
float fbm3(vec2 p){ return 0.5 * vn(p) + 0.25 * vn(p * 2.03 + 17.1) + 0.125 * vn(p * 4.1 + 3.7); }
/** box-filtered periodic stripes: |x mod P| < hw, seen through a pixel fw wide */
float stripeI(float u, float P, float w){ return floor(u / P) * w + min(fract(u / P) * P, w); }
float stripes(float x, float P, float hw, float fw){
  fw = max(fw, 1e-3);
  float u = x + hw;
  return clamp((stripeI(u + 0.5 * fw, P, 2.0 * hw) - stripeI(u - 0.5 * fw, P, 2.0 * hw)) / fw, 0.0, 1.0);
}
/** a lamp every 46 m along a street, or their average where a pixel covers several */
float pools(float u, float fw){
  float d = abs(fract(u / 46.0 + 0.5) - 0.5) * 46.0;
  return mix(exp(-d * d / 30.0), 0.24, smoothstep(5.0, 24.0, fw));
}
float shoreAt(int i){ vec4 q = uShore[i >> 2]; int k = i & 3; return k == 0 ? q.x : k == 1 ? q.y : k == 2 ? q.z : q.w; }
float shoreX(float south){
  float f = clamp((south - (${SHORE_Y0}.0)) / ${SHORE_STEP}.0, 0.0, 254.999);
  int i = int(f);
  return mix(shoreAt(i), shoreAt(i + 1), f - float(i));
}
float lake(vec2 m){ return smoothstep(20.0, 260.0, m.x - shoreX(m.y)); }
/** how lit the ground is at m (metres east, south): within the ring, on land, brighter toward the Loop */
float litAt(vec2 m){
  float r = length(m);
  float on = 1.0 - smoothstep(uRing.x - uRing.y, uRing.x + 0.25 * uRing.y, r);
  return on * (0.3 + 0.7 * exp(-r / 6500.0)) * (1.0 - lake(m)) * uRing.w;
}
/** the same, the shore blurred over a few km: for the glow in the haze, which has no edges */
float litSoft(vec2 m){
  float r = length(m);
  float on = 1.0 - smoothstep(uRing.x - uRing.y, uRing.x + 0.25 * uRing.y, r);
  return on * (0.3 + 0.7 * exp(-r / 6500.0)) * (1.0 - smoothstep(-1500.0, 3500.0, m.x - shoreX(m.y))) * uRing.w;
}
/** the sky toward D: its gradient, the city's glow in the haze toward what is lit, the stars */
vec3 skyCol(vec3 D, float stars){
  float e = max(asin(clamp(-D.y, -1.0, 1.0)), 0.0);
  vec3 c = mix(uHor, uZen, sqrt(clamp(e / 1.1, 0.0, 1.0)));
  vec2 cm = vec2(uCam.x, -uCam.z) * 10.0;
  vec2 dir = normalize(vec2(D.x, -D.z) + vec2(1e-6, 0.0));
  float g = 0.0, gf = 0.0;
  for (int i = 0; i < 7; i++) {
    float dist = 700.0 * pow(1.8, float(i));
    float l = litSoft(cm + dir * dist);
    g += l / (1.0 + dist / 8000.0);
    if (i >= 4) gf += l;
  }
  g = g * 0.32 + 0.25 * litSoft(cm);
  // the dome of the glow over what is lit, and the thin bright line where the lights far off merge
  float glow = g * (exp(-e / 0.03) + 0.045 * exp(-e / 0.2)) * uSkyK.x + gf * exp(-e / 0.006) * uSkyK.x * 0.9;
  c += uGlowC * glow;
  // the first light of the dawn low in the east
  if (uDawn.z > 0.0) {
    float tw = max(dot(normalize(D.xz + vec2(1e-6, 0.0)), uDawn.xy), 0.0);
    c += uDawnC * uDawn.z * (exp(-e / 0.06) * (0.25 + 0.75 * tw * tw) + 0.3 * exp(-e / 0.3) * tw);
  }
  if (stars > 0.0 && e > 0.0) {
    vec2 sp = vec2(D.x, D.z) / (e + 0.3) * 520.0;
    vec3 st = vec3(0.0);
    for (int k = 0; k < 2; k++) {
      float sc = k == 0 ? 5.0 : 13.0;
      vec2 g2 = sp / sc, id = floor(g2), f = fract(g2) - 0.5;
      float r = h21(id + float(k) * 31.7);
      if (r > (k == 0 ? 0.972 : 0.955)) {
        vec2 off = vec2(h21(id + 3.1), h21(id + 5.7)) - 0.5;
        float d = length(f - off * 0.6);
        float tw = 0.65 + 0.35 * sin(uTime * (0.8 + 3.0 * h21(id + 9.0)) + r * 40.0);
        float b = (k == 0 ? 0.35 : 1.6) * pow(h21(id + 11.0), 2.0) * tw;
        float rp = (k == 0 ? 0.55 : 0.85) / sc;
        st += mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.86, 0.68), h21(id + 2.0)) * b * exp(-d * d / (2.0 * rp * rp));
      }
    }
    c += st * stars * smoothstep(0.0, 0.1, e) / (1.0 + glow * 60.0);
  }
  return c;
}
`;

const BG_FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
${LIB}
void main(){
  vec3 D = rayDir(gl_FragCoord.xy);
  vec3 C = uCam * 10.0;
  float alt = -C.y;
  float s = D.y > 1e-5 ? alt / D.y : 1e7;
  vec3 P = C + D * min(s, 1e6);
  vec2 m = vec2(P.x, -P.z);
  vec2 fw = fwidth(m);
  float fp = max(fw.x, fw.y);
  vec3 c;
  if (D.y <= 1e-5) {
    c = skyCol(D, uSkyK.y);
  } else {
    float lk = lake(m);
    float lt = litAt(m);
    // the land: dark, uneven, and where the lamps are on, the faint carpet of their pools
    float blocks = vn(m / 140.0) * 0.6 + vn(m / 37.0) * 0.4;
    vec3 land = uGround * (0.7 + 0.6 * blocks) + uGlowC * lt * (0.001 + 0.004 * blocks);
    // beyond the mapped streets, the suburbs' grid of lamps on to the horizon: a mile grid of
    // arterials and the streets between, filtered to their average light far off
    float out_ = 1.0 - smoothstep(-1200.0, 0.0, min(min(m.x + 14000.0, 2600.0 - m.x), min(m.y + 9800.0, 9200.0 - m.y)));
    if (out_ > 0.0 && lt > 0.0) {
      float aA = stripes(m.x + 800.0, 1609.0, 7.0, fw.x), aB = stripes(m.y + 800.0, 1609.0, 7.0, fw.y);
      float lA = stripes(m.x + 37.0, 201.0, 3.0, fw.x), lB = stripes(m.y + 61.0, 201.0, 3.0, fw.y);
      float pz = pools(m.y, fw.y), px = pools(m.x + 13.0, fw.x);
      float hood = smoothstep(0.32, 0.62, vn(m / 2300.0 + 4.0)) * (0.6 + 0.4 * vn(m / 600.0));
      float lights = (aA * pz + aB * px) * 1.1 + (lA * pz + lB * px) * 0.45 * hood;
      land += uGlowC * lights * lt * out_ * 1.6;
    }
    // the lake: dark water, the sky in it broken by small waves that move (smoothed out where a
    // pixel covers more than they are)
    float calm = 1.0 - smoothstep(4.0, 40.0, fp);
    vec2 wv = (vec2(fbm3(m / 70.0 + uTime * vec2(0.11, 0.05)), fbm3(m / 70.0 + 7.3 - uTime * vec2(0.04, 0.1))) - 0.44) * calm;
    vec3 N = normalize(vec3(wv.x * 0.3, -1.0, wv.y * 0.3));
    vec3 R = reflect(D, N);
    R.y = min(R.y, -0.002);
    float fres = 0.02 + 0.98 * pow(1.0 - clamp(-dot(D, N), 0.0, 1.0), 5.0);
    vec3 water = uGround * vec3(0.45, 0.65, 1.15) + skyCol(normalize(R), 0.0) * fres * 0.5;
    // the lit shore's light spilling a little way out over the water
    float near = exp(-max(m.x - shoreX(m.y), 0.0) / 350.0);
    water += uCloudG * litAt(vec2(shoreX(m.y) - 200.0, m.y)) * 0.012 * near * (0.7 + 0.6 * wv.x);
    c = mix(land, water, lk);
  }
  o = vec4(c, 1.0);
}`;

const FG_FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
${LIB}
void main(){
  vec3 D = rayDir(gl_FragCoord.xy);
  vec3 C = uCam * 10.0;
  float alt = -C.y;
  float sG = D.y > 1e-5 ? alt / D.y : 1e9;
  vec3 L = vec3(0.0);
  float T = 1.0;
  // the deck of cloud: from below, lit by the city under it; from above, by the moon, the city's
  // light coming through where it is thin
  float H = uDeck.x;
  float sD = abs(D.y) > 1e-5 ? (alt - H) / D.y : -1.0;
  if (uDeck.y > 0.0 && sD > 0.0 && sD < sG) {
    vec3 P = C + D * sD;
    vec2 m = vec2(P.x, -P.z);
    vec2 q = (m + vec2(1.0, 0.35) * uTime * uDeck.w) / uDeck.z;
    // a warped field, so the cloud has billows and tatters, not a smooth smear
    vec2 wq = q + 0.6 * vec2(fbm3(q * 0.7 + 3.1), fbm3(q * 0.7 + 8.4));
    float n = fbm(wq), n2 = fbm(wq * 2.7 + 4.1);
    float cover = uDeck.y * smoothstep(uDeckK.y * 0.6, uDeckK.y * 1.6 + 1.0, length(m));
    float body = n * 0.7 + n2 * 0.3;
    float dens = smoothstep(1.0 - cover, 1.16 - cover, body);
    dens *= exp(-sD / (uDeckK.z > 0.0 ? uDeckK.z : 40000.0));
    float relief = smoothstep(0.35, 0.8, n2);
    float edge = 1.0 - smoothstep(1.0 - cover, 1.3 - cover, body);   // thin near its edges
    float under = litAt(m) + 0.6 * litAt(m + vec2(700.0, -500.0)) + 0.6 * litAt(m - vec2(600.0, -600.0));
    vec3 cc;
    if (alt < H) {
      // the underside: dark where nothing is lit under it; where the lamps are, their light
      cc = uCloudC * (0.3 + 0.8 * relief) + uCloudG * under * uDeckK.x * (0.07 + 1.3 * relief * relief + 0.45 * edge);
    } else {
      // the tops in the moonlight, silver at the thin edges; the city's light through the thin parts
      cc = uCloudC * (1.6 + 2.6 * relief + 2.4 * edge * edge) + uCloudG * under * uDeckK.x * 0.9 * edge * edge;
      // the tops toward the dawn catch its light: each billow lit on the side that faces it, in
      // shadow on the other, and more so toward the dawn's part of the sky
      if (uDawn.z > 0.0) {
        float tw = max(dot(normalize(D.xz + vec2(1e-6, 0.0)), uDawn.xy), 0.0);
        vec2 toL = vec2(uDawn.x, -uDawn.y) * 0.12;
        vec2 wl = wq + toL;
        float bl = fbm(wl) * 0.7 + fbm(wl * 2.7 + 4.1) * 0.3;
        float sun = clamp((body - bl) * 7.0 + 0.45, 0.0, 1.0);
        cc *= 0.7 + 0.6 * sun;
        cc += uDawnC * uDawn.z * (0.25 + 0.75 * tw * tw) * (0.15 + 1.4 * sun * (0.4 + 0.6 * relief)) * 0.75;
      }
    }
    float al = dens * 0.95;
    L += T * cc * al;
    T *= 1.0 - al;
  }
  if (D.y > 1e-5) {
    // the low mist, lit by the lamps under it, drifting
    float top = uMist.x;
    float s0 = alt > top ? (alt - top) / D.y : 0.0;
    float s1 = min(sG, s0 + 4000.0);
    if (s1 > s0 && uMist.y > 0.0) {
      float ds = (s1 - s0) / 8.0;
      float j = h21(gl_FragCoord.xy * 0.73);
      for (int i = 0; i < 8; i++) {
        float s = s0 + ds * (float(i) + j);
        vec3 P = C + D * s;
        vec2 m = vec2(P.x, -P.z);
        float h = max(alt - D.y * s, 0.0);
        float w = fbm3(m / uMist.z + uTime * vec2(0.035, -0.012));
        float dens = uMist.y * smoothstep(0.4, 0.76, w) * exp(-h / (top * 0.45)) * exp(-s / 7000.0);
        vec3 Ls = uCloudG * litAt(m) * uMist.w + uCloudC * 0.5;
        float tr = exp(-dens * ds);
        L += T * Ls * (1.0 - tr);
        T *= tr;
      }
    }
    // the front of the ring: a band of light running out through the low air on the beat
    if (uRing.z > 0.0 && uRing.x > 0.0) {
      float sF = alt > 140.0 ? (alt - 140.0) / D.y : 0.0;
      vec3 PF = C + D * min(max(sF, 0.0), sG);
      float rF = length(vec2(PF.x, -PF.z));
      float wF = 90.0 + uRing.x * 0.035;
      float band = exp(-pow((rF - uRing.x + 0.4 * wF) / wF, 2.0)) * (1.0 - lake(vec2(PF.x, -PF.z)));
      L += T * uCloudG * band * uRing.z * 0.05;
    }
    // the haze: the dark air near, the city's glow in it far off toward what is lit
    float Th = exp(-sG / uSkyK.w);
    vec3 hzFar = skyCol(normalize(vec3(D.x, -uHazeEl, D.z)), 0.0);
    vec3 hzNear = mix(uHor, uZen, 0.3) * 1.2;
    vec3 hz = mix(hzNear, hzFar, smoothstep(2500.0, 22000.0, sG)) * uSkyK.z;
    L += T * hz * (1.0 - Th);
    T *= Th;
  }
  o = vec4(L, 1.0 - T);
}`;

export type AirOpts = {
  ring: number; soft: number; lit: number; front?: number;
  zen: RGBA; hor: RGBA; glow: RGBA; ground: RGBA; cloud: RGBA; cloudGlow: RGBA;
  glowGain: number; stars: number; vis: number; haze: number;
  /** altitude (m), cover, scale (m), drift (m/s) */
  deck: [number, number, number, number]; deckGlow: number; clear: number; deckFar?: number;
  /** the elevation (rad) whose sky colours the haze at the horizon: 0 for a seamless horizon */
  hazeEl?: number;
  /** top (m), density (per m), wisp scale (m), gain */
  mist: [number, number, number, number];
  /** toward the dawn (east, north), its strength, and its colour */
  dawn?: [number, number, number]; dawnC?: RGBA;
};

/** the sky and the air of the relit city */
export class RelightAir {
  private bg: Prog; private fg: Prog; private vao: WebGLVertexArrayObject;
  constructor(public gl: WebGL2RenderingContext, public d: Draw, public shore: Float32Array) {
    this.bg = compile(gl, FS_VS, BG_FS, 'relightSky');
    this.fg = compile(gl, FS_VS, FG_FS, 'relightAir');
    this.vao = gl.createVertexArray()!;
  }

  private uniforms(p: Prog, cam: Camera, t: number, o: AirOpts) {
    const gl = this.gl, u = p.u, d = this.d;
    const { r, d: dn, f } = cam.basis();
    const ty = Math.tan(cam.fov / 2), tx = ty * (d.res[0] / d.res[1]);
    gl.uniform3fv(u.uCam, cam.pos);
    gl.uniform3fv(u.uRt, r); gl.uniform3fv(u.uDn, dn); gl.uniform3fv(u.uFw, f);
    gl.uniform4f(u.uProj, tx, ty, cam.shift[0] / 960, -cam.shift[1] / 540);
    gl.uniform2f(u.uRes, d.res[0], d.res[1]);
    gl.uniform1f(u.uTime, t);
    gl.uniform4f(u.uRing, o.ring, o.soft, o.front ?? 0, o.lit);
    gl.uniform3f(u.uZen, o.zen[0], o.zen[1], o.zen[2]);
    gl.uniform3f(u.uHor, o.hor[0], o.hor[1], o.hor[2]);
    gl.uniform3f(u.uGlowC, o.glow[0], o.glow[1], o.glow[2]);
    gl.uniform4f(u.uSkyK, o.glowGain, o.stars, o.haze, o.vis);
    gl.uniform4f(u.uDeck, o.deck[0], o.deck[1], o.deck[2], o.deck[3]);
    gl.uniform3f(u.uCloudC, o.cloud[0], o.cloud[1], o.cloud[2]);
    if (u.uCloudG) gl.uniform3f(u.uCloudG, o.cloudGlow[0], o.cloudGlow[1], o.cloudGlow[2]);
    gl.uniform4f(u.uDeckK, o.deckGlow, o.clear, o.deckFar ?? 0, 0);
    if (u.uHazeEl) gl.uniform1f(u.uHazeEl, o.hazeEl ?? 0.015);
    gl.uniform4f(u.uMist, o.mist[0], o.mist[1], o.mist[2], o.mist[3]);
    gl.uniform3f(u.uGround, o.ground[0], o.ground[1], o.ground[2]);
    const dw = o.dawn ?? [1, 0, 0], dc = o.dawnC ?? [0, 0, 0, 1];
    const dl = Math.hypot(dw[0], dw[1]) || 1;
    if (u.uDawn) gl.uniform4f(u.uDawn, dw[0] / dl, dw[1] / dl, dw[2], 0);
    if (u.uDawnC) gl.uniform3f(u.uDawnC, dc[0], dc[1], dc[2]);
    if (u.uShore) gl.uniform4fv(u.uShore, this.shore);
  }

  private pass(p: Prog, blend: boolean) {
    const gl = this.gl;
    if (blend) { gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); } else gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.STENCIL_TEST); gl.depthMask(false);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
    this.d.stats.calls++;
  }

  /** the sky and the ground, before anything else */
  under(cam: Camera, t: number, o: AirOpts) {
    this.d.flush();
    this.gl.useProgram(this.bg.p);
    this.uniforms(this.bg, cam, t, o);
    this.pass(this.bg, false);
  }

  /** the cloud, the mist and the haze, over the city's lines and lamps */
  over(cam: Camera, t: number, o: AirOpts) {
    this.d.flush();
    this.gl.useProgram(this.fg.p);
    this.uniforms(this.fg, cam, t, o);
    this.pass(this.fg, true);
  }
}

/** street lamps along the streets: k0 their distance from State & Madison with a little scatter
 *  (the order they come on in), k1 their distance (for the flare at the front); a bright point
 *  each (`pool` false) or the soft pool of its light on the ground (`pool` true) */
export function relightLamps(d: Draw, segs: Float32Array[], o: { spacing: number; pool: boolean; seed: number; classes?: number[] }): DotMesh {
  const rnd = mulberry32(o.seed);
  const out: number[] = [];
  const sod: RGBA = [1, 0.36, 0.06, 1], led: RGBA = [0.78, 0.84, 1.0, 1];
  for (const sg of segs) {
    const n = sg.length / 6;
    let carry = 0;
    for (let i = 0; i < n; i++) {
      const ax = sg[i * 6], ay = sg[i * 6 + 1], bx = sg[i * 6 + 2], by = sg[i * 6 + 3], cls = sg[i * 6 + 4];
      if (o.classes && !o.classes.includes(cls)) continue;
      const L = Math.hypot(bx - ax, by - ay);
      const sp = o.spacing * (cls <= 2 ? 0.8 : 1);
      let s = carry;
      while (s < L) {
        const t = s / L;
        const x = ax + (bx - ax) * t + (rnd() - 0.5) * 8, y = ay + (by - ay) * t + (rnd() - 0.5) * 8;
        const dist = Math.hypot(x, y);
        const white = rnd() < 0.07;
        const c = white ? led : sod;
        const k = (cls <= 2 ? 1.25 : cls <= 4 ? 1.0 : 0.8) * (0.75 + 0.5 * rnd());
        const r = o.pool ? (cls <= 2 ? 3.2 : 2.4) : (cls <= 2 ? 1.25 : 1.0);
        out.push(x, y, 0, c[0] * k, c[1] * k, c[2] * k, 1, r, o.pool ? 1 : 0.55, dist + rnd() * 90, dist);
        s += sp;
      }
      carry = s - L;
    }
  }
  return d.makeDots(new Float32Array(out));
}

/** the lake's edge from the shore table, metres east, at `south` metres south (as the shaders read it) */
export function shoreAtY(shore: Float32Array, south: number): number {
  const f = clamp((south - SHORE_Y0) / SHORE_STEP, 0, SHORE_N - 1.001);
  const i = Math.floor(f);
  return shore[i] + (shore[i + 1] - shore[i]) * (f - i);
}

/** the suburbs beyond the mapped streets, out to the horizon: lamps along the section-line roads of
 *  the mile grid and the half-mile roads between, and the scatter of the streets between them; none
 *  on the lake, none inside `box` (where the streets are mapped). k0/k1 as relightLamps */
export function farLamps(d: Draw, shore: Float32Array, o: { R: number; box: [number, number, number, number]; seed: number }): DotMesh {
  const rnd = mulberry32(o.seed);
  const out: number[] = [];
  const MILE = 1609.34;
  const [bx0, by0, bx1, by1] = o.box;
  const sod: RGBA = [1, 0.36, 0.06, 1], led: RGBA = [0.78, 0.84, 1.0, 1];
  const add = (x: number, y: number, k: number, r: number) => {
    if (x > bx0 && x < bx1 && y > by0 && y < by1) return;
    const dist = Math.hypot(x, y);
    if (dist > o.R) return;
    if (x > shoreAtY(shore, y) - 60) return;
    const c = rnd() < 0.08 ? led : sod;
    const kk = k * (0.7 + 0.6 * rnd());
    out.push(x, y, 0, c[0] * kk, c[1] * kk, c[2] * kk, 1, r, 0.55, dist + rnd() * 140, dist);
  };
  const n = Math.ceil(o.R / (MILE / 2));
  for (let i = -n; i <= n; i++) {
    const mile = i % 2 === 0;
    const line = i * (MILE / 2);
    const step = mile ? 75 : 130;
    if (!mile && rnd() < 0.3) continue;
    for (let s = -o.R; s <= o.R; s += step) {
      const j = (rnd() - 0.5) * 6;
      add(line + j, s + j, mile ? 1.2 : 0.8, mile ? 1.3 : 1.0);
      add(s + j, line + j, mile ? 1.2 : 0.8, mile ? 1.3 : 1.0);
    }
  }
  // the side streets: lamps scattered through the neighbourhoods, thinner where the noise says park
  for (let i = 0; i < 160000; i++) {
    const x = (rnd() * 2 - 1) * o.R, y = (rnd() * 2 - 1) * o.R;
    const hood = Math.sin(x / 2300 + 1.3) * Math.sin(y / 1900 + 0.4) + Math.sin(x / 5100 - y / 4300);
    if (hood < -0.2) continue;
    add(Math.round(x / 100) * 100 + (rnd() < 0.5 ? (rnd() - 0.5) * 100 : 0), Math.round(y / 100) * 100 + (rnd() < 0.5 ? 0 : (rnd() - 0.5) * 100), 0.6, 0.9);
  }
  return d.makeDots(new Float32Array(out));
}

type Car = { w: Way; s0: number; dir: 1 | -1; v: number; r0: number; ph: number };

/** the cars on the expressways, stopped in the dark; each wakes as the light reaches it, its lights
 *  come on and it moves off */
export class WakeTraffic {
  cars: Car[] = [];
  constructor(ways: Way[], o: { classes: number[]; density: number; seed: number; box?: [number, number, number, number] }) {
    const rnd = mulberry32(o.seed);
    for (const w of ways) {
      if (!o.classes.includes(w.c)) continue;
      if (o.box) {
        const [x0, y0, x1, y1] = o.box;
        const p = w.pts[0], q = w.pts[w.pts.length - 1];
        if (Math.max(p[0], q[0]) < x0 || Math.min(p[0], q[0]) > x1 || Math.max(p[1], q[1]) < y0 || Math.min(p[1], q[1]) > y1) continue;
      }
      const n = Math.max(1, Math.round((w.len / 1000) * o.density * Math.max(1, w.lanes)));
      for (const dir of (w.oneway ? [1] : [1, -1]) as (1 | -1)[]) {
        for (let i = 0; i < n; i++) {
          const s0 = rnd() * w.len;
          const [x, y] = along(w, s0);
          this.cars.push({ w, s0, dir, v: 0.8 + 0.4 * rnd(), r0: Math.hypot(x, y), ph: rnd() });
        }
      }
    }
  }

  /** wake(r): seconds since the light reached distance r (negative before); speed m/s; trail m */
  draw(d: Draw, wake: (r: number) => number, o: { speed: number; trail: number; width: number; head: RGBA; tail: RGBA; view: [number, number]; fog?: [number, number, number]; ramp?: number; clip?: [number, number, number, number] }) {
    const ramp = o.ramp ?? 1.6;
    d.lineStyle({ blend: 'add', fog: o.fog });
    for (const car of this.cars) {
      const tw = wake(car.r0) - car.ph * 0.4;
      if (tw <= 0) continue;
      // moving off: the distance driven grows as the square of the time at first, then evenly
      const run = tw < ramp ? (tw * tw) / (2 * ramp) : tw - ramp / 2;
      const v = o.speed * car.v;
      const L = car.w.len;
      let s = car.s0 + car.dir * v * run;
      s = ((s % L) + L) % L;
      const [x, y, dx, dy] = along(car.w, s);
      if (o.clip && (x < o.clip[0] || x > o.clip[2] || y < o.clip[1] || y > o.clip[3])) continue;
      const sp = Math.min(1, tw / ramp);
      const tr = o.trail * (0.15 + 0.85 * sp);
      let [bx, by] = along(car.w, s - car.dir * tr);
      if (o.clip) { bx = Math.max(o.clip[0], Math.min(o.clip[2], bx)); by = Math.max(o.clip[1], Math.min(o.clip[3], by)); }
      const on = clamp(tw / 0.25);
      const toward = dx * car.dir * o.view[0] + dy * car.dir * o.view[1] < 0;
      const c = toward ? o.head : o.tail;
      const col: RGBA = [c[0] * on, c[1] * on, c[2] * on, 1];
      d.seg([x, y, 0], [bx, by, 0], o.width, col, o.width * 0.5, [0, 0, 0, 1]);
    }
    d.flush();
    d.lineStyle({});
  }
}
