# Hardware validation procedure

**No command in this platform has been tested against a physical PT-DZ13K.**
Everything was developed and tested against the simulator in
`backend/simulator/`, which implements the protocol as documented — which
means it validates the *controller*, not the *documentation*.

This document is the procedure that turns documented commands into verified
ones. Work through it once, with a projector you can afford to have
misbehave, before you hang anything on a building. Stages 1–7 cover the
projectors; stages 8–12 cover everything else that has only run against
simulators so far: the Mac server, the mini PCs, the projected output,
the cameras and the phone remote.

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
standby, and record the **exact raw response** for each. Send each one as a
command through the API, `POST /api/projectors/{id}/command` with the body
shown (the interactive API page is at `/api/docs`): the raw reply comes back
in `raw_response` and is kept on the projector's **Command log** tab. "Poll
now" reads the same values into the status panel but does not log the raw
replies.

| Command | Body to send | What to record |
|---|---|---|
| `QPW` | `{"capability":"power.get"}` (**Test connection** also shows this reply) | Expected `00000` in standby, `00001` on (the parser also accepts `00QPW:000`) |
| `QSH` | `{"capability":"shutter.get"}` | `000` open or `001` closed |
| `QIN` | `{"capability":"input.get"}` | The input code after the ID, e.g. `00DVI` |
| `Q$L:1`…`Q$L:4` (DZ13K) / `Q$L:1`–`Q$L:2` (DZ770) | `{"capability":"lamp.hours"}`. The log keeps the last lamp's reply; each lamp's is under `value[].raw` in the response | **The exact format of the number** |
| `Q$S` | `{"capability":"lamp.status"}` | The raw value |
| `QLS` | `{"capability":"lamp.on_off"}` | The raw value |

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

## Stage 7 — Temperatures and fan condition

The Panasonic driver reads temperatures with `QTM` and fan, lamp,
temperature, cover and filter condition with PJLink `%1ERST` on port 4352
(see PROTOCOL-RESEARCH.md §2.7). Neither has been checked on a real unit yet.

1. Make sure PJLink is on in the projector's NETWORK menu.
2. Open the projector's page in the app, press **Poll now**, and look at
   **Condition**.
3. Compare each temperature with the projector's own status page (web
   control → Projector status, or the on-screen STATUS menu). They should
   match to the degree.
4. If a sensor says "not understood", note the raw reply it shows: the
   reply format needs adjusting in `parse_temperature`.
5. If Fans shows a note instead of OK, read it: PJLink is off, or the
   projector has its own PJLink password (fill in **PJLink password** under
   Edit).

---

## Stage 8 — The Mac server

The Mac app was installed and opened on a real Mac on 2026-10-17. Nothing
below has been tried there yet. Do this before the server runs a show. In
the commands, the data folder is `~/Library/Application Support/ProjectorControl`.

1. **The service is loaded.** In Terminal:
   ```bash
   sudo launchctl print system/com.projectorcontrol.server | grep -E "state =|pid ="
   ```
   Expected: `state = running` and a pid.
2. **Start at boot, nobody signed in.** Restart the Mac and leave it at the
   sign-in screen. From another computer open `http://YOUR-MAC.local:8765`
   (Local hostname: System Settings → General → Sharing). Expected: the
   sign-in page within about two minutes. With FileVault on, the Mac stops
   before this point until someone types the password (MAC-SERVER.md).
3. **Restarts if it stops.** Stop the server on purpose:
   ```bash
   pkill -f "Projector Control.app/Contents/MacOS/ProjectorControl"
   ```
   then, after 15 seconds:
   ```bash
   curl -s http://localhost:8765/api/health
   ```
   Expected: an answer with `"version"` in it.
4. **Keeps the Mac awake.**
   ```bash
   pmset -g assertions | grep -i caffeinate
   ```
   Expected: a line naming caffeinate. Leave the Mac idle for longer than its
   sleep setting and confirm the dashboard still answers from another computer.
5. **Power cut.** With **Start up automatically after a power failure** on
   (System Settings → Energy), pull the plug, wait, plug it back in. Expected:
   the dashboard answers again without anyone touching the Mac.
6. **Reaches the projector network.** Register a projector and press **Test
   connection** (stage 1). If it says *No TCP connection* while
   `nc -vz <projector-ip> 1024` works in Terminal, macOS is blocking the
   service: turn ProjectorControl on under System Settings → Privacy &
   Security → Local Network, and record that it was needed.
7. **Update by hand from Settings.** After a change is merged on GitHub (the
   Mac app workflow takes about ten minutes to publish it): Settings → App
   updates → **Check now** → **Install**. Expected: the page comes back by
   itself in about a minute showing the new version, and
   ```bash
   cat ~/Library/Application\ Support/ProjectorControl/updates/last-result.txt
   ```
   says `installed 1.0.<number>`. If the panel says *Operation not
   permitted*, allow ProjectorControl under System Settings → Privacy &
   Security → App Management and try again; record that it was needed.
8. **Automatic update, and that it waits for a show.** Leave **Install
   updates by themselves** on. Play a mapping show, then merge a change.
   Expected: within 15 minutes the panel says *Waiting to install: a mapping
   show is playing*, and nothing restarts. Stop the show and leave the
   projectors alone. Expected: within about 25 minutes the version changes.
   The log shows each decision:
   ```bash
   grep "update:" ~/Library/Application\ Support/ProjectorControl/logs/projector-control.log
   ```

A rolled-back update cannot be tested without a deliberately broken
release; do not try it on the show server.

---

## Stage 9 — Mini PCs (players)

On each Windows mini PC, with the projector as its only or main display:

1. **Install and pair** (minipc/README.md). Expected: the projector shows a
   six-letter code, the code appears on Mapping → **Players**, and
   **Approve** with an output makes the projector show that output. If no
   code ever appears on the Players tab, the mini PC did not find the
   server: check that Windows did not block the Mini PC app in its firewall,
   or give it the address with `--server http://<mac>:8765`.
2. **Truly full screen.** Expected: the projected image shows no tabs,
   address bar, window frame, taskbar or mouse pointer, edge to edge.
   Press H: the status overlay must not warn that the window and the
   output's resolution differ. Record the display resolution Windows uses.
3. **Comes back by itself.** Restart the mini PC (and once, cut its power).
   Expected: Windows signs in without a password and the output returns
   without anyone touching it.
4. **Media cache.** Upload the real show media and open the Players tab.
   Expected: each player shows `cache on` (not `syncing` or `off`) before
   the show. Then
   unplug the mini PC's network cable for ten seconds during playback:
   cached media keeps playing.
5. **Sync.** With two players side by side, play content with motion across
   the seam. Record the clock drift the Players tab shows and whether the
   seam visibly tears.
6. **Identify and Remove.** **Identify** flashes the right projector;
   **Remove** sends it back to a pairing code.

---

## Stage 10 — Projected output on the building

1. **Test pattern.** Turn on the canvas grid on every output. Drag corner
   pins and mesh points until the grids meet across projectors. Record how
   close they got.
2. **Edge blend.** Set blends on the overlaps with a white pattern. Expected:
   no brighter band where two projectors overlap. Record the blend widths.
3. **Masks.** Mask a window. Expected: it stays black, with feathered edges.
4. **Blackout.** Press blackout on Mapping → Remote and on the phone remote.
   Expected: every output goes black at once.

---

## Stage 11 — Cameras

1. **Detection.** Plug the camera into the mini PC (or start
   `camera-agent/agent.py` by hand). Expected: it appears on the Players tab
   (with its mini PC), its row names the camera and says `depth` for a
   RealSense, Orbbec or OAK. Record the model.
2. **Calibration** (camera-agent/README.md, Calibrating), at night: each
   projector shows its patterns for about half a minute. Expected: after
   **Correct**, the canvas grid lands straight on the building. Record how
   far off it is before and after **Map by hand**.
3. **People.** Walk in front of the building with a *Spotlight* cue live.
   Expected: the light follows you, nothing lights where nobody is, and two
   people get two lights. Then **Re-learn empty scene** with the area clear.
4. **Tracking delay.** On the Players tab, record the camera's `updates/s`
   (about 30 is expected on a depth camera) and each player's
   `camera to here`. Film yourself walking with a phone at 240 fps if it has
   it, and count the frames between your movement and the light's; that
   includes the camera's exposure and USB (about 30–50 ms) and the
   projector's input lag, which the software cannot measure.

---

## Stage 12 — The phone remote

1. **On the venue Wi-Fi.** Open **Phone remote** in the dashboard, scan the QR
   code, **Share → Add to Home Screen**, open it from the Home Screen and
   sign in. Expected: it opens full screen with its own icon.
2. **The buttons.** GO, pause, stop and blackout act on the show within a
   moment. Projector power asks first, and the list shows what each
   projector reports afterwards.
3. **From anywhere.** With Tailscale on the Mac and the phone, switch the
   phone to mobile data. Expected: the remote still works.
4. **Wake-up.** Lock the phone for a few minutes, change the cue from the
   dashboard, unlock. Expected: the remote shows the new cue at once, or says
   it cannot reach the server; never the old state as if it were live.

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
| 8 | Service loaded, start at boot | | | time to dashboard: ___ |
| 8 | Restart after stop, awake, power cut | | | |
| 8 | Reaches projectors | | | Local Network permission needed? |
| 8 | Update from Settings | | | App Management needed? |
| 8 | Automatic update waits for show | | | |
| 9 | Pairing, full screen, reboot | | | resolution: ___ |
| 9 | Media cache, sync | | | drift: ___ ms |
| 10 | Grid alignment, blend, masks, blackout | | | |
| 11 | Camera detected, calibration | | | model: ___ |
| 11 | People, tracking delay | | | ___ updates/s, ___ ms |
| 12 | Phone remote: Wi-Fi, mobile data, wake | | | |

---

## After validation

1. Promote verified commands to `Provenance.HARDWARE_VERIFIED` in the driver.
2. Correct `docs/PROTOCOL-RESEARCH.md` wherever reality differed.
3. Fix any response parser that reported `unparsed`.
4. Re-run the test suite: `cd backend && .venv/bin/python -m pytest`.
5. Add a note here recording the firmware version you tested against —
   behaviour can change between firmware releases.
