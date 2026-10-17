# Camera agent

A small program for a camera pointed at the building. It does two jobs for
the mapping system:

- **Calibration.** Each projector in turn shows black, white and a series of
  stripe patterns. The camera reads which projector pixel lands where on the
  building, and the server turns that into each output's corner pin and mesh
  warp. Aligning a projector goes from dragging corners by eye to pressing
  one button, and again whenever a projector gets bumped.
- **People tracking** (depth cameras only). It learns what the empty scene
  looks like in depth, then reports anyone in front of the building several
  times a second. Cues can react to them: a spotlight that follows each
  person, or ripples spreading from them.

It pairs with the server exactly like a player: it prints a six-letter code,
you approve it on the Mapping page, and from then on it starts by itself.

## Hardware

The agent finds the camera by itself: the first depth camera it has an SDK
for, otherwise the first webcam that sends pictures.

| Camera | Calibration | People | SDK |
|---|---|---|---|
| Intel RealSense D400 series (D415, D435, D455, D405…), L515, SR305 | yes | yes | `pyrealsense2` |
| Orbbec Femto Bolt / Mega, Gemini 2 and 330 series, Astra 2 | yes | yes | `pyorbbecsdk2` |
| Luxonis OAK-D, OAK-D Lite, OAK-D Pro, OAK-D S2, PoE models | yes | yes | `depthai` 2.x |
| Any USB webcam, or any camera the computer lists as one | yes | no | none |

A depth camera without its SDK installed usually still shows up as a
webcam, so it can calibrate. Not supported for people: Microsoft Azure
Kinect (discontinued; the Orbbec Femto Bolt replaces it), Kinect v1/v2 and
Stereolabs ZED (they need their own drivers and, for the ZED, an NVIDIA
graphics card).

Honest status: every driver above is written against its maker's SDK and
loads on Windows and Linux, but only the simulated camera (`--camera sim`)
and synthetic pictures have been run end to end so far. The first real
camera of each kind is still to be tried.

Calibration works from much further away than depth does, so one camera
across the street can calibrate the whole façade. For people tracking the
camera has to be within depth range of where people stand (about 0.4 to
9 m, depending on the model).

Use a camera you can fix in place. If it moves after calibrating, run the
patterns again.

## Where to run it

On a Windows mini PC beside a projector, nothing to do: the
[Mini PC app](../minipc/README.md) runs this program by itself whenever a
camera is plugged in, already paired with that mini PC. Run it by hand only
on another computer on the show network, such as the main server.

The Mini PC app has every SDK built in. By hand, install the ones you need
(next section). RealSense and Orbbec have no official macOS packages and
often need `sudo` there; for a depth camera, a Windows or Linux mini PC is
the easier home. A webcam works everywhere.

## Install

Python 3.10 or newer.

```bash
cd camera-agent
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
# Depth cameras, only the ones you have (Windows/Linux):
.venv/bin/pip install pyrealsense2            # Intel RealSense
.venv/bin/pip install pyorbbecsdk2            # Orbbec
.venv/bin/pip install "depthai>=2.28,<3"      # Luxonis OAK
```

## Run

```bash
.venv/bin/python agent.py --server http://<main-server>:8765 --name "Front camera"
```

It prints a pairing code. In the app, open **Mapping → Players**, approve
that code, and the camera shows up on **Mapping → Camera**.

Useful options:

| Option | Default | |
|---|---|---|
| `--camera` | `auto` | `realsense`, `orbbec`, `oak`, `webcam` (the first that works), `webcam:0`, `webcam:1`…, or `sim` (a made-up building with two projectors, no hardware needed) |
| `--min-stripe` | `4` | Finest stripe, in projector pixels. Raise it (8, 16) when the camera is far away |
| `--settle` | `0.5` | Seconds between showing a pattern and photographing it. Raise it on a slow network |
| `--grid` | `64` | Calibration cells across the photo |
| `--no-tracking` | | Calibration only |

## Calibrating

**Mapping → Camera** walks through four steps:

1. **Camera.** Point it at the building so it sees every projector's
   picture, and fix it in place. *Take photo* or *Live view* (a new photo
   about every second) to aim it.
2. **Patterns.** *Calibrate all projectors*: each projector in turn shows
   black, white and stripe patterns for about half a minute while every
   other projector goes black, and the photo shows the stripes as the
   camera sees them. Keep the camera still and people out of the beam.
3. **Correct.** When the last projector is done, the picture is placed in
   the largest area the projectors light (keeping its shape), each
   projector is given the part of the picture its light covers, and every
   projector's corner pin and mesh are set so the picture lands there,
   straight. Masks, blends and colour are not touched.
4. **Map by hand.** The picture's outline and a grid of points (corners
   only, 3 × 3, 5 × 5 or 7 × 7) sit on the photo. Drag them onto the
   building: the corners where the picture's corners belong, the others
   onto the features it should follow. Each time you let go, the projectors
   follow. *Show grid on projectors* and *Live view* show the result on the
   building.

Calibrate at night or in low light: the stripes have to be clearly brighter
than the wall around them.

## People

With a depth camera, the agent learns the empty scene when it starts. If the
scene changes (a stage is built, cars park), clear the area and press
**Re-learn empty scene**. Pick an effect per cue in the editor under
**Cues → People**: *Spotlight* lights the content only around people,
*Ripple* bends it in rings spreading from them.

People positions are relayed live and never stored.

## Starting it with the computer

Linux, as a systemd service (`/etc/systemd/system/camera-agent.service`):

```ini
[Unit]
Description=Mapping camera agent
After=network-online.target

[Service]
WorkingDirectory=/opt/projectionmapping/camera-agent
ExecStart=/opt/projectionmapping/camera-agent/.venv/bin/python agent.py --server http://<main-server>:8765
Restart=always

[Install]
WantedBy=multi-user.target
```

Windows: a shortcut to the same command in the Startup folder.

The pairing identity is kept in `~/.mapping-camera.json`; delete it to pair
the computer as a new camera.

## Tests

```bash
.venv/bin/pip install pytest
.venv/bin/python -m pytest -q tests
```

They decode synthetic photos of the stripe patterns, track synthetic depth
scenes, check how cameras are found, and run a whole calibration through the
simulated camera; no camera needed.
