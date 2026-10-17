# Mapping Media System

The projector platform manages hardware. This module covers the other half
of a projection-mapping show: the media itself, and how it is shaped onto the
building. It runs inside the same server and the same UI, so one application
powers the projectors up, opens the shutters, and plays the show.

This document is the design. Sections marked **(phase 1)** are built; the
rest is the plan.

---

## 1. Model

```
Media library ──► Cue list ──► Show canvas (e.g. 7680 × 2160)
                                   │
                ┌──────────────────┼──────────────────┐
                ▼                  ▼                  ▼
          Output "Left"      Output "Centre"     Output "Right"
          source rect        source rect         source rect
          warp · masks       warp · masks        warp · masks
          edge blend         edge blend          edge blend
          colour             colour              colour
                │                  │                  │
          display 2 ──► PT-DZ13K  display 3 ──►     display 4 ──►
```

**Show.** One piece of work: a named content canvas with a resolution. The
canvas is the flat image of the whole building; content is authored to it.

**Media asset.** A video or still uploaded to the server. Stored as a file in
the media folder, never in the database.

**Cue.** One step of the show: which asset plays on the canvas, how it fits
(fill, fit, stretch), whether it loops, and the crossfade into it. A show is
an ordered cue list driven by GO.

**Output.** One projector's image. It takes a rectangle of the canvas (its
*source rect*), and turns it into what that projector must emit:

| Stage | What it does |
|---|---|
| Source rect | The slice of the canvas this projector covers. Overlapping slices are what edge blending feathers. New outputs are laid out side by side (the canvas is re-split evenly while nobody has placed the outputs by hand); in the editor each slice is a numbered box that can be dragged and resized, with edges snapping to the canvas and to neighbours. |
| Corner pin | Four corners dragged onto the building. A homography, so straight lines stay straight. **(phase 1)** |
| Mesh warp | A grid of control points on top of the corner pin, for curved or uneven surfaces. Interpolated with Catmull-Rom so the surface stays smooth between points. **(phase 1)** |
| Masks | Polygons in output space that black out windows, trees, a neighbour's wall. Feathered edges, optional invert. **(phase 1)** |
| Edge blend | Per-edge ramp width, curve and gamma, so two overlapping projectors add up to one even brightness. **(phase 1)** |
| Colour | Brightness, gamma and per-channel gain, to match a warm projector to a cool one. **(phase 1)** |
| Test pattern | Canvas grid, output ID and crosshair, solid colours. The canvas grid is drawn in canvas space, so it lines up across projectors: aligning is making the grids meet. **(phase 1)** |

An output may be linked to a registered projector, so the editor can show its
power and shutter state and the show can refuse to start into a projector
that is off.

## 2. Rendering

Each output is a browser window, full-screen on the display that feeds its
projector: on a player beside the projector (section 5), or a window opened
from the editor on a computer with several display outputs. It renders with WebGL2:

1. The current cue's media (a `<video>` or image) is uploaded as a texture
   every frame. During a crossfade the outgoing cue is a second texture.
2. A dense triangle mesh (32 × 32 cells plus the control grid) is built on
   the CPU: each vertex is the corner-pin homography applied to the mesh-warp
   position, carrying its coordinate inside the source rect. Dense
   tessellation is what keeps texture mapping perspective-correct under a
   homography without per-pixel division artefacts.
3. The fragment shader maps that coordinate into the canvas, then into the
   media according to the cue's fit, applies the blend ramps, the mask
   texture, colour and the test pattern.
4. Masks are rasterised into an alpha texture with the 2D canvas API (blur
   filter for feather) whenever they change, not per frame.

Editing is live. The editor and the output window exchange changes through a
`BroadcastChannel` while a handle is being dragged, so the projector image
follows the mouse with no server round-trip, and the change is saved to the
server a moment later. Output windows on another computer pick the saved
change up over the WebSocket feed.

### Placing windows on displays

Chrome and Edge expose the Window Management API: the editor lists the
connected displays by name and opens each output full-screen on the chosen
one. Other browsers open the window and the operator drags it across and
clicks once in it (or presses F) to fill the display. macOS: set the projector displays to *not* mirror,
and turn off "Displays have separate Spaces" if a full-screen window refuses
to stay on its display.

## 3. Playback and sync — what this does and does not promise

The server owns the transport: which cue is live, when it started (server
clock), playing or paused. Every output window estimates its offset to the
server clock (NTP-style, several samples, keeps the best round trip) and
computes where its video should be. Small drift is corrected by nudging
`playbackRate` by a few percent; drift over 150 ms is corrected by seeking.

That keeps outputs **on one computer** within a frame or two of each other in
practice, which is enough for most architectural content. It is not
frame-locked, and on several computers it is limited by network jitter.
Content where a seam crosses fast motion needs either one computer driving
all outputs or genlocked hardware. The UI says "synchronised to the server
clock", never "frame-accurate".

Codec guidance for a Mac: H.264 or HEVC at the canvas resolution, constant
frame rate, no B-frame-heavy profiles for content that must loop cleanly.
ProRes and HAP do not decode in Chrome.

## 4. API

All under `/api/mapping`. Viewers read and may open output windows; operators
run the transport; admins edit shows, outputs, cues and the media library,
matching how projector configuration is gated.

| Method | Path | |
|---|---|---|
| GET/POST | `/media` | List, upload (multipart, streamed to disk) |
| GET/PATCH/DELETE | `/media/{id}` | |
| GET | `/media/{id}/file` | Byte-range file serving for `<video>`; accepts `?token=` because a video element cannot send a header |
| GET/POST | `/shows` | |
| GET/PATCH/DELETE | `/shows/{id}` | GET returns outputs and cues |
| POST | `/shows/{id}/outputs` · PATCH/DELETE `/outputs/{id}` | |
| POST | `/shows/{id}/cues` · PATCH/DELETE `/cues/{id}` · PUT `/shows/{id}/cue-order` | |
| GET | `/transport` | Current transport state |
| POST | `/transport` | `go`, `goto`, `pause`, `resume`, `stop`, `blackout` |
| GET | `/clock` | Server time, for the clock-offset estimate |
| POST | `/outputs/{id}/identify` | Flash the output's name on its windows and players |
| POST | `/players/hello` | Unauthenticated: a player introduces itself and polls for approval |
| GET · PATCH · DELETE | `/players`, `/players/{id}` | List, approve and assign, remove |
| GET | `/players/network` | Whether mini PCs can reach this server, and its address |
| POST | `/players/{id}/identify` | Flash a player's name on its projector |
| POST | `/players/me` | A player's heartbeat; returns its assignment |
| POST | `/outputs/{id}/calibrate` | Ask a camera to calibrate this output |
| POST | `/calibration/step` | Camera only: the pattern every window of the show should show now |
| PUT · GET · DELETE | `/outputs/{id}/calibration` | The decoded camera → projector map (PUT is camera only) |
| POST | `/shows/{id}/apply-calibration` | Set calibrated outputs' corner pin and mesh from the camera |
| PUT | `/cameras/me/snapshot` | Camera only: its current photo |
| GET | `/cameras/{id}/snapshot` | That photo, for marking the canvas corners; accepts `?token=` |
| POST | `/cameras/{id}/command` | `snapshot` (take a new photo) or `background` (re-learn the empty scene) |
| POST | `/cameras/me/people` | Camera only: who it sees now; relayed, never stored |

Live changes go out on the existing WebSocket feed as `mapping_transport`,
`mapping_output`, `mapping_show`, `mapping_player`, `mapping_identify`,
`mapping_calibrate`, `mapping_calib_pattern`, `mapping_camera`,
`mapping_camera_command` and `mapping_people` messages.

## 5. Players: one small computer per projector

The main server holds the media, the shows and the show clock. Beside each
projector sits a small computer (an Intel N100 mini PC or a Mac mini; both
decode 4K H.264/HEVC in Chrome, a Raspberry Pi does not reliably). It shows
one address, full screen:

```
http://<main-server>:8765/player
```

On a Windows mini PC, the [Mini PC app](../minipc/README.md) does all of
this: install it once and it finds the server by itself, opens that page as
a kiosk with media caching on, reopens it if it closes, starts at sign-in,
and runs a camera plugged into the same computer. The main server has to
accept connections from the network for any of it (desktop app:
`--lan`); the Players tab says when it does not. Under Docker, set
`ADVERTISE_PORT` to the published HTTP port and use host networking so the
broadcast reaches the server, or give each mini PC the address with
`--server`.

1. First start: the projector shows a six-letter pairing code.
2. On the Mapping page, **Players** tab: the code appears; **Approve** it and
   pick the output this machine drives. A camera on the same mini PC is
   approved with it.
3. From then on the player shows that output, follows the transport, picks
   up geometry changes live, and resumes by itself after a reboot.

**Identify** flashes a player's name on its projector, to tell machines
apart. **Remove** revokes it; it goes back to showing a pairing code.

Approval creates a dedicated viewer account for the player, so a player
can watch the show but cannot run it or change it.

### Media cache

Before the show, each player downloads every file its show uses to its own
disk and plays from there, so the network only carries the small control
messages during the show. The Players tab shows each player's cache state,
frame rate and clock drift.

Browsers allow this cache only on a secure origin. On a LAN over plain HTTP,
start the browser with the server marked as secure; without that flag the
player still works but streams media from the server.

### Starting a player as a kiosk without the Mini PC app

On a Mac mini, a Linux mini PC, or a Windows one without the app. Windows or
Linux (Chrome or Chromium), in the startup programs:

```
chrome --kiosk --autoplay-policy=no-user-gesture-required \
  --unsafely-treat-insecure-origin-as-secure=http://<main-server>:8765 \
  --user-data-dir=<a folder for this profile> \
  http://<main-server>:8765/player
```

macOS (Mac mini), as a login item:

```
open -na "Google Chrome" --args --kiosk --autoplay-policy=no-user-gesture-required \
  --unsafely-treat-insecure-origin-as-secure=http://<main-server>:8765 \
  --user-data-dir=$HOME/.mapping-player \
  http://<main-server>:8765/player
```

Kiosk mode shows nothing of the browser: no tabs, address bar or window
frame, from the moment the machine boots, and the player hides the mouse
cursor and its status overlay. A player opened in an ordinary browser window
shows "Click anywhere to fill the screen" until someone clicks once; Esc
leaves full screen.

Set the computer's display output to the projector's native resolution; the
player's status overlay (press H) warns when the window and the output's
configured resolution differ. Turn off screen sleep and OS updates that
restart without asking.

### Remote control

**Show Remote** is the phone remote: GO, pause, stop, blackout, the cue list
and projector power, laid out for one thumb in the dark. It lives at
`/remote` and goes on the phone's Home Screen, where it opens full screen
with its own icon. The **Phone remote** page in the sidebar shows a QR code
for it and the steps:

1. Start Projector Control with `--lan` (otherwise no phone can reach it).
2. To use it away from the venue's Wi-Fi, install
   [Tailscale](https://tailscale.com/download) on the main computer and on
   the phone and sign in to both with the same account. The page notices
   and switches the QR code to the computer's Tailscale address, which the
   phone reaches over any Wi-Fi or mobile data. Nothing is opened to the
   internet: Tailscale is a private network between your own devices (see
   [DEPLOYMENT.md](DEPLOYMENT.md#3-remote-access) for why this app is never
   port-forwarded).
3. Scan the code with the phone's camera, then in Safari **Share → Add to
   Home Screen**, open Show Remote from the Home Screen and sign in. A
   phone sign-in lasts 90 days (`REMEMBER_DAYS`) instead of a working day.

The remote loads no media, follows whichever show goes live, catches up the
moment the phone wakes, and says so when it cannot reach the server rather
than showing stale state as live. Turning projectors off asks first; bulk
results name each projector that did not take the command, and the list
shows the state read back from each one. Operators can run the show;
viewers can watch it; only administrators can change it.

The same buttons are on **Mapping → Remote** in the full app.

## 6. Cameras: calibration and people

A camera pointed at the building runs a small program,
[`camera-agent/`](../camera-agent/README.md). Plugged into a Windows mini PC,
the Mini PC app runs it; on any other computer on the show network it is
started by hand. It pairs like a player (`kind: camera`) and gets a viewer
account; what it may post is gated on that account belonging to an approved
camera. A camera that presents the same secret as an approved player is on
that player's computer: it is approved with it, listed as part of it, and
removed with it.

**Calibration** is structured light. For one output at a time the camera
asks the server to show black, white, then each bit of the Gray code of the
projector's columns and rows with its inverse. Output windows draw these in
the projector's own pixels, ignoring the warp; every other output of the
show goes black. Comparing each photo with its inverse says, per camera
pixel, which projector column and row lit it, regardless of how dark that
bit of wall is. The camera reduces this to a grid of cells over its photo
and uploads it: a map from camera picture to projector pixels.

The operator marks the four canvas corners on the camera's photo once, which
gives canvas → camera. Chained with each output's camera → projector map,
every canvas point gets a target in each projector, and
`apply-calibration` writes the corner pin and the mesh offsets that put it
there. Where the camera saw no light, a flat-wall homography fitted to all
decoded cells fills in, carrying the measured curvature a few cells past the
edge of the light. In a test with the real output window photographed
through a simulated camera, the corners land within 2 projector pixels.

**People** come from a depth camera (Intel RealSense). The agent learns the
empty scene's depth, labels anything clearly nearer as a person, keeps ids
stable between frames, and posts them about 15 times a second. The server
maps them onto the live show's canvas through the marked corners and relays
them; output windows smooth them and apply the live cue's effect:
`spotlight` (content lit only around people) or `ripple`.

A camera's position on the canvas is where the person appears against the
building from the camera's point of view, which is right for people near the
wall and approximate further out.

## 7. Show control integration (phase 2)

- Automation step `{"type": "mapping", "action": "go", "show_id": 1, "cue": 0}`
  so the existing startup sequence can power on, wait for lamps, open
  shutters, then start the content; shutdown stops content, closes shutters,
  powers off.
- Show start refuses (or warns, per show setting) when a linked projector is
  not on with its shutter open.
- MQTT/Home Assistant: transport as a select entity.

## 8. Phases

1. **Done in the first slice:** data model and migration, media library,
   shows/outputs/cues API, transport with server clock, WebGL output window
   with corner pin, mesh warp, masks, edge blend, colour and test patterns,
   the Mapping editor page, players with pairing and a media cache, and the
   phone remote. **Then:** the camera agent, camera calibration of corner
   pin and mesh, and people tracking with spotlight and ripple effects.
   **Then:** the Mini PC app for Windows (server discovery, kiosk output,
   camera, auto-start, one approval per machine). **Then:** Show Remote,
   the phone remote for the Home Screen, reachable from anywhere through
   Tailscale.
2. Automation step and projector-state preconditions; output thumbnails;
   media thumbnails and probe on the server (ffprobe when present).
3. Layers and surfaces: several pieces of media placed on regions of the
   canvas at once, with opacity and blend modes.
4. Calibration helpers: saved alignment snapshots per output with
   one-click restore; masks drawn from the camera photo; colour and
   brightness matching between projectors from the camera.
