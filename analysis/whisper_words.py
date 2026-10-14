"""What whisper hears in the vocal stem, word by word, to cross-check the alignment.

    python whisper_words.py <vocals.wav> <out.json> [model]
"""
import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from faster_whisper import WhisperModel
from scipy import signal


def main():
    src, out = sys.argv[1], Path(sys.argv[2])
    name = sys.argv[3] if len(sys.argv) > 3 else "turbo"
    # decoded here: the installed PyAV no longer takes the arguments faster-whisper passes it
    y, sr = sf.read(src, dtype="float32", always_2d=True)
    y = signal.resample_poly(y.mean(1), 16000, sr).astype(np.float32)
    model = WhisperModel(name, device="cpu", compute_type="int8", cpu_threads=12)
    segs, info = model.transcribe(
        y, language="en", word_timestamps=True, vad_filter=False, beam_size=5,
        condition_on_previous_text=False,
        initial_prompt="Landsailor, Cloudraker, Lightbringer, lawbender, Earthbreaker, worldmaker, lifebringer.")
    words, lines = [], []
    for s in segs:
        lines.append({"start": s.start, "end": s.end, "text": s.text})
        for w in s.words or []:
            words.append({"word": w.word.strip(), "start": round(w.start, 3), "end": round(w.end, 3),
                          "p": round(w.probability, 3)})
        print(f"{s.start:7.2f}-{s.end:7.2f} {s.text}", flush=True)
    out.write_text(json.dumps({"segments": lines, "words": words}, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
