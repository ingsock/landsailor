// The edit: which scene owns which stretch of the song. Times come from the song's clock (Score):
// lyric words found by their text, bars by number. No time is written here as a number except
// the length of the recording.
import { Ctx, Shot } from './engine/engine';
import { Score } from './engine/score';
import { PostParams, Transition } from './engine/post';
import { Plan } from './scenes/plan';
import { Smoke } from './scenes/smoke';
import { TradeRoad } from './scenes/traderoad';
import { Runway } from './scenes/runway';
import { Board } from './scenes/board';
import { Earth } from './scenes/earth';
import { Facade } from './scenes/facade';
import { Hours } from './scenes/hours';
import { Energy } from './scenes/energy';
import { Born } from './scenes/born';
import { Wheel } from './scenes/wheel';
import { Aisle } from './scenes/aisle';
import { Kings } from './scenes/kings';
import { Field } from './scenes/field';
import { Malthus } from './scenes/malthus';
import { Skyline } from './scenes/skyline';
import { Storm } from './scenes/storm';
import { Blackout } from './scenes/blackout';
import { Racks } from './scenes/racks';
import { Progress } from './scenes/progress';
import { Split } from './scenes/split';
import { Mind } from './scenes/mind';
import { Relight } from './scenes/relight';
import { Bridge } from './scenes/bridge';
import { Outro1 } from './scenes/outro1';
import { Outro2 } from './scenes/outro2';
import { Outro3 } from './scenes/outro3';

export const DURATION = 225.5;

export async function loadAssets(ctx: Ctx) {
  ctx.data.set('charts', await (await fetch('/data/charts.json')).json());
}

/** shots of the dark bridge, cut where each wordless phrase begins */
function darkShots(s: Score, scene: Shot['scene']): Shot[] {
  const phrases: [number, number][] = [];
  for (const [a, b] of s.vocalise) {
    const last = phrases[phrases.length - 1];
    if (last && a - last[1] < 0.5) last[1] = b; else phrases.push([a, b]);
  }
  // after the last phrase, one more view a bar before the lightning, low among the dark streets
  const cuts = [s.barTime(55), ...phrases.map((p) => p[0]), phrases[phrases.length - 1][1] + 1.2, s.barTime(64), s.barTime(65)];
  return cuts.slice(0, -1).map((c, i) => ({ name: `dark-${i}`, start: c, end: cuts[i + 1], scene, params: { part: 'dark', view: i } }));
}

export function buildEdit(s: Score): Shot[] {
  const w = (q: string, word: string | number, n = 0) => s.word(q, word, n).start;
  const vox = s.line('Landsailor').start;
  const plan = new Plan();
  const trade = new TradeRoad();
  const runway = new Runway();
  const earth = new Earth();
  const hours = new Hours();
  const born = new Born();
  const wheel = new Wheel();
  const field = new Field();
  const skyline = new Skyline();
  const storm = new Storm();
  const blackout = new Blackout();
  const bridge = new Bridge();
  const relight = new Relight();
  const racks = new Racks();
  const progress = new Progress();
  const split = new Split();
  const mind = new Mind();
  const outro1 = new Outro1();
  const outro2 = new Outro2();
  const outro3 = new Outro3();
  const shots: Shot[] = [
    // the opening in three views, cut where the lamps begin (bar 3) and where the traffic is lit (bar 5)
    { name: 'plan-a', start: 0, end: s.barTime(3), scene: plan, params: { view: 0 } },
    { name: 'plan-b', start: s.barTime(3), end: s.barTime(5), scene: plan, params: { view: 1 } },
    { name: 'plan-c', start: s.barTime(5), end: vox, scene: plan, params: { view: 2 } },
    { name: 'road-landsailor', start: vox, end: s.line('sail on time').start, scene: trade, params: { part: 1 } },
    { name: 'road-sail', start: s.line('sail on time').start, end: s.line('Rain or shine').start, scene: trade, params: { part: 2 } },
    { name: 'road-sign', start: s.line('Rain or shine').start, end: w('Rain or shine', 'can') + 0.6, scene: trade, params: { part: 3 } },
    { name: 'road-chart', start: w('Rain or shine', 'can') + 0.6, end: s.line('Cloudraker').start, scene: trade, params: { part: 4 } },
    { name: 'approach', start: s.line('Cloudraker').start, end: s.line('share your finds').start, scene: runway, params: { part: 1 } },
    { name: 'takeoff', start: s.line('share your finds').start, end: s.line('All your wonders').start, scene: runway, params: { part: 2 } },
    { name: 'board', start: s.line('All your wonders').start, end: w('All your wonders', 'at'), scene: new Board() },
    { name: 'routes', start: w('All your wonders', 'at'), end: s.line('Lightbringer').start, scene: earth, params: { part: 'routes' } },
    { name: 'lightbringer', start: s.line('Lightbringer').start, end: s.line('Tamer of night').start, scene: earth, params: { part: 'light' } },
    { name: 'tamer', start: s.line('Tamer of night').start, end: s.line('Blossom of hours').start, scene: new Facade() },
    { name: 'dial', start: s.line('Blossom of hours').start, end: s.line('lawbender').start, scene: hours, params: { part: 'dial' } },
    { name: 'wave', start: s.line('lawbender').start, end: s.line('Safe from').start, scene: hours, params: { part: 'wave' } },
    { name: 'safe', start: s.line('Safe from').start, end: s.line('Your power').start, scene: hours, params: { part: 'safe' } },
    { name: 'energy', start: s.line('Your power').start, end: s.word('Your power', 'transformed').end + 0.35, scene: new Energy() },
    { name: 'here', start: s.word('Your power', 'transformed').end + 0.35, end: s.word("Here's where", 'born').end + 0.35, scene: born, params: { part: 'here' } },
    // the hundred births run across two shots, one span of years: close on the lights, then the chart
    { name: 'births-a', start: s.word("Here's where", 'born').end + 0.35, end: s.barTime(30), scene: born, params: { part: 'births', view: 0, span: [s.word("Here's where", 'born').end + 0.35, s.line('Landsailor', 2).start] } },
    { name: 'births-b', start: s.barTime(30), end: s.line('Landsailor', 2).start, scene: born, params: { part: 'births', view: 1, span: [s.word("Here's where", 'born').end + 0.35, s.line('Landsailor', 2).start] } },
    // the year's wheel, a view per line: the ring; down its face from the winter to June; spinning wide
    { name: 'wheel-a', start: s.line('Landsailor', 2).start, end: s.line('Deepwinter').start, scene: wheel, params: { view: 0 } },
    { name: 'wheel-b', start: s.line('Deepwinter').start, end: s.line('Endless summer').start, scene: wheel, params: { view: 1 } },
    { name: 'wheel-c', start: s.line('Endless summer').start, end: s.line('A vast preserve').start, scene: wheel, params: { view: 2 } },
    { name: 'aisle', start: s.line('A vast preserve').start, end: s.line('Every commoner').start, scene: new Aisle() },
    { name: 'kings', start: s.line('Every commoner').start, end: s.line('Earthbreaker').start, scene: new Kings() },
    { name: 'plough', start: s.line('Earthbreaker').start, end: s.line('Noble and prized').start, scene: field, params: { part: 'plough' } },
    { name: 'yields', start: s.line('Noble and prized').start, end: s.line('Feed me beyond').start, scene: field, params: { part: 'yields' } },
    { name: 'malthus', start: s.line('Feed me beyond').start, end: s.line('Hello, worldmaker').start, scene: new Malthus() },
    { name: 'urban', start: s.line('Hello, worldmaker').start, end: s.line('Build all my').start, scene: skyline, params: { part: 'urban' } },
    { name: 'cities', start: s.line('Build all my').start, end: s.line('storm outside').start, scene: skyline, params: { part: 'cities' } },
    { name: 'storm', start: s.line('storm outside').start, end: s.line('child no more').start, scene: storm, params: { part: 'storm' } },
    { name: 'child', start: s.line('child no more').start, end: s.barTime(55), scene: storm, params: { part: 'child' } },
    // the dark bridge: a new view of the unlit city as each wordless phrase begins
    ...darkShots(s, bridge),
    // the lightning, then the lines it showed, from three places as the music builds
    { name: 'lines-flash', start: s.barTime(65), end: s.barTime(67), scene: blackout, params: { part: 'lines', view: 0 } },
    { name: 'lines-low', start: s.barTime(67), end: s.barTime(69), scene: blackout, params: { part: 'lines', view: 1 } },
    { name: 'lines-rise', start: s.barTime(69), end: s.line('Headless').start, scene: blackout, params: { part: 'lines', view: 2 } },
    { name: 'racks', start: s.line('Headless').start, end: s.line('Tireless').start, scene: racks, params: { part: 'racks' } },
    { name: 'wall-a', start: s.line('Tireless').start, end: w('Tireless and seamless', 'behind'), scene: racks, params: { part: 'wall', view: 0 } },
    { name: 'wall-b', start: w('Tireless and seamless', 'behind'), end: s.line('This is my progress').start, scene: racks, params: { part: 'wall', view: 1 } },
    { name: 'progress', start: s.line('This is my progress').start, end: s.line("don't notice").start, scene: progress, params: { part: 'grid' } },
    { name: 'unnoticed', start: s.line("don't notice").start, end: s.line('Split the world').start, scene: progress, params: { part: 'quiet' } },
    { name: 'split', start: s.line('Split the world').start, end: s.line('Delve ever deeper').start, scene: split, params: { part: 'split' } },
    { name: 'dive', start: s.line('Delve ever deeper').start, end: s.line('Crack the ciphers').start, scene: split, params: { part: 'dive' } },
    { name: 'cipher', start: s.line('Crack the ciphers').start, end: s.line('Your life, your heart').start, scene: mind, params: { part: 'cipher' } },
    { name: 'heart', start: s.line('Your life, your heart').start, end: s.line('Mmm').start, scene: mind, params: { part: 'heart' } },
    { name: 'relight-a', start: s.line('Mmm').start, end: s.word('Mmm', 1).start, scene: relight, params: { view: 0 } },
    { name: 'relight-b', start: s.word('Mmm', 1).start, end: s.barTime(89), scene: relight, params: { view: 1 } },
    { name: 'call', start: s.barTime(89), end: s.line('In the bed').start, scene: outro1, params: { part: 'call' } },
    { name: 'bed', start: s.line('In the bed').start, end: s.line('May every nail').start, scene: outro1, params: { part: 'bed' } },
    { name: 'nails', start: s.line('May every nail').start, end: s.line('Great lifebringer').start, scene: outro1, params: { part: 'nails' } },
    { name: 'lifebringer', start: s.line('Great lifebringer').start, end: s.line('The price').start, scene: outro2, params: { part: 'life' } },
    { name: 'price', start: s.line('The price').start, end: s.line('Time that you made').start, scene: outro2, params: { part: 'price' } },
    { name: 'known', start: s.line('Time that you made').start, end: s.line('I want to be your bride').start, scene: outro2, params: { part: 'known' } },
    { name: 'bride', start: s.line('I want to be your bride').start, end: s.line('Shield my eyes').start, scene: outro2, params: { part: 'bride' } },
    { name: 'sunrise', start: s.line('Shield my eyes').start, end: s.line('altered now for good').start, scene: outro3, params: { part: 'sunrise' } },
    { name: 'altered', start: s.line('altered now for good').start, end: s.line('Shield these eyes').start, scene: outro3, params: { part: 'altered' } },
    { name: 'last', start: s.line('Shield these eyes').start, end: DURATION, scene: outro3, params: { part: 'last' } },
  ];
  // how each shot comes in: the joins are part of the motion, never a stop and a cut
  const warm = [1, 0.86, 0.62], white = [0.9, 0.96, 1], inkC = [0.12, 0.13, 0.2];
  const joins: Record<string, Transition> = {
    'plan-b': { kind: 'dissolve', dur: 0.7 },
    'plan-c': { kind: 'dissolve', dur: 0.7 },
    'road-landsailor': { kind: 'dissolve', dur: 0.6 },
    'road-sail': { kind: 'dissolve', dur: 0.45 },
    'road-sign': { kind: 'dissolve', dur: 0.45 },
    'road-chart': { kind: 'dissolve', dur: 0.45 },
    'approach': { kind: 'zoom', dur: 0.6, edge: warm, edgeI: 0.8 },
    'takeoff': { kind: 'push', dur: 0.5, dir: [0, -1] },
    'board': { kind: 'flap', dur: 0.6 },
    'routes': { kind: 'zoom', dur: 0.55, edge: warm, edgeI: 0.9 },
    'lightbringer': { kind: 'dissolve', dur: 0.5 },
    'tamer': { kind: 'light', dur: 0.7 },
    // into the moon over the skyline, and the day's dial comes out of it
    'dial': { kind: 'zoom', dur: 0.5, at: [1585, 228], edge: warm, edgeI: 0.6 },
    'wave': { kind: 'ink', dur: 0.75, edge: [1, 0.85, 0.4], edgeI: 0.9, seed: 2.1 },
    'safe': { kind: 'push', dur: 0.5, dir: [0, 1] },
    'energy': { kind: 'wipe', dur: 0.75, dir: [1, 0], edge: white, edgeI: 1.2 },
    'here': { kind: 'push', dur: 0.5, dir: [1, 0] },
    'births-a': { kind: 'zoom', dur: 0.6, edge: warm, edgeI: 0.7 },
    'births-b': { kind: 'dissolve', dur: 0.45 },
    'wheel-a': { kind: 'ink', dur: 0.85, edge: [0.16, 0.2, 0.45], edgeI: 0.7, seed: 5.3 },
    'wheel-b': { kind: 'push', dur: 0.45, dir: [0, 1] },
    'wheel-c': { kind: 'zoom', dur: 0.5, edgeI: 0 },
    'aisle': { kind: 'push', dur: 0.5, dir: [1, 0] },
    'kings': { kind: 'wipe', dur: 0.6, dir: [0, -1], edge: [0.95, 0.3, 0.55], edgeI: 0.5 },
    'plough': { kind: 'push', dur: 0.45, dir: [0, 1] },
    'yields': { kind: 'dissolve', dur: 0.45 },
    'malthus': { kind: 'zoom', dur: 0.5, edgeI: 0 },
    'urban': { kind: 'ink', dur: 0.75, edge: inkC, edgeI: 0.8, seed: 8.8 },
    'cities': { kind: 'push', dur: 0.45, dir: [1, 0] },
    'storm': { kind: 'dissolve', dur: 0.6 },
    'child': { kind: 'dissolve', dur: 0.5 },
    'dark-0': { kind: 'dissolve', dur: 0.9 },
    'dark-1': { kind: 'dissolve', dur: 1.0 },
    // the candles in the city's windows become the hundred
    'dark-2': { kind: 'light', dur: 1.0 },
    'dark-3': { kind: 'dissolve', dur: 1.0 },
    'dark-4': { kind: 'dissolve', dur: 1.0 },
    'dark-5': { kind: 'dissolve', dur: 0.6 },
    // the strike: the dark goes white just before the hit, and the lines come out of the white
    'lines-flash': { kind: 'white', dur: 0.14, bias: 0.85, edge: [1, 1, 1] },
    'lines-low': { kind: 'zoom', dur: 0.5, edge: [0.5, 0.9, 1], edgeI: 0.5 },
    'lines-rise': { kind: 'dissolve', dur: 0.5 },
    'racks': { kind: 'wipe', dur: 0.7, dir: [0, 1], edge: white, edgeI: 1.2 },
    'wall-a': { kind: 'push', dur: 0.45, dir: [1, 0] },
    'wall-b': { kind: 'zoom', dur: 0.45, at: [1360, 520], edgeI: 0 },
    'progress': { kind: 'flap', dur: 0.6 },
    'unnoticed': { kind: 'dissolve', dur: 0.3 },
    'split': { kind: 'dissolve', dur: 0.4 },
    'dive': { kind: 'zoom', dur: 0.5, edge: warm, edgeI: 0.8 },
    'cipher': { kind: 'crton', dur: 0.6, edge: [1, 0.75, 0.35] },
    'heart': { kind: 'push', dur: 0.4, dir: [0, -1] },
    'relight-a': { kind: 'crtoff', dur: 0.6 },
    'relight-b': { kind: 'dissolve', dur: 0.5 },
    'call': { kind: 'dissolve', dur: 0.6 },
    'bed': { kind: 'wipe', dur: 0.6, dir: [0, -1], edge: warm, edgeI: 0.6 },
    'nails': { kind: 'dissolve', dur: 0.5 },
    'lifebringer': { kind: 'push', dur: 0.45, dir: [1, 0] },
    'price': { kind: 'melt', dur: 0.7, seed: 4.4 },
    'known': { kind: 'push', dur: 0.5, dir: [0, -1] },
    'bride': { kind: 'dissolve', dur: 0.6 },
    'sunrise': { kind: 'dissolve', dur: 0.6 },
    // through the flood of light, onto paper
    'altered': { kind: 'white', dur: 0.5, edge: [0.96, 0.94, 0.89] },
    // paper to paper, quietly: the chart goes and the first picture comes back
    'last': { kind: 'dissolve', dur: 0.9 },
  };
  // the media each part is seen in; the night is the default, and paper is kept for the end
  const thermal: Partial<PostParams> = { look: 'thermal' };
  const blueprint: Partial<PostParams> = { look: 'blueprint', ground: [0.055, 0.21, 0.43] };
  // in print, light that spills would be a smudge of dots
  const riso: Partial<PostParams> = { look: 'riso', ground: [0.95, 0.92, 0.86], tint: [1.0, 0.28, 0.58], bloom: 0 };
  const looks: Record<string, Partial<PostParams>> = {
    wave: thermal, safe: thermal,
    energy: blueprint, racks: blueprint, 'wall-a': blueprint, 'wall-b': blueprint,
    'wheel-a': riso, 'wheel-b': riso, 'wheel-c': riso, aisle: riso, kings: riso, plough: riso, yields: riso, malthus: riso,
    cipher: { look: 'crt', tint: [1.0, 0.66, 0.16] }, heart: { look: 'crt', tint: [0.36, 1.0, 0.55] },
    altered: { look: 'paper' }, last: { look: 'paper' },
  };
  for (const sh of shots) {
    if (joins[sh.name]) sh.tin = joins[sh.name];
    if (looks[sh.name]) sh.grade = looks[sh.name];
  }
  return shots;
}
