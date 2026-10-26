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
    #: Can post enclosure sensor readings and nothing else. For the ESP32 in
    #: the enclosure, whose token should not be able to read the fleet, let
    #: alone power a projector.
    INGEST = "ingest"

    def at_least(self, required: Role) -> bool:
        if self is Role.INGEST:
            return False
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


# --------------------------------------------------------------------------
# Mapping media: content and how it is shaped onto the building
# --------------------------------------------------------------------------


class MediaAsset(Base):
    """A video or still in the media library.

    The file lives in the media folder under ``stored_name``; the database
    holds only its description. Dimensions and duration are what the
    uploading browser probed, since the server cannot decode video itself.
    """

    __tablename__ = "media_assets"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    stored_name: Mapped[str] = mapped_column(String(128), unique=True)
    kind: Mapped[str] = mapped_column(String(16))  # "video" | "image"
    content_type: Mapped[str] = mapped_column(String(128))
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    duration: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class MappingShow(Base):
    """A content canvas, the outputs that slice it, and the cues that fill it."""

    __tablename__ = "mapping_shows"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128), unique=True)
    description: Mapped[str] = mapped_column(Text, default="")
    canvas_width: Mapped[int] = mapped_column(Integer, default=3840)
    canvas_height: Mapped[int] = mapped_column(Integer, default=2160)
    #: Where the canvas sits in the calibration camera's view:
    #: {"camera_id": n, "corners": [[x, y] * 4]} in camera-image fractions.
    camera_view: Mapped[dict] = mapped_column(JSON, default=dict, server_default="{}")
    #: The building's parts traced on the canvas, for scenes to decorate:
    #: [{"id", "name", "kind": "wall"|"roof"|"window"|"door"|"other",
    #:   "points": [[x, y]...]}] in canvas fractions.
    surfaces: Mapped[list] = mapped_column(JSON, default=list, server_default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    outputs: Mapped[list[MappingOutput]] = relationship(
        back_populates="show", cascade="all, delete-orphan",
        order_by="MappingOutput.position",
    )
    cues: Mapped[list[MappingCue]] = relationship(
        back_populates="show", cascade="all, delete-orphan",
        order_by="MappingCue.position",
    )


class MappingOutput(Base):
    """One projector's image: a slice of the canvas, warped, masked, blended.

    Geometry is stored as JSON in normalised units so it survives a change
    of display resolution: the source rect in canvas fractions, warp points
    and masks in output fractions (0,0 top-left, 1,1 bottom-right).
    """

    __tablename__ = "mapping_outputs"

    id: Mapped[int] = mapped_column(primary_key=True)
    show_id: Mapped[int] = mapped_column(ForeignKey("mapping_shows.id", ondelete="CASCADE"),
                                         index=True)
    name: Mapped[str] = mapped_column(String(128))
    position: Mapped[int] = mapped_column(Integer, default=0)
    projector_id: Mapped[int | None] = mapped_column(
        ForeignKey("projectors.id", ondelete="SET NULL")
    )
    width: Mapped[int] = mapped_column(Integer, default=1920)
    height: Mapped[int] = mapped_column(Integer, default=1200)
    #: {"x", "y", "w", "h"} in canvas fractions.
    source: Mapped[dict] = mapped_column(JSON, default=dict)
    #: {"corners": [[x,y]*4 TL,TR,BR,BL], "mesh": {"cols","rows","points":[[dx,dy]...]}|null}
    warp: Mapped[dict] = mapped_column(JSON, default=dict)
    #: [{"points": [[x,y]...], "feather": px, "invert": bool, "enabled": bool}]
    masks: Mapped[list] = mapped_column(JSON, default=list)
    #: {"left"|"right"|"top"|"bottom": {"width": frac, "gamma": g, "curve": c}}
    blend: Mapped[dict] = mapped_column(JSON, default=dict)
    #: {"brightness", "gamma", "red", "green", "blue"}
    color: Mapped[dict] = mapped_column(JSON, default=dict)
    #: "none" | "grid" | "id" | "white" | "black" | "red" | "green" | "blue"
    test_pattern: Mapped[str] = mapped_column(String(16), default="none")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    #: Last camera calibration: which camera, when, and the decoded map from
    #: camera image to projector pixels. See services/calibration.py.
    calibration: Mapped[dict] = mapped_column(JSON, default=dict, server_default="{}")

    show: Mapped[MappingShow] = relationship(back_populates="outputs")


class MappingCue(Base):
    __tablename__ = "mapping_cues"

    id: Mapped[int] = mapped_column(primary_key=True)
    show_id: Mapped[int] = mapped_column(ForeignKey("mapping_shows.id", ondelete="CASCADE"),
                                         index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    name: Mapped[str] = mapped_column(String(128), default="")
    media_id: Mapped[int | None] = mapped_column(
        ForeignKey("media_assets.id", ondelete="SET NULL")
    )
    #: "fill" (cover, crop) | "fit" (contain, letterbox) | "stretch"
    fit: Mapped[str] = mapped_column(String(16), default="fill")
    loop: Mapped[bool] = mapped_column(Boolean, default=True)
    fade_seconds: Mapped[float] = mapped_column(Float, default=1.0)
    #: How people tracked by a depth camera affect this cue:
    #: "none" | "spotlight" (lit around them) | "ripple" (rings spread from them)
    interaction: Mapped[str] = mapped_column(String(16), default="none",
                                             server_default="none")
    #: Seconds a still holds, or a non-looping video runs, before auto-follow.
    #: None means hold until the next GO.
    follow_seconds: Mapped[float | None] = mapped_column(Float)
    #: A scene from the scene library, drawn over the media (or alone).
    scene_id: Mapped[int | None] = mapped_column(
        ForeignKey("mapping_scenes.id", ondelete="SET NULL")
    )
    #: A different scene on some projectors: {output id: scene id, or None
    #: for no scene there}. Outputs not listed play ``scene_id``.
    output_scenes: Mapped[dict] = mapped_column(JSON, default=dict, server_default="{}")
    #: A picture of their own on some projectors: {output id: media id, or
    #: None for no media there}. Outputs not listed show their part of ``media_id``.
    output_media: Mapped[dict] = mapped_column(JSON, default=dict, server_default="{}")

    show: Mapped[MappingShow] = relationship(back_populates="cues")


class MappingScene(Base):
    """A live, generated design: a stack of layers drawn by every output.

    Layers are rendered in the browser from a few parameters each (see
    frontend/src/mapping/scene/), in canvas space so they line up across
    projectors, and can follow the people a depth camera tracks. A scene
    is shared by every show, like media; it decorates whichever show's
    traced surfaces it plays on.
    """

    __tablename__ = "mapping_scenes"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128), unique=True)
    description: Mapped[str] = mapped_column(Text, default="")
    #: [{"id", "type", "enabled", "opacity", "blend", "color", ...}], bottom first.
    layers: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class MappingMap(Base):
    """A saved map: one physical setup's mapping, reusable by any show.

    Everything lined up for a building: the canvas size, each output's
    slice, warp, masks, blends, colour and calibration, where the canvas
    sits in the camera's view, and the traced house parts. Applying it to a
    show copies it in; the map and the show stay independent afterwards.
    """

    __tablename__ = "mapping_maps"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128), unique=True)
    description: Mapped[str] = mapped_column(Text, default="")
    canvas_width: Mapped[int] = mapped_column(Integer, default=3840)
    canvas_height: Mapped[int] = mapped_column(Integer, default=2160)
    camera_view: Mapped[dict] = mapped_column(JSON, default=dict)
    surfaces: Mapped[list] = mapped_column(JSON, default=list)
    #: [{"name", "projector_id", "width", "height", "source", "warp", "masks",
    #:   "blend", "color", "enabled", "calibration", "player_ids"}] in order.
    outputs: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class MappingPlayer(Base):
    """A small computer beside a projector, running the output page.

    It introduces itself with a random device secret and shows a pairing
    code; an administrator approves it and assigns it an output. Approval
    creates a dedicated viewer account for it, so removing the player
    revokes its access the same way deactivating any user does.
    """

    __tablename__ = "mapping_players"

    id: Mapped[int] = mapped_column(primary_key=True)
    device_id: Mapped[str] = mapped_column(String(64), unique=True)
    #: SHA-256 of the device secret. The secret is 256 random bits, so a
    #: fast hash is sufficient; it is checked on every poll.
    secret_hash: Mapped[str] = mapped_column(String(64))
    name: Mapped[str] = mapped_column(String(128))
    #: "player" drives a projector; "camera" runs the camera agent.
    kind: Mapped[str] = mapped_column(String(16), default="player", server_default="player")
    code: Mapped[str] = mapped_column(String(8))
    approved: Mapped[bool] = mapped_column(Boolean, default=False)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    output_id: Mapped[int | None] = mapped_column(
        ForeignKey("mapping_outputs.id", ondelete="SET NULL")
    )
    #: Last report from the player: fps, drift, window size, cache state.
    report: Mapped[dict] = mapped_column(JSON, default=dict)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class MappingSceneGroup(Base):
    """A named choice of scene for every projector in a show at once.

    "Halloween night" might be pumpkins on the house and ghosts on the
    garage. Using a group sets those scenes on every cue of its show, so
    every projector follows it; see services/tonight.py.
    """

    __tablename__ = "mapping_scene_groups"
    __table_args__ = (UniqueConstraint("show_id", "name", name="uq_scene_group_name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    show_id: Mapped[int] = mapped_column(ForeignKey("mapping_shows.id", ondelete="CASCADE"),
                                         index=True)
    name: Mapped[str] = mapped_column(String(128))
    position: Mapped[int] = mapped_column(Integer, default=0)
    #: The scene for every projector not listed in ``output_scenes``.
    scene_id: Mapped[int | None] = mapped_column(
        ForeignKey("mapping_scenes.id", ondelete="SET NULL")
    )
    #: {output id: scene id, or None for no scene there}, as on a cue.
    output_scenes: Mapped[dict] = mapped_column(JSON, default=dict, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class MappingPlaylist(Base):
    """Scene groups that take turns through the night, at set times.

    "Halloween night" might be Spooky from 6:45, Pumpkins from 8:00 and
    Quiet from 9:30, each fading in over a few seconds. A show time (the
    weekly one or a calendar entry) plays a playlist instead of a single
    group; see services/playlists.py.
    """

    __tablename__ = "mapping_playlists"
    __table_args__ = (UniqueConstraint("show_id", "name", name="uq_playlist_name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    show_id: Mapped[int] = mapped_column(ForeignKey("mapping_shows.id", ondelete="CASCADE"),
                                         index=True)
    name: Mapped[str] = mapped_column(String(128))
    position: Mapped[int] = mapped_column(Integer, default=0)
    #: [{"at": "HH:MM", "group_id": 3, "fade_seconds": 5}], in the night's order.
    steps: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class ShowPlan(Base):
    """Tonight's show: which show and scene group, and when it runs.

    One row. The scheduler in services/tonight.py starts the show at
    ``start_at`` and stops it at ``end_at`` (local times, "HH:MM") on the
    weekdays in ``days``; an end before the start means after midnight.
    """

    __tablename__ = "show_plan"

    id: Mapped[int] = mapped_column(primary_key=True)
    show_id: Mapped[int | None] = mapped_column(
        ForeignKey("mapping_shows.id", ondelete="SET NULL")
    )
    group_id: Mapped[int | None] = mapped_column(
        ForeignKey("mapping_scene_groups.id", ondelete="SET NULL")
    )
    #: A playlist plays instead of the group when set.
    playlist_id: Mapped[int | None] = mapped_column(
        ForeignKey("mapping_playlists.id", ondelete="SET NULL")
    )
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    start_at: Mapped[str | None] = mapped_column(String(5))
    end_at: Mapped[str | None] = mapped_column(String(5))
    #: Weekdays it runs, Monday 0 to Sunday 6.
    days: Mapped[list] = mapped_column(JSON, default=lambda: list(range(7)))
    #: Turn the show's projectors on at the start and off at the end.
    power: Mapped[bool] = mapped_column(Boolean, default=True)
    #: The night (local date of the start, YYYY-MM-DD) last started and ended.
    last_start_date: Mapped[str | None] = mapped_column(String(10))
    last_end_date: Mapped[str | None] = mapped_column(String(10))
    #: Which show time last started and ended: the night and where it came
    #: from, "2026-10-31:weekly" or "2026-10-31:entry7" (a calendar entry).
    last_start_key: Mapped[str | None] = mapped_column(String(64))
    last_end_key: Mapped[str | None] = mapped_column(String(64))
    #: What happened the last time it started or stopped, in plain words.
    last_message: Mapped[str] = mapped_column(Text, default="", server_default="")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class ShowCalendarEntry(Base):
    """A show planned on the calendar, or a night with no show.

    One date (``start_date`` = ``end_date``), a run of dates, or a repeat
    with no end (``end_date`` empty), on the weekdays in ``days``. On a
    night the calendar has something for, the calendar replaces the
    weekly show time in ``ShowPlan``. See services/show_calendar.py.
    """

    __tablename__ = "show_calendar"

    id: Mapped[int] = mapped_column(primary_key=True)
    #: "show" plays the show; "off" means no show those nights.
    kind: Mapped[str] = mapped_column(String(8), default="show")
    title: Mapped[str] = mapped_column(String(128), default="", server_default="")
    show_id: Mapped[int | None] = mapped_column(
        ForeignKey("mapping_shows.id", ondelete="CASCADE"), index=True
    )
    group_id: Mapped[int | None] = mapped_column(
        ForeignKey("mapping_scene_groups.id", ondelete="SET NULL")
    )
    #: A playlist plays instead of the group when set.
    playlist_id: Mapped[int | None] = mapped_column(
        ForeignKey("mapping_playlists.id", ondelete="SET NULL")
    )
    #: Local dates, "YYYY-MM-DD". No end date means it keeps repeating.
    start_date: Mapped[str] = mapped_column(String(10))
    end_date: Mapped[str | None] = mapped_column(String(10))
    #: Weekdays it runs, Monday 0 to Sunday 6.
    days: Mapped[list] = mapped_column(JSON, default=lambda: list(range(7)))
    #: Local times, "HH:MM"; an end before the start means after midnight.
    start_at: Mapped[str | None] = mapped_column(String(5))
    end_at: Mapped[str | None] = mapped_column(String(5))
    #: Turn the show's projectors on at the start and off at the end.
    power: Mapped[bool] = mapped_column(Boolean, default=True)
    note: Mapped[str] = mapped_column(Text, default="", server_default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class Heater(Base):
    """A heater in a projector's box, switched by a smart plug.

    The temperature inside the box decides (a USB sensor on the mini PC
    beside it, else the projector's own intake air); the weather outside is
    only used when there is no inside reading. See services/heater.py.
    Temperatures are stored in degrees Celsius, like everything else.
    """

    __tablename__ = "heaters"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128), unique=True)
    #: "shelly", "tasmota" or "home_assistant".
    plug_kind: Mapped[str] = mapped_column(String(16), default="shelly")
    #: The plug's address (Shelly, Tasmota) or Home Assistant's address.
    plug_address: Mapped[str] = mapped_column(String(255))
    #: Home Assistant's entity (switch.heater); unused for the others.
    plug_entity: Mapped[str | None] = mapped_column(String(255))
    #: The plug's password, or Home Assistant's access token; encrypted.
    plug_secret_enc: Mapped[str | None] = mapped_column(Text)
    #: "auto" follows the temperature; "on" is on by hand until ``hold_until``;
    #: "off" stays off until set back to automatic.
    mode: Mapped[str] = mapped_column(String(8), default="auto")
    hold_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    #: Where the inside temperature comes from: a mini PC's USB sensor, the
    #: projector's intake air, or both (the sensor first).
    sensor_player_id: Mapped[int | None] = mapped_column(
        ForeignKey("mapping_players.id", ondelete="SET NULL")
    )
    projector_id: Mapped[int | None] = mapped_column(
        ForeignKey("projectors.id", ondelete="SET NULL")
    )
    on_below_c: Mapped[float] = mapped_column(Float, default=4.5)
    off_above_c: Mapped[float] = mapped_column(Float, default=10.0)
    #: Off whatever else is asked, while the inside is this warm.
    max_inside_c: Mapped[float] = mapped_column(Float, default=27.0)
    #: Only used without an inside reading.
    outside_on_below_c: Mapped[float] = mapped_column(Float, default=0.0)
    outside_off_above_c: Mapped[float] = mapped_column(Float, default=2.0)
    #: Longest run at a time; then it rests for the rest of the hour.
    max_minutes_per_hour: Mapped[int] = mapped_column(Integer, default=30)
    #: Never on while its projector is on (or warming up or cooling down).
    interlock: Mapped[bool] = mapped_column(Boolean, default=True)
    #: Warm the box up this long before the show starts when it is cold; 0 is never.
    warmup_minutes: Mapped[int] = mapped_column(Integer, default=30)
    #: What the plug last said: True on, False off, None not known.
    is_on: Mapped[bool | None] = mapped_column(Boolean)
    on_since: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rest_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_switched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    #: Why it is on or off right now, in plain words.
    reason: Mapped[str] = mapped_column(Text, default="", server_default="")
    #: Why the plug could not be reached, or None when it answers.
    plug_error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class HeaterReading(Base):
    """One minute of a heater's history: inside, outside, and on or off."""

    __tablename__ = "heater_readings"
    __table_args__ = (Index("ix_heater_readings_lookup", "heater_id", "recorded_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    heater_id: Mapped[int] = mapped_column(ForeignKey("heaters.id", ondelete="CASCADE"))
    inside_c: Mapped[float | None] = mapped_column(Float)
    #: "sensor" or "projector".
    inside_source: Mapped[str | None] = mapped_column(String(16))
    outside_c: Mapped[float | None] = mapped_column(Float)
    is_on: Mapped[bool | None] = mapped_column(Boolean)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class WeatherPlace(Base):
    """Where the house is, for the outside temperature. One row."""

    __tablename__ = "weather_place"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )
