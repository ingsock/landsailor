"""Tile stills into one contact sheet, labelled by file name.

    python -I montage.py <out.jpg> <cols> <width_per_tile> img1.png img2.png ...
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw


def main():
    out, cols, tw = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
    files = sys.argv[4:]
    ims = [Image.open(f).convert("RGB") for f in files]
    th = int(tw * ims[0].height / ims[0].width)
    rows = (len(ims) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * (tw + 4) + 4, rows * (th + 22) + 4), (20, 20, 20))
    dr = ImageDraw.Draw(sheet)
    for i, (im, f) in enumerate(zip(ims, files)):
        x, y = 4 + (i % cols) * (tw + 4), 4 + (i // cols) * (th + 22)
        sheet.paste(im.resize((tw, th), Image.LANCZOS), (x, y))
        dr.text((x + 3, y + th + 4), Path(f).stem, fill=(200, 200, 200))
    sheet.save(out, quality=90)
    print(out, sheet.size)


if __name__ == "__main__":
    main()
