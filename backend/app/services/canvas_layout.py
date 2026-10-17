"""Where a new output sits on the canvas.

Each output shows one slice of the canvas (its source rect). Without a
layout every new output would cover the whole canvas, so several outputs
would sit exactly on top of each other in the editor and every projector
would show the same picture. New outputs are therefore laid out side by
side, left to right, as long as the show still uses that automatic
layout. Once someone has placed the outputs by hand, theirs is kept and
only the new output starts at the full canvas.
"""

from __future__ import annotations

FULL = {"x": 0.0, "y": 0.0, "w": 1.0, "h": 1.0}

_TOLERANCE = 1e-4


def even_split(count: int) -> list[dict[str, float]]:
    """``count`` equal slices of the canvas, left to right, no overlap."""
    return [{"x": i / count, "y": 0.0, "w": 1 / count, "h": 1.0} for i in range(count)]


def _same(a: dict, b: dict) -> bool:
    return all(abs(float(a.get(k, FULL[k])) - b[k]) < _TOLERANCE for k in FULL)


def is_automatic(sources: list[dict]) -> bool:
    """True while nobody has placed these outputs by hand.

    That is either the automatic side-by-side layout, or every output still
    covering the whole canvas (shows made before outputs were laid out).
    """
    if not sources:
        return True
    if all(_same(s, FULL) for s in sources):
        return True
    return all(_same(s, t) for s, t in zip(sources, even_split(len(sources)), strict=True))
