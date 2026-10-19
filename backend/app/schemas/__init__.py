"""Pydantic request/response models."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

# -- auth ------------------------------------------------------------------


class LoginRequest(BaseModel):
    username: str
    password: str
    #: Stay signed in for ``remember_days`` instead of a working day.
    remember: bool = False


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    username: str
    expires_in: int


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    role: str
    is_active: bool
    last_login_at: datetime | None = None


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=10, description="Minimum 10 characters")
    role: Literal["admin", "operator", "viewer", "ingest"] = "viewer"


class ServiceTokenRequest(BaseModel):
    """A long-lived token for an integration (Home Assistant, a sensor).

    It carries the named user's role, so create a dedicated user with the
    narrowest role that works: ``ingest`` for a sensor, ``operator`` for
    an automation platform that must send commands. Deactivating or deleting
    that user revokes every token issued for it.
    """

    username: str
    days: int = Field(default=365, ge=1, le=3650)


class ServiceTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str
    role: str
    expires_at: datetime


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=10)


# -- projectors -------------------------------------------------------------


class ProjectorBase(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    manufacturer: str = "Panasonic"
    model: str = "PT-DZ13K"
    location: str = ""
    notes: str = ""
    host: str = Field(min_length=1, max_length=255)
    port: int = Field(default=1024, ge=1, le=65535)
    driver: str = "panasonic_pt_dz13k"
    username: str | None = None
    enabled: bool = True
    allow_unverified_commands: bool = False
    command_timeout: float | None = Field(default=None, ge=0.5, le=60)
    command_gap: float | None = Field(default=None, ge=0.0, le=10)
    poll_overrides: dict[str, float] = Field(default_factory=dict)
    lamp_warn_hours: int = Field(default=2000, ge=0)
    lamp_critical_hours: int = Field(default=2500, ge=0)
    pjlink_port: int | None = Field(default=None, ge=1, le=65535)


class ProjectorCreate(ProjectorBase):
    password: str | None = Field(
        default=None,
        description="Web-control administrator password. Stored encrypted; never returned.",
    )
    pjlink_password: str | None = None


class ProjectorUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    manufacturer: str | None = None
    model: str | None = None
    location: str | None = None
    notes: str | None = None
    host: str | None = None
    port: int | None = Field(default=None, ge=1, le=65535)
    driver: str | None = None
    username: str | None = None
    password: str | None = None
    pjlink_port: int | None = Field(default=None, ge=1, le=65535)
    pjlink_password: str | None = None
    enabled: bool | None = None
    allow_unverified_commands: bool | None = None
    command_timeout: float | None = Field(default=None, ge=0.5, le=60)
    command_gap: float | None = Field(default=None, ge=0.0, le=10)
    poll_overrides: dict[str, float] | None = None
    lamp_warn_hours: int | None = Field(default=None, ge=0)
    lamp_critical_hours: int | None = Field(default=None, ge=0)


class ProjectorStateOut(BaseModel):
    """Live state.

    ``online`` is derived from ``last_seen_at`` against the staleness window,
    never from a stored boolean alone — a remembered state is reported as
    ``stale``.
    """

    online: bool = False
    stale: bool = False
    power: str = "unknown"
    shutter: str = "unknown"
    health: str = "unknown"
    active_input: dict[str, Any] = Field(default_factory=dict)
    lamp_hours: dict[str, Any] = Field(default_factory=dict)
    lamp_status: dict[str, Any] = Field(default_factory=dict)
    error_status: dict[str, Any] = Field(default_factory=dict)
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    last_seen_at: datetime | None = None
    last_error: str | None = None
    consecutive_failures: int = 0
    queue_depth: int = 0
    #: Identity and condition from the last successful diagnostics poll:
    #: serial number, firmware, temperature, fan, filter. Each value carries
    #: its availability, so "not supported" is distinguishable from "not read".
    equipment: dict[str, Any] = Field(default_factory=dict)


class ProjectorOut(ProjectorBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    has_password: bool = False
    has_pjlink_password: bool = False
    created_at: datetime | None = None
    state: ProjectorStateOut = Field(default_factory=ProjectorStateOut)


# -- commands ---------------------------------------------------------------


class ConfirmableCommand(BaseModel):
    """Disruptive commands require an explicit acknowledgement.

    The UI supplies this from its confirmation dialog. An API client that
    omits it gets a 428 naming what it was about to do, which keeps a stray
    curl from blacking out a show.
    """

    confirm: bool = False


class PowerRequest(ConfirmableCommand):
    state: Literal["on", "off"]


class ShutterRequest(ConfirmableCommand):
    state: Literal["open", "closed"]


class InputRequest(ConfirmableCommand):
    input: str = Field(min_length=1, max_length=16)


class GenericCommand(ConfirmableCommand):
    capability: str = Field(min_length=1, max_length=64)
    params: dict[str, Any] = Field(default_factory=dict)


class GroupCommand(GenericCommand):
    """Bulk command over a group."""


class CommandResultOut(BaseModel):
    projector_id: int | None = None
    name: str | None = None
    capability: str | None = None
    outcome: str
    value: Any = None
    raw_request: str | None = None
    raw_response: str | None = None
    error: str | None = None
    latency_ms: int | None = None
    attempts: int = 1


class GroupCommandResult(BaseModel):
    """Per-device results for a concurrent dispatch.

    ``dispatched_at`` is deliberate: commands leave together, but when each
    projector acts is its own business. This is not frame-accurate
    synchronisation.
    """

    dispatched_at: datetime
    capability: str
    results: list[CommandResultOut]
    summary: dict[str, int]


# -- groups -----------------------------------------------------------------


class GroupBase(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    description: str = ""
    color: str = "#38bdf8"


class GroupCreate(GroupBase):
    projector_ids: list[int] = Field(default_factory=list)


class GroupUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    color: str | None = None
    projector_ids: list[int] | None = None


class GroupOut(GroupBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    projector_ids: list[int] = Field(default_factory=list)


# -- events, alerts ---------------------------------------------------------


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    projector_id: int | None
    severity: str
    kind: str
    message: str
    details: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class AlertOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    projector_id: int | None
    kind: str
    severity: str
    state: str
    message: str
    details: dict[str, Any] = Field(default_factory=dict)
    opened_at: datetime
    acknowledged_at: datetime | None = None
    acknowledged_by: str | None = None
    resolved_at: datetime | None = None
    notify_count: int = 0


class AlertRuleIn(BaseModel):
    name: str
    kind: str
    severity: Literal["info", "warning", "critical"] = "warning"
    enabled: bool = True
    threshold: dict[str, Any] = Field(default_factory=dict)
    channels: list[str] = Field(default_factory=lambda: ["dashboard"])
    webhook_url: str | None = None
    renotify_minutes: int = Field(default=60, ge=1)
    projector_id: int | None = None


class AlertRuleOut(AlertRuleIn):
    model_config = ConfigDict(from_attributes=True)
    id: int


# -- automation, scenes -----------------------------------------------------


class AutomationIn(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    description: str = ""
    enabled: bool = True
    trigger_type: Literal["manual", "once", "daily", "weekly", "cron"] = "manual"
    schedule: dict[str, Any] = Field(default_factory=dict)
    steps: list[dict[str, Any]] = Field(default_factory=list)
    abort_on_failure: bool = True

    @field_validator("schedule")
    @classmethod
    def _validate_schedule(cls, schedule: dict[str, Any], info) -> dict[str, Any]:
        expression = schedule.get("cron")
        if expression:
            from app.services.cron import CronError, validate

            try:
                validate(str(expression))
            except CronError as exc:
                raise ValueError(f"invalid cron expression {expression!r}: {exc}") from exc
        return schedule

    @field_validator("steps")
    @classmethod
    def _validate_steps(cls, steps: list[dict[str, Any]]) -> list[dict[str, Any]]:
        known = {"command", "wait_state", "delay", "check_online", "check_faults",
                 "check_enclosure", "scene", "notify"}
        for index, step in enumerate(steps):
            kind = step.get("type", "command")
            if kind not in known:
                raise ValueError(
                    f"step {index}: unknown type {kind!r}; expected one of "
                    f"{', '.join(sorted(known))}"
                )
            if kind == "command" and not step.get("capability"):
                raise ValueError(f"step {index}: a command step needs a 'capability'")
        return steps


class AutomationOut(AutomationIn):
    model_config = ConfigDict(from_attributes=True)
    id: int
    last_run_at: datetime | None = None
    last_status: str | None = None


class AutomationRunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    automation_id: int
    status: str
    trigger: str
    started_at: datetime
    finished_at: datetime | None = None
    step_results: list[dict[str, Any]] = Field(default_factory=list)
    error: str | None = None


class SceneIn(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    description: str = ""
    icon: str = "play"
    actions: list[dict[str, Any]] = Field(default_factory=list)


class SceneOut(SceneIn):
    model_config = ConfigDict(from_attributes=True)
    id: int


# -- maintenance, enclosure -------------------------------------------------


class MaintenanceIn(BaseModel):
    projector_id: int
    kind: Literal["lamp_replacement", "filter_clean", "filter_replacement",
                  "service", "note"]
    performed_at: datetime | None = None
    lamp_index: int | None = None
    hours_at_service: int | None = None
    notes: str = ""
    next_due_hours: int | None = None
    next_due_at: datetime | None = None


class MaintenanceOut(MaintenanceIn):
    model_config = ConfigDict(from_attributes=True)
    id: int
    performed_by: str | None = None
    performed_at: datetime


class EnclosureIn(BaseModel):
    name: str
    projector_id: int | None = None
    location: str = ""
    mqtt_prefix: str | None = None
    temp_warn_c: float = 40.0
    temp_critical_c: float = 50.0
    humidity_warn_pct: float = 80.0
    block_startup_on_fault: bool = True
    config: dict[str, Any] = Field(default_factory=dict)


class EnclosureOut(EnclosureIn):
    model_config = ConfigDict(from_attributes=True)
    id: int
    latest: dict[str, Any] = Field(default_factory=dict)


class EnclosureReadingIn(BaseModel):
    """Sensor ingest.

    Accepts a numeric or boolean value; booleans are stored as 0/1 so a leak
    sensor and a temperature probe share one history table.
    """

    metric: str = Field(min_length=1, max_length=64)
    value: float | bool | str
    recorded_at: datetime | None = None


class TelemetryPoint(BaseModel):
    metric: str
    value_num: float | None = None
    value_text: str | None = None
    recorded_at: datetime
