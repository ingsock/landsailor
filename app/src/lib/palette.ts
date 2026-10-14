// The film's colours are the colours of lights at night, and at dawn the colours of ink on paper.
// Everything is linear RGB; lights are given an intensity, and above 1 they spill (bloom).
import { RGBA, hex } from '../engine/math';

export const NIGHT = {
  sky: hex('#03050b'),
  ground: hex('#060a14'),
  /** the street grid before the lights: barely there */
  plan: hex('#1a2440'),
  /** glass of a letter that is not lit yet */
  glass: hex('#202a3f'),
  glassHi: hex('#2c3854'),
  /** annotation type */
  note: hex('#8d98b3'),
  noteDim: hex('#4c5670'),
  hair: hex('#34405c'),
};

/** kinds of light, each the colour of a real lamp */
export const LIGHT = {
  sodium: '#ff9f3a',     // high-pressure sodium street lamps
  sodiumLow: '#ff5a1e',  // a sodium lamp warming up starts red-pink
  halide: '#e9f0ff',     // metal halide / white LED
  filament: '#ffd7a3',   // incandescent
  filamentLow: '#ff7a24',
  tail: '#ff3b30',       // tail lights, aviation obstruction lights
  taxi: '#4f7dff',       // taxiway edge lights
  monitor: '#5dffa8',    // a heart monitor's trace
  fluoro: '#eef6ff',     // fluorescent tube
  lightning: '#f1f4ff',
};

export const L = (name: keyof typeof LIGHT, intensity = 1, alpha = 1): RGBA => hex(LIGHT[name], intensity, alpha);

export const DAY = {
  paper: hex('#efebe2'),
  paperShade: hex('#e2ddd2'),
  ink: hex('#141821'),
  inkSoft: hex('#4a5060'),
  rule: hex('#b9b4aa'),
  sodiumInk: hex('#c4670f'),
  tailInk: hex('#b8261c'),
  taxiInk: hex('#2747a8'),
};
