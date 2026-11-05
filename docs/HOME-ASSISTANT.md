# Home Assistant

Control the projectors and the show from Home Assistant: its dashboard, its
phone app, voice assistants and automations ("at sunset, turn the projectors
on and press GO").

It talks to your Projector Control server over your own network. No cloud
account, no GitHub token, nothing to sign up for.

---

## Set it up (about five minutes)

You need Home Assistant on the same network as the Projector Control server
(the Mac or Windows server app, which is already open to your network).

**1. Open Home Assistant's Terminal.** In Home Assistant go to
**Settings → Add-ons → Add-on store**, search **Terminal & SSH**, press
**Install**, then **Start**, then **Open Web UI**. If you already have it,
just open it.

**2. Paste the install line.** In Projector Control go to
**Settings → Home Assistant**, press **Make install line**, then **Copy**.
Paste it into Home Assistant's Terminal and press Enter. It looks like this
(yours has your server's address and its own code):

```
curl -fsSL http://192.168.1.50:8765/api/integration/homeassistant/install/ABCD234XYZ | sh
```

Home Assistant restarts by itself. The page goes blank for about a minute.

**3. Add it.** In Home Assistant go to **Settings → Devices & services →
Add integration**, search **Projector Control**, and press **Submit**. The
address is already filled in.

That's it. Back in Projector Control, Settings → Home Assistant now says
**Connected**.

The install line works once, for an hour. If it has run out, press **Make
install line** again.

---

## What you get

A **Projector Control** device for the show:

| In Home Assistant | What it does |
|---|---|
| **GO** button | The next cue. The first cue if the show was stopped or another show was playing. |
| **Pause**, **Resume**, **Stop**, **Blackout** buttons | The same as on Run the show. |
| **Show** list | Which show GO plays. Picking one starts nothing by itself. |
| **Jump to cue** list | Goes straight to that cue. |
| **Emergency stop** button | The same as the red button: stops the show, blacks every mini PC and turns every projector off. No hold needed here, so an automation can press it. |
| **Clear emergency stop** button | Lifts the hold. Turns nothing back on. |
| **Emergency stop on** | On while the emergency stop is on. |
| **Show status** | Playing, Paused, Stopped, Blackout or Emergency stop. |
| **Show playing**, **Cue** | Names, for a dashboard. |
| **Open alerts**, **Mini PCs online** | Counts. |
| Scenes | Every projector scene from the Automation page, as a Home Assistant scene. |

And one device for each projector:

| In Home Assistant | What it does |
|---|---|
| **Power** switch | On and off. Turning it on while it cools down is fine: it turns on by itself when it can. |
| **Shutter open** switch | Off closes the shutter (picture hidden, projector stays on). |
| **Input** list | When the projector says which inputs it has. |
| **Power state** | On, Off (standby), Warming up or Cooling down. |
| **Connected** | Whether the projector answers. |
| **Problem** | On when the projector reports a warning or a fault. |
| Temperatures | Each sensor the projector reports, as soon as it reports it. Shown in °F if that is your unit. |
| **Fans**, **Temperature condition**, **Light source hours** | When the projector reports them. |

Nothing is shown that the projector does not actually report: a projector
without temperature sensors gets no temperature entities.

Every command from Home Assistant shows in Projector Control's logs as
coming from Home Assistant. If a command fails, Home Assistant shows
Projector Control's own explanation.

### Examples

A button on a dashboard that asks before stopping everything: add a
**Button** card for **Emergency stop**, then under **Tap action** turn on
**Require confirmation**.

Projectors on at sunset, show at 6, off at 11:

```yaml
automation:
  - alias: "Projectors on at sunset"
    triggers:
      - trigger: sun
        event: sunset
    actions:
      - action: switch.turn_on
        target:
          entity_id: [switch.house_left_power, switch.garage_power]

  - alias: "Halloween show at 6"
    triggers:
      - trigger: time
        at: "18:00:00"
    actions:
      - action: select.select_option
        target: { entity_id: select.projector_control_show }
        data: { option: "Halloween" }
      - action: button.press
        target: { entity_id: button.projector_control_go }

  - alias: "Everything off at 11"
    triggers:
      - trigger: time
        at: "23:00:00"
    actions:
      - action: button.press
        target: { entity_id: button.projector_control_stop }
      - action: switch.turn_off
        target:
          entity_id: [switch.house_left_power, switch.garage_power]
```

(Your entity names follow your projector and show names.)

---

## Updates

The integration comes from your Projector Control server, so it always
matches it. When the server is updated and has a newer integration, Home
Assistant shows an update under **Settings → Updates** ("Projector Control
integration"). **Install** downloads it from your server and restarts Home
Assistant (about a minute).

---

## If something goes wrong

**The install line says "this is not Home Assistant's Terminal".** Paste it
in the Terminal & SSH add-on's window (step 1), not on your Mac or PC.

**The install line says Home Assistant could not reach the server.** Check
the Projector Control server is on, and open its address (the part before
`/api` in the line) from a phone on the same Wi-Fi. If that fails too, see
TROUBLESHOOTING.md.

**"The install line's code was already used or is more than an hour old."**
The form then asks for a key instead: in Projector Control press **Make a
key** under Settings → Home Assistant → Other ways in, copy the address and
the key into the form, and press Submit.

**Home Assistant says "Projector Control needs a new key".** Someone pressed
**Disconnect Home Assistant** or **Make a key** in Projector Control. Make a
key there and paste it into Home Assistant's form.

**The server moved to a new address.** Home Assistant → Settings → Devices &
services → Projector Control → ⋮ → **Reconfigure**, and type the new address.

**Disconnect it.** Projector Control → Settings → Home Assistant →
**Disconnect Home Assistant**. Its key stops working at once. Then remove
the integration in Home Assistant (Settings → Devices & services →
Projector Control → ⋮ → Delete).

---

## Without the Terminal add-on

**HACS:** HACS → ⋮ → **Custom repositories**, add
`https://github.com/roccomatusic-max/Projectionmapping` as type
**Integration**, then download **Projector Control** and restart. Then
Add integration as in step 3; the form asks for the server address and a key
(Projector Control → Settings → Home Assistant → **Make a key**). HACS gets
the copy in the repository rather than your server's; the update in
Settings → Updates still matches it to your server.

**Home Assistant in Docker:** run the install line inside the container
(`docker exec -it homeassistant sh`, then paste it), then restart the
container.

---

## For developers

- The integration is `custom_components/projector_control/` (domain
  `projector_control`). The server ships it: the desktop builds bundle it as
  `homeassistant/projector_control` (desktop/projector-control.spec), the
  Docker image copies it to the same place, and `app/paths.py` finds either.
  `--check` fails a build that lacks it.
- **Bump `version` in its manifest.json whenever the integration changes**;
  that is what Home Assistant's update compares.
- Server side: `backend/app/api/routes/integration.py` (the
  `/api/integration/homeassistant/...` endpoints) and
  `backend/app/services/homeassistant.py` (account, pairing code, package,
  install script).
- Sign-in: Home Assistant acts as the operator account `home-assistant`. Its
  key is a ten-year token for that account; making a new key re-creates the
  account, which retires the old key, and Disconnect deletes it. The install
  line carries a one-time pairing code (an hour, ten wrong guesses per
  address per five minutes), never the key.
- One feed, `GET /api/integration/homeassistant/state`, polled every five
  seconds and right after every command. Commands go through the ordinary
  endpoints with `confirm: true` and `X-Client: homeassistant`.
- Tests: `backend/tests/test_homeassistant.py` (server), and `ha-tests/`
  (the integration inside Home Assistant's own test harness, against a real
  server and the projector simulators; see ha-tests/conftest.py). CI runs
  both.
- The older REST and MQTT options in [INTEGRATIONS.md](INTEGRATIONS.md)
  still work.
