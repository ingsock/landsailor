"""Split the song into a vocal stem and the rest, for alignment and analysis.

    python separate.py <song.wav> <out_dir> [model]

Writes <out_dir>/vocals.wav and <out_dir>/rest.wav (48 kHz stereo float).
"""
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from demucs.apply import apply_model
from demucs.pretrained import get_model


def main():
    src, out = Path(sys.argv[1]), Path(sys.argv[2])
    name = sys.argv[3] if len(sys.argv) > 3 else "htdemucs_ft"
    out.mkdir(parents=True, exist_ok=True)
    wav, sr = sf.read(src, dtype="float32", always_2d=True)
    model = get_model(name)
    model.eval()
    x = torch.from_numpy(wav.T.copy())
    if sr != model.samplerate:
        import julius
        x = julius.resample_frac(x, sr, model.samplerate)
    ref = x.mean(0)
    mean, std = ref.mean(), ref.std()
    x = (x - mean) / std
    torch.set_num_threads(max(1, torch.get_num_threads()))
    with torch.inference_mode():
        stems = apply_model(model, x[None], device="cpu", shifts=1, split=True, overlap=0.25, progress=True)[0]
    stems = stems * std + mean
    names = model.sources
    voc = stems[names.index("vocals")]
    rest = stems.sum(0) - voc
    if model.samplerate != sr:
        import julius
        voc = julius.resample_frac(voc, model.samplerate, sr)
        rest = julius.resample_frac(rest, model.samplerate, sr)
    sf.write(out / "vocals.wav", voc.numpy().T, sr, subtype="FLOAT")
    sf.write(out / "rest.wav", rest.numpy().T, sr, subtype="FLOAT")
    for i, n in enumerate(names):
        if n != "vocals":
            s = stems[i]
            if model.samplerate != sr:
                s = julius.resample_frac(s, model.samplerate, sr)
            sf.write(out / f"{n}.wav", s.numpy().T, sr, subtype="FLOAT")
    print("wrote", out, names, "rms vocals", float(np.sqrt((voc.numpy() ** 2).mean())))


if __name__ == "__main__":
    main()
