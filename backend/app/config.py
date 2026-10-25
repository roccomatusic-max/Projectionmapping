"""Environment-driven configuration."""

from __future__ import annotations

import json
import secrets
from datetime import datetime, tzinfo
from functools import lru_cache
from typing import Annotated
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

#: A list read from one comma-separated variable. NoDecode hands the raw text
#: to the validator below; otherwise it must be JSON, and the empty value
#: docker-compose passes for an unset variable stops the server starting.
CsvList = Annotated[list[str], NoDecode]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    app_name: str = "Projector Control"
    environment: str = Field(default="production")
    debug: bool = False

    # -- database --------------------------------------------------------
    database_url: str = Field(default="sqlite+aiosqlite:///./data/projector.db")

    # -- security --------------------------------------------------------
    #: Signs JWTs and derives the device-credential encryption key.
    #: MUST be set in production; a generated value invalidates all sessions
    #: and makes stored device passwords unreadable on restart.
    secret_key: str = ""
    #: True when SECRET_KEY was not configured and a throwaway one was made.
    #: Startup logs a loud warning, because stored projector passwords will
    #: not survive a restart in that state.
    secret_key_generated: bool = False
    access_token_minutes: int = 720
    #: A sign-in that asks to be remembered (the phone remote's) lasts this long,
    #: so a remote is not signed out in the middle of a show week.
    remember_days: int = 90
    #: Created on first boot when no users exist.
    bootstrap_admin_username: str = "admin"
    bootstrap_admin_password: str | None = None

    cors_origins: CsvList = Field(default_factory=lambda: ["http://localhost:5173"])

    # -- scheduling -------------------------------------------------------
    #: IANA zone the automation scheduler interprets "20:30" in. Unset means
    #: the host's local zone, which inside Docker is UTC unless TZ is set.
    schedule_timezone: str | None = None
    #: A one-shot automation that was due while the server was down fires on
    #: start-up only if it is at most this late; otherwise it is marked missed.
    once_grace_minutes: int = 10
    #: A projector observed going from on to standby with no power-off in the
    #: command log inside this window raises an "unexpected shutdown" alert.
    unexpected_shutdown_window_minutes: int = 10
    #: Apply Alembic migrations on start-up (file and server databases).
    auto_migrate: bool = True

    # -- polling tiers (seconds) -----------------------------------------
    poll_connectivity: int = 10
    poll_operational: int = 15
    poll_diagnostics: int = 60
    poll_maintenance: int = 300
    #: A device is "stale" rather than "online" once this many seconds have
    #: passed with no successful poll. Never report a remembered state as live.
    staleness_multiplier: float = 3.0
    #: Consecutive failed polls before an offline alert opens.
    offline_threshold: int = 2

    # -- device defaults --------------------------------------------------
    command_timeout: float = 5.0
    connect_timeout: float = 3.0
    #: Panasonic documents waiting >0.5s between commands.
    panasonic_command_gap: float = 0.6
    pjlink_command_gap: float = 0.15
    #: Seconds to wait after PON/POF before the confirming QPW poll.
    power_verify_delay: float = 2.0
    power_verify_attempts: int = 30
    #: A power command refused while the projector cools down (or starts
    #: up) is held and re-sent every ``power_queue_interval`` seconds, for
    #: at most ``power_queue_seconds``. Panasonic cool-down is 1-2 minutes.
    power_queue_interval: float = 5.0
    power_queue_seconds: float = 300.0

    # -- alerting ---------------------------------------------------------
    alert_renotify_minutes: int = 60
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_from: str | None = None
    smtp_tls: bool = True
    alert_email_to: CsvList = Field(default_factory=list)

    # -- integrations ------------------------------------------------------
    mqtt_enabled: bool = False
    mqtt_host: str = "localhost"
    mqtt_port: int = 1883
    mqtt_username: str | None = None
    mqtt_password: str | None = None
    mqtt_prefix: str = "projector"
    #: Accept power/shutter/input commands published to <prefix>/<name>/<x>/set.
    #: Off by default: anyone who can publish to the broker could drive the
    #: projectors, so turn it on only with broker authentication and ACLs.
    mqtt_allow_commands: bool = False
    homeassistant_discovery: bool = True
    homeassistant_discovery_prefix: str = "homeassistant"

    # -- mapping media ------------------------------------------------------
    #: Folder holding the media library's files. Relative paths resolve
    #: against the working directory, like the default SQLite database.
    media_dir: str = "./data/media"
    #: Largest single upload accepted. Show content at 8K is easily 20 GB.
    media_max_upload_mb: int = 50_000

    # -- mini PCs ------------------------------------------------------------
    #: HTTP port other machines reach this server on. When set, the server
    #: answers mini PCs looking for it (services/discovery.py). The desktop
    #: launcher sets it in --lan mode.
    advertise_port: int | None = None
    #: Fetch new Mini PC app versions and hand them to the mini PCs, which
    #: install them by themselves when no show is on (services/minipc_updates.py).
    minipc_updates: bool = True
    #: UDP port mini PCs broadcast to when looking for the server.
    discovery_port: int = 8765
    #: Only this computer can reach the server (desktop mode without --lan),
    #: so no mini PC or phone can. The Players tab says so.
    local_only: bool = False

    # -- retention ---------------------------------------------------------
    telemetry_retention_days: int = 365
    command_log_retention_days: int = 180
    event_retention_days: int = 365

    @field_validator("cors_origins", "alert_email_to", mode="before")
    @classmethod
    def _split_csv(cls, value):
        if isinstance(value, str):
            if value.strip().startswith("["):  # the JSON form, which worked before
                return json.loads(value)
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @model_validator(mode="after")
    def _finalise(self) -> Settings:
        if not self.secret_key:
            self.secret_key = secrets.token_urlsafe(48)
            self.secret_key_generated = True
        if self.schedule_timezone:
            try:
                ZoneInfo(self.schedule_timezone)
            except (ZoneInfoNotFoundError, ValueError) as exc:
                raise ValueError(
                    f"SCHEDULE_TIMEZONE={self.schedule_timezone!r} is not a valid IANA "
                    f"time zone (try Europe/London or America/New_York)"
                ) from exc
        return self

    @property
    def tz(self) -> tzinfo:
        """The zone schedules are interpreted in.

        A proper ZoneInfo, not the fixed offset ``astimezone()`` would give:
        a one-shot scheduled for a date on the other side of a DST change
        must be resolved with that date's offset, not today's.
        """
        if self.schedule_timezone:
            return ZoneInfo(self.schedule_timezone)
        try:
            from tzlocal import get_localzone

            return get_localzone()
        except Exception:  # noqa: BLE001 - tzlocal missing or host misconfigured
            local = datetime.now().astimezone().tzinfo
            return local if local is not None else ZoneInfo("UTC")

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    @property
    def is_memory_sqlite(self) -> bool:
        return self.is_sqlite and ":memory:" in self.database_url


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
