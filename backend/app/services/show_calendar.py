"""The show calendar: which show times each night has.

Only the calendar plans shows. Each entry is one night, or a run of nights
with an end (every night, or only the weekdays picked), with a scene group
or playlist and its own times; or a "no show" entry that takes nights out
of a run. A night nobody put a show on has no show. Nothing repeats on its
own: the old weekly show time (``ShowPlan.enabled``/``start_at``/``days``)
no longer plans anything.

For any one night the rules are:

* The more specific entry wins: one date beats a week, a week beats a
  month. Between equally specific entries the newest wins.
* A "no show" entry cancels every less specific show that night, so
  "No shows Nov 2 to 8" plus "Party on Nov 5" still plays the party.
* Shows that would overlap a winning show that night are left out.

``slots_for_night`` turns that into the night's show times, which the
scheduler in services/tonight.py starts and stops.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta

from sqlalchemy import select

from app.db.models import ShowCalendarEntry, ShowPlan
from app.services.playlists import TimedStep, active, timeline

#: How far ahead "next show" looks for a calendar entry.
LOOKAHEAD_DAYS = 400


@dataclass(frozen=True)
class Slot:
    """One show time: from ``start`` to ``end``, starting on ``night``."""

    night: date
    start: datetime
    end: datetime
    #: Always "calendar" now; "weekly" was the old weekly show time and
    #: still names past nights in the show history.
    source: str
    entry_id: int | None
    show_id: int | None
    group_id: int | None
    power: bool
    title: str
    #: A playlist plays instead of the group when set.
    playlist_id: int | None = None

    @property
    def key(self) -> str:
        where = "weekly" if self.entry_id is None else f"entry{self.entry_id}"
        return f"{self.night.isoformat()}:{where}"


@dataclass
class Night:
    night: date
    slots: list[Slot] = field(default_factory=list)
    #: The "no show" entry that keeps this night dark, if one does.
    cancelled_by: ShowCalendarEntry | None = None
    #: Shows planned for the night that do not play, and why.
    skipped: list[tuple[int | None, str, str]] = field(default_factory=list)


def parse_time(value: str | None) -> time | None:
    if not value:
        return None
    hours, minutes = value.split(":")
    return time(int(hours), int(minutes))


def parse_date(value: str | None) -> date | None:
    return date.fromisoformat(value) if value else None


def span(start_t: time, end_t: time, night: date, tz) -> tuple[datetime, datetime]:
    start = datetime.combine(night, start_t, tzinfo=tz)
    end = datetime.combine(night, end_t, tzinfo=tz)
    if end <= start:
        end += timedelta(days=1)  # ends after midnight
    return start, end


def applies(entry: ShowCalendarEntry, night: date) -> bool:
    first = parse_date(entry.start_date)
    last = parse_date(entry.end_date)
    if first is None or night < first or (last is not None and night > last):
        return False
    return night.weekday() in (entry.days or [])


def _rank(entry: ShowCalendarEntry) -> tuple[int, int]:
    """Most specific first: the fewest dates, then the newest."""
    first = parse_date(entry.start_date)
    last = parse_date(entry.end_date)
    length = (last - first).days if first and last else 1_000_000
    return length, -(entry.id or 0)


def entry_title(entry: ShowCalendarEntry, group_names: dict[int, str],
                playlist_names: dict[int, str] | None = None) -> str:
    if entry.title:
        return entry.title
    if entry.kind == "off":
        return "No show"
    if entry.playlist_id and playlist_names and entry.playlist_id in playlist_names:
        return playlist_names[entry.playlist_id]
    return group_names.get(entry.group_id or 0) or "Show"


def resolve_night(entries: list[ShowCalendarEntry], night: date, tz,
                  group_names: dict[int, str],
                  playlist_names: dict[int, str] | None = None) -> Night:
    out = Night(night)
    here = sorted((e for e in entries if applies(e, night)), key=_rank)
    for entry in here:
        title = entry_title(entry, group_names, playlist_names)
        if out.cancelled_by is not None:
            off = entry_title(out.cancelled_by, group_names)
            out.skipped.append((entry.id, title,
                                "no show this night" if off == "No show" else f"{off}: no show"))
            continue
        if entry.kind == "off":
            out.cancelled_by = entry
            continue
        start_t, end_t = parse_time(entry.start_at), parse_time(entry.end_at)
        if start_t is None or end_t is None or entry.show_id is None:
            continue
        start, end = span(start_t, end_t, night, tz)
        clash = next((s for s in out.slots if start < s.end and s.start < end), None)
        if clash is not None:
            out.skipped.append((entry.id, title, f"overlaps {clash.title}"))
            continue
        playlist_id = entry.playlist_id if entry.playlist_id in (playlist_names or {}) else None
        out.slots.append(Slot(night, start, end, "calendar", entry.id, entry.show_id,
                              entry.group_id, entry.power, title, playlist_id))
    out.slots.sort(key=lambda s: s.start)
    return out


class Planner:
    """Everything a night needs, read once: the plan, entries, groups and playlists."""

    def __init__(self, plan: ShowPlan, entries: list[ShowCalendarEntry],
                 group_names: dict[int, str],
                 playlists: dict[int, tuple[str, list]] | None = None) -> None:
        self.plan = plan
        self.entries = entries
        self.group_names = group_names
        #: {playlist id: (name, steps)}.
        self.playlists = playlists or {}
        self.playlist_names = {pid: name for pid, (name, _) in self.playlists.items()}

    @classmethod
    async def load(cls, session, plan: ShowPlan) -> Planner:
        from app.db.models import MappingPlaylist, MappingSceneGroup

        entries = list((await session.execute(
            select(ShowCalendarEntry).order_by(ShowCalendarEntry.id))).scalars().all())
        names = dict((await session.execute(
            select(MappingSceneGroup.id, MappingSceneGroup.name))).all())
        playlists = {pid: (name, list(steps or [])) for pid, name, steps in (await session.execute(
            select(MappingPlaylist.id, MappingPlaylist.name, MappingPlaylist.steps))).all()}
        return cls(plan, entries, names, playlists)

    def night(self, night: date, tz) -> Night:
        return resolve_night(self.entries, night, tz, self.group_names, self.playlist_names)

    def steps(self, slot: Slot) -> list[TimedStep]:
        """The playlist steps of a show time, placed on its night; [] without one."""
        if slot.playlist_id is None or slot.playlist_id not in self.playlists:
            return []
        return timeline(self.playlists[slot.playlist_id][1], slot.start)

    def group_at(self, slot: Slot, now: datetime) -> tuple[int | None, TimedStep | None]:
        """The scene group a show time plays at ``now``, and the playlist step it comes from."""
        steps = self.steps(slot)
        index = active(steps, now)
        if index is None:
            return slot.group_id, None
        return steps[index].group_id, steps[index]

    def slots(self, night: date, tz) -> list[Slot]:
        return self.night(night, tz).slots

    def recent(self, now: datetime) -> list[Slot]:
        """Yesterday's and today's show times (yesterday's may run past midnight)."""
        return [s for d in (now.date() - timedelta(days=1), now.date())
                for s in self.slots(d, now.tzinfo)]

    def current(self, now: datetime) -> Slot | None:
        """The show time on now; the latest started if two overlap at midnight."""
        running = [s for s in self.recent(now) if s.start <= now < s.end]
        return max(running, key=lambda s: s.start) if running else None

    def next_start(self, now: datetime) -> Slot | None:
        if not self.entries:
            return None
        for offset in range(LOOKAHEAD_DAYS):
            for slot in self.slots(now.date() + timedelta(days=offset), now.tzinfo):
                if slot.start > now:
                    return slot
        return None

    def anything_planned(self, today: date) -> bool:
        """Whether the show will ever start by itself from today on."""
        return any(e.kind == "show" and (e.end_date is None or e.end_date >= today.isoformat())
                   for e in self.entries)
