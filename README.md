# Projector Control

Self-hosted management for a fleet of networked projectors, built around the
**Panasonic PT-DZ13K** and **PT-DZ770** families (DZ13K/DS12K/DW11K/DZ10K and
DZ770/DW740/DX810/DX810ULK) plus any **PJLink** projector. Runs locally in Docker;
no cloud services.

Built for outdoor architectural projection mapping, where the projectors are
expensive, hard to reach, and the show starts whether or not they came up.

---

## What it does

- **Dashboard** — live fleet state: online, powered, standby, warnings, faults
- **Per-projector control** — power, shutter, inputs, lens, on-screen remote,
  full technical status
- **Projectors → Control several** — select any set of projectors or a group and command
  them together, with a separate result for each one
- **Projectors → Groups** — named sets ("House Projection Mapping", "Front of House") with
  their own control surface
- **Monitoring** — four-tier polling, lamp-hour tracking, alerts with
  deduplication, email/webhook/MQTT notification
- **Automation** — a visual builder for scheduled sequences (manual, once,
  daily, weekly or cron). Steps are drawn from the targeted projectors'
  capability manifests, so only functions those units support are offered;
  a server-side Check validates every step and previews the next run times
  before a sequence can be saved. Wait steps poll until projectors actually
  reach the expected state. Scenes for one-shot actions.
- **History** — telemetry charts, full command audit log, maintenance records
  with CSV export
- **Show Remote** — a phone remote for the Home Screen: GO, cues, blackout,
  projector power, a Tonight tab (tonight's scene group, show time and
  nights, Start now / Stop) and a Calendar tab, from anywhere through
  Tailscale (Settings → Phone)
- **Show calendar** — plan shows ahead on a month, week or list: one night,
  several nights or every week, each with a scene group and start and end
  times, or nights with no show; the show starts and stops by itself
  ([MAPPING.md §6c](docs/MAPPING.md))
- **Emergency stop** — one press-and-hold button on every page and on the
  phone remote: stops the show, blacks out every mini PC, stops automations
  and turns every projector off, reporting each projector on its own
  ([SAFETY.md](docs/SAFETY.md))
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

## Two ways to run it

| | Server (Docker) | Desktop app |
|---|---|---|
| Runs on | a machine in the rack, 24/7 | your laptop or PC |
| Database | PostgreSQL | SQLite file in your profile |
| Monitoring and schedules | always | **only while the app is open** |
| Set-up | `.env` + `docker compose up` | run the built executable |
| Guide | below, and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | [docs/DESKTOP.md](docs/DESKTOP.md) |

Same code, same schema; you can move between them.

On a Mac server, the [Mac app](docs/MAC-SERVER.md) is the easiest of all:
download it, open it, and it starts at boot, restarts itself and updates
from GitHub. On a Windows server, the [Windows server](docs/WINDOWS-SERVER.md)
does exactly the same from one PowerShell line. Both are built from every
change with the same version number ([docs/SERVER-PARITY.md](docs/SERVER-PARITY.md)).

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
cd ../frontend && npm install && npm run dev   # proxies /api to :8000
```

### Tests

```bash
cd backend
.venv/bin/python -m pytest -q
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
desktop/              PyInstaller spec and build scripts for the desktop app
desktop/windows/      Windows server: install line, zip, and its end-to-end check
camera-agent/         Camera program: projector calibration and people tracking
minipc/               Mini PC app: one Windows install per projector (output, camera, auto-start)
.github/workflows/    CI: tests, lint, typecheck, image build and smoke test
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
| [HOME-ASSISTANT.md](docs/HOME-ASSISTANT.md) | Home Assistant: one line to install, projectors and the show as devices |
| [INTEGRATIONS.md](docs/INTEGRATIONS.md) | REST, WebSocket, MQTT, Home Assistant, enclosure sensors, service tokens |
| [DESKTOP.md](docs/DESKTOP.md) | Running it as a desktop application instead of a server |
| [MAC-SERVER.md](docs/MAC-SERVER.md) | The Mac app: download, open, and it runs as an always-on server that updates itself |
| [WINDOWS-SERVER.md](docs/WINDOWS-SERVER.md) | The Windows server: one PowerShell line, and it runs as an always-on Windows service that updates itself |
| [SERVER-PARITY.md](docs/SERVER-PARITY.md) | The Mac and Windows servers side by side, and the rule that keeps them the same |
| [MAPPING.md](docs/MAPPING.md) | Mapping media: shows, warping, blending, players beside the projectors, camera calibration and people tracking |

---

## Scope

This platform manages **projector hardware**. Projection-mapping content,
warping, blending and playback live in the separate **Mapping** module of the
same application, with its own players beside the projectors; see
[docs/MAPPING.md](docs/MAPPING.md). The projector side never depends on it.
Projector commands are concurrent dispatch, not frame-accurate
synchronisation, and are labelled as such throughout; media playback keeps
its outputs together by a shared server clock, as MAPPING.md explains.

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
| 6 | Hardening: tests, auth, deployment, recovery | Implemented; CI builds the image; not yet load-tested at 25 devices |
| — | Mac server app ([docs/MAC-SERVER.md](docs/MAC-SERVER.md)) | **Tested on a real Mac server** (2026-10-17): download, install, start and dashboard work. Restart-on-boot and update-from-GitHub not yet exercised |
| — | Windows server ([docs/WINDOWS-SERVER.md](docs/WINDOWS-SERVER.md)) | Install, crash restart, network access, discovery, password reset, update, rollback and uninstall checked on fresh Windows Server 2022 and 2025 machines for every change; not yet on a real rack machine, Windows 10/11, or after a reboot |

Known gaps, stated plainly:

- No command has run against a physical PT-DZ13K.
- `Q$L`, `Q$S` and `QLS` response layouts are parsed defensively because
  their exact formats could not be confirmed offline.
- RS-232 is designed for (via a network-to-serial gateway) but not
  implemented; Ethernet control came first.
- Commands over MQTT are off by default (`MQTT_ALLOW_COMMANDS`); anyone who
  can publish to the broker could otherwise drive the projectors.
- Lens memory is not implemented because no such command could be confirmed
  for this model.
