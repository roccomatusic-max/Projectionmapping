# Troubleshooting

Start at the Projector detail page. The **Recent commands** table shows the
exact bytes sent and the projector's exact reply — that is usually the whole
diagnosis.

---

## Reading an outcome

The platform never reports a bare "failed". Each outcome means something
different and needs a different response.

| Outcome | What happened | What to do |
|---|---|---|
| `confirmed` | Acknowledged, and a follow-up query confirmed the new state | Nothing |
| `accepted` | Acknowledged; verification still running | Wait; it becomes confirmed or raises an alert |
| `ok` | A query returned a value | Nothing |
| `timeout` | **No reply. The projector may or may not have acted.** | Do not re-send a power command. Poll and see. |
| `rejected` | The projector understood and refused it | Wrong parameter, or wrong mode. Check the raw reply. |
| `busy` | Not acceptable right now (`ERR3`, `ER403`) | Usually a transition in progress. Retry shortly. |
| `unsupported` | **Not sent.** Model lacks it, or it is gated | See "Why is a control missing" below |
| `auth_failed` | Credentials rejected (`ERRA`), or the projector asks for a password and none is saved | See "The projector is in protect mode" below |
| `connection_error` | Could not reach the projector | Network, IP, or port |
| `device_fault` | The projector reported an internal fault | Check the projector's own status display |
| `parse_error` | Reply arrived but was not understood | Report it — include the raw response |

---

## Connection problems

### "The projector is in protect mode and asks for a password"

The projector is reachable; its network control password is on and none is
saved for it here. Panasonic projectors use their web login: press **Edit** on
the projector, set **Control username** (usually `admin1`) and **Control
password** (the password for the projector's web page; `panasonic` on older
models, chosen on first web login on newer ones), save, then **Test
connection**. Alternatively turn the protection off on the projector: NETWORK →
NETWORK SECURITY → COMMAND PROTECT → DISABLE (menu names vary a little by
model). For a PJLink projector, enter its PJLink password as Control password.

### "No TCP connection to host:port"

Work outward from the network:

```bash
ping -c3 192.168.20.21                  # is it on the network?
nc -vz 192.168.20.21 1024               # is the control port open?
docker compose exec api ping -c3 192.168.20.21   # can the *container* reach it?
```

That last one catches the most common cause: the host routes to the projector
VLAN but the container does not. If ping works from the host and not from the
container, the container needs a route to that network — on a dedicated
projector VLAN, `network_mode: host` on the api service is the simplest fix.

Other causes, in rough order of likelihood:

- **Network control is disabled** in the projector's menu.
- **Another controller holds the session.** Some Panasonic firmware accepts
  only one control connection. Close any Crestron/AMX/TouchDesigner session,
  and close the projector's own web UI in your browser.
- **Wrong port.** 1024 is the Panasonic LAN protocol; 4352 is PJLink. Using
  one driver against the other's port fails at the greeting.
- **The projector is in a deep standby mode** with the network interface
  powered down. Check "Standby mode" / "Network standby" in its menu — it
  must be set to the mode that keeps networking alive, or the projector
  simply is not reachable when off, which makes remote power-on impossible.

### "Authentication failed (ERRA)"

- The username is the **web-control administrator**, factory default
  `admin1`, not a user you created here.
- Confirm protect mode is actually on:
  ```bash
  nc 192.168.20.21 1024
  ```
  `NTCONTROL 0` means no password is set — clear the password field here.
  `NTCONTROL 1 <hex>` means one is set.
- PJLink uses a **different digest scheme** from the Panasonic protocol
  (`md5(seed+password)` vs `md5(user:password:seed)`). A PJLink password in
  a Panasonic driver's password field produces exactly this error.

### "accepted the connection but did not answer"

TCP connects, the greeting arrives, and then the first query gets no reply.
The platform reports this as a connection failure rather than pretending the
projector is connected with a dead socket. Causes, most likely first:

- **Another controller holds the control session.** Some Panasonic firmware
  serves one controller at a time. Close other control software and the
  projector's own web UI.
- **Wrong protocol on the port.** The Panasonic driver against a PJLink port
  (or vice versa) can get this far and no further.
- **A device in between is answering the TCP handshake** — a proxy or a
  firewall doing connection tracking — while the projector itself is off
  the network.

### "went to standby with no power-off command"

An *unexpected shutdown* alert. The projector was on and is now in standby,
and nothing in the command log asked for that in the last ten minutes
(`UNEXPECTED_SHUTDOWN_WINDOW_MINUTES`). Lamp trip, thermal cut-out, power
loss, or someone pressed the button on the projector. Check the projector's
own indicators before powering it back on.

### "was scheduled for … but the server was not running"

A one-shot automation came due while the service was down and is now more
than ten minutes late (`ONCE_GRACE_MINUTES`). Rather than fire a show
start-up at the wrong time it was disabled and an alert raised. Re-enable
it with a new time if you still want it.

### Connection drops repeatedly

Check queue depth under Settings → Technical details → Device connections. If it is climbing, the
projector is answering slower than it is being polled. Raise that projector's
poll overrides, or raise `POLL_*` globally.

Some firmware closes idle control sockets. The device worker reconnects
automatically; you will see it in the logs but it should not affect commands.

---

## "Command was acknowledged but the state was not confirmed"

This alert means the projector said *yes* and then did not reach the expected
state within the verification window. It is working as intended — the
platform refuses to call an acknowledgement a success.

Common causes:

- **Warm-up takes longer than the verification window.** Default is 30
  attempts × 2 s = 60 s. A cold PT-DZ13K can exceed that. Raise
  `POWER_VERIFY_ATTEMPTS` in `.env`.
- **The projector genuinely did not act** — e.g. a power-on refused because
  a lamp has failed. Check the projector's front-panel indicators.
- **An interlock.** Some configurations block input changes while REMOTE2 is
  driving input selection; the projector answers `ER402`.

---

## Why is a control missing or greyed out?

The UI shows a reason wherever it hides something. The three cases:

1. **"Gated as inferred_family."** The command is documented for a sibling
   Panasonic model but not confirmed for the DZ13K series, so the platform
   will not send it. Work through
   [HARDWARE-VALIDATION.md](HARDWARE-VALIDATION.md) stage 6, then enable
   *Allow unverified commands* on that projector.

2. **A struck-through input.** The projector answered `ER401` for it — the
   input board is not fitted on that unit. The platform recorded it and
   stopped asking. Fit the board and restart the API (or edit and re-save the
   projector) to re-probe.

3. **"Not supported by this model."** There is no such command. Lens memory
   is the main one: no lens-memory command could be confirmed for the
   PT-DZ13K, so the platform does not pretend to offer it.

---

## Telemetry shows "—" or "n/a"

These mean different things and both are deliberate:

- **`—`** — the query exists but the last read did not produce a value.
  Usually transient; hover for the reason.
- **`n/a`** — the model has no such query, and never will. Hover for the
  explanation.

**Temperature and fan speed show `n/a` on a PT-DZ13K.** No numeric
temperature query could be confirmed for this model over either protocol, and
the platform does not invent one. Two ways to get real numbers:

- Register the projector a second time with the `pjlink` driver. `%1ERST`
  gives fan / lamp / temperature as ok / warning / error — a severity, not a
  reading, but a real one.
- Put a sensor in the enclosure and POST readings to
  `/api/enclosures/{id}/readings`.

**Lamp reading shows "unparsed reply".** The projector's `Q$L` or `Q$S`
response format differs from what the parser expects. The raw value is in the
tooltip; see HARDWARE-VALIDATION.md stage 2 for the two-line fix.

---

## Projector shows as stale

"Stale" means no successful poll inside the staleness window
(`POLL_OPERATIONAL × STALENESS_MULTIPLIER`, 45 s by default). The platform
deliberately will not show a remembered state as live.

If a projector flips between online and stale:

- The poll interval may be too aggressive for the device. Raise that
  projector's `poll_overrides`.
- Check queue depth — a backed-up queue delays polls past the window.
- Check for packet loss on the projector VLAN.

---

## Web UI problems

### Live updates stop; values freeze

The dashboard header says "Live link down — falling back to periodic
refresh". Data is still updating, just every 15 s instead of instantly.

Almost always a reverse proxy not passing WebSocket upgrades. See the nginx
block in [DEPLOYMENT.md](DEPLOYMENT.md#if-you-must-use-a-reverse-proxy).

### Signed out unexpectedly

Tokens last 12 hours by default (`ACCESS_TOKEN_MINUTES`). Restarting the API
with a *changed* `SECRET_KEY` invalidates every session — and also makes
stored projector passwords unreadable, so if this happens unexpectedly, check
that `.env` is actually being loaded.

---

## Database and startup

### "set SECRET_KEY in .env"

Compose refuses to start without it. Generate one:
```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```

### Health endpoint says "degraded"

The API is up, the database is not. The API deliberately stays running: a
database outage must not restart the process and disturb projectors.
Commands still work; history and configuration changes do not.

```bash
docker compose logs db
docker compose restart db
```

### Every projector password is suddenly wrong

`SECRET_KEY` changed. Device passwords are encrypted with a key derived from
it. Restore the original `SECRET_KEY` from backup, or re-enter each
projector's password.

---

## Collecting information for a bug report

```bash
docker compose logs --tail 200 api > api.log
curl -s http://localhost:8000/api/health | jq
# Authenticated:
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/system/info | jq
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/projectors/1/commands?limit=20" | jq
```

The command history is the important one: it contains the exact frames sent
and the projector's exact replies. Redact nothing from the raw responses —
they contain no credentials.
