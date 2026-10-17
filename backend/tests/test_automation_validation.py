"""Pre-flight validation and schedule preview."""

from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from app.services.automation_validation import next_runs, validate_schedule

LONDON = ZoneInfo("Europe/London")
NOW = datetime(2026, 10, 17, 19, 0, tzinfo=LONDON)  # Saturday


def test_daily_next_runs():
    runs = next_runs("daily", {"at": "20:30"}, now=NOW, count=3)
    assert [r.strftime("%Y-%m-%d %H:%M") for r in runs] == [
        "2026-10-17 20:30", "2026-10-18 20:30", "2026-10-19 20:30",
    ]
    assert all(r.tzinfo is not None for r in runs)


def test_daily_keeps_wall_clock_time_across_dst():
    """20:30 stays 20:30 local after the clocks change (25 Oct 2026)."""
    before = datetime(2026, 10, 24, 12, 0, tzinfo=LONDON)
    runs = next_runs("daily", {"at": "20:30"}, now=before, count=3)
    assert [r.strftime("%m-%d %H:%M %z") for r in runs] == [
        "10-24 20:30 +0100", "10-25 20:30 +0000", "10-26 20:30 +0000",
    ]


def test_weekly_skips_to_the_right_days():
    runs = next_runs("weekly", {"at": "20:30", "days": [4, 5]}, now=NOW, count=3)  # Fri, Sat
    assert [(r.strftime("%a"), r.strftime("%H:%M")) for r in runs] == [
        ("Sat", "20:30"), ("Fri", "20:30"), ("Sat", "20:30"),
    ]


def test_cron_next_runs():
    runs = next_runs("cron", {"cron": "*/15 19 * * *"}, now=NOW, count=3)
    assert [r.strftime("%H:%M") for r in runs] == ["19:15", "19:30", "19:45"]


def test_once_and_manual():
    assert next_runs("manual", {}, now=NOW) == []
    assert next_runs("once", {"run_at": "2026-10-17T21:00"}, now=NOW)[0].hour == 21
    assert next_runs("once", {"run_at": "2026-10-01T21:00"}, now=NOW) == []


def test_schedule_problems():
    assert validate_schedule("daily", {}) and validate_schedule("daily", {"at": "25:00"})
    assert validate_schedule("weekly", {"at": "20:00", "days": []})
    assert validate_schedule("cron", {"cron": "bad"})
    assert validate_schedule("once", {"run_at": "2000-01-01T00:00"})[0]["message"].startswith("The one-shot")
    assert validate_schedule("daily", {"at": "20:30"}) == []
    assert validate_schedule("manual", {}) == []
