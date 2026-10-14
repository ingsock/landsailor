"""Where the kick really falls against a grid: a histogram of low-band drum onsets by beat phase.

    python beat_phase.py <drums.wav> --bpm 118 --first 0.159
"""
import argparse
import sys

import numpy as np
import soundfile as sf
from scipy import signal


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("drums")
    ap.add_argument("--bpm", type=float, required=True)
    ap.add_argument("--first", type=float, required=True)
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    y, sr = sf.read(a.drums, dtype="float32", always_2d=True)
    y = y.mean(1)
    sos = signal.butter(4, 140, btype="low", fs=sr, output="sos")
    lo = signal.sosfiltfilt(sos, y)
    # energy envelope at 1 ms resolution, onset = rising edge of the smoothed envelope
    hop = int(sr * 0.001)
    e = np.sqrt(np.convolve(lo ** 2, np.ones(hop * 5) / (hop * 5), mode="same"))[::hop]
    de = np.maximum(0, np.diff(e, prepend=e[0]))
    thr = np.percentile(de, 99.0)
    peaks, _ = signal.find_peaks(de, height=thr, distance=150)
    t = peaks * 0.001
    beat = 60 / a.bpm
    ph = ((t - a.first) / beat) % 1.0
    ph[ph > 0.5] -= 1.0
    ms = ph * beat * 1000
    hist, edges = np.histogram(ms, bins=np.arange(-250, 260, 10))
    print(f"{len(t)} kick onsets")
    for h, e0 in zip(hist, edges[:-1]):
        print(f"  {e0:+5.0f} ms  {'#' * int(h)}")
    near = ms[np.abs(ms) < 80]
    print(f"median offset of onsets within 80 ms of a beat: {np.median(near):+.1f} ms over {len(near)} onsets")


if __name__ == "__main__":
    main()
