"""Local tempo through the song, to see whether it keeps one grid.

    python tempo_map.py <audio.wav> [--win 12] [--lo 60] [--hi 180]

For each window, the onset-strength autocorrelation's best lag between lo and hi BPM, and how
clear that peak is. A steady track shows one tempo all the way down.
"""
import argparse
import sys

import numpy as np
import soundfile as sf
from scipy import signal


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("audio")
    ap.add_argument("--win", type=float, default=12)
    ap.add_argument("--lo", type=float, default=60)
    ap.add_argument("--hi", type=float, default=180)
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    y, sr = sf.read(a.audio, dtype="float32", always_2d=True)
    y = y.mean(1)
    y = signal.resample_poly(y, 22050, sr)
    sr = 22050
    hop = 256
    f, t, Z = signal.stft(y, sr, nperseg=2048, noverlap=2048 - hop)
    mag = np.log1p(np.abs(Z) * 50)
    flux = np.maximum(0, np.diff(mag, axis=1)).sum(0)
    flux = flux - signal.medfilt(flux, 15)
    flux = np.maximum(flux, 0)
    fps = sr / hop
    W = int(a.win * fps)
    lags = np.arange(int(fps * 60 / a.hi), int(fps * 60 / a.lo) + 1)
    print(f"window {a.win}s, onset frames {fps:.1f}/s")
    for s0 in range(0, len(flux) - W, W // 2):
        seg = flux[s0: s0 + W]
        seg = seg - seg.mean()
        ac = np.array([np.dot(seg[:-L], seg[L:]) for L in lags])
        ac = ac / (np.dot(seg, seg) + 1e-9)
        i = int(np.argmax(ac))
        # parabolic refine
        if 0 < i < len(ac) - 1:
            d = (ac[i - 1] - ac[i + 1]) / (2 * (ac[i - 1] - 2 * ac[i] + ac[i + 1]) + 1e-12)
        else:
            d = 0
        lag = lags[i] + d
        bpm = 60 * fps / lag
        top3 = np.argsort(ac)[::-1][:3]
        alts = ", ".join(f"{60 * fps / lags[k]:.1f}" for k in top3[1:])
        print(f"  {s0 / fps:7.2f} s  {bpm:7.2f} BPM  peak {ac[i]:.2f}   (others {alts})")


if __name__ == "__main__":
    main()
