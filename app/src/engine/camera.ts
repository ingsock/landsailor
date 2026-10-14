// The camera. World space is the screen's: x right, y down, z away from the viewer, in pixels of
// a 1920x1080 frame. The home camera sees exactly that frame drawn at z = 0.
import { H, W } from './gl';
import { M4, V3, add, cross, dot, norm, scl, sub } from './math';

export const HOME_DIST = 1600;

export class Camera {
  pos: V3 = [W / 2, H / 2, -HOME_DIST];
  target: V3 = [W / 2, H / 2, 0];
  roll = 0;
  /** vertical field of view in radians */
  fov = 2 * Math.atan(H / 2 / HOME_DIST);
  near = 2;
  far = 200000;
  /** screen-space offset of the principal point, in pixels (for shake / reframing) */
  shift: [number, number] = [0, 0];

  static home(): Camera { return new Camera(); }

  /** a camera looking at point `at` from direction (yaw, pitch) at distance d; yaw/pitch in radians.
   *  pitch > 0 looks down onto a ground plane lying in x/z... but our charts lie in x/y, so: pitch tilts about x. */
  static orbit(at: V3, d: number, yaw: number, pitch: number, roll = 0, fov?: number): Camera {
    const c = new Camera();
    // start from looking along +z, rotate by pitch (about x) then yaw (about y)
    const cp = Math.cos(pitch), sp = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw);
    // forward vector
    const f: V3 = [sy * cp, sp, cy * cp];
    c.target = at;
    c.pos = sub(at, scl(f, d));
    c.roll = roll;
    if (fov) c.fov = fov;
    return c;
  }

  basis(): { r: V3; d: V3; f: V3 } {
    const f = norm(sub(this.target, this.pos));
    let up: V3 = [0, -1, 0];
    // looking straight down at the ground: north (+z) is up on the screen
    if (Math.abs(dot(f, up)) > 0.999) up = [0, 0, 1];
    let r = norm(cross(f, up));
    let d = cross(f, r);
    if (this.roll) {
      const c = Math.cos(this.roll), s = Math.sin(this.roll);
      const r2 = add(scl(r, c), scl(d, s));
      const d2 = add(scl(d, c), scl(r, -s));
      r = r2; d = d2;
    }
    return { r, d, f };
  }

  viewProj(aspect = W / H): M4 {
    const { r, d, f } = this.basis();
    const p = this.pos;
    const fl = 1 / Math.tan(this.fov / 2);
    const n = this.near, fa = this.far;
    const A = (fa + n) / (fa - n), B = (-2 * fa * n) / (fa - n);
    const tx = -dot(r, p), ty = -dot(d, p), tz = -dot(f, p);
    const sx = fl / aspect, sy = -fl;
    const ox = (this.shift[0] / (W / 2)), oy = -(this.shift[1] / (H / 2));
    // rows of P*V written column-major
    const m = new Float32Array(16);
    // clip.x = sx*vx + ox*vz ; clip.y = sy*vy + oy*vz ; clip.z = A*vz + B ; clip.w = vz
    const row = (a: V3, at: number, b: V3, bt: number, ka: number, kb: number): [number, number, number, number] => [
      ka * a[0] + kb * b[0], ka * a[1] + kb * b[1], ka * a[2] + kb * b[2], ka * at + kb * bt,
    ];
    const rx = row(r, tx, f, tz, sx, ox);
    const ry = row(d, ty, f, tz, sy, oy);
    const rz: [number, number, number, number] = [A * f[0], A * f[1], A * f[2], A * tz + B];
    const rw: [number, number, number, number] = [f[0], f[1], f[2], tz];
    for (let c = 0; c < 4; c++) { m[c * 4 + 0] = rx[c]; m[c * 4 + 1] = ry[c]; m[c * 4 + 2] = rz[c]; m[c * 4 + 3] = rw[c]; }
    return m;
  }

  /** project a world point to screen pixels (x, y) and depth (view z) */
  project(p: V3): [number, number, number] {
    const m = this.viewProj();
    const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
    const y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
    const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
    return [(x / w * 0.5 + 0.5) * W, (1 - (y / w * 0.5 + 0.5)) * H, w];
  }

  clone(): Camera {
    const c = new Camera();
    c.pos = [...this.pos] as V3; c.target = [...this.target] as V3; c.roll = this.roll; c.fov = this.fov;
    c.near = this.near; c.far = this.far; c.shift = [...this.shift] as [number, number];
    return c;
  }
}

/** blend two cameras (positions and targets linearly, roll and fov linearly) */
export function mixCam(a: Camera, b: Camera, t: number): Camera {
  const c = new Camera();
  const L = (x: number, y: number) => x + (y - x) * t;
  c.pos = [L(a.pos[0], b.pos[0]), L(a.pos[1], b.pos[1]), L(a.pos[2], b.pos[2])];
  c.target = [L(a.target[0], b.target[0]), L(a.target[1], b.target[1]), L(a.target[2], b.target[2])];
  c.roll = L(a.roll, b.roll);
  c.fov = L(a.fov, b.fov);
  c.shift = [L(a.shift[0], b.shift[0]), L(a.shift[1], b.shift[1])];
  return c;
}
