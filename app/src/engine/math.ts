// Small math kit: vectors, 4x4 matrices (column-major, like GL), easing, springs, noise.

export type V3 = [number, number, number];
export type M4 = Float32Array;

export const clamp = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, x: number) => (b === a ? 0 : (x - a) / (b - a));
export const remap = (x: number, a: number, b: number, c: number, d: number) => lerp(c, d, invLerp(a, b, x));
export const smooth = (x: number) => { x = clamp(x); return x * x * (3 - 2 * x); };
export const smoother = (x: number) => { x = clamp(x); return x * x * x * (x * (x * 6 - 15) + 10); };
export const fract = (x: number) => x - Math.floor(x);
export const TAU = Math.PI * 2;

/** progress of x through [a, b], clamped, then eased */
export const prog = (x: number, a: number, b: number, e: (t: number) => number = (t) => t) => e(clamp(invLerp(a, b, x)));

export const ease = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inCubic: (t: number) => t * t * t,
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inQuart: (t: number) => t * t * t * t,
  outQuart: (t: number) => 1 - Math.pow(1 - t, 4),
  inOutQuart: (t: number) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2),
  inExpo: (t: number) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  outExpo: (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOutExpo: (t: number) =>
    t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
  outBack: (t: number, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
  inBack: (t: number, s = 1.70158) => (s + 1) * t * t * t - s * t * t,
  outSine: (t: number) => Math.sin((t * Math.PI) / 2),
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  outCirc: (t: number) => Math.sqrt(1 - Math.pow(t - 1, 2)),
  inCirc: (t: number) => 1 - Math.sqrt(1 - t * t),
};

/** a camera's progress through its shot that never comes to rest: a little quicker in the
 * middle, still moving at both ends, and carrying on at that speed before and after the shot
 * (where its transitions show it) */
export function glide(p: number, a = 0.3): number {
  if (p < 0) return (1 - a) * p;
  if (p > 1) return 1 + (1 - a) * (p - 1);
  return p - (a * Math.sin(2 * Math.PI * p)) / (2 * Math.PI);
}

/** an ease over x in 0..1 that keeps a share v of its speed: it starts and ends moving, and
 * carries on at that speed before and after (where a transition still shows it) */
export function easeOn(x: number, e: (t: number) => number = ease.inOutSine, v = 0.25): number {
  if (x < 0) return v * x;
  if (x > 1) return 1 + v * (x - 1);
  return (1 - v) * e(x) + v * x;
}

/** an ease-in that leaves at full speed and keeps that speed after 1 (a launch, a dive) */
export function launch(x: number, power = 3): number {
  if (x <= 0) return 0;
  if (x <= 1) return Math.pow(x, power);
  return 1 + power * (x - 1);
}

/** damped spring response to a unit step at t=0: 0 -> 1 with overshoot. freq in Hz, zeta damping ratio */
export function spring(t: number, freq = 2, zeta = 0.35): number {
  if (t <= 0) return 0;
  const w = TAU * freq;
  if (zeta < 1) {
    const wd = w * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * w * t) * (Math.cos(wd * t) + ((zeta * w) / wd) * Math.sin(wd * t));
  }
  return 1 - Math.exp(-w * t) * (1 + w * t);
}

/** keyframes: [[t, value, ease?], ...] -> value at x (holds outside) */
export function keys(x: number, k: [number, number, ((t: number) => number)?][]): number {
  if (x <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) {
    if (x <= k[i][0]) {
      const [t0, v0] = k[i - 1];
      const [t1, v1, e] = k[i];
      return lerp(v0, v1, (e || ease.inOutCubic)(invLerp(t0, t1, x)));
    }
  }
  return k[k.length - 1][1];
}

// ---------- hashing / noise (deterministic) ----------
export function hash1(n: number): number {
  let x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}
export function hash2(a: number, b: number): number {
  let x = Math.sin(a * 127.1 + b * 311.7 + 74.7) * 43758.5453123;
  return x - Math.floor(x);
}
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function noise1(x: number): number {
  const i = Math.floor(x), f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hash1(i), hash1(i + 1), u) * 2 - 1;
}
export function fbm1(x: number, oct = 4): number {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * noise1(x * f + i * 17.3); a *= 0.5; f *= 2; }
  return s;
}

// ---------- vectors ----------
export const v3 = (x = 0, y = 0, z = 0): V3 => [x, y, z];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scl = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: V3): V3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const mix3 = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// ---------- matrices (column-major) ----------
export function m4(): M4 { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; }
export function mul(a: M4, b: M4): M4 {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return o;
}
export function translate(x: number, y: number, z = 0): M4 { const m = m4(); m[12] = x; m[13] = y; m[14] = z; return m; }
export function scale(x: number, y = x, z = 1): M4 { const m = m4(); m[0] = x; m[5] = y; m[10] = z; return m; }
export function rotX(a: number): M4 { const m = m4(), c = Math.cos(a), s = Math.sin(a); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; }
export function rotY(a: number): M4 { const m = m4(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; }
export function rotZ(a: number): M4 { const m = m4(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; }
/** compose left to right: chain(A, B, C) = A*B*C (C applied first) */
export function chain(...ms: M4[]): M4 { return ms.reduce((a, b) => mul(a, b)); }
export function apply(m: M4, p: V3): V3 {
  const x = p[0], y = p[1], z = p[2];
  const w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1;
  return [(m[0] * x + m[4] * y + m[8] * z + m[12]) / w, (m[1] * x + m[5] * y + m[9] * z + m[13]) / w, (m[2] * x + m[6] * y + m[10] * z + m[14]) / w];
}
export function invert(m: M4): M4 {
  const o = new Float32Array(16);
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m as unknown as number[];
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return m4();
  det = 1 / det;
  o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det; o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det; o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det; o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det; o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det; o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det; o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det; o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det; o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return o;
}

// ---------- colour ----------
export type RGBA = [number, number, number, number];
const s2l = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
/** '#rrggbb' (sRGB) -> linear RGBA, times an intensity (lights may exceed 1) */
export function hex(h: string, intensity = 1, alpha = 1): RGBA {
  const n = parseInt(h.replace('#', ''), 16);
  return [s2l(((n >> 16) & 255) / 255) * intensity, s2l(((n >> 8) & 255) / 255) * intensity, s2l((n & 255) / 255) * intensity, alpha];
}
export const mixc = (a: RGBA, b: RGBA, t: number): RGBA => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t)];
export const withA = (c: RGBA, a: number): RGBA => [c[0], c[1], c[2], a];
export const mulc = (c: RGBA, k: number): RGBA => [c[0] * k, c[1] * k, c[2] * k, c[3]];
