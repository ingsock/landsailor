// The Earth at night: NASA's Black Marble on a sphere, each country's lights scaled by its own
// number (looked up through a map of country indices), so a country can be switched on alone.
// The lights are read through a curve that lifts the faint ones (the towns of Africa and Latin
// America, which a straight levels cut away), with a halo of their own glow in the air over them.
// The rest of the picture is the night around the lights: moonlight on the sphere and its glint on
// the sea, a faint graticule, country borders, the air on the limb, and a ring of light that can
// run across the surface from one place (the wave).
//
// Draw order for a whole globe (see drawAll): stars, the sphere, the air beyond the limb, the
// towns. Each part is also callable alone.
import { Draw, TexMesh } from '../engine/draw';
import { compile, loadTexture, Prog } from '../engine/gl';
import { M4, RGBA, V3, m4 } from '../engine/math';
import { loadImage, sphereMesh } from './geo';
import { GlobeTowns, TownOpts } from './globe_towns';
import { drawAir, drawStars, AirOpts, StarOpts } from './globe_sky';

const VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aP;
layout(location=1) in vec2 aUV;
uniform mat4 uVP; uniform mat4 uModel; uniform float uR;
out vec2 vUV; out vec3 vN; out vec3 vW; out vec3 vO;
void main(){
  vec4 w = uModel * vec4(aP, 1.0);
  vW = w.xyz; vN = normalize(mat3(uModel) * aP); vUV = aUV; vO = aP / uR;
  gl_Position = uVP * w;
}`;

const FS = `#version 300 es
precision highp float;
in vec2 vUV; in vec3 vN; in vec3 vW; in vec3 vO;
uniform sampler2D uLights; uniform sampler2D uIds; uniform sampler2D uLevels;
uniform vec3 uLight;      // the chart's light (faint lights)
uniform vec3 uLightHot;   // the colour of the brightest cores
uniform vec3 uNeutral;    // lights not scaled by the chart (countries with no data)
uniform vec3 uLand; uniform vec3 uSea;
uniform vec4 uCurve;      // black point (picture value), gamma, gain, extra light in the cores
uniform float uSpill;     // the glow of the lights in the air over them
uniform float uSeaLevel;  // level of lights at sea (ships, platforms) and of coasts the map misses
uniform vec3 uCam;
uniform vec4 uMoon;       // direction to the moon (world, unit), strength
uniform float uSheen;     // the moon's glint on the sea
uniform vec4 uAir;        // colour of the air on the limb, strength
uniform vec4 uGrat;       // colour (rgb), strength
uniform vec2 uGratStep;   // degrees between lines, line width (px)
uniform vec4 uBorder;     // colour, strength
uniform vec4 uWave;       // centre (object space, unit), on (1/0)
uniform vec4 uWaveP;      // angle (rad), width (rad), gain on the lights, glow of the front
uniform vec3 uWaveC;      // colour of the front
uniform vec2 uTime;       // seconds, shimmer amount
uniform float uFade;      // 0..1: how much of the lights are on at all
out vec4 o;

float h21(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
float idAt(vec2 uv){ vec3 c = texture(uIds, uv).rgb; return floor(c.r * 255.0 + 0.5) + floor(c.g * 255.0 + 0.5) * 256.0; }
vec4 cubicW(float v){
  vec4 n = vec4(1.0, 2.0, 3.0, 4.0) - v; vec4 s = n * n * n;
  float x = s.x, y = s.y - 4.0 * s.x, z = s.z - 4.0 * s.y + 6.0 * s.x;
  return vec4(x, y, z, 6.0 - x - y - z) / 6.0;
}
/** a cubic B-spline lookup at one mip level, in four bilinear taps */
float bsplineAt(sampler2D tex, vec2 uv, float lvl){
  vec2 sz = vec2(textureSize(tex, int(lvl)));
  vec2 p = uv * sz - 0.5;
  vec2 f = fract(p); p -= f;
  vec4 xc = cubicW(f.x), yc = cubicW(f.y);
  vec4 c = p.xxyy + vec2(-0.5, 1.5).xyxy;
  vec4 s = vec4(xc.xz + xc.yw, yc.xz + yc.yw);
  vec4 o = (c + vec4(xc.yw, yc.yw) / s) / sz.xxyy;
  float s0 = textureLod(tex, o.xz, lvl).r, s1 = textureLod(tex, o.yz, lvl).r;
  float s2 = textureLod(tex, o.xw, lvl).r, s3 = textureLod(tex, o.yw, lvl).r;
  float sx = s.x / (s.x + s.y), sy = s.z / (s.z + s.w);
  return mix(mix(s3, s2, sx), mix(s1, s0, sx), sy);
}
/** the lights texture as seen. From far, the sampler's own filtering. Seen close, where one of the
 *  picture's 3 km pixels covers many of the screen's, each is drawn as a point of light a few
 *  screen pixels across (as bright as the pixel, somewhere in its cell), over a faint smooth glow
 *  of the same picture; as the cells shrink toward a pixel the points become the picture again.
 *  tppOut is how many texels one screen pixel spans. */
float lightsAt(sampler2D tex, vec2 uv, out float tppOut){
  vec2 sz = vec2(textureSize(tex, 0));
  vec2 gx = dFdx(uv) * sz, gy = dFdy(uv) * sz;
  float tpp = max(max(length(gx), length(gy)), 1e-6);
  tppOut = tpp;
  if (tpp > 0.7) return texture(tex, uv).r;
  float smoothV = bsplineAt(tex, uv, 0.0);
  vec2 tc = uv * sz, cell = floor(tc);
  float acc = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 c = cell + vec2(float(i), float(j));
    vec2 ctr = c + 0.1 + 0.8 * vec2(h21(c), h21(c + 17.3));
    float v = texelFetch(tex, ivec2(int(mod(c.x, sz.x)), int(clamp(c.y, 0.0, sz.y - 1.0))), 0).r;
    vec2 d = (tc - ctr) / tpp;
    float r = 0.8 + 2.4 * sqrt(v);
    acc += v * exp(-dot(d, d) / (r * r));
  }
  return mix(acc + 0.03 * smoothV, smoothV, smoothstep(0.15, 0.6, tpp));
}
vec4 levelOf(float idx){
  if (idx < 0.5) return vec4(0.0);
  return texelFetch(uLevels, ivec2(int(mod(idx, 256.0)), int(floor(idx / 256.0))), 0);
}

void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(uCam - vW);
  float nv = max(dot(N, V), 0.0);
  float idx = idAt(vUV);
  vec4 lv = levelOf(idx);
  float sea = idx < 0.5 ? 1.0 : 0.0;
  if (sea > 0.5) {
    // a coast the country map (10 km pixels) puts in the sea takes its neighbours' level
    vec2 e = vec2(1.6 / 4096.0, 1.6 / 2048.0);
    vec4 m = max(max(levelOf(idAt(vUV + vec2(e.x, 0.0))), levelOf(idAt(vUV - vec2(e.x, 0.0)))),
                 max(levelOf(idAt(vUV + vec2(0.0, e.y))), levelOf(idAt(vUV - vec2(0.0, e.y)))));
    lv = m.r > 0.0 ? m : vec4(uSeaLevel, 0.0, 0.0, 0.0);
  }
  float level = lv.r;
  vec3 tint = mix(uLight, uNeutral, lv.g);
  vec3 hot = mix(uLightHot, uNeutral * 1.15, lv.g);

  // the lights, read back to the picture's own values and through the curve
  float tpp;
  float lin = lightsAt(uLights, vUV, tpp);
  float v = pow(max(lin, 0.0), 1.0 / 2.2);
  float s = clamp((v - uCurve.x) / (1.0 - uCurve.x), 0.0, 1.0);
  float lit = uCurve.z * pow(s, uCurve.y) + uCurve.w * pow(s, 7.0);
  // their glow in the air: the same lights from a much smaller copy
  float blur = pow(max(texture(uLights, vUV, 4.5).r, 0.0), 1.0 / 2.2);
  float spill = uSpill * smoothstep(0.03, 0.55, blur) * smoothstep(0.2, 0.8, tpp);
  // a slow shimmer, as lights seen through air do
  float sh = 1.0 + uTime.y * (vn(vUV * vec2(1400.0, 700.0) + vec2(uTime.x * 0.7, -uTime.x * 0.4)) - 0.5);

  // the wave: a ring running out over the surface from one place; lights flare as it passes
  float band = 0.0;
  if (uWave.w > 0.5) {
    float ang = acos(clamp(dot(normalize(vO), uWave.xyz), -1.0, 1.0));
    band = exp(-pow((ang - uWaveP.x) / max(uWaveP.y, 1e-5), 2.0));
  }
  float gain = uFade * level * (1.0 + uWaveP.z * band);

  // the ground at night: moonlit a little, darker away from the moon
  float md = max(dot(N, uMoon.xyz), 0.0);
  vec3 base = mix(uLand, uSea, sea) * (0.35 + 0.65 * md * uMoon.w + 0.25 * (1.0 - uMoon.w));
  vec3 c = base;
  // the moon on the sea: a broad sheen and a tighter glint
  if (sea > 0.5 && uSheen > 0.0) {
    vec3 H = normalize(uMoon.xyz + V);
    float nh = max(dot(N, H), 0.0);
    c += vec3(0.30, 0.40, 0.62) * uSheen * (0.05 * pow(nh, 6.0) + 0.5 * pow(nh, 90.0)) * uMoon.w;
  }
  // the graticule: every few degrees of longitude and latitude, fading toward the poles and limb
  if (uGrat.w > 0.0) {
    vec2 g = vec2(vUV.x * 360.0 - 180.0, 90.0 - vUV.y * 180.0) / uGratStep.x;
    vec2 fw = max(fwidth(g), vec2(1e-5));
    vec2 dd = abs(fract(g + 0.5) - 0.5) / fw;
    float lx = 1.0 - clamp(dd.x - uGratStep.y * 0.5 + 0.5, 0.0, 1.0);
    float ly = 1.0 - clamp(dd.y - uGratStep.y * 0.5 + 0.5, 0.0, 1.0);
    float lat = abs(90.0 - vUV.y * 180.0);
    lx *= 1.0 - smoothstep(60.0, 82.0, lat);
    lx *= step(fw.x, 0.45); ly *= step(fw.y, 0.45);
    float gl = max(lx, ly) * smoothstep(0.02, 0.35, nv);
    c += uGrat.rgb * uGrat.w * gl;
  }
  // country borders, where the country map changes
  if (uBorder.w > 0.0) {
    vec2 e = fwidth(vUV) * 0.8;
    float b = (idAt(vUV + vec2(e.x, 0.0)) != idx || idAt(vUV + vec2(0.0, e.y)) != idx) ? 1.0 : 0.0;
    c += uBorder.rgb * uBorder.w * b * (0.45 + 0.55 * level) * smoothstep(0.05, 0.4, nv);
  }
  // the lights
  vec3 col = mix(tint, hot, smoothstep(0.55, 1.0, s));
  c += col * lit * gain * sh + tint * spill * gain;
  // the front of the wave, a faint line of light on the ground
  c += uWaveC * band * uWaveP.w * smoothstep(0.0, 0.25, nv);
  // the air seen edge-on, brightest at the limb
  float fr = pow(1.0 - nv, 3.5);
  c += uAir.rgb * uAir.w * (fr * 0.8 + pow(1.0 - nv, 14.0) * 1.1);
  o = vec4(c, 1.0);
}`;

export type GlobeOpts = {
  /** colour of the faint lights (the chart's light), of the brightest cores, of lights with no data */
  light?: RGBA; hot?: RGBA; neutral?: RGBA;
  land?: RGBA; sea?: RGBA;
  /** the curve the Black Marble is read through: black point (0..1 picture value), gamma, gain, core boost */
  curve?: [number, number, number, number];
  spill?: number;
  seaLevel?: number;
  /** direction to the moon in world space (unit) and its strength */
  moon?: [number, number, number, number];
  sheen?: number;
  /** the air on the limb: colour and strength */
  air?: [number, number, number, number];
  grat?: [number, number, number, number];
  gratStep?: [number, number];
  border?: [number, number, number, number];
  /** a ring of light running over the surface from (lon, lat): angle and width in radians */
  wave?: { lon: number; lat: number; angle: number; width: number; gain: number; glow: number; color?: RGBA } | null;
  time?: number;
  shimmer?: number;
  /** how much of the lights are on (0..1) */
  fade?: number;
};

/** the defaults: a night lit only by its towns, the moon low behind the camera's left shoulder */
export const NIGHT_GLOBE: Required<Omit<GlobeOpts, 'wave'>> = {
  light: [1.0, 0.36, 0.06, 1], hot: [1.0, 0.74, 0.42, 1], neutral: [0.78, 0.84, 1.0, 1],
  land: [0.0045, 0.0068, 0.0125, 1], sea: [0.0009, 0.0016, 0.0042, 1],
  curve: [0.03, 1.0, 0.8, 0.9],
  spill: 0.05,
  seaLevel: 0,
  moon: [-0.45, -0.55, -0.7, 0.9],
  sheen: 0.3,
  air: [0.04, 0.11, 0.38, 0.42],
  grat: [0.05, 0.085, 0.2, 0.0],
  gratStep: [15, 0.85],
  border: [0.06, 0.08, 0.16, 0.0],
  time: 0,
  shimmer: 0.12,
  fade: 1,
};

export class Globe {
  mesh: TexMesh;
  prog: Prog;
  lights!: WebGLTexture;
  ids!: WebGLTexture;
  levelsTex: WebGLTexture;
  levels = new Uint8Array(256 * 2 * 4);
  index: { iso: string | null; name: string }[] = [];
  isoToIdx = new Map<string, number>();
  towns!: GlobeTowns;

  constructor(public d: Draw, public R: number) {
    this.mesh = sphereMesh(d, R, 256, 128);
    this.prog = compile(d.gl, VS, FS, 'globe');
    const gl = d.gl;
    this.levelsTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.levelsTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.levels);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  }

  static async create(d: Draw, R: number, cache: Map<string, any>): Promise<Globe> {
    const g = new Globe(d, R);
    const gl = d.gl;
    if (!cache.has('tex:lights')) cache.set('tex:lights', loadTexture(gl, await loadImage('/media/img/nightlights_8k.jpg'), { srgb: true }));
    if (!cache.has('tex:ids')) {
      const t = loadTexture(gl, await loadImage('/data/geo/country_ids.png'), { mip: false, srgb: false });
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      cache.set('tex:ids', t);
    }
    if (!cache.has('countryIndex')) cache.set('countryIndex', await (await fetch('/data/geo/country_index.json')).json());
    if (!cache.has('globePlaces')) cache.set('globePlaces', await (await fetch('/data/geo/globe_places.json')).json());
    g.lights = cache.get('tex:lights');
    g.ids = cache.get('tex:ids');
    g.index = cache.get('countryIndex');
    g.index.forEach((c, i) => { if (c.iso) g.isoToIdx.set(c.iso, i); });
    g.towns = new GlobeTowns(d, g, cache.get('globePlaces').places);
    return g;
  }

  /** set every country's level (0..1) from a function of its ISO code. A number sets the level of
   *  its lights and its towns; [lights, neutral, towns] sets them apart, `neutral` (0..1) being how
   *  far its lights are seen in the neutral colour instead of the chart's. */
  setLevels(fn: (iso: string | null, i: number) => number | [number, number, number]) {
    const k = (x: number) => Math.round(Math.max(0, Math.min(1, x)) * 255);
    for (let i = 0; i < 512; i++) {
      const c = this.index[i];
      const r = c ? fn(c.iso, i) : 0;
      const [v, n, tw] = Array.isArray(r) ? r : [r, 0, r];
      this.levels[i * 4] = k(v);
      this.levels[i * 4 + 1] = k(n);
      this.levels[i * 4 + 2] = k(tw);
    }
    const gl = this.d.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.levelsTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 2, gl.RGBA, gl.UNSIGNED_BYTE, this.levels);
  }

  /** the sphere. Depth is written, so lines drawn after it with depth on are hidden behind it. */
  draw(model: M4 = m4(), o: GlobeOpts = {}) {
    const q = { ...NIGHT_GLOBE, ...o };
    const d = this.d, gl = d.gl, p = this.prog;
    d.flush();
    gl.useProgram(p.p);
    gl.uniformMatrix4fv(p.u.uVP, false, d.vp);
    gl.uniformMatrix4fv(p.u.uModel, false, model);
    gl.uniform1f(p.u.uR, this.R);
    const tex = (unit: number, t: WebGLTexture, name: string) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(p.u[name], unit); };
    tex(0, this.lights, 'uLights'); tex(1, this.ids, 'uIds'); tex(2, this.levelsTex, 'uLevels');
    const v3 = (name: string, c: ArrayLike<number>) => gl.uniform3f(p.u[name], c[0], c[1], c[2]);
    v3('uLight', q.light); v3('uLightHot', q.hot); v3('uNeutral', q.neutral);
    v3('uLand', q.land); v3('uSea', q.sea);
    gl.uniform4fv(p.u.uCurve, q.curve);
    gl.uniform1f(p.u.uSpill, q.spill);
    gl.uniform1f(p.u.uSeaLevel, q.seaLevel);
    gl.uniform3fv(p.u.uCam, d.cam.pos);
    const mv = q.moon, ml = Math.hypot(mv[0], mv[1], mv[2]) || 1;
    gl.uniform4f(p.u.uMoon, mv[0] / ml, mv[1] / ml, mv[2] / ml, mv[3]);
    gl.uniform1f(p.u.uSheen, q.sheen);
    gl.uniform4fv(p.u.uAir, q.air);
    gl.uniform4fv(p.u.uGrat, q.grat);
    gl.uniform2fv(p.u.uGratStep, q.gratStep);
    gl.uniform4fv(p.u.uBorder, q.border);
    const w = o.wave;
    if (w) {
      const c = unit(w.lon, w.lat);
      gl.uniform4f(p.u.uWave, c[0], c[1], c[2], 1);
      gl.uniform4f(p.u.uWaveP, w.angle, w.width, w.gain, w.glow);
      v3('uWaveC', w.color || [0.9, 0.95, 1.0, 1]);
    } else {
      gl.uniform4f(p.u.uWave, 0, 0, -1, 0);
      gl.uniform4f(p.u.uWaveP, 0, 1, 0, 0);
      v3('uWaveC', [0, 0, 0]);
    }
    gl.uniform2f(p.u.uTime, q.time, q.shimmer);
    gl.uniform1f(p.u.uFade, q.fade);
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
    gl.disable(gl.STENCIL_TEST); gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(this.mesh.vao);
    gl.drawElements(gl.TRIANGLES, this.mesh.count, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
    gl.depthMask(false);
    d.stats.calls++;
  }

  /** the globe's centre and radius in world space under a model (uniform scale) */
  frame(model: M4): { c: V3; r: number } {
    const c: V3 = [model[12], model[13], model[14]];
    return { c, r: this.R * Math.hypot(model[0], model[1], model[2]) };
  }

  /** stars, the sphere, the air beyond its limb and its towns, in that order. Leaves depth on
   *  (so arcs drawn next are hidden behind the sphere) and the model unset. */
  drawAll(model: M4, o: { globe?: GlobeOpts; stars?: StarOpts | null; air?: AirOpts | null; towns?: TownOpts | null } = {}) {
    const d = this.d;
    d.depth(false);
    if (o.stars !== null) drawStars(d, model, o.stars || {});
    d.depth(true);
    this.draw(model, o.globe || {});
    if (o.air !== null) drawAir(d, this, model, o.air || {});
    if (o.towns !== null) this.towns.draw(model, { time: o.globe?.time ?? 0, wave: o.globe?.wave ?? null, ...(o.towns || {}) });
  }
}

/** unit vector of (lon, lat) in the globe's object space (see geo.sphere) */
export function unit(lon: number, lat: number): V3 {
  const l = (lon * Math.PI) / 180, p = (lat * Math.PI) / 180;
  return [Math.cos(p) * Math.sin(l), -Math.sin(p), -Math.cos(p) * Math.cos(l)];
}
