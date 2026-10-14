"""The globe's city lights: every Natural Earth populated place of 10,000 people or more, with the
country it stands in, so a country's towns can switch on with the country.

    python -I prep_globe_places.py <media_dir> <data_dir>

Reads media/raw/naturalearth/ne_10m_populated_places_simple.geojson (Natural Earth, public
domain; already fetched, see media/raw/_sources.txt) and data/geo/country_ids.png +
country_index.json (made by prep_countrymap.py). Writes data/geo/globe_places.json:

    {"source": ..., "fields": ["lon", "lat", "pop", "iso"], "places": [[lon, lat, pop, iso], ...]}

sorted by population, largest first. `pop` is Natural Earth's pop_max (the urban agglomeration
where it has one). `iso` is the country whose polygon on the id map holds the place (the nearest
land pixel within half a degree for places on the coast), else the place's adm0_a3 when that is a
country of the map, else null. Scientific and meteorological stations and historic places are
left out: their lights are not a town's.
"""
import json
import sys
from pathlib import Path

from PIL import Image

MIN_POP = 10000
SKIP = {"Scientific station", "Meteorological Station", "Historic place"}


def main():
    media, data = Path(sys.argv[1]), Path(sys.argv[2])
    src = media / "raw" / "naturalearth" / "ne_10m_populated_places_simple.geojson"
    pp = json.loads(src.read_text(encoding="utf-8"))
    ids = Image.open(data / "geo" / "country_ids.png").convert("RGB")
    W, H = ids.size
    px = ids.load()
    index = json.loads((data / "geo" / "country_index.json").read_text(encoding="utf-8"))
    isos = {c["iso"] for c in index if c["iso"]}

    def idx_at(x, y):
        r, g, _ = px[x % W, min(H - 1, max(0, y))]
        return r + g * 256

    def country(lon, lat):
        x = int((lon + 180) / 360 * W)
        y = int((90 - lat) / 180 * H)
        i = idx_at(x, y)
        if i:
            return index[i]["iso"]
        # on the coast: the nearest land pixel within half a degree (about 6 pixels)
        best = None
        for r in range(1, 7):
            for dy in range(-r, r + 1):
                for dx in range(-r, r + 1):
                    if max(abs(dx), abs(dy)) != r:
                        continue
                    j = idx_at(x + dx, y + dy)
                    if j:
                        d = dx * dx + dy * dy
                        if best is None or d < best[0]:
                            best = (d, j)
            if best:
                return index[best[1]]["iso"]
        return None

    out = []
    by_map = fallback = none = 0
    for f in pp["features"]:
        p = f["properties"]
        pop = p.get("pop_max") or 0
        if pop < MIN_POP or p.get("featurecla") in SKIP:
            continue
        lon, lat = f["geometry"]["coordinates"][:2]
        iso = country(lon, lat)
        if iso:
            by_map += 1
        elif p.get("adm0_a3") in isos:
            iso = p["adm0_a3"]
            fallback += 1
        else:
            none += 1
        out.append([round(lon, 3), round(lat, 3), int(pop), iso])
    out.sort(key=lambda r: -r[2])
    doc = {
        "source": "Natural Earth 1:10m populated places (simple), pop_max >= 10,000; public domain",
        "fields": ["lon", "lat", "pop", "iso"],
        "places": out,
    }
    dst = data / "geo" / "globe_places.json"
    dst.write_text(json.dumps(doc, separators=(",", ":")), encoding="utf-8")
    print(f"{dst}: {len(out)} places (country from the id map {by_map}, from adm0_a3 {fallback}, none {none})")


if __name__ == "__main__":
    main()
