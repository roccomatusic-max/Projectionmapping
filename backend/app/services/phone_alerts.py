"""Alerts on the phone, even when the app is closed.

The phone remote is a Home Screen web app served over plain http on the
home network, and iPhones only allow web push from https sites, so the
push goes through a free service with its own phone app instead:

* **ntfy** (ntfy.sh): free, no account and no key. The server makes up a
  long random channel name; the person types it once into the free ntfy
  app. Anyone who knows the name can read it, so it is long and random.
* **Pushover**: a one-time purchase of the app; the person pastes their
  user key and an application token.

The choice lives in a small file beside the media folder, readable only by
the server's own account, like the AI keys (services/api_keys.py). The
Pushover keys are never sent back to a browser.

What is sent: an alert when it first opens or gets worse (never the hourly
reminders the dashboard keeps), "all clear" when it ends, and a note when
the show starts and when it stops.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import os
import secrets
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx

from app import config

log = logging.getLogger(__name__)

FILENAME = "phone-alerts.json"
NTFY_SERVER = "https://ntfy.sh"
PUSHOVER_URL = "https://api.pushover.net/1/messages.json"
#: No 0/o or 1/l: the name is typed into the phone by hand.
TOPIC_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"

#: The groups the person turns on and off, in the order Settings shows them.
TOPICS = ("hot", "offline", "minipc", "show", "other", "showtime")

#: Alert kinds by group. A kind not listed is "other", except QUIET ones.
_KINDS = {
    "hot": {"running_hot", "too_hot", "temperature_warning", "temperature_error",
            "enclosure_overtemperature", "enclosure_temperature_warning"},
    "offline": {"offline", "unexpected_shutdown"},
    "minipc": {"minipc_offline"},
    "show": {"show_not_started", "automation_failed"},
}
#: Never sent to the phone: someone just pressed the button and is looking.
QUIET = {"command_unverified"}

_TITLES = {
    "hot": "Projector running hot",
    "offline": "Projector not answering",
    "minipc": "Mini PC offline",
    "show": "Show did not start",
    "other": "Projector problem",
}
_NTFY_TAGS = {"hot": "fire", "offline": "warning", "minipc": "computer",
              "show": "performing_arts", "other": "warning"}


def topic_for(kind: str) -> str | None:
    """The group an alert kind belongs to, or None when it is never sent."""
    if kind in QUIET:
        return None
    for topic, kinds in _KINDS.items():
        if kind in kinds:
            return topic
    return "other"


def new_channel() -> str:
    """A channel name nobody can guess (60 bits), easy to type."""
    parts = ["".join(secrets.choice(TOPIC_ALPHABET) for _ in range(4)) for _ in range(3)]
    return "show-" + "-".join(parts)


@dataclass
class Delivery:
    ok: bool
    message: str
    at: float


class PhoneAlerts:
    def __init__(self) -> None:
        #: Dedupe keys of alerts that reached the phone, so "all clear" is
        #: only sent for something the person heard about.
        self.sent_keys: set[str] = set()
        self.last: Delivery | None = None
        self._tasks: set[asyncio.Task] = set()

    # -- the saved choice --------------------------------------------------

    @staticmethod
    def path() -> Path:
        return Path(config.settings.media_dir).expanduser().resolve().parent / FILENAME

    def load(self) -> dict[str, Any]:
        stored: dict[str, Any] = {}
        with contextlib.suppress(OSError, ValueError):
            loaded = json.loads(self.path().read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                stored = loaded
        topics = stored.get("topics") if isinstance(stored.get("topics"), dict) else {}
        service = stored.get("service")
        return {
            "service": service if service in ("ntfy", "pushover") else "off",
            "ntfy_server": str(stored.get("ntfy_server") or NTFY_SERVER).rstrip("/"),
            "ntfy_topic": str(stored.get("ntfy_topic") or ""),
            "pushover_user": str(stored.get("pushover_user") or ""),
            "pushover_token": str(stored.get("pushover_token") or ""),
            "topics": {t: bool(topics.get(t, True)) for t in TOPICS},
            "all_clear": bool(stored.get("all_clear", True)),
        }

    def save(self, values: dict[str, Any]) -> None:
        path = self.path()
        path.parent.mkdir(parents=True, exist_ok=True)
        partial = path.with_suffix(".part")
        fd = os.open(partial, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(values, handle, indent=2)
        os.replace(partial, path)

    def ready(self, values: dict[str, Any] | None = None) -> bool:
        values = values or self.load()
        if values["service"] == "ntfy":
            return bool(values["ntfy_topic"])
        if values["service"] == "pushover":
            return bool(values["pushover_user"] and values["pushover_token"])
        return False

    def describe(self) -> dict[str, Any]:
        """For Settings: everything but the Pushover keys themselves."""
        values = self.load()
        return {
            "service": values["service"],
            "ready": self.ready(values),
            "ntfy_server": values["ntfy_server"],
            "ntfy_topic": values["ntfy_topic"],
            "pushover_user_hint": values["pushover_user"][-4:] or None,
            "pushover_token_hint": values["pushover_token"][-4:] or None,
            "topics": values["topics"],
            "all_clear": values["all_clear"],
            "last_ok": self.last.ok if self.last else None,
            "last_message": self.last.message if self.last else None,
            "last_at": self.last.at if self.last else None,
        }

    # -- sending -------------------------------------------------------------

    def alert(self, *, dedupe_key: str, kind: str, severity: str, message: str) -> None:
        """An alert opened or got worse: send it, if its group is on."""
        if severity not in ("warning", "critical"):
            return
        values = self.load()
        topic = topic_for(kind)
        if topic is None or not self.ready(values) or not values["topics"][topic]:
            return
        self.sent_keys.add(dedupe_key)
        title = _TITLES[topic]
        if severity == "critical" and topic == "hot":
            title = "Projector too hot"
        self._spawn(values, title=title, message=message,
                    level="critical" if severity == "critical" else "warning",
                    tag=_NTFY_TAGS[topic])

    def all_clear(self, *, dedupe_key: str, message: str) -> None:
        if dedupe_key not in self.sent_keys:
            return
        self.sent_keys.discard(dedupe_key)
        values = self.load()
        if not self.ready(values) or not values["all_clear"]:
            return
        self._spawn(values, title="All clear", message=message, level="clear",
                    tag="white_check_mark")

    def show_event(self, *, title: str, message: str, tag: str) -> None:
        """The show started or stopped: news, not a problem."""
        values = self.load()
        if not self.ready(values) or not values["topics"]["showtime"]:
            return
        self._spawn(values, title=title, message=message, level="info", tag=tag)

    def _spawn(self, values: dict[str, Any], **kwargs: Any) -> None:
        # Alerting must never wait on the internet.
        task = asyncio.create_task(self._deliver(values, **kwargs), name="phone-alert")
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def _deliver(self, values: dict[str, Any], **kwargs: Any) -> None:
        ok, why = await self.send(values, **kwargs)
        if not ok:
            # One more try: a home internet connection hiccups.
            await asyncio.sleep(5)
            ok, why = await self.send(values, **kwargs)
        if not ok:
            log.warning("phone alert not sent: %s", why)

    async def send(self, values: dict[str, Any], *, title: str, message: str,
                   level: str, tag: str) -> tuple[bool, str]:
        """Send one notification now. Returns (sent, what happened)."""
        link = alerts_link()
        try:
            if values["service"] == "ntfy":
                body: dict[str, Any] = {
                    "topic": values["ntfy_topic"], "title": title, "message": message,
                    "priority": {"critical": 5, "warning": 4}.get(level, 3), "tags": [tag],
                }
                if link:
                    body["click"] = link
                response = await post(values["ntfy_server"], json=body)
            elif values["service"] == "pushover":
                form = {"token": values["pushover_token"], "user": values["pushover_user"],
                        "title": title, "message": message,
                        "priority": str({"critical": 1, "warning": 0, "info": 0}.get(level, -1))}
                if link:
                    form.update(url=link, url_title="Open the Alerts page")
                response = await post(PUSHOVER_URL, data=form)
            else:
                return self._result(False, "Phone alerts are off.")
        except httpx.HTTPError as exc:
            service = "ntfy" if values["service"] == "ntfy" else "Pushover"
            return self._result(False, f"Could not reach {service}: is this computer on the "
                                       f"internet? ({type(exc).__name__})")
        if response.status_code < 300:
            return self._result(True, "Sent.")
        return self._result(False, _refusal(values["service"], response))

    def _result(self, ok: bool, message: str) -> tuple[bool, str]:
        self.last = Delivery(ok=ok, message=message, at=time.time())
        return ok, message


def _refusal(service: str, response: httpx.Response) -> str:
    detail = ""
    with contextlib.suppress(ValueError):
        body = response.json()
        if isinstance(body, dict):
            detail = body.get("error") or "; ".join(body.get("errors") or [])
    if service == "pushover" and response.status_code == 400:
        return ("Pushover did not accept the keys. Copy the User Key from the top of "
                "pushover.net and the API Token from your application there, and paste "
                f"them again. ({detail})" if detail else
                "Pushover did not accept the keys. Copy them from pushover.net again.")
    if response.status_code == 429:
        return "Too many alerts in a short time: the service asked to wait a little."
    name = "ntfy" if service == "ntfy" else "Pushover"
    return f"{name} answered with an error ({response.status_code}){': ' + detail if detail else ''}."


def alerts_link() -> str | None:
    """The Alerts page, for tapping the notification: Tailscale first (works
    away from home too), else the home network address."""
    from app.services.discovery import lan_address, tailscale_address

    settings = config.settings
    if settings.local_only or settings.advertise_port is None:
        return None
    host = tailscale_address() or lan_address()
    return f"http://{host}:{settings.advertise_port}/alerts" if host else None


async def post(url: str, **kwargs: Any) -> httpx.Response:
    """The one call that reaches the internet (tests replace it)."""
    async with httpx.AsyncClient(timeout=10) as client:
        return await client.post(url, **kwargs)


phone = PhoneAlerts()
