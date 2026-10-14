"""The film's soundtrack: the whole recording, one gain, to -14 LUFS integrated.

    python -I master.py <song.wav> <out.wav>

The song is a finished master; nothing is cut, joined or limited. The gain is chosen from the
measured integrated loudness, applied once, and the result is measured again (loudness and
true peak) so the numbers in the README are the file's own.
"""
import re
import subprocess
import sys


def measure(path):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af", "ebur128=peak=true", "-f", "null", "-"],
                       capture_output=True, text=True)
    txt = r.stderr
    i = float(re.findall(r"I:\s+(-?[\d.]+) LUFS", txt)[-1])
    p = float(re.findall(r"Peak:\s+(-?[\d.]+) dBFS", txt)[-1])
    return i, p


def main():
    src, out = sys.argv[1], sys.argv[2]
    i, p = measure(src)
    gain = -14.0 - i
    print(f"source: {i:.1f} LUFS, true peak {p:+.1f} dBFS; gain {gain:+.2f} dB")
    if p + gain > -1.0:
        sys.exit(f"after the gain the true peak would be {p + gain:+.1f} dBFS: needs a limiter, stop and think")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src, "-af", f"volume={gain:.2f}dB", "-c:a", "pcm_s24le", "-ar", "48000", out], check=True)
    i2, p2 = measure(out)
    print(f"master: {i2:.1f} LUFS, true peak {p2:+.1f} dBFS -> {out}")


if __name__ == "__main__":
    main()
