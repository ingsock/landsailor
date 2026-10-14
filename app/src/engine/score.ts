// The song's own clock: every lyric word as the voice sings it (data/lyrics.json, aligned to the
// vocal stem) and the beat grid (data/audio.json). Scenes find lines by their words, never by
// a time written into a scene.

export type Word = { w: string; start: number; end: number; conf: number; i: number; line: Line };
export type Line = { i: number; text: string; echo: boolean; start: number; end: number; words: Word[] };

export type AudioInfo = {
  duration: number;
  bpm: number;
  firstBeat: number;
  beats: number[];
  bars: number[];
  /** loudness envelope, 0..1, sampled every `envStep` seconds */
  envStep: number;
  env: { rms: number[]; vocal: number[]; low: number[]; high: number[] };
  onsets: { vocal: number[]; drums: number[]; bass: number[] };
};

export class Score {
  lines: Line[] = [];
  words: Word[] = [];
  /** wordless sung phrases (start, end) */
  vocalise: [number, number][] = [];
  audio!: AudioInfo;

  static async load(lyricsUrl: string, audioUrl: string): Promise<Score> {
    const s = new Score();
    const L = await (await fetch(lyricsUrl)).json();
    s.lines = L.lines.map((l: any, i: number) => {
      const line: Line = { i, text: l.text, echo: !!l.echo, start: l.start, end: l.end, words: [] };
      line.words = l.words.map((w: any, j: number) => ({ w: w.w, start: w.start, end: w.end, conf: w.conf, i: j, line }));
      return line;
    });
    s.words = s.lines.flatMap((l) => l.words);
    s.vocalise = L.vocalise || [];
    s.audio = await (await fetch(audioUrl)).json();
    return s;
  }

  /** the n-th line (0-based) whose text contains q (case-insensitive) */
  line(q: string, n = 0): Line {
    const k = q.toLowerCase();
    const hits = this.lines.filter((l) => l.text.toLowerCase().includes(k));
    if (!hits[n]) throw new Error(`no line "${q}" #${n}`);
    return hits[n];
  }

  /** the word in line(q, n) that matches w (by letters), or the i-th word */
  word(q: string, w: string | number, n = 0): Word {
    const l = this.line(q, n);
    if (typeof w === 'number') return l.words[w];
    const k = w.toLowerCase().replace(/[^a-z']/g, '');
    const hit = l.words.find((x) => x.w.toLowerCase().replace(/[^a-z']/g, '') === k);
    if (!hit) throw new Error(`no word "${w}" in "${l.text}"`);
    return hit;
  }

  lineAt(t: number, echo = false): Line | null {
    for (const l of this.lines) if (l.echo === echo && t >= l.start - 0.05 && t < l.end + 0.05) return l;
    return null;
  }

  beatAt(t: number): number { return (t - this.audio.firstBeat) / (60 / this.audio.bpm); }
  beatTime(b: number): number { return this.audio.firstBeat + b * (60 / this.audio.bpm); }
  /** bar n (1-based, as bars.py numbers them) */
  barTime(n: number): number { return this.audio.bars[n - 1] ?? this.beatTime((n - 1) * 4); }

  env(name: keyof AudioInfo['env'], t: number): number {
    const a = this.audio.env[name];
    const x = t / this.audio.envStep;
    const i = Math.floor(x);
    if (i < 0) return a[0] ?? 0;
    if (i >= a.length - 1) return a[a.length - 1] ?? 0;
    return a[i] + (a[i + 1] - a[i]) * (x - i);
  }

  /** a decaying pulse after each onset of `kind` (seconds half-life) */
  hit(kind: keyof AudioInfo['onsets'], t: number, half = 0.12): number {
    const on = this.audio.onsets[kind];
    let lo = 0, hi = on.length - 1, last = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (on[m] <= t) { last = m; lo = m + 1; } else hi = m - 1; }
    if (last < 0) return 0;
    return Math.pow(0.5, (t - on[last]) / half);
  }
}

/** how far the voice is through a word: 0 before, 1 after */
export function sung(w: Word, t: number): number {
  if (t <= w.start) return 0;
  if (t >= w.end) return 1;
  return (t - w.start) / (w.end - w.start);
}

/** how many of a word's letters the voice has reached (fractional), letters spread over the word */
export function lettersSung(w: Word, t: number, nLetters: number): number {
  const s = sung(w, t);
  // a sung word reaches its first letter at once and its last letter a little before it ends
  return s <= 0 ? 0 : Math.min(nLetters, 1 + s * (nLetters - 1) * 1.15);
}
