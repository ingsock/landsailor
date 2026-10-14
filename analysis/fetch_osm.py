"""Fetch OpenStreetMap ways for the film's cities from the Overpass API (ODbL).

    python -I fetch_osm.py <media_dir> name [name ...]

Each named query is saved as raw/osm/<name>.json (Overpass JSON with geometry) and gets a
note in raw/osm/_sources.txt. Credit: (c) OpenStreetMap contributors, ODbL 1.0.
"""
import hashlib
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter",
             "https://overpass.private.coffee/api/interpreter"]

# south, west, north, east
CHI_REGION = (41.62, -88.00, 42.10, -87.50)
CHI_CORE = (41.80, -87.76, 41.97, -87.59)
CHI_LOOP = (41.862, -87.652, 41.905, -87.608)  # downtown: the Loop, the river, Streeterville to the Hancock
ORD = (41.955, -87.955, 42.010, -87.860)

QUERIES = {
    "chi_major": (CHI_REGION, 'way["highway"~"^(motorway|trunk|primary|secondary|tertiary)(_link)?$"]'),
    "chi_streets": (CHI_CORE, 'way["highway"~"^(residential|unclassified|living_street|service)$"]["service"!~"."]'),
    "chi_rail": (CHI_REGION, 'way["railway"~"^(rail|subway|light_rail)$"]'),
    "chi_water": (CHI_REGION, 'way["natural"="coastline"];way["waterway"~"^(river|canal)$"]'),
    "chi_power": (CHI_REGION, 'way["power"~"^(line|minor_line|cable)$"];way["power"="substation"]'),
    # the skyline needs the buildings that say how tall they are (downtown's towers do)
    "chi_loop_buildings": (CHI_LOOP, 'way["building"]["height"];way["building"]["building:levels"];way["building:part"]["height"]'),
    "ord_runways": (ORD, 'way["aeroway"~"^(runway|taxiway)$"]'),
}


def overpass(q):
    body = urllib.parse.urlencode({"data": q}).encode()
    last = None
    for ep in ENDPOINTS:
        try:
            req = urllib.request.Request(ep, data=body, headers={"User-Agent": "landsailor-film/1.0"})
            with urllib.request.urlopen(req, timeout=150) as r:
                return r.read(), ep
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(5)
    raise last


# queries too big for one request are fetched in n x n tiles and merged
TILED = {"chi_loop_buildings": 2}


def fetch_tiled(name, d, n):
    (s0, w0, n0, e0), sel = QUERIES[name]
    seen, elements, queries, eps = set(), [], [], set()
    for i in range(n):
        for j in range(n):
            b = (s0 + (n0 - s0) * i / n, w0 + (e0 - w0) * j / n, s0 + (n0 - s0) * (i + 1) / n, w0 + (e0 - w0) * (j + 1) / n)
            bs = ",".join(f"{x:.5f}" for x in b)
            parts = "".join(f"{s.strip()}({bs});" for s in sel.split(";") if s.strip())
            q = f"[out:json][timeout:240];({parts});out geom;"
            # each tile is kept as it arrives, so a run that fails part-way resumes where it stopped
            cache = d / f".{name}.tile{i}{j}.json"
            if cache.exists():
                els, ep = json.loads(cache.read_text(encoding="utf-8")), "cache"
            else:
                for attempt in range(6):
                    try:
                        data, ep = overpass(q)
                        els = json.loads(data)["elements"]
                        cache.write_text(json.dumps(els), encoding="utf-8")
                        break
                    except Exception as e:  # noqa: BLE001
                        print(f"{name} tile {i},{j}: retry ({e})")
                        time.sleep(30)
                else:
                    raise SystemExit(f"{name}: tile {i},{j} failed")
            for el in els:
                key = (el.get("type"), el.get("id"))
                if key not in seen:
                    seen.add(key); elements.append(el)
            queries.append(q); eps.add(ep)
            print(f"{name} tile {i},{j}: {len(els)} elements")
            time.sleep(12)
    data = json.dumps({"elements": elements}).encode("utf-8")
    target = d / f"{name}.json"
    target.write_bytes(data)
    sha = hashlib.sha1(data).hexdigest()
    with open(d / "_sources.txt", "a", encoding="utf-8") as f:
        nl = "\n"
        f.write(f"osm/{name}.json{nl}  Title    OpenStreetMap ways: {sel} in {QUERIES[name][0]}, fetched in {n}x{n} tiles and merged{nl}"
                f"  Author   OpenStreetMap contributors{nl}  Source   {', '.join(sorted(eps))}; queries: {' | '.join(queries)}{nl}"
                f"  Licence  Open Database License (ODbL) 1.0: credit (c) OpenStreetMap contributors{nl}"
                f"  SHA-1    {sha}{nl}  Fetched  {time.strftime('%Y-%m-%d')}{nl}{nl}")
    print(f"{name}: {len(data):,d} B, {len(elements)} elements")


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    media = Path(sys.argv[1])
    d = media / "raw" / "osm"
    d.mkdir(parents=True, exist_ok=True)
    for name in sys.argv[2:]:
        if name in TILED:
            fetch_tiled(name, d, TILED[name])
            continue
        bbox, sel = QUERIES[name]
        b = ",".join(str(x) for x in bbox)
        parts = "".join(f"{s.strip()}({b});" for s in sel.split(";") if s.strip())
        q = f"[out:json][timeout:240];({parts});out geom;"
        target = d / f"{name}.json"
        try:
            data, ep = overpass(q)
        except Exception as e:  # noqa: BLE001
            print(f"{name}: FAILED {e}")
            continue
        try:
            n = len(json.loads(data)["elements"])
        except Exception:  # noqa: BLE001
            print(f"{name}: not JSON ({data[:80]!r})")
            continue
        target.write_bytes(data)
        sha = hashlib.sha1(data).hexdigest()
        print(f"{name}: {len(data):,d} B, {n} elements")
        with open(d / "_sources.txt", "a", encoding="utf-8") as f:
            f.write(f"osm/{name}.json\n  Title    OpenStreetMap ways: {sel} in {bbox}\n"
                    f"  Author   OpenStreetMap contributors\n  Source   {ep} query: {q}\n"
                    f"  Licence  Open Database License (ODbL) 1.0: credit (c) OpenStreetMap contributors\n"
                    f"  SHA-1    {sha}\n  Fetched  {time.strftime('%Y-%m-%d')}\n\n")
        time.sleep(20)


if __name__ == "__main__":
    main()
