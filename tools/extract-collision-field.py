#!/usr/bin/env python3
"""Extract collision pixels from the generated guide image.

This is the non-hand-authored path:
1. read a registered collision guide PNG,
2. classify colored pixels by role,
3. write a compact JSON field that can be consumed by the game or tooling.

The browser currently reads the PNG directly, but this script makes the same
classification reproducible and inspectable.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image


def classify(r: int, g: int, b: int) -> str | None:
    if max(r, g, b) < 72:
        return None
    if g > 120 and g > r * 1.25 and g > b * 1.1:
        return "rail"
    if b > 120 and g > 100 and r < 80:
        return "post"
    if r > 150 and g > 70 and b < 90:
        return "flipper"
    if r > 130 and g < 80 and b < 90:
        return "dead"
    return "rail"


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: extract-collision-field.py <collision-guide.png> <out.json>", file=sys.stderr)
        return 2

    source = Path(sys.argv[1])
    out = Path(sys.argv[2])
    image = Image.open(source).convert("RGBA")
    width, height = image.size
    pixels = image.load()

    runs = []
    counts = {"rail": 0, "post": 0, "flipper": 0, "dead": 0}
    for y in range(height):
        x = 0
        while x < width:
            kind = classify(*pixels[x, y][:3])
            if kind is None:
                x += 1
                continue
            start = x
            while x + 1 < width and classify(*pixels[x + 1, y][:3]) == kind:
                x += 1
            end = x
            runs.append([y, start, end, kind])
            counts[kind] += end - start + 1
            x += 1

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        json.dumps(
            {
                "source": str(source),
                "width": width,
                "height": height,
                "encoding": "horizontal-runs",
                "counts": counts,
                "runs": runs,
            },
            separators=(",", ":"),
        )
    )
    print(json.dumps({"out": str(out), "runs": len(runs), "counts": counts}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
