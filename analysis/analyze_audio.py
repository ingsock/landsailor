"""The song's beat grid, loudness envelopes and onsets, from the mix and the stems.

    python analyze_audio.py <song.wav> <stems_dir> <out.json> --bpm 111.065 --first 0.169

Writes the grid (every beat and bar), envelopes every 20 ms normalised 0..1 (rms of the mix,
the vocal, the bass stem, the high band of the mix), and onsets of the vocal, the drums and the
bass. It also prints how far drum onsets drift from the grid, eight bars at a time: if the grid
is right, the drift stays near zero all the way through.
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal

STEP = 0.02


def mono(path, sr=22050):
    y, s = sf.read(path, dtype="float32", always_2d=True)
    y = y.mean(1)
    if s != sr:
        y = signal.resample_poly(y, sr, s)
    return y.astype(np.float32), sr


def env_rms(y, sr):
    hop = int(STEP * sr)
    n = len(y) // hop
    fr = y[: n * hop].reshape(n, hop)
    return np.sqrt((fr ** 2).mean(1) + 1e-12)


def norm01(x, lo_pct=5, hi_pct=99.5):
    db = 20 * np.log10(x + 1e-9)
    lo, hi = np.percentile(db, lo_pct), np.percentile(db, hi_pct)
    return np.clip((db - lo) / (hi - lo + 1e-9), 0, 1)


def onsets(y, sr, band=None, thresh=1.5, min_gap=0.08):
    if band:
        sos = signal.butter(4, band, btype="band" if band[0] > 0 else "low", fs=sr, output="sos") if band[0] > 0 else \
            signal.butter(4, band[1], btype="low", fs=sr, output="sos")
        y = signal.sosfilt(sos, y)
    hop = 256
    f, t, Z = signal.stft(y, sr, nperseg=1024, noverlap=1024 - hop)
    mag = np.log1p(np.abs(Z) * 100)
    flux = np.maximum(0, np.diff(mag, axis=1)).sum(0)
    flux = np.concatenate([[0], flux])
    med = signal.medfilt(flux, 31)
    peaks, _ = signal.find_peaks(flux, height=med * thresh + flux.std() * 0.3, distance=max(1, int(min_gap * sr / hop)))
    return (peaks * hop / sr).tolist(), flux


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("song")
    ap.add_argument("stems")
    ap.add_argument("out")
    ap.add_argument("--bpm", type=float, required=True)
    ap.add_argument("--first", type=float, required=True)
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    st = Path(a.stems)
    mix, sr = mono(a.song)
    voc, _ = mono(st / "vocals.wav")
    bass, _ = mono(st / "bass.wav")
    drums, _ = mono(st / "drums.wav")
    dur = len(mix) / sr

    beat = 60 / a.bpm
    beats = np.arange(a.first, dur, beat)
    bars = beats[::4]

    sos_hi = signal.butter(4, 4000, btype="high", fs=sr, output="sos")
    hi = signal.sosfilt(sos_hi, mix)
    env = {
        "rms": norm01(env_rms(mix, sr)).round(3).tolist(),
        "vocal": norm01(env_rms(voc, sr), 20, 99.5).round(3).tolist(),
        "low": norm01(env_rms(bass, sr)).round(3).tolist(),
        "high": norm01(env_rms(hi, sr)).round(3).tolist(),
    }
    on_v, _ = onsets(voc, sr, thresh=1.8, min_gap=0.12)
    on_d, _ = onsets(drums, sr, thresh=1.6, min_gap=0.07)
    on_b, _ = onsets(bass, sr, band=(0, 250), thresh=1.6, min_gap=0.1)

    # drift of drum onsets against the grid, eight bars at a time
    print(f"{a.bpm} BPM, first beat {a.first:.3f} s, {len(beats)} beats, {len(bars)} bars, {dur:.2f} s")
    od = np.array(on_d)
    for b0 in range(0, len(bars), 8):
        t0 = bars[b0]
        t1 = bars[b0 + 8] if b0 + 8 < len(bars) else dur
        sel = od[(od >= t0) & (od < t1)]
        if len(sel) < 4:
            print(f"  bars {b0 + 1:3d}-{b0 + 8:3d}  {t0:7.2f} s  {len(sel):3d} drum onsets")
            continue
        ph = ((sel - a.first) / beat) % 1.0
        ang = np.angle(np.exp(2j * np.pi * ph).mean())
        r = np.abs(np.exp(2j * np.pi * ph).mean())
        print(f"  bars {b0 + 1:3d}-{b0 + 8:3d}  {t0:7.2f} s  {len(sel):3d} drum onsets  "
              f"phase {ang / (2 * np.pi) * beat * 1000:+6.1f} ms  locked {r:.2f}")

    out = {
        "duration": round(dur, 3), "bpm": a.bpm, "firstBeat": a.first,
        "beats": beats.round(4).tolist(), "bars": bars.round(4).tolist(),
        "envStep": STEP, "env": env,
        "onsets": {"vocal": [round(x, 3) for x in on_v], "drums": [round(x, 3) for x in on_d],
                   "bass": [round(x, 3) for x in on_b]},
    }
    Path(a.out).write_text(json.dumps(out), encoding="utf-8")
    print("wrote", a.out, len(on_v), "vocal,", len(on_d), "drum,", len(on_b), "bass onsets")


if __name__ == "__main__":
    main()
