"""Pictures for the film from the borrowed files.

    python -I prep_images.py <media_dir>

- NASA Black Marble 2016 (grayscale, 13500x6750) -> media/img/nightlights_8k.jpg (8192x4096),
  the whole Earth's lights for the globe.
"""
import sys
from pathlib import Path

from PIL import Image

Image.MAX_IMAGE_PIXELS = None


def main():
    media = Path(sys.argv[1])
    out = media / "img"
    out.mkdir(parents=True, exist_ok=True)
    src = media / "raw" / "nasa" / "BlackMarble_2016_3km_gray.jpg"
    im = Image.open(src).convert("L")
    print("source", im.size)
    im.resize((8192, 4096), Image.LANCZOS).save(out / "nightlights_8k.jpg", quality=92)
    print("wrote", out / "nightlights_8k.jpg")


if __name__ == "__main__":
    main()
