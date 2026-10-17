# Panasonic PT-DZ13K — Communication Interface Research

**Status of this document:** compiled from Panasonic's published control-command
specifications and the PJLink standard. Every command this platform can send is
listed here with a *provenance* tag. The driver layer refuses to transmit any
command that is not in its capability manifest, and the manifest mirrors this
document.

> **Validation caveat.** The author of this implementation had no physical
> PT-DZ13K available. Nothing here has been confirmed against real hardware.
> Commands are tagged `VERIFIED_DOC` (present in a Panasonic document naming the
> DZ13K series), `INFERRED_FAMILY` (documented for a sibling Panasonic model,
> numbering/behaviour assumed to carry over) or `STANDARD` (PJLink spec).
> `INFERRED_FAMILY` commands are **disabled by default** — see
> [Unverified command gating](#unverified-command-gating).
> See [HARDWARE-VALIDATION.md](HARDWARE-VALIDATION.md) for the procedure that
> promotes a command to hardware-verified.

---

## 1. Available control interfaces

The PT-DZ13K series (PT-DZ13K / PT-DS12K / PT-DW11K / PT-DZ10K) exposes three
control interfaces relevant to this platform:

| Interface | Transport | Port | Role in this platform |
|---|---|---|---|
| Panasonic LAN command protocol ("Protocol 2" / NTCONTROL) | TCP | 1024 (default, configurable) | Primary. Full manufacturer command set. |
| PJLink | TCP | 4352 | Secondary/fallback. Standardised subset, cross-vendor. |
| RS-232C (SERIAL IN) | Serial, 9600 8N1 | n/a | Designed for, implemented via network-to-serial gateway. Phase 2. |

The platform models these as **three transports behind one driver interface**, so
a device can be reached over whichever interface is wired up, and the capability
manifest narrows to what that transport actually supports.

### 1.1 Web control port

Port 80 hosts the projector's own web control UI. This platform does **not**
scrape it — the HTTP interface is not a documented API and screen-scraping it is
fragile. It is referenced only in the docs as the place where you set the
administrator password that the LAN protocol authenticates against.

---

## 2. Panasonic LAN command protocol (Protocol 2 / NTCONTROL)

### 2.1 Connection and handshake

Connection is plain TCP to port 1024. The projector speaks first.

```
Non-protect mode (no admin password set):
  PJ -> PC   "NTCONTROL 0\r"

Protect mode (admin password set):
  PJ -> PC   "NTCONTROL 1 <8-hex-digit-random>\r"
```

In protect mode the client computes:

```
digest = md5_hex( "<username>:<password>:<random>" )
```

with the web-control administrator credentials (factory defaults `admin1` /
`panasonic`) and the random string exactly as received. The digest is a 32
character lowercase hex string.

### 2.2 Command framing

```
Non-protect:   "00" + COMMAND + "\r"
Protect:       digest + "00" + COMMAND + "\r"
```

`00` is the two-digit projector ID prefix. `00` addresses the unit regardless of
its configured ID, which is what this platform uses — each projector is a
separate TCP endpoint here, so the ID field is not needed for addressing.

The digest is sent **only on the first command of a connection**. Subsequent
commands on the same socket use the bare `00` form.

### 2.3 Responses

| Response | Meaning |
|---|---|
| `00<COMMAND>\r` | Control command accepted (the mnemonic is echoed) |
| `00<value>\r` | Query result: the ID followed by the value alone, e.g. `00001` for `QPW` — the form Panasonic's LAN examples show |
| `00<COMMAND>:<value>\r` | Query result as reported on some firmware; the parser accepts both forms |
| `ERR1\r` | Undefined control command |
| `ERR2\r` | Parameter out of range |
| `ERR3\r` | Busy / command not acceptable right now |
| `ERR4\r` | Timeout / not acceptable in this period |
| `ERR5\r` | Wrong data length |
| `ERRA\r` | Password mismatch (authentication failure) |
| `00ER401\r` | Command not available on this model/state |
| `00ER402\r` | Invalid parameter |

Note that the projector can answer with *either* the LAN-layer `ERRn` codes or
the serial-layer `ER4nn` codes carried inside a normal response frame. The
parser handles both and maps them onto distinct result types — `ERR3`/`ERR4`
mean "retry may help", `ERR1`/`ER401` mean "never send this again to this
model".

### 2.4 Timing

Panasonic's specification instructs the controller to wait more than 0.5 s after
receiving a response before sending the next command. The driver enforces a
configurable inter-command gap, defaulting to **600 ms** for Panasonic
transports.

### 2.5 Command set

#### Power — `VERIFIED_DOC`

| Operation | Command | Parameters / response |
|---|---|---|
| Power on | `PON` | ack. Not accepted during cooling. |
| Power off | `POF` | ack. |
| Power query | `QPW` | `000` = standby, `001` = power on |

`QPW` is answered in standby, which makes it the liveness probe for a projector
that is reachable but off.

Panasonic's documentation directs the controller to confirm `PON`/`POF` by
polling `QPW` after the callback rather than trusting the ack. The driver does
exactly that: a power command returns `ACCEPTED` on ack and is only promoted to
`CONFIRMED` once `QPW` reflects the requested state.

#### Shutter — `VERIFIED_DOC`

| Operation | Command | Parameters |
|---|---|---|
| Set shutter | `OSH:0` / `OSH:1` | `0` = shutter open (image shown), `1` = shutter closed (blanked) |
| Shutter query | `QSH` | `0` = open, `1` = closed |

> The polarity is a frequent source of bugs: `1` **closes** the shutter.
> In this codebase the domain model uses `ShutterState.OPEN` / `CLOSED` and the
> mapping lives in exactly one place (`drivers/panasonic_ptdz13k.py`).

#### Input selection — `VERIFIED_DOC`

`IIS:<param>`, query with `QIN`. Parameters confirmed for the DZ13K series:

| Parameter | Input |
|---|---|
| `RG1` | RGB1 |
| `RG2` | RGB2 |
| `VID` | VIDEO |
| `DVI` | DVI-D |
| `HD1` | HDMI (slot) |
| `SD1` | SDI 1 |
| `SD2` | SDI 2 |

`SD1`/`SD2` depend on the installed input board; the projector answers `ER401`
when the board is absent. The driver treats `ER401` on an input as a
**capability discovery result** and records that input as unavailable on that
unit rather than retrying it.

> REMOTE2 input selection takes priority over `IIS` in Panasonic's documented
> behaviour; when REMOTE2 is driving input selection the projector answers
> `ER402`. The driver surfaces this as `REJECTED` with that explanation rather
> than as a generic failure.

#### Lamp and status queries — `VERIFIED_DOC`

| Operation | Command | Notes |
|---|---|---|
| Lamp runtime, lamp *n* | `Q$L:1` … `Q$L:4` | PT-DZ13K is a 4-lamp projector. Response is a runtime value in hours. |
| Lamp control status | `Q$S` | Lamp state machine (standby / on-control / on / cooling) |
| Lamp status | `QLS` | Per-lamp on/off state |
| Shutter status | `QSH` | see above |
| Input signal status | `QIN` | current input, same parameter vocabulary as `IIS` |
| Power | `QPW` | see above |

> **Honest gap:** the response *layouts* for `Q$L`, `Q$S` and `QLS` were not
> confirmable from the sources available offline. The driver parses them
> defensively: it accepts an integer for `Q$L`, and for `Q$S`/`QLS` it records
> the raw string and maps only the values it recognises, reporting the rest as
> `unparsed` telemetry rather than guessing. Fill in
> `PANASONIC_LAMP_STATUS_MAP` in `drivers/panasonic_ptdz13k.py` once you have
> read the real responses off your unit — the validation doc walks through it.

#### Lens — `VERIFIED_DOC` for calibration/home, `INFERRED_FAMILY` for axes

| Operation | Command | Provenance |
|---|---|---|
| Lens calibration | `VXX:LNSI0` | `VERIFIED_DOC` (DZ13K series TOC) |
| Lens home position | `VXX:LNSI1` | `VERIFIED_DOC` (DZ13K series TOC) |
| Lens focus key | `OLF` | `VERIFIED_DOC` (DZ13K series TOC) |
| Lens shift key | `OLH` | `VERIFIED_DOC` (DZ13K series TOC) |
| Lens zoom key | `OLZ` | `VERIFIED_DOC` (DZ13K series TOC) |
| Lens shift horizontal | `VXX:LNSI2` | `INFERRED_FAMILY` (PT-DZ780 spec) |
| Lens shift vertical | `VXX:LNSI3` | `INFERRED_FAMILY` (PT-DZ780 spec) |
| Lens focus | `VXX:LNSI4` | `INFERRED_FAMILY` (PT-DZ780 spec) |
| Lens zoom | `VXX:LNSI5` | `INFERRED_FAMILY` (PT-DZ780 spec) |

**Motorised lens movement is gated off by default.** The DZ13K series document's
table of contents confirms these command *names* exist, but the exact parameter
encoding for the axis commands was taken from a sibling model. Sending a
mis-encoded lens command to a projector hanging off a building is not an
acceptable risk to take on an inference, so:

- the lens axis controls are hidden in the UI until the operator explicitly
  enables unverified commands for that device, and
- the UI exposes them as **jog** controls (discrete short movements) rather than
  press-and-hold, because a documented explicit stop command could not be
  confirmed.

**Lens memory** — no lens-memory command could be confirmed for this model from
the available sources. It is therefore **not implemented**. The capability
manifest reports `lens_memory: unsupported`, and the UI says so rather than
showing a dead control.

#### Image adjustments — `INFERRED_FAMILY`

Panasonic's sibling-model specs document picture controls (`OBR` brightness,
`OCS` contrast, `OCO` colour, `OTN` tint, `OSP` sharpness, `VSE` aspect/picture
mode, `OFZ` freeze, `OSD` on-screen display). Their presence in the DZ13K series
document was not confirmable offline, so they ship **behind the unverified
gate**, and each one re-reads its value after setting it so the UI reflects what
the projector actually did rather than what was asked for.

#### Remote-key emulation — `VERIFIED_DOC` (names), parameters `INFERRED_FAMILY`

The on-screen remote maps to the projector's key-emulation commands. Menu
navigation keys are low-risk (they move a cursor in an OSD) but still re-read
nothing, so the UI labels the remote panel as "fire-and-forget: the projector
does not report OSD cursor position".

### 2.6 Unverified command gating

Each `Capability` carries `provenance` and `verified`. The driver's
`execute()` refuses — without opening a socket — any capability whose
provenance is `INFERRED_FAMILY` unless the device record has
`allow_unverified_commands = true`. The refusal is returned as
`CommandOutcome.UNSUPPORTED`, which is a distinct outcome from a device-side
rejection, so the logs and the UI never conflate "we chose not to send this"
with "the projector said no".

---

## 3. PJLink

PJLink is an industry standard (JBMIA) and is implemented here as a
cross-vendor driver foundation. Port 4352.

### 3.1 Handshake

```
No auth:   PJ -> PC   "PJLINK 0\r"
Auth:      PJ -> PC   "PJLINK 1 <8-hex-random>\r"
           PC -> PJ   md5_hex(<random> + <password>) + command
```

Note the digest input differs from Panasonic's: PJLink concatenates
`random || password` with no separator and no username.

### 3.2 Class 1 command set — `STANDARD`

| Command | Purpose | Values |
|---|---|---|
| `%1POWR 1` / `%1POWR 0` | power on / off | — |
| `%1POWR ?` | power query | `0` off, `1` on, `2` cooling, `3` warm-up |
| `%1INPT <n>` | input select | `11`–`19` RGB, `21`–`29` video, `31`–`39` digital, `41`–`49` storage, `51`–`59` network |
| `%1INPT ?` | input query | as above |
| `%1AVMT 11`/`10` | video mute on/off | `21`/`20` audio, `31`/`30` both |
| `%1AVMT ?` | mute query | — |
| `%1ERST ?` | error status | 6 digits: fan, lamp, temperature, cover, filter, other; each `0` ok `1` warning `2` error |
| `%1LAMP ?` | lamp hours | `<hours> <on|off>` pairs, up to 8 lamps |
| `%1INST ?` | available inputs | space-separated input numbers |
| `%1NAME ?` | projector name | — |
| `%1INF1 ?` | manufacturer | — |
| `%1INF2 ?` | model | — |
| `%1INFO ?` | other info | — |
| `%1CLSS ?` | PJLink class | `1` or `2` |

`%1ERST` and `%1LAMP` are the backbone of this platform's health monitoring,
because they are standard and therefore trustworthy across every vendor.

### 3.3 Class 2 additions — `STANDARD`, probed at runtime

`%2SVER ?` (software version), `%2INNM ?` (input name), `%2IRES ?` (input
resolution), `%2RLST ?` (recommended resolution), `%2FILT ?` (filter usage),
`%2RLMP ?` / `%2RFIL ?` (lamp/filter replacement model numbers),
`%2SNUM ?` (serial number), `%2LKUP` (status notification, UDP).

The driver issues `%1CLSS ?` on connect and only enables the Class 2 group when
the projector reports class 2. **The PT-DZ13K's PJLink class was not
confirmable from the sources available** — this runtime probe is the correct
way to resolve that regardless, and the resolved class is persisted per device.

### 3.4 Error responses

| Response | Meaning | Mapped outcome |
|---|---|---|
| `ERR1` | undefined command | `UNSUPPORTED` (recorded, not retried) |
| `ERR2` | out-of-parameter | `REJECTED` |
| `ERR3` | unavailable time (busy) | `BUSY` (retryable for queries) |
| `ERR4` | projector failure | `DEVICE_FAULT` |
| `PJLINK ERRA` | authentication failure | `AUTH_FAILED` |

---

## 4. What can actually be controlled remotely

The honest answer, split by confidence. This is the list the product is built
around.

### Confirmed controllable (documented for this model family)

- Power on / power off, with state confirmation via polling
- Shutter open / close, with state confirmation
- Input selection across RGB1, RGB2, VIDEO, DVI-D, HDMI, SDI1, SDI2
- Lens calibration and lens home position
- Lamp runtime per lamp (4 lamps)
- Lamp control status, lamp on/off status, shutter status, input signal status

### Confirmed readable via PJLink (standard, cross-checks the above)

- Power state including the warm-up and cooling transitions
- Error status across fan / lamp / temperature / cover / filter / other
- Lamp hours and per-lamp on-off state
- Manufacturer, model, projector name, available input list

### Behind the unverified gate (documented for siblings, not confirmed here)

- Lens shift H/V, focus, zoom as jog movements
- Brightness, contrast, colour, tint, sharpness, aspect, freeze, OSD
- Remote-key emulation parameters

### Not implemented (could not be confirmed to exist)

- Lens memory save/recall
- Serial number over the Panasonic protocol (PJLink Class 2 `%2SNUM` is used if
  the projector reports class 2)
- Discrete temperature and fan *readings*. PJLink `%1ERST` gives
  ok/warning/error per subsystem, which is what the monitoring uses. Numeric
  intake/exhaust temperatures are **not** exposed as telemetry because no
  documented query for them could be confirmed; the UI shows the `%1ERST`
  severity and explicitly marks numeric temperature as unavailable rather than
  inventing a number.

---

## 5. Sources

- Panasonic, *Control Commands, Model No. PT-DZ13K series / PT-DS12K series /
  PT-DW11K series / PT-DZ10K series* (2015-01)
- Panasonic, *Control Commands, Model No. PT-DZ870 series / PT-DW830 series*
- Panasonic, *Control Commands, Model No. PT-DZ780 series / PT-DW750 series*
  (2015-04)
- Panasonic, *LAN Control Protocol* and *Sample of communications content of
  control commands via LAN*
- Panasonic PT-DZ13K product specification sheet
- JBMIA, *PJLink Specification* Class 1 and Class 2
- Panasonic PT-DZ13KE / PT-DZ21KU operating instructions, "Control commands via
  LAN" sections

Direct PDF retrieval was blocked by network egress policy in the build
environment; the above were consulted through indexed excerpts. **Re-read the
PT-DZ13K control-command PDF against `docs/HARDWARE-VALIDATION.md` before
trusting any `INFERRED_FAMILY` entry.**
