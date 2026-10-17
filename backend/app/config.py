"""Environment-driven configuration."""

from __future__ import annotations

import secrets
from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


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
    secret_key: str = Field(default_factory=lambda: secrets.token_urlsafe(48))
    access_token_minutes: int = 720
    #: Created on first boot when no users exist.
    bootstrap_admin_username: str = "admin"
    bootstrap_admin_password: str | None = None

    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173"])

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

    # -- alerting ---------------------------------------------------------
    alert_renotify_minutes: int = 60
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_from: str | None = None
    smtp_tls: bool = True
    alert_email_to: list[str] = Field(default_factory=list)

    # -- integrations ------------------------------------------------------
    mqtt_enabled: bool = False
    mqtt_host: str = "localhost"
    mqtt_port: int = 1883
    mqtt_username: str | None = None
    mqtt_password: str | None = None
    mqtt_prefix: str = "projector"
    homeassistant_discovery: bool = True
    homeassistant_discovery_prefix: str = "homeassistant"

    # -- retention ---------------------------------------------------------
    telemetry_retention_days: int = 365
    command_log_retention_days: int = 180
    event_retention_days: int = 365

    @field_validator("cors_origins", "alert_email_to", mode="before")
    @classmethod
    def _split_csv(cls, value):
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
