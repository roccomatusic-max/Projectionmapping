"""Daily retention pruning."""

from __future__ import annotations

from app.services.monitor import MonitoringService
from tests.test_api import api  # noqa: F401 - fixture


async def test_retention_prunes_sensor_readings_and_finished_runs(api):  # noqa: F811
    from datetime import UTC, datetime, timedelta

    from sqlalchemy import select

    from app.db.models import Automation, AutomationRun, Enclosure, EnclosureReading
    from app.db.session import session_scope

    old = datetime.now(UTC) - timedelta(days=4000)
    async with session_scope() as session:
        enclosure = Enclosure(name="Hood")
        automation = Automation(name="Nightly")
        session.add_all([enclosure, automation])
        await session.flush()
        session.add_all([
            EnclosureReading(enclosure_id=enclosure.id, metric="temp", value_num=1, recorded_at=old),
            EnclosureReading(enclosure_id=enclosure.id, metric="temp", value_num=2),
            AutomationRun(automation_id=automation.id, status="succeeded",
                          started_at=old, finished_at=old),
            AutomationRun(automation_id=automation.id, status="running", started_at=old),
            AutomationRun(automation_id=automation.id, status="succeeded",
                          finished_at=datetime.now(UTC)),
        ])
        await session.commit()

    await MonitoringService()._prune()

    async with session_scope() as session:
        readings = (await session.execute(select(EnclosureReading.value_num))).scalars().all()
        runs = (await session.execute(select(AutomationRun.status))).scalars().all()
    assert readings == [2]
    assert sorted(runs) == ["running", "succeeded"]
