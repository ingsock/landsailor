"""The film's lyric clock: data/lyrics.json, from the calls-only alignment plus what was measured.

    python build_lyrics.py <lyrics.calls.json> <Lyrics.txt> <vocals.wav> <out.json>

- Every call (the lead line) keeps its CTC times, clamped to where the voice is.
- The outro's echoes are sung over their calls, not after them (the vocal stem never goes
  quiet between a call and its echo, and whisper hears each line once). An echo therefore takes
  its call's span, its words spread over it a quarter second late, and is marked `estimated`.
  The first echo, "I'm your landsailor", is audible on its own before the call lands on
  "landsailor", and keeps the times the full alignment gave it.
- "Mmm, mmm" is two hums, at the two voiced stretches between "your heart" and the outro.
- Three wordless phrases in the quiet bridge are listed as `vocalise`.
"""
import json
import re
import sys
from pathlib import Path

import numpy as np
import soundfile as sf


def voiced_runs(path, t0, t1, thresh_db=-32.0, min_len=0.3):
    y, sr = sf.read(path, dtype="float32", always_2d=True)
    m = y.mean(1)
    hop = int(0.02 * sr)
    i0, i1 = int(t0 / 0.02), int(t1 / 0.02)
    lev = [20 * np.log10(np.sqrt((m[i * hop:(i + 1) * hop] ** 2).mean()) + 1e-9) for i in range(i0, i1)]
    runs, cur = [], None
    for k, v in enumerate(lev):
        t = (i0 + k) * 0.02
        if v > thresh_db and cur is None:
            cur = t
        elif v <= thresh_db and cur is not None:
            if t - cur >= min_len:
                runs.append([round(cur, 2), round(t, 2)])
            cur = None
    if cur is not None:
        runs.append([round(cur, 2), round(t1, 2)])
    return runs


def main():
    calls_p, lyr_p, voc_p, out_p = sys.argv[1:5]
    sys.stdout.reconfigure(encoding="utf-8")
    calls = json.loads(Path(calls_p).read_text(encoding="utf-8"))["lines"]
    raw = [l.strip() for l in Path(lyr_p).read_text(encoding="utf-8").splitlines() if l.strip()]
    echoes = {}
    for l in raw:
        m = re.match(r"^(.*?)\s*\((.*)\)\s*$", l)
        if m:
            echoes[m.group(1).strip()] = m.group(2).strip()

    lines = []
    for c in calls:
        c = {k: v for k, v in c.items()}
        c.pop("echo", None)
        if c["text"].startswith("Mmm"):
            hums = voiced_runs(voc_p, 172.6, 178.9)
            print("hums", hums)
            c["words"][0].update(start=hums[0][0], end=hums[0][1])
            c["words"][1].update(start=hums[-1][0], end=hums[-1][1])
            c["start"], c["end"] = hums[0][0], hums[-1][1]
        lines.append({**c, "echo": False})
        # only the outro sings echoes; earlier "Landsailor" lines have the same text and none
        if c["text"] in echoes and c["start"] >= 175.0:
            etext = echoes[c["text"]]
            ews = [w for w in etext.split() if re.search(r"[A-Za-z]", w)]
            if etext.lower().startswith("i'm your landsailor"):
                st = [179.30, 179.62, 180.12]
                en = [179.6, 180.1, 181.14]
                words = [{"w": w, "start": s, "end": e, "conf": 0.5} for w, s, e in zip(ews, st, en)]
                est = False
            else:
                s0, s1 = c["start"] + 0.25, c["end"] + 0.25
                n = len(ews)
                words = [{"w": w, "start": round(s0 + (s1 - s0) * i / n, 3), "end": round(s0 + (s1 - s0) * (i + 1) / n, 3),
                          "conf": 0.0} for i, w in enumerate(ews)]
                est = True
            lines.append({"text": etext, "echo": True, "estimated": est, "start": words[0]["start"],
                          "end": words[-1]["end"], "words": words})
    vocalise = voiced_runs(voc_p, 108.0, 141.0)
    print("vocalise", vocalise)
    out = {"lines": lines, "vocalise": vocalise}
    Path(out_p).write_text(json.dumps(out, indent=1, ensure_ascii=False), encoding="utf-8")
    for l in lines:
        tag = " echo" if l["echo"] else ""
        print(f"{l['start']:7.2f}-{l['end']:7.2f}{tag:5s} {l['text']}")


if __name__ == "__main__":
    main()
