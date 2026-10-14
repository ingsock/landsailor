// After drawing: sub-frames averaged for motion blur; then each shot is graded on its own (light
// that spills, exposure, tone, and the medium it is seen in: night, a thermal camera, a blueprint,
// a risograph print, a CRT, paper); then, during a transition, the two graded pictures are joined;
// last, 8-bit with a dither so dark gradients do not band.
import { FS_VS, Target, compile, drawFS, makeTarget, Prog } from './gl';

const ACC_FS = `#version 300 es
precision highp float;
in vec2 vUv; uniform sampler2D uSrc; uniform float uW; out vec4 o;
void main(){ o = texture(uSrc, vUv) * uW; }`;

const BRIGHT_FS = `#version 300 es
precision highp float;
in vec2 vUv; uniform sampler2D uSrc; uniform vec2 uTexel; uniform float uThresh; uniform float uKnee; out vec4 o;
// a NaN or an infinity from any scene's shader would spread through the blur into a black block:
// such a sample counts as nothing (max with 0 also returns 0 for a NaN on the D3D path)
vec3 safe(vec3 v){ v = min(max(v, vec3(0.0)), vec3(60000.0)); return any(isnan(v)) || any(isinf(v)) ? vec3(0.0) : v; }
void main(){
  vec3 c = vec3(0.0);
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) c += safe(texture(uSrc, vUv + vec2(i, j) * uTexel).rgb);
  c /= 9.0;
  float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - uThresh + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-5);
  float contrib = max(soft, br - uThresh) / max(br, 1e-5);
  vec3 b = c * contrib;
  // a cap, so a large bright area glows instead of veiling the whole frame
  float bm = max(b.r, max(b.g, b.b));
  if (bm > 3.0) b *= 3.0 / bm;
  o = vec4(b, 1.0);
}`;

const DOWN_FS = `#version 300 es
precision highp float;
in vec2 vUv; uniform sampler2D uSrc; uniform vec2 uTexel; out vec4 o;
void main(){
  vec3 c = texture(uSrc, vUv).rgb * 4.0;
  c += texture(uSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  c += texture(uSrc, vUv + uTexel * vec2( 1.0, -1.0)).rgb;
  c += texture(uSrc, vUv + uTexel * vec2(-1.0,  1.0)).rgb;
  c += texture(uSrc, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
  o = vec4(c / 8.0, 1.0);
}`;

const UP_FS = `#version 300 es
precision highp float;
in vec2 vUv; uniform sampler2D uSrc; uniform sampler2D uPrev; uniform vec2 uTexel; uniform float uMix; out vec4 o;
void main(){
  vec3 c = vec3(0.0);
  c += texture(uSrc, vUv + uTexel * vec2(-1.0, 0.0)).rgb * 2.0;
  c += texture(uSrc, vUv + uTexel * vec2( 1.0, 0.0)).rgb * 2.0;
  c += texture(uSrc, vUv + uTexel * vec2(0.0, -1.0)).rgb * 2.0;
  c += texture(uSrc, vUv + uTexel * vec2(0.0,  1.0)).rgb * 2.0;
  c += texture(uSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  c += texture(uSrc, vUv + uTexel * vec2( 1.0, -1.0)).rgb;
  c += texture(uSrc, vUv + uTexel * vec2(-1.0,  1.0)).rgb;
  c += texture(uSrc, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
  c /= 12.0;
  o = vec4(texture(uPrev, vUv).rgb + c * uMix, 1.0);
}`;

/** noise and patterns shared by the grade and the joins; px are pixels of a 1080-line frame */
const LIB = `
float h21(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * vn(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`;

const GRADE_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc; uniform sampler2D uBloom;
uniform float uBloomGain; uniform float uExposure; uniform float uFlash;
uniform vec3 uFlashColor; uniform float uFade; uniform vec3 uLift;
uniform int uLook; uniform vec3 uTint; uniform vec3 uGround; uniform vec2 uRes; uniform float uPx; uniform float uTime;
uniform vec2 uScreen;  // where the print's halftone screen has slid to (px), following the picture
out vec4 o;
${LIB}
vec3 tone(vec3 x){
  // compress by luminance so a hue keeps its hue; what still exceeds 1 burns toward white,
  // as a bright lamp does on film
  float l = luma(x);
  float lt = l < 0.6 ? l : 0.6 + (l - 0.6) / (1.0 + (l - 0.6) * 1.1);
  vec3 c = l > 1e-5 ? x * (lt / l) : x;
  float m = max(c.r, max(c.g, c.b));
  if (m > 1.0) c = mix(c / m, vec3(1.0), smoothstep(1.0, 2.2, m) * 0.85);
  return c;
}
vec3 enc(vec3 c){ return mix(12.92 * c, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
/** the shot's own picture at uv: light, exposure, tone; display values 0..1 */
vec3 safe(vec3 v){ v = min(max(v, vec3(0.0)), vec3(60000.0)); return any(isnan(v)) || any(isinf(v)) ? vec3(0.0) : v; }
vec3 shade(vec2 uv){
  vec3 c = safe(texture(uSrc, uv).rgb) + safe(texture(uBloom, uv).rgb) * uBloomGain;
  c = c * uExposure + uLift;
  c = mix(c, uFlashColor, uFlash);
  c = tone(max(c, 0.0)) * (1.0 - uFade);
  return enc(clamp(c, 0.0, 1.0));
}
float grid(vec2 px, float step, float w){ vec2 d = abs(fract(px / step + 0.5) - 0.5) * step; return 1.0 - smoothstep(0.0, w, min(d.x, d.y)); }
float dots(vec2 px, float d, float ang, float cell){
  // a halftone screen: round dots that merge into a solid as the ink gets heavier
  mat2 R = mat2(cos(ang), sin(ang), -sin(ang), cos(ang));
  vec2 f = fract(R * px / cell) - 0.5;
  float r = length(f);
  float rad = mix(sqrt(max(d, 0.0) / 3.14159), 0.72, smoothstep(0.7, 1.0, d));
  float aa = 1.5 / cell;   // riso ink spreads a little at a dot's edge (and a soft edge costs the encoder far less)
  return d < 0.02 ? 0.0 : 1.0 - smoothstep(rad - aa, rad + aa, r);
}
vec3 iron(float x){
  // a thermal camera's palette: cold is near black and violet, hot is orange to white
  x = clamp(x, 0.0, 1.0);
  vec3 c0 = vec3(0.03, 0.01, 0.08), c1 = vec3(0.25, 0.04, 0.47), c2 = vec3(0.70, 0.10, 0.50);
  vec3 c3 = vec3(0.96, 0.38, 0.10), c4 = vec3(1.0, 0.78, 0.18), c5 = vec3(1.0, 0.99, 0.88);
  if (x < 0.18) return mix(c0, c1, x / 0.18);
  if (x < 0.40) return mix(c1, c2, (x - 0.18) / 0.22);
  if (x < 0.63) return mix(c2, c3, (x - 0.40) / 0.23);
  if (x < 0.84) return mix(c3, c4, (x - 0.63) / 0.21);
  return mix(c4, c5, (x - 0.84) / 0.16);
}
void main(){
  vec2 uv = vUv;
  vec2 px = vec2(uv.x, 1.0 - uv.y) * uRes / uPx;    // pixels of the 1080-line frame, y down
  vec3 s;
  if (uLook == 6) {
    // CRT: the tube's curve, its phosphor, the lines it is drawn in, a slow roll, its glass
    vec2 c = uv - 0.5;
    vec2 q = 0.5 + c * (1.0 + 0.085 * dot(c * vec2(1.0, 0.8), c * vec2(1.0, 0.8)) * 2.0);
    if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) { o = vec4(0.0, 0.0, 0.0, 1.0); return; }
    vec3 sh = shade(q);
    float l = luma(sh);
    vec3 ph = uTint * l * 1.2 + vec3(smoothstep(0.7, 1.0, l)) * 0.3;
    float line = (1.0 - q.y) * uRes.y / uPx;
    ph *= 0.68 + 0.32 * pow(abs(sin(line * 3.14159 / 3.0)), 0.7);
    float roll = exp(-pow((fract(q.y * 0.7 + uTime * 0.21) - 0.5) * 9.0, 2.0));
    ph *= 1.0 + 0.06 * roll;
    ph += uTint * 0.022 * (0.8 + 0.2 * vn(px / 3.0));
    ph *= 1.0 - 0.5 * pow(length(c * vec2(1.0, 1.2)) * 1.3, 3.0);
    s = ph;
  } else if (uLook == 5) {
    // risograph: two inks on cream paper, each through its own halftone screen, a little out of
    // register, with the grain of the ink and the tooth of the paper
    vec2 mis = vec2(1.8, 1.2) * uPx / uRes;
    vec3 s1 = shade(uv), s2 = shade(uv + mis);
    float w1 = clamp((s1.r - s1.b) * 1.8, 0.0, 1.0), w2 = clamp((s2.r - s2.b) * 1.8, 0.0, 1.0);
    float d1 = clamp(luma(s1) * (0.25 + 0.95 * w1) * 1.4, 0.0, 1.0);
    float d2 = clamp(luma(s2) * (1.0 - 0.8 * w2) * 1.45, 0.0, 1.0);
    // the screen and the ink's grain slide with the picture, so a moving picture carries its dots
    // with it (a screen fixed to the frame under a moving picture boils, and costs the encoder
    // six times the bits)
    vec2 sp = px + uScreen;
    float gr = 0.84 + 0.16 * vn(sp / 1.4);
    // riso ink runs heavy: the middle tones close up toward solid, so small type stays whole
    d1 = smoothstep(0.05, 0.78, d1); d2 = smoothstep(0.05, 0.78, d2);
    float k1 = dots(sp, d1, 0.26, 4.2) * gr, k2 = dots(sp + 0.7, d2, 1.31, 4.2) * gr;
    float fib = smoothstep(0.62, 0.92, vn(vec2(px.x / 160.0, px.y / 5.0))) * vn(px / 90.0);
    vec3 paper = uGround * (0.968 + 0.032 * fbm(px / 26.0)) * (1.0 - 0.014 * fib);
    s = paper * mix(vec3(1.0), uTint, k1) * mix(vec3(1.0), vec3(0.0, 0.46, 0.74), k2);
  } else {
    s = shade(uv);
    if (uLook == 2) {
      // paper: the tooth of the sheet and its long fibres, fixed to the page
      float n = fbm(px / 2.4) * 0.55 + fbm(px / 48.0) * 0.45;
      float fib = smoothstep(0.6, 0.92, vn(vec2(px.x / 120.0 + px.y / 900.0, px.y / 3.5)));
      s *= 1.0 - 0.05 * n - 0.025 * fib;
    } else if (uLook == 3) {
      // thermal camera: a coarse sensor (soft), its fixed pattern, a little live noise, the palette
      vec2 e = vec2(1.5, 0.0) * uPx / uRes;
      float l = luma(s) * 0.5 + 0.125 * (luma(shade(uv + e.xy)) + luma(shade(uv - e.xy)) + luma(shade(uv + e.yx)) + luma(shade(uv - e.yx)));
      l += (h21(floor(px / 2.0)) - 0.5) * 0.03 + (h21(px + floor(uTime * 24.0) * 7.0) - 0.5) * 0.025;
      s = iron(l * 1.04 + 0.02);
    } else if (uLook == 4) {
      // blueprint: white lines on the blue of a cyanotype, the sheet a little uneven, the grid of
      // the drawing paper under it
      vec3 ground = uGround * (0.9 + 0.16 * fbm(px / 300.0));
      ground = mix(ground, vec3(0.62, 0.8, 1.0), 0.045 * grid(px, 30.0, 0.9) + 0.085 * grid(px, 150.0, 1.3));
      vec3 ink = mix(vec3(0.94, 0.97, 1.0), s, 0.28);
      s = mix(ground, ink, clamp(luma(s) * 1.3, 0.0, 1.0));
    }
  }
  o = vec4(s, 1.0);
}`;

/** joins two graded pictures; u runs 0..1 through the transition */
const COMP_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uA; uniform sampler2D uB;
uniform int uKind; uniform float uU; uniform vec2 uP; uniform vec2 uDir; uniform vec3 uEdge; uniform float uEdgeI;
uniform vec2 uRes; uniform float uPx; uniform float uSeed;
out vec4 o;
${LIB}
vec3 A(vec2 uv){ return texture(uA, clamp(uv, 0.0, 1.0)).rgb; }
vec3 B(vec2 uv){ return texture(uB, clamp(uv, 0.0, 1.0)).rgb; }
bool inside(vec2 uv){ return uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0; }
float sm(float x){ x = clamp(x, 0.0, 1.0); return x * x * (3.0 - 2.0 * x); }
float ioc(float x){ x = clamp(x, 0.0, 1.0); return x < 0.5 ? 4.0 * x * x * x : 1.0 - pow(-2.0 * x + 2.0, 3.0) / 2.0; }
void main(){
  vec2 uv = vUv;
  float u = clamp(uU, 0.0, 1.0);
  float asp = uRes.x / uRes.y;
  vec3 c;
  if (uKind == 2) {
    // zoom: A rushes in toward P, B comes out of it; each blurred along its own rush
    vec3 a = vec3(0.0), b = vec3(0.0);
    float za = 1.0 + 2.6 * u * u, zb = 1.0 + 1.8 * (1.0 - u) * (1.0 - u);
    float ba = 0.10 * u, bb = 0.10 * (1.0 - u);
    for (int j = 0; j < 12; j++) {
      float f = float(j) / 11.0;
      a += A(uP + (uv - uP) / za * (1.0 - ba * f));
      b += B(uP + (uv - uP) * zb * (1.0 - bb * f));
    }
    a /= 12.0; b /= 12.0;
    float w = sm((u - 0.3) / 0.4);
    c = mix(a, b, w);
    float r = length((uv - uP) * vec2(asp, 1.0));
    c += uEdge * uEdgeI * pow(sin(3.14159 * u), 2.0) * exp(-r * 7.0);
  } else if (uKind == 3) {
    // push: the camera whips along uDir; A slides out, B slides in, smeared along the move
    float e = ioc(u);
    float speed = 6.0 * u * (1.0 - u);
    vec3 acc = vec3(0.0);
    for (int j = 0; j < 14; j++) {
      float off = (float(j) / 13.0 - 0.5) * 0.09 * speed;
      vec2 ua = uv + uDir * (e + off);
      acc += inside(ua) ? A(ua) : B(uv + uDir * (e + off - 1.0));
    }
    c = acc / 14.0;
  } else if (uKind == 4 || uKind == 5) {
    // wipe (a line crossing) or iris (a circle opening from P); the edge is a line of light
    float s, front;
    if (uKind == 4) {
      vec2 dn = normalize(uDir * vec2(asp, 1.0));
      vec2 p = (uv - 0.5) * vec2(asp, 1.0);
      float R = 0.5 * (asp * abs(dn.x) + abs(dn.y)) + 0.06;
      s = dot(p, dn);
      vec2 perp = vec2(-dn.y, dn.x);
      s += 0.012 * sin(dot(p, perp) * 9.0 + uSeed) + 0.006 * sin(dot(p, perp) * 23.0 + uSeed * 2.0);
      front = mix(-R, R, ioc(u));
      float mB = 1.0 - smoothstep(front - 0.003, front + 0.003, s);
      c = mix(A(uv), B(uv), mB);
    } else {
      vec2 d = (uv - uP) * vec2(asp, 1.0);
      s = length(d);
      float far = max(max(length(vec2(0.0, 0.0) - uP * vec2(asp, 1.0)), length((vec2(1.0, 0.0) - uP) * vec2(asp, 1.0))),
                      max(length((vec2(0.0, 1.0) - uP) * vec2(asp, 1.0)), length((vec2(1.0, 1.0) - uP) * vec2(asp, 1.0))));
      front = ioc(u) * (far + 0.02);
      float mB = 1.0 - smoothstep(front - 0.003, front + 0.003, s);
      c = mix(A(uv), B(uv), mB);
    }
    float g = exp(-pow((s - front) / 0.0035, 2.0)) + 0.35 * exp(-abs(s - front) / 0.03);
    c += uEdge * uEdgeI * g * sm(min(u, 1.0 - u) * 12.0);
  } else if (uKind == 6) {
    // ink: the new picture soaks through the old one in blots, the edge darker (or brighter)
    float n = fbm(uv * vec2(asp, 1.0) * 2.6 + uSeed) * 0.75 + 0.25 * fbm(uv * vec2(asp, 1.0) * 11.0 + uSeed * 1.7);
    float th = mix(0.1, 0.95, ioc(u));
    float mB = 1.0 - smoothstep(th - 0.02, th + 0.02, n);
    c = mix(A(uv), B(uv), mB);
    float edge = exp(-pow((n - th) / 0.018, 2.0)) * sm(min(u, 1.0 - u) * 10.0);
    c = mix(c, uEdge, edge * uEdgeI);
  } else if (uKind == 7) {
    // light: the new picture comes first where the old one is brightest, its lights flaring
    vec2 e = vec2(4.0, 0.0) * uPx / uRes;
    vec3 a = A(uv);
    float k = (luma(a) * 2.0 + luma(A(uv + e.xy)) + luma(A(uv - e.xy)) + luma(A(uv + e.yx)) + luma(A(uv - e.yx))) / 6.0;
    float th = 1.0 - 1.35 * u;
    float mB = max(smoothstep(th - 0.12, th + 0.04, k), sm((u - 0.55) / 0.45));
    c = mix(a, B(uv), mB) + a * 0.45 * pow(sin(3.14159 * u), 2.0) * k;
  } else if (uKind == 8) {
    // white: through a flash
    float w = pow(sin(3.14159 * u), 2.0);
    c = mix(u < 0.5 ? A(uv) : B(uv), uEdge, w * uEdgeI);
  } else if (uKind == 9) {
    // flap: horizontal slats, each flipping over from the old picture to the new, top to bottom
    float N = 9.0;
    float yp = 1.0 - uv.y;
    float i = floor(yp * N);
    float ph = clamp(u * 1.6 - (i / N) * 0.6, 0.0, 1.0);
    float y0 = i / N, yc = (i + 0.5) / N;
    float sq = cos(3.14159 * ph);
    float rel = (yp - yc) * N * 2.0;            // -1..1 within the slat
    float k = abs(sq);
    if (abs(rel) > k) c = vec3(0.0);
    else {
      float src = yc + rel / max(k, 1e-3) / (N * 2.0);
      vec2 su = vec2(uv.x, 1.0 - src);
      c = (ph < 0.5 ? A(su) : B(su)) * (0.55 + 0.45 * k);
    }
    // the hinge line between slats
    c *= 1.0 - 0.6 * smoothstep(0.0, 0.004, -abs(yp - y0) + 0.004) * sm(min(u, 1.0 - u) * 8.0);
  } else if (uKind == 10) {
    // a CRT switching on: a bright line, opening into the picture
    float open = sm((u - 0.2) / 0.55);
    float line = sm(u / 0.2);
    vec3 a = A(uv) * (1.0 - sm(u / 0.35));
    float h = max(open, 0.004);
    float dy = (uv.y - 0.5) / h;
    vec3 b = abs(dy) <= 0.5 ? B(vec2(uv.x, 0.5 + dy)) * (1.0 + 2.5 * (1.0 - open)) : vec3(0.0);
    float glow = line * (1.0 - open) * exp(-abs(uv.y - 0.5) * uRes.y / uPx / 3.0);
    c = a + b + uEdge * glow * uEdgeI;
  } else if (uKind == 11) {
    // a CRT switching off: the picture collapses to a line, the line to a point, and is gone
    float squash = sm(u / 0.45), shrink = sm((u - 0.4) / 0.25);
    float h = max(1.0 - squash, 0.003), wd = max(1.0 - shrink, 0.002);
    vec2 d = vec2((uv.x - 0.5) / wd, (uv.y - 0.5) / h);
    vec3 a = (abs(d.x) <= 0.5 && abs(d.y) <= 0.5) ? A(0.5 + d) * (1.0 + 2.0 * squash) : vec3(0.0);
    a *= 1.0 - sm((u - 0.6) / 0.15);
    c = a + B(uv) * sm((u - 0.5) / 0.5);
  } else if (uKind == 12) {
    // melt: the old picture slides down like a sheet of wet paint, a few streaks of it hanging
    // back where it sticks; the new one is behind it
    float e = pow(ioc(u), 1.5);
    float xb = uv.x * 64.0 + uSeed * 13.0;
    float id = floor(xb), fx = fract(xb);
    float h = h21(vec2(id, 1.7));
    float streak = h > 0.55 ? sm(fx / 0.3) * sm((1.0 - fx) / 0.3) * (h - 0.55) / 0.45 : 0.0;
    float sag = 0.06 * vn(vec2(uv.x * 9.0 + uSeed, 2.0));
    float off = e * (1.2 + sag) * (1.0 - 0.6 * streak);
    vec2 ua = vec2(uv.x, uv.y + off);
    if (ua.y <= 1.0) {
      // the sheet's upper edge is darker and wet
      float lip = 1.0 - ua.y;
      c = A(ua) * (1.0 - 0.35 * exp(-lip * uRes.y / uPx / 6.0) * sm(u * 6.0));
    } else c = B(uv);
  } else {
    // dissolve
    c = mix(A(uv), B(uv), sm(u));
  }
  o = vec4(c, 1.0);
}`;

const OUT_FS = `#version 300 es
precision highp float;
in vec2 vUv; uniform sampler2D uSrc; out vec4 o;
float h(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
void main(){
  vec3 s = texture(uSrc, vUv).rgb;
  // a dither that holds still: it keeps dark gradients from banding without spending the
  // encoder's bits on noise that changes every frame
  float n = h(gl_FragCoord.xy) + h(gl_FragCoord.yx * 1.3 + 7.0) - 1.0;
  o = vec4(clamp(s + n / 255.0, 0.0, 1.0), 1.0);
}`;

export const LOOKS = { night: 0, dawn: 1, paper: 2, thermal: 3, blueprint: 4, riso: 5, crt: 6 } as const;
export type Look = keyof typeof LOOKS;

export type PostParams = {
  bloom: number;        // gain
  threshold: number;    // linear level where light starts to spill
  knee: number;
  exposure: number;
  flash: number;        // 0..1 towards flashColor
  flashColor: number[];
  fade: number;         // 0..1 to black
  lift: number[];
  look: Look;           // the medium the shot is seen in
  tint: number[];       // the look's colour: a CRT's phosphor, the riso's first ink (display values)
  ground: number[];     // the look's ground: blueprint blue, riso paper (display values)
  screen: number[];     // riso: the halftone screen's offset (px), to follow the picture's motion
};

export const defaultPost = (): PostParams => ({
  bloom: 0.22, threshold: 1.0, knee: 0.4, exposure: 1, flash: 0, flashColor: [1, 1, 1], fade: 0, lift: [0, 0, 0],
  look: 'night', tint: [1.0, 0.28, 0.58], ground: [0.055, 0.21, 0.43], screen: [0, 0],
});

export const KINDS = { dissolve: 1, zoom: 2, push: 3, wipe: 4, iris: 5, ink: 6, light: 7, white: 8, flap: 9, crton: 10, crtoff: 11, melt: 12 } as const;
export type Kind = keyof typeof KINDS;

/** how one shot becomes the next; at and dir are in the picture's pixels, y down */
export type Transition = {
  kind: Kind;
  dur: number;           // seconds
  bias?: number;         // share of the transition before the cut point (default 0.5)
  at?: [number, number]; // zoom, iris: the point
  dir?: [number, number];// push, wipe: the direction of travel
  edge?: number[];       // display colour of the edge or flash
  edgeI?: number;        // its strength
  seed?: number;
};

export class Post {
  acc: Target;
  bright: Target;
  down: Target[] = [];
  up: Target[] = [];
  gradeA: Target;
  gradeB: Target;
  comp: Target;
  out: Target;
  scale: number;
  private pAcc: Prog; private pBright: Prog; private pDown: Prog; private pUp: Prog;
  private pGrade: Prog; private pComp: Prog; private pOut: Prog;
  private vao: WebGLVertexArrayObject;
  constructor(public gl: WebGL2RenderingContext, public w: number, public h: number) {
    this.scale = h / 1080;
    this.acc = makeTarget(gl, w, h, 'f16');
    this.gradeA = makeTarget(gl, w, h, 'f16');
    this.gradeB = makeTarget(gl, w, h, 'f16');
    this.comp = makeTarget(gl, w, h, 'f16');
    this.out = makeTarget(gl, w, h, 'u8');
    let bw = Math.floor(w / 2), bh = Math.floor(h / 2);
    this.bright = makeTarget(gl, bw, bh, 'f16');
    for (let i = 0; i < 6; i++) {
      bw = Math.max(2, Math.floor(bw / 2)); bh = Math.max(2, Math.floor(bh / 2));
      this.down.push(makeTarget(gl, bw, bh, 'f16'));
      this.up.push(makeTarget(gl, bw, bh, 'f16'));
    }
    this.pAcc = compile(gl, FS_VS, ACC_FS, 'acc');
    this.pBright = compile(gl, FS_VS, BRIGHT_FS, 'bright');
    this.pDown = compile(gl, FS_VS, DOWN_FS, 'down');
    this.pUp = compile(gl, FS_VS, UP_FS, 'up');
    this.pGrade = compile(gl, FS_VS, GRADE_FS, 'grade');
    this.pComp = compile(gl, FS_VS, COMP_FS, 'comp');
    this.pOut = compile(gl, FS_VS, OUT_FS, 'out');
    this.vao = gl.createVertexArray()!;
  }

  private pass(p: Prog, target: Target | null, bind: () => void) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
    gl.viewport(0, 0, target ? target.w : this.w, target ? target.h : this.h);
    gl.useProgram(p.p);
    bind();
    gl.bindVertexArray(this.vao);
    drawFS(gl);
  }

  private tex(unit: number, t: WebGLTexture, loc: WebGLUniformLocation | null) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.uniform1i(loc, unit);
  }

  clearAcc() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.acc.fb);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  /** add a resolved sub-frame into the accumulator with weight w */
  accumulate(src: WebGLTexture, w: number) {
    const gl = this.gl;
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.STENCIL_TEST);
    gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE);
    this.pass(this.pAcc, this.acc, () => { this.tex(0, src, this.pAcc.u.uSrc); this.gl.uniform1f(this.pAcc.u.uW, w); });
    gl.disable(gl.BLEND);
  }

  /** bloom, tone and look from the HDR picture `src` into `target` (display values) */
  grade(src: WebGLTexture, pp: PostParams, time: number, target: Target) {
    const gl = this.gl;
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.disable(gl.STENCIL_TEST);
    const B = this.bright;
    this.pass(this.pBright, B, () => {
      this.tex(0, src, this.pBright.u.uSrc);
      gl.uniform2f(this.pBright.u.uTexel, 1 / this.w, 1 / this.h);
      gl.uniform1f(this.pBright.u.uThresh, pp.threshold);
      gl.uniform1f(this.pBright.u.uKnee, pp.knee);
    });
    let prev: Target = B;
    for (const d of this.down) {
      const s = prev;
      this.pass(this.pDown, d, () => { this.tex(0, s.tex, this.pDown.u.uSrc); gl.uniform2f(this.pDown.u.uTexel, 1 / s.w, 1 / s.h); });
      prev = d;
    }
    // upsample: up[i] = down[i] + blur(up[i+1]); each wider level adds less, so the glow stays near what glows
    for (let i = this.down.length - 1; i >= 0; i--) {
      const lower = i === this.down.length - 1 ? this.down[i] : this.up[i + 1];
      const base = this.down[i];
      this.pass(this.pUp, this.up[i], () => {
        this.tex(0, lower.tex, this.pUp.u.uSrc);
        this.tex(1, base.tex, this.pUp.u.uPrev);
        gl.uniform2f(this.pUp.u.uTexel, 1 / lower.w, 1 / lower.h);
        gl.uniform1f(this.pUp.u.uMix, i === this.down.length - 1 ? 0.0 : 0.55);
      });
    }
    this.pass(this.pGrade, target, () => {
      const u = this.pGrade.u;
      this.tex(0, src, u.uSrc);
      this.tex(1, this.up[0].tex, u.uBloom);
      gl.uniform1f(u.uBloomGain, pp.bloom);
      gl.uniform1f(u.uExposure, pp.exposure);
      gl.uniform1f(u.uFlash, pp.flash);
      gl.uniform3fv(u.uFlashColor, pp.flashColor);
      gl.uniform1f(u.uFade, pp.fade);
      gl.uniform3fv(u.uLift, pp.lift);
      gl.uniform1i(u.uLook, LOOKS[pp.look] ?? 0);
      gl.uniform3fv(u.uTint, pp.tint);
      gl.uniform3fv(u.uGround, pp.ground);
      gl.uniform2f(u.uScreen, pp.screen[0] || 0, pp.screen[1] || 0);
      gl.uniform2f(u.uRes, this.w, this.h);
      gl.uniform1f(u.uPx, this.scale);
      gl.uniform1f(u.uTime, time);
    });
  }

  /** join two graded pictures at progress u of the transition */
  composite(a: WebGLTexture, b: WebGLTexture, tr: Transition, u: number, target: Target) {
    const gl = this.gl;
    this.pass(this.pComp, target, () => {
      const v = this.pComp.u;
      this.tex(0, a, v.uA);
      this.tex(1, b, v.uB);
      gl.uniform1i(v.uKind, KINDS[tr.kind] ?? 1);
      gl.uniform1f(v.uU, u);
      const at = tr.at || [960, 540];
      gl.uniform2f(v.uP, at[0] / 1920, 1 - at[1] / 1080);
      // push travels one whole frame along its axis; wipe only needs the direction
      const dir = tr.dir || [1, 0];
      if (tr.kind === 'push') {
        const ax = Math.abs(dir[0]) >= Math.abs(dir[1]);
        gl.uniform2f(v.uDir, ax ? Math.sign(dir[0]) : 0, ax ? 0 : -Math.sign(dir[1]));
      } else gl.uniform2f(v.uDir, dir[0], -dir[1]);
      gl.uniform3fv(v.uEdge, tr.edge || [1, 0.92, 0.8]);
      gl.uniform1f(v.uEdgeI, tr.edgeI ?? 1);
      gl.uniform2f(v.uRes, this.w, this.h);
      gl.uniform1f(v.uPx, this.scale);
      gl.uniform1f(v.uSeed, tr.seed ?? 3.7);
    });
  }

  /** the graded picture to 8 bits, into the canvas (target null) or into this.out */
  output(src: WebGLTexture, toOut: boolean) {
    this.pass(this.pOut, toOut ? this.out : null, () => this.tex(0, src, this.pOut.u.uSrc));
  }
}
