"""Constants for the Projector Control integration."""

from __future__ import annotations

from datetime import timedelta

DOMAIN = "projector_control"

CONF_URL = "url"
CONF_KEY = "key"

#: How often the server is asked for everything. A command refreshes at once.
SCAN_INTERVAL = timedelta(seconds=5)

#: The feed version this integration understands (``api`` in the state).
API_VERSION = 1

#: Left by the install line from Projector Control's Settings: the server
#: address and a one-time pairing code, read by the setup form.
PAIRING_FILE = "pairing.json"
