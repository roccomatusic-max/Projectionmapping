"""calendar only schedule

Revision ID: c7e1a5d9f3b2
Revises: d7a3f9c2e5b1
Create Date: 2026-10-27 16:30:00.000000

Shows only play on nights put on the calendar; nothing repeats by itself.

* The weekly show time ("6:45 to 11 PM, every night", in show_plan) is
  switched off. The nights it played from today to the end of this month
  become one calendar entry each, with the same times, scenes and power
  setting, so the shows already counted on (Halloween week) still play and
  can be taken off one night at a time. Nights the calendar already had
  something for keep just that, as before.
* Calendar entries that repeated with no end stop at the end of this month
  (or of the month they start in, when that is later).

No columns change, so there is nothing to undo on a downgrade.
"""
from __future__ import annotations

import calendar
from datetime import UTC, date, datetime, timedelta

from alembic import op
import sqlalchemy as sa


revision = 'c7e1a5d9f3b2'
down_revision = 'd7a3f9c2e5b1'
branch_labels = None
depends_on = None

ALL_DAYS = list(range(7))
NOTE = "Moved from the weekly show time"

show_plan = sa.table(
    'show_plan',
    sa.column('id', sa.Integer), sa.column('show_id', sa.Integer),
    sa.column('group_id', sa.Integer), sa.column('playlist_id', sa.Integer),
    sa.column('enabled', sa.Boolean), sa.column('start_at', sa.String),
    sa.column('end_at', sa.String), sa.column('days', sa.JSON),
    sa.column('power', sa.Boolean), sa.column('last_start_key', sa.String),
    sa.column('last_end_key', sa.String),
)
# A Table rather than a lightweight table(): inserts need the new row's id.
show_calendar = sa.Table(
    'show_calendar', sa.MetaData(),
    sa.Column('id', sa.Integer, primary_key=True), sa.Column('kind', sa.String),
    sa.Column('title', sa.String),
    sa.Column('show_id', sa.Integer), sa.Column('group_id', sa.Integer),
    sa.Column('playlist_id', sa.Integer), sa.Column('start_date', sa.String),
    sa.Column('end_date', sa.String), sa.Column('days', sa.JSON),
    sa.Column('start_at', sa.String), sa.Column('end_at', sa.String),
    sa.Column('power', sa.Boolean), sa.Column('note', sa.Text),
    sa.Column('created_at', sa.DateTime(timezone=True)),
    sa.Column('updated_at', sa.DateTime(timezone=True)),
)


def _today() -> date:
    try:
        from app.config import settings

        return datetime.now(settings.tz).date()
    except Exception:  # noqa: BLE001 - no settings: the computer's own clock
        return date.today()


def _month_end(day: date) -> date:
    return day.replace(day=calendar.monthrange(day.year, day.month)[1])


def _covers(entry, night: date) -> bool:
    """Whether a calendar entry (start_date, end_date, days) has this night."""
    start_date, end_date, days = entry
    try:
        first = date.fromisoformat(start_date)
        until = date.fromisoformat(end_date) if end_date else None
    except (TypeError, ValueError):
        return False
    return first <= night and (until is None or night <= until) and night.weekday() in (days or [])


def upgrade() -> None:
    conn = op.get_bind()
    today = _today()
    last = _month_end(today)
    now = datetime.now(UTC)
    planned = conn.execute(sa.select(show_calendar.c.start_date, show_calendar.c.end_date,
                                     show_calendar.c.days)).all()

    # The app only ever reads the first plan row; any other is a stray.
    plans = conn.execute(sa.select(show_plan).order_by(show_plan.c.id)).mappings().all()
    for place, plan in enumerate(plans):
        if (place == 0 and plan['enabled'] and plan['start_at'] and plan['end_at']
                and plan['show_id'] is not None):
            days = set(plan['days'] or [])
            keys: dict[str, str] = {}
            night = today
            while night <= last:
                if night.weekday() in days and not any(_covers(e, night) for e in planned):
                    result = conn.execute(show_calendar.insert().values(
                        kind='show', title='', show_id=plan['show_id'],
                        group_id=None if plan['playlist_id'] else plan['group_id'],
                        playlist_id=plan['playlist_id'],
                        start_date=night.isoformat(), end_date=night.isoformat(),
                        days=ALL_DAYS, start_at=plan['start_at'], end_at=plan['end_at'],
                        power=bool(plan['power']), note=NOTE,
                        created_at=now, updated_at=now))
                    keys[f"{night.isoformat()}:weekly"] = (
                        f"{night.isoformat()}:entry{result.inserted_primary_key[0]}")
                night += timedelta(days=1)
            # Tonight's show, already started under the weekly show time,
            # still counts as started (and is still ended at its end time).
            changes = {name: keys[plan[name]] for name in ('last_start_key', 'last_end_key')
                       if plan[name] in keys}
            if changes:
                conn.execute(show_plan.update().where(show_plan.c.id == plan['id'])
                             .values(**changes))
        conn.execute(show_plan.update().where(show_plan.c.id == plan['id'])
                     .values(enabled=False))

    open_ended = conn.execute(
        sa.select(show_calendar.c.id, show_calendar.c.start_date)
        .where(show_calendar.c.end_date.is_(None))).all()
    for entry_id, start_date in open_ended:
        try:
            ends = max(last, _month_end(date.fromisoformat(start_date)))
        except (TypeError, ValueError):
            ends = last
        conn.execute(show_calendar.update().where(show_calendar.c.id == entry_id)
                     .values(end_date=ends.isoformat()))


def downgrade() -> None:
    # Nothing to undo: no columns changed, and the entries made are ordinary ones.
    pass
