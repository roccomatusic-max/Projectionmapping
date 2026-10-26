"""Scene playlists: scene groups that take turns through the night.

A playlist is a list of steps, each a clock time, a scene group and a fade:
"Spooky from 6:45 PM, Pumpkins from 8:00 PM, Quiet from 9:30 PM, fading
over 5 seconds". A show time (the weekly one, or a calendar entry) can play
a playlist instead of a single group.

Step times are read against the show time they play in:

* A time on or after the start plays that evening; a time a few hours
  before the start (6:30 for a 6:45 show) counts as the start itself.
* Any other earlier time is after midnight (00:30 in a 6 PM to 1 AM show).
* Before the first step's time, the first step plays.

The scheduler in services/tonight.py moves the projectors on to each step
as its time comes, crossfading the scenes over the step's fade.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time, timedelta
from typing import Any

#: A step this long before the show starts counts as the start.
EARLY = timedelta(hours=6)
#: The most steps one playlist holds.
MAX_STEPS = 24
#: The longest fade, in seconds (the transport's own limit).
MAX_FADE = 30.0


@dataclass(frozen=True)
class TimedStep:
    """One step placed on a night: from ``at``, play ``group_id``."""

    index: int
    at: datetime
    group_id: int | None
    fade_seconds: float


def night_order(value: str) -> int:
    """Minutes into the night, noon to noon, so 00:30 sorts after 23:00."""
    hours, minutes = (int(part) for part in value.split(":"))
    return ((hours - 12) % 24) * 60 + minutes


def clean_steps(steps: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Steps as stored: in the night's order, fades within limits."""
    out = [{"at": s["at"], "group_id": s.get("group_id"),
            "fade_seconds": max(0.0, min(float(s.get("fade_seconds") or 0), MAX_FADE))}
           for s in steps]
    return sorted(out, key=lambda s: night_order(s["at"]))


def place(at: str, start: datetime) -> datetime:
    """A step's clock time as a moment in the show time starting at ``start``."""
    hours, minutes = (int(part) for part in at.split(":"))
    moment = datetime.combine(start.date(), time(hours, minutes), tzinfo=start.tzinfo)
    if moment < start:
        moment = start if start - moment <= EARLY else moment + timedelta(days=1)
    return moment


def timeline(steps: list[dict[str, Any]], start: datetime) -> list[TimedStep]:
    """The steps of a show time starting at ``start``, in the order they play."""
    placed = [TimedStep(i, place(s["at"], start), s.get("group_id"),
                        float(s.get("fade_seconds") or 0))
              for i, s in enumerate(steps or []) if s.get("group_id") is not None]
    return sorted(placed, key=lambda s: (s.at, s.index))


def active(steps: list[TimedStep], now: datetime) -> int | None:
    """Which of ``steps`` (by place in the list) plays at ``now``."""
    if not steps:
        return None
    playing = 0
    for place_in_list, step in enumerate(steps):
        if step.at <= now:
            playing = place_in_list
    return playing
