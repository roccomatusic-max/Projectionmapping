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
follows the mouse with no server round-trip. Players on other computers (the
mini PCs) follow too, show running or not: while a corner, mesh point, mask
or blend moves, the editor posts each position to
`POST /outputs/{id}/live` (about 25 a second, one request at a time, newer
positions replacing ones not yet sent), which relays it as a
`mapping_output` message with `"live": true` and writes nothing. A quarter
second after the last change the editor saves it with `PATCH /outputs/{id}`
through the same queue, so no live position can land after the save. The
renderer is never rebuilt for a geometry change, so the picture moves
without a flash.

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
| POST | `/outputs/{id}/live` | Geometry on the move: relayed to every player as `mapping_output` with `"live": true`, not saved |
| POST | `/shows/{id}/cues` · PATCH/DELETE `/cues/{id}` · PUT `/shows/{id}/cue-order` | |
| GET | `/maps` | Saved maps (summaries) |
| POST | `/shows/{id}/save-map` | Save the show's mapping as a named map (`replace` overwrites one of the same name) |
| POST | `/shows/{id}/apply-map` | Copy a map into the show: `outputs`, `surfaces`, `players` |
| GET · PATCH · DELETE | `/maps/{id}` | GET is the downloadable map file; PATCH renames |
| POST | `/maps` | Load a map file (a clashing name gets a number added) |
| GET | `/transport` | Current transport state |
| POST | `/transport` | `go`, `goto`, `pause`, `resume`, `stop`, `blackout` |
| POST | `/api/emergency/stop` | Emergency stop: show black, automations held, every projector off; one result per projector (see [SAFETY.md](SAFETY.md)) |
| POST | `/api/emergency/clear` | Lift the emergency stop; turns nothing back on |
| GET | `/clock` | Server time, for the clock-offset estimate |
| POST | `/outputs/{id}/identify` | Flash the output's name on its windows and players |
| POST | `/players/hello` | Unauthenticated: a player introduces itself and polls for approval |
| GET · PATCH · DELETE | `/players`, `/players/{id}` | List, approve and assign, remove |
| GET | `/players/network` | Whether mini PCs can reach this server, and its address |
| POST | `/players/{id}/identify` | Flash a player's name on its projector |
| POST | `/players/me` | A player's heartbeat; returns its assignment |
| POST | `/outputs/{id}/calibrate` | Ask a camera to calibrate this output |
| POST | `/calibration/step` | Camera only: the pattern every window of the show should show now |
| PUT · GET · DELETE | `/outputs/{id}/calibration` | The decoded camera → projector map (PUT is camera only); DELETE undoes that output's calibration (see below) |
| POST | `/shows/{id}/remove-calibration` | Undo the show's calibration: every calibrated output back to its slice and warp from before, the camera placement too, and a run in progress stopped |
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
and runs a camera plugged into the same computer. To install it, paste one
line into PowerShell on the mini PC (the line is in the
[Mini PC app's guide](../minipc/README.md#install)); it also says so plainly
when Windows 11's Smart App Control would block the app, and how to turn
that off. The main server has to
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

Each paired mini PC also has its own controls on the Players page:

- what it is doing in words (playing cue 3, a test picture, offline), its
  resolution, frame rate, clock and drift, whether its media is saved on
  it, its computer name and network address;
- **Projector: Show / Grid / White / Black** puts a test picture on that
  one projector (it is its output's test pattern, so the Editor shows the
  same; saved maps leave it out) and **Show** goes back to the show;
- **Info on screen** shows the status overlay on the projector itself;
- **Restart output** closes and reopens the full-screen window (the Mini
  PC app does it; with an older app the page reloads instead);
- **Restart computer** and **Shut down** (Windows Mini PC app, after a
  confirm box), and **Turn on** for one that is off, by Wake-on-LAN. That
  works only when the mini PC's BIOS allows Wake-on-LAN, and the server
  learns its network card from the app while it is on.

The page side of these reaches every player with the server. The Mini PC
app picks its part up by checking in every few seconds
(`POST /api/mapping/players/app` with the computer's secret); an app
installed before these controls existed does not, so Restart computer and
Shut down say to paste the install line once. Commands are kept in memory
for 30 seconds only, so nothing happens later out of the blue.

The same check-in carries the app's version, and the answer carries a newer
Mini PC app when the server has one and nothing is on: the app updates
itself from the server, without restarting the computer and without
closing the output window (`services/minipc_updates.py`,
`minipc/selfupdate.py`, minipc/README.md "Updates"). Each card shows the
version, the update state and **Update now**.

A monitor plugged into a mini PC beside its projector shows the **status
screen**, `/player/screen`: the show and cue, Tonight's show, the emergency
stop, the projector this mini PC drives (power, temperatures, lamp, fan,
filter and cover checks, errors) and a picture of its own output. The Mini
PC app opens it in a second kiosk window on the screen that is not the
projector, and only when there is one (`minipc/screens.py`); the page signs
in as the mini PC, like its player page. Asked for by its own mini PC, the
output picture comes about once a second at 960 px, and only from that mini
PC (the Dashboard's live view keeps its 3 s for every mini PC). The card's
**Monitor** line has **Swap screens** and, when Windows mirrors the two
screens, **Use as second screen**.

The status screen has buttons for someone standing at the projector:
start or stop tonight's show, GO, pause, blackout, its projector on and off,
restart its output and the emergency stop. They go to
`POST /api/mapping/players/me/control` and `/me/emergency-stop`, which only
the mini PC's own account may call, and only for its own show, projector
and output. With no projector linked to its output, the screen (and Projector
on/off) uses the only projector when there is one; otherwise it offers each
projector as a button that links it to the output, once (`link_projector`
never replaces a link made in the Editor).

Approval creates a dedicated viewer account for the player, so a player
can watch the show but cannot change it; the status screen's buttons above
are the only things it can run.

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
configured resolution differ. On Windows the Mini PC app keeps the computer
awake around the clock (no sleep, screen off or lock, show or no show; see
*Staying on 24/7* in minipc/README.md); elsewhere, turn off screen sleep.
Set Windows Update's active hours so it does not restart during shows.

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

The same buttons are on **Mapping → Run the show** in the full app.

### Walk the yard: checking every projector from the phone

**Walk the yard** (Show Remote → Tonight or Projectors tab) checks every
mini PC's projector in turn before a show. The projector being checked shows
its ID test picture (its output's name, a crosshair, TL/TR/BL/BR corners and
five focus stars over the canvas grid) and every other projector on the walk
goes black, so the lit one cannot be mistaken. The phone shows that
projector's mini PC (connected or not), power, shutter, hottest sensor, lamp
hours and any fault, with Turn it on / Open the shutter when needed, and a
Grid and name / All white switch. **Looks good** lights the next one;
**Something's wrong** asks what (blurry, off target, too dark, wrong
projector lit up, nothing showing, something else, a note). Previous and
Skip for now move around the walk. When every projector is answered, each
output gets back the test picture it had before (normally the show) and the
walk is saved as an event (`walkthrough`, a warning when one needs a look).
The Dashboard's Tonight's show has a **Last checked** tile and the phone
shows "Last checked Today 5:40 PM · all 3 looked good".

A walk never gets in the way of a show (services/walkthrough.py). Starting
one while a show plays is refused unless the phone confirms stopping it; the
show starting by any means, the emergency stop, End walk, or 20 minutes
without a tap end it where it is and put every picture back. The outputs'
earlier pictures are saved with the walk's start (`walkthrough_started`
event), so a server restart mid-walk puts them back at start-up too. A mini
PC whose projector shows a test picture does not update its app, so none
updates during a walk.

| Method | Path | |
|---|---|---|
| GET | `/api/walkthrough` | Viewer: the walk going on (`active`) and the last one (`last`) |
| POST | `/api/walkthrough/start` | Operator: `{stop_show}`; picks up a walk already going on |
| POST | `/api/walkthrough/answer` | Operator: `{index, result: good/wrong, problems, note}` |
| POST | `/api/walkthrough/go` | Operator: `{index}`, light another stop |
| POST | `/api/walkthrough/picture` | Operator: `{picture: id/white}` |
| POST | `/api/walkthrough/stop` | Operator: end it now |

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

**Undoing a calibration.** When the camera first uploads a result for an
output, the server keeps that output's slice and warp as they were, and the
show's camera placement, with the calibration (`before`; a second run of
the same output keeps the first one's). **Remove calibration** on the Camera
tab (`remove-calibration`) puts every calibrated output of the show back to
that, forgets the calibration and the placement, and so turns off the
automatic blend the calibration switched on; hand changes made since the
calibration go with it, and outputs never calibrated are not touched.
**Remove** on one projector's row (`DELETE /outputs/{id}/calibration`) does
the same for that output; the placement goes back once no output of the
show is calibrated. Both also stop a run in progress: the output windows go
back to the show at once, and the server refuses that output's further
patterns and result until it is asked to calibrate again, which ends the run
on the camera (no mini PC update needed). Calibrations made before this
existed have no `before`: their outputs go back to a flat corner pin, side
by side as a new show lays them out.

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

**Make a scene** (the first part of the Scenes page, `editor/MakeScene.tsx`)
is the direct way in, four steps: (1) pick the projector (or every
projector) and, when house parts are traced, the part of the house; the
preview dims everything that projector does not light and outlines the part;
(2) pick a ready-made scene, describe one in words, reuse one of yours, or
start empty; ready-made scenes are fitted to that spot (layers spread over an
area go on the chosen part, things put in a spot move inside the projector's
box); (3) put things in place on the preview; (4) one button puts it there:
every cue of the show gets the scene on that projector (`output_scenes`, or
`scene_id` for every projector; a show with no cues gets one), and so do the
ticked scene groups, tonight's ticked by default, because a scene group sets
every cue when tonight's show starts. **Change a scene** keeps every setting;
its "Put it on a projector" opens Make a scene with that scene picked.
**Cue by cue** is the per-cue, per-projector table.

**Elements on one cue or every cue** (Editor → Elements,
`editor/CanvasElements.tsx`): each element picked there goes on "This cue
only" (`mapping_cues.elements`) or "Every cue" (`mapping_shows.every_cue_elements`),
both lists of scene layers (up to 12 each) kept apart from the scene library,
so a scene group or playlist changing the cues' scenes leaves them in place.
Outputs draw a cue's scenes, then its own elements, then the every-cue ones,
over the whole canvas (`scene/cueElements.ts`, `playback.ts`). Every-cue
elements keep one clock from `run_started_at_ms` (the first GO after a stop or
blackout), so they carry on smoothly from cue to cue; a scene played on its
own has none. Each element's row switches where it lives; elements placed in
the Editor before there was a choice live in the cue's scene, are marked "In
the scene", and can be moved out of it.

- **A scene is a stack of layers**, bottom first, stored in a global library
  (`mapping_scenes`). Each layer is one of 18 types with a style, two colours,
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
- **Straightened parts** (a roof sloping away from the projector): a part can
  carry `flat.corners`, four canvas points where a true square has to be drawn
  to look square on that part from the street. Objects and countdowns whose
  centre is on the part keep their place but are drawn through that
  perspective (`scene/flat.ts`, the objects and countdown shaders), so they
  are not stretched. The corners are dragged on Scenes → House parts →
  Straighten, or with the mouse on a mini PC's status screen
  (`POST /mapping/players/me/flat`), while a checkerboard square with a
  circle shows on the projectors (`flat.test_until`, server clock).
- **The driveway** (a projector on the roof pointing down): a house part of
  kind `ground` ("Driveway or ground") is not part of the building, so
  "Whole building" leaves it out and "Around the building" may cover it;
  layers reach it with the target `ground`. Ground objects are drawn flat:
  footprints, a WELCOME mat, landing strip arrows and crawling spiders (no
  thread), and trails have a footprints style that stamps a left and right
  foot twice a second along each person's way. Starters under "On the
  driveway": Spiders on the driveway, Ghostly footprints, Welcome mat, Path
  of lights, Santa's landing strip. A starter marked `placed` gives its pins
  as fractions of the layer's area, put on the traced driveway when the
  scene is made (`starterLayers`).
- **Fitting a picture to the ground**: without a camera, the projector's
  own corner pin is what straightens the driveway: dragged until the canvas
  grid shows true squares on the ground, everything drawn on its slice is
  flat on the driveway. The mini PC's status screen has "Fit the picture to
  the ground" (`POST /mapping/players/me/warp`, only its own output's
  corners; the grid shows while fitting, never while a show plays, and goes
  off on Done, after ten minutes untouched or when the screen closes), with
  Turn left, Turn right, Upside down and Mirror, so the picture's top faces
  the house and reads the right way up from the street. The Editor's
  Warp tab has the same turn buttons (`turnCorners`).
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

**Start from a photo** (Scenes → Start from a photo): take or pick a photo of
the house (on a phone the file picker opens the camera), or use the camera's
photo. It is kept in the media library as "House photo.jpg" (up to 2048 px).
With an Anthropic key, Claude (`claude-opus-5-5`, image input, structured JSON
output) outlines every wall, roof face, window, door and "other" part in the
photo's pixels (`POST /mapping/house-photo/trace`, nothing saved); the answer
is clamped onto the photo, parts with fewer than three points or no area are
dropped, and the person picks "Use these parts" (replace) or "Add them".
Without a key the same photo can be traced by hand. Four corners say where
the canvas's corners are on the photo (default: the photo's own corners; the
camera's corners for a camera photo); a homography takes parts from the photo
to the canvas and back. The parts are ordinary house parts (`shows.surfaces`),
drawn on the photo: dragging a corner keeps every part where it is on the
photo and moves it on the canvas, saved four times a second, so a playing
scene follows on the house. A part's `flat.corners`, when present, move with
it. The photo and its corners are kept per show in
`house-photos/<show id>.json` beside the media folder (`GET/PUT/DELETE
/mapping/shows/{id}/house-photo`); deleting the photo from the library
forgets them. "Make a scene for these parts" sends a theme and Claude's
one-line description of the house to Describe a scene; the preview's backdrop
"Your photo of the house, lined up" shows the scene on the straightened photo.

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

**Countdown** is a layer type (`countdown`, in
`frontend/src/mapping/scene/countdown.ts`) that can be added to any scene,
and two ready-made scenes (Christmas countdown, Halloween countdown): days
until the holiday as a big number with a ribbon and a ticking
hours/minutes/seconds clock. The look picks the holiday: four Christmas looks
(gold and holly, frosted, candy cane, marquee lights) and two Halloween looks
(jack-o'-lantern orange with pumpkins and bats, ghostly green with ghosts and
bats, both flickering like a candle). Editor → Elements → Find an element offers
"Christmas countdown" and "Halloween countdown". Each part has its own
colour picker (Editor → Elements → Move and colours, or the layer's card in
Scenes): big number, its 3D side, words above the number, banner, words on the
banner, banner stitching, clock numbers, clock words, decorations (holly,
snowflakes, peppermints, pumpkins, ghosts, bats, stars) and glow. Every part
starts as the look's own colour; banner and glow are the layer's `color` and
`color2`, the rest are kept in the layer's `colors` (a part left empty keeps
the look's own gradients). Picking a look, or "Reset to preset", sets that
look's banner and glow and clears the rest. Changing a scene in words keeps a
countdown's part colours, as it keeps pins. New countdowns are an element
placed by hand: one pin, dragged, sized and turned on the preview. Scenes
saved before that have no pins and stay centred on their "Where" area (Size
and Height place it). Colour is the ribbon, second colour the glow. It counts by the wall clock: the
server's time in each computer's own time zone, so a mini PC's time zone must
be right. On the last day (Christmas Eve, 30 October) the number becomes
hours, then minutes; on the day it reads "Merry Christmas" or "Happy
Halloween", and from the next day it counts to next year.
People make it sparkle more but never fade it. The artwork is painted with
the 2D canvas only when the number changes (bundled OFL fonts, so every
player draws the same letters offline); the clock strip is patched in once a
second and the light sweep, glints and chasing bulbs are done in the shader.

**Things that fly or walk** (`movers`, `frontend/src/mapping/scene/movers.ts`
and `sprites.ts`): Santa's sleigh and reindeer (Rudolph's nose glows, a
sparkle trail, "Ho ho ho!" when someone is near), a toy train of presents
along a line with steam, flocks of birds and bats that scatter from people,
walking elves (they wave) and penguins, shooting stars and floating ghosts.
With no pins it picks a path of its own: flyers loop over the roofline (or the
top of the picture), walkers and the train go along the bottom. Two or more
pins are a path drawn by hand, in order (a smooth curve through them; each
pin's size makes it bigger or smaller there). Positions come from the cue's
time on the server clock, so every projector draws the sleigh in the same
place and it crosses from one projector to the next. The artwork is painted
once into a sprite sheet; each frame is up to 64 quads in one draw.

**Snow on ledges** (`snowcap`, `snowcap.ts`): lumpy snow piles up on the
roughly level edges of the traced windows, doors or roof over the first minute
of the cue (Speed) and melts where people stand. Untraced, it lies along the
bottom of the picture.

**Live info boards** (`info`, `info.ts`), one pin each like a countdown:
- **Santa tracker** (`santa.ts`, `worldmap.ts`): a world map (Natural Earth
  land, public domain) with Santa's route and sleigh, where he is, his next
  stop, presents delivered, and when he reaches this house. It is worked out
  on each computer from a built-in timetable of about 80 cities, each visited
  around local midnight on Christmas Eve, so it needs no internet. Before
  takeoff (about 09:30 UTC on 24 December) it counts down; after landing it says he
  is home.
- **Weather**: now, feels like, high and low for a town or ZIP code (layer
  `text`; empty means where the server is). The outputs ask the server
  (`GET /mapping/weather`, `services/weather_board.py`), which asks Open-Meteo (free, no key) at most every
  10 minutes per place and keeps the last reading if the internet drops.
- **Days until**: days until a date that comes round every year (layer `text`
  is the name, `date` is `YYYY-MM-DD`).
- **Message board**: a light-up bulb board scrolling the layer's `text` (up to
  200 characters). The phone remote's Show tab lists every message board with
  a box to change the words (admins).

**The element library** (`frontend/src/mapping/scene/library.ts`, the
"Find an element…" button under Editor → Elements, a search box rather than a
list): every element on its own, with a moving picture, searchable by name,
by holiday (Halloween, Thanksgiving, Christmas, New Year's, Valentine's,
St Patrick's, Easter, Fourth of July, birthdays and more) and by kind (flies,
walks, objects, live info, countdowns, snow). Typing searches every holiday;
the chip for the season now is picked when it opens. An entry is a layer
type, a style and a starting look (colours, how many, what people do to it);
some styles appear more than once only where a different look means a
different thing (blue jays and doves, holiday-coloured fireworks). The
pictures of flying and walking ones are their sprites drawn on a 2D canvas;
the rest are drawn by the real scene engine on one shared hidden WebGL canvas
and copied out. A scene holds at most 12 layers; the library says so when it
is full. Each element does something with people or shows real data:

- Flying and walking: a witch on her broomstick (cat on the broom, "Hee hee
  hee!" near people), a UFO that follows people and beams them up, dancing
  skeletons (wave when someone is near), shuffling zombies ("Braaains!"),
  prowling black cats (glowing outline, so they show on a dark house),
  strutting turkeys ("Gobble gobble!"), Cupid, dancing leprechauns, hopping
  Easter bunnies, bald eagles, firework rockets that launch from the ground
  and burst in two rings (bigger and brighter near people), balloons that
  float up, butterflies and a school of fish that scatter.
- Objects: candy corn, skulls, tombstones, cauldrons, witch hats, acorns,
  pies, party hats, champagne glasses, flags, cupcakes, chicks, pots of gold
  and rainbows.
- Live info: a clock (blinking colon), tonight's moon phase worked out from
  the date (how much is lit, next full moon), days until the next holiday
  (it moves on to the next by itself, with the greeting on the day) and a
  New Year's countdown (hours, minutes and seconds on New Year's Eve).

Ready-made scenes added with them: Witching hour, Graveyard dance, Alien
visit, Thanksgiving parade, New Year's Eve countdown, Fourth of July
fireworks, Leprechaun's gold, Easter bunny hop, Cupid's arrows and Birthday
balloons. "Describe a scene" knows every new style; a test checks its list
matches the Editor's.

Second batch, each with a job of its own:

- Falling (`fall` motion): big snowflakes (four crystal shapes), maple and
  oak leaves, cherry blossom petals, confetti, hearts and shamrocks. They
  come down the whole picture (or from a drawn line), swaying and turning
  over, and drift aside round people. Different from the older Falling
  layer type: these are drawn pictures, not dots.
- Hanging (`dangle`): spiders on threads from the roofline that slowly
  climb and drop, and drop down to whoever walks under them (near "follow").
- Rising: sky lanterns (flickering), glowing jellyfish (pulsing), bubbles
  (they pop, near "hide") and hot air balloons (slow).
- Wandering (`wander`): fireflies drifting and blinking over the lower part
  of the house; near people they gather and all light up.
- Flying: a dragon that turns to people and breathes fire at them, owls
  ("Hoo hoo!"), angels with trumpets ("Peace on earth"), sharks that circle
  towards people, sea turtles, and bumblebees (a flock that follows people).
- Walking: mummies, gingerbread men that run off ("Catch me if you can!"),
  toy soldiers that stop and salute, dinosaurs that roar, and a duck leading
  her ducklings in a line (`line` in movers.ts).
- Live boards: a Hanukkah menorah with tonight's candles lit (the dates are
  worked out from the Hebrew calendar in info.ts, so it needs no table or
  internet; the flames flicker in the shader, marked blue in the fx
  picture), an Advent calendar (a door a day in December, today's lit), Lunar
  New Year (days to go and the year's animal, then the festival; dates from a
  table to 2040), and Tonight's show times, which reads `GET /tonight`
  (`showtimes.ts`, once a minute) and says when tonight's show starts and
  ends, that it is on now, or when the next one is.

Ready-made scenes added: Nutcracker march, Hanukkah lights, Christmas angels,
Spider drop, Autumn breeze, Summer night, Spring garden, Under the sea,
Dragon's lair, Lunar New Year and Party time.

Third batch:

- Coming up out of the ground (`popup` motion): zombie hands that claw up
  from mounds of earth along the bottom of the house, and painted Easter eggs
  that crack and hatch a chick. Each comes up now and then by itself, and the
  ones beside people come up for them (near "appear": only for people; "hide":
  they sink back).
- Bouncing (`bounce`): beach balls bouncing and spinning along the bottom;
  people kick them up and away (near "flee" or "jump").
- Leaping (`leap`): dolphins jumping out along the bottom of the house as if
  it were the sea, with a splash out and back in, higher near people.
- Kites (`kite`): kites on strings from the bottom of the house riding the
  wind; they dive and loop over whoever stands under them (near "jump").
- Walking: trick-or-treaters with pumpkin buckets ("Trick or treat!"),
  werewolves ("Awoooooo!"), vampires, Frankenstein's monster ("Friend?"),
  scurrying rats, polar bears in scarves, reindeer whose noses light up like
  Rudolph's as they prance (near "dance"), carolers ("Joy to the world!"),
  squirrels and frogs (hopping), crabs, robots that wave (near "dance"),
  dogs ("Woof woof!"), spinning dreidels (the letters drawn as strokes, so no
  Hebrew font is needed) and a lion dance that rears up (near "dance").
  Ground walkers that run from people now run along the ground, not up the
  wall. Walkers can have their own pace (`pace` in movers.ts).
- Flying: the grim reaper, lovebirds, whales that blow a spout over people,
  an octopus, paper aeroplanes, a rocket ship with a sparkle trail and
  floating astronauts ("Hello, Earth!"); dragonflies and hummingbirds are
  flocks.
- Falling: presents and red envelopes.

Near "appear" on a flying or walking element now keeps it hidden while
nobody is near at all (before, it only hid once someone had been seen).

Ready-made scenes added: North Pole parade, Dreidel night, Monster mash,
Trick or treat street, Easter morning, Pond life, Beach day, Deep sea, Space
walk, Lion dance parade and Puppy parade.

Fourth batch:

- Sitting on the roof (`perch` motion): crows, doves and cardinals along the
  roofline, looking round, pecking and calling; bats hanging upside down from
  the bottom edge of the roof (`under`). Now and then one flies off and comes
  back to its spot, and people coming near send them all off at once (near
  "flee"); the crows call "Caw! Caw!" as they go. People below count by how
  far along the house they are, not how far below.
- Sliding (`slide`): kids on sleds and penguins on their bellies sliding from
  the peak of the roof down either side, faster and faster, and off the end
  into the air, arms up and "Wheee!" for people (or along the line drawn).
- Hanging still (`dangle` with `still`): jingle bells and Christmas stockings
  on ribbons under the roof edge, at staggered lengths; they swing (and the
  bells glint) when people dance under them.
- Falling: candy canes, gold coins that spin as they fall (`animate`), candy
  and presents on parachutes that drift down slowly (`pace`) to whoever is
  below (near "follow").
- Sparklers stuck along the bottom that burn now and then and light up beside
  people; floating candles drifting over the house, always lit (`steady`);
  jack-o'-lanterns rolling along the bottom that people kick away (`low`).
- Walking or driving: snowmen ("Let it snow!"), Santa on foot ("Merry
  Christmas!", comes over to people), a hen and her chicks ("Cluck cluck!"),
  an ice cream truck ("Ice cream!"), a fire truck with flashing lights
  ("Wee-oo wee-oo!"), race cars, marching drummers and scarecrows ("Boo!").
  Walkers that follow people now come over along the ground, not up the wall.
- Flying or swimming: love letters on little wings that fly to people,
  seahorses, a mermaid ("Hello there!"), a submarine whose portholes light
  up and paper cranes; pufferfish (puff up near people) and koi (gather round
  people, as koi do at feeding time) are flocks. Flocks now keep each
  picture's own shape instead of one width for all.

Ready-made scenes added: Snowy rooftop, Stockings were hung, Haunted rooftop,
Farmyard, Love letters, Hometown parade, Lucky koi pond, Mermaid lagoon and
Summer street.

Fifth batch:

- Peeking over the window sills (`peek` motion): ghosts, elves and cats take
  turns to come up over the sills of the traced windows, look round and duck
  down again; only the part above the sill shows (a sprite's `crop`). People
  bring up the one in the window nearest them, which turns to watch them and
  says "Boo!", "I see you!" or "Meow?" (near "hide" or "flee": it ducks down).
  Each is sized to its window. Glowing eyes open in the dark windows instead,
  their pupils following whoever is nearest. Without windows they peek over the
  bottom of the house.
- On the roof: owls that turn their heads to watch people (`look`) and fly
  off when they come close, and seagulls ("Mine! Mine!").
- Throwing (`throw`): kids along the bottom winding up and throwing
  snowballs or water balloons in an arc, splatting on the house, or on whoever
  comes near (near "follow").
- Coming up along the bottom (`popup`): a jack-in-the-box whose lid flies open
  and jester springs out ("Surprise!"); moles that poke up out of their mounds
  (`rises`) and duck back when people come (near "hide"); coffins that creak
  open for a vampire ("Good evening!"); ghosts rising from behind headstones;
  party poppers that go off now and then and for people, confetti fanning out;
  a birthday cake whose candles people blow out by walking up (smoke curls
  up, they light again about 8 seconds later; near "light": lit only for
  people).
- Walking: shy snails, tortoises, hedgehogs and skunks that stop and hide in
  their shells (or curl up, or turn their tail on people) when people come
  near and carry on a couple of seconds after (`shy`); ice skaters that twirl
  for people (`twirl`); Uncle Sam on stilts ("Happy 4th!") and football
  players ("Touchdown!"). Skiers slide down the roof and jump off the end.
- Flying: a stork with a baby's bundle, flying pigs, a unicorn trailing
  sparkles, a magic carpet and a small superhero; fairies flit about over the
  house; ladybugs and moths are flocks.

Ready-made scenes added: Restless graveyard, Peekaboo ghosts, Elves on watch,
Snow day, Birthday surprise, Garden visitors, Welcome baby, Seaside, Stars and
stripes and Make-believe.

Sixth batch (34 more; several show something real):

- Real data: tonight's moon (`sky` motion) in its real phase, rising on the
  left in the evening and crossing over the house through the night by the
  server's clock (one pin placed by hand keeps it there); a cuckoo clock whose
  hands show the real time and whose cuckoo comes out of its door to call the
  hours (once on the half hour, and once for whoever walks up); icicles along
  the gutter that hang still and glint below freezing and drip above it (the
  weather where the server is, from the same Open-Meteo feed as the weather
  board), a drop falling on whoever stands under them; flags that ripple as
  hard as the real wind is blowing; puddles that get raindrops in them when it
  is really raining.
- Standing on the ground (`stand` motion, spots along the bottom of the house
  or the line drawn, `many` how many the How many dial adds): jack-o'-lanterns
  that shout "Boo!" with a jump; a cauldron bubbling over more for people;
  lawn sprinklers sweeping to and fro that turn to spray whoever walks by
  (near "hide": they shut off for them); snow globes shaken now and then and
  by people, the snow whirling up and settling; firework fountains that spray
  higher for people (near "grow"); leaf piles that burst up when someone walks
  through them (a few leaves in a gust now and then); a pot of gold with a
  rainbow arcing up for people ("Lucky you!"); Easter eggs hidden along the
  bottom that light up and hop when someone finds them ("Found one!"); a row
  of diyas with a wave of light running along them.
- On and under the roofline: wolves that watch people and howl ("Awooo!");
  robins that sing; piñatas that swing as people dance under them and, after a
  couple of seconds of it, burst into candy and are hung again later;
  ornaments that glint in turn; spiders in their webs that drop down a thread
  to people (near "hide": they scuttle to the top of the web).
- Walking: gnomes that freeze mid-step when anyone comes near and carry on
  when they leave (`shy` without a hiding picture); peacocks that stop and fan
  their tails for people (near "dance"); surfers ("Cowabunga!"), sailboats and
  a pirate ship that rock on the waves (`rock`), the pirate ship firing its
  cannon at people ("Arr!"); a snowplow ("Beep beep!"), starfish and teddy
  bears holding hearts ("Hugs!").
- Coming up: presents that shake, open and show a teddy bear ("Surprise!");
  bunnies poking up out of their burrows.
- Flying: a helicopter whose searchlight sweeps the ground and swings onto
  whoever comes near; manta rays, an anglerfish with a glowing lure and
  Rudolph with his nose lighting up; clownfish are a flock.

Ready-made scenes added: Howl at the moon, Deep freeze, Rudolph's night,
Fiesta, Coral reef, Lazy summer, Garden party, Egg hunt, End of the rainbow,
Diyas and fireworks, Rainy autumn day, Hugs and Hometown heroes.

Seventh batch (36 more, taking the library past 300):

- Real date and time (the server's clock): the New Year's ball comes down its
  pole in the last minute before every hour and lands on the hour, with
  "Happy New Year!" at midnight on New Year's Eve; champagne corks all pop at
  midnight on New Year's Eve; Santa comes up out of his chimney far more often
  on Christmas Eve night; a kinara lights as many candles as the real night of
  Kwanzaa (26 December to 1 January, all seven the rest of the year);
  sunflowers follow the sun through the day and droop at night; tulips are
  open in the day and closed at night.
- Real weather (where the server is): rain clouds that turn dark and rain to
  the ground when it is really raining, with lightning in a real thunderstorm;
  tumbleweeds that roll as fast as the real wind (how far each has gone is
  kept, so a change in the wind speeds them up rather than jumping them);
  wind chimes that swing and ring as hard as the real wind.
- New `halts` flag for walkers: a school bus that stops with its stop sign out
  and lights flashing for people, deer that stop with their heads up and edge
  away (near "flee").
- On the roof and under the gutter: Santa in a chimney at the peak of the roof
  (standing ones with `ground: false` follow the roofline); reindeer prancing
  on the roof that turn to watch people; a disco ball whose spots of light
  wheel over the house and gather round people; strings of firecrackers that
  go off from the bottom up with a bang each; wind chimes; Ramadan lanterns
  ("Ramadan Kareem!").
- In the windows: a candle on every sill, brighter for people (near "hide":
  blown out).
- On the ground: searchlights crossing over people; champagne; graduation
  caps tossed up ("Congrats!"); a lighthouse whose beam sweeps round and stops
  on people; raccoons climbing out of trash cans to stare at people; a bird
  feeder whose birds fly off from people; a beehive whose bees swarm at
  people; a campfire throwing up sparks; hula dancers ("Aloha!") and a
  mariachi band ("¡Olé!") going faster for people; a cornucopia spilling fruit
  across the ground; a Christmas tree that lights up, star and all, as people
  come; sunflowers that turn to face people.
- Walking: a tractor puffing from its stack ("Howdy!"), foxes that pounce
  into the snow now and then, Bigfoot turning to stare at whoever spots him,
  skeleton dogs ("Arf arf!"), a bagpiper, pilgrims ("Happy Thanksgiving!") and
  cows that look up from the grass and moo.
- Flying: a witch who flies straight at the house and splats flat against the
  wall above whoever is there ("Ouch!"), then slides down it.
- Throwing: hockey players slapping pucks along the ground, passing to people
  ("He shoots, he scores!").

Ready-made scenes added: Santa's on the roof, Countdown to midnight, Disco
night, Down on the farm, Into the woods, Bad landing, Stormy weather, Garden in
bloom, Kwanzaa, Ramadan nights, Luau, Serenade, Harvest walk, Firecrackers,
Class of the year, Night on the coast, Hockey night, School's out and Pipes and
drums.

More Christmas decorations for the objects layer: gingerbread people,
stockings, wreaths, Santa hats, reindeer, poinsettias, holly, mittens (and
turkeys for Thanksgiving). Ready-made scenes added: Christmas night (lights,
snow on the sills, shooting stars, the Santa tracker and the sleigh), North
Pole express, Santa's workshop, Christmas message board, Winter birds,
Haunted night flight and Thanksgiving.

| Method | Path | |
|---|---|---|
| GET/POST | `/mapping/scenes` | The scene library |
| GET/PATCH/DELETE | `/mapping/scenes/{id}` | One scene; changes go out as `mapping_scene` |
| POST | `/mapping/scenes/describe` | Admin: a scene from a sentence (or change `scene_id`) |
| POST | `/mapping/simulated-people` | Admin: made-up people, relayed as `mapping_people` |
| GET, PUT/DELETE | `/mapping/ai`, `/mapping/ai/key` | Anthropic key status / set / remove |
| GET, PUT/DELETE | `/mapping/paint`, `/mapping/paint/key` | OpenAI key status / set / remove |
| POST | `/mapping/paint` | Admin: repaint a picture; returns the new media |
| POST | `/mapping/house-photo/trace` | Admin: Claude's outline of the house's parts on a photo |
| GET, PUT/DELETE | `/mapping/shows/{id}/house-photo` | The show's photo of the house and its four corners |
| GET | `/mapping/weather?place=` | The weather now for a Weather board (cached 10 min) |

## 6b. Scene groups and tonight's show (the Dashboard)

The Dashboard opens with **Tonight's show**: what plays tonight, the show
time, and the numbers that matter in the evening (projectors online,
faults and warnings, the hottest temperature any projector reports, the
highest lamp hours, mini PCs connected, the emergency stop, what is playing).

A **scene group** is a name with a scene for every projector of a show,
for example "Halloween night": pumpkins on the house, ghosts on the garage.
One click on a group under **Pick tonight's scenes** makes it tonight's group
(and the look of tonight's show, when tonight has a show added for that one
night alone; a run of nights keeps its own look) and writes it into every cue of its show (each cue's scene and its "Scenes on
each projector" choices), so every projector follows it at once, mid-cue
too, through the same path as the Scenes page. Changing tonight's group
changes the projectors as well. Media is left alone. A new group starts from
what is set now (the cue playing, else the first cue).

**Show times come only from the calendar** (section 6c): nothing repeats by
itself, and a night with no show added has no show. The card says what
tonight has ("No show tonight" otherwise), lists the nights coming up in the
next two weeks, and has **Add a show tonight** (or **Change tonight's show**),
which opens the calendar's show editor for tonight with the newest show's
times and tonight's group filled in. Each show time says whether to turn the
show's projectors on at the start and off at the end (the projectors linked
to the show's outputs; every projector when none are linked).
`backend/app/services/tonight.py` checks every 20 seconds, in the schedule
time zone (SCHEDULE_TIMEZONE, else the computer's own):

- At the start it uses tonight's group, presses GO on cue 1 and turns the
  projectors on. Once a night: a show stopped by hand is not restarted.
- A start time already passed while the show time is still on starts the
  show straight away. That covers setting the time at 6:30 for 6:00, and a
  server restart (a power cut) during the show time: the show comes back.
- At the end it stops the show and turns the projectors off, only for a
  night it started, and only within six hours of the end time.
- An end time earlier than the start is after midnight.
- While the emergency stop is on, the start is skipped for that night and
  nothing is turned on.

Start now and Stop the show do the same by hand (Stop leaves the projectors
on). What happened last is shown under the time and kept in the log.

**Live view**, under the numbers, is a small picture of what each paired mini
PC is really putting out, about every 3 seconds, with how old the picture is
and "Offline" when the mini PC is not connected. It is not drawn by the
server: each player page keeps a 480 px wide copy of the very frame it just
drew for its projector (`captureOutput` in `OutputView.tsx`, taken right
after rendering) and sends it as a JPEG. Nothing photographs the screen,
and the Mini PC app is unchanged. Frames are sent only while someone has
the Dashboard open with the live view showing (its request sets a 30 second
"someone is watching" flag that each player sees in its `/me` reply).
Pictures are kept in memory only, one per player. Hide stops the fetching
on that browser.

| Method | Path | |
|---|---|---|
| GET/POST | `/mapping/scene-groups` | List (optionally `?show_id=`), make one (admin) |
| PATCH/DELETE | `/mapping/scene-groups/{id}` | Admin; changing tonight's group updates the cues |
| POST | `/mapping/scene-groups/{id}/use` | Operator: tonight's group, set on every cue now |
| GET/PUT | `/api/tonight` | Tonight's plan and where in it we are (`state`: off = nothing planned from today on, later, running, done, not_tonight = nothing tonight); PUT (operator) only sets `show_id`, the show Start now plays |
| POST | `/api/tonight/start`, `/api/tonight/stop` | Operator: start or stop now |
| GET | `/mapping/players/{id}/picture` | Viewer: the latest frame (JPEG; `X-Picture-Age` seconds); 204 when none |
| POST | `/mapping/players/me/picture` | The player page's copy of its frame (player token) |

Changes go out as `scene_groups` and `tonight` messages.

## 6c. The show calendar (Calendar page)

**Calendar** (left menu, Mapping show section; the phone remote's Calendar
tab) is the only thing that plans shows. Only nights with a show added
play; nothing fills nights in by itself. **Add a show** makes an entry:

- **When**: one night, or several nights (first and last night, and which
  weekdays). Every entry has a last night; there is no "every week
  forever".
- For a show: a scene group (or "keep the scenes the cues have"), a start
  and end time (an end before the start is after midnight), and whether to
  turn the projectors on and off. An optional name and note.

Which show times a night has (`backend/app/services/show_calendar.py`):

- A night with no entry has no show.
- The more specific entry wins: one night beats a run of nights, a short
  run beats a longer one. Equally specific: the newest wins.
- A "No show" entry cancels every less specific show that night ("No shows
  Nov 2 to 8" plus "Party on Nov 5" still plays the party). They are made
  by **No show on (night) only** in the editor of a run of nights (a night
  at either end of the run just shortens it instead).
- A show that would overlap a winning show that night is left out; the
  Calendar page says so under that night.

The same scheduler (services/tonight.py) plays them: at each show time's
start it uses that entry's scene group, presses GO and turns the
projectors on; at its end it stops and turns them off. Show times are
remembered by key ("2026-10-31:entry7"; "...:weekly" in the history of
nights before the weekly show time was removed), so a night can have
several. When one ends exactly as the next starts the show keeps
playing with the next group and the projectors stay on. Power-cut catch-up,
the six-hour end grace and the emergency stop work as in section 6b.
Tonight's show on the Dashboard and the phone's Tonight tab show what the
calendar plans today ("No show tonight" when nothing), the next show by
name and the nights coming up. The mini PC app holds its updates around
calendar show times too.

The weekly show time (`show_plan.enabled`, `start_at`, `end_at`, `days`) was
removed in migration c7e1a5d9f3b2: the nights it played from the day of the
upgrade to the end of that month became one-night entries (note "Moved from
the weekly show time"; nights the calendar already had were left alone), and
entries with no last night got the end of that month (or of the month they
start in). The columns stay but plan nothing.

The page has Month, Week and List views (List first on a phone), a colour per
scene group, the night picked with its details, and "Your shows" with every
entry (past ones folded away).

| Method | Path | |
|---|---|---|
| GET | `/api/calendar?start=YYYY-MM-DD&days=42` | Viewer: each night's show times (`slots`, with `state` done/running/later), the "no show" entry keeping it dark, shows left out and why, and every entry; up to 124 days |
| GET/POST | `/api/calendar/entries` | List; add one (operator; `end_date` required, at most a year after `start_date`) |
| PUT/DELETE | `/api/calendar/entries/{id}` | Operator: change (whole entry) or take off |

`/api/tonight` also returns `source` (calendar), `title`,
`entry_id`, `tonight_slots`, `cancelled_by` and `next_title`. Changes go out
as `calendar` and `tonight` messages.

## 6d. Show history, energy report and season wrap-up (Health → Show history)

Every show time is written down (`backend/app/services/show_history.py`,
table `show_nights`). The recorder listens to the show transport: the moment
the show plays, by the show time, Start now, GO on Run the show, the phone,
Home Assistant or an automation, a record opens; each cue and scene it goes
through is noted; it closes when the show stops, blacks out or the
emergency stop is pressed. Tonight's show adds the show time's name, its
planned times, the scene group and who started and stopped it. A show that
starts again within 15 minutes (a blackout by mistake, a server restart
mid-show) carries on the same record. A planned show time that ends with no
show is recorded as "Did not play" (with the emergency stop as the reason
when it held the show), and a start that failed as "Could not start".

While the show plays the recorder checks the show's mini PCs every 30
seconds: one out of touch for a minute is a problem ("lost its connection
at 7:57 PM, came back after 3 minutes"). When the record closes, the hours
each projector was on, the hottest temperature of each sensor and the
problems in the event log (projector stopped answering, switched off by
itself, projector warnings, emergency stop, automation failed, intake close
to its limit) are worked out and kept with the record, since temperature
samples are pruned after 30 days.

Hours on come from the power samples of the operational poll, counted per
hour: the share of samples that said on, times the part of the hour the
samples cover (so late polls and a server that was off do not skew it).
Energy is hours × watts: 1,000 W for the PT-DZ13K series and 830 W for
the DZ770 / DW740 / DX810 (Panasonic spec sheets, 120 V), 500 W for other
makes until set; price $0.17 per kWh until set. Both are set on the Energy
tab (table `history_settings`). Weeks run Monday to Sunday; hours before 6
AM count on the night before.

Seasons: Halloween (September 1 to October 31), Christmas (November 15 to
January 6), and any named run of nights on the calendar. For 21 days after
a season with shows ends, the Show history page and Tonight's show say so
and link the wrap-up: nights with a show, hours, problems, energy and cost,
the hottest night (air intake), longest show, nights that did not play,
what played most, and every show as a strip. Shows under 10 minutes (a
test) are listed but not counted as nights. On first start the last 30
days of Tonight's show log lines are turned into records.

| Method | Path | |
|---|---|---|
| GET | `/api/history/nights?days=60` | Viewer: every show time, newest first, with timeline, problems, hours, temperatures, kWh and cost |
| GET | `/api/history/energy?weeks=8` | Viewer: hours, kWh and cost per projector per week, per night, totals |
| PUT | `/api/history/energy/settings` | Operator: price per kWh, currency sign, watts per projector |
| GET | `/api/history/seasons` | Viewer: seasons with shows, and the one that just finished |
| GET | `/api/history/wrapup?start=&end=&name=` | Viewer: the wrap-up for any run of nights (up to 400) |

Changes go out as `show_history` messages.

## 6e. Scene playlists (Dashboard, Playlists)

A playlist is scene groups taking turns through the night: "Spooky from
6:45 PM, Pumpkins from 8:00 PM, Quiet from 9:30 PM", each step with a fade
(cut, or 2 to 30 seconds). Make them in **Playlists** under "Pick tonight's
scenes" on the Dashboard; clicking one plays it now and on tonight's show
when tonight has one added for that night alone (picking a single group
again takes it off). A calendar entry can pick a
playlist instead of a scene group. The phone's Tonight tab can pick one too.

How steps are placed on a night (`backend/app/services/playlists.py`):

- A time on or after the show time's start plays that evening. A time up to
  six hours before the start counts as the start (6:30 in a 6:45 show).
  Any other earlier time is after midnight (00:30 in a 6 PM to 1 AM show).
- Before the first step's time the first step plays; a step after the show
  time ends never plays (shown struck through).
- Steps are kept in the night's order, noon to noon. Deleting a scene group
  removes its steps; a playlist left with none is deleted.

The scheduler (services/tonight.py) starts a show time on the step due then
(a power cut mid-show comes back on the right step). Every 20 seconds it
checks whether the next step's time has come; if the show is playing it
writes that group into every cue, as "Use" does, and crossfades: the
transport sends the scenes the live cue had as `previous` with an id below
-1,000,000,000 and no media, and `fade_started_at_ms`, then the outputs hear
`mapping_show` and load the new scenes. Videos keep playing untouched; only
the scenes fade, over the step's fade. Auto-follow of the live cue carries
on. A show stopped by hand is not moved on, and Start now picks the step
due now. Changing a group that plays later waits for its turn; the step on
now changes the projectors at once.

| Method | Path | |
|---|---|---|
| GET/POST | `/api/mapping/playlists` | List (`?show_id=`); make one (admin): `name`, `steps` [{`at` "HH:MM", `group_id`, `fade_seconds` 0 to 30}] |
| PUT/DELETE | `/api/mapping/playlists/{id}` | Admin: change (whole playlist) or delete |
| POST | `/api/mapping/playlists/{id}/use` | Operator: play it tonight (and on tonight's one-night show) |

Calendar entries and slots carry `playlist_id` (and slots `playlist_name`).
`/api/tonight` adds `playlist_id`, `playlist_name`, `playlist_steps`
(`starts_at`, `group_name`, `fade_seconds`, `state` done/now/later/never),
and `plan_group_id` / `plan_playlist_id` for the group or playlist picked last (what Start now plays with nothing planned);
`group_id`/`group_name` are then the step on now. Changes go out as
`playlists` messages. Nothing on the mini PCs changes: the player pages
already draw a crossfade between the scenes of `previous` and `current`.

## 6f. The show designer: a timeline per cue (Mapping → Show designer)

A cue can carry a **timeline** (`mapping_cues.timeline`, migration
d7a3f9c2e5b1): a video editor's worth of clips that come and go while the
cue plays. `{length, end, tracks, clips[]}`:

- `length` seconds (1 to 3600); `end` is `loop` (round and round),
  `next` (the server's auto-follow moves on after `length`, unless the cue's
  own `follow_seconds` is set) or `hold` (stay on the last moment).
- Each clip has `kind` `media` (a video or picture), `element` (any element
  from the library, as a scene layer in `layer`) or `sound`; a row
  (`track`, higher rows draw on top), `start` and `length`; `enter` / `exit`
  (`fade`, slide from `left`/`right`/`top`/`bottom`, `grow`, `spin`, `none`)
  with their seconds; `opacity`.
- Pictures and videos sit in a box: `pin` {x, y (middle, canvas
  fractions), size (height in canvas heights), rotation}, shown at the
  file's own shape, and may be kept to a house part with `target`
  (windows, walls…). Videos and sounds have `offset` (seconds into the
  file), `loop`, `volume`; a video's own sound plays with `sound`.
- `keys` are moves: `{t (seconds into the clip), pins[], opacity}`; the
  clip glides from key to key (eased). For an element the pins are each of
  its objects (or a mover's path points); for a picture, its box.
- Sounds (and a video's own sound) play on **one** mini PC: the projector in
  `output_id`, or the show's first projector. Every other output stays
  silent, so several projectors never echo. Chrome on the mini PCs already
  runs with `--autoplay-policy=no-user-gesture-required`.

Drawing: `scene/timeline.ts` turns the clips on at the cue's moment into
scene items, one per clip, drawn between the cue's scenes and its elements;
pictures and videos are the engine's `picture` layer in a box
(`SceneItem.media`). `timelineMedia.ts` keeps each video and sound clip's
`<video>`/`<audio>` at the timeline's time, like cue media (rate nudges,
seeks past 0.15 s), made 3 s before the clip starts; GIF, animated WebP and
AVIF move frame by frame through WebCodecs' ImageDecoder (a still where it
is missing). Pause holds the timeline at `paused_position`.

Media the library takes: video MP4/M4V/MOV (H.264 or HEVC), WebM (VP8, VP9,
AV1), OGV; pictures PNG, JPEG, WebP, GIF, AVIF, BMP; sound MP3, WAV, M4A,
AAC, OGG/OGA/Opus, FLAC (`kind` `audio`; they play only on timelines, a cue
or projector cannot show one). ProRes, HAP and MKV are refused: Chrome does
not play them. HEVC needs the mini PC's graphics to decode it (any Intel
from 7th generation on does); H.264 plays everywhere.

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
