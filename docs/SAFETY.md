# Safety and scope

Read this before relying on the platform for anything that matters.

---

## This software is not a safety device

It monitors, it alerts, and it can run automation. It is a convenience layer
over equipment that must be safe without it.

**Thermal protection and interlocks must be implemented in hardware and must
work when this software is not running.** That means a mechanical thermostat
or thermal cut-out in the enclosure, wired independently of any controller,
network, broker or web application. Every part of this system — the server,
the network, the database, Home Assistant, the broker — can fail at once, and
when that happens the enclosure must still protect the projector.

The enclosure features in this platform are for **visibility and
convenience**: showing you the temperature trend, warning you before it
becomes a problem, and refusing to start a show into known-bad conditions.
They are not the thing that stops your projector cooking.

---

## "Emergency Blackout" is not an emergency stop

The blackout scene closes projector shutters and can trigger compatible
external blanking. It is operationally useful and it is not a certified
emergency safety mechanism.

- It depends on the network, the server and each projector responding.
- It takes as long as the slowest projector takes to answer.
- It can partially fail, and will tell you so per projector.
- The lamps stay on. The light is blocked, not extinguished.

If your installation needs a guaranteed kill — for eye safety, for a road
closure, for anything a regulator cares about — that is a physical,
hard-wired circuit, not an HTTP request.

---

## The Emergency stop button

The red **Emergency stop** button sits in the top bar of every page and at
the top of the phone remote. Hold it down for one second (a tap does
nothing, so a brush of the hand cannot fire it). It then, in this order:

1. stops the show and turns every mini PC output black at once. Nothing is
   drawn while it is on, not even a test pattern or a camera calibration
   frame. A mini PC that is not connected goes black as soon as it connects;
2. stops any automation that is running, and holds scheduled ones (they are
   logged as "held" and do not run late afterwards);
3. sends every enabled projector shutter close (when it is on) and power
   off, ahead of anything else waiting for it. A projector busy warming up
   is turned off by itself as soon as it accepts; one already off or
   cooling is left alone, and a power on that was waiting for it is
   cancelled.

Each projector's answer is shown on its own line. It stays on, through a
server restart too, until someone presses **Clear** in the red bar. While
it is on, GO, Resume, automations and camera calibration are refused.
Clearing it turns nothing back on.

The same limits as the blackout apply: it depends on the network, the
server and each projector answering, and it can partly fail (and says
which projector did). It is not a hard-wired emergency stop.

---

## Concurrent dispatch is not synchronisation

When you command a group, the commands leave the server within a few
milliseconds of each other. That is all the platform claims, which is why the
API field is `dispatched_at` and not `executed_at`.

What happens next is outside its control: each projector processes the
command on its own schedule, and a power-on takes tens of seconds of warm-up
that varies between units and with lamp temperature.

**For projection mapping, frame-accurate synchronisation is a property of the
media server driving the projectors** — genlock, framelock, or whatever your
playback system provides. It is not something a control protocol over TCP can
give you. This platform controls projector hardware; it does not synchronise
content, and the two should not be confused.

---

## Commands that are deliberately withheld

The platform refuses to send commands it is not confident about, rather than
trying them and seeing.

Commands documented only for sibling Panasonic models — lens axis movement,
image adjustments, remote-key emulation — are gated off by default. The
reasoning for lens movement in particular: the axis encoding comes from the
PT-DZ780 specification, no explicit stop command could be confirmed for the
DZ13K, and a mis-encoded lens command sent to a projector mounted on a
building is not a risk worth taking on an inference.

You can enable them per projector after checking them against your own
manual. [HARDWARE-VALIDATION.md](HARDWARE-VALIDATION.md) stage 6 is the
procedure.

---

## What the platform will not do on its own

- **It will not retry a power command after a timeout.** If the projector's
  state is unknown, re-sending risks acting twice. It resolves the state with
  a query instead and tells you what it found.
- **It will not treat an acknowledgement as a success.** Power, shutter and
  input changes are confirmed by reading the state back. An unconfirmed
  change raises an alert rather than being reported as done.
- **It will not treat missing data as good news.** A scheduled startup with
  `check_enclosure` and `require_fresh` set will refuse to run when sensor
  data is stale, because "the sensor has not reported in an hour" is not
  evidence that conditions are safe.
- **It will not show you a number the projector did not give it.** Missing
  telemetry renders as `—` or `n/a` with a reason, never as zero.

---

## Operational advice

**Before a show**, run the startup automation with enough margin to deal with
a projector that does not come up. Warm-up is ~30 s per unit, and the
`wait_state` step will tell you which one failed rather than leaving you to
find out when the content starts.

**During a show**, keep Projectors → Control several open. It shows per-projector state
live, and a projector that drops is visible immediately rather than at the
next glance at the building.

**After a show**, let the cool-down complete before cutting power to the
enclosure. The shutdown automation's `wait_state` step waits for standby
specifically so that enclosure ventilation can be kept running until the
projector has finished cooling. Cutting power to a hot projector shortens
lamp life and can damage it.

**Lamp hours** come from the projector's own counter and are authoritative.
The "estimated operating hours" chart is derived from polling samples and is
an estimate — it says so on the chart. Use the counter for maintenance
decisions.
