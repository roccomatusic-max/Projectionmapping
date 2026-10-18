# Deployment

Target: a Linux host (bare metal, VM or LXC) in your rack, running Docker.
Resource needs are small — 2 vCPU and 2 GB RAM comfortably handles 25
projectors.

---

## 1. Install

```bash
git clone <your-repo-url> projector-control
cd projector-control
cp .env.example .env
```

Generate the two required secrets and put them in `.env`:

```bash
python3 -c "import secrets; print('SECRET_KEY=' + secrets.token_urlsafe(48))"
python3 -c "import secrets; print('POSTGRES_PASSWORD=' + secrets.token_urlsafe(24))"
```

> **Back up `SECRET_KEY` with your database.** It signs sessions *and*
> derives the key that encrypts stored projector passwords. Lose it and you
> re-enter every projector credential; rotate it and the same applies.

Set the interface the UI listens on. `127.0.0.1` (the default) means the host
only:

```bash
BIND_ADDRESS=192.168.10.5   # your server's LAN address
```

Set the time zone, or every schedule will be read in UTC:

```bash
TZ=Europe/London
SCHEDULE_TIMEZONE=Europe/London
```

Start it:

```bash
docker compose up -d --build
docker compose logs -f api
```

On first start the log prints the generated administrator password once, in a
box. Sign in at `http://<BIND_ADDRESS>:8000`, then change it under Settings.

```bash
docker compose logs api | grep -A4 "initial administrator"
```

### Running without Docker

```bash
cd backend
python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp ../.env.example .env        # set SECRET_KEY; DATABASE_URL may stay SQLite
.venv/bin/alembic upgrade head
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
```

SQLite is fine for development and for a single-projector install. Use
PostgreSQL once you are running shows off it: the retention jobs and
concurrent telemetry writes are what SQLite handles least well.

---

## 2. Network layout

```
        ┌──────────────────────── Home LAN (192.168.1.0/24) ─────────┐
        │                                                            │
        │   Your laptop / tablet          Server (rack)              │
        │        │                          │  eth0 192.168.1.5      │
        │        └────── https/VPN ─────────┤                        │
        │                                   │  eth1 192.168.20.1     │
        └───────────────────────────────────┼────────────────────────┘
                                            │
            ┌────────── Projector VLAN (192.168.20.0/24) ───────┐
            │   PT-DZ13K .21     PT-DZ13K .22    Enclosure .30   │
            │   tcp/1024 tcp/4352                                │
            └────────────────────────────────────────────────────┘
```

**Put the projectors on their own VLAN or subnet.** Projector control
protocols have no transport security: the Panasonic LAN protocol authenticates
with an MD5 digest but everything after it is plaintext, and PJLink is the
same. Anyone who can reach port 1024 can drive your projectors. The server is
the only device that needs to route to that network.

Recommended per-projector setup, from the projector's own network menu:

| Setting | Value |
|---|---|
| DHCP | Off — use a static address |
| IP address | e.g. 192.168.20.21 |
| Subnet mask | 255.255.255.0 |
| Default gateway | 192.168.20.1 (your server's VLAN interface) |
| Web control | On |
| Administrator password | Set one. Leave none only on a fully isolated VLAN. |
| Command port | 1024 (default) |
| PJLink | Enable if you want `%1ERST` fan/lamp/temperature reporting |

Record the administrator password you set: it is what you enter when
registering the projector here.

### Firewall

On the server, allow only what is needed:

```bash
# Management UI, from the LAN/VPN only
sudo ufw allow from 192.168.1.0/24 to any port 8000 proto tcp
# Outbound to projectors is permitted by default; nothing inbound is needed
# from the projector VLAN.
sudo ufw deny in on eth1
sudo ufw enable
```

---

## 3. Remote access

**Do not port-forward this application to the internet.** It controls physical
hardware and the projector protocols behind it are unauthenticated at the
transport layer.

Use a VPN. Tailscale is the least work:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

Then set `BIND_ADDRESS` to the server's Tailscale address (`tailscale ip -4`)
or leave it on the LAN address and reach it over the tunnel. Your phone and
laptop join the same tailnet and the UI is available anywhere, with no open
ports.

WireGuard works identically if you prefer to run your own. Either way the
rule is the same: the projector VLAN is reachable only from the server, and
the server is reachable only over the tunnel.

### If you must use a reverse proxy

Terminate TLS at the proxy, keep it on the VPN interface, and pass through
WebSocket upgrades (`/api/ws`) or live updates stop working:

```nginx
location / {
    proxy_pass http://127.0.0.1:8000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

---

## 4. Adding your first projector

1. **Settings → check the driver list.** `panasonic_pt_dz13k` is the one for a
   PT-DZ13K; `pjlink` works with anything speaking PJLink.
2. **Projectors → Add projector.**
   - Host: the projector's static IP
   - Port: 1024
   - Driver: Panasonic PT-DZ13K series
   - Username: `admin1` (the factory web-control administrator)
   - Password: whatever you set on the projector
3. **Open the projector and press "Test connection."** You want
   *"Connected, authenticated and the projector answered a status query."*
   Anything else is diagnosed in [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
4. **Press "Poll now"** to populate status.

Leave **Allow unverified commands** off until you have worked through
[HARDWARE-VALIDATION.md](HARDWARE-VALIDATION.md).

---

## 5. Trying it without hardware

Three simulated projectors, two Panasonic and one PJLink:

```bash
docker compose -f docker-compose.yml -f docker-compose.simulator.yml up -d --build
```

Register them as `sim-left:1024`, `sim-right:1024` (password `panasonic`,
SDI fitted) and `sim-pjlink:4352`. They model warm-up and cool-down timing,
refuse power commands mid-transition, and answer `ER401` for inputs with no
board fitted.

Everything they report is simulated. The UI cannot tell you that — register
them with names that make it obvious, and do not use them to conclude that a
real command works.

---

## 6. Backups

Everything worth keeping is in PostgreSQL plus `SECRET_KEY`. Save this as
`/etc/cron.daily/projector-backup` (the `#!/bin/sh` line must stay first) and
make it runnable with `sudo chmod +x /etc/cron.daily/projector-backup`:

```bash
#!/bin/sh
set -eu
BACKUP_DIR=/var/backups/projector
mkdir -p "$BACKUP_DIR"
cd /opt/projector-control
docker compose exec -T db pg_dump -U projector projector \
    | gzip > "$BACKUP_DIR/projector-$(date +%F).sql.gz"
find "$BACKUP_DIR" -name 'projector-*.sql.gz' -mtime +30 -delete
```

Store a copy of `.env` (or at least `SECRET_KEY`) somewhere separate. A
database restored without the matching `SECRET_KEY` comes back with every
projector password unreadable.

Restore:

```bash
gunzip -c projector-2026-10-17.sql.gz | \
  docker compose exec -T db psql -U projector projector
```

---

## 7. Upgrades

```bash
git pull
docker compose up -d --build
```

Database migrations apply automatically when the API starts (`AUTO_MIGRATE`,
on by default), so a fresh database is created through Alembic and stamped,
and an existing one is brought forward. A database created by an early build
that predates migrations (tables present, no `alembic_version`) is detected,
stamped at the revision it matches, and then upgraded — it does not need a
manual `alembic stamp`. Take a backup first regardless.

If you would rather control schema changes by hand — for instance you upgrade
during a show window and want to stage the migration first — set
`AUTO_MIGRATE=false` and run:

```bash
docker compose exec api alembic upgrade head
```

---

## 8. Health and monitoring

`GET /api/health` is unauthenticated and suitable for an external monitor.

It stays `200` with `"status": "degraded"` when the database is unreachable,
rather than failing. That is deliberate: a database outage must not cause an
orchestrator to restart the API and interrupt projectors mid-command. Alert on
the `status` field, not on the HTTP code.

```bash
curl -s http://localhost:8000/api/health | jq
```

`GET /api/system/info` (authenticated) shows per-device socket state and queue
depth — the first place to look when a projector feels unresponsive.

Every push to GitHub runs the CI workflow in `.github/workflows/ci.yml`: the
backend tests and lint, the frontend typecheck and build, a Docker image build
from `deploy/Dockerfile`, and a smoke test that starts the image and signs in.
A green check on the commit you are about to deploy is the cheapest
pre-flight there is.
