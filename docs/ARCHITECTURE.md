# System Architecture

## 1. Design principles

This platform drives expensive hardware mounted in places that are hard to
reach. Four principles follow from that, and they outrank feature count:

1. **Never claim knowledge the device did not give us.** Every telemetry field
   is a tri-state: a value, `unsupported` (the model has no such query), or
   `unavailable` (the query exists but the last attempt failed). There is no
   fourth state where the UI shows a plausible-looking number it made up.
2. **Distinguish the four failure modes.** A command that timed out, a command
   the projector rejected, a command this model does not support, and a command
   that succeeded are four different outcomes with four different recoveries.
   Collapsing them into a boolean is how you end up power-cycling a projector
   that was merely busy.
3. **Liveness is observed, never remembered.** A projector is `online` only if
   a poll succeeded inside the staleness window. A cached "it was online a
   minute ago" is rendered as `stale`, not `online`.
4. **The software is not a safety device.** Thermal protection and interlocks
   belong in hardware. This platform monitors and alerts; it does not stand
   between a projector and its over-temperature cutout.

## 2. Component map

```
                           Browser (React SPA)
                        REST  │          │  WebSocket
            ┌──────────────── ▼ ─────────▼──────────────────┐
            │                FastAPI                        │
            │  routes · auth/RBAC · validation · audit      │
            │  rate limiting · OpenAPI                      │
            └───┬───────────┬──────────┬──────────┬─────────┘
                │           │          │          │
       ┌────────▼──┐  ┌─────▼─────┐ ┌──▼──────┐ ┌─▼────────────┐
       │  Device   │  │ Monitoring│ │Automation│ │  Alerting    │
       │  Manager  │◄─┤  Service  │ │Scheduler │ │   Service    │
       │           │  └─────┬─────┘ └──┬───────┘ └─┬────────────┘
       │ per-device│        │          │           │
       │ cmd queue │        └──────────┴───────────┤
       │ + conn    │                               │
       │ lifecycle │        ┌──────────────────────▼─────┐
       └─────┬─────┘        │  Event Bus (in-process      │
             │              │  pub/sub → WS + alerts)     │
       ┌─────▼──────┐       └──────────────┬──────────────┘
       │  Driver    │                      │
       │  Registry  │              ┌───────▼────────┐
       └─────┬──────┘              │   PostgreSQL   │
             │                     │  (SQLite dev)  │
   ┌─────────┼──────────┐          └────────────────┘
   │         │          │
┌──▼───┐ ┌───▼────┐ ┌───▼─────┐
│PJLink│ │Panasonic│ │ future  │
│driver│ │NTCONTROL│ │ vendors │
└──┬───┘ └───┬────┘ └─────────┘
   │         │
   └────┬────┘
        ▼
   Projector LAN (isolated VLAN)
```

The nine responsibilities from the brief map onto this as: web frontend (SPA),
backend API (FastAPI routes), projector communication service (Device Manager),
driver library (`app/drivers`), monitoring service, automation scheduler,
alerting service, database, integration service (`app/api/routes/integration.py`
+ MQTT publisher). They run in two containers today — API+workers, and
Postgres — but each is a separate module with no cross-imports except through
the event bus and the device manager, so splitting them into their own
processes later is a deployment change, not a rewrite.

### Why this shape rather than the alternatives

- **One process, many asyncio tasks** instead of Celery/RQ workers. Projector
  control is I/O-bound, latency-sensitive, and *stateful per device* — a
  projector needs one owner holding one socket with one serialized queue. A
  distributed worker pool actively fights that: two workers can pick up two
  commands for the same projector and interleave them. If this ever needs to
  scale past one host, the correct split is by *device shard*, not by task
  queue, and the device manager is written so a shard key is the only thing
  that would change.
- **PostgreSQL over a time-series database.** Telemetry volume at 25
  projectors polled every 15s is ~140k rows/day — trivial for Postgres with a
  BRIN index on timestamp, and it keeps device config, history and automation
  in one transactional store with one backup. TimescaleDB is a drop-in upgrade
  (it is a Postgres extension) if retention ever becomes the problem.
- **WebSocket over SSE.** The brief allows either. WebSocket is chosen because
  the control center needs client→server traffic (subscription scoping) and
  because a single socket carrying both telemetry and command-result streams
  keeps ordering guarantees that two SSE channels would not.

## 3. The command path

A power-on from the UI traverses:

```
POST /api/projectors/{id}/power {state: "on"}
  → RBAC check (operator+) → audit log row written *before* dispatch
  → DeviceManager.submit(device_id, Command)
      → per-device asyncio.Queue  (serialized; nothing else talks to this PJ)
      → worker: ensure connection (connect + authenticate if needed)
      → capability check   ─── not in manifest ──→ UNSUPPORTED (no socket I/O)
      → inter-command gap enforced (600ms Panasonic / 200ms PJLink)
      → send, await response with timeout
      → parse → CommandResult{outcome, raw, latency_ms}
      → power/shutter/input: schedule a verification poll
  → CommandResult persisted to command_log
  → event bus publish → WebSocket → UI shows per-device outcome
```

The audit row is written before dispatch deliberately: if the process dies
mid-command, the record that someone asked for a power-on survives, and the
unresolved outcome is visible as a dangling command rather than vanishing.

### Retry policy

| Command class | Retry on timeout | Rationale |
|---|---|---|
| Queries (`QPW`, `%1ERST`, …) | yes, 2 attempts | idempotent, no device-side effect |
| Shutter, input | yes, 1 attempt, **only after a confirming query shows the old state** | re-sending is safe once we know it did not land |
| Power on/off | **never** | the brief's rule and the right one: if the final state is uncertain, resolving it is a query's job, not a retry's |
| Lens movement | **never** | cumulative; a duplicate moves twice |

## 4. Data model

```
users              id, username, password_hash, role, created_at, last_login
projectors         id, name, model, manufacturer, location, host, port,
                   driver, protocol, username, password_enc, enabled,
                   poll_interval_overrides, allow_unverified_commands,
                   capabilities_cache, created_at
projector_state    projector_id (PK), online, power_state, shutter_state,
                   active_input, lamp_hours_json, error_status_json,
                   last_seen_at, last_error, consecutive_failures, stale_after
groups             id, name, description, color
group_members      group_id, projector_id, position
command_log        id, projector_id, user_id, source, command, params_json,
                   outcome, raw_response, latency_ms, created_at
telemetry          id, projector_id, metric, value_num, value_text,
                   recorded_at            -- BRIN on recorded_at
events             id, projector_id, severity, kind, message, details_json,
                   created_at
alerts             id, projector_id, rule_id, kind, severity, state,
                   opened_at, acknowledged_at, acknowledged_by, resolved_at,
                   last_notified_at, notify_count
alert_rules        id, name, kind, threshold_json, channels_json, enabled
automations        id, name, trigger_type, schedule_json, steps_json,
                   enabled, last_run_at, last_result
automation_runs    id, automation_id, started_at, finished_at, status,
                   step_results_json
scenes             id, name, target_json, actions_json
maintenance        id, projector_id, kind, performed_at, lamp_index,
                   hours_at_service, notes, performed_by
enclosures         id, name, projector_id, mqtt_prefix, config_json
enclosure_readings id, enclosure_id, metric, value_num, recorded_at
```

`alerts` carries `state` (`open` / `acknowledged` / `resolved`) plus
`last_notified_at` and `notify_count` so the alerting service can implement
"notify once per unresolved condition, then back off" without re-deriving
state from the event stream.

`password_enc` is encrypted at rest with Fernet keyed from `SECRET_KEY` —
these are device passwords the platform must be able to *replay* to the
projector, so they cannot be hashed. They are never returned by the API.

## 5. API contract

Full OpenAPI is served at `/api/docs`. The core surface:

```
POST   /api/auth/login                   → {access_token, role}
GET    /api/auth/me

GET    /api/projectors                   list + live state
POST   /api/projectors                   (admin)
GET    /api/projectors/{id}
PATCH  /api/projectors/{id}              (admin)
DELETE /api/projectors/{id}              (admin)
GET    /api/projectors/{id}/status       live, with per-field availability
GET    /api/projectors/{id}/capabilities driver manifest for this unit
POST   /api/projectors/{id}/power        {state: on|off}            (operator)
POST   /api/projectors/{id}/shutter      {state: open|closed}       (operator)
POST   /api/projectors/{id}/input        {input: "RG1"|...}         (operator)
POST   /api/projectors/{id}/command      {capability, params}       (operator)
POST   /api/projectors/{id}/test         connectivity probe
GET    /api/projectors/{id}/telemetry    ?metric=&from=&to=
GET    /api/projectors/{id}/commands     command history

GET    /api/groups                       POST/PATCH/DELETE (admin)
POST   /api/groups/{id}/commands         {capability, params} → per-device results

GET    /api/events                       ?severity=&projector_id=&since=
GET    /api/alerts                       POST /api/alerts/{id}/acknowledge
GET    /api/automations                  POST /api/automations/{id}/execute
GET    /api/automations/{id}/runs
GET    /api/scenes                       POST /api/scenes/{id}/activate
GET    /api/maintenance                  POST, GET /api/maintenance/export.csv
GET    /api/integration/homeassistant/discovery
WS     /api/ws                           live state + command results
```

Every mutating endpoint writes an audit row. Commands flagged `disruptive` in
the capability manifest require `confirm: true` in the body; the UI supplies it
from a confirmation dialog, and an API client that omits it gets a 428 naming
what it was about to do.

### Group command semantics

`POST /api/groups/{id}/commands` dispatches concurrently and returns a result
*per device*:

```json
{
  "dispatched_at": "2026-10-17T21:14:02Z",
  "results": [
    {"projector_id": 1, "name": "House Left",   "outcome": "confirmed", "latency_ms": 812},
    {"projector_id": 2, "name": "House Centre", "outcome": "confirmed", "latency_ms": 779},
    {"projector_id": 3, "name": "House Right",  "outcome": "timeout",   "error": "no response in 5000ms"}
  ],
  "summary": {"confirmed": 2, "failed": 1, "total": 3}
}
```

This is **concurrent dispatch, not synchronised playback**. Commands leave
within a few milliseconds of each other; when they take effect depends on each
projector's own processing and, for power, on tens of seconds of warm-up. The
API field is named `dispatched_at` rather than `executed_at` for that reason,
and the UI says "dispatched together" rather than "synchronised". Frame-accurate
sync is a property of the media server feeding the projectors, not of this
control path.

## 6. Monitoring tiers

| Tier | Default | What it reads |
|---|---|---|
| Connectivity | 10 s | TCP reachability + `QPW` / `%1POWR ?` |
| Operational | 15 s | power, shutter, active input |
| Diagnostics | 60 s | `%1ERST` error status, lamp on/off |
| Maintenance | 300 s | lamp runtime hours, filter usage |

Tiers are per-device overridable. The scheduler staggers devices inside each
tier so 25 projectors do not get polled in the same 50 ms. Polls go through the
same per-device queue as user commands, so a poll can never interleave with a
power command — and user commands jump the queue ahead of polls by priority.

## 7. Security model

- Roles: `admin` (everything), `operator` (commands, no config), `viewer`
  (read-only). Enforced by a FastAPI dependency, not by hiding UI.
- Passwords: Argon2id. JWT access tokens, short-lived, with a rotating secret.
- Device credentials: Fernet-encrypted at rest, never serialized outward.
- Rate limiting per principal and per device.
- Audit log on every command and every config change.
- **No internet exposure.** Deployment docs specify VPN (Tailscale/WireGuard)
  and an isolated projector VLAN; the compose file binds the API to the LAN
  interface and never publishes port 1024 or 4352 anywhere.

## 8. Phase status

| Phase | Scope | State |
|---|---|---|
| 1 | Driver + real hardware comms | Implemented; simulator-tested, hardware-pending |
| 2 | Registration, monitoring, control UI | Implemented |
| 3 | Groups, bulk commands, per-device feedback | Implemented |
| 4 | Telemetry history, scheduling, alerts, scenes | Implemented |
| 5 | Enclosure/MQTT/Home Assistant | Schema + MQTT publisher + HA discovery; sensor ingest implemented, no hardware-specific drivers |
| 6 | Hardening: tests, auth, deploy, recovery | Implemented; load-testing at 25 devices not yet run |
