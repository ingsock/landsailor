"""Fetch the film's borrowed maps and pictures, and write the note that goes beside each.

    python -I fetch_assets.py <media_dir>

Every file is checked for a plausible size and its first bytes, and gets an entry in
<media_dir>/raw/_sources.txt: title, author, source, licence, SHA-1, date.
"""
import hashlib
import sys
import time
import urllib.request
from pathlib import Path

NASA = "https://assets.science.nasa.gov/content/dam/science/esd/eo/images/imagerecords/144000/144897/"
NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/"
OF = "https://raw.githubusercontent.com/jpatokal/openflights/master/data/"

ITEMS = [
    # (folder, file name, url, min bytes, magic, title, author, licence)
    ("nasa", "BlackMarble_2016_3km_gray.jpg", NASA + "BlackMarble_2016_3km_gray.jpg", 1_000_000, b"\xff\xd8",
     "Earth at Night (Black Marble) 2016, grayscale, 13500x6750",
     "NASA Earth Observatory (Joshua Stevens), Suomi NPP VIIRS data (Miguel Roman, NASA GSFC)",
     "Public domain (NASA)"),
    ("naturalearth", "ne_110m_admin_0_countries.geojson", NE + "ne_110m_admin_0_countries.geojson", 200_000, b"{",
     "Natural Earth 1:110m admin 0 countries", "Natural Earth", "Public domain"),
    ("naturalearth", "ne_50m_admin_0_countries.geojson", NE + "ne_50m_admin_0_countries.geojson", 1_000_000, b"{",
     "Natural Earth 1:50m admin 0 countries", "Natural Earth", "Public domain"),
    ("naturalearth", "ne_10m_populated_places_simple.geojson", NE + "ne_10m_populated_places_simple.geojson",
     500_000, b"{", "Natural Earth 1:10m populated places (simple)", "Natural Earth", "Public domain"),
    ("naturalearth", "ne_50m_urban_areas.geojson", NE + "ne_50m_urban_areas.geojson", 100_000, b"{",
     "Natural Earth 1:50m urban areas", "Natural Earth", "Public domain"),
    ("naturalearth", "ne_50m_coastline.geojson", NE + "ne_50m_coastline.geojson", 100_000, b"{",
     "Natural Earth 1:50m coastline", "Natural Earth", "Public domain"),
    ("openflights", "airports.dat", OF + "airports.dat", 500_000, b"1,",
     "OpenFlights airports database", "OpenFlights.org contributors",
     "Open Database License (ODbL) 1.0: credit OpenFlights.org"),
    ("openflights", "routes.dat", OF + "routes.dat", 1_000_000, b"",
     "OpenFlights routes database (2014)", "OpenFlights.org contributors",
     "Open Database License (ODbL) 1.0: credit OpenFlights.org"),
]


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "landsailor-film"})
    with urllib.request.urlopen(req, timeout=180) as r:
        return r.read()


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    media = Path(sys.argv[1])
    raw = media / "raw"
    notes = []
    for folder, name, url, minb, magic, title, author, lic in ITEMS:
        d = raw / folder
        d.mkdir(parents=True, exist_ok=True)
        target = d / name
        if not target.exists():
            try:
                data = get(url)
            except Exception as e:  # noqa: BLE001
                print(f"{name}: FAILED {e}")
                continue
            if len(data) < minb or (magic and not data.lstrip()[:len(magic)] == magic):
                print(f"{name}: suspicious ({len(data):,d} B, starts {data[:12]!r}); not saved")
                continue
            target.write_bytes(data)
        data = target.read_bytes()
        sha = hashlib.sha1(data).hexdigest()
        print(f"{folder}/{name}: {len(data):,d} B  sha1 {sha}")
        notes.append(f"{folder}/{name}\n  Title    {title}\n  Author   {author}\n  Source   {url}\n"
                     f"  Licence  {lic}\n  SHA-1    {sha}\n  Fetched  {time.strftime('%Y-%m-%d')}\n"
                     f"  Changed  see the film's README (processed by tools in analysis/)\n")
    (raw / "_sources.txt").write_text("\n".join(notes), encoding="utf-8")


if __name__ == "__main__":
    main()
