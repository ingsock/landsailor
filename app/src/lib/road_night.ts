// The expressway at night, the way a long exposure sees it: a sky lit from below by the city and
// the skyline against it; wet asphalt that turns every light into a long smear; sodium lamps on
// the median with their pools; streams of head and tail lights at speed; overpasses and gantries
// as silhouettes; mist that catches the lamps. Light, silhouette and air carry it, not models.
// Used by the verse-1 road (scenes/traderoad.ts) and its return at blue hour (scenes/outro1.ts).
//
// World: metres, y down (ground at y = 0). A road is a centreline; road space is (s along it,
// off to the right of travel, height above the ground).
import { Camera } from '../engine/camera';
import { DotMesh, Draw } from '../engine/draw';
import { Ctx } from '../engine/engine';
import { FS_VS, Prog, compile } from '../engine/gl';
import { RGBA, V3, clamp, hex, lerp, mulberry32 } from '../engine/math';

// ------------------------------------------------------------------------------------- the road
export class RoadPath {
  readonly pts: V3[];
  readonly tan: [number, number][];
  readonly cum: number[];
  readonly len: number;
  constructor(pts: V3[]) {
    this.pts = pts;
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]));
    this.cum = cum;
    this.len = cum[cum.length - 1];
    this.tan = pts.map((_, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const l = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1;
      return [(b[0] - a[0]) / l, (b[2] - a[2]) / l] as [number, number];
    });
  }
  private seek(s: number): [number, number] {
    const c = this.cum;
    s = clamp(s, 0, this.len);
    let lo = 0, hi = c.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= s) lo = m; else hi = m; }
    return [lo, (s - c[lo]) / ((c[hi] - c[lo]) || 1)];
  }
  /** unit direction of travel at s, on the ground (x, z) */
  T(s: number): [number, number] {
    const [i, t] = this.seek(s);
    const a = this.tan[i], b = this.tan[Math.min(this.tan.length - 1, i + 1)];
    const x = lerp(a[0], b[0], t), z = lerp(a[1], b[1], t), l = Math.hypot(x, z) || 1;
    return [x / l, z / l];
  }
  /** the point at arc length s, `off` metres to the right of travel, at world height y (negative is up) */
  P(s: number, off = 0, y = 0): V3 {
    const [i, t] = this.seek(s);
    const j = Math.min(this.pts.length - 1, i + 1);
    const a = this.pts[i], b = this.pts[j];
    const ta = this.tan[i], tb = this.tan[j];
    const tx = lerp(ta[0], tb[0], t), tz = lerp(ta[1], tb[1], t);
    return [lerp(a[0], b[0], t) + tz * off, y, lerp(a[2], b[2], t) - tx * off];
  }
  /** arc length of the point of the road nearest (x, z) */
  nearest(x: number, z: number): number {
    let best = 0, bd = Infinity;
    for (let i = 0; i < this.pts.length; i++) {
      const p = this.pts[i];
      const dd = (p[0] - x) ** 2 + (p[2] - z) ** 2;
      if (dd < bd) { bd = dd; best = i; }
    }
    // refine on the two segments beside it
    let bs = this.cum[best]; bd = Infinity;
    for (let k = -20; k <= 20; k++) {
      const s = this.cum[best] + k * 2;
      const p = this.P(s);
      const dd = (p[0] - x) ** 2 + (p[2] - z) ** 2;
      if (dd < bd) { bd = dd; bs = s; }
    }
    return clamp(bs, 0, this.len);
  }
}

/** a structure across the road: an overpass carrying a street, or a sign gantry */
export type Span = { s: number; kind: 'bridge' | 'gantry'; panel?: boolean; /** the sign's box: bottom, top, half width (m) */ box?: [number, number, number] };

export type RoadOpts = {
  /** lamps on the median from..to (arc length), one pole every `lampEvery` metres */
  lampEvery: number; lampFrom: number; lampTo: number;
  spans: Span[];
  /** traffic runs on [from, to) */
  traffic: { from: number; to: number; seed: number; density?: number };
  /** the city's street grid around the road: lamps (dots) within this box (x0, z0, x1, z1) */
  city?: [number, number, number, number];
  /** where the road's own data runs (for the chart): lights outside it can be dimmed */
  data?: [number, number];
  /** the median's barrier starts here (before it, a flat median where words can be painted across) */
  medianFrom?: number;
};

/** the look of the night: sky, air, how wet, how bright */
export type Look = {
  zen: RGBA; hor: RGBA; glow: RGBA;
  /** azimuth (radians from +z toward +x) of the brightest part of the sky glow, and its width */
  glowAz: number; glowW: number;
  /** the glow's height scale over the horizon (radians) and its broad dome's share */
  band: number; dome: number;
  ground: RGBA;
  /** the skyline: azimuth of its centre, scale, how many windows are lit, beacon brightness */
  cityAz: number; cityScale: number; windows: number; beacons: number;
  /** haze: density per metre at the ground, and its scale height */
  fog: number; fogH: number;
  wet: number;
  lamp: number;
  mist: number;
  carpet: number;
  streets: number;
  /** the sky is drawn over a backdrop that is already there (its gradient left out) */
  overlay?: boolean;
};

export const NIGHT_LOOK: Look = {
  zen: hex('#02040b'), hor: hex('#0a0e1a'), glow: hex('#ff8c42', 0.042),
  glowAz: 0.3, glowW: 0.8, band: 0.04, dome: 0.12,
  ground: hex('#040509'),
  cityAz: 0.2, cityScale: 1, windows: 1, beacons: 1,
  fog: 1 / 2600, fogH: 70,
  wet: 1, lamp: 1, mist: 1, carpet: 1, streets: 1,
};

// ------------------------------------------------------------------------------------- shaders
const LIB = `
uvec2 pcg2(uvec2 v){ v = v * 1664525u + 1013904223u; v.x += v.y * 1664525u; v.y += v.x * 1664525u; v ^= v >> 16u;
  v.x += v.y * 1664525u; v.y += v.x * 1664525u; v ^= v >> 16u; return v; }
float hsh(vec2 c){ return float(pcg2(uvec2(ivec2(floor(c)) + 1048576)).x) * 2.3283064e-10; }
float vnz(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hsh(i), hsh(i + vec2(1.0, 0.0)), f.x), mix(hsh(i + vec2(0.0, 1.0)), hsh(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm3(vec2 p){ return 0.5 * vnz(p) + 0.25 * vnz(p * 2.07 + 13.1) + 0.125 * vnz(p * 4.13 + 7.7) + 0.0625 * vnz(p * 8.3 + 3.3); }
/** box-filtered coverage of |x| < hw by a pixel of width pa */
float cov(float x, float hw, float pa){ return clamp((min(x + 0.5 * pa, hw) - max(x - 0.5 * pa, -hw)) / pa, 0.0, 1.0); }
/** box-filtered periodic stripes: |x mod P| < hw, filter width fw */
float stripeI(float u, float P, float w){ return floor(u / P) * w + min(fract(u / P) * P, w); }
float stripes(float x, float P, float hw, float fw){
  fw = max(fw, 1e-4);
  float u = x + hw;
  return clamp((stripeI(u + 0.5 * fw, P, 2.0 * hw) - stripeI(u - 0.5 * fw, P, 2.0 * hw)) / fw, 0.0, 1.0);
}
/** dashes along x: on for 'on' metres of every P, filter width fw */
float dashes(float x, float P, float on, float fw){
  fw = max(fw, 1e-4);
  return clamp((stripeI(x + 0.5 * fw, P, on) - stripeI(x - 0.5 * fw, P, on)) / fw, 0.0, 1.0);
}
float angd(float a, float b){ float d = a - b; return d - 6.2831853 * floor((d + 3.14159265) / 6.2831853); }
`;

/** the sky, the skyline and the ground's haze: shared by the sky pass and the road's reflections */
const SKY_LIB = `
uniform vec3 uZen; uniform vec3 uHor; uniform vec3 uGlow;
uniform vec4 uSkyA;    // glow azimuth, glow width, band height (rad), dome share
uniform vec4 uCity;    // skyline azimuth, scale, windows, beacons
uniform vec4 uB[24];   // towers: x (rad from the skyline's centre), half width, height, style
uniform int uNB;
uniform float uTime;
uniform vec2 uFogP;    // density at the ground (per m), scale height (m)

vec3 skyGrad(vec3 D){
  float el = asin(clamp(-D.y, -1.0, 1.0));
  float az = atan(D.x, D.z);
  float u = clamp(el / 1.1, 0.0, 1.0);
  vec3 c = mix(uHor, uZen, sqrt(u));
  float e = max(el, 0.0);
  float dw = 0.35 + 0.65 * exp(-pow(angd(az, uSkyA.x) / uSkyA.y, 2.0));
  c += uGlow * (exp(-e / uSkyA.z) + uSkyA.w * exp(-e / (uSkyA.z * 6.0))) * dw;
  return c;
}

/** optical depth of the haze from a point at height h0 to one at h1, d metres apart */
float fogTau(float d, float h0, float h1){
  float H = uFogP.y;
  float dh = h1 - h0;
  float k = abs(dh) < 0.01 ? exp(-h0 / H) : H * (exp(-h0 / H) - exp(-h1 / H)) / dh;
  return uFogP.x * d * k;
}

float tower(vec4 b, float x, float y, float pa, out float top){
  float hw = b.y, h = b.z; int st = int(b.w + 0.5);
  float c = 0.0;
  float aw = max(hw * 0.045, 0.0);
  top = h;
  if (st == 1) {
    // bundled tubes stepping back, and two antennas (Willis)
    c = max(cov(x, hw, pa) * cov(y - h * 0.31, h * 0.31, pa), cov(x - hw * 0.2, hw * 0.78, pa) * cov(y - h * 0.4, h * 0.4, pa));
    c = max(c, cov(x + hw * 0.15, hw * 0.5, pa) * cov(y - h * 0.5, h * 0.5, pa));
    c = max(c, cov(x + hw * 0.42, aw, pa) * cov(y - h * 0.66, h * 0.66, pa));
    c = max(c, cov(x - hw * 0.12, aw, pa) * cov(y - h * 0.64, h * 0.64, pa));
    top = h * 1.32;
  } else if (st == 2) {
    // tapering, with two antennas (Hancock)
    float w = hw * (1.0 - 0.36 * clamp(y / h, 0.0, 1.0));
    c = cov(x, w, pa) * cov(y - h * 0.5, h * 0.5, pa);
    c = max(c, cov(x - hw * 0.3, aw, pa) * cov(y - h * 0.65, h * 0.65, pa));
    c = max(c, cov(x + hw * 0.3, aw, pa) * cov(y - h * 0.65, h * 0.65, pa));
    top = h * 1.3;
  } else if (st == 3) {
    // setbacks and a spire
    c = max(cov(x, hw, pa) * cov(y - h * 0.3, h * 0.3, pa), cov(x, hw * 0.78, pa) * cov(y - h * 0.4, h * 0.4, pa));
    c = max(c, cov(x, hw * 0.55, pa) * cov(y - h * 0.5, h * 0.5, pa));
    float sp = clamp((h * 1.24 - y) / (h * 0.24), 0.0, 1.0);
    c = max(c, cov(x, max(hw * 0.12 * sp, 0.0), pa) * cov(y - h * 0.62, h * 0.62, pa));
    top = h * 1.24;
  } else if (st == 4) {
    // a pyramid crown
    float py = clamp((y - h * 0.82) / (h * 0.18), 0.0, 1.0);
    c = cov(x, hw * (1.0 - py), pa) * cov(y - h * 0.5, h * 0.5, pa);
    c = max(c, cov(x, aw, pa) * cov(y - h * 0.55, h * 0.55, pa));
    top = h * 1.1;
  } else if (st == 5) {
    // a rounded crown
    float r = hw * 0.8;
    float cy = h * 0.9;
    float dd = length(vec2(x, max(y - cy, 0.0) * hw / max(h * 0.1, 1e-5)));
    c = cov(x, hw, pa) * cov(y - cy * 0.5, cy * 0.5, pa);
    c = max(c, clamp((r - dd) / pa + 0.5, 0.0, 1.0) * step(cy, y) * step(y, h * 1.2));
    top = h;
  } else {
    c = cov(x, hw, pa) * cov(y - h * 0.5, h * 0.5, pa);
  }
  return c;
}

/** the city against the sky in direction (az, el): rgb (premultiplied) and coverage */
vec4 skyline(float az, float el, float pa, vec3 haze){
  if (el < -0.004 || el > 0.3 || uCity.y <= 0.0) return vec4(0.0);
  float x = angd(az, uCity.x);
  vec3 dark = vec3(0.0016, 0.0019, 0.0032);
  vec3 col = vec3(0.0); float cover = 0.0;
  // low rise: blocks of uneven height all along, taller toward the centre
  float cw = 0.0047 * uCity.y;
  float ci = floor(x / cw);
  float nearC = exp(-pow(x / (0.6 * uCity.y), 2.0));
  for (int k = -1; k <= 1; k++) {
    float cc = ci + float(k);
    float hl = uCity.y * (0.0010 + 0.0028 * hsh(vec2(cc, 1.7)) + 0.0110 * nearC * pow(hsh(vec2(cc, 9.1)), 3.0));
    float bx = x - (cc + 0.5) * cw;
    float c = cov(bx, cw * 0.5, pa) * cov(el - hl * 0.5, hl * 0.5, pa);
    if (c > cover) {
      // a few windows
      vec2 wc = vec2(floor(x / (0.0017 * uCity.y)), floor(el / (0.0021 * uCity.y)));
      float lit = step(hsh(wc + cc * 7.0), 0.10 * uCity.z) * (0.4 + 0.6 * hsh(wc + 3.1));
      vec2 wf = fract(vec2(x / (0.0017 * uCity.y), el / (0.0021 * uCity.y))) - 0.5;
      float wcov = cov(wf.x, 0.3, pa / (0.0017 * uCity.y)) * cov(wf.y, 0.22, pa / (0.0021 * uCity.y));
      vec3 wl = mix(vec3(1.0, 0.62, 0.3), vec3(0.85, 0.9, 1.0), step(0.7, hsh(wc + 5.5))) * lit * wcov * 0.55;
      col = mix(col, dark + wl, c); cover = max(cover, c);
    }
  }
  // the towers
  for (int i = 0; i < 24; i++) {
    if (i >= uNB) break;
    vec4 b = uB[i];
    b.xyz *= uCity.y;
    float dx = x - b.x;
    if (abs(dx) > b.y * 1.6 + pa * 2.0 || el > b.z * 1.4 + pa * 2.0) continue;
    float topY;
    float c = tower(b, dx, el, pa, topY);
    if (c <= 0.0) { continue; }
    // windows on a grid fixed to the tower; lit ones warm or cool, a few flickering
    vec2 cell = vec2(0.00125, 0.0016) * uCity.y;
    vec2 g = vec2((dx + b.y) / cell.x, el / cell.y);
    vec2 wc = floor(g);
    float fi = float(i);
    float dens = (0.28 + 0.3 * hsh(vec2(fi, 2.0))) * uCity.z;
    float rowOn = step(0.18, hsh(vec2(wc.y, fi * 13.0)));            // whole floors dark
    float lit = step(hsh(wc + fi * 17.0), dens) * rowOn;
    lit *= 0.35 + 0.65 * hsh(wc + fi * 3.0 + 0.5);
    float fl = hsh(vec2(wc.x + floor(uTime * 3.0), wc.y + fi));
    lit *= fl > 0.985 ? 0.2 : 1.0;
    vec2 wf = fract(g) - 0.5;
    float wcov = cov(wf.x, 0.32, pa / cell.x) * cov(wf.y, 0.26, pa / cell.y);
    float inBody = step(el, b.z * 0.98);
    vec3 wcol = mix(vec3(1.0, 0.7, 0.38), vec3(0.78, 0.86, 1.0), step(0.62, hsh(vec2(fi, 7.0)) * 0.6 + hsh(wc + 9.0) * 0.4));
    vec3 body = dark + wcol * lit * wcov * inBody * 0.8;
    // the tower's own crown light
    body += wcol * 0.25 * exp(-pow((el - b.z * 0.97) / (0.004 * uCity.y), 2.0)) * step(abs(dx), b.y) * step(0.5, hsh(vec2(fi, 4.0)));
    col = mix(col, body, c); cover = max(cover, c);
  }
  // the haze in front of the towers' feet
  float hz = exp(-max(el, 0.0) / (0.012 * uCity.y));
  col = mix(col, haze * cover, hz * 0.85);
  return vec4(col, cover);
}

/** red obstruction lights on the tallest towers, blinking */
vec3 beacons(float az, float el, float pa){
  if (uCity.w <= 0.0) return vec3(0.0);
  float x = angd(az, uCity.x);
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 24; i++) {
    if (i >= uNB) break;
    vec4 b = uB[i];
    b.xyz *= uCity.y;
    int st = int(b.w + 0.5);
    if (st != 1 && st != 2 && st != 3) continue;
    float topY = st == 1 ? b.z * 1.32 : st == 2 ? b.z * 1.3 : b.z * 1.24;
    float bx = st == 1 ? -b.y * 0.42 : st == 2 ? -b.y * 0.3 : 0.0;
    float on = step(0.0, sin(uTime * 3.1 + float(i) * 1.7));
    vec2 q = vec2(x - b.x - bx, el - topY) / (pa * 1.3);
    acc += vec3(1.0, 0.08, 0.04) * on * exp(-dot(q, q)) * 7.0;
    if (st == 1 || st == 2) {
      float bx2 = st == 1 ? b.y * 0.12 : b.y * 0.3;
      float ty2 = st == 1 ? b.z * 1.28 : b.z * 1.3;
      vec2 q2 = vec2(x - b.x - bx2, el - ty2) / (pa * 1.3);
      acc += vec3(1.0, 0.08, 0.04) * on * exp(-dot(q2, q2)) * 7.0;
    }
  }
  return acc * uCity.w;
}

/** the whole sky toward D, skyline included */
vec3 skyFull(vec3 D, float pa){
  vec3 c = skyGrad(D);
  float el = asin(clamp(-D.y, -1.0, 1.0));
  float az = atan(D.x, D.z);
  vec3 haze = skyGrad(normalize(vec3(D.x, -0.002, D.z)));
  vec4 sl = skyline(az, el, pa, haze);
  return c * (1.0 - sl.a) + sl.rgb;
}
`;

const RAY = `
uniform vec3 uCam; uniform vec3 uRt; uniform vec3 uDn; uniform vec3 uFw;
uniform vec4 uProj;   // tan x, tan y, principal point shift (ndc)
uniform vec2 uRes;
vec3 rayDir(vec2 fc){
  vec2 ndc = fc / uRes * 2.0 - 1.0;
  return normalize(uFw + uRt * ((ndc.x - uProj.z) * uProj.x) - uDn * ((ndc.y - uProj.w) * uProj.y));
}
`;

const SKY_FS = `#version 300 es
precision highp float;
in vec2 vUv;
${RAY}
${LIB}
${SKY_LIB}
uniform vec3 uGround;
uniform vec4 uStreets;   // level, -, -, -
uniform float uOverlay;
uniform float uPa;
out vec4 o;

/** the lit streets of the city grid on the ground: thin lines of lamp pools, filtered to their
 *  average far away. Streets along the road's run every 70 m (a percentage point; arterials every
 *  five), across it every 90 m (two years; arterials every decade). Lamps every 45 m along them. */
float pools(float u, float fw){
  // a pool every 45 m along a street, sigma 7 m; its average where the pixel covers several
  float d = abs(fract(u / 45.0 + 0.5) - 0.5) * 45.0;
  float p = exp(-d * d / 98.0);
  return mix(p, 0.39, smoothstep(6.0, 30.0, fw));
}
vec3 streets(vec2 xz, vec2 fw){
  float aMin = stripes(xz.x, 70.0, 1.4, fw.x), aArt = stripes(xz.x - 140.0, 350.0, 2.2, fw.x);
  float bMin = stripes(xz.y - 45.0, 90.0, 1.4, fw.y), bArt = stripes(xz.y - 135.0, 450.0, 2.2, fw.y);
  float pz = pools(xz.y, fw.y), px = pools(xz.x, fw.x);
  vec3 sod = vec3(1.0, 0.5, 0.16), led = vec3(0.75, 0.8, 0.95);
  vec3 c = sod * (aMin * pz + bMin * px) * 0.5;
  c += mix(sod, led, 0.15) * (aArt * pz + bArt * px) * 1.5;
  return c;
}

void main(){
  vec3 D = rayDir(gl_FragCoord.xy);
  float camH = -uCam.y;
  vec3 c; float a = 1.0;
  float el = asin(clamp(-D.y, -1.0, 1.0));
  // the ground point under this pixel (derivatives taken outside any branch)
  float tg = camH / max(D.y, 1e-6);
  vec2 gxz = uCam.xz + D.xz * min(tg, 1e6);
  vec2 gfw = fwidth(gxz);
  if (D.y <= 0.0) {
    // the sky
    float az = atan(D.x, D.z);
    vec3 g = skyGrad(D);
    vec3 haze = skyGrad(normalize(vec3(D.x, -0.002, D.z)));
    vec4 sl = skyline(az, el, uPa, haze);
    vec3 bc = beacons(az, el, uPa);
    if (uOverlay > 0.5) {
      // over a backdrop: only the glow, the city and its lights
      vec3 glowOnly = g - mix(uHor, uZen, sqrt(clamp(el / 1.1, 0.0, 1.0)));
      c = glowOnly * (1.0 - sl.a) + sl.rgb + bc;
      a = sl.a;
    } else {
      c = g * (1.0 - sl.a) + sl.rgb + bc;
    }
  } else {
    // the ground, out to the haze at the horizon
    float t = tg;
    vec3 G = uCam + D * t;
    vec3 gc = uGround * (0.75 + 0.5 * vnz(G.xz / 9.0)) + streets(G.xz, gfw) * uStreets.x;
    float tau = fogTau(t, camH, 0.0);
    vec3 haze = skyGrad(normalize(vec3(D.x, -0.002, D.z)));
    c = mix(haze, gc, exp(-tau));
  }
  o = vec4(c, a);
}`;

const SURF_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aP;
layout(location=1) in vec3 aN;
layout(location=2) in vec2 aR;
layout(location=3) in float aM;
uniform mat4 uVP;
out vec3 vW; out vec3 vN; out vec2 vR; out float vM;
void main(){ vW = aP; vN = aN; vR = aR; vM = aM; gl_Position = uVP * vec4(aP, 1.0); }`;

const SURF_FS = `#version 300 es
precision highp float;
in vec3 vW; in vec3 vN; in vec2 vR; in float vM;
uniform vec3 uCamW;
uniform vec2 uResS;
${LIB}
${SKY_LIB}
uniform vec4 uLamp;      // spacing, height, arm, intensity
uniform vec3 uLampC;
uniform vec4 uLampS;     // lamps from, to; data from, to
uniform float uLampDim;  // lamps outside the data are dimmed by this
uniform vec4 uGap[8];    // s from, to, height of the deck's underside, 0
uniform int uNGap;
uniform sampler2D uRefl;
uniform vec4 uWet;       // wetness, reflection gain, sky reflection gain, puddles
uniform float uPa;
out vec4 o;

float lampAt(float sk){
  if (sk < uLampS.x - 0.5 || sk > uLampS.y + 0.5) return 0.0;
  for (int g = 0; g < 8; g++) {
    if (g >= uNGap) break;
    if (sk > uGap[g].x - 14.0 && sk < uGap[g].y + 14.0) return 0.0;
  }
  return (sk < uLampS.z || sk > uLampS.w) ? uLampDim : 1.0;
}

/** light from the median's lamps falling on a surface at road coordinates r, height h, normal n (road space: along, up, across) */
vec3 lampIrr(vec2 r, float h, vec3 n){
  float sp = uLamp.x;
  float k0 = floor(r.x / sp + 0.5);
  float E = 0.0;
  for (int j = -2; j <= 2; j++) {
    float sk = (k0 + float(j)) * sp;
    float on = lampAt(sk);
    if (on <= 0.0) continue;
    for (int a = 0; a < 2; a++) {
      float ao = a == 0 ? -uLamp.z : uLamp.z;
      vec3 Lv = vec3(sk - r.x, uLamp.y - h, ao - r.y);
      float d2 = dot(Lv, Lv);
      vec3 Ln = Lv * inversesqrt(d2);
      float ndl = max(dot(n, Ln), 0.0);
      // a cobra head: throws its light down and along the road, cut off toward the horizon
      float spread = pow(max(Ln.y, 0.0), 3.0) * (1.0 + 1.4 * abs(Ln.x)) * smoothstep(0.1, 0.3, Ln.y);
      E += on * ndl * spread / (d2 + 4.0);
    }
  }
  // under a deck the lamps are hidden
  for (int g = 0; g < 8; g++) {
    if (g >= uNGap) break;
    vec4 gp = uGap[g];
    if (h < gp.z) {
      float inS = smoothstep(gp.x - 3.0, gp.x + 2.0, r.x) * (1.0 - smoothstep(gp.y - 2.0, gp.y + 3.0, r.x));
      E *= 1.0 - 0.85 * inS;
    }
  }
  return uLampC * E * uLamp.w;
}

/** the mirrored lights, smeared down the frame the way wet asphalt smears them: many taps up the
 *  frame (toward the horizon), each a little blurrier, so a point of light becomes a long streak */
vec3 reflLights(vec2 uv, float rough){
  vec3 acc = vec3(0.0);
  float ws = 0.0;
  float len = 0.55 + 0.9 * rough;
  for (int k = 0; k < 16; k++) {
    float fk = float(k);
    float dy = (fk * fk * 0.8 + fk * 2.2) * len;      // px of the frame, upward = toward the horizon
    float lod = min(log2(1.0 + dy * 0.025), 2.6) + rough * 0.7;
    float w = exp(-fk * 0.17);
    acc += textureLod(uRefl, uv + vec2(0.0, dy) / uResS, lod).rgb * w;
    ws += w;
  }
  // and a short way down
  for (int k = 1; k < 4; k++) {
    float fk = float(k);
    float dy = fk * fk * 2.0;
    float w = exp(-fk * 0.8) * 0.7;
    acc += textureLod(uRefl, uv - vec2(0.0, dy) / uResS, log2(1.0 + dy * 0.05)).rgb * w;
    ws += w;
  }
  return acc / ws * 3.0;
}

void main(){
  vec3 W = vW;
  vec2 r = vR;
  float h = -W.y;
  int m = int(vM + 0.5);
  vec3 n = normalize(vN);
  vec3 toCam = uCamW - W;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  vec2 fr = vec2(fwidth(r.x), fwidth(r.y));

  vec3 alb; float wet = 0.0; float gloss = 0.0;
  float paint = 0.0; vec3 paintC = vec3(0.0);
  if (m == 0) {
    // asphalt: aggregate, patches, the lanes' wheel paths polished darker
    float grain = vnz(r * vec2(2.3, 2.9)) * (1.0 - smoothstep(0.08, 0.5, max(fr.x, fr.y)));
    float ptch = fbm3(r * vec2(0.035, 0.12));
    float lanePos = abs(r.y);
    float wheel = 0.0;
    for (int l = 0; l < 3; l++) {
      float c = 3.35 + float(l) * 3.7;
      wheel = max(wheel, cov(lanePos - c + 0.9, 0.35, max(fr.y, 0.02)) + cov(lanePos - c - 0.9, 0.35, max(fr.y, 0.02)));
    }
    alb = vec3(0.04, 0.039, 0.037) * (0.75 + 0.5 * ptch + 0.25 * grain) * (1.0 - 0.25 * wheel);
    float puddle = smoothstep(0.5, 0.62, fbm3(r * vec2(0.045, 0.16) + 31.0));
    float dry = smoothstep(0.55, 0.7, fbm3(r * vec2(0.02, 0.07) + 7.0));
    wet = uWet.x * clamp(0.45 + 0.3 * wheel + uWet.w * puddle - 0.3 * dry, 0.0, 1.0);
    gloss = clamp(0.3 + 0.7 * puddle + 0.2 * wheel, 0.0, 1.0);
    // paint: a yellow line along the median, a white one along the shoulder, dashed lines between
    float fy = max(fr.y, 1e-3), fx = max(fr.x, 1e-3);
    float yel = cov(lanePos - 1.5, 0.08, fy);
    float edge = cov(lanePos - 12.6, 0.08, fy);
    float dash = 0.0;
    for (int l = 0; l < 2; l++) {
      float c = 5.2 + float(l) * 3.7;
      dash = max(dash, cov(lanePos - c, 0.065, fy) * dashes(r.x + float(l) * 4.0, 12.2, 3.05, fx));
    }
    paint = max(max(yel, edge), dash);
    paintC = mix(vec3(0.3, 0.29, 0.27), vec3(0.34, 0.22, 0.04), yel / max(paint, 1e-4));
    // shoulders rougher, holding less water
    float sh = smoothstep(12.75, 12.9, lanePos) + (1.0 - smoothstep(1.35, 1.5, lanePos));
    wet *= 1.0 - 0.4 * sh;
  } else if (m == 1) {
    // concrete barriers
    alb = vec3(0.075, 0.072, 0.068) * (0.7 + 0.45 * vnz(vec2(r.x * 0.35, h * 3.0)) + 0.2 * vnz(r * vec2(2.5, 0.5)));
    wet = 0.0;
  } else if (m == 2) {
    // the concrete of bridges, weathered
    alb = vec3(0.07, 0.068, 0.066) * (0.8 + 0.4 * fbm3(vec2(r.y * 0.3, h * 0.8) + r.x * 0.1));
  } else if (m == 3) {
    alb = vec3(0.05, 0.05, 0.055);
  } else {
    alb = vec3(0.012);
  }

  vec3 E = lampIrr(r, h, n);
  // a bridge's deck is lit by its own street's lamps
  if (m == 2 && n.y > 0.5) E += vec3(1.0, 0.5, 0.16) * 0.16 * (0.5 + 0.5 * exp(-pow((fract(r.y / 26.0 + 0.5) - 0.5) * 26.0, 2.0) / 60.0));
  // what the sky and the city give everything
  vec3 amb = (uZen * 0.6 + uHor * 0.5 + uGlow * 0.8) * (0.5 + 0.5 * n.y) + uLampC * 0.01;
  vec3 base = mix(alb, paintC, paint);
  vec3 col = base * (E + amb) * (1.0 - 0.7 * wet * (1.0 - paint));

  if (m == 0) {
    // wet asphalt: a mirror for the lights and the sky, by Fresnel
    float ct = clamp(dot(V, vec3(0.0, -1.0, 0.0)), 0.0, 1.0);
    float F = 0.03 + 0.97 * pow(1.0 - ct, 5.0);
    float rough = 1.0 - gloss;
    vec2 uv = gl_FragCoord.xy / uResS;
    vec3 L = reflLights(uv, rough);
    vec3 Rd = vec3(-V.x, V.y, -V.z);
    // the sky in the road, blurred upward by the roughness
    vec3 sk = vec3(0.0);
    for (int k = 0; k < 4; k++) {
      float e = float(k) * (0.012 + 0.03 * rough);
      sk += skyFull(normalize(Rd + vec3(0.0, -e, 0.0)), uPa * (1.0 + 6.0 * rough));
    }
    sk *= 0.25;
    float wk = wet * (1.0 - 0.8 * paint);
    col += (L * uWet.y + sk * uWet.z) * F * wk;
  }

  // the haze between the camera and the surface
  float tau = fogTau(dist, -uCamW.y, h);
  vec3 haze = skyGrad(normalize(vec3(-V.x, 0.002, -V.z)));
  col = mix(haze, col, exp(-tau));
  o = vec4(col, 1.0);
}`;

const VOL_FS = `#version 300 es
precision highp float;
in vec2 vUv;
${RAY}
${LIB}
#define MAXL 64
uniform vec4 uL[MAXL];
uniform vec3 uLC[MAXL];
uniform int uNL;
uniform vec4 uMist;   // scatter, extinction length, wisps, scale
uniform vec4 uWind;   // wind x, z (m/s), time, -
uniform vec3 uMistC;
out vec4 o;

float sheet(vec3 D, float camH, float hs, out float t){
  // where the ray crosses the height hs; noise there, drifting with the wind
  float dy = -D.y;                 // rate of climb
  t = abs(dy) > 1e-4 ? (hs - camH) / dy : -1.0;
  if (t <= 0.0 || t > 3000.0) return -1.0;
  vec2 p = (uCam.xz + D.xz * t - uWind.xy * uWind.z) / uMist.w;
  return fbm3(p) ;
}

void main(){
  vec3 D = rayDir(gl_FragCoord.xy);
  float camH = -uCam.y;
  float T = D.y > 1e-4 ? camH / D.y : 4000.0;
  T = min(T, 4000.0);
  // drifting mist: noise on sheets of air at a few heights, the nearest crossing counts most
  float n = 0.0, wsum = 0.0;
  float t1; float n1 = sheet(D, camH, 2.0, t1);
  if (n1 >= 0.0 && t1 < T) { float w = 1.0 / (1.0 + t1 / 120.0); n += n1 * w; wsum += w; }
  float t2; float n2 = sheet(D, camH, 9.0, t2);
  if (n2 >= 0.0 && t2 < T) { float w = 1.0 / (1.0 + t2 / 160.0); n += n2 * w; wsum += w; }
  float t3; float n3 = sheet(D, camH, 26.0, t3);
  if (n3 >= 0.0 && t3 < T) { float w = 0.7 / (1.0 + t3 / 250.0); n += n3 * w; wsum += w; }
  float dens = wsum > 0.0 ? n / wsum : 0.45;
  dens = 0.25 + 1.5 * smoothstep(0.3, 0.75, dens);

  vec3 acc = vec3(0.0);
  for (int i = 0; i < MAXL; i++) {
    if (i >= uNL) break;
    vec3 w = uL[i].xyz - uCam;
    float b = dot(w, D);
    float hh = max(dot(w, w) - b * b, 0.0);
    float hr = sqrt(hh + 0.12);
    float I = (atan((T - b) / hr) + atan(b / hr)) / hr;
    float dd = dot(w, w);
    acc += uLC[i] * (uL[i].w * I * exp(-max(b, 0.0) / uMist.y) * dd / (dd + 600.0));
  }
  vec3 c = acc * uMist.x * dens;
  // the wisps themselves, faintly lit by the city
  c += uMistC * uMist.z * max(dens - 0.5, 0.0) * (1.0 - exp(-T / 200.0));
  o = vec4(c, 0.0);
}`;

// ------------------------------------------------------------------------------------- skyline
/** a stylised Chicago from the north-west: [x (deg from the skyline's centre), half width (deg), height (deg), style] */
const TOWERS: [number, number, number, number][] = [
  [-0.4, 0.42, 7.2, 1],    // Willis
  [-1.6, 0.36, 4.0, 0],
  [-2.5, 0.3, 4.8, 4],     // a pyramid crown
  [-3.3, 0.45, 3.1, 0],
  [-4.4, 0.3, 3.6, 5],     // a rounded crown
  [-5.6, 0.5, 2.4, 0],
  [-7.0, 0.35, 2.0, 0],
  [0.9, 0.34, 4.6, 0],
  [1.7, 0.3, 5.3, 5],      // 311 S Wacker
  [2.6, 0.3, 6.6, 3],      // the spire by the river
  [3.5, 0.5, 5.6, 0],      // Aon, a slab
  [4.4, 0.32, 6.1, 4],     // Two Prudential
  [5.3, 0.28, 3.4, 0],
  [6.3, 0.4, 5.5, 2],      // Hancock
  [7.2, 0.32, 3.0, 0],
  [8.4, 0.38, 2.6, 0],
  [-8.6, 0.4, 1.7, 0],
  [10.0, 0.35, 1.8, 0],
];

/** the height of a bridged street's deck at `off` from the road's centre: level over the road, then down on earth */
function bridgeH(off: number): number {
  const a = Math.abs(off);
  if (a <= 24) return 7.1;
  const k = clamp((a - 24) / 60);
  return 7.1 * (1 - k * k * (3 - 2 * k));
}

// ------------------------------------------------------------------------------------- traffic
type Car = { dir: 1 | -1; lane: number; s0: number; v: number; truck: boolean; head: RGBA; tail: RGBA; br: number; ph: number };

const SHARED = new WeakMap<WebGL2RenderingContext, { sky: Prog; surf: Prog; vol: Prog; fsVao: WebGLVertexArrayObject }>();
const NOOP_FS = `#version 300 es
precision highp float;
out vec4 o;
void main(){ o = vec4(0.0); }`;

export class NightRoad {
  d: Draw;
  gl: WebGL2RenderingContext;
  sky: Prog; surf: Prog; vol: Prog; fsVao: WebGLVertexArrayObject;
  vao: WebGLVertexArrayObject; nRoad = 0; nAll = 0;
  refl: { fb: WebGLFramebuffer; tex: WebGLTexture; w: number; h: number };
  carpet: DotMesh | null = null;
  cars: Car[] = [];
  poles: number[] = [];
  towers: Float32Array;
  broken = false;

  // per frame
  cam!: Camera; t = 0; look: Look = NIGHT_LOOK;
  camS = 0; camH = 0; focal = 1000; fwd: V3 = [0, 0, 1];
  tau = 0;
  dimOut = 0;
  far = 0;
  vl: number[] = []; vc: number[] = [];

  constructor(public ctx: Ctx, public road: RoadPath, public o: RoadOpts) {
    const d = ctx.d, gl = ctx.gl;
    this.d = d; this.gl = gl;
    let sh = SHARED.get(gl);
    if (!sh) {
      // a shader that fails must not stop the rest of the film from loading: log it, draw nothing
      const safe = (vs: string, fs: string, name: string): Prog => {
        try { return compile(gl, vs, fs, name); } catch (e) { console.error(String(e).slice(0, 600)); this.broken = true; return compile(gl, FS_VS, NOOP_FS, name + '-noop'); }
      };
      sh = {
        sky: safe(FS_VS, SKY_FS, 'nightSky'),
        surf: safe(SURF_VS, SURF_FS, 'nightSurface'),
        vol: safe(FS_VS, VOL_FS, 'nightMist'),
        fsVao: gl.createVertexArray()!,
      };
      SHARED.set(gl, sh);
    }
    this.sky = sh.sky; this.surf = sh.surf; this.vol = sh.vol; this.fsVao = sh.fsVao;
    this.towers = new Float32Array(24 * 4);
    TOWERS.forEach((t, i) => { const k = Math.PI / 180; this.towers.set([t[0] * k, t[1] * k, t[2] * k, t[3]], i * 4); });
    // the reflection: the lights drawn mirrored in the ground, at half size, with mipmaps for the smear
    const w = Math.max(2, Math.round(d.res[0] / 2)), h = Math.max(2, Math.round(d.res[1] / 2));
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texStorage2D(gl.TEXTURE_2D, Math.floor(Math.log2(Math.max(w, h))) + 1, gl.RGBA16F, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer()!;
    const prev = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, prev);
    this.refl = { fb, tex, w, h };
    this.vao = this.build();
    this.buildPoles();
    this.buildTraffic();
    if (o.city) this.buildCity(o.city);
  }

  // ----------------------------------------------------------------------------- static geometry
  private build(): WebGLVertexArrayObject {
    const R = this.road;
    const v: number[] = [];
    const push = (p: V3, n: V3, s: number, off: number, m: number) => v.push(p[0], p[1], p[2], n[0], n[1], n[2], s, off, m);
    // a quad in road space: corners (s, off, height) in order, one normal (along, up, across)
    const quad = (c: [number, number, number][], n: V3, m: number) => {
      const P = c.map(([s, off, h]) => R.P(s, off, -h));
      const idx = [0, 1, 2, 0, 2, 3];
      for (const i of idx) push(P[i], n, c[i][0], c[i][1], m);
    };
    const step = 4;
    const s1 = R.len;
    // the carriageways and shoulders, one strip
    for (let s = 0; s < s1; s += step) {
      const e = Math.min(s1, s + step);
      quad([[s, -15.4, 0], [e, -15.4, 0], [e, 15.4, 0], [s, 15.4, 0]], [0, 1, 0], 0);
    }
    this.nRoad = v.length / 9;
    // barriers: the median's, and one along each shoulder
    for (let s = 0; s < s1; s += step) {
      const e = Math.min(s1, s + step);
      const median = s >= (this.o.medianFrom ?? 0);
      for (const sd of [-1, 1]) {
        // median face toward this carriageway
        if (median) quad([[s, sd * 0.3, 0], [e, sd * 0.3, 0], [e, sd * 0.3, 1.05], [s, sd * 0.3, 1.05]], [0, 0, sd], 1);
        // outer barrier, its face toward the road and its top
        quad([[s, sd * 15.2, 0], [e, sd * 15.2, 0], [e, sd * 15.2, 1.05], [s, sd * 15.2, 1.05]], [0, 0, -sd], 1);
        quad([[s, sd * 15.2, 1.05], [e, sd * 15.2, 1.05], [e, sd * 15.6, 1.05], [s, sd * 15.6, 1.05]], [0, 1, 0], 1);
      }
      if (median) quad([[s, -0.3, 1.05], [e, -0.3, 1.05], [e, 0.3, 1.05], [s, 0.3, 1.05]], [0, 1, 0], 1);
    }
    // a box in road space
    const box = (sA: number, sB: number, oA: number, oB: number, hA: number, hB: number, m: number) => {
      quad([[sA, oA, hA], [sA, oB, hA], [sA, oB, hB], [sA, oA, hB]], [-1, 0, 0], m);
      quad([[sB, oB, hA], [sB, oA, hA], [sB, oA, hB], [sB, oB, hB]], [1, 0, 0], m);
      quad([[sA, oA, hB], [sA, oB, hB], [sB, oB, hB], [sB, oA, hB]], [0, 1, 0], m);
      quad([[sA, oB, hA], [sA, oA, hA], [sB, oA, hA], [sB, oB, hA]], [0, -1, 0], m);
      quad([[sB, oA, hA], [sA, oA, hA], [sA, oA, hB], [sB, oA, hB]], [0, 0, -1], m);
      quad([[sA, oB, hA], [sB, oB, hA], [sB, oB, hB], [sA, oB, hB]], [0, 0, 1], m);
    };
    for (const sp of this.o.spans) {
      if (sp.kind === 'bridge') {
        const a = sp.s - 7, b = sp.s + 7;
        // the deck over the road, its parapets and piers; beyond, the street comes down on earth
        for (let o = -24; o < 24; o += 8) box(a, b, o, o + 8, 5.6, 7.1, 2);
        for (let o = -24; o < 24; o += 8) { box(a, a + 0.5, o, o + 8, 7.1, 8.1, 2); box(b - 0.5, b, o, o + 8, 7.1, 8.1, 2); }
        for (const o of [-17.2, 0, 17.2]) box(sp.s - 3, sp.s + 3, o - 0.6, o + 0.6, 0, 5.6, 2);
        for (const sd of [-1, 1]) {
          for (let k = 0; k < 10; k++) {
            const o0 = 24 + k * 6, o1 = o0 + 6;
            const h0 = bridgeH(o0), h1 = bridgeH(o1);
            const A = sd > 0 ? o0 : -o1, B = sd > 0 ? o1 : -o0;
            const hA = sd > 0 ? h0 : h1, hB = sd > 0 ? h1 : h0;
            // the sloping top, and the embankment's two faces toward and away from the camera
            quad([[a - 3, A, hA], [a - 3, B, hB], [b + 3, B, hB], [b + 3, A, hA]], [0, 1, 0], 2);
            quad([[a - 3, A, 0], [a - 3, B, 0], [a - 3, B, hB], [a - 3, A, hA]], [-1, 0, 0], 2);
            quad([[b + 3, B, 0], [b + 3, A, 0], [b + 3, A, hA], [b + 3, B, hB]], [1, 0, 0], 2);
          }
          // the abutment wall facing the road
          quad([[a - 3, sd * 24, 0], [b + 3, sd * 24, 0], [b + 3, sd * 24, 7.1], [a - 3, sd * 24, 7.1]], [0, 0, -sd], 2);
        }
      } else {
        // a sign gantry: two posts, a truss in two chords, and the dark box of the sign
        const [pb, pt, ph] = sp.box ?? [6.9, 10.15, 9.6];
        const top = Math.max(9.9, pt - 0.25);
        for (const o of [-16.6, 16.6]) box(sp.s - 0.35, sp.s + 0.35, o - 0.35, o + 0.35, 0, top, 3);
        box(sp.s - 0.25, sp.s + 0.25, -16.6, 16.6, top - 0.4, top, 3);
        box(sp.s - 0.25, sp.s + 0.25, -16.6, 16.6, pb + 0.1, pb + 0.35, 3);
        if (sp.panel) box(sp.s - 0.7, sp.s - 0.25, -ph, ph, pb, pt, 4);
        else box(sp.s - 0.5, sp.s - 0.25, 2.5, 12.5, 7.2, 10.4, 3);
      }
    }
    this.nAll = v.length / 9;
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW);
    const S = 9 * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, S, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, S, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, S, 24);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, S, 32);
    gl.bindVertexArray(null);
    return vao;
  }

  /** where a pole stands: none under or beside a bridge or a gantry */
  lampOn(s: number): boolean {
    if (s < this.o.lampFrom - 0.5 || s > this.o.lampTo + 0.5) return false;
    for (const sp of this.o.spans) {
      const g = sp.kind === 'bridge' ? 7 : 1;
      if (s > sp.s - g - 14 - (sp.panel ? 56 : 0) && s < sp.s + g + 14) return false;
    }
    return true;
  }
  private buildPoles() {
    const e = this.o.lampEvery;
    for (let k = Math.ceil(this.o.lampFrom / e); k * e <= this.o.lampTo; k++) if (this.lampOn(k * e)) this.poles.push(k * e);
  }

  private buildTraffic() {
    const rnd = mulberry32(this.o.traffic.seed);
    const { from, to } = this.o.traffic;
    const span = to - from;
    const dens = this.o.traffic.density ?? 1;
    for (const dir of [1, -1] as const) {
      for (let lane = 0; lane < 3; lane++) {
        const v = (dir > 0 ? 29 : 31) + lane * 2.6;
        let s = rnd() * 30;
        while (s < span) {
          const truck = rnd() < (lane === 2 ? 0.22 : 0.08);
          const led = rnd();
          const head: RGBA = led < 0.45 ? hex('#e6eeff', 1) : led < 0.85 ? hex('#fff0d2', 1) : hex('#d8e4ff', 1.1);
          const br = rnd() < 0.12 ? 1.8 : 1;
          this.cars.push({ dir, lane, s0: s, v, truck, head, tail: hex('#ff2a1e', 1), br, ph: rnd() * 10 });
          s += (16 + rnd() * rnd() * 90) / dens + (truck ? 10 : 0);
        }
      }
    }
  }

  private buildCity(box: [number, number, number, number]) {
    const [x0, z0, x1, z1] = box;
    const rnd = mulberry32(19);
    const out: number[] = [];
    const R = this.road;
    // the road's x at each z, to keep the expressway's corridor clear
    const zs: number[] = [], xs: number[] = [];
    for (let i = 0; i < R.pts.length; i++) { zs.push(R.pts[i][2]); xs.push(R.pts[i][0]); }
    const roadX = (z: number) => {
      if (z <= zs[0]) return xs[0];
      if (z >= zs[zs.length - 1]) return xs[xs.length - 1];
      let lo = 0, hi = zs.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (zs[m] <= z) lo = m; else hi = m; }
      return lerp(xs[lo], xs[hi], (z - zs[lo]) / ((zs[hi] - zs[lo]) || 1));
    };
    const add = (x: number, z: number, art: boolean) => {
      if (Math.abs(x - roadX(z)) < 34) return;
      const white = rnd() < 0.12;
      const c = white ? hex('#dfe8ff', 1) : hex('#ff9f3a', 1);
      const I = (art ? 1.7 : 0.9) * (0.6 + 0.6 * rnd());
      out.push(x, -(art ? 9.5 : 6.5 + 2 * rnd()), z, c[0] * I, c[1] * I, c[2] * I, 1, art ? 1.6 : 1.1, 0.7, 0, rnd());
    };
    // streets along the run every 70 m (arterials every 350 m), across every 90 m (arterials every
    // 450 m); a lamp every 45 m, where the ground shader puts their pools
    for (let x = Math.ceil(x0 / 70) * 70; x <= x1; x += 70) {
      const art = ((x - 140) % 350 + 350) % 350 === 0;
      for (let z = Math.ceil(z0 / 45) * 45; z <= z1; z += 45) if (rnd() < (art ? 0.95 : 0.8)) add(x + (art ? 3 : 2) * (rnd() < 0.5 ? -1 : 1), z, art);
    }
    for (let z = Math.ceil((z0 - 45) / 90) * 90 + 45; z <= z1; z += 90) {
      const art = ((z - 135) % 450 + 450) % 450 === 0;
      for (let x = Math.ceil(x0 / 45) * 45; x <= x1; x += 45) if (rnd() < (art ? 0.95 : 0.8)) add(x, z + (art ? 3 : 2) * (rnd() < 0.5 ? -1 : 1), art);
    }
    // windows and yards between the streets, dim and warm; a few high up
    const n = Math.round(((x1 - x0) * (z1 - z0)) / 1600);
    for (let i = 0; i < n; i++) {
      const x = lerp(x0, x1, rnd()), z = lerp(z0, z1, rnd());
      if (Math.abs(x - roadX(z)) < 40) continue;
      const c = rnd() < 0.7 ? hex('#ffc27a', 0.12 + 0.3 * rnd() * rnd()) : hex('#cfe0ff', 0.1 + 0.2 * rnd() * rnd());
      const tall = rnd();
      out.push(x, -3 - (tall > 0.92 ? 40 * rnd() : 8 * rnd()), z, c[0], c[1], c[2], 1, 0.7, 0.6, 0, rnd());
    }
    // the lamps of the streets that bridge the road
    for (const sp of this.o.spans) {
      if (sp.kind !== 'bridge') continue;
      for (let o = -78; o <= 78; o += 26) {
        for (const e of [-7.6, 7.6]) {
          const p = R.P(sp.s + e, o, -(bridgeH(o) + 7.5));
          const c = hex('#ffa64d', 1.6);
          out.push(p[0], p[1], p[2], c[0], c[1], c[2], 1, 1.0, 0.7, 0, rnd());
        }
      }
    }
    this.carpet = this.d.makeDots(new Float32Array(out));
  }

  // ----------------------------------------------------------------------------- per frame
  /** set up a frame: the camera, the time, the look; `tau` is the traffic's own clock */
  begin(cam: Camera, t: number, look: Look, o: { tau?: number; dimOut?: number; far?: number } = {}) {
    this.cam = cam; this.t = t; this.look = look;
    this.tau = o.tau ?? t;
    this.dimOut = o.dimOut ?? 0;
    this.far = o.far ?? 0;
    this.camH = -cam.pos[1];
    this.camS = this.road.nearest(cam.pos[0], cam.pos[2]);
    this.focal = this.d.focal();
    this.fwd = cam.basis().f;
    this.vl = []; this.vc = [];
  }

  /** a light that the mist catches (the scene's own: the sign, a plane) */
  mistLight(p: V3, c: RGBA, I: number) {
    if (this.vl.length >= 64 * 4) return;
    this.vl.push(p[0], p[1], p[2], I); this.vc.push(c[0], c[1], c[2]);
  }

  /** screen radius in px of a light of world radius r at p, at least minPx; and the energy kept */
  px(p: V3, r: number, minPx: number): [number, number] {
    const c = this.cam.pos, f = this.fwd;
    const z = (p[0] - c[0]) * f[0] + (p[1] - c[1]) * f[1] + (p[2] - c[2]) * f[2];
    if (z < this.cam.near + 0.05) return [0, 0];
    const rp = (r * this.focal) / z;
    return rp >= minPx ? [rp, 1] : [minPx, (rp / minPx) * (rp / minPx)];
  }
  /** depth of p in front of the camera */
  depth(p: V3): number {
    const c = this.cam.pos, f = this.fwd;
    return (p[0] - c[0]) * f[0] + (p[1] - c[1]) * f[1] + (p[2] - c[2]) * f[2];
  }

  /** brightness of the road's lights at arc length s: outside the data they may be dimmed (the chart) */
  dim(s: number): number {
    const dt = this.o.data;
    if (!dt || this.dimOut <= 0) return 1;
    return s < dt[0] || s > dt[1] ? 1 - this.dimOut : 1;
  }

  // ----------------------------------------------------------------------------- the passes
  private camUniforms(p: Prog) {
    const gl = this.gl, cam = this.cam;
    const { r, d, f } = cam.basis();
    const ty = Math.tan(cam.fov / 2), tx = ty * (this.d.res[0] / this.d.res[1]);
    gl.uniform3fv(p.u.uCam, cam.pos);
    gl.uniform3fv(p.u.uRt, r); gl.uniform3fv(p.u.uDn, d); gl.uniform3fv(p.u.uFw, f);
    gl.uniform4f(p.u.uProj, tx, ty, cam.shift[0] / 960, -cam.shift[1] / 540);
    gl.uniform2f(p.u.uRes, this.d.res[0], this.d.res[1]);
  }
  private skyUniforms(p: Prog) {
    const gl = this.gl, L = this.look;
    gl.uniform3f(p.u.uZen, L.zen[0], L.zen[1], L.zen[2]);
    gl.uniform3f(p.u.uHor, L.hor[0], L.hor[1], L.hor[2]);
    gl.uniform3f(p.u.uGlow, L.glow[0], L.glow[1], L.glow[2]);
    gl.uniform4f(p.u.uSkyA, L.glowAz, L.glowW, L.band, L.dome);
    gl.uniform4f(p.u.uCity, L.cityAz, L.cityScale, L.windows, L.beacons);
    gl.uniform4fv(p.u.uB, this.towers);
    gl.uniform1i(p.u.uNB, TOWERS.length);
    gl.uniform1f(p.u.uTime, this.t);
    gl.uniform2f(p.u.uFogP, L.fog, L.fogH);
    gl.uniform1f(p.u.uPa, this.cam.fov / 1080);
  }

  /** the sky, the skyline and the ground to the horizon: the first thing drawn */
  drawSky() {
    const gl = this.gl, p = this.sky, L = this.look;
    this.d.flush();
    gl.useProgram(p.p);
    this.camUniforms(p);
    this.skyUniforms(p);
    gl.uniform3f(p.u.uGround, L.ground[0], L.ground[1], L.ground[2]);
    gl.uniform4f(p.u.uStreets, L.streets * 0.065, 0, 0, 0);
    gl.uniform1f(p.u.uOverlay, L.overlay ? 1 : 0);
    if (L.overlay) { gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); } else gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.STENCIL_TEST); gl.depthMask(false);
    gl.bindVertexArray(this.fsVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    this.d.stats.calls++;
  }

  /** the lights mirrored in the ground, into the reflection texture; `extra` draws the scene's own */
  drawReflections(extra?: () => void) {
    const gl = this.gl, d = this.d;
    d.flush();
    const prevFb = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    const vp = gl.getParameter(gl.VIEWPORT) as Int32Array;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.refl.fb);
    gl.viewport(0, 0, this.refl.w, this.refl.h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
    this.mirror = true;
    this.lampHeads();
    this.traffic();
    if (extra) extra();
    d.flush();
    this.mirror = false;
    gl.bindFramebuffer(gl.FRAMEBUFFER, prevFb);
    gl.viewport(vp[0], vp[1], vp[2], vp[3]);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.refl.tex);
    gl.generateMipmap(gl.TEXTURE_2D);
  }

  mirror = false;
  /** a point as drawn in this pass: mirrored in the ground for the reflections */
  M(p: V3): V3 { return this.mirror ? [p[0], -p[1], p[2]] : p; }

  private surfUniforms() {
    const gl = this.gl, p = this.surf, L = this.look;
    gl.useProgram(p.p);
    gl.uniformMatrix4fv(p.u.uVP, false, this.d.vp);
    gl.uniform3fv(p.u.uCamW, this.cam.pos);
    gl.uniform2f(p.u.uResS, this.d.res[0], this.d.res[1]);
    this.skyUniforms(p);
    const lc = hex('#ff9f3a', 1);
    gl.uniform4f(p.u.uLamp, this.o.lampEvery, 11.6, 2.7, 90 * L.lamp);
    gl.uniform3f(p.u.uLampC, lc[0], lc[1], lc[2]);
    const dt = this.o.data || [this.o.lampFrom, this.o.lampTo];
    gl.uniform4f(p.u.uLampS, this.o.lampFrom, this.o.lampTo, dt[0], dt[1]);
    gl.uniform1f(p.u.uLampDim, 1 - this.dimOut);
    const gaps = new Float32Array(32);
    let ng = 0;
    const near = this.o.spans.slice().sort((a, b) => Math.abs(a.s - this.camS) - Math.abs(b.s - this.camS));
    for (const sp of near) {
      if (ng >= 8) break;
      gaps.set(sp.kind === 'bridge' ? [sp.s - 7, sp.s + 7, 5.6, 0] : [sp.s - 1 - (sp.panel ? 56 : 0), sp.s + 1, 0, 0], ng * 4);
      ng++;
    }
    gl.uniform4fv(p.u.uGap, gaps);
    gl.uniform1i(p.u.uNGap, ng);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.refl.tex);
    gl.uniform1i(p.u.uRefl, 0);
    gl.uniform4f(p.u.uWet, L.wet, 1.35, 0.5, 0.6);
  }

  /** the road's surface (no depth: everything else lies on it) */
  drawRoad() {
    const gl = this.gl;
    this.d.flush();
    this.surfUniforms();
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.disable(gl.STENCIL_TEST); gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, this.nRoad);
    gl.bindVertexArray(null);
    this.d.stats.calls++;
  }

  /** barriers, bridges, gantries: they hide what is behind them, so they write depth */
  drawStructures() {
    const gl = this.gl;
    this.d.flush();
    this.surfUniforms();
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
    gl.disable(gl.STENCIL_TEST); gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, this.nRoad, this.nAll - this.nRoad);
    gl.bindVertexArray(null);
    gl.depthMask(false);
    this.d.stats.calls++;
  }

  /** poles as dark strokes against the sky */
  drawPoles() {
    const d = this.d, R = this.road;
    const L = this.look;
    if (this.camH > 600) return;
    d.lineStyle({ world: true, blend: 'alpha', fog: [200, 900, 0] });
    const col: RGBA = [0.004, 0.0045, 0.006, 1];
    for (const s of this.poles) {
      if (s < this.camS - 40 || s > this.camS + 900) continue;
      d.seg(R.P(s, 0, -1.0), R.P(s, 0, -12.1), 0.26, col, 0.2, col);
      for (const sd of [-1, 1]) {
        d.seg(R.P(s, 0, -11.8), R.P(s, sd * 1.6, -12.0), 0.12, col);
        d.seg(R.P(s, sd * 1.6, -12.0), R.P(s, sd * 2.75, -11.75), 0.12, col);
        d.seg(R.P(s, sd * 2.35, -11.72), R.P(s, sd * 3.1, -11.68), 0.34, col);
      }
    }
    d.flush();
    d.lineStyle({});
    void L;
  }

  /** the lamp heads: a bright lens, a soft halo; the nearest go to the mist */
  lampHeads() {
    const d = this.d, R = this.road, mir = this.mirror;
    const I = this.look.lamp;
    const c = hex('#ff9f3a', 1);
    const hot = hex('#ffc27a', 1);
    d.dotStyle({ world: false, blend: 'add' });
    const near: [number, number][] = [];
    for (const s of this.poles) {
      if (this.camH < 300 && s < this.camS - 60) continue;
      const dm = this.dim(s);
      for (const sd of [-1, 1]) {
        const p = R.P(s, sd * 2.75, -11.6);
        const z = this.depth(p);
        if (z < 0.5) continue;
        const [r, k] = this.px(p, mir ? 0.3 : 0.17, mir ? 1.6 : 0.9);
        if (r <= 0) continue;
        const e = k * dm * I;
        if (e < 0.004) continue;
        d.dot(this.M(p), r, [hot[0] * 7 * e, hot[1] * 7 * e, hot[2] * 7 * e, 1], 0.5);
        if (!mir) {
          const [rh] = this.px(p, 1.4, 2.0);
          d.dot(this.M(p), rh, [c[0] * 0.14 * e, c[1] * 0.14 * e, c[2] * 0.14 * e, 1], 1);
        }
        if (!mir && z < 900) near.push([z, s * 2 + (sd > 0 ? 1 : 0)]);
      }
    }
    d.flush();
    this.delineators();
    this.masts();
    if (!mir) {
      near.sort((a, b) => a[0] - b[0]);
      for (const [, key] of near.slice(0, 40)) {
        const s = Math.floor(key / 2), sd = key % 2 ? 1 : -1;
        this.mistLight(R.P(s, sd * 2.75, -11.4), c, 1.0 * I * this.dim(s));
      }
      const sOf = new Map<V3, number>();
      // stars fade out with distance well before the list runs out, so none pops in or out
      this.stars(near.slice(0, 12).map(([z, key]) => {
        const s = Math.floor(key / 2), sd = key % 2 ? 1 : -1;
        const p = R.P(s, sd * 2.75, -11.6);
        sOf.set(p, s);
        return { p, c: hot, k: I * this.dim(s) * Math.min(1, 60 / Math.max(z, 1)) * clamp((200 - z) / 140) };
      }).filter((l) => l.k > 0.01), (p) => sOf.get(p) ?? 0);
    }
  }

  /** the stopped-down lens's starburst on the brightest points: six thin spikes, fixed to the blades */
  stars(list: { p: V3; c: RGBA; k: number }[], sOf?: (p: V3) => number) {
    if (this.camH > 300 || !list.length) return;
    const d = this.d, cam = this.cam;
    // a sign's panel ahead hides the lamps beyond it, and their stars
    let wall = Infinity;
    for (const sp of this.o.spans) if (sp.panel && sp.s > this.camS && sp.s < wall) wall = sp.s;
    const pts: [number, number, RGBA, number][] = [];
    for (const l of list) {
      if (this.depth(l.p) < 1) continue;
      if (sOf && sOf(l.p) > wall) continue;
      const [x, y] = cam.project(l.p);
      if (x < -200 || x > 2120 || y < -200 || y > 1280) continue;
      pts.push([x, y, l.c, l.k]);
    }
    if (!pts.length) return;
    d.setCamera(Camera.home());
    d.lineStyle({ world: false, blend: 'add', glow: 0.8 });
    for (const [x, y, c, k] of pts) {
      const L = 12 + 84 * Math.min(1, k) * Math.min(1, k);
      for (let i = 0; i < 6; i++) {
        const a = 0.32 + (i * Math.PI) / 3;
        const ex = x + Math.cos(a) * L, ey = y + Math.sin(a) * L;
        const I = 0.55 * k;
        d.seg([x, y, 0], [ex, ey, 0], 1.3, [c[0] * I, c[1] * I, c[2] * I, 1], 0.4, [0, 0, 0, 1]);
      }
    }
    d.flush();
    d.lineStyle({});
    d.setCamera(cam);
  }

  /** the barriers' reflectors, every 24 m: amber on the median, white along the shoulders; they
   *  catch the headlights and count the speed */
  delineators() {
    if (this.camH > 200) return;
    const d = this.d, R = this.road, mir = this.mirror;
    const amber = hex('#ffb347', 1), white = hex('#dfe6f2', 1);
    d.dotStyle({ world: false, blend: 'add' });
    const s0 = Math.ceil((this.camS - 20) / 24) * 24;
    for (let s = s0; s < this.camS + 520; s += 24) {
      const fl = 0.6 + 0.4 * Math.sin(s * 0.37 + this.t * 3.0);
      const pts: [number, number, RGBA, number][] = [[15.15, -0.95, white, 0.35], [-15.15, -0.95, white, 0.3]];
      if (s >= (this.o.medianFrom ?? 0)) pts.push([0.32, -0.9, amber, 0.5], [-0.32, -0.9, amber, 0.5]);
      for (const [o, h, c, I] of pts) {
        const p = R.P(s, o, h);
        const [r, k] = this.px(p, mir ? 0.12 : 0.05, mir ? 1.4 : 0.7);
        if (r <= 0) continue;
        const e = I * k * fl;
        d.dot(this.M(p), r, [c[0] * e, c[1] * e, c[2] * e, 1], 0.5);
      }
    }
    d.flush();
  }

  /** cars crossing over on the bridges, their lights running along the decks */
  crossTraffic() {
    if (this.camH > 400) return;
    const d = this.d, R = this.road, mir = this.mirror;
    d.lineStyle({ world: false, blend: 'add', glow: mir ? 2 : 1 });
    for (const sp of this.o.spans) {
      if (sp.kind !== 'bridge' || sp.s < this.camS - 40 || sp.s > this.camS + 1800) continue;
      for (let k = 0; k < 6; k++) {
        const dir = k % 2 ? 1 : -1;
        const u = ((k * 61.7 + sp.s * 0.13 + this.t * 13 * dir) % 180 + 180) % 180;
        const o = dir > 0 ? -90 + u : 90 - u;
        const e = sp.s + (dir > 0 ? 2.2 : -2.2);
        const h = bridgeH(o) + 0.75;
        // its head and tail lights, each with a short streak behind
        for (const [front, col, I] of [[1, hex('#eef2ff', 1), 2.2], [-1, hex('#ff2a1e', 1), 1.3]] as [number, RGBA, number][]) {
          const oo = o + dir * front * 2.2;
          const a = R.P(e, oo, -h), b = R.P(e, oo - dir * 9, -(bridgeH(oo - dir * 9) + 0.75));
          const za = this.depth(a), zb = this.depth(b);
          if (za < 1 || zb < 1) continue;
          const wa = Math.max(mir ? 2 : 1, (0.1 * this.focal) / za), wb = Math.max(mir ? 2 : 1, (0.1 * this.focal) / zb);
          d.seg(this.M(a), this.M(b), wa, [col[0] * I, col[1] * I, col[2] * I, 1], wb, [0, 0, 0, 1]);
        }
      }
    }
    d.flush();
    d.lineStyle({});
  }

  /** airliners on approach: landing lights, the wing tips' red and green, a beacon, strobes */
  planes(list: { p: V3; v: V3 }[]) {
    const d = this.d, mir = this.mirror;
    // seen from the ground only: from above, their lights point away and would spot the chart
    const fade = 1 - clamp((this.camH - 120) / 160);
    if (mir || fade <= 0) return;
    d.dotStyle({ world: false, blend: 'add' });
    for (const pl of list) {
      const c: V3 = [pl.p[0] + pl.v[0] * this.t, pl.p[1] + pl.v[1] * this.t, pl.p[2] + pl.v[2] * this.t];
      const vl = Math.hypot(pl.v[0], pl.v[2]) || 1;
      const fx = pl.v[0] / vl, fz = pl.v[2] / vl;   // heading
      const rx = fz, rz = -fx;                       // right wing
      const at = (along: number, right: number, up: number): V3 => [c[0] + fx * along + rx * right, c[1] - up, c[2] + fz * along + rz * right];
      const dot = (p: V3, rw: number, col: RGBA, I: number, soft = 0.6) => {
        const [r, k] = this.px(p, rw, 0.9);
        if (r <= 0) return;
        const e = I * k * fade;
        d.dot(p, r, [col[0] * e, col[1] * e, col[2] * e, 1], soft);
      };
      const white = hex('#f4f6ff', 1);
      dot(at(4, -2.5, 0), 1.2, white, 16); dot(at(4, 2.5, 0), 1.2, white, 16);
      dot(at(4, 0, 0), 14, white, 0.35, 1);
      dot(at(-2, -17, 0.5), 0.5, hex('#ff2a1e', 1), 3); dot(at(-2, 17, 0.5), 0.5, hex('#3aff7a', 1), 3);
      const ph = (this.t * 1.1 + pl.p[0] * 0.001) % 1;
      if (ph < 0.12) dot(at(-1, 0, 2.6), 0.6, hex('#ff2a1e', 1), 6);
      const st = (this.t * 0.9 + 0.3) % 1;
      if (st < 0.05 || (st > 0.12 && st < 0.17)) { dot(at(-2, -17, 0.5), 0.8, white, 10); dot(at(-2, 17, 0.5), 0.8, white, 10); }
      this.mistLight(at(6, 0, 0), white, 1.4 * fade);
    }
    d.flush();
  }

  /** radio masts out in the city, their red obstruction lights blinking slowly in the haze */
  masts() {
    if (!this.o.city || this.camH > 1500) return;
    const d = this.d, mir = this.mirror;
    const [x0, z0, x1, z1] = this.o.city;
    const rnd = mulberry32(31);
    const red = hex('#ff2a1e', 1);
    d.dotStyle({ world: false, blend: 'add' });
    for (let i = 0; i < 9; i++) {
      const x = lerp(x0, x1, rnd()), z = lerp(z0, z1, rnd()), h = 70 + 130 * rnd(), ph = rnd();
      const on = ((this.t * 0.75 + ph) % 1) < 0.35 ? 1 : 0.08;
      for (const f of [1, 0.66, 0.33]) {
        const p: V3 = [x, -h * f, z];
        const z2 = this.depth(p);
        if (z2 < 50) continue;
        const [r, k] = this.px(p, mir ? 2.4 : 1.2, mir ? 1.6 : 0.9);
        if (r <= 0) continue;
        const e = (f === 1 ? 6 : 3.5) * on * k * Math.exp(-z2 / 9000);
        d.dot(this.M(p), r, [red[0] * e, red[1] * e, red[2] * e, 1], 0.7);
      }
    }
    d.flush();
  }

  /** dust and droplets in the air by the camera, catching the lamps as they stream past */
  motes() {
    if (this.camH > 60 || this.mirror) return;
    const d = this.d, R = this.road, cam = this.cam.pos;
    const [tx, tz] = R.T(this.camS);
    const box: V3 = [36, 14, 70];
    const rnd = mulberry32(77);
    const sp = this.o.lampEvery;
    d.dotStyle({ world: false, blend: 'add' });
    for (let i = 0; i < 260; i++) {
      const b: V3 = [rnd() * box[0], rnd() * box[1], rnd() * box[2]];
      // drifting on the wind, wrapped into a box that travels with the camera
      const w: V3 = [b[0] + this.t * 0.9 - cam[0], b[1] + Math.sin(this.t * 0.7 + i) * 0.3 - cam[1], b[2] - this.t * 0.4 - cam[2]];
      const p: V3 = [cam[0] + (((w[0] % box[0]) + box[0]) % box[0]) - box[0] / 2, cam[1] + (((w[1] % box[1]) + box[1]) % box[1]) - box[1] * 0.6, cam[2] + (((w[2] % box[2]) + box[2]) % box[2]) - 8];
      if (p[1] > -0.2) continue;
      const z = this.depth(p);
      if (z < 1.5) continue;
      // lit by the nearest lamps
      const s = this.camS + (p[0] - cam[0]) * tx + (p[2] - cam[2]) * tz;
      const sk = Math.round(s / sp) * sp;
      let I = 0;
      for (const kk of [sk - sp, sk, sk + sp]) {
        if (!this.lampOn(kk)) continue;
        for (const sd of [-1, 1]) {
          const l = R.P(kk, sd * 2.75, -11.6);
          const dd = (l[0] - p[0]) ** 2 + (l[1] - p[1]) ** 2 + (l[2] - p[2]) ** 2;
          I += 30 / (dd + 20);
        }
      }
      I = Math.min(1.2, I) * (0.4 + 0.6 * rnd());
      if (I < 0.02) continue;
      // out of focus close to the lens: a soft disc, fainter the larger it is
      const blur = Math.abs(1 / z - 1 / 40) * 180;
      const r = Math.max(0.8, blur, (0.012 * this.focal) / z);
      const k = I * Math.min(1, (0.9 / r) * (0.9 / r) * 4) * 0.5;
      d.dot(p, r, [1.0 * k, 0.62 * k, 0.32 * k, 1], 0.85);
      void tx; void tz;
    }
    d.flush();
    d.lineStyle({});
  }

  /** the city's street lamps all around, twinkling a little in the warm air */
  drawCity() {
    if (!this.carpet || this.look.carpet <= 0) return;
    const H = this.camH;
    const fog: [number, number, number] = [lerp(200, 4000, clamp(H / 3000)), lerp(5000, 30000, clamp(H / 3000)), lerp(0.04, 0.12, clamp(H / 3000))];
    const k = this.look.carpet;
    this.d.dots(this.carpet, { world: true, rScale: 1, rClamp: [0.75, 3.5], color: [k, k, k, 1], flicker: 0.25, time: this.t, fog });
  }

  /** seen from high up, the road is a line of light: its streams of head and tail lights merge,
   *  and the air over it glows with its lamps */
  drawFar() {
    const far = this.far;
    if (far <= 0.01) return;
    const d = this.d, R = this.road;
    const dt = this.o.data;
    const { from, to } = this.o.traffic;
    const step = 40;
    const minPx = 1.6;
    // the glow of the expressway's lamps in the air over it: a soft halo around the line (the
    // strongest of the overlapping strokes is kept, so the joins do not bead)
    const zc = Math.max(1, this.camH);
    for (const [sig, I] of [[260, 0.12], [55, 0.3]] as [number, number][]) {
      d.lineStyle({ world: false, blend: 'max', glow: Math.max(1.5, (sig * this.focal) / zc) });
      for (let s = from; s < to; s += step) {
        const e = Math.min(to, s + step);
        const ka = this.dim(s) * far * I, kb = this.dim(e) * far * I;
        d.seg(R.P(s, 0, -2), R.P(e, 0, -2), 1, [1.0 * ka, 0.45 * ka, 0.12 * ka, 1], 1, [1.0 * kb, 0.45 * kb, 0.12 * kb, 1]);
      }
      d.flush();
    }
    // the two streams, red going and white coming, each a line at least a pixel and a half wide
    d.lineStyle({ world: false, blend: 'max', glow: 1.2 });
    for (const [off, col] of [[7, hex('#ff2a1e', 1.4)], [-7, hex('#eef2ff', 1.5)]] as [number, RGBA][]) {
      for (let s = from; s < to; s += step) {
        const e = Math.min(to, s + step);
        const a = R.P(s, off, -0.8), b = R.P(e, off, -0.8);
        const za = Math.max(1, this.depth(a)), zb = Math.max(1, this.depth(b));
        const wa = (6 * this.focal) / za, wb = (6 * this.focal) / zb;
        const ka = this.dim(s) * far * Math.min(1, wa / minPx), kb = this.dim(e) * far * Math.min(1, wb / minPx);
        d.seg(a, b, Math.max(minPx, wa), [col[0] * ka, col[1] * ka, col[2] * ka, 1], Math.max(minPx, wb), [col[0] * kb, col[1] * kb, col[2] * kb, 1]);
      }
    }
    d.flush();
    d.lineStyle({});
    void dt;
  }

  /** the traffic: head and tail lights drawn as a long exposure sees them, streaks at speed */
  traffic() {
    const d = this.d, R = this.road, mir = this.mirror;
    const { from, to } = this.o.traffic;
    const span = to - from;
    const far = this.far;
    const camS = this.camS;
    const ahead = this.camH > 300 ? Infinity : 2600 + this.camH * 20;
    const behind = this.camH > 300 ? Infinity : 30 + this.camH * 2;
    const minW = mir ? 2.6 : 1.1;
    d.lineStyle({ world: false, blend: 'add', glow: mir ? 2.5 : 1.4 });
    const near: [number, number, number][] = [];
    for (let ci = 0; ci < this.cars.length; ci++) {
      const car = this.cars[ci];
      let s = (car.s0 + car.v * this.tau) % span;
      if (s < 0) s += span;
      s = car.dir > 0 ? from + s : to - s;
      if (s < camS - behind || s > camS + ahead) continue;
      const off = car.dir * (3.35 + car.lane * 3.7);
      const dm = this.dim(s);
      if (dm <= 0.01) continue;
      // a long exposure: the trail is where the car was over the last ~1.6 s, brightest at the car
      const trail = (car.dir > 0 ? 34 : 44) * (1 + far * 6);
      const lights: [number, number, RGBA, number][] = car.dir > 0
        ? [[-0.78, 0.85, car.tail, 1.5 * car.br], [0.78, 0.85, car.tail, 1.5 * car.br]]
        : [[-0.8, 0.68, car.head, 1.8], [0.8, 0.68, car.head, 1.8]];
      if (car.truck) {
        const amber = hex('#ffae3c', 1);
        if (car.dir > 0) lights.push([-1.2, 3.7, car.tail, 0.07], [1.2, 3.7, car.tail, 0.07]);
        else lights.push([-0.9, 3.3, amber, 0.12], [0.9, 3.3, amber, 0.12]);
      }
      for (const [lo, lh, col, I0] of lights) {
        const I = I0 * dm;
        const n = 4;
        // a truck's high marker lights leave only short dashes: long ones read as lines off the road
        const tr = lh > 2 ? trail * 0.12 : trail;
        let prev: V3 | null = null, prevW = 0, prevC: RGBA = col, prevZ = 0;
        for (let k = 0; k <= n; k++) {
          const sk = s - car.dir * tr * (k / n);
          const p = R.P(sk, off + lo, -lh);
          const z = this.depth(p);
          const wt = Math.min(mir ? 14 : 5.5, ((mir ? 0.2 : 0.085) * this.focal) / Math.max(z, 1));
          const w = Math.max(minW, wt);
          const keep = Math.min(1, wt / w);
          const fade = k === 0 ? 1 : k === n ? 0 : Math.pow(1 - k / n, 1.4) * 0.8;
          const cc: RGBA = [col[0] * I * fade * keep, col[1] * I * fade * keep, col[2] * I * fade * keep, 1];
          if (prev && z > 1 && prevZ > 1) d.seg(this.M(prev), this.M(p), prevW, prevC, w, cc);
          prev = p; prevW = w; prevC = cc; prevZ = z;
        }
      }
      if (!mir && car.dir < 0) {
        const z = this.depth(R.P(s, off, -0.7));
        if (z > 2 && z < 400) near.push([z, s, off]);
      }
    }
    d.flush();
    // the lights themselves, bright points at the head of each streak
    d.dotStyle({ world: false, blend: 'add' });
    for (const car of this.cars) {
      let s = (car.s0 + car.v * this.tau) % span;
      if (s < 0) s += span;
      s = car.dir > 0 ? from + s : to - s;
      if (s < camS - behind || s > camS + ahead) continue;
      const off = car.dir * (3.35 + car.lane * 3.7);
      const dm = this.dim(s);
      for (const sd of [-1, 1]) {
        const p = R.P(s, off + sd * (car.dir > 0 ? 0.78 : 0.8), car.dir > 0 ? -0.85 : -0.68);
        const [r, k] = this.px(p, mir ? 0.3 : 0.13, mir ? 2.0 : 0.8);
        if (r <= 0) continue;
        const col = car.dir > 0 ? car.tail : car.head;
        const I = (car.dir > 0 ? 2.4 * car.br : 4.5) * k * dm;
        d.dot(this.M(p), r, [col[0] * I, col[1] * I, col[2] * I, 1], 0.6);
      }
    }
    d.flush();
    d.lineStyle({});
    this.crossTraffic();
    if (!mir) {
      near.sort((a, b) => a[0] - b[0]);
      for (const [z, s, off] of near.slice(0, 10)) this.mistLight(R.P(s, off, -0.75), hex('#e8eeff', 1), 0.35 * clamp((400 - z) / 250));
    }
  }

  /** the mist: halos of the lamps it catches, and wisps drifting across */
  drawMist() {
    const gl = this.gl, p = this.vol, L = this.look;
    if (L.mist <= 0) return;
    this.d.flush();
    gl.useProgram(p.p);
    this.camUniforms(p);
    const n = Math.min(64, this.vl.length / 4);
    const lv = new Float32Array(64 * 4), lc = new Float32Array(64 * 3);
    lv.set(this.vl.slice(0, n * 4)); lc.set(this.vc.slice(0, n * 3));
    gl.uniform4fv(p.u.uL, lv);
    gl.uniform3fv(p.u.uLC, lc);
    gl.uniform1i(p.u.uNL, n);
    gl.uniform4f(p.u.uMist, 0.003 * L.mist, 260, 0.03 * L.mist, 34);
    gl.uniform4f(p.u.uWind, 2.2, -1.1, this.t, 0);
    const mc = hex('#ff9a48', 1);
    gl.uniform3f(p.u.uMistC, mc[0] * 0.05, mc[1] * 0.05, mc[2] * 0.05);
    gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.disable(gl.STENCIL_TEST);
    gl.bindVertexArray(this.fsVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    this.d.stats.calls++;
  }
}
