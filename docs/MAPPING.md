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
| Source rect | The slice of the canvas this projector covers. Overlapping slices are what edge blending feathers. |
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
| POST | `/players/{id}/identify` | Flash a player's name on its projector |
| POST | `/players/me` | A player's heartbeat; returns its assignment |

Live changes go out on the existing WebSocket feed as `mapping_transport`,
`mapping_output`, `mapping_show`, `mapping_player` and `mapping_identify`
messages.

## 5. Players: one small computer per projector

The main server holds the media, the shows and the show clock. Beside each
projector sits a small computer (an Intel N100 mini PC or a Mac mini; both
decode 4K H.264/HEVC in Chrome, a Raspberry Pi does not reliably). It runs
nothing but a browser, full screen, on one address:

```
http://<main-server>:8765/player
```

1. First start: the projector shows a six-letter pairing code.
2. On the Mapping page, **Players** tab: the code appears; **Approve** it and
   pick the output this machine drives.
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

### Starting a player as a kiosk

Windows or Linux mini PC (Chrome or Chromium), in the startup programs:

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

Any phone, tablet or laptop on the network opens the app, **Mapping →
Remote**: GO, pause, stop, blackout and the cue list as large buttons.
Operators can run the show; only administrators can change it.

## 6. Show control integration (phase 2)

- Automation step `{"type": "mapping", "action": "go", "show_id": 1, "cue": 0}`
  so the existing startup sequence can power on, wait for lamps, open
  shutters, then start the content; shutdown stops content, closes shutters,
  powers off.
- Show start refuses (or warns, per show setting) when a linked projector is
  not on with its shutter open.
- MQTT/Home Assistant: transport as a select entity.

## 7. Phases

1. **Done in the first slice:** data model and migration, media library,
   shows/outputs/cues API, transport with server clock, WebGL output window
   with corner pin, mesh warp, masks, edge blend, colour and test patterns,
   the Mapping editor page, players with pairing and a media cache, and the
   phone remote.
2. Automation step and projector-state preconditions; output thumbnails;
   media thumbnails and probe on the server (ffprobe when present).
3. Layers and surfaces: several pieces of media placed on regions of the
   canvas at once, with opacity and blend modes.
4. Calibration helpers: camera-assisted corner detection, saved alignment
   snapshots per output with one-click restore after a projector is bumped.
