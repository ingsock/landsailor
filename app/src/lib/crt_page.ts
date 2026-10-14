// A terminal's page of text drawn in one pass: the glyphs of a monospaced face are drawn once into
// an atlas (by the film's own shaper and fills), and a shader lays a grid of cells over a quad,
// each cell taking its glyph and its brightness from a small texture written every frame. Used by
// the cipher (verse 3, "Crack the ciphers"): a page of scrambled letters that decodes as it is read.
import { Camera } from '../engine/camera';
import { Draw } from '../engine/draw';
import { Canvas3, compile, Prog } from '../engine/gl';
import { M4 } from '../engine/math';
import { Fonts } from '../engine/text';
import { label } from './lyric';

export const CHARSET =
  ' ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,;:!?\'"-+=*/\\<>()[]{}#%&@$_|~^' + '█▒░·─│┌┐└┘▸';
/** the letters a cipher scrambles into */
export const CIPHER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&?*+=<>/\\[]{}@$~^';

const AT_COLS = 32, AT_W = 60, AT_H = 80, AT_SIZE = 56;

const VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 corner;
uniform mat4 uVP; uniform mat4 uModel; uniform vec2 uSize;
out vec2 vP;
void main(){
  vP = (corner * 0.5 + 0.5) * uSize;
  gl_Position = uVP * uModel * vec4(vP, 0.0, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
in vec2 vP;
uniform sampler2D uAtlas; uniform sampler2D uCells;
uniform vec2 uCell;      // cell size (px of the page)
uniform vec2 uGrid;      // cols, rows
uniform vec3 uColor;
uniform vec4 uAt;        // atlas: cols, cell w, cell h, atlas w
uniform vec2 uAtH;       // atlas h, glyph scale (glyph px per page px)
out vec4 o;
void main(){
  vec2 cell = floor(vP / uCell);
  if (cell.x < 0.0 || cell.y < 0.0 || cell.x >= uGrid.x || cell.y >= uGrid.y) discard;
  vec4 d = texelFetch(uCells, ivec2(cell), 0);
  float g = floor(d.r * 255.0 + 0.5), b = d.g;
  if (b <= 0.0 || g <= 0.0) discard;
  vec2 f = fract(vP / uCell);                 // within the cell, 0..1, y down
  // the glyph sits in its atlas slot centred; the slot is a little bigger than the cell
  vec2 slot = vec2(mod(g, uAt.x), floor(g / uAt.x));
  vec2 inSlot = vec2(0.5) + (f - 0.5) * uCell * uAtH.y / uAt.yz;
  if (inSlot.x < 0.0 || inSlot.x > 1.0 || inSlot.y < 0.0 || inSlot.y > 1.0) discard;
  vec2 uv = (slot + inSlot) * uAt.yz / vec2(uAt.w, uAtH.x);
  float a = texture(uAtlas, vec2(uv.x, 1.0 - uv.y)).r;
  // a block cell (inverse video) where the blue channel says so
  float inv = d.b;
  a = mix(a, 1.0 - a, inv);
  float v = a * b * 4.0;
  if (v <= 0.002) discard;
  o = vec4(uColor * v, 0.0);
}`;

export class Page {
  cols: number; rows: number;
  cell: [number, number];
  data: Uint8Array;
  private atlas: WebGLTexture;
  private cellTex: WebGLTexture;
  private prog: Prog;
  private vao: WebGLVertexArrayObject;
  private glyphScale: number;
  readonly index = new Map<string, number>();

  constructor(public d: Draw, fonts: Fonts, o: { cols: number; rows: number; cell: [number, number]; font?: string; weight?: number }) {
    const gl = d.gl;
    this.cols = o.cols; this.rows = o.rows; this.cell = o.cell;
    this.data = new Uint8Array(o.cols * o.rows * 4);
    for (let i = 0; i < CHARSET.length; i++) this.index.set(CHARSET[i], i);
    // the atlas: every glyph drawn once, white on black, by the same fills that draw all type
    const cv = new Canvas3(gl, 1920, 1080, 4);
    cv.clear(0, 0, 0);
    const prevCam = d.cam;
    d.setCamera(Camera.home());
    d.depth(false);
    for (let i = 0; i < CHARSET.length; i++) {
      const ch = CHARSET[i];
      if (ch === ' ') continue;
      const cx = (i % AT_COLS) * AT_W + AT_W / 2, cy = Math.floor(i / AT_COLS) * AT_H;
      if (ch === '█') { d.rect(cx - AT_W / 2, cy, AT_W, AT_H, [1, 1, 1, 1]); continue; }
      label(d, fonts, ch, cx, cy + AT_H * 0.74, AT_SIZE, [1, 1, 1, 1], { font: o.font || 'passMono', axes: { wght: o.weight ?? 600 }, align: 'center' });
    }
    d.flush();
    cv.resolve();
    this.atlas = cv.resolved.tex;
    gl.bindTexture(gl.TEXTURE_2D, this.atlas);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    d.setCamera(prevCam);
    // glyph px per page px: the atlas glyph was drawn at AT_SIZE for a cell AT_H high
    this.glyphScale = (AT_H / this.cell[1]) * 0.98;
    this.cellTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.cellTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, o.cols, o.rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    this.prog = compile(gl, VS, FS, 'crtPage');
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    const b = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.bindVertexArray(null);
  }

  /** set a cell: its character, brightness (0..1, up to 4x via the shader's gain) and inverse video */
  set(col: number, row: number, ch: string | number, bright: number, inv = false) {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return;
    const i = (row * this.cols + col) * 4;
    const g = typeof ch === 'number' ? ch : this.index.get(ch) ?? 0;
    this.data[i] = g;
    this.data[i + 1] = Math.max(0, Math.min(255, Math.round(bright * 255)));
    this.data[i + 2] = inv ? 255 : 0;
    this.data[i + 3] = 255;
  }
  clear() { this.data.fill(0); }

  /** draw the page with its top-left at the model's origin (page px), additive light */
  draw(model: M4, color: [number, number, number]) {
    const d = this.d, gl = d.gl, p = this.prog;
    d.flush();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.cellTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.cols, this.rows, gl.RGBA, gl.UNSIGNED_BYTE, this.data);
    gl.useProgram(p.p);
    gl.uniformMatrix4fv(p.u.uVP, false, d.vp);
    gl.uniformMatrix4fv(p.u.uModel, false, model);
    gl.uniform2f(p.u.uSize, this.cols * this.cell[0], this.rows * this.cell[1]);
    gl.uniform2f(p.u.uCell, this.cell[0], this.cell[1]);
    gl.uniform2f(p.u.uGrid, this.cols, this.rows);
    gl.uniform3f(p.u.uColor, color[0], color[1], color[2]);
    gl.uniform4f(p.u.uAt, AT_COLS, AT_W, AT_H, 1920);
    gl.uniform2f(p.u.uAtH, 1080, this.glyphScale);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlas);
    gl.uniform1i(p.u.uAtlas, 0);
    gl.uniform1i(p.u.uCells, 1);
    gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE);
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.disable(gl.STENCIL_TEST); gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    gl.activeTexture(gl.TEXTURE0);
    d.stats.calls++;
  }
}
