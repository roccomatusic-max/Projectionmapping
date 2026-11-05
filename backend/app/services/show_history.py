"""Show history: a record of every show time, an energy report, season wrap-ups.

The recorder listens to the show transport. The moment the show starts
playing it opens a record (a ``ShowNight``), notes each cue and scene it
goes through, watches the show's mini PCs, and closes the record when the
show stops. Tonight's show adds what it knows: the show time's name, its
planned times and who started it (services/tonight.py calls
:meth:`Recorder.note_start` and friends). A planned show time that passed
without starting is recorded too, as "missed".

When a record closes, the hours each projector was on, the hottest
temperatures and the problems in the event log are worked out and kept in
the record, because the temperature samples are pruned after a month and a
season wrap-up looks back further than that.

Hours on come from the power samples the monitor writes on the operational
poll. They are counted per hour of the day: the share of samples that said
"on", times the part of the hour the samples cover. That holds up when
polls run late or the server was off for part of the hour.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import re
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from typing import Any

from sqlalchemy import func, select

from app.config import settings
from app.core.events import bus
from app.core.lifecycle import stop_task
from app.db.models import (
    Alert,
    Event,
    HistorySettings,
    MappingOutput,
    MappingPlayer,
    MappingShow,
    Projector,
    Severity,
    ShowCalendarEntry,
    ShowNight,
    Telemetry,
    as_utc,
    utcnow,
)
from app.db.session import session_scope

log = logging.getLogger(__name__)

TICK_SECONDS = 30
#: A show that starts again this soon after it stopped carries on the same
#: record (a blackout pressed by mistake, a server restart mid-show).
REJOIN = timedelta(minutes=15)
#: A planned show time is "missed" this long after its end with no show.
MISSED_AFTER = timedelta(minutes=10)
#: Hours before this local hour belong to the night before.
NIGHT_STARTS_HOUR = 6
#: Shows shorter than this (a quick test from Run the show) are listed but
#: not counted as a night played in a wrap-up.
SHORT_SHOW = timedelta(minutes=10)
#: A mini PC is reported once it has been out of touch this long.
MINIPC_GRACE = timedelta(seconds=60)
TIMELINE_LIMIT = 120
#: What stopped a show (the emergency stop) is logged a moment after; a
#: finished show's figures are kept once this has passed.
LOG_LAG = timedelta(minutes=1)

#: Watts drawn when on, from Panasonic's spec sheets (normal lamp power,
#: 120 V). A projector of another make uses FALLBACK_WATTS until it is set.
DEFAULT_WATTS = {
    "panasonic_pt_dz13k": 1000,   # PT-DZ13K: 1,000 W
    "panasonic_pt_dz770": 830,    # PT-DZ770 / DW740 / DX810: 830 W
}
FALLBACK_WATTS = 500
#: US average residential price, 2026, dollars per kWh.
DEFAULT_PRICE = 0.17

#: Event kinds that are not problems, even when logged as a warning.
NOT_PROBLEMS = {"power_off_observed", "player_update", "emergency_cleared", "login",
                "command_unverified", "tonight_stopped",
                # A start that failed is the record's own "start_failed" problem.
                "tonight_started"}
#: Alerts worth listing on a night; the rest are already events.
ALERT_PROBLEMS = {"unexpected_shutdown", "health_warning", "health_error"}

PROBLEM_LABELS = {
    "projector_offline": "Projector stopped answering",
    "unexpected_shutdown": "Projector switched off by itself",
    "health_warning": "Projector warning",
    "health_error": "Projector fault",
    "emergency_stop": "Emergency stop",
    "tonight_held": "Held by the emergency stop",
    "power_failed": "Projector did not turn on",
    "start_failed": "Show did not start",
    "minipc_offline": "Mini PC lost its connection",
    "minipc_out_of_sync": "Mini PC out of step",
    "server_restart": "Server restarted",
    "automation_failed": "Automation failed",
    "automation_missed": "Automation missed",
    "lamp_hours_warning": "Lamp hours",
    "lamp_hours_critical": "Lamp hours",
    "too_hot": "Projector ran hot",
}


def local(value: datetime) -> datetime:
    return as_utc(value).astimezone(settings.tz)


def night_of(value: datetime) -> date:
    """The night a moment belongs to: before 6 AM is still the night before."""
    moment = local(value)
    day = moment.date()
    return day - timedelta(days=1) if moment.hour < NIGHT_STARTS_HOUR else day


def clock(value: datetime) -> str:
    return local(value).strftime("%I:%M %p").lstrip("0")


def fahrenheit(celsius: float) -> float:
    return round(celsius * 9 / 5 + 32, 1)


# -- settings ------------------------------------------------------------------------


async def load_settings(session) -> HistorySettings:
    row = (await session.execute(select(HistorySettings).order_by(HistorySettings.id))).scalars().first()
    if row is None:
        row = HistorySettings(price_per_kwh=DEFAULT_PRICE, currency="$", watts={},
                              started_at=utcnow())
        session.add(row)
        await session.flush()
    return row


def default_watts(projector: Projector) -> int:
    return DEFAULT_WATTS.get(projector.driver, FALLBACK_WATTS)


def watts_of(projector: Projector, saved: HistorySettings) -> int:
    value = (saved.watts or {}).get(str(projector.id))
    return int(value) if isinstance(value, int | float) and value > 0 else default_watts(projector)


async def projector_rows(session, saved: HistorySettings) -> list[dict[str, Any]]:
    projectors = (await session.execute(select(Projector).order_by(Projector.name))).scalars().all()
    return [{
        "id": p.id, "name": p.name, "model": p.model, "driver": p.driver,
        "watts": watts_of(p, saved), "default_watts": default_watts(p),
        "watts_is_default": str(p.id) not in (saved.watts or {}),
    } for p in projectors]


# -- hours on ------------------------------------------------------------------------


def _hour_column(session):
    column = Telemetry.recorded_at
    if session.bind.dialect.name == "sqlite":
        return func.strftime("%Y-%m-%d %H", column)
    return func.to_char(func.date_trunc("hour", func.timezone("UTC", column)), "YYYY-MM-DD HH24")


async def hours_on(session, since: datetime, until: datetime,
                   projector_ids: list[int] | None = None) -> dict[int, dict[datetime, float]]:
    """Hours each projector was on, per hour (UTC hour start) in the range."""
    hour = _hour_column(session).label("hour")
    intervals = {pid: _interval(overrides) for pid, overrides in (await session.execute(
        select(Projector.id, Projector.poll_overrides))).all()}
    rows = []
    # One projector at a time, so the (projector, metric, time) index is used.
    for projector_id in (projector_ids if projector_ids is not None else list(intervals)):
        rows.extend((await session.execute(
            select(Telemetry.projector_id, hour, func.count().label("samples"),
                   func.sum(Telemetry.value_num).label("on"),
                   func.min(Telemetry.recorded_at).label("first"),
                   func.max(Telemetry.recorded_at).label("last"))
            .where(Telemetry.projector_id == projector_id, Telemetry.metric == "power",
                   Telemetry.recorded_at >= since, Telemetry.recorded_at < until)
            .group_by(Telemetry.projector_id, hour)
        )).all())
    out: dict[int, dict[datetime, float]] = {}
    for row in rows:
        if not row.samples or not row.on:
            continue
        interval = intervals.get(row.projector_id, float(settings.poll_operational))
        span = (as_utc(row.last) - as_utc(row.first)).total_seconds() + interval
        covered = min(3600.0, span) / 3600.0
        start = datetime.strptime(row.hour, "%Y-%m-%d %H").replace(tzinfo=UTC)
        out.setdefault(row.projector_id, {})[start] = (row.on / row.samples) * covered
    return out


def _interval(overrides: dict | None) -> float:
    value = (overrides or {}).get("operational")
    try:
        return max(5.0, float(value)) if value is not None else float(settings.poll_operational)
    except (TypeError, ValueError):
        return float(settings.poll_operational)


# -- what a night's record says ------------------------------------------------------


async def _show_projectors(session, show_id: int | None) -> list[Projector]:
    """The projectors a show drives; every enabled projector if none are linked."""
    if show_id is not None:
        linked = (await session.execute(
            select(Projector).join(MappingOutput, MappingOutput.projector_id == Projector.id)
            .where(MappingOutput.show_id == show_id).distinct().order_by(Projector.name)
        )).scalars().all()
        if linked:
            return list(linked)
    return list((await session.execute(
        select(Projector).where(Projector.enabled.is_(True)).order_by(Projector.name)
    )).scalars().all())


def _problem(at: datetime, kind: str, message: str, *, severity: str = "warning",
             projector: str | None = None) -> dict[str, Any]:
    return {"at": as_utc(at).isoformat(), "kind": kind,
            "label": PROBLEM_LABELS.get(kind, kind.replace("_", " ").capitalize()),
            "message": message, "severity": severity, "projector": projector}


async def compute_stats(session, record: ShowNight, *, until: datetime | None = None) -> dict:
    """Hours on, hottest readings and logged problems for one show time."""
    from app.services.monitor import TEMPERATURE_METRIC_PREFIX

    since = as_utc(record.started_at or record.planned_start)
    until = as_utc(until or record.ended_at or record.planned_end or utcnow())
    if since is None or until is None or until <= since:
        return {"projectors": [], "problems": [], "computed_at": utcnow().isoformat()}
    projectors = await _show_projectors(session, record.show_id)
    ids = [p.id for p in projectors]
    hours = await hours_on(session, since, until, ids) if record.started_at else {}

    temps: dict[int, dict[str, float]] = {}
    for pid, metric, peak in (await session.execute(
        select(Telemetry.projector_id, Telemetry.metric, func.max(Telemetry.value_num))
        .where(Telemetry.projector_id.in_(ids),
               Telemetry.metric.startswith(TEMPERATURE_METRIC_PREFIX, autoescape=True),
               Telemetry.recorded_at >= since, Telemetry.recorded_at <= until)
        .group_by(Telemetry.projector_id, Telemetry.metric)
    )).all():
        if peak is not None:
            temps.setdefault(pid, {})[metric[len(TEMPERATURE_METRIC_PREFIX):]] = round(peak, 1)

    names = {p.id: p.name for p in projectors}
    rows = []
    for projector in projectors:
        sensors = temps.get(projector.id, {})
        hottest = max(sensors.items(), key=lambda kv: kv[1]) if sensors else None
        rows.append({
            "id": projector.id, "name": projector.name,
            "on_hours": round(sum(hours.get(projector.id, {}).values()), 3),
            "temps": sensors,
            "hottest": {"key": hottest[0], "celsius": hottest[1]} if hottest else None,
        })

    # The event log: a little before the start too, so a projector that
    # dropped off while the show was starting up is on the list.
    window_start = since - timedelta(minutes=5)
    window_end = until + LOG_LAG
    problems: list[dict[str, Any]] = []
    events = (await session.execute(
        select(Event).where(Event.created_at >= window_start, Event.created_at <= window_end,
                            Event.severity.in_([Severity.WARNING.value, Severity.CRITICAL.value]))
        .order_by(Event.created_at)
    )).scalars().all()
    for event in events:
        if event.kind in NOT_PROBLEMS:
            continue
        if event.projector_id is not None and ids and event.projector_id not in ids:
            continue
        problems.append(_problem(event.created_at, event.kind, event.message,
                                 severity=event.severity,
                                 projector=names.get(event.projector_id or 0)))
    alerts = (await session.execute(
        select(Alert).where(Alert.opened_at >= window_start, Alert.opened_at <= window_end,
                            Alert.kind.in_(ALERT_PROBLEMS))
    )).scalars().all()
    for alert in alerts:
        if alert.projector_id is not None and ids and alert.projector_id not in ids:
            continue
        problems.append(_problem(alert.opened_at, alert.kind, alert.message,
                                 severity=alert.severity,
                                 projector=names.get(alert.projector_id or 0)))
    limit = settings.temperature_intake_limit_c
    for row in rows:
        intake = row["temps"].get("intake")
        if intake is not None and intake >= limit - settings.temperature_warn_margin_c:
            problems.append(_problem(
                since, "too_hot",
                f"{row['name']} reached {fahrenheit(intake):.0f} °F ({intake:g} °C) at the "
                f"air intake; its limit is {fahrenheit(limit):.0f} °F.",
                projector=row["name"]))
    problems.sort(key=lambda p: p["at"])
    return {"projectors": rows, "problems": problems, "computed_at": utcnow().isoformat()}


def _duration(record: ShowNight, now: datetime) -> timedelta | None:
    if record.started_at is None:
        return None
    end = as_utc(record.ended_at) if record.ended_at else (now if record.outcome == "running" else None)
    return (end - as_utc(record.started_at)) if end else None


def describe(record: ShowNight, stats: dict, saved: HistorySettings,
             projectors: dict[int, Projector], now: datetime) -> dict[str, Any]:
    """A record as the Show history page shows it."""
    rows = []
    kwh_total = 0.0
    for row in stats.get("projectors") or []:
        projector = projectors.get(row["id"])
        watts = watts_of(projector, saved) if projector else FALLBACK_WATTS
        kwh = row["on_hours"] * watts / 1000
        kwh_total += kwh
        hottest = row.get("hottest")
        rows.append({
            **row,
            "watts": watts,
            "kwh": round(kwh, 2),
            "cost": round(kwh * saved.price_per_kwh, 2),
            "hottest": ({**hottest, "fahrenheit": fahrenheit(hottest["celsius"])}
                        if hottest else None),
        })
    problems = sorted([*(record.problems or []), *(stats.get("problems") or [])],
                      key=lambda p: p.get("at") or "")
    duration = _duration(record, now)
    # The air intake is the reading with a limit, so it is the one that counts;
    # the exhaust always runs hotter. Projectors with no intake sensor fall
    # back to their hottest sensor.
    peaks = [{"projector": r["name"], "key": "intake", "celsius": r["temps"]["intake"]}
             for r in rows if r["temps"].get("intake") is not None]
    if not peaks:
        peaks = [{"projector": r["name"], **r["hottest"]} for r in rows if r["hottest"]]
    hottest = max(peaks, key=lambda p: p["celsius"], default=None)
    return {
        "id": record.id,
        "night": record.night,
        "key": record.key,
        "title": record.title or record.group_name or record.show_name or "Show",
        "source": record.source,
        "show_id": record.show_id,
        "show_name": record.show_name,
        "group_name": record.group_name,
        "planned_start": as_utc(record.planned_start),
        "planned_end": as_utc(record.planned_end),
        "started_at": as_utc(record.started_at),
        "ended_at": as_utc(record.ended_at),
        "started_by": record.started_by,
        "ended_by": record.ended_by,
        "outcome": record.outcome,
        "message": record.message or "",
        "minutes": round(duration.total_seconds() / 60) if duration else None,
        "timeline": record.timeline or [],
        "problems": problems,
        "projectors": rows,
        "hottest": ({**hottest, "fahrenheit": fahrenheit(hottest["celsius"])} if hottest else None),
        "kwh": round(kwh_total, 2),
        "cost": round(kwh_total * saved.price_per_kwh, 2),
    }


async def stats_for(session, record: ShowNight, now: datetime) -> dict:
    """Stored stats for a finished record (worked out once), live ones while it runs."""
    if record.outcome == "running":
        return await compute_stats(session, record, until=now)
    if record.stats and "computed_at" in record.stats:
        return record.stats
    stats = await compute_stats(session, record)
    end = as_utc(record.ended_at or record.planned_end)
    if end is None or now - end > LOG_LAG:
        record.stats = stats
    return stats


async def nights(session, *, since: date, until: date | None = None) -> list[dict[str, Any]]:
    now = utcnow()
    saved = await load_settings(session)
    query = select(ShowNight).where(ShowNight.night >= since.isoformat())
    if until is not None:
        query = query.where(ShowNight.night <= until.isoformat())
    records = (await session.execute(
        query.order_by(ShowNight.night.desc(), ShowNight.started_at.desc(), ShowNight.id.desc())
    )).scalars().all()
    projectors = {p.id: p for p in (await session.execute(select(Projector))).scalars().all()}
    out = []
    for record in records:
        out.append(describe(record, await stats_for(session, record, now), saved, projectors, now))
    return out


# -- energy report ---------------------------------------------------------------------


def week_start(day: date) -> date:
    return day - timedelta(days=day.weekday())


async def energy(session, *, weeks: int, today: date | None = None) -> dict[str, Any]:
    """Hours on, kWh and cost for each projector, week by week (Monday to Sunday)."""
    today = today or night_of(utcnow())
    saved = await load_settings(session)
    first_week = week_start(today) - timedelta(weeks=weeks - 1)
    tz = settings.tz
    since = datetime.combine(first_week, time(NIGHT_STARTS_HOUR), tz).astimezone(UTC)
    until = datetime.combine(week_start(today) + timedelta(weeks=1), time(NIGHT_STARTS_HOUR),
                             tz).astimezone(UTC)
    usage = await hours_on(session, since, until)
    projectors = await projector_rows(session, saved)
    watts = {p["id"]: p["watts"] for p in projectors}
    names = {p["id"]: p["name"] for p in projectors}

    per_week: dict[date, dict[int, float]] = {}
    per_night: dict[date, float] = {}
    for pid, hours in usage.items():
        if pid not in names:
            continue
        for hour, value in hours.items():
            night = night_of(hour)
            week = per_week.setdefault(week_start(night), {})
            week[pid] = week.get(pid, 0.0) + value
            per_night[night] = per_night.get(night, 0.0) + value * watts[pid] / 1000

    def money(kwh: float) -> float:
        return round(kwh * saved.price_per_kwh, 2)

    week_rows = []
    totals: dict[int, float] = {}
    for index in range(weeks):
        start = first_week + timedelta(weeks=index)
        hours = per_week.get(start, {})
        rows = []
        for projector in projectors:
            value = hours.get(projector["id"], 0.0)
            totals[projector["id"]] = totals.get(projector["id"], 0.0) + value
            kwh = value * projector["watts"] / 1000
            rows.append({"id": projector["id"], "name": projector["name"],
                         "hours": round(value, 2), "kwh": round(kwh, 2), "cost": money(kwh)})
        kwh = sum(r["kwh"] for r in rows)
        week_rows.append({
            "start": start.isoformat(), "end": (start + timedelta(days=6)).isoformat(),
            "this_week": start == week_start(today),
            "projectors": rows,
            "hours": round(sum(r["hours"] for r in rows), 2),
            "kwh": round(kwh, 2), "cost": money(kwh),
        })
    total_kwh = sum(totals.get(pid, 0.0) * watts[pid] / 1000 for pid in names)
    return {
        "weeks": week_rows,
        "projectors": [{**p, "hours": round(totals.get(p["id"], 0.0), 2),
                        "kwh": round(totals.get(p["id"], 0.0) * p["watts"] / 1000, 2),
                        "cost": money(totals.get(p["id"], 0.0) * p["watts"] / 1000)}
                       for p in projectors],
        "nights": [{"night": n.isoformat(), "kwh": round(v, 2), "cost": money(v)}
                   for n, v in sorted(per_night.items())],
        "total_kwh": round(total_kwh, 2),
        "total_cost": money(total_kwh),
        "price_per_kwh": saved.price_per_kwh,
        "currency": saved.currency,
        "history_since": as_utc(saved.started_at),
    }


# -- seasons -----------------------------------------------------------------------------


@dataclass
class Season:
    key: str
    name: str
    start: date
    end: date
    #: "holiday" (built in), "calendar" (a run of nights on the calendar).
    kind: str

    def out(self) -> dict[str, Any]:
        return {"key": self.key, "name": self.name, "start": self.start.isoformat(),
                "end": self.end.isoformat(), "kind": self.kind}


def holiday_seasons(year: int) -> list[Season]:
    return [
        Season(f"halloween-{year}", f"Halloween {year}", date(year, 9, 1), date(year, 10, 31),
               "holiday"),
        Season(f"christmas-{year}", f"Christmas {year}", date(year, 11, 15),
               date(year + 1, 1, 6), "holiday"),
    ]


async def seasons(session, today: date | None = None) -> list[dict[str, Any]]:
    """Seasons that have shows in them, newest first, and which just finished."""
    today = today or night_of(utcnow())
    found: list[Season] = []
    for year in (today.year - 1, today.year):
        found.extend(holiday_seasons(year))
    entries = (await session.execute(
        select(ShowCalendarEntry).where(ShowCalendarEntry.kind == "show",
                                        ShowCalendarEntry.end_date.is_not(None))
    )).scalars().all()
    for entry in entries:
        start, end = date.fromisoformat(entry.start_date), date.fromisoformat(entry.end_date)
        if (end - start).days >= 2 and entry.title:
            found.append(Season(f"calendar-{entry.id}", entry.title, start, end, "calendar"))
    out = []
    for season in found:
        played = await _nights_played(session, season.start, season.end)
        if played == 0 and season.start > today:
            continue
        if played == 0 and season.kind == "holiday":
            continue
        finished = season.end < today
        out.append({**season.out(), "nights_played": played, "finished": finished,
                    "just_finished": finished and today <= season.end + timedelta(days=21)
                    and played > 0})
    out.sort(key=lambda s: s["end"], reverse=True)
    return out


async def _nights_played(session, start: date, end: date) -> int:
    records = (await session.execute(
        select(ShowNight.night, ShowNight.started_at, ShowNight.ended_at, ShowNight.outcome)
        .where(ShowNight.night >= start.isoformat(), ShowNight.night <= end.isoformat(),
               ShowNight.outcome.in_(("played", "running")))
    )).all()
    return len({r.night for r in records if _counts(r.started_at, r.ended_at, r.outcome)})


def _counts(started_at, ended_at, outcome) -> bool:
    if started_at is None:
        return False
    if outcome == "running" or ended_at is None:
        return True
    return as_utc(ended_at) - as_utc(started_at) >= SHORT_SHOW


async def wrapup(session, *, start: date, end: date, name: str) -> dict[str, Any]:
    """The season in numbers: nights, hours, energy, the hottest night, problems."""
    rows = await nights(session, since=start, until=end)
    rows.reverse()  # oldest first
    played = [r for r in rows if r["outcome"] in ("played", "running")
              and _counts(r["started_at"], r["ended_at"], r["outcome"])]
    missed = [r for r in rows if r["outcome"] in ("missed", "failed")]
    played_nights = sorted({r["night"] for r in played})
    minutes = sum(r["minutes"] or 0 for r in played)

    by_projector: dict[int, dict[str, Any]] = {}
    for row in played:
        for p in row["projectors"]:
            entry = by_projector.setdefault(p["id"], {"id": p["id"], "name": p["name"],
                                                      "hours": 0.0, "kwh": 0.0, "cost": 0.0,
                                                      "hottest": None})
            entry["hours"] += p["on_hours"]
            entry["kwh"] += p["kwh"]
            entry["cost"] += p["cost"]
            intake = p["temps"].get("intake")
            peak = ({"key": "intake", "celsius": intake, "fahrenheit": fahrenheit(intake)}
                    if intake is not None else p["hottest"])
            if peak and (entry["hottest"] is None or peak["celsius"] > entry["hottest"]["celsius"]):
                entry["hottest"] = {**peak, "night": row["night"]}
    projector_rows_ = [{**e, "hours": round(e["hours"], 1), "kwh": round(e["kwh"], 1),
                        "cost": round(e["cost"], 2)} for e in by_projector.values()]

    hottest = None
    for row in played:
        if row["hottest"] and (hottest is None or row["hottest"]["celsius"] > hottest["celsius"]):
            hottest = {**row["hottest"], "night": row["night"], "title": row["title"]}
    longest = max(played, key=lambda r: r["minutes"] or 0, default=None)

    kinds: dict[str, dict[str, Any]] = {}
    problem_nights = set()
    for row in rows:
        for problem in row["problems"]:
            entry = kinds.setdefault(problem["kind"], {"kind": problem["kind"],
                                                       "label": problem["label"], "count": 0})
            entry["count"] += 1
            problem_nights.add(row["night"])
    groups: dict[str, int] = {}
    for row in played:
        label = row["group_name"] or row["title"]
        groups[label] = groups.get(label, 0) + 1
    saved = await load_settings(session)
    total_kwh = sum(r["kwh"] for r in played)
    return {
        "name": name,
        "start": start.isoformat(),
        "end": end.isoformat(),
        "nights_played": len(played_nights),
        "shows_played": len(played),
        "nights_missed": len(missed),
        "missed": [{"night": r["night"], "title": r["title"], "outcome": r["outcome"],
                    "message": r["message"]} for r in missed],
        "first_night": played_nights[0] if played_nights else None,
        "last_night": played_nights[-1] if played_nights else None,
        "show_hours": round(minutes / 60, 1),
        "average_minutes": round(minutes / len(played)) if played else None,
        "longest": ({"night": longest["night"], "title": longest["title"],
                     "minutes": longest["minutes"]} if longest and longest["minutes"] else None),
        "projectors": sorted(projector_rows_, key=lambda r: r["name"]),
        "kwh": round(total_kwh, 1),
        "cost": round(total_kwh * saved.price_per_kwh, 2),
        "currency": saved.currency,
        "hottest": hottest,
        "problems": sorted(kinds.values(), key=lambda k: -k["count"]),
        "problems_total": sum(k["count"] for k in kinds.values()),
        "clean_nights": len([n for n in played_nights if n not in problem_nights]),
        "groups": [{"name": k, "shows": v} for k, v in
                   sorted(groups.items(), key=lambda kv: -kv[1])],
        "nights": [{"night": r["night"], "title": r["title"], "outcome": r["outcome"],
                    "minutes": r["minutes"], "problems": len(r["problems"]),
                    "hottest": r["hottest"], "kwh": r["kwh"]} for r in rows],
        "history_since": as_utc(saved.started_at),
    }


# -- the recorder ------------------------------------------------------------------------


def _started_by(message: str) -> str | None:
    found = re.search(r"Started by (.+?) at \d", message or "")
    return found.group(1) if found else None


class Recorder:
    """Keeps a ``ShowNight`` open while the show plays. One per server."""

    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._queue: asyncio.Queue | None = None
        self._lock = asyncio.Lock()
        self._open_id: int | None = None
        self._last_cue: Any = None
        #: Mini PCs out of touch: player id -> (since, index in problems).
        self._down: dict[int, tuple[datetime, int]] = {}
        #: Details tonight's show gave just before the transport started.
        self._pending: dict[str, Any] | None = None
        self._next_tick = 0.0

    async def start(self) -> None:
        if self._task is not None:
            return
        self._queue = await bus.subscribe(["mapping_transport"])
        await self._recover()
        self._task = asyncio.create_task(self._loop(), name="show-history")

    async def stop(self) -> None:
        if self._queue is not None:
            await bus.unsubscribe(self._queue)
            with contextlib.suppress(asyncio.QueueFull):
                self._queue.put_nowait(None)  # wakes the loop to stop
        await stop_task(self._task, name="show history")
        self._task = None
        self._queue = None
        self._open_id = None

    async def _loop(self) -> None:
        loop = asyncio.get_running_loop()
        while True:
            try:
                timeout = max(0.0, self._next_tick - loop.time())
                with contextlib.suppress(TimeoutError):
                    message = await asyncio.wait_for(self._queue.get(), timeout)
                    if message is None:
                        return
                    async with self._lock:
                        await self._observe(message.payload)
                if loop.time() >= self._next_tick:
                    self._next_tick = loop.time() + TICK_SECONDS
                    async with self._lock:
                        await self._drain()
                        await self.tick()
            except asyncio.CancelledError:
                return
            except Exception:  # noqa: BLE001
                log.exception("show history check failed")
                self._next_tick = loop.time() + TICK_SECONDS

    async def settle(self) -> None:
        """Take in every transport change published so far."""
        async with self._lock:
            await self._drain()

    async def _drain(self) -> None:
        while self._queue is not None and not self._queue.empty():
            message = self._queue.get_nowait()
            if message is None:
                self._queue.put_nowait(None)
                return
            await self._observe(message.payload)

    # -- transport -----------------------------------------------------------

    async def _observe(self, state: dict[str, Any]) -> None:
        status = state.get("status")
        if status in ("playing", "paused"):
            await self._playing(state)
        elif self._open_id is not None:
            by = "the emergency stop" if state.get("emergency") else None
            await self._close(by=by, emergency=bool(state.get("emergency")))

    async def _playing(self, state: dict[str, Any]) -> None:
        now = utcnow()
        async with session_scope() as session:
            record = await session.get(ShowNight, self._open_id) if self._open_id else None
            if record is None:
                record = await self._open(session, state.get("show_id"), now)
            record.seen_at = now
            current = state.get("current") or {}
            cue = (current.get("id"), current.get("started_at_ms"))
            if current and cue != self._last_cue:
                self._last_cue = cue
                if current.get("position", 0) < 0:
                    label = f"Scene: {current.get('name') or 'a scene'}"
                    kind = "scene"
                else:
                    label = current.get("name") or f"Cue {current.get('position', 0) + 1}"
                    kind = "cue"
                last = (record.timeline or [])[-1:] or [{}]
                if last[0].get("label") != label:
                    record.timeline = _append(record.timeline, now, kind, label)

    async def _open(self, session, show_id: int | None, now: datetime) -> ShowNight:
        """A new record, or the one that stopped a moment ago, carried on."""
        recent = (await session.execute(
            select(ShowNight).where(ShowNight.ended_at.is_not(None))
            .order_by(ShowNight.ended_at.desc()).limit(1)
        )).scalars().first()
        if (recent is not None and recent.show_id == show_id
                and now - as_utc(recent.ended_at) <= REJOIN and recent.outcome == "played"):
            gap = now - as_utc(recent.ended_at)
            recent.timeline = _append(recent.timeline, now, "start",
                                      f"Playing again after {_minutes(gap)}")
            recent.outcome = "running"
            recent.ended_at = None
            recent.ended_by = None
            recent.stats = {}
            self._open_id = recent.id
            await self._apply_pending(session, recent)
            return recent
        show = await session.get(MappingShow, show_id) if show_id else None
        record = ShowNight(
            night=night_of(now).isoformat(), source="hand", show_id=show_id,
            show_name=show.name if show else "", started_at=now, seen_at=now,
            outcome="running", timeline=[], problems=[], stats={},
        )
        session.add(record)
        await session.flush()
        self._open_id = record.id
        self._down = {}
        await self._apply_pending(session, record)
        await self._check_minipcs(session, record, now, first=True)
        log.info("show history: show started (record %s)", record.id)
        return record

    async def _apply_pending(self, session, record: ShowNight) -> None:
        pending, self._pending = self._pending, None
        if pending is None or utcnow() - pending["at"] > timedelta(minutes=2):
            return
        _annotate(record, pending)

    async def _close(self, *, by: str | None, emergency: bool = False) -> None:
        now = utcnow()
        async with session_scope() as session:
            record = await session.get(ShowNight, self._open_id)
            self._open_id = None
            self._last_cue = None
            if record is None:
                return
            record.ended_at = now
            record.seen_at = now
            record.outcome = "played"
            record.ended_by = record.ended_by or by
            record.timeline = _append(record.timeline, now, "stop",
                                      "Emergency stop" if emergency else "Stopped")
            record.stats = {}  # worked out when next read, once the log has caught up
        bus.publish("show_history", {})

    # -- what tonight's show says ----------------------------------------------

    async def note_start(self, *, slot: Any, show_id: int | None, group_name: str | None,
                         by: str, ok: bool, message: str,
                         power_failed: list[str] | None = None) -> None:
        details = {"at": utcnow(), "slot": slot, "show_id": show_id,
                   "group_name": group_name, "by": by, "message": message}
        async with self._lock:
            await self._drain()
            async with session_scope() as session:
                record = await session.get(ShowNight, self._open_id) if self._open_id else None
                if record is not None:
                    _annotate(record, details)
                elif ok:
                    self._pending = details
                    record = await self._open(session, show_id, utcnow())
                else:
                    record = await self._missed(session, slot, show_id=show_id, outcome="failed",
                                                message=message, group_name=group_name)
                    record.started_by = by
                    record.problems = [_problem(utcnow(), "start_failed", message)]
                if ok and power_failed:
                    record.problems = [*(record.problems or []), _problem(
                        utcnow(), "power_failed",
                        f"{', '.join(power_failed)} did not turn on when the show started.")]
        bus.publish("show_history", {})

    async def note_held(self, slot: Any, message: str) -> None:
        async with self._lock, session_scope() as session:
            await self._missed(session, slot, show_id=slot.show_id, outcome="missed",
                               message=message)
        bus.publish("show_history", {})

    async def note_stop(self, *, by: str) -> None:
        async with self._lock:
            await self._drain()
            async with session_scope() as session:
                record = await session.get(ShowNight, self._open_id) if self._open_id else None
                if record is None:
                    record = (await session.execute(
                        select(ShowNight).where(ShowNight.ended_at.is_not(None))
                        .order_by(ShowNight.ended_at.desc()).limit(1)
                    )).scalars().first()
                    if record is None or utcnow() - as_utc(record.ended_at) > timedelta(minutes=2):
                        return
                record.ended_by = by

    async def _missed(self, session, slot: Any, *, show_id: int | None, outcome: str,
                      message: str, group_name: str | None = None) -> ShowNight:
        key = getattr(slot, "key", None)
        record = None
        if key:
            record = (await session.execute(
                select(ShowNight).where(ShowNight.key == key)
            )).scalars().first()
        if record is None:
            show = await session.get(MappingShow, show_id) if show_id else None
            record = ShowNight(night=(slot.night.isoformat() if slot else
                                      night_of(utcnow()).isoformat()),
                               key=key, show_id=show_id, show_name=show.name if show else "",
                               timeline=[], problems=[], stats={})
            session.add(record)
        record.outcome = outcome
        record.message = message
        if slot is not None:
            record.title = slot.title or ""
            record.source = slot.source
            record.planned_start = slot.start
            record.planned_end = slot.end
            if slot.group_id and not group_name:
                from app.db.models import MappingSceneGroup

                group = await session.get(MappingSceneGroup, slot.group_id)
                group_name = group.name if group else None
        record.group_name = group_name
        await session.flush()
        return record

    # -- every 30 seconds ------------------------------------------------------

    async def tick(self, now: datetime | None = None) -> None:
        now = now or utcnow()
        async with session_scope() as session:
            if self._open_id is not None:
                record = await session.get(ShowNight, self._open_id)
                if record is not None:
                    record.seen_at = now
                    await self._check_minipcs(session, record, now)
            await self._find_missed(session, now)

    async def _check_minipcs(self, session, record: ShowNight, now: datetime, *,
                             first: bool = False) -> None:
        from app.api.routes.mapping_players import is_online

        if record.show_id is None:
            return
        players = (await session.execute(
            select(MappingPlayer).join(MappingOutput, MappingPlayer.output_id == MappingOutput.id)
            .where(MappingOutput.show_id == record.show_id, MappingPlayer.approved.is_(True),
                   MappingPlayer.kind == "player")
        )).scalars().all()
        problems = list(record.problems or [])
        for player in players:
            online = is_online(player)
            if not online and player.id not in self._down:
                seen = as_utc(player.last_seen_at)
                since = seen or now
                if not first and now - since < MINIPC_GRACE:
                    continue
                text = (f"{player.name} was not connected when the show started."
                        if first else f"{player.name} lost its connection at {clock(since)}.")
                problems.append(_problem(since if not first else now, "minipc_offline", text))
                self._down[player.id] = (since, len(problems) - 1)
            elif online and player.id in self._down:
                since, index = self._down.pop(player.id)
                if index < len(problems):
                    problems[index] = {
                        **problems[index],
                        "message": f"{problems[index]['message']} It came back at "
                                   f"{clock(now)}, after {_minutes(now - since)}.",
                    }
        record.problems = problems

    async def _find_missed(self, session, now: datetime) -> None:
        """Planned show times that ended with no show: record them as missed."""
        from app.services.show_calendar import Planner
        from app.services.tonight import load_plan

        saved = await load_settings(session)
        began = as_utc(saved.started_at)
        plan = await load_plan(session)
        planner = await Planner.load(session, plan)
        for slot in planner.recent(now.astimezone(settings.tz)):
            if slot.show_id is None or slot.start < began or now < slot.end + MISSED_AFTER:
                continue
            if now - slot.end > timedelta(hours=36):
                continue
            known = (await session.execute(
                select(ShowNight.id).where(ShowNight.key == slot.key).limit(1)
            )).first()
            if known:
                continue
            overlapping = (await session.execute(
                select(ShowNight.id).where(
                    ShowNight.started_at.is_not(None),
                    ShowNight.started_at < slot.end,
                    (ShowNight.ended_at.is_(None)) | (ShowNight.ended_at > slot.start),
                ).limit(1)
            )).first()
            if overlapping:
                continue
            held = (await session.execute(
                select(Event).where(Event.kind == "tonight_held",
                                    Event.created_at >= slot.start - timedelta(minutes=1),
                                    Event.created_at <= slot.end).limit(1)
            )).scalars().first()
            message = (held.message.removeprefix("Tonight's show: ") if held else
                       "The show did not start. The server may have been off or asleep.")
            await self._missed(session, slot, show_id=slot.show_id, outcome="missed",
                               message=message)
            log.info("show history: %s was missed", slot.key)

    # -- start-up ---------------------------------------------------------------

    async def _recover(self) -> None:
        """Close a record the server was in the middle of, and fill in the past."""
        async with session_scope() as session:
            fresh = (await session.execute(select(HistorySettings.id))).first() is None
            saved = await load_settings(session)
            for record in (await session.execute(
                select(ShowNight).where(ShowNight.outcome == "running")
            )).scalars().all():
                ended = as_utc(record.seen_at or record.started_at) or utcnow()
                record.ended_at = ended
                record.outcome = "played"
                record.timeline = _append(record.timeline, ended, "stop",
                                          "The server stopped")
                record.problems = [*(record.problems or []), _problem(
                    ended, "server_restart",
                    f"The server stopped or restarted at {clock(ended)} during the show.")]
                record.stats = await compute_stats(session, record)
            if fresh:
                saved.started_at = await self._backfill(session) or saved.started_at

    async def _backfill(self, session) -> datetime | None:
        """Rebuild the last month's shows from tonight's show's log lines."""
        since = utcnow() - timedelta(days=30)
        events = (await session.execute(
            select(Event).where(Event.kind.in_(("tonight_started", "tonight_stopped")),
                                Event.created_at >= since)
            .order_by(Event.created_at)
        )).scalars().all()
        open_record: ShowNight | None = None
        first: datetime | None = None
        for event in events:
            at = as_utc(event.created_at)
            if event.kind == "tonight_started":
                if open_record is not None and at - as_utc(open_record.started_at) < timedelta(hours=1):
                    continue  # pressed twice
                failed = event.severity != Severity.INFO.value and "did not start" in event.message
                open_record = ShowNight(
                    night=night_of(at).isoformat(), source="earlier", started_at=at, seen_at=at,
                    started_by=_started_by(event.message),
                    outcome="failed" if failed else "played",
                    message=event.message.removeprefix("Tonight's show: "),
                    timeline=[{"at": at.isoformat(), "kind": "start", "label": "Started"}],
                    problems=[], stats={},
                )
                session.add(open_record)
                first = first or at
                if failed:
                    open_record = None
            elif open_record is not None and at - as_utc(open_record.started_at) < timedelta(hours=12):
                open_record.ended_at = at
                open_record.ended_by = re.sub(r"^Tonight's show: Stopped by (.+?) at .*$", r"\1",
                                              event.message, flags=re.S) or None
                open_record.timeline = _append(open_record.timeline, at, "stop", "Stopped")
                open_record = None
        await session.flush()
        for record in (await session.execute(select(ShowNight))).scalars().all():
            if record.ended_at is not None:
                record.stats = await compute_stats(session, record)
        return first


def _annotate(record: ShowNight, details: dict[str, Any]) -> None:
    slot = details.get("slot")
    if slot is not None:
        record.key = slot.key
        record.title = slot.title or ""
        record.source = slot.source
        record.planned_start = slot.start
        record.planned_end = slot.end
        record.night = slot.night.isoformat()
    if details.get("group_name"):
        record.group_name = details["group_name"]
    if details.get("by") and not record.started_by:
        record.started_by = details["by"]
    if details.get("message"):
        record.message = details["message"]


def _append(timeline: list | None, at: datetime, kind: str, label: str) -> list:
    entries = list(timeline or [])
    entries.append({"at": as_utc(at).isoformat(), "kind": kind, "label": label})
    return entries[-TIMELINE_LIMIT:]


def _minutes(gap: timedelta) -> str:
    minutes = max(1, round(gap.total_seconds() / 60))
    if minutes < 60:
        return f"{minutes} minute{'s' if minutes != 1 else ''}"
    hours, rest = divmod(minutes, 60)
    return f"{hours} h {rest} min" if rest else f"{hours} h"


recorder = Recorder()
