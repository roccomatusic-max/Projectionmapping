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

| Camera | Calibration | People |
|---|---|---|
| Intel RealSense D435 / D455 | yes (colour sensor) | yes, about 0.4 to 9 m |
| Any USB webcam | yes | no |

Calibration works from much further away than depth does, so one camera
across the street can calibrate the whole façade. For people tracking the
camera has to be within depth range of where people stand.

Use a camera you can fix in place. If it moves after the canvas corners are
marked on its photo, mark them again.

## Where to run it

On any computer on the show network with the camera plugged in: the main
server, or one of the mini PCs beside a projector.

The RealSense SDK installs with `pip install pyrealsense2` on Windows and
Linux. On macOS there is no official package, and RealSense cameras often
need the program run with `sudo`; if the camera is a RealSense, a Windows or
Linux mini PC is the easier home for it. A webcam works everywhere.

## Install

Python 3.10 or newer.

```bash
cd camera-agent
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/pip install pyrealsense2      # RealSense only, Windows/Linux
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
| `--camera` | `auto` | `realsense`, or `webcam:0`, `webcam:1`… `auto` uses a RealSense when one is plugged in |
| `--min-stripe` | `4` | Finest stripe, in projector pixels. Raise it (8, 16) when the camera is far away |
| `--settle` | `0.5` | Seconds between showing a pattern and photographing it. Raise it on a slow network |
| `--grid` | `64` | Calibration cells across the photo |
| `--no-tracking` | | Calibration only |

## Calibrating

On **Mapping → Camera**:

1. **Take photo.** Make sure the projectors are on with shutters open.
2. Drag the four corners onto where the canvas corners are on the building.
   The canvas is the flat image the content was made for, so its corners are
   usually the corners of the façade or of the area being mapped.
3. **Calibrate** each output. Its projector shows stripes for about half a
   minute while every other projector in the show goes black. Keep the
   camera still and people out of the beam.
4. **Apply to outputs** sets each calibrated output's corner pin and mesh.
   Masks, blends and colour are not touched. Check the grid test pattern and
   fine-tune by hand if needed.

Calibrate at night or in low light: the stripes have to be clearly brighter
than the wall around them.

## People

With a RealSense, the agent learns the empty scene when it starts. If the
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

They decode synthetic photos of the stripe patterns and track synthetic
depth scenes; no camera needed.
