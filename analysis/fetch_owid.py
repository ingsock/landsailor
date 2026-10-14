"""Fetch Our World in Data grapher tables (CC BY 4.0) with their metadata.

    python -I fetch_owid.py <out_dir> slug [slug ...]

Saves <slug>.csv and <slug>.metadata.json, and prints each table's size, columns and
the years it covers for the World row, so a wrong slug shows at once.
"""
import csv
import hashlib
import io
import json
import sys
import time
import urllib.request
from pathlib import Path

BASE = "https://ourworldindata.org/grapher/"
UA = {"User-Agent": "Mozilla/5.0 (landsailor music video; data fetch)"}


def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    for slug in sys.argv[2:]:
        try:
            raw = get(f"{BASE}{slug}.csv?v=1&csvType=full&useColumnShortNames=false")
            meta = get(f"{BASE}{slug}.metadata.json?v=1&csvType=full&useColumnShortNames=false")
        except Exception as e:  # noqa: BLE001
            print(f"{slug:55s} FAILED {e}")
            continue
        (out / f"{slug}.csv").write_bytes(raw)
        (out / f"{slug}.metadata.json").write_bytes(meta)
        rows = list(csv.reader(io.StringIO(raw.decode("utf-8"))))
        head, body = rows[0], rows[1:]
        world = [r for r in body if r[0] == "World"]
        years = [int(r[2]) for r in world if r[2].lstrip("-").isdigit()]
        span = f"World {min(years)}-{max(years)} ({len(years)} rows)" if years else "no World row"
        ents = len({r[0] for r in body})
        print(f"{slug:55s} {len(raw):>9,d} B  {ents:4d} entities  {span}")
        print(f"{'':55s} cols: {head[3:]}")
        item = {"slug": slug, "url": f"{BASE}{slug}", "bytes": len(raw),
                "sha1": hashlib.sha1(raw).hexdigest(), "fetched": time.strftime("%Y-%m-%d")}
        with open(out / "_fetched.jsonl", "a", encoding="utf-8") as f:
            f.write(json.dumps(item) + "\n")
        time.sleep(0.4)


if __name__ == "__main__":
    main()
