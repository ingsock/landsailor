// The engine: one function turns a frame number into a picture. A frame is the average of
// sub-frames spread over the shutter. Near a cut, the shot before and the shot after are both
// drawn, each still moving in its own time, graded each in its own look, and joined by the
// transition the edit gives the cut.
import { Camera } from './camera';
import { Draw } from './draw';
import { Canvas3, H, W } from './gl';
import { PostParams, Post, Transition, defaultPost } from './post';
import { Fonts } from './text';

export const FPS = 60;
/** the one rounding from seconds to frames, used everywhere */
export const frameOf = (t: number) => Math.round(t * FPS);
export const timeOf = (f: number) => f / FPS;

export type Frame = { t: number; frame: number };
export type ShotFrame = Frame & {
  /** seconds since the shot began, and the shot's length */
  lt: number; dur: number;
  /** progress through the shot: 0..1 inside it, beyond either end during its transitions */
  p: number;
  shot: Shot;
};

export interface Ctx {
  gl: WebGL2RenderingContext;
  d: Draw;
  fonts: Fonts;
  tex: Map<string, WebGLTexture>;
  data: Map<string, any>;
  /** clear the canvas to a colour (linear) */
  clear(c: [number, number, number, number] | [number, number, number]): void;
}

export abstract class Scene {
  ctx!: Ctx;
  /** load and build what the scene needs; called once */
  async init(): Promise<void> {}
  /** draw one sub-frame; may return post-processing overrides */
  abstract draw(f: ShotFrame): Partial<PostParams> | void;
}

export type Shot = {
  name: string;
  /** song seconds; snapped to frames by the engine */
  start: number;
  end: number;
  scene: Scene;
  params?: Record<string, any>;
  /** how the shot before becomes this one (none: a cut) */
  tin?: Transition;
  /** the shot's look and grade, under whatever its scene returns */
  grade?: Partial<PostParams>;
};

type Layers = { a: Shot; b?: Shot; tr?: Transition; u?: number };

export class Engine {
  gl: WebGL2RenderingContext;
  d!: Draw;
  fonts!: Fonts;
  canvas3!: Canvas3;
  post!: Post;
  shots: Shot[] = [];
  ctx!: Ctx;
  physW: number;
  physH: number;
  lastPost: PostParams = defaultPost();
  bg: [number, number, number] = [0.003, 0.004, 0.009];

  constructor(public canvas: HTMLCanvasElement, public scale = 1) {
    this.physW = Math.round(W * scale);
    this.physH = Math.round(H * scale);
    canvas.width = this.physW;
    canvas.height = this.physH;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 unavailable');
    if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('EXT_color_buffer_float unavailable');
    gl.getExtension('OES_texture_float_linear');
    this.gl = gl;
  }

  async init() {
    const gl = this.gl;
    this.d = new Draw(gl, this.physW, this.physH);
    this.fonts = await Fonts.init(this.d);
    this.canvas3 = new Canvas3(gl, this.physW, this.physH, 8);
    this.post = new Post(gl, this.physW, this.physH);
    const self = this;
    this.ctx = {
      gl, d: this.d, fonts: this.fonts, tex: new Map(), data: new Map(),
      clear(c) {
        self.d.flush();
        const g = self.gl;
        g.bindFramebuffer(g.FRAMEBUFFER, self.canvas3.fb);
        g.clearColor(c[0], c[1], c[2], 1);
        g.clear(g.COLOR_BUFFER_BIT);
      },
    };
  }

  setShots(shots: Shot[]) {
    this.shots = shots.slice().sort((a, b) => a.start - b.start);
    for (const s of this.shots) s.scene.ctx = this.ctx;
  }

  shotAtFrame(n: number): Shot | null {
    let lo = 0, hi = this.shots.length - 1, best: Shot | null = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (frameOf(this.shots[mid].start) <= n) { best = this.shots[mid]; lo = mid + 1; } else hi = mid - 1;
    }
    if (best && n < frameOf(best.end)) return best;
    return null;
  }

  private drawSub(shot: Shot | null, t: number, frame: number): Partial<PostParams> | void {
    const gl = this.gl;
    this.canvas3.clear(this.bg[0], this.bg[1], this.bg[2]);
    this.d.setCamera(Camera.home());
    this.d.setModel(null);
    this.d.depth(false);
    if (!shot) return;
    const start = timeOf(frameOf(shot.start)), end = timeOf(frameOf(shot.end));
    const dur = end - start;
    const lt = t - start;
    const r = shot.scene.draw({ t, frame, lt, dur, p: dur > 0 ? lt / dur : 0, shot });
    this.d.flush();
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.DEPTH_TEST);
    return r;
  }

  /** the window of a transition into `s`: [from, from + dur) */
  private window(s: Shot): [number, number] | null {
    if (!s.tin || s.tin.dur <= 0) return null;
    const from = timeOf(frameOf(s.start)) - (s.tin.bias ?? 0.5) * s.tin.dur;
    return [from, from + s.tin.dur];
  }

  /** what is on screen at t: one shot, or two and the transition between them */
  layersAt(t: number): Layers | null {
    const s = this.shotAtFrame(frameOf(t));
    if (!s) return null;
    const i = this.shots.indexOf(s);
    const win = this.window(s);
    if (win && i > 0 && t >= win[0] && t < win[1]) return { a: this.shots[i - 1], b: s, tr: s.tin, u: (t - win[0]) / (win[1] - win[0]) };
    const next = this.shots[i + 1];
    const wn = next ? this.window(next) : null;
    if (next && wn && t >= wn[0] && t < wn[1]) return { a: s, b: next, tr: next.tin, u: (t - wn[0]) / (wn[1] - wn[0]) };
    return { a: s };
  }

  /** draw one shot at frame n, motion-blurred, and grade it into `target` */
  private layer(shot: Shot, n: number, samples: number, shutter: number, target: import('./gl').Target): PostParams {
    const t = timeOf(n);
    // the scene's grade, then the edit's look over it
    let pp: PostParams = defaultPost();
    const over = shot.grade || {};
    if (samples <= 1) {
      const r = this.drawSub(shot, t, n);
      this.canvas3.resolve();
      pp = { ...pp, ...(r || {}), ...over };
      this.post.grade(this.canvas3.resolved.tex, pp, t, target);
      return pp;
    }
    const lo = t - (shutter / FPS) / 2, hi = t + (shutter / FPS) / 2;
    this.post.clearAcc();
    let centre: Partial<PostParams> | void = undefined;
    for (let i = 0; i < samples; i++) {
      const ts = lo + (hi - lo) * ((i + 0.5) / samples);
      const r = this.drawSub(shot, ts, n);
      if (i === Math.floor(samples / 2)) centre = r;
      this.canvas3.resolve();
      this.post.accumulate(this.canvas3.resolved.tex, 1 / samples);
    }
    pp = { ...pp, ...(centre || {}), ...over };
    this.post.grade(this.post.acc.tex, pp, t, target);
    return pp;
  }

  /** render frame n as the average of `samples` sub-frames over `shutter` (fraction of a frame) */
  render(n: number, samples = 1, shutter = 0.5, toOut = false) {
    const t = timeOf(n);
    this.d.stats = { lines: 0, fills: 0, dots: 0, calls: 0 };
    const L = this.layersAt(t);
    if (!L) {
      this.drawSub(null, t, n);
      this.canvas3.resolve();
      this.post.grade(this.canvas3.resolved.tex, defaultPost(), t, this.post.gradeA);
      this.post.output(this.post.gradeA.tex, toOut);
      return;
    }
    this.lastPost = this.layer(L.a, n, samples, shutter, this.post.gradeA);
    if (L.b && L.tr) {
      const pb = this.layer(L.b, n, samples, shutter, this.post.gradeB);
      if ((L.u ?? 0) >= 0.5) this.lastPost = pb;
      this.post.composite(this.post.gradeA.tex, this.post.gradeB.tex, L.tr, L.u ?? 0, this.post.comp);
      this.post.output(this.post.comp.tex, toOut);
    } else this.post.output(this.post.gradeA.tex, toOut);
  }

  /** RGBA8 pixels of the last render made with toOut = true (bottom-up rows) */
  readOut(buf?: Uint8Array): Uint8Array {
    const gl = this.gl;
    const px = buf || new Uint8Array(this.physW * this.physH * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.post.out.fb);
    gl.readPixels(0, 0, this.physW, this.physH, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return px;
  }

  /** copy the out target to the visible canvas */
  present() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.post.out.fb);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    gl.blitFramebuffer(0, 0, this.physW, this.physH, 0, 0, this.physW, this.physH, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
  }
}
