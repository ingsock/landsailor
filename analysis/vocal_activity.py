"""Where the voice is: the vocal stem's level in steps, with whisper's words beside it.

    python vocal_activity.py <vocals.wav> <whisper.json> --from 100 --to 160 [--step 0.25]
"""
import argparse
import json
import sys

import numpy as np
import soundfile as sf


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("vocals")
    ap.add_argument("whisper")
    ap.add_argument("--from", dest="t0", type=float, default=0)
    ap.add_argument("--to", dest="t1", type=float, default=30)
    ap.add_argument("--step", type=float, default=0.25)
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    y, sr = sf.read(a.vocals, dtype="float32", always_2d=True)
    m = y.mean(1)
    side = (y[:, 0] - y[:, 1]) * 0.5 if y.shape[1] > 1 else m * 0
    words = json.loads(open(a.whisper, encoding="utf-8").read())["words"]
    t = a.t0
    while t < a.t1:
        s0, s1 = int(t * sr), int((t + a.step) * sr)
        rms = np.sqrt((m[s0:s1] ** 2).mean() + 1e-12)
        srms = np.sqrt((side[s0:s1] ** 2).mean() + 1e-12)
        db = 20 * np.log10(rms)
        sdb = 20 * np.log10(srms)
        bar = "#" * max(0, int((db + 60) / 1.2))
        ws = " ".join(w["word"] for w in words if t <= w["start"] < t + a.step)
        print(f"{t:7.2f}  {db:6.1f} dB  side {sdb:6.1f}  {bar:<45s} {ws}")
        t += a.step


if __name__ == "__main__":
    main()
