"""SQLAlchemy ORM models.

Works on both PostgreSQL (production) and SQLite (development). JSON columns
use the portable ``JSON`` type rather than ``JSONB`` for that reason; if you
standardise on Postgres, switching to JSONB and adding GIN indexes is a
mechanical change.
"""

from __future__ import annotations

import enum
from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utcnow() -> datetime:
    return datetime.now(UTC)


def as_utc(value: datetime | None) -> datetime | None:
    """Normalise a database datetime to timezone-aware UTC.

    PostgreSQL returns aware datetimes; SQLite returns naive ones. Comparing
    the two raises, so every read that does date arithmetic goes through
    this.
    """
    if value is None:
        return None
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


class Base(DeclarativeBase):
    pass


# --------------------------------------------------------------------------
# Enumerations stored as strings (readable in the DB, stable across releases)
# --------------------------------------------------------------------------


class Role(str, enum.Enum):
    ADMIN = "admin"
    OPERATOR = "operator"
    VIEWER = "viewer"

    def at_least(self, required: Role) -> bool:
        order = {Role.VIEWER: 0, Role.OPERATOR: 1, Role.ADMIN: 2}
        return order[self] >= order[required]


class Severity(str, enum.Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class AlertState(str, enum.Enum):
    OPEN = "open"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"


class RunStatus(str, enum.Enum):
    RUNNING = "running"
    SUCCESS = "success"
    PARTIAL = "partial"
    FAILED = "failed"
    ABORTED = "aborted"


# --------------------------------------------------------------------------


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(16), default=Role.VIEWER.value)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Projector(Base):
    __tablename__ = "projectors"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128), unique=True)
    manufacturer: Mapped[str] = mapped_column(String(64), default="Panasonic")
    model: Mapped[str] = mapped_column(String(64), default="PT-DZ13K")
    location: Mapped[str] = mapped_column(String(128), default="")
    notes: Mapped[str] = mapped_column(Text, default="")

    host: Mapped[str] = mapped_column(String(255))
    port: Mapped[int] = mapped_column(Integer, default=1024)
    driver: Mapped[str] = mapped_column(String(64), default="panasonic_pt_dz13k")
    username: Mapped[str | None] = mapped_column(String(64))
    #: Fernet ciphertext. Never serialized by the API.
    password_enc: Mapped[str | None] = mapped_column(Text)

    #: Optional secondary PJLink endpoint, used for %1ERST health reporting on
    #: Panasonic units whose LAN protocol has no equivalent query.
    pjlink_port: Mapped[int | None] = mapped_column(Integer)
    pjlink_password_enc: Mapped[str | None] = mapped_column(Text)

    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    #: Permits commands whose provenance is INFERRED_FAMILY. Off by default.
    allow_unverified_commands: Mapped[bool] = mapped_column(Boolean, default=False)
    command_timeout: Mapped[float | None] = mapped_column(Float)
    command_gap: Mapped[float | None] = mapped_column(Float)
    poll_overrides: Mapped[dict] = mapped_column(JSON, default=dict)
    #: Last-known driver manifest including runtime retractions.
    capabilities_cache: Mapped[dict] = mapped_column(JSON, default=dict)
    lamp_warn_hours: Mapped[int] = mapped_column(Integer, default=2000)
    lamp_critical_hours: Mapped[int] = mapped_column(Integer, default=2500)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    state: Mapped[ProjectorState] = relationship(
        back_populates="projector", uselist=False, cascade="all, delete-orphan"
    )
    memberships: Mapped[list[GroupMember]] = relationship(
        back_populates="projector", cascade="all, delete-orphan"
    )


class ProjectorState(Base):
    """Latest observed state. One row per projector, updated in place.

    ``last_seen_at`` plus ``stale_after`` is what makes "online" an
    observation rather than a memory: the API computes liveness from the
    timestamp, never from the boolean alone.
    """

    __tablename__ = "projector_state"

    projector_id: Mapped[int] = mapped_column(
        ForeignKey("projectors.id", ondelete="CASCADE"), primary_key=True
    )
    online: Mapped[bool] = mapped_column(Boolean, default=False)
    power: Mapped[str] = mapped_column(String(16), default="unknown")
    shutter: Mapped[str] = mapped_column(String(16), default="unknown")
    health: Mapped[str] = mapped_column(String(16), default="unknown")
    active_input: Mapped[dict] = mapped_column(JSON, default=dict)
    lamp_hours: Mapped[dict] = mapped_column(JSON, default=dict)
    lamp_status: Mapped[dict] = mapped_column(JSON, default=dict)
    error_status: Mapped[dict] = mapped_column(JSON, default=dict)
    extra: Mapped[dict] = mapped_column(JSON, default=dict)
    errors: Mapped[list] = mapped_column(JSON, default=list)
    warnings: Mapped[list] = mapped_column(JSON, default=list)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(Text)
    consecutive_failures: Mapped[int] = mapped_column(Integer, default=0)
    stale_after: Mapped[int] = mapped_column(Integer, default=45)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    projector: Mapped[Projector] = relationship(back_populates="state")


class Group(Base):
    __tablename__ = "groups"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128), unique=True)
    description: Mapped[str] = mapped_column(Text, default="")
    color: Mapped[str] = mapped_column(String(16), default="#38bdf8")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    members: Mapped[list[GroupMember]] = relationship(
        back_populates="group", cascade="all, delete-orphan",
        order_by="GroupMember.position",
    )


class GroupMember(Base):
    __tablename__ = "group_members"
    __table_args__ = (UniqueConstraint("group_id", "projector_id", name="uq_group_member"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("groups.id", ondelete="CASCADE"))
    projector_id: Mapped[int] = mapped_column(ForeignKey("projectors.id", ondelete="CASCADE"))
    position: Mapped[int] = mapped_column(Integer, default=0)

    group: Mapped[Group] = relationship(back_populates="members")
    projector: Mapped[Projector] = relationship(back_populates="memberships")


class CommandLog(Base):
    """Audit trail. A row is written *before* dispatch and updated with the
    outcome, so a command interrupted by a crash leaves evidence."""

    __tablename__ = "command_log"
    __table_args__ = (Index("ix_command_log_projector_time", "projector_id", "created_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    projector_id: Mapped[int | None] = mapped_column(
        ForeignKey("projectors.id", ondelete="SET NULL")
    )
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    username: Mapped[str | None] = mapped_column(String(64))
    #: ui | api | automation | monitor | scene
    source: Mapped[str] = mapped_column(String(32), default="api")
    capability: Mapped[str] = mapped_column(String(64))
    params: Mapped[dict] = mapped_column(JSON, default=dict)
    outcome: Mapped[str] = mapped_column(String(32), default="pending")
    raw_request: Mapped[str | None] = mapped_column(Text)
    raw_response: Mapped[str | None] = mapped_column(Text)
    error: Mapped[str | None] = mapped_column(Text)
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    attempts: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, index=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Telemetry(Base):
    """Long-term metric history.

    Narrow table rather than wide: metrics differ by driver and model, and a
    wide table would be mostly NULL at 25 heterogeneous devices.
    """

    __tablename__ = "telemetry"
    __table_args__ = (Index("ix_telemetry_lookup", "projector_id", "metric", "recorded_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    projector_id: Mapped[int] = mapped_column(ForeignKey("projectors.id", ondelete="CASCADE"))
    metric: Mapped[str] = mapped_column(String(64))
    value_num: Mapped[float | None] = mapped_column(Float)
    value_text: Mapped[str | None] = mapped_column(String(255))
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, index=True
    )


class Event(Base):
    __tablename__ = "events"
    __table_args__ = (Index("ix_events_time_sev", "created_at", "severity"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    projector_id: Mapped[int | None] = mapped_column(
        ForeignKey("projectors.id", ondelete="CASCADE")
    )
    severity: Mapped[str] = mapped_column(String(16), default=Severity.INFO.value)
    kind: Mapped[str] = mapped_column(String(64))
    message: Mapped[str] = mapped_column(Text)
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, index=True
    )


class AlertRule(Base):
    __tablename__ = "alert_rules"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128), unique=True)
    #: offline | lamp_hours | health_warning | health_error | automation_failed
    #: | unexpected_shutdown | enclosure_temperature | enclosure_leak
    kind: Mapped[str] = mapped_column(String(64))
    severity: Mapped[str] = mapped_column(String(16), default=Severity.WARNING.value)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    threshold: Mapped[dict] = mapped_column(JSON, default=dict)
    #: ["dashboard", "email", "mqtt", "webhook"]
    channels: Mapped[list] = mapped_column(JSON, default=lambda: ["dashboard"])
    webhook_url: Mapped[str | None] = mapped_column(String(512))
    #: Suppress repeat notifications for an unresolved condition.
    renotify_minutes: Mapped[int] = mapped_column(Integer, default=60)
    projector_id: Mapped[int | None] = mapped_column(
        ForeignKey("projectors.id", ondelete="CASCADE")
    )


class Alert(Base):
    __tablename__ = "alerts"
    __table_args__ = (Index("ix_alerts_state", "state", "opened_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    projector_id: Mapped[int | None] = mapped_column(
        ForeignKey("projectors.id", ondelete="CASCADE")
    )
    rule_id: Mapped[int | None] = mapped_column(ForeignKey("alert_rules.id", ondelete="SET NULL"))
    #: Stable identity for an unresolved condition, e.g. "offline:3".
    dedupe_key: Mapped[str] = mapped_column(String(128), index=True)
    kind: Mapped[str] = mapped_column(String(64))
    severity: Mapped[str] = mapped_column(String(16), default=Severity.WARNING.value)
    state: Mapped[str] = mapped_column(String(16), default=AlertState.OPEN.value)
    message: Mapped[str] = mapped_column(Text)
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    acknowledged_by: Mapped[str | None] = mapped_column(String(64))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notify_count: Mapped[int] = mapped_column(Integer, default=0)


class Automation(Base):
    __tablename__ = "automations"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128), unique=True)
    description: Mapped[str] = mapped_column(Text, default="")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    #: manual | once | daily | weekly | cron
    trigger_type: Mapped[str] = mapped_column(String(32), default="manual")
    #: {"at": "20:30", "days": [0,1,...], "cron": "...", "run_at": iso8601}
    schedule: Mapped[dict] = mapped_column(JSON, default=dict)
    #: Ordered step list; see app/services/automation.py for the step schema.
    steps: Mapped[list] = mapped_column(JSON, default=list)
    #: Stop the run on the first failed step.
    abort_on_failure: Mapped[bool] = mapped_column(Boolean, default=True)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_status: Mapped[str | None] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AutomationRun(Base):
    __tablename__ = "automation_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    automation_id: Mapped[int] = mapped_column(
        ForeignKey("automations.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[str] = mapped_column(String(16), default=RunStatus.RUNNING.value)
    trigger: Mapped[str] = mapped_column(String(32), default="manual")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    step_results: Mapped[list] = mapped_column(JSON, default=list)
    error: Mapped[str | None] = mapped_column(Text)


class Scene(Base):
    """A named set of actions over projectors or groups."""

    __tablename__ = "scenes"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128), unique=True)
    description: Mapped[str] = mapped_column(Text, default="")
    icon: Mapped[str] = mapped_column(String(32), default="play")
    #: [{"target": {"type": "group"|"projector"|"all", "id": n},
    #:   "capability": "...", "params": {...}}]
    actions: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class MaintenanceRecord(Base):
    __tablename__ = "maintenance"

    id: Mapped[int] = mapped_column(primary_key=True)
    projector_id: Mapped[int] = mapped_column(
        ForeignKey("projectors.id", ondelete="CASCADE"), index=True
    )
    #: lamp_replacement | filter_clean | filter_replacement | service | note
    kind: Mapped[str] = mapped_column(String(32))
    performed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    lamp_index: Mapped[int | None] = mapped_column(Integer)
    hours_at_service: Mapped[int | None] = mapped_column(Integer)
    notes: Mapped[str] = mapped_column(Text, default="")
    performed_by: Mapped[str | None] = mapped_column(String(64))
    next_due_hours: Mapped[int | None] = mapped_column(Integer)
    next_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Enclosure(Base):
    """Outdoor enclosure housing one or more projectors.

    Readings arrive over MQTT or the HTTP ingest endpoint. This platform
    monitors and alerts; it is explicitly not the thermal safety device —
    see docs/ENCLOSURE.md.
    """

    __tablename__ = "enclosures"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128), unique=True)
    projector_id: Mapped[int | None] = mapped_column(
        ForeignKey("projectors.id", ondelete="SET NULL")
    )
    location: Mapped[str] = mapped_column(String(128), default="")
    #: MQTT topic prefix this enclosure publishes under.
    mqtt_prefix: Mapped[str | None] = mapped_column(String(255))
    config: Mapped[dict] = mapped_column(JSON, default=dict)
    temp_warn_c: Mapped[float] = mapped_column(Float, default=40.0)
    temp_critical_c: Mapped[float] = mapped_column(Float, default=50.0)
    humidity_warn_pct: Mapped[float] = mapped_column(Float, default=80.0)
    #: Block scheduled startup while a critical environmental condition holds.
    block_startup_on_fault: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class EnclosureReading(Base):
    __tablename__ = "enclosure_readings"
    __table_args__ = (Index("ix_enclosure_readings", "enclosure_id", "metric", "recorded_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    enclosure_id: Mapped[int] = mapped_column(ForeignKey("enclosures.id", ondelete="CASCADE"))
    #: internal_temp_c | external_temp_c | humidity_pct | dew_point_c |
    #: leak | airflow | fan_ok | power_w | power_ok
    metric: Mapped[str] = mapped_column(String(64))
    value_num: Mapped[float | None] = mapped_column(Float)
    value_text: Mapped[str | None] = mapped_column(String(255))
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, index=True
    )
