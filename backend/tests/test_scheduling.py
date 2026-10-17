"""Scheduler evaluation and cron matching, with a fixed clock."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import pytest

from app.services import cron
from app.services.automation import AutomationEngine

LONDON = ZoneInfo("Europe/London")


def automation(trigger_type, schedule, last_run_at=None, name="test"):
    return SimpleNamespace(trigger_type=trigger_type, schedule=schedule,
                           last_run_at=last_run_at, name=name)


# -- cron ------------------------------------------------------------------


@pytest.mark.parametrize(("expression", "when", "expected"), [
    ("30 20 * * *", datetime(2026, 10, 17, 20, 30), True),
    ("30 20 * * *", datetime(2026, 10, 17, 20, 31), False),
    ("*/15 * * * *", datetime(2026, 10, 17, 20, 45), True),
    ("*/15 * * * *", datetime(2026, 10, 17, 20, 50), False),
    ("0 18-23 * * *", datetime(2026, 10, 17, 21, 0), True),
    ("0 18-23 * * *", datetime(2026, 10, 17, 17, 0), False),
    # 2026-10-17 is a Saturday.
    ("0 20 * * sat", datetime(2026, 10, 17, 20, 0), True),
    ("0 20 * * 6", datetime(2026, 10, 17, 20, 0), True),
    ("0 20 * * mon-fri", datetime(2026, 10, 17, 20, 0), False),
    ("0 20 * * 0,7", datetime(2026, 10, 18, 20, 0), True),   # Sunday, both forms
    ("0 9 1 * *", datetime(2026, 11, 1, 9, 0), True),
    ("0 9 1 * *", datetime(2026, 11, 2, 9, 0), False),
    # Both dom and dow restricted: either matches, as in cron.
    ("0 9 15 * fri", datetime(2026, 10, 15, 9, 0), True),    # 15th (a Thursday)
    ("0 9 15 * fri", datetime(2026, 10, 16, 9, 0), True),    # a Friday
    ("0 9 15 * fri", datetime(2026, 10, 17, 9, 0), False),
    ("0 0 * dec *", datetime(2026, 12, 25, 0, 0), True),
])
def test_cron_matches(expression, when, expected):
    assert cron.matches(expression, when) is expected


@pytest.mark.parametrize("bad", ["", "* * * *", "60 * * * *", "* 24 * * *",
                                 "a * * * *", "10-5 * * * *", "* * 32 * *"])
def test_cron_rejects_invalid(bad):
    with pytest.raises(cron.CronError):
        cron.validate(bad)


# -- daily / weekly ----------------------------------------------------------


def test_daily_fires_in_the_schedule_zone():
    now = datetime(2026, 10, 17, 20, 30, tzinfo=LONDON)
    assert AutomationEngine._is_due(automation("daily", {"at": "20:30"}), now) is True
    # The same instant is 19:30 UTC; a UTC clock must NOT fire a 20:30 schedule.
    assert AutomationEngine._is_due(
        automation("daily", {"at": "20:30"}), now.astimezone(UTC)
    ) is False


def test_daily_does_not_refire_inside_the_same_minute():
    now = datetime(2026, 10, 17, 20, 30, 40, tzinfo=LONDON)
    ran = now - timedelta(seconds=35)
    assert AutomationEngine._is_due(
        automation("daily", {"at": "20:30"}, last_run_at=ran.astimezone(UTC)), now
    ) is False


def test_weekly_checks_the_day():
    saturday = datetime(2026, 10, 17, 20, 30, tzinfo=LONDON)
    assert AutomationEngine._is_due(
        automation("weekly", {"at": "20:30", "days": [5]}), saturday) is True
    assert AutomationEngine._is_due(
        automation("weekly", {"at": "20:30", "days": [0, 1]}), saturday) is False


# -- once --------------------------------------------------------------------


def test_once_fires_inside_grace_and_is_missed_after():
    target = datetime(2026, 10, 17, 20, 30, tzinfo=LONDON)
    spec = {"run_at": target.isoformat()}
    assert AutomationEngine._is_due(automation("once", spec), target - timedelta(minutes=1)) is False
    assert AutomationEngine._is_due(automation("once", spec), target) is True
    assert AutomationEngine._is_due(automation("once", spec), target + timedelta(minutes=9)) is True
    assert AutomationEngine._is_due(automation("once", spec), target + timedelta(minutes=11)) == "missed"


def test_once_never_refires():
    target = datetime(2026, 10, 17, 20, 30, tzinfo=LONDON)
    spec = {"run_at": target.isoformat()}
    assert AutomationEngine._is_due(
        automation("once", spec, last_run_at=target.astimezone(UTC)),
        target + timedelta(minutes=2),
    ) is False


def test_once_naive_time_is_read_in_the_schedule_zone():
    now = datetime(2026, 10, 17, 20, 30, tzinfo=LONDON)
    assert AutomationEngine._is_due(automation("once", {"run_at": "2026-10-17T20:30"}), now) is True


def test_cron_trigger_evaluated():
    now = datetime(2026, 10, 17, 20, 30, tzinfo=LONDON)
    assert AutomationEngine._is_due(automation("cron", {"cron": "30 20 * * sat"}), now) is True
    assert AutomationEngine._is_due(automation("cron", {"cron": "nonsense"}), now) is False


def test_star_step_fields_are_unrestricted_for_the_or_rule():
    """'0 20 */2 * 1-5' = every other day of the month AND a weekday."""
    # 2026-10-15 is a Thursday and an odd day: dom (*/2 → odd days from 1) ok,
    # dow ok → fires.
    assert cron.matches("0 20 */2 * 1-5", datetime(2026, 10, 15, 20, 0)) is True
    # 2026-10-16 (Friday) is an even day → dom fails → must NOT fire.
    assert cron.matches("0 20 */2 * 1-5", datetime(2026, 10, 16, 20, 0)) is False
    # 2026-10-17 (Saturday, odd) → dow fails → must NOT fire.
    assert cron.matches("0 20 */2 * 1-5", datetime(2026, 10, 17, 20, 0)) is False


def test_settings_tz_is_a_real_zone_not_a_fixed_offset():
    from zoneinfo import ZoneInfo

    from app.config import Settings

    tz = Settings(secret_key="x" * 40, schedule_timezone=None).tz
    assert isinstance(tz, ZoneInfo), type(tz)


def test_once_naive_time_across_a_dst_boundary():
    """Scheduled in BST for a date in GMT: the GMT offset must apply."""
    now = datetime(2026, 11, 5, 20, 0, tzinfo=LONDON)  # GMT (+00:00)
    assert AutomationEngine._is_due(automation("once", {"run_at": "2026-11-05T20:00"}), now) is True
    assert AutomationEngine._is_due(
        automation("once", {"run_at": "2026-11-05T20:00"}), now - timedelta(hours=1)
    ) is False
