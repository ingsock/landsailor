// Engine smoke test: lines, fills, dots, text with per-letter light, a tilted plane.
import { Camera } from '../engine/camera';
import { Scene, ShotFrame } from '../engine/engine';
import { chain, hex, rotX, translate, mixc, prog, ease } from '../engine/math';
import { drawRun, setRun } from '../engine/text';

export class Smoke extends Scene {
  draw(f: ShotFrame) {
    const { d, fonts } = this.ctx;
    this.ctx.clear(hex('#05070d'));
    const cam = Camera.home();
    d.setCamera(cam);
    // a ground grid on a plane tilted back
    const plane = chain(translate(960, 700, 0), rotX(-1.15 + 0.1 * Math.sin(f.t)), translate(-960, -700, 0));
    d.setModel(plane);
    d.lineStyle({ blend: 'add' });
    for (let x = -2000; x <= 4000; x += 80) d.seg([x, -1500, 0], [x, 2500, 0], 1, hex('#ffb34a', 0.35));
    for (let y = -1500; y <= 2500; y += 80) d.seg([-2000, y, 0], [4000, y, 0], 1, hex('#ffb34a', 0.35));
    d.flush();
    d.setModel(null);
    // a chart line
    const pts: number[] = [];
    for (let i = 0; i <= 200; i++) {
      const x = 200 + i * 7.5;
      const y = 900 - 500 * (1 / (1 + Math.exp(-(i - 120) / 14)));
      pts.push(x, y, 0);
    }
    d.lineStyle({ blend: 'add', glow: 6 });
    d.poly(pts, 4, hex('#eef3ff', 1.6));
    d.lineStyle({ blend: 'add' });
    for (let i = 0; i < 40; i++) d.dot([200 + i * 37, 980, 0], 4, hex('#ffb34a', 2.0), 0.6);
    d.flush();
    // text
    const run = setRun(fonts, 'mona', 'LIGHTBRINGER', 220, { wdth: 125, wght: 900 }, -0.01);
    const lit = Math.floor((f.t * 3) % 13);
    drawRun(d, run, 960 - run.width / 2, 420, (i) => (i < lit ? hex('#fff4e0', 2.2) : hex('#2a3140', 1)), null, 'alpha');
    const small = setRun(fonts, 'passMono', 'SHARE OF THE WORLD WITH ELECTRICITY, 1998–2024', 22, { wght: 500 }, 0.06);
    drawRun(d, small, 200, 500, hex('#9aa6bd'));
    const ital = setRun(fonts, 'serifItalic', 'shield my eyes no more', 90, {});
    drawRun(d, ital, 200, 620, hex('#ffd9a0', 1.2));
    return { bloom: 0.6 };
  }
}
