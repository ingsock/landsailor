"""Our World in Data tables -> data/charts.json, the series the film draws.

    python -I prep_charts.py <raw_dir> <out.json>

Each chart keeps its title, unit, source line (from the table's metadata), and for each entity
its years and values. Countries are kept by ISO code where a map needs them.
"""
import csv
import json
import sys
from pathlib import Path

PEOPLE = ["World", "United States", "United Kingdom", "Japan", "China", "India", "Brazil", "Nigeria",
          "South Korea", "Germany", "Ethiopia", "Bangladesh", "Mexico", "Indonesia", "Egypt", "Russia"]

# key: (slug, column, entities ('*' = every country with a code), first year, scale)
CHARTS = {
    "life": ("life-expectancy", "Life expectancy", PEOPLE, 1770, 1),
    "child": ("child-mortality", "Under-five mortality rate (selected)", PEOPLE, 1800, 1),
    "elec": ("share-of-the-population-with-access-to-electricity", "Share of the population with access to electricity", "*", 1990, 1),
    "air": ("air-passengers-carried", "Air transport, passengers carried", ["World"], 1970, 1e-9),
    "poverty": ("share-of-population-living-in-extreme-poverty-cost-of-basic-needs", "Share in extreme poverty", ["World"], 1820, 1),
    "poverty3": ("share-of-population-in-extreme-poverty", "Share of population in poverty ($3 a day)", ["World"], 1990, 1),
    "cereal": ("cereal-yield", "Cereals - Yield (tonnes per hectare)", PEOPLE, 1961, 1),
    "wheat": ("wheat-yields", "Wheat yield", ["World", "United Kingdom", "France", "India", "China", "United States"], 1961, 1),
    "co2": ("annual-co2-emissions-per-country", "Annual CO₂ emissions", ["World", "United States", "China", "India", "United Kingdom", "Germany", "Japan"], 1750, 1e-9),
    "co2cum": ("cumulative-co-emissions", "Cumulative CO₂ emissions", ["World"], 1750, 1e-9),
    "temp": ("temperature-anomaly", "Average", ["World"], 1850, 1),
    "literacy": ("cross-country-literacy-rates", "Literacy rate", PEOPLE, 1820, 1),
    "urban": ("urbanization-last-500-years", "Population share in urban areas", PEOPLE, 1700, 1),
    "kcal": ("daily-per-capita-caloric-supply", "Daily calorie supply per person", PEOPLE, 1961, 1),
    "fruit": ("fruit-consumption-per-capita", "Fruit supply per person", PEOPLE, 1961, 1),
    "internet": ("share-of-individuals-using-the-internet", "Share of the population using the Internet", "*", 1990, 1),
    "transistors": ("transistors-per-microprocessor", "Transistors per microprocessor", ["World"], 1971, 1),
    "solar": ("solar-pv-prices", "Solar PV module cost", ["World"], 1975, 1),
    "genome": ("cost-of-sequencing-a-full-human-genome", "Cost of sequencing a full human genome", ["World"], 2001, 1),
    "trade": ("merchandise-exports-gdp-cepii", None, ["World"], 1827, 1),
    "median": ("median-age", "Median age", PEOPLE, 1950, 1),
    "lpi": ("global-living-planet-index", "Central estimate", ["World"], 1970, 1),
    "renew": ("share-electricity-renewables", "Renewables", ["World"], 1965, 1),
    "nuclear": ("nuclear-energy-generation", "Nuclear", ["World"], 1960, 1),
    "fatal": ("fatal-airliner-accidents-per-million-flights", "Fatal accidents per million commercial flights", ["World"], 1970, 1),
    "pop": ("population", "Population", ["World"], 1700, 1e-9),
}

ENERGY_COLS = ["Traditional biomass", "Coal", "Oil", "Gas", "Nuclear", "Hydropower", "Wind", "Solar", "Biofuels", "Other renewables"]
DECOUPLE = ["United Kingdom", "United States", "Germany", "France", "Sweden", "Denmark", "China", "India"]


def read(raw, slug):
    with open(raw / f"{slug}.csv", encoding="utf-8") as f:
        rows = list(csv.reader(f))
    meta = json.loads((raw / f"{slug}.metadata.json").read_text(encoding="utf-8"))
    return rows[0], rows[1:], meta


def source_line(meta):
    cols = meta.get("columns") or {}
    for c in cols.values():
        cite = c.get("citationShort") or c.get("attributionShort") or c.get("sourceName")
        if cite:
            return cite
    return meta.get("chart", {}).get("citation", "")


def num(x):
    try:
        return float(x)
    except ValueError:
        return None


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    raw, out = Path(sys.argv[1]), Path(sys.argv[2])
    charts = {}
    for key, (slug, col, ents, y0, k) in CHARTS.items():
        head, body, meta = read(raw, slug)
        ci = head.index(col) if col else 3
        series = {}
        codes = {}
        for r in body:
            ent, code, yr = r[0], r[1], r[2]
            v = num(r[ci]) if ci < len(r) else None
            if v is None or not yr.lstrip("-").isdigit() or int(yr) < y0:
                continue
            if ents == "*":
                if not code or code.startswith("OWID") and ent != "World":
                    continue
            elif ent not in ents:
                continue
            series.setdefault(ent, [[], []])
            series[ent][0].append(int(yr))
            series[ent][1].append(round(v * k, 6))
            codes[ent] = code
        title = meta.get("chart", {}).get("title") or meta.get("title") or slug
        charts[key] = {"slug": slug, "title": title, "column": head[ci], "source": source_line(meta),
                       "url": f"https://ourworldindata.org/grapher/{slug}", "codes": codes, "series": series}
        w = series.get("World")
        span = f"World {w[0][0]}-{w[0][-1]} {w[1][0]} -> {w[1][-1]}" if w else f"{len(series)} entities"
        print(f"{key:12s} {slug:52s} {span}")

    # the long-run poverty table stores counts (people in / not in extreme poverty): make it a share
    head, body, meta = read(raw, "share-of-population-living-in-extreme-poverty-cost-of-basic-needs")
    ii, ni = head.index("Share in extreme poverty"), head.index("Share not in extreme poverty")
    ys, vs = [], []
    for r in body:
        if r[0] == "World" and num(r[ii]) is not None and num(r[ni]) is not None:
            a, b = num(r[ii]), num(r[ni])
            ys.append(int(r[2])); vs.append(round(100 * a / (a + b), 3))
    charts["poverty"]["series"] = {"World": [ys, vs]}
    charts["poverty"]["column"] = "Share of people in extreme poverty (cost of basic needs), %"
    print(f"{'poverty %':12s} World {ys[0]} {vs[0]:.1f}% -> {ys[-1]} {vs[-1]:.1f}%")

    # stacked energy by source, World
    head, body, meta = read(raw, "global-primary-energy")
    idx = {c: head.index(c) for c in ENERGY_COLS}
    years, layers = [], {c: [] for c in ENERGY_COLS}
    for r in body:
        if r[0] != "World":
            continue
        years.append(int(r[2]))
        for c in ENERGY_COLS:
            layers[c].append(round(num(r[idx[c]]) or 0.0, 3))
    charts["energy"] = {"slug": "global-primary-energy", "title": meta.get("chart", {}).get("title", "Global primary energy consumption by source"),
                        "source": source_line(meta), "url": "https://ourworldindata.org/grapher/global-primary-energy",
                        "years": years, "layers": layers}
    print(f"{'energy':12s} {years[0]}-{years[-1]} {len(years)} years")

    # decoupling: GDP and CO2 change since 1990 per country
    head, body, meta = read(raw, "co2-emissions-and-gdp")
    gi, ci = head.index("GDP"), head.index("CO₂ emissions")
    dec = {}
    for r in body:
        if r[0] in DECOUPLE:
            g, c = num(r[gi]), num(r[ci])
            if g is None or c is None:
                continue
            d = dec.setdefault(r[0], {"years": [], "gdp": [], "co2": []})
            d["years"].append(int(r[2])); d["gdp"].append(round(g, 3)); d["co2"].append(round(c, 3))
    charts["decouple"] = {"slug": "co2-emissions-and-gdp", "title": meta.get("chart", {}).get("title", "Change in CO₂ emissions and GDP"),
                          "source": source_line(meta), "url": "https://ourworldindata.org/grapher/co2-emissions-and-gdp", "series": dec}
    uk = dec.get("United Kingdom")
    print(f"{'decouple':12s} UK {uk['years'][0]}-{uk['years'][-1]} gdp {uk['gdp'][-1]} co2 {uk['co2'][-1]}")
    out.write_text(json.dumps(charts, ensure_ascii=False), encoding="utf-8")
    print("wrote", out, f"{out.stat().st_size:,d} B")


if __name__ == "__main__":
    main()
