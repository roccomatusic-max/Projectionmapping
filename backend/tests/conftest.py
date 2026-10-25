"""Shared test fixtures."""

from __future__ import annotations

import os

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("SECRET_KEY", "test-secret-key-at-least-32-characters-long")
os.environ.setdefault("BOOTSTRAP_ADMIN_PASSWORD", "test-admin-password")
os.environ.setdefault("POLL_CONNECTIVITY", "3600")
os.environ.setdefault("POLL_OPERATIONAL", "3600")
os.environ.setdefault("POLL_DIAGNOSTICS", "3600")
os.environ.setdefault("POLL_MAINTENANCE", "3600")
os.environ.setdefault("POWER_VERIFY_DELAY", "0.2")
os.environ.setdefault("MINIPC_UPDATES", "false")
os.environ.setdefault("POWER_VERIFY_ATTEMPTS", "5")

import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402

from app.drivers import ConnectionConfig  # noqa: E402
from app.drivers.panasonic_ptdz13k import PanasonicPTDZ13KDriver  # noqa: E402
from app.drivers.pjlink import PJLinkDriver  # noqa: E402
from simulator import PanasonicSimulator, PJLinkSimulator, SimulatedProjector  # noqa: E402


@pytest.fixture
def sim_state() -> SimulatedProjector:
    """A simulated projector with fast transitions."""
    return SimulatedProjector(warmup_seconds=0.3, cooldown_seconds=0.3)


@pytest_asyncio.fixture
async def panasonic_sim(sim_state):
    """Panasonic NTCONTROL simulator on an ephemeral port."""
    simulator = PanasonicSimulator(sim_state, host="127.0.0.1", port=0)
    await simulator.start()
    try:
        yield simulator
    finally:
        await simulator.stop()


@pytest_asyncio.fixture
async def pjlink_sim(sim_state):
    simulator = PJLinkSimulator(sim_state, host="127.0.0.1", port=0)
    await simulator.start()
    try:
        yield simulator
    finally:
        await simulator.stop()


def panasonic_config(simulator, **overrides) -> ConnectionConfig:
    defaults = dict(host="127.0.0.1", port=simulator.actual_port,
                    username="admin1", timeout=3.0, connect_timeout=2.0,
                    command_gap=0.0, label="test")
    defaults.update(overrides)
    return ConnectionConfig(**defaults)


@pytest_asyncio.fixture
async def panasonic_driver(panasonic_sim):
    driver = PanasonicPTDZ13KDriver(panasonic_config(panasonic_sim))
    await driver.connect()
    await driver.authenticate()
    try:
        yield driver
    finally:
        await driver.disconnect()


@pytest_asyncio.fixture
async def pjlink_driver(pjlink_sim):
    driver = PJLinkDriver(ConnectionConfig(
        host="127.0.0.1", port=pjlink_sim.actual_port,
        timeout=3.0, connect_timeout=2.0, command_gap=0.0, label="test",
    ))
    await driver.connect()
    await driver.authenticate()
    try:
        yield driver
    finally:
        await driver.disconnect()
