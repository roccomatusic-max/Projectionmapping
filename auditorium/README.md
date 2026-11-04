# Auditorium Projection Planner + Show Player

A desktop app for projection-mapping the **side walls** of an auditorium,
built for a school production of *Matilda the Musical JR.*

It has two parts:

1. **Planner** — model the room and the projectors, and see what each projector
   will cover, how bright and how sharp it will be, and where audience shadows
   fall, before anything is hung.
2. **Player** — run the show: a full-screen output per projector, warped and
   blended onto the angled walls, with masks for exit signs, and a cue list
   with a GO button.

It is one Electron + TypeScript app. The Planner's drawings use the HTML
canvas; the Player's warping and blending (phase 3 onward) use WebGL.

## Where things stand

| Phase | What | Status |
|---|---|---|
| 1 | Planner core: room and projector inputs, top-down view, wall elevation views, footprint math | **Done, ready to test** |
| 2 | Planner analysis: brightness, sharpness and shadow heat maps, obstruction conflicts, blend overlap, summary export | planned |
| 3 | Player outputs: display detection, output windows, test patterns, corner pin, operator preview | planned |
| 4 | Player alignment: mesh warp, edge blending, masks, import from Planner | planned |
| 5 | Cues: media playback, cue list, GO / Back / Panic, preloading, autosave | planned |
| 6 | Hardening: show mode, error handling, four-output performance check, optional OSC | planned |

JSON save / load, which the brief lists under phase 2, is already in, so you
can keep a plan between test sessions.

---

## Installing (first time only)

You need **Node.js**, which is the runtime the app is built with. The app
itself is not yet packaged as an installer; you run it from this folder.

### 1. Install Node.js

1. Go to <https://nodejs.org> in your browser.
2. Click the big **Download Node.js (LTS)** button. "LTS" means the stable
   long-term version; version 20 or 22 both work.
3. Open the downloaded installer and click **Next** through it, accepting the
   defaults. On Windows, leave "Add to PATH" ticked.
4. Check it worked: open a terminal
   (**Windows:** press the Windows key, type `cmd`, press Enter.
   **Mac:** press ⌘ Space, type `Terminal`, press Enter)
   and type:

   ```bash
   node --version
   ```

   You should see something like `v22.11.0`. If you see "not recognised" or
   "command not found", close the terminal, open a new one, and try again.

### 2. Get this folder onto your computer

If you have Git installed:

```bash
git clone https://github.com/roccomatusic-max/Projectionmapping.git
```

Otherwise, on the GitHub page click the green **Code** button, then
**Download ZIP**, and unzip it somewhere easy to find, like your Documents
folder.

### 3. Install the app's dependencies

In the terminal, move into the `auditorium` folder inside what you just
downloaded. For example, if it is in Documents:

```bash
cd Documents/Projectionmapping/auditorium
```

(On Windows, `cd Documents\Projectionmapping\auditorium`.) Then type:

```bash
npm install
```

This downloads Electron (the desktop-app engine, about 100 MB) and the other
libraries. It takes a minute or two and prints a lot of text. Warnings about
"vulnerabilities" are normal and can be ignored; only a line starting with
`npm ERR!` is a problem.

## Running the Planner

From the `auditorium` folder:

```bash
npm start
```

That builds the app (a few seconds) and opens the Planner window. Leave the
terminal open while you use it; close the window or press Ctrl+C in the
terminal to stop.

Your work is kept automatically as a draft inside the app, so closing and
reopening brings back what you had. To keep a plan as a file, use **Save**
(it is an ordinary `.json` file you can email or back up).

---

## Phase 1: what works and how to test it

### What works

- **Room**: a top-down trapezoid (front width, back width, length, wall
  height), or, for an odd-shaped room, each wall's two endpoints directly.
- **Audience zone**: a top-down polygon plus seated and standing head heights
  (the shadow check that uses them is phase 2).
- **Projectors**: add, remove, duplicate. Position, mount height, pan, tilt,
  roll, lumens, resolution, throw-ratio range and the ratio in use, lens shift,
  target wall, colour, and an on/off switch. **Aim** buttons point a projector
  at the front or back half of its wall and zoom to fit the wall height.
- **Obstructions**: rectangles on each wall (exit sign, door, speaker, sconce)
  with a "never project here" flag.
- **Wall surface**: gain and derate (used by the brightness map in phase 2).
- **Units**: feet and inches, or metric, from the toolbar toggle. Length
  fields accept `12' 6"`, `12.5`, `3.8m`, `380cm`, `150"`.
- **Top-down view**: room, stage edge, audience zone, each projector with its
  beam and where its image lands on the wall (thick bar). Dashed lines show any
  part of the image that spills past the wall.
- **Wall elevation views**: each wall flattened, as seen standing in the room
  facing it, with every footprint (including keystone), obstructions, and a
  size label.
- **Results table**: full image size, the part that lands on the wall, area,
  throw distance (centre and range), incidence angle, keystone (near and far
  edge heights) and warnings.
- **Help tab**: "How the numbers work".
- **Save / Open / Save as / New** (also in the File menu, with Ctrl+S etc.),
  **Undo** (Ctrl+Z).
- **Unit tests** for the geometry: 44 hand-checked cases (`npm test`).

### Test walkthrough (about 15 minutes)

1. **Start it.** In the terminal, in the `auditorium` folder, run `npm start`.
   A dark window titled "Auditorium Projection Planner" opens. It starts with
   a made-up 60 × 72 × 80 ft room and four projectors already cross-shooting.
2. **Look at the top-down view.** The stage is the yellow line at the top. The
   two side walls are the thick pale lines. Each projector is a coloured dot in
   a back corner with a coloured wedge to the opposite wall, and a thick
   coloured bar on the wall where its image lands. Below is the results table.
3. **Enter your room.** Click the **Room** tab on the left. Type your real
   front width, back width, length and wall height. Try typing `62' 6"` and
   pressing Enter; then try `19 m`. The drawing and the table update as you
   leave each field.
4. **Switch units.** Click **metric** at the top. Every length in the app
   changes to metres. Click **ft / in** to go back.
5. **Edit a projector.** Click the **Projectors** tab. Click the ▾ on
   "Back-Left A" to expand it. Change its mount height to `18'` and watch the
   wedge and the table change. Change **Pan** by typing a number; the wedge
   swings. Now click **Front half + zoom**: the projector is re-aimed at the
   front half of the right wall and the throw ratio is chosen so the image is
   as tall as the wall. The status bar at the bottom says what it did.
6. **Check the wall view.** Click **Right wall** above the drawing. You are
   looking at the right wall from inside the room: STAGE is to your left. Each
   footprint is a coloured four-sided shape (trapezoid, because of the oblique
   angle). The label gives its size. Dashed outlines show any part that spills
   above or below the wall. Click **Left wall** and check the stage is now to
   your right.
7. **Add an obstruction.** Click **Obstructions** on the left, then **+ Add**
   under "Right wall". Name it "Exit sign", set "From stage end" to `5'`,
   "Bottom height" to `9'`, width `1' 6"`, height `10"`, and tick **Never
   project here**. In the Right wall view it appears as a red hatched box.
   (Phase 2 will flag footprints that overlap it; for now it is just drawn.)
8. **Try the lens range.** Expand a projector and set the throw ratio range to
   `1.2` – `1.8`, then click **Back half + zoom**. The status bar explains that
   the lens cannot zoom tight enough and the table shows the spill percentage.
   Set the range back to `1.8` – `4`.
9. **Duplicate and remove.** Expand a projector, click **Duplicate**: a copy
   appears below it. Click **Remove** on the copy and confirm.
10. **Save and reopen.** Click **Save**, choose a place and name, click Save.
    The status bar shows the path. Click **New** (confirm), then **Open…**
    and pick your file: your room comes back.
11. **Undo.** Change a number, then click **Undo** (or press Ctrl+Z while not
    in a text field). The change reverts.
12. **Read the help.** Click **How the numbers work** above the drawing and
    check it matches what you expected.

If anything looks wrong, note which step, what you typed and what you saw.
The **View → Toggle Developer Tools** menu item opens a console that may show
an error message worth copying.

### Running the unit tests yourself

```bash
npm test
```

You should see `Tests  44 passed`. These check the maths against hand-worked
cases (for example: a projector with throw ratio 2 that is 10 ft from a wall
makes an image exactly 5 ft wide).

---

## How the numbers work

Everything below is implemented in `src/shared/projection.ts` and
`src/shared/geometry.ts`, and tested in `tests/`.

### Coordinates and units

- Lengths are stored in feet and shown in feet-and-inches or metres.
- **x** runs across the room (0 = centre line, negative = house left).
  **y** runs from the stage edge (0) toward the back wall. **z** is height
  above the floor.
- **Pan** 0° faces the stage; positive pan turns toward house right.
  **Tilt** positive looks up. **Roll** positive is clockwise as seen from
  behind the projector.

### 1. The projector's frustum

A projector is treated as a pinhole at the lens. With throw ratio *T*
(throw distance ÷ image width) and native resolution *W × H*, the image one
unit in front of the lens is a rectangle

```
width  = 1 / T
height = (H / W) / T
```

Lens shift slides that rectangle by a fraction of its own size, so
*+0.5 vertical* puts the bottom edge of the image on the lens axis. Any image
point with normalised coordinates *(a, b)* in [−1, 1]² leaves the lens along

```
d = forward + right · (a·width/2 + width·shiftH) + up · (b·height/2 + height·shiftV)
```

where *forward / right / up* are built from pan, tilt and roll (yaw about the
vertical, then tilt about the projector's right axis, then roll about its
forward axis).

### 2. Ray–plane intersection

Each wall is a vertical plane through its two floor endpoints with unit normal
*n* pointing into the room. A ray from the lens *O* in direction *d* hits the
plane at

```
t   = ((P₀ − O) · n) / (d · n)
hit = O + t · d
```

If *d · n* is 0 the ray is parallel to the wall; if *t ≤ 0* the wall is behind
the lens. Either way that corner "misses" and the footprint is flagged
invalid. The hit is then expressed in wall coordinates: *s* along the wall
from its stage end, *h* above the floor.

### 3. Footprint and keystone

The four corner rays give a four-sided footprint on the wall. Because the
projector is off to one side, the far side of the image is bigger than the
near side: that is keystone, and the table shows the near-edge and far-edge
heights so you can see how much the Player's corner-pin will have to correct.
The footprint is clipped to the physical wall rectangle (Sutherland–Hodgman
polygon clipping); the on-wall percentage is clipped area ÷ total area, both
by the shoelace formula.

### 4. Throw distance and incidence

Throw distance is *t* for the centre ray and for each corner. Incidence is
the angle between the ray and the wall normal, `acos(|d · n|)`: 0° is
square-on, 60°+ is very oblique (soft focus at the far side, strong keystone).

### 5. Pixel density (sharpness)

The image is divided into an *n × n* grid; the wall area each cell covers is
computed from its four corner hits. Pixels per foot at that cell is

```
pixelsPerFoot = √( pixelsInCell / cellArea )
```

Phase 2 draws this as a heat map on the wall elevation.

### 6. Aiming helpers

"Aim at" solves pan and tilt so the lens axis points at the target
(`pan = atan2(dx, −dy)`, `tilt = atan2(dz, horizontal distance)`), then
corrects for lens shift by measuring the angle between the axis and the
shifted image centre and pulling the aim back by that amount. "Zoom" picks
the throw ratio that makes the image 95 % of the wall height at that
distance, clamped to the lens's range.

### Coming in phase 2

- **Brightness** (foot-lamberts) = lumens × gain × derate ÷ area, weighted by
  cos(incidence) per cell. Green ≥ 8 fL, yellow 5–8, red < 5.
- **Shadow check**: the beam path to each wall point tested against the
  audience volume at seated and standing head height.
- Blend overlap width and percentage, obstruction conflicts, PDF/PNG summary.

---

## The plan file

**Save** writes a plain JSON file. Lengths are in feet, angles in degrees:

```json
{
  "schema": "auditorium-plan",
  "version": 1,
  "name": "Untitled auditorium",
  "units": "imperial",
  "room": { "walls": { "left": { "front": {"x": -30, "y": 0}, "back": {"x": -36, "y": 80} }, "right": { "..." : "..." } }, "wallHeight": 20 },
  "audience": { "outline": [ {"x": -24, "y": 12}, "..." ], "seatedHeadHeight": 4, "standingHeadHeight": 6 },
  "projectors": [ { "name": "Back-Left A", "position": {"x": -33, "y": 77}, "mountHeight": 16, "pan": 48.5, "tilt": -4, "roll": 0, "lumens": 8000, "resolution": {"width": 1920, "height": 1200}, "throwRatio": {"min": 1.8, "max": 4}, "throwRatioUsed": 2.84, "lensShift": {"horizontal": 0, "vertical": 0}, "targetWall": "right", "..." : "..." } ],
  "obstructions": [ { "wall": "left", "name": "Exit sign", "kind": "exit-sign", "s": 4, "z": 9, "width": 1.5, "height": 0.8, "neverProject": true } ],
  "surface": { "gain": 0.8, "derate": 0.8, "color": "#d9d4c7" }
}
```

## For developers

```bash
npm test          # unit tests (vitest)
npm run typecheck # TypeScript, renderer and main process
npm run build     # compile main process to dist-electron/ and renderer to dist/
npm start         # build, then launch Electron
npm run dev       # renderer only, in a browser at the URL Vite prints (file dialogs fall back to browser downloads)
```

Layout:

```
electron/        main process (windows, menu, file dialogs) and preload bridge
src/shared/      plan types, defaults, units, geometry, projection math (no DOM; shared with tests and, later, the Player)
src/planner/     the Planner UI (React): store, editor panels, canvas views
tests/           vitest unit tests for the maths
```
