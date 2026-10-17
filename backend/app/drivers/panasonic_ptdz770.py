"""Panasonic PT-DZ770 series driver (PT-DZ770 / PT-DW740 / PT-DX810).

Single-chip DLP, dual lamp. Panasonic groups these three under one control
command set, which is the document the mnemonics below come from.

Confirmed for the family: ``IIS`` input select, ``Q$S`` lamp control status,
``LPM`` lamp select and ``OLP`` lamp power exist as commands, plus the common
power/shutter/query set shared with the DZ13K. What is NOT confirmed is the
parameter encoding for ``LPM`` and ``OLP``, so both are gated behind the
unverified-command opt-in exactly like the lens axes. Two lamps, so lamp
runtime is read as ``Q$L:1`` and ``Q$L:2``.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from .base import Capability, CapabilityKind, CommandOutcome, CommandResult, Provenance
from .panasonic_ptdz13k import PANASONIC_INPUT_LABELS, PanasonicPTDZ13KDriver

FAM = Provenance.INFERRED_FAMILY

#: Inputs on the PT-DZ770 family: RGB1 (5×BNC), RGB2 (D-sub), DVI-D, HDMI,
#: VIDEO (BNC) and S-VIDEO. No SDI, no DIGITAL LINK.
DZ770_INPUTS: dict[str, str] = {
    code: PANASONIC_INPUT_LABELS[code] for code in ("RG1", "RG2", "DVI", "HD1", "VID", "SVD")
}

#: ``LPM`` lamp select. The mnemonic is in the family document; the value
#: encoding below is the convention from other Panasonic dual-lamp models
#: and is unconfirmed for this one — hence gated.
LAMP_SELECT_PARAMS: dict[str, str] = {"dual": "0", "single": "1", "lamp1": "2", "lamp2": "3"}
#: ``OLP`` lamp power, same caveat.
LAMP_POWER_PARAMS: dict[str, str] = {"normal": "0", "eco": "1"}

LAMP_CAVEAT = (
    "The mnemonic is in the PT-DZ770/DW740/DX810 control-command document but the "
    "parameter values this driver sends are taken from other Panasonic dual-lamp "
    "models and are unconfirmed for this one. Check the command list for your unit "
    "before enabling."
)


class PanasonicPTDZ770Driver(PanasonicPTDZ13KDriver):
    driver_id = "panasonic_pt_dz770"
    display_name = "Panasonic PT-DZ770 series"

    INPUTS = DZ770_INPUTS
    LAMP_COUNT = 2
    OPTIONAL_INPUTS = frozenset()
    EXTRA_CAPABILITIES = (
        Capability("lamp.select", CapabilityKind.SET, FAM,
                   "Lamp select: dual / single / lamp 1 / lamp 2 (LPM)",
                   params=tuple(LAMP_SELECT_PARAMS),
                   param_labels={"dual": "Dual", "single": "Single (shorter runtime)",
                                 "lamp1": "Lamp 1 only", "lamp2": "Lamp 2 only"},
                   disruptive=True, idempotent=False, caveat=LAMP_CAVEAT),
        Capability("lamp.power", CapabilityKind.SET, FAM,
                   "Lamp power: normal / eco (OLP)",
                   params=tuple(LAMP_POWER_PARAMS),
                   param_labels={"normal": "Normal", "eco": "Eco"},
                   idempotent=False, caveat=LAMP_CAVEAT),
    )

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
            return await self.raw_command(capability, f"{mnemonic}:{table[choice]}")
        return await super().execute_supported_command(capability, params)
