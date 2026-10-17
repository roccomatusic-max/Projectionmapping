# Hardware validation procedure

**No command in this platform has been tested against a physical PT-DZ13K.**
Everything was developed and tested against the simulator in
`backend/simulator/`, which implements the protocol as documented — which
means it validates the *controller*, not the *documentation*.

This document is the procedure that turns documented commands into verified
ones. Work through it once, with a projector you can afford to have
misbehave, before you hang anything on a building.

---

## Before you start

- A PT-DZ13K (or DS12K / DW11K / DZ10K) on a network the server can reach.
- The projector's own **Operating Instructions** and the **Control Commands**
  PDF for your model. Panasonic publishes both; the command PDF is the
  authority for everything below.
- Somewhere safe for the projector to be: on a bench, or rigged but aimed
  where an unexpected lens movement or shutter change does not matter.
- Nothing scheduled. Do not do this during show prep.

Record results as you go. There is a table at the end to fill in.

---

## Stage 1 — Reachability and authentication

1. Confirm basic IP reachability:
   ```bash
   ping -c3 192.168.20.21
   nc -vz 192.168.20.21 1024
   ```
   If `nc` fails but ping works, network control is off in the projector's
   menu, or something else holds the control session.

2. Watch the raw handshake:
   ```bash
   nc 192.168.20.21 1024
   ```
   The projector speaks first. You will see either `NTCONTROL 0` (no
   password) or `NTCONTROL 1 <8 hex digits>` (password set). **Write down
   which.** This tells you whether the password field matters.

3. Register the projector in the UI and press **Test connection**.
   Expected: *"Connected, authenticated and the projector answered a status
   query."*

> ✅ Passing stage 1 confirms the transport, the port, the handshake and the
> credentials. It confirms nothing about any individual command.

---

## Stage 2 — Read-only queries

These cannot change projector state. Run them first, with the projector in
standby, and record the **exact raw response** for each — the Projector
detail page shows it in the Recent commands table.

| Command | How to run | What to record |
|---|---|---|
| `QPW` | "Poll now" | Should be `00QPW:000` in standby |
| `QSH` | "Poll now" | `00QSH:0` or `00QSH:1` |
| `QIN` | "Poll now" | The input code, e.g. `00QIN:DVI` |
| `Q$L:1`…`Q$L:4` | "Poll now" (deep poll) | **The exact format of the number** |
| `Q$S` | "Poll now" (deep poll) | The raw value |
| `QLS` | API: `POST /api/projectors/{id}/command` `{"capability":"lamp.on_off"}` | The raw value |

### Two things to fix in the code from this stage

The response layouts for `Q$L`, `Q$S` and `QLS` could not be confirmed from
the documentation available when this was built. The driver parses them
defensively — it extracts the first integer from `Q$L` and reports anything
it does not recognise as `unparsed` rather than guessing.

1. **If `Q$L` returns something other than a plain number** (a unit suffix,
   a fixed-width field, a multi-field response), adjust the parser in
   `backend/app/drivers/panasonic_ptdz13k.py::get_lamp_hours`.

2. **If `Q$S` returns values outside `0`–`3`**, extend
   `PANASONIC_LAMP_STATUS_MAP` in the same file. Until you do, the UI shows
   the raw value and flags it as unparsed, which is correct behaviour but
   not useful behaviour.

The UI will tell you when this is needed: a lamp reading showing "unparsed
reply" is the signal.

---

## Stage 3 — Power

The projector will physically start and stop. Allow a full warm-up and a
full cool-down.

1. **Power on.** Confirm the UI shows `accepted`, then watch the status page.
   Within the warm-up period the power state should become `on`.
   - Record the warm-up duration. If it exceeds `POWER_VERIFY_ATTEMPTS ×
     POWER_VERIFY_DELAY` (default 60 s), raise `POWER_VERIFY_ATTEMPTS` in
     `.env` or you will get spurious "command not confirmed" alerts.
2. **Try to power off during warm-up.** Expected: the projector refuses, and
   the UI reports `busy` rather than a success. If it reports success,
   the state machine differs from what is assumed and
   `docs/PROTOCOL-RESEARCH.md §2.5` needs amending.
3. **Power off.** Watch the cooling period. Confirm the state reaches `off`.
4. **Try to power on during cooling.** Expected: refused, reported as `busy`.

---

## Stage 4 — Shutter

**Check the polarity before trusting it.** `OSH:1` is documented to *close*
the shutter, and the driver maps it that way, but an inverted shutter during
a show is exactly the failure this stage exists to catch.

With the lamp on and an image showing:

1. Press **Close**. The image should blank. The UI should show
   `Shutter: Closed`.
2. Press **Open**. The image should return.

If the behaviour is inverted, fix `_SHUTTER_TO_PARAM` and `_PARAM_TO_SHUTTER`
in `backend/app/drivers/panasonic_ptdz13k.py` — the mapping exists in exactly
one place so this is a two-line change.

---

## Stage 5 — Inputs

Switch to each input in turn and record what happens:

| Input | Expected on a unit with the board | Expected without |
|---|---|---|
| RGB 1 (`RG1`) | switches | — |
| RGB 2 (`RG2`) | switches | — |
| Video (`VID`) | switches | — |
| DVI-D (`DVI`) | switches | — |
| HDMI (`HD1`) | switches | — |
| SDI 1 (`SD1`) | switches | `ER401`, reported as "input board not fitted" |
| SDI 2 (`SD2`) | switches | `ER401`, reported as "input board not fitted" |

An `ER401` is recorded against that input only. The UI strikes it through
with the reason, and the platform stops asking. Input switching as a whole
keeps working. If a *fitted* input gets struck through, that is a bug —
check the raw response in the command log.

---

## Stage 6 — Gated commands (only if you want them)

Everything below is **off by default**. The commands are documented for
sibling Panasonic models, not for the DZ13K series specifically, so the
platform refuses to send them until you say otherwise per projector.

### Before enabling

Open your model's **Control Commands** PDF and find each command you intend
to use. Confirm:

- the mnemonic exists for your model,
- the parameter encoding matches what the driver sends.

The driver's encodings are listed in `docs/PROTOCOL-RESEARCH.md §2.5`. The
lens axes are the ones to check hardest — `VXX:LNSI2` through `VXX:LNSI5`
come from the PT-DZ780 specification.

### Enabling

Projectors → Edit → **Allow unverified commands**. This is per projector, so
you can enable it on a bench unit without touching the rigged ones.

### Testing lens movement

⚠️ **Only with the projector where a lens movement cannot cause damage.**
No explicit stop command could be confirmed for this model, which is why the
UI offers discrete jogs rather than press-and-hold.

1. Run **Home position** first. Confirm the lens moves and stops.
2. Jog **Shift H** one step in each direction. Confirm the image moves by a
   small amount and *stops on its own*.
3. If a jog causes continuous movement that does not stop, **disable
   unverified commands immediately** and treat the axis encoding as wrong.

Record whether each axis behaves. A command that works should be promoted:
change its `Provenance` to `HARDWARE_VERIFIED` in
`backend/app/drivers/panasonic_ptdz13k.py`, which ungates it permanently and
documents that someone checked.

---

## Stage 7 — PJLink (optional but recommended)

The Panasonic LAN protocol has no confirmed per-subsystem error query. PJLink
does: `%1ERST` reports fan, lamp, temperature, cover, filter and "other" as
ok/warning/error. That is the backbone of useful health monitoring.

1. Enable PJLink on the projector.
2. Register the **same physical projector a second time**, with driver
   `pjlink` and port 4352, named e.g. "House Left (PJLink)".
3. Poll it and confirm the subsystem chips appear on the detail page.

Run both entries side by side. The Panasonic driver gives you the richer
control surface; the PJLink entry gives you health reporting neither has
alone.

> Numeric intake/exhaust temperatures are **not** exposed by either path, and
> the platform does not invent them. The UI marks temperature as
> `n/a — not supported by this model`. If you want real numbers, put a sensor
> in the enclosure and feed it in through the enclosure API.

---

## Results table

Fill this in and keep it with the installation notes.

| Stage | Command | Result | Raw response | Notes |
|---|---|---|---|---|
| 1 | Handshake | | `NTCONTROL _` | protect mode? |
| 2 | `QPW` | | | |
| 2 | `QSH` | | | |
| 2 | `QIN` | | | |
| 2 | `Q$L:1` | | | format as expected? |
| 2 | `Q$S` | | | value understood? |
| 2 | `QLS` | | | |
| 3 | `PON` | | | warm-up duration: ___ s |
| 3 | `POF` during warm-up | | | refused? |
| 3 | `POF` | | | cool-down duration: ___ s |
| 3 | `PON` during cooling | | | refused? |
| 4 | `OSH:1` | | | image blanked? |
| 4 | `OSH:0` | | | image returned? |
| 5 | each `IIS:` | | | which boards fitted |
| 6 | `VXX:LNSI1` (home) | | | |
| 6 | `VXX:LNSI2` (shift H) | | | stopped on its own? |
| 7 | `%1ERST` | | | |

---

## After validation

1. Promote verified commands to `Provenance.HARDWARE_VERIFIED` in the driver.
2. Correct `docs/PROTOCOL-RESEARCH.md` wherever reality differed.
3. Fix any response parser that reported `unparsed`.
4. Re-run the test suite: `cd backend && .venv/bin/python -m pytest`.
5. Add a note here recording the firmware version you tested against —
   behaviour can change between firmware releases.
