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
| Edge blend | Automatic where outputs overlap: each output window works out, for every point of its slice, its share of the light among the outputs showing that point, in proportion to the square of how far the point is inside each one's picture (the nearer of its slice edge and its projector's image edge, through the warp). The shares add up to one whatever the overlap's shape: slanted by keystone, bent by a curved wall, three deep. An output blends by itself once it is calibrated with a camera (its warp then puts each canvas point on the same spot of the building as every other calibrated output's), or always, or never (Blend tab); hand-placed outputs with overlapping slices may be the same picture on two walls, so they only blend when asked. While an output blends by itself its per-edge ramps (width, curve, gamma) stand aside; they remain for hand setups. |
| Colour | Brightness, gamma and per-channel gain, to match a warm projector to a cool one. **(phase 1)** |
| Test pattern | Canvas grid, output ID and crosshair, solid colours. The canvas grid is drawn in canvas space, so it lines up across projectors: aligning is making the grids meet. **(phase 1)** |

**A picture of its own.** A cue can give some projectors their own picture
or video instead of their part of the shared one (Editor → **Pictures on
each projector**; the cue's `output_media`), or nothing. It fills that
output's slice, shaped like the projector's image, and takes no part in
blending. An output set to never blend is also left out of fit-canvas and
apply-calibration on the Camera tab (and out of **Calibrate all**), so it
keeps the place it was lined up in by hand.

An output may be linked to a registered projector, so the editor can show its
power and shutter state and the show can refuse to start into a projector
that is off.

**Saved map.** Lining a show up with a building is the slow part, so it can
be kept by name and reused: Editor → **Saved maps** → **Save this show's map**.
A map holds the canvas size, every output (slice, corner pin, mesh, masks,
blends, colour, linked projector, camera calibration), where the canvas sits
in the camera's view, and the traced house parts. **Use in this show** copies
it into the open show (outputs, house parts, or both; outputs are updated in
place by order, so mini PCs assigned to them stay assigned), and **New show →
Start from** creates a show already mapped. Cues and media are never touched.
The copy is independent of the map afterwards. **Download** saves a map as a
`.map.json` file and **Load a map file** reads one on another server;
projector, player and camera ids from another server are dropped when applied.
Optionally the mini PCs that showed the map's outputs can be switched to the
show in the same step (off by default: it changes what they project at once).

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
| GET | `/maps` | Saved maps (summaries) |
| POST | `/shows/{id}/save-map` | Save the show's mapping as a named map (`replace` overwrites one of the same name) |
| POST | `/shows/{id}/apply-map` | Copy a map into the show: `outputs`, `surfaces`, `players` |
| GET · PATCH · DELETE | `/maps/{id}` | GET is the downloadable map file; PATCH renames |
| POST | `/maps` | Load a map file (a clashing name gets a number added) |
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
| POST | `/shows/{id}/fit-canvas` | Place the canvas inside the projectors' light on the camera photo, and optionally set each output's slice from its light |
| POST | `/shows/{id}/apply-calibration` | Set calibrated outputs' corner pin and mesh from the camera |
| PUT | `/cameras/me/snapshot` | Camera only: its current photo |
| GET | `/cameras/{id}/snapshot` | That photo, for marking the canvas corners; accepts `?token=` |
| POST | `/cameras/{id}/command` | `snapshot` (take a new photo), `live` / `stop_live` (a photo about every second, for `seconds`), or `background` (re-learn the empty scene) |
| POST | `/cameras/me/people` | Camera only: who it sees now; relayed, never stored |

Live changes go out on the existing WebSocket feed as `mapping_transport`,
`mapping_output`, `mapping_show`, `mapping_player`, `mapping_identify`,
`mapping_calibrate`, `mapping_calib_pattern`, `mapping_camera`,
`mapping_camera_command`, `mapping_people` and `mapping_map` messages.

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

Where the canvas sits on the camera's photo gives canvas → camera. By
default `fit-canvas` places it: the largest rectangle of the canvas's
proportions that the calibrated projectors light, after closing small gaps
in the light (dark glass, someone walking past), centred on the light. With
`slices` it also sets each output's slice of the canvas to the bounding box
of its own light, overlaps included. The operator can then place it by
hand on the photo: four corners, or a grid of up to 7 × 7 canvas points
(the show's `camera_view.mesh`). Canvas → camera is then the corners'
homography plus the hand offsets, blended bilinearly between grid points. Chained with each output's camera → projector map,
every canvas point gets a target in each projector, and
`apply-calibration` writes the corner pin and the mesh offsets that put it
there. Where the camera saw no light, a flat-wall homography fitted to all
decoded cells fills in, carrying the measured curvature a few cells past the
edge of the light. In a test with the real output window photographed
through a simulated camera, the corners land within 2 projector pixels.

**Cameras** are found by the agent itself (`camera-agent/sources.py`): an
Intel RealSense, Orbbec or Luxonis OAK depth camera through its maker's SDK,
otherwise the first webcam. Depth is aligned to the colour picture by each
SDK, so a photo pixel and a depth pixel look at the same spot. `--camera
sim` is a simulated depth camera looking at a made-up building lit by two
keystoned projectors (one on a curved wall), used to try the whole flow
without hardware.

**People** come from a depth camera. The agent learns the
empty scene's depth, labels anything clearly nearer as a person, keeps ids
stable between frames, and reports them on every camera frame (30 a second
on the supported cameras). The server maps them onto the live show's canvas
through the marked corners and relays them; output windows apply the live
cue's effect: `spotlight` (content lit only around people) or `ripple`, and
scenes react to them.

**Tracking delay** is kept as low as the camera allows:

- The agent takes each frame as it arrives instead of on a timer, and
  sends who it sees over the live feed WebSocket it already holds open
  (`mapping_people_report`) rather than one HTTP request per report; older
  servers, which do not list it in the socket's `connected` message, still
  get requests. A RealSense's depth is not lined up with the colour picture
  pixel by pixel any more: only each person's centre is moved onto it, with
  the SDK's own intrinsics, which is the slowest step skipped.
- Every report says when its picture was taken (`captured_at`, server time):
  the agent keeps its clock in step with the server like the output windows
  do, and the RealSense and OAK stamp their frames, so the age is measured
  (other cameras use a typical figure for their sensor).
- Output windows do not ease toward the last report, which trailed a
  walking person by about a tenth of a second. `people.ts` tracks each
  person's position and velocity (an alpha-beta filter whose smoothing
  drops as they speed up) and draws them where they are by the time the
  picture is on the projector. The price: when someone stops dead, the
  effect runs on a little past them (about 1% of the canvas at walking
  pace) and comes back within a fifth of a second.
- Players tab: a camera shows its updates a second and how old each is when
  sent; each player shows "camera to here", the age on arrival.

Measured with the simulated camera on one computer (`--camera sim`): 30
reports a second instead of 15, 1.7 ms from frame to output window instead
of 7. The camera's own exposure and USB (about 30–50 ms) and the
projector's input lag are hardware and are not measured here; on Wi-Fi the
mini PC to Mac hop adds a few milliseconds and occasional spikes, so wire
the mini PC with the camera to the network when you can.

A camera's position on the canvas is where the person appears against the
building from the camera's point of view, which is right for people near the
wall and approximate further out.

## 6a. Scenes: reactive designs

**Mapping → Scenes** builds designs that react to people, and plays them as
cues like media (a cue's **Scene** draws over its media, or over black).

- **A scene is a stack of layers**, bottom first, stored in a global library
  (`mapping_scenes`). Each layer is one of 15 types with a style, two colours,
  four dials (size, speed, amount, fade, each 0–1; what each means is in
  `frontend/src/mapping/scene/catalog.ts`), a mix (add light, soft light,
  paint over), where it goes and what it reacts to.
  - Follow people: glow, ripples, trails, particles (sparks, swarm, flee,
    fireflies), shadows (shadow, glowing silhouette, giant), reveal, distort
    (bends the media around people).
  - Looks: wash, light field, material (gingerbread, brick, stone, snow, ice,
    candy stripes, glowing windows…), trim (neon, icing with drips…), string
    lights, falling (snow, rain, leaves, confetti, sparkles), decorations
    (gumdrops, peppermints, ornaments, pumpkins, stars…), picture.
  - Reacts to: someone there, movement, number of people, closeness (depth),
    or always on, with "how much it reacts".
- **House parts** are traced on each show's canvas (`shows.surfaces`: walls,
  roof, windows, doors, other), so a layer can decorate just the roof or just
  the windows. Untraced, everything covers the whole picture.
- **Ready-made scenes**: Gingerbread house, Haunted house, Winter lights,
  Underwater, Party, Shadow play.
- **Trying without a camera**: the preview walks made-up people across the
  canvas (drag one to move it) over a backdrop (the camera photo straightened
  onto the canvas, or a media image). "Send to the projectors" relays them to
  the real outputs as if a camera saw them (`POST /mapping/simulated-people`).
- **Save as video** records a scene in the browser (MP4 where the browser can,
  else WebM, up to 1920 wide) into the media library.

**Rendering.** The output renderer draws the playing scenes into a texture
covering the output's slice of the canvas, in canvas space so layers line up
across projectors, then lays it over the media in the same pass. Particles
and falling things are worked out on the GPU from their number and the time
since the cue started (server clock), so every output draws the same moment;
only trails and reveal keep per-output memory. Where a layer goes is
rasterised once per change, not per frame. If an output drops frames while a
scene plays, scenes are drawn at less detail (100 → 75 → 50 → 35 %) while the
media stays at full resolution; the output HUD shows the level.

**Describe a scene** (optional): with an Anthropic API key (Settings, or
`ANTHROPIC_API_KEY`), a sentence becomes a scene, or changes the selected
one. Claude (`claude-opus-5-5`, structured JSON output) chooses from the same
catalog; the answer is validated like any saved scene. Picture layers are
kept as they are when a scene is changed in words.

**Paint the house (Beta)** (optional): with an OpenAI API key (Settings, or
`OPENAI_API_KEY`), a photo of the building lined up with the canvas is
repainted as described (`gpt-image-2` image edits, asked to keep every edge
where it is and to leave everything but the building black). The result is
saved to the media library and starts a scene with it as a picture layer
(on the traced building) and sparkles that follow people.

Keys are kept in files beside the media folder (`anthropic-api-key`,
`openai-api-key`, mode 600) and never sent back to a browser.

**Placed by hand**: an objects layer or a countdown set to Placement →
"Where I put them" / "Where I put it" keeps a list of pins (`x`, `y` on the
canvas, `size` against the layer's Size, `rotation` in degrees clockwise; up
to 64). On the scene preview a click adds one, a drag moves one, and the
picked one has a square handle to size it and a round handle to turn it
(it settles on straight and quarter turns); the layer card has the same Size
and Turn sliders. Changing a scene in words gives the pins back to a layer of
the same type.

**Christmas countdown** is a layer type (`countdown`, in
`frontend/src/mapping/scene/countdown.ts`) that can be added to any scene,
and a ready-made scene: days until Christmas as a big number with a ribbon,
holly and a ticking hours/minutes/seconds clock, in four looks (gold and
holly, frosted, candy cane, marquee lights). New countdowns are an element
placed by hand: one pin, dragged, sized and turned on the preview. Scenes
saved before that have no pins and stay centred on their "Where" area (Size
and Height place it). Colour is the ribbon, second colour the glow. It counts by the wall clock: the
server's time in each computer's own time zone, so a mini PC's time zone must
be right. On Christmas Eve the number becomes hours, then minutes; on the
25th it reads "Merry Christmas", and from the 26th it counts to next year.
People make it sparkle more but never fade it. The artwork is painted with
the 2D canvas only when the number changes (bundled OFL fonts, so every
player draws the same letters offline); the clock strip is patched in once a
second and the light sweep, glints and chasing bulbs are done in the shader.

| Method | Path | |
|---|---|---|
| GET/POST | `/mapping/scenes` | The scene library |
| GET/PATCH/DELETE | `/mapping/scenes/{id}` | One scene; changes go out as `mapping_scene` |
| POST | `/mapping/scenes/describe` | Admin: a scene from a sentence (or change `scene_id`) |
| POST | `/mapping/simulated-people` | Admin: made-up people, relayed as `mapping_people` |
| GET, PUT/DELETE | `/mapping/ai`, `/mapping/ai/key` | Anthropic key status / set / remove |
| GET, PUT/DELETE | `/mapping/paint`, `/mapping/paint/key` | OpenAI key status / set / remove |
| POST | `/mapping/paint` | Admin: repaint a picture; returns the new media |

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
