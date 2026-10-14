"""Chicago's daily mean temperature for one year, from the Open-Meteo archive (ERA5 reanalysis).

    python -I fetch_weather.py <out.json> [year]

Credit: Open-Meteo.com (CC BY 4.0), ERA5 by Copernicus Climate Change Service.
"""
import hashlib
import json
import sys
import time
import urllib.request
from pathlib import Path


def main():
    out = Path(sys.argv[1])
    year = sys.argv[2] if len(sys.argv) > 2 else "2023"
    url = ("https://archive-api.open-meteo.com/v1/archive?latitude=41.9786&longitude=-87.9048"
           f"&start_date={year}-01-01&end_date={year}-12-31&daily=temperature_2m_mean,temperature_2m_max,temperature_2m_min"
           "&timezone=America%2FChicago")
    raw = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "landsailor-film"}), timeout=60).read()
    d = json.loads(raw)
    days = d["daily"]
    t = days["temperature_2m_mean"]
    print(f"{len(t)} days, min {min(t)} max {max(t)} mean {sum(t) / len(t):.1f}")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"place": "Chicago O'Hare", "year": int(year), "mean": t,
                               "max": days["temperature_2m_max"], "min": days["temperature_2m_min"],
                               "source": "Open-Meteo.com historical weather API (ERA5), CC BY 4.0", "url": url,
                               "sha1": hashlib.sha1(raw).hexdigest(), "fetched": time.strftime("%Y-%m-%d")}), encoding="utf-8")


if __name__ == "__main__":
    main()
