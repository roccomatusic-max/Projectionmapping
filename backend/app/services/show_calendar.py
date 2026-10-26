"""The show calendar: which show times each night has.

Two things plan a night. The weekly show time (``ShowPlan``: "6 to 11 PM,
every night") and calendar entries (``ShowCalendarEntry``): one date, a run
of dates, or repeating weekdays, each with a scene group and its own times,
or a "no show" entry that keeps a night dark.

For any one night the rules are:

* If the calendar has anything for the night, the calendar decides and the
  weekly show time is not used that night.
* The more specific entry wins: one date beats a week, a week beats a
  repeat with no end. Between equally specific entries the newest wins.
* A "no show" entry cancels every less specific show that night, so
  "No shows in November" plus "Party on Nov 14" still plays the party.
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
    #: "weekly" (the weekly show time) or "calendar".
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


def weekly_slot(plan: ShowPlan, night: date, tz, group_names: dict[int, str],
                playlist_names: dict[int, str] | None = None) -> Slot | None:
    start_t, end_t = parse_time(plan.start_at), parse_time(plan.end_at)
    if (not plan.enabled or start_t is None or end_t is None
            or night.weekday() not in (plan.days or [])):
        return None
    start, end = span(start_t, end_t, night, tz)
    playlist = (playlist_names or {}).get(plan.playlist_id or 0)
    return Slot(night, start, end, "weekly", None, plan.show_id, plan.group_id, plan.power,
                playlist or group_names.get(plan.group_id or 0) or "Weekly show time",
                plan.playlist_id if playlist else None)


def resolve_night(plan: ShowPlan, entries: list[ShowCalendarEntry], night: date, tz,
                  group_names: dict[int, str],
                  playlist_names: dict[int, str] | None = None) -> Night:
    out = Night(night)
    here = sorted((e for e in entries if applies(e, night)), key=_rank)
    if not here:
        weekly = weekly_slot(plan, night, tz, group_names, playlist_names)
        if weekly is not None:
            out.slots.append(weekly)
        return out
    for entry in here:
        title = entry_title(entry, group_names, playlist_names)
        if out.cancelled_by is not None:
            out.skipped.append((entry.id, title,
                                f"{entry_title(out.cancelled_by, group_names)}: no show"))
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
    if weekly_slot(plan, night, tz, group_names) is not None:
        out.skipped.append((None, "Weekly show time", "the calendar has this night"))
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
        return resolve_night(self.plan, self.entries, night, tz, self.group_names,
                             self.playlist_names)

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
        # The weekly plan repeats every week; past that only entries can start.
        horizon = LOOKAHEAD_DAYS if self.entries else 8
        for offset in range(horizon):
            for slot in self.slots(now.date() + timedelta(days=offset), now.tzinfo):
                if slot.start > now:
                    return slot
        return None

    def anything_planned(self, today: date) -> bool:
        """Whether the show will ever start by itself from today on."""
        if self.plan.enabled and self.plan.start_at and self.plan.end_at:
            return True
        return any(e.kind == "show" and (e.end_date is None or e.end_date >= today.isoformat())
                   for e in self.entries)
