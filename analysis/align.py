"""Word timings for the lyric, from the vocal stem, by CTC forced alignment.

    python align.py <vocals.wav> <Lyrics.txt> <out.json> [--whisper whisper.json]

The lyric is aligned in one Viterbi pass over the whole song with torchaudio's MMS_FA
character model. Between lines (and at both ends) sits a "garbage" state whose score each
frame is the best character's score minus a margin, so humming, breaths and anything not in
the text is absorbed there, while the lyric's own characters win wherever they really are.

A line written "A (B)" is a call and its echo; the echo is aligned as the next line.
If a whisper transcript is given (see whisper_words.py) every word that whisper also heard
is compared, and words that disagree by more than 0.35 s are listed for a look.
"""
import argparse
import json
import re
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
import torchaudio

FRAME = 0.02
SR = 16000


def load_mono16k(path):
    y, sr = sf.read(path, dtype="float32", always_2d=True)
    y = torch.from_numpy(y.mean(1))
    if sr != SR:
        y = torchaudio.functional.resample(y, sr, SR)
    y = y / (y.abs().max() + 1e-9)
    return y


def emissions(y, chunk_s=20.0, ctx_s=3.0):
    bundle = torchaudio.pipelines.MMS_FA
    model = bundle.get_model(with_star=False).eval()
    labels = list(bundle.get_labels(star=None))
    hop = int(FRAME * SR)
    n = len(y) // hop
    chunk, ctx = int(chunk_s * SR), int(ctx_s * SR)
    out = None
    for s in range(0, len(y), chunk):
        a, b = max(0, s - ctx), min(len(y), s + chunk + ctx)
        with torch.inference_mode():
            em, _ = model(y[a:b][None])
            em = torch.log_softmax(em, -1)[0].numpy()
        if out is None:
            out = np.full((n, em.shape[1]), np.nan, np.float32)
        f0 = a // hop
        lo, hi = s // hop, min(n, (s + chunk) // hop)
        seg = em[lo - f0: hi - f0]
        out[lo: lo + len(seg)] = seg
        print(f"  emissions {min(len(y), s + chunk) / SR:6.1f} s", end="\r", file=sys.stderr)
    good = ~np.isnan(out[:, 0])
    last = np.where(good)[0].max()
    out[last + 1:] = out[last]
    return out.astype(np.float64), labels


def parse_lyrics(path):
    """Lines in sung order. 'A (B)' gives a call A then an echo B."""
    lines = []
    for raw in Path(path).read_text(encoding="utf-8").splitlines():
        raw = raw.strip()
        if not raw:
            continue
        m = re.match(r"^(.*?)\s*\((.*)\)\s*$", raw)
        if m:
            lines.append({"text": m.group(1).strip(), "echo": False})
            lines.append({"text": m.group(2).strip(), "echo": True})
        else:
            lines.append({"text": raw, "echo": False})
    for line in lines:
        line["words"] = [w for w in line["text"].split() if re.search(r"[A-Za-z]", w)]
    return lines


def norm(word):
    w = word.lower().replace("’", "'")
    return re.sub(r"[^a-z']", "", w)


def viterbi(E, tgt, star, margin):
    """E: [T, V] log-probs (V includes blank at 0). tgt: target ids, star = garbage id.
    States: 2L+1 (blank between). Returns the state path."""
    T = E.shape[0]
    star_col = E.max(1) - margin
    L = len(tgt)
    S = 2 * L + 1
    tgt = np.asarray(tgt)
    is_tok = np.zeros(S, bool)
    is_tok[1::2] = True
    tok_of = np.zeros(S, np.int64)
    tok_of[1::2] = tgt
    # emission per state per frame
    def emis(t):
        e = np.where(is_tok, 0.0, E[t, 0])
        tok_e = np.where(tok_of[1::2] == star, star_col[t], E[t, np.minimum(tok_of[1::2], E.shape[1] - 1)])
        e[1::2] = tok_e
        return e
    # skip allowed into token s from s-2 when tokens differ
    can_skip = np.zeros(S, bool)
    for s in range(3, S, 2):
        can_skip[s] = tok_of[s] != tok_of[s - 2]
    NEG = -1e18
    prev = np.full(S, NEG)
    e0 = emis(0)
    prev[0] = e0[0]
    prev[1] = e0[1]
    bp = np.zeros((T, S), np.int8)
    for t in range(1, T):
        stay = prev
        step = np.concatenate([[NEG], prev[:-1]])
        skip = np.where(can_skip, np.concatenate([[NEG, NEG], prev[:-2]]), NEG)
        best = np.maximum(stay, np.maximum(step, skip))
        arg = np.where(best == stay, 0, np.where(best == step, 1, 2)).astype(np.int8)
        prev = best + emis(t)
        bp[t] = arg
    s = S - 1 if prev[S - 1] >= prev[S - 2] else S - 2
    path = np.zeros(T, np.int64)
    for t in range(T - 1, -1, -1):
        path[t] = s
        s -= int(bp[t, s])
    return path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("vocals")
    ap.add_argument("lyrics")
    ap.add_argument("out")
    ap.add_argument("--whisper")
    ap.add_argument("--margin", type=float, default=2.0)
    ap.add_argument("--skip-echo", action="store_true", help="align the calls only")
    ap.add_argument("--only-echo", action="store_true", help="align the echoes only")
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")

    lines = parse_lyrics(a.lyrics)
    if a.skip_echo:
        lines = [l for l in lines if not l["echo"]]
    if a.only_echo:
        lines = [l for l in lines if l["echo"]]
    y = load_mono16k(a.vocals)
    cache = Path(a.vocals).with_suffix(".mms.npy")
    E, labels = None, list(torchaudio.pipelines.MMS_FA.get_labels(star=None))
    if cache.exists():
        E = np.load(cache)
    else:
        E, labels = emissions(y)
        np.save(cache, E)
    idx = {c: i for i, c in enumerate(labels)}
    star = E.shape[1]  # one past the vocabulary

    # targets: star, line chars..., star, ...
    tgt, owner = [star], [None]
    for li, line in enumerate(lines):
        for wi, w in enumerate(line["words"]):
            for c in norm(w):
                if c in idx:
                    tgt.append(idx[c])
                    owner.append((li, wi))
        tgt.append(star)
        owner.append(None)
    path = viterbi(E, tgt, star, a.margin)
    tokpos = np.where(path % 2 == 1, (path - 1) // 2, -1)

    # frame-wise probability of the chosen token, for a confidence
    star_col = E.max(1) - a.margin
    Ex = np.concatenate([E, star_col[:, None]], 1)
    chosen = np.where(tokpos >= 0, np.asarray(tgt)[np.maximum(tokpos, 0)], 0)
    P = np.exp(Ex[np.arange(len(E)), chosen])

    # where the voice is: 20 ms frames of the vocal stem, in dB
    hop = int(FRAME * SR)
    yy = y.numpy()
    nfr = len(yy) // hop
    lev = 20 * np.log10(np.sqrt((yy[: nfr * hop].reshape(nfr, hop) ** 2).mean(1)) + 1e-9)
    active = lev > (np.percentile(lev[lev > -80], 50) - 14)

    def clamp_to_voice(st, en):
        """move a word's start to the first voiced frame and end it where the voice stops"""
        i0, i1 = int(st / FRAME), min(nfr - 1, int(en / FRAME))
        j = i0
        while j < i1 and not active[j]:
            j += 1
        if j < i1:
            i0 = j
        quiet = 0
        for k in range(i0, i1 + 1):
            quiet = quiet + 1 if not active[k] else 0
            if quiet >= 12:  # 0.24 s of silence ends the word
                return i0 * FRAME, (k - quiet + 1) * FRAME
        return i0 * FRAME, en

    spans = {}
    for t, p in enumerate(tokpos):
        if p < 0 or owner[p] is None:
            continue
        spans.setdefault(owner[p], []).append(t)
    out_lines = []
    for li, line in enumerate(lines):
        words = []
        for wi, w in enumerate(line["words"]):
            fr = spans.get((li, wi))
            if not fr:
                words.append({"w": w, "start": None, "end": None, "conf": 0.0})
                continue
            fr = np.asarray(fr)
            st, en = clamp_to_voice(fr.min() * FRAME, (fr.max() + 1) * FRAME)
            words.append({"w": w, "start": round(st, 3), "end": round(max(en, st + FRAME), 3),
                          "ctc": [round(fr.min() * FRAME, 3), round((fr.max() + 1) * FRAME, 3)],
                          "conf": round(float(P[fr].mean()), 3)})
        st = [w["start"] for w in words if w["start"] is not None]
        en = [w["end"] for w in words if w["end"] is not None]
        out_lines.append({"text": line["text"], "echo": line["echo"], "start": min(st) if st else None,
                          "end": max(en) if en else None, "words": words})

    if a.whisper:
        wh = json.loads(Path(a.whisper).read_text(encoding="utf-8"))
        hw = [(norm(x["word"]), x["start"], x["end"]) for x in wh["words"]]
        flat = [(norm(w["w"]), w["start"], li, wi) for li, l in enumerate(out_lines) for wi, w in enumerate(l["words"])]
        # greedy monotone match within 4 s
        j = 0
        diffs = []
        for (nw, st, li, wi) in flat:
            if st is None:
                continue
            for k in range(j, min(j + 12, len(hw))):
                if hw[k][0] == nw and abs(hw[k][1] - st) < 4.0:
                    diffs.append((st - hw[k][1], li, wi, nw, st, hw[k][1]))
                    out_lines[li]["words"][wi]["whisper"] = round(hw[k][1], 3)
                    j = k + 1
                    break
        d = np.array([x[0] for x in diffs])
        print(f"whisper agreed on {len(diffs)} of {len(flat)} words; median offset {np.median(d):+.3f} s, "
              f"90% within {np.percentile(np.abs(d), 90):.3f} s")
        for x in diffs:
            if abs(x[0]) > 0.35:
                print(f"  look: line {x[1]} word {x[2]} '{x[3]}' ctc {x[4]:.2f} whisper {x[5]:.2f}")

    Path(a.out).write_text(json.dumps({"lines": out_lines}, indent=1, ensure_ascii=False), encoding="utf-8")
    for l in out_lines:
        ws = " ".join(f"{w['w']}@{w['start']:.2f}" if w["start"] is not None else f"{w['w']}@?" for w in l["words"])
        tag = "  echo" if l["echo"] else ""
        print(f"{l['start'] or 0:7.2f}-{l['end'] or 0:7.2f}{tag}  {ws}")


if __name__ == "__main__":
    main()
