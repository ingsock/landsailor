"""Fetch the film's typefaces from the google/fonts repository (all SIL Open Font License).

    python -I fetch_fonts.py <out_dir>

Each font is checked by its magic bytes and its OFL text is saved beside it, with a note of
source, SHA-1 and date in _sources.txt.
"""
import hashlib
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

RAW = "https://raw.githubusercontent.com/google/fonts/main/ofl/"
WANT = {
    "monasans": ["MonaSans[wdth,wght].ttf", "MonaSans-Italic[wdth,wght].ttf"],
    "overpass": ["Overpass[wght].ttf"],
    "overpassmono": ["OverpassMono[wght].ttf"],
    "instrumentserif": ["InstrumentSerif-Regular.ttf", "InstrumentSerif-Italic.ttf"],
    "climatecrisis": ["ClimateCrisis[YEAR].ttf"],
}


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "landsailor-film"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def main():
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    notes = []
    for folder, files in WANT.items():
        for name in files + ["OFL.txt"]:
            url = RAW + folder + "/" + urllib.parse.quote(name)
            try:
                data = get(url)
            except Exception as e:  # noqa: BLE001
                print(f"{folder}/{name}: FAILED {e}")
                continue
            if name.endswith(".ttf") and data[:4] not in (b"\x00\x01\x00\x00", b"true", b"OTTO"):
                print(f"{folder}/{name}: not a font ({data[:16]!r})")
                continue
            target = out / (f"{folder}-OFL.txt" if name == "OFL.txt" else name)
            target.write_bytes(data)
            sha = hashlib.sha1(data).hexdigest()
            print(f"{folder}/{name}: {len(data):,d} B  sha1 {sha}")
            notes.append(f"{target.name}\n  Source   {url}\n  Licence  SIL Open Font License 1.1\n"
                         f"  SHA-1    {sha}\n  Fetched  {time.strftime('%Y-%m-%d')}\n")
    (out / "_sources.txt").write_text("\n".join(notes), encoding="utf-8")


if __name__ == "__main__":
    main()
