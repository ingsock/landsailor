"""An equirectangular map in which each pixel's colour is a country's index, so the globe's shader
can light each country by its own number (share with electricity, and so on).

    python -I prep_countrymap.py <data_dir>

Writes data/geo/country_ids.png (4096x2048, R = index & 255, G = index >> 8, index 0 = sea)
and data/geo/country_index.json (index -> ISO3, name).
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

W, H = 4096, 2048


def main():
    data = Path(sys.argv[1])
    countries = json.loads((data / "geo" / "countries.json").read_text(encoding="utf-8"))
    im = Image.new("RGB", (W, H), (0, 0, 0))
    dr = ImageDraw.Draw(im)
    index = [{"iso": None, "name": "sea"}]
    for i, c in enumerate(countries, start=1):
        col = (i & 255, i >> 8, 0)
        for ring in c["rings"]:
            pts = [((lon + 180) / 360 * W, (90 - lat) / 180 * H) for lon, lat in ring]
            if len(pts) >= 3:
                dr.polygon(pts, fill=col)
        index.append({"iso": c["iso"], "name": c["name"]})
    # holes (lakes, enclaves) are not cut: an enclave country drawn later wins, which suits a map of lights
    im.save(data / "geo" / "country_ids.png", optimize=True)
    (data / "geo" / "country_index.json").write_text(json.dumps(index), encoding="utf-8")
    print("countries", len(index) - 1)


if __name__ == "__main__":
    main()
