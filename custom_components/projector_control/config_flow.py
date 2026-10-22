"""Setup form: where the server is, and how Home Assistant signs in to it.

When the integration was installed with the line from Projector Control's
Settings > Home Assistant, that line left the server address and a one-time
pairing code in ``pairing.json``: the form is filled in already and Submit
is all it takes. Otherwise it asks for the address and a key made under
Settings > Home Assistant > "Make a key".
"""

from __future__ import annotations

import json
import logging
from collections.abc import Mapping
from pathlib import Path
from typing import Any

import voluptuous as vol
from homeassistant.config_entries import ConfigFlow, ConfigFlowResult
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .api import (
    CannotConnect,
    InvalidAuth,
    ProjectorControlApi,
    ProjectorControlError,
    normalise_url,
)
from .const import CONF_KEY, CONF_URL, DOMAIN, PAIRING_FILE

_LOGGER = logging.getLogger(__name__)

PAIRING_PATH = Path(__file__).parent / PAIRING_FILE


def _read_pairing() -> dict[str, str] | None:
    try:
        data = json.loads(PAIRING_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict) or not data.get("url"):
        return None
    return {"url": str(data["url"]), "code": str(data.get("code") or "")}


def _forget_pairing() -> None:
    PAIRING_PATH.unlink(missing_ok=True)


class ProjectorControlConfigFlow(ConfigFlow, domain=DOMAIN):
    VERSION = 1

    def __init__(self) -> None:
        self._pairing: dict[str, str] | None = None

    async def _check(self, url: str, key: str) -> tuple[dict[str, Any] | None, str | None]:
        """The server's state with this key, or an error key for the form."""
        api = ProjectorControlApi(async_get_clientsession(self.hass), url, key)
        try:
            return await api.state(), None
        except InvalidAuth:
            return None, "invalid_auth"
        except CannotConnect:
            return None, "cannot_connect"
        except ProjectorControlError:
            _LOGGER.exception("Unexpected answer from %s", url)
            return None, "unknown"

    async def _finish(self, url: str, key: str, state: dict[str, Any]) -> ConfigFlowResult:
        await self.async_set_unique_id(url)
        self._abort_if_unique_id_configured(updates={CONF_URL: url, CONF_KEY: key})
        await self.hass.async_add_executor_job(_forget_pairing)
        title = state.get("server", {}).get("name") or "Projector Control"
        return self.async_create_entry(title=title, data={CONF_URL: url, CONF_KEY: key})

    async def async_step_user(self, user_input: dict[str, Any] | None = None
                              ) -> ConfigFlowResult:
        if self._pairing is None:
            self._pairing = await self.hass.async_add_executor_job(_read_pairing) or {}
        if self._pairing.get("code"):
            return await self.async_step_pair()
        return await self.async_step_key()

    async def async_step_pair(self, user_input: dict[str, Any] | None = None
                              ) -> ConfigFlowResult:
        """Filled in by the install line: press Submit."""
        assert self._pairing is not None
        errors: dict[str, str] = {}
        if user_input is not None:
            url = normalise_url(user_input[CONF_URL])
            api = ProjectorControlApi(async_get_clientsession(self.hass), url)
            try:
                key = await api.pair(self._pairing["code"])
            except InvalidAuth:
                # Used up or out of date: fall back to a key made by hand.
                self._pairing = {"url": url, "code": ""}
                await self.hass.async_add_executor_job(_forget_pairing)
                return await self.async_step_key(errors={"base": "pairing_used"})
            except CannotConnect:
                errors["base"] = "cannot_connect"
            except ProjectorControlError:
                _LOGGER.exception("Pairing with %s failed", url)
                errors["base"] = "unknown"
            else:
                state, error = await self._check(url, key)
                if state is not None:
                    return await self._finish(url, key, state)
                errors["base"] = error or "unknown"
        return self.async_show_form(
            step_id="pair",
            data_schema=vol.Schema({
                vol.Required(CONF_URL, default=self._pairing["url"]): str,
            }),
            description_placeholders={"url": self._pairing["url"]},
            errors=errors,
        )

    async def async_step_key(self, user_input: dict[str, Any] | None = None,
                             errors: dict[str, str] | None = None) -> ConfigFlowResult:
        """Address and a key made in Projector Control's Settings."""
        errors = dict(errors or {})
        default_url = (self._pairing or {}).get("url", "")
        if user_input is not None:
            url = normalise_url(user_input[CONF_URL])
            key = user_input[CONF_KEY].strip()
            default_url = url
            state, error = await self._check(url, key)
            if state is not None:
                return await self._finish(url, key, state)
            errors["base"] = error or "unknown"
        return self.async_show_form(
            step_id="key",
            data_schema=vol.Schema({
                vol.Required(CONF_URL, default=default_url): str,
                vol.Required(CONF_KEY): str,
            }),
            errors=errors,
        )

    async def async_step_reauth(self, entry_data: Mapping[str, Any]) -> ConfigFlowResult:
        return await self.async_step_reauth_confirm()

    async def async_step_reauth_confirm(self, user_input: dict[str, Any] | None = None
                                        ) -> ConfigFlowResult:
        """The key stopped working (Home Assistant was disconnected, or a new key was made)."""
        entry = self._get_reauth_entry()
        errors: dict[str, str] = {}
        if user_input is not None:
            key = user_input[CONF_KEY].strip()
            state, error = await self._check(entry.data[CONF_URL], key)
            if state is not None:
                return self.async_update_reload_and_abort(
                    entry, data_updates={CONF_KEY: key})
            errors["base"] = error or "unknown"
        return self.async_show_form(
            step_id="reauth_confirm",
            data_schema=vol.Schema({vol.Required(CONF_KEY): str}),
            description_placeholders={"url": entry.data[CONF_URL]},
            errors=errors,
        )

    async def async_step_reconfigure(self, user_input: dict[str, Any] | None = None
                                     ) -> ConfigFlowResult:
        """A new server address (the server moved) and, if needed, a new key."""
        entry = self._get_reconfigure_entry()
        errors: dict[str, str] = {}
        if user_input is not None:
            url = normalise_url(user_input[CONF_URL])
            key = (user_input.get(CONF_KEY) or "").strip() or entry.data[CONF_KEY]
            state, error = await self._check(url, key)
            if state is not None:
                return self.async_update_reload_and_abort(
                    entry, unique_id=url, data_updates={CONF_URL: url, CONF_KEY: key})
            errors["base"] = error or "unknown"
        return self.async_show_form(
            step_id="reconfigure",
            data_schema=vol.Schema({
                vol.Required(CONF_URL, default=entry.data[CONF_URL]): str,
                vol.Optional(CONF_KEY): str,
            }),
            errors=errors,
        )
