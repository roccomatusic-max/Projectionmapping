# Projector Control

Self-hosted management for a fleet of networked projectors, built around the
**Panasonic PT-DZ13K** and any **PJLink** projector. Runs locally in Docker;
no cloud services.

Built for outdoor architectural projection mapping, where the projectors are
expensive, hard to reach, and the show starts whether or not they came up.

---

## What it does

- **Dashboard** — live fleet state: online, powered, standby, warnings, faults
- **Per-projector control** — power, shutter, inputs, lens, on-screen remote,
  full technical status
- **Control Center** — select any set of projectors or a group and command
  them together, with a separate result for each one
- **Groups** — named sets ("House Projection Mapping", "Front of House") with
  their own control surface
- **Monitoring** — four-tier polling, lamp-hour tracking, alerts with
  deduplication, email/webhook/MQTT notification
- **Automation** — scheduled startup and shutdown sequences that wait for
  projectors to actually reach the expected state, plus scenes
- **History** — telemetry charts, full command audit log, maintenance records
  with CSV export
- **Integrations** — documented REST API, WebSocket live feed, MQTT with Home
  Assistant auto-discovery
- **Enclosure monitoring** — temperature, humidity, leak and fan sensors, with
  automation that refuses to start a show into bad conditions

---

## Three things that shape the design

**It never shows you a number the projector did not give it.** Every
telemetry field is a value, `n/a` (the model has no such query), or `—` (the
read failed), each with a reason on hover. A PT-DZ13K reports no numeric
temperature over either protocol, so the UI says so rather than displaying a
plausible 42 °C.

**It distinguishes four kinds of failure.** A command that timed out, one the
projector refused, one the model does not support, and one that succeeded are
four different outcomes needing four different responses. Collapsing them
into a boolean is how a controller ends up power-cycling a projector that was
merely busy. Power commands are never auto-retried after a timeout — the
state is resolved with a query instead.

**It refuses to send commands it is not sure about.** Each command carries
its provenance. Commands documented only for sibling Panasonic models — lens
movement, image adjustments, remote keys — are gated off and refused before
any bytes reach the projector, until you enable them per device. See
[docs/PROTOCOL-RESEARCH.md](docs/PROTOCOL-RESEARCH.md).

---

## Hardware validation status

> **No command has been tested against a physical PT-DZ13K.** This was
> developed and tested against a protocol simulator, which validates the
> controller, not the documentation. Before trusting it with rigged
> equipment, work through
> [docs/HARDWARE-VALIDATION.md](docs/HARDWARE-VALIDATION.md) — it is a
> stage-by-stage procedure with a results table, and it names the two
> response parsers most likely to need adjusting against a real unit.

Commands are tagged:

| Tag | Meaning | Enabled by default |
|---|---|---|
| `standard` | Defined by the PJLink specification | yes |
| `verified_doc` | In a Panasonic document naming the DZ13K series | yes |
| `inferred_family` | Documented for a sibling model only | **no** |
| `hardware_verified` | Confirmed against a real projector by an operator | yes |

---

## Quick start

```bash
cp .env.example .env
python3 -c "import secrets; print(secrets.token_urlsafe(48))"   # → SECRET_KEY
python3 -c "import secrets; print(secrets.token_urlsafe(24))"   # → POSTGRES_PASSWORD
# set BIND_ADDRESS to your server's LAN address

docker compose up -d --build
docker compose logs api | grep -A4 "initial administrator"      # first password
```

Open `http://<BIND_ADDRESS>:8000`, sign in, change the password, add a
projector by IP, and press **Test connection**.

### Without hardware

```bash
docker compose -f docker-compose.yml -f docker-compose.simulator.yml up -d --build
```

Three simulated projectors with realistic warm-up and cool-down timing,
authentication, unfitted input boards and fault injection. Register them as
`sim-left:1024`, `sim-right:1024` and `sim-pjlink:4352`. Everything they
report is simulated.

---

## Development

```bash
# Backend
cd backend
python3.12 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
DATABASE_URL="sqlite+aiosqlite:///./data/dev.db" SECRET_KEY="dev-key-32-characters-minimum-here" \
  .venv/bin/uvicorn app.main:app --reload

# A simulator to talk to
.venv/bin/python -m simulator.panasonic_sim --port 11024 --warmup 5 --cooldown 5

# Frontend
cd frontend && npm install && npm run dev      # proxies /api to :8000
```

### Tests

```bash
cd backend
.venv/bin/python -m pytest -q          # 101 tests
.venv/bin/ruff check app simulator tests
```

Coverage: protocol parsing and framing, both authentication schemes, command
queue serialization and priority, the retry policy, capability gating,
per-parameter retraction, group dispatch with partial failure, RBAC,
confirmation gating, automation steps, and enclosure safety checks.

---

## Project layout

```
backend/
  app/
    drivers/          Driver framework, PJLink, Panasonic NTCONTROL, PT-DZ13K
    services/         Device manager, monitoring, alerts, automation, MQTT
    api/routes/       REST endpoints and WebSocket
    db/               SQLAlchemy models and session management
    core/             Security, event bus
  simulator/          Panasonic and PJLink projector simulators
  tests/              Test suite
  alembic/            Database migrations
frontend/src/
  pages/              Dashboard, Projectors, Detail, Groups, Control Center,
                      Automation, Monitoring, Logs, Settings
  components/         UI primitives and the projector card
  api/                Typed API client
deploy/               Dockerfile (builds SPA + API into one image)
docs/                 Protocol research, architecture, deployment, validation,
                      safety, troubleshooting, integrations
```

---

## Documentation

| Document | What it covers |
|---|---|
| [PROTOCOL-RESEARCH.md](docs/PROTOCOL-RESEARCH.md) | Every command, with provenance and sources |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Components, data flow, schema, API contracts, design trade-offs |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Install, network layout, VPN access, backups, upgrades |
| [HARDWARE-VALIDATION.md](docs/HARDWARE-VALIDATION.md) | Stage-by-stage procedure for validating against a real projector |
| [SAFETY.md](docs/SAFETY.md) | What this software is and is not responsible for |
| [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Reading outcomes, connection problems, missing telemetry |
| [INTEGRATIONS.md](docs/INTEGRATIONS.md) | REST, WebSocket, MQTT, Home Assistant, enclosure sensors |

---

## Scope

This platform manages **projector hardware**. It does not manage projection
mapping content, warping, blending or media playback — those belong to your
media server, and conflating the two makes both worse. Frame-accurate
synchronisation is a property of the media server; what this does is
concurrent command dispatch, which is a different thing and is labelled as
such throughout.

It is also **not a safety device**. Thermal protection and interlocks belong
in hardware that works when this software does not. See
[docs/SAFETY.md](docs/SAFETY.md).

---

## Current status

| Phase | Scope | State |
|---|---|---|
| 1 | Driver and real-hardware communication | Implemented, simulator-tested, **hardware validation pending** |
| 2 | Registration, monitoring, control UI | Implemented |
| 3 | Groups, bulk commands, per-device feedback | Implemented |
| 4 | Telemetry history, scheduling, alerts, scenes | Implemented |
| 5 | Enclosure monitoring, MQTT, Home Assistant | Sensor ingest, alerting and HA discovery implemented; no vendor-specific sensor drivers |
| 6 | Hardening: tests, auth, deployment, recovery | Implemented; not yet load-tested at 25 devices |

Known gaps, stated plainly:

- No command has run against a physical PT-DZ13K.
- `Q$L`, `Q$S` and `QLS` response layouts are parsed defensively because
  their exact formats could not be confirmed offline.
- RS-232 is designed for (via a network-to-serial gateway) but not
  implemented; Ethernet control came first.
- MQTT is publish-only; actions go through REST, which is also where
  confirmation and auditing live.
- Lens memory is not implemented because no such command could be confirmed
  for this model.
