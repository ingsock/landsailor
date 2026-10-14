"""Maps for the film: OSM ways and Natural Earth shapes into compact files the app reads.

    python -I prep_geo.py <media_dir> <data_dir>

City data is projected to metres east and north of State & Madison, the zero point of
Chicago's address grid (41.88194 N, 87.62778 W), with north up. In the app y goes down, so
the files store (east, -north). Each way becomes segments: ax ay bx by + class + a key (the
distance of the segment's midpoint from the origin, in metres), written as float32.
"""
import json
import math
import struct
import sys
from pathlib import Path

ORIGIN = (41.88194, -87.62778)  # State & Madison
R = 6371008.8


def proj(lat, lon):
    x = math.radians(lon - ORIGIN[1]) * R * math.cos(math.radians(ORIGIN[0]))
    y = math.radians(lat - ORIGIN[0]) * R
    return x, -y


ROAD_CLASS = {"motorway": 0, "motorway_link": 0, "trunk": 1, "trunk_link": 1, "primary": 2, "primary_link": 2,
              "secondary": 3, "secondary_link": 3, "tertiary": 4, "tertiary_link": 4,
              "residential": 5, "unclassified": 5, "living_street": 5, "service": 6}


def ways_to_segments(path, classify):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    segs = []
    names = {}
    for el in data["elements"]:
        if el.get("type") != "way" or "geometry" not in el:
            continue
        cls = classify(el.get("tags", {}))
        if cls is None:
            continue
        pts = [proj(g["lat"], g["lon"]) for g in el["geometry"]]
        nm = el.get("tags", {}).get("name")
        for (ax, ay), (bx, by) in zip(pts, pts[1:]):
            mx, my = (ax + bx) / 2, (ay + by) / 2
            segs.append((ax, ay, bx, by, cls, math.hypot(mx, my)))
            if nm:
                names.setdefault(nm, []).append((mx, my))
    return segs, names


def write_segments(segs, out):
    with open(out, "wb") as f:
        for s in segs:
            f.write(struct.pack("<6f", *s))
    print(f"{out.name}: {len(segs):,d} segments, {out.stat().st_size:,d} B")


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    media, data = Path(sys.argv[1]), Path(sys.argv[2])
    osm = media / "raw" / "osm"
    geo = data / "geo"
    geo.mkdir(parents=True, exist_ok=True)

    def road(tags):
        return ROAD_CLASS.get(tags.get("highway"))

    meta = {"origin": ORIGIN, "layers": {}}
    for name, cls in [("chi_major", road), ("chi_streets", road)]:
        p = osm / f"{name}.json"
        if p.exists():
            segs, names = ways_to_segments(p, cls)
            write_segments(segs, geo / f"{name}.bin")
            meta["layers"][name] = {"count": len(segs)}
            if name == "chi_major":
                # a few street names with a point on them, for labels
                keep = ["North State Street", "South State Street", "West Madison Street", "East Madison Street",
                        "North Lake Shore Drive", "South Lake Shore Drive", "Dan Ryan Expressway", "Kennedy Expressway",
                        "Eisenhower Expressway", "Stevenson Expressway", "North Michigan Avenue", "South Michigan Avenue"]
                meta["names"] = {k: names[k][len(names[k]) // 2] for k in keep if k in names}
    # motorway and trunk carriageways as ordered polylines, for traffic that moves along them
    p = osm / "chi_major.json"
    if p.exists():
        ways = []
        for el in json.loads(p.read_text(encoding="utf-8"))["elements"]:
            t = el.get("tags", {})
            if el.get("type") == "way" and "geometry" in el and t.get("highway") in ("motorway", "trunk", "primary"):
                pts = [proj(g["lat"], g["lon"]) for g in el["geometry"]]
                L = sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(pts, pts[1:]))
                if L < 150:
                    continue
                ways.append({"c": {"motorway": 0, "trunk": 1, "primary": 2}[t["highway"]], "oneway": t.get("oneway") == "yes" or t["highway"] == "motorway",
                             "name": t.get("name", ""), "lanes": int(t.get("lanes", "2").split(";")[0]) if t.get("lanes", "2").split(";")[0].isdigit() else 2,
                             "pts": [[round(x, 1), round(y, 1)] for x, y in pts]})
        (geo / "chi_traffic.json").write_text(json.dumps(ways), encoding="utf-8")
        print(f"traffic ways: {len(ways)} ({sum(1 for w in ways if w['c'] == 0)} motorway)")
    extra = {"chi_rail": lambda t: {"rail": 0, "subway": 1, "light_rail": 2}.get(t.get("railway")),
             "chi_water": lambda t: 0 if t.get("natural") == "coastline" else (1 if t.get("waterway") else None),
             "chi_power": lambda t: {"line": 0, "minor_line": 1, "cable": 2}.get(t.get("power"), 3 if t.get("power") == "substation" else None),
             "ord_runways": lambda t: {"runway": 0, "taxiway": 1}.get(t.get("aeroway"))}
    for name, cls in extra.items():
        p = osm / f"{name}.json"
        if p.exists():
            segs, _ = ways_to_segments(p, cls)
            write_segments(segs, geo / f"{name}.bin")
            meta["layers"][name] = {"count": len(segs)}
    # runways with their widths and refs, for markings
    p = osm / "ord_runways.json"
    if p.exists():
        rw = []
        for el in json.loads(p.read_text(encoding="utf-8"))["elements"]:
            t = el.get("tags", {})
            if t.get("aeroway") == "runway" and "geometry" in el:
                pts = [proj(g["lat"], g["lon"]) for g in el["geometry"]]
                rw.append({"ref": t.get("ref", ""), "width": float(t.get("width", "45").split()[0]), "pts": pts})
        meta["runways"] = rw
    # buildings with heights for the skyline. Towers mapped as parts (Willis's tubes, Trump's
    # setbacks) also have an outline over all of them; drawing both, their walls would fight, so an
    # outline that has parts inside it is dropped and its parts drawn, each from its own base height
    p = osm / "chi_loop_buildings.json"
    if p.exists():
        def metres(v):
            if not v:
                return None
            v = str(v).strip().lower().replace(",", ".")
            k = 0.3048 if ("ft" in v or "'" in v) else 1.0
            num = "".join(ch for ch in v.split(";")[0] if ch in "0123456789.")
            try:
                return float(num) * k if num else None
            except ValueError:
                return None
        recs = []
        for el in json.loads(p.read_text(encoding="utf-8"))["elements"]:
            t = el.get("tags", {})
            if "geometry" not in el:
                continue
            lv = metres(t.get("building:levels"))
            h = metres(t.get("height")) or (lv * 3.6 if lv else None)
            if not h:
                continue
            ml = metres(t.get("building:min_level"))
            hmin = metres(t.get("min_height")) or (ml * 3.6 if ml else 0.0)
            pts = [proj(g["lat"], g["lon"]) for g in el["geometry"]]
            part = "building:part" in t and "building" not in t
            recs.append({"part": part, "h": h, "hmin": min(hmin, h - 1), "name": t.get("name", ""), "pts": pts})
        def inside(x, y, poly):
            c = False
            for i in range(len(poly)):
                (x1, y1), (x2, y2) = poly[i], poly[(i + 1) % len(poly)]
                if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
                    c = not c
            return c
        parts = [r for r in recs if r["part"]]
        cents = [(sum(q[0] for q in r["pts"]) / len(r["pts"]), sum(q[1] for q in r["pts"]) / len(r["pts"])) for r in parts]
        bl, dropped = [], 0
        for r in recs:
            if not r["part"]:
                xs, ys = [q[0] for q in r["pts"]], [q[1] for q in r["pts"]]
                bx = (min(xs), max(xs), min(ys), max(ys))
                if any(bx[0] <= cx <= bx[1] and bx[2] <= cy <= bx[3] and inside(cx, cy, r["pts"]) for cx, cy in cents):
                    dropped += 1
                    continue
            bl.append({"h": round(r["h"], 1), "hmin": round(r["hmin"], 1), "name": r["name"], "pts": [[round(x, 1), round(y, 1)] for x, y in r["pts"]]})
        (geo / "chi_loop_buildings.json").write_text(json.dumps(bl), encoding="utf-8")
        print(f"buildings: {len(bl)} ({len(parts)} parts; {dropped} outlines replaced by their parts)")
    (geo / "chicago.json").write_text(json.dumps(meta), encoding="utf-8")

    # Natural Earth countries (1:50m) with ISO codes, lon/lat rings, simplified a little
    ne = json.loads((media / "raw" / "naturalearth" / "ne_50m_admin_0_countries.geojson").read_text(encoding="utf-8"))
    countries = []
    for f in ne["features"]:
        pr = f["properties"]
        iso = pr.get("ISO_A3") if pr.get("ISO_A3") not in (None, "-99") else pr.get("ADM0_A3")
        g = f["geometry"]
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        rings = []
        for poly in polys:
            for ring in poly:
                pts = ring[::2] if len(ring) > 60 else ring
                rings.append([[round(x, 3), round(y, 3)] for x, y in pts])
        countries.append({"iso": iso, "name": pr.get("NAME"), "pop": pr.get("POP_EST"), "rings": rings})
    (geo / "countries.json").write_text(json.dumps(countries), encoding="utf-8")
    print(f"countries: {len(countries)}")

    # cities: Natural Earth populated places with population
    pp = json.loads((media / "raw" / "naturalearth" / "ne_10m_populated_places_simple.geojson").read_text(encoding="utf-8"))
    cities = []
    for f in pp["features"]:
        pr = f["properties"]
        pop = pr.get("pop_max") or 0
        if pop >= 300000:
            lon, lat = f["geometry"]["coordinates"][:2]
            cities.append({"name": pr.get("name"), "iso": pr.get("adm0_a3"), "pop": pop, "lon": round(lon, 3), "lat": round(lat, 3)})
    cities.sort(key=lambda c: -c["pop"])
    (geo / "cities.json").write_text(json.dumps(cities), encoding="utf-8")
    print(f"cities >= 300k: {len(cities)}; largest {cities[0]['name']} {cities[0]['pop']:,d}")

    # flights out of O'Hare (OpenFlights, 2014)
    ap = {}
    for line in (media / "raw" / "openflights" / "airports.dat").read_text(encoding="utf-8", errors="replace").splitlines():
        try:
            parts = list(csv_split(line))
            ap[parts[4]] = {"name": parts[1], "city": parts[2], "country": parts[3], "lat": float(parts[6]), "lon": float(parts[7])}
        except Exception:  # noqa: BLE001
            continue
    dests = {}
    for line in (media / "raw" / "openflights" / "routes.dat").read_text(encoding="utf-8", errors="replace").splitlines():
        parts = line.split(",")
        if len(parts) > 4 and parts[2] == "ORD" and parts[4] in ap:
            dests[parts[4]] = ap[parts[4]]
    allroutes = []
    for line in (media / "raw" / "openflights" / "routes.dat").read_text(encoding="utf-8", errors="replace").splitlines():
        parts = line.split(",")
        if len(parts) > 4 and parts[2] in ap and parts[4] in ap and parts[2] < parts[4]:
            a, b = ap[parts[2]], ap[parts[4]]
            allroutes.append([round(a["lon"], 2), round(a["lat"], 2), round(b["lon"], 2), round(b["lat"], 2)])
    uniq = sorted({tuple(r) for r in allroutes})
    (geo / "flights.json").write_text(json.dumps({"ord": ap.get("ORD"), "fromORD": list(dests.values()), "routes": uniq}), encoding="utf-8")
    print(f"flights: {len(dests)} destinations from ORD, {len(uniq)} distinct routes worldwide")


def csv_split(line):
    out, cur, q = [], "", False
    for ch in line:
        if ch == '"':
            q = not q
        elif ch == "," and not q:
            out.append(cur); cur = ""
        else:
            cur += ch
    out.append(cur)
    return out


if __name__ == "__main__":
    main()
