# Integrations

Two ways in: the REST API (works everywhere) and MQTT (optional, nicer in
Home Assistant).

---

## REST API

Interactive docs at `/api/docs`; the OpenAPI schema at
`/api/openapi.json`.

### Authentication

```bash
TOKEN=$(curl -s -X POST http://projector.local:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"automation","password":"..."}' | jq -r .access_token)

curl -s -H "Authorization: Bearer $TOKEN" http://projector.local:8000/api/projectors
```

Create a dedicated user for integrations with the **operator** role — it can
send commands but cannot change configuration or manage users.

### Disruptive commands need `"confirm": true`

Power, shutter, input and scene activation all require it. Without it the API
returns `428 Precondition Required` naming what it was about to do. This is
intentional: it stops a stray script or a mistyped curl from blacking out a
show.

```bash
curl -X POST http://projector.local:8000/api/projectors/1/power \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"state":"on","confirm":true}'
```

### Reading results

Group commands return one result per projector:

```json
{
  "dispatched_at": "2026-10-17T20:14:02Z",
  "capability": "power.set",
  "results": [
    {"projector_id": 1, "name": "House Left",  "outcome": "accepted", "latency_ms": 812},
    {"projector_id": 3, "name": "House Right", "outcome": "timeout",
     "error": "no response in 5000ms. Not retried automatically: this command is
               not safe to repeat when the device state is unknown."}
  ],
  "summary": {"total": 2, "succeeded": 1, "failed": 1}
}
```

Treat `accepted` as "the projector took the command", not "the projector did
it". Poll `/api/projectors/{id}/status` to see the actual state.

### Rate limits

60 commands/minute and 120 config writes/minute, per user. Exceeding either
returns `429` with a `Retry-After` header.

---

## Home Assistant

### Option A — REST (no broker)

`/api/integration/homeassistant/discovery` returns every projector with its
current state, the attributes that are actually available, and the exact
command to call for each action. Only real telemetry appears: a projector
whose model has no temperature query has no temperature attribute, rather
than one reading zero.

```yaml
# configuration.yaml
rest:
  - resource: http://projector.local:8000/api/integration/homeassistant/discovery
    headers:
      Authorization: !secret projector_token
    scan_interval: 30
    sensor:
      - name: "Projectors online"
        value_template: >-
          {{ value_json.projectors | selectattr('available') | list | count }}
      - name: "Projector open alerts"
        value_template: "{{ value_json.alerts.open }}"
      - name: "House Left power"
        value_template: >-
          {{ value_json.projectors
             | selectattr('name', 'eq', 'House Left')
             | map(attribute='state') | first | default('unknown') }}

rest_command:
  house_left_on:
    url: http://projector.local:8000/api/projectors/1/power
    method: POST
    headers:
      Authorization: !secret projector_token
      Content-Type: application/json
    payload: '{"state":"on","confirm":true}'

  projection_startup:
    url: http://projector.local:8000/api/scenes/1/activate
    method: POST
    headers:
      Authorization: !secret projector_token
      Content-Type: application/json
    payload: '{"capability":"activate","confirm":true}'
```

```yaml
# secrets.yaml
projector_token: "Bearer eyJhbGciOi..."
```

A scene can also be activated by name, which survives database rebuilds
better than an id:

```
POST /api/integration/scenes/Pre-Show/activate
```

### Option B — MQTT with auto-discovery

Set in `.env`:

```bash
WITH_MQTT=true          # installs the MQTT client in the image
MQTT_ENABLED=true
MQTT_HOST=192.168.1.10
MQTT_USERNAME=projector
MQTT_PASSWORD=...
MQTT_PREFIX=projector
HOMEASSISTANT_DISCOVERY=true
```

Rebuild: `docker compose up -d --build`.

Entities appear in Home Assistant automatically. Topics published:

| Topic | Payload |
|---|---|
| `projector/<name>/state` | full JSON state |
| `projector/<name>/available` | `online` / `offline` |
| `projector/<name>/power` | `on` / `off` / `warming` / `cooling` |
| `projector/<name>/shutter` | `open` / `closed` |
| `projector/alerts` | alert JSON as raised |
| `projector/commands` | command results as they complete |

Availability is wired to the `available` topic, so a projector that stops
responding shows as unavailable in Home Assistant rather than keeping its
last state.

> MQTT publishing is one-way today: the platform publishes state, and the
> discovery configs advertise command topics for a future subscriber. Use
> `rest_command` for actions until command subscription lands — the REST path
> is also the one that enforces confirmation and writes an audit entry.

---

## Enclosure sensors

Any device that can make an HTTP request can report:

```bash
curl -X POST http://projector.local:8000/api/enclosures/1/readings \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"metric":"internal_temp_c","value":34.2}'
```

Recognised metrics: `internal_temp_c`, `external_temp_c`, `humidity_pct`,
`dew_point_c`, `leak`, `airflow`, `fan_ok`, `power_w`, `power_ok`. Booleans
are stored as 0/1 so one history table covers a leak sensor and a
thermometer.

From an ESP32 or similar, posting every 30–60 s is plenty. From Home
Assistant, a `rest_command` triggered by a state change works well.

Readings drive alerts (temperature, humidity, leak, fan failure) and the
`check_enclosure` automation step, which refuses to start a show into known
bad conditions — and, with `require_fresh`, refuses to start when sensor data
is stale rather than assuming stale means safe.

**None of this replaces hardware thermal protection.** See
[SAFETY.md](SAFETY.md).

---

## Webhooks

Alert rules can POST to an arbitrary URL:

```json
{
  "name": "Critical to Slack",
  "kind": "offline",
  "severity": "critical",
  "channels": ["dashboard", "webhook"],
  "webhook_url": "https://hooks.slack.com/services/...",
  "renotify_minutes": 30
}
```

Payload:

```json
{
  "severity": "critical",
  "message": "House Left stopped responding while powered on",
  "details": {"projector_id": 1, "last_error": "..."},
  "source": "Projector Control"
}
```

An unresolved condition notifies once, then at most once per
`renotify_minutes`. Acknowledging an alert silences repeats without marking
it resolved — the condition is still live until the monitor observes it
clear.

---

## WebSocket

`/api/ws?token=<jwt>` streams everything live. Message types:
`projector_state`, `command_result`, `command_verified`,
`command_unverified`, `projector_offline`, `projector_online`, `alert`,
`alert_resolved`, `automation_started`, `automation_step`,
`automation_finished`, `scene_activated`.

```python
import asyncio, json, websockets

async def watch(token: str):
    async with websockets.connect(f"ws://projector.local:8000/api/ws?token={token}") as ws:
        async for raw in ws:
            message = json.loads(raw)
            if message["type"] == "projector_state":
                print(message["payload"]["name"], message["payload"]["power"])

asyncio.run(watch(TOKEN))
```
