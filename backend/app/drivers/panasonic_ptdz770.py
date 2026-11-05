"""Panasonic PT-DZ770 series driver (PT-DZ770 / PT-DW740 / PT-DX810).

Single-chip DLP, dual lamp. Panasonic groups these three under one control
command set, which is the document the mnemonics below come from. The
PT-DX810ULK is the US PT-DX810 sold without a lens; it is the same
projector to control.

Confirmed for the family: ``IIS`` input select, ``Q$S`` lamp control status,
``LPM`` lamp select and ``OLP`` lamp power, plus the common power/shutter/
query set shared with the DZ13K. The ``LPM`` and ``OLP`` parameter values
(``LPM`` 0 dual, 1 single, 2 lamp 1, 3 lamp 2; ``OLP`` 0 normal, 1 eco) are
in the PT-DX810 control-command list, so both are confirmed commands. Two
lamps, so lamp runtime is read as ``Q$L:1`` and ``Q$L:2``. The family has
no lens memory.
"""

from __future__ import annotations

import time
from collections.abc import Mapping
from typing import Any

from .base import (
    Capability,
    CapabilityKind,
    CommandOutcome,
    CommandResult,
    ConnectionConfig,
    PowerState,
    Provenance,
)
from .panasonic_ptdz13k import PANASONIC_INPUT_LABELS, PanasonicPTDZ13KDriver

DOC = Provenance.VERIFIED_DOC

#: Inputs on the PT-DZ770 family: RGB1 (5×BNC), RGB2 (D-sub), DVI-D, HDMI,
#: VIDEO (BNC) and S-VIDEO. No SDI, no DIGITAL LINK.
DZ770_INPUTS: dict[str, str] = {
    code: PANASONIC_INPUT_LABELS[code] for code in ("RG1", "RG2", "DVI", "HD1", "VID", "SVD")
}

#: ``LPM`` lamp select, values from the PT-DX810 control-command list.
LAMP_SELECT_PARAMS: dict[str, str] = {"dual": "0", "single": "1", "lamp1": "2", "lamp2": "3"}
#: ``OLP`` lamp power, same document.
LAMP_POWER_PARAMS: dict[str, str] = {"normal": "0", "eco": "1"}

#: The command list says ``LPM`` answers ER401 while the projector is still
#: changing over to the lamps selected last time.
LAMP_SWITCH_REFUSAL = (
    "The projector is still switching lamps after the last lamp select. "
    "Try again in a minute."
)

DZ770_LENS_CAVEAT = (
    "The PT-DZ770/DW740/DX810 command list has a lens-control section, but the axis "
    "numbering and parameter format this driver sends (e.g. VXX:LNSI2+0001) come from "
    "the PT-DZ780 specification and are unconfirmed for this family. Lens movement "
    "needs a motorised Panasonic lens fitted (the PT-DX810ULK ships without one). "
    "Test with the projector somewhere a lens movement cannot cause harm."
)


class PanasonicPTDZ770Driver(PanasonicPTDZ13KDriver):
    driver_id = "panasonic_pt_dz770"
    display_name = "Panasonic DZ770 / DW740 / DX810"

    INPUTS = DZ770_INPUTS
    LAMP_COUNT = 2
    OPTIONAL_INPUTS = frozenset()
    LENS_CAVEAT = DZ770_LENS_CAVEAT
    LENS_MEMORY_NOTE = "This projector has no lens memory."
    #: How long after an accepted lamp select an ER401 to another one means
    #: "still switching" rather than "no such command".
    LAMP_SWITCH_SECONDS: float = 120.0
    EXTRA_CAPABILITIES = (
        Capability("lamp.select", CapabilityKind.SET, DOC,
                   "Lamp select: dual / single / lamp 1 / lamp 2 (LPM)",
                   params=tuple(LAMP_SELECT_PARAMS),
                   param_labels={"dual": "Dual", "single": "Single (shorter runtime)",
                                 "lamp1": "Lamp 1 only", "lamp2": "Lamp 2 only"},
                   disruptive=True, idempotent=False),
        Capability("lamp.power", CapabilityKind.SET, DOC,
                   "Lamp power: normal / eco (OLP)",
                   params=tuple(LAMP_POWER_PARAMS),
                   param_labels={"normal": "Normal", "eco": "Eco"},
                   idempotent=False),
    )

    def __init__(self, config: ConnectionConfig) -> None:
        super().__init__(config)
        #: When a lamp select was last accepted. Monotonic seconds.
        self._lamp_switch_at: float | None = None

    async def execute_supported_command(
        self, capability: str, params: Mapping[str, Any] | None = None
    ) -> CommandResult:
        params = params or {}
        if capability in ("lamp.select", "lamp.power"):
            if (gated := self._gate(capability)) is not None:
                return gated
            table = LAMP_SELECT_PARAMS if capability == "lamp.select" else LAMP_POWER_PARAMS
            mnemonic = "LPM" if capability == "lamp.select" else "OLP"
            choice = str(params.get("mode", params.get("state", ""))).lower()
            if choice not in table:
                return CommandResult(
                    capability=capability, outcome=CommandOutcome.REJECTED,
                    error=f"{choice!r} is not one of {', '.join(table)}",
                )
            result = await self.raw_command(capability, f"{mnemonic}:{table[choice]}")
            if capability == "lamp.select":
                self._note_lamp_switch(result)
            return result
        return await super().execute_supported_command(capability, params)

    def _note_lamp_switch(self, result: CommandResult) -> None:
        if result.outcome is CommandOutcome.ACCEPTED:
            self._lamp_switch_at = time.monotonic()
        elif (
            # A refusal straight after a lamp select is the change-over, even
            # while the warm-up explanation would also fit; standby is not.
            result.outcome in (CommandOutcome.UNSUPPORTED, CommandOutcome.BUSY)
            and result.raw_response
            and self._power_seen is not PowerState.OFF
            and self._lamp_switch_at is not None
            and time.monotonic() - self._lamp_switch_at < self.LAMP_SWITCH_SECONDS
        ):
            result.outcome = CommandOutcome.BUSY
            result.error = f"{LAMP_SWITCH_REFUSAL} (projector answered {result.raw_response})"
