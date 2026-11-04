export function HelpPanel() {
  return (
    <div className="help">
      <h2>How the numbers work</h2>
      <p>
        Every number in the Planner comes from a small set of formulas. The same text is in the README under
        "How the numbers work", and the unit tests in <code>tests/</code> check them against hand-worked cases.
      </p>

      <h3>Coordinates and units</h3>
      <ul>
        <li>Lengths are stored in feet and shown in feet-and-inches or metres (toolbar toggle).</li>
        <li>
          <b>x</b> runs across the room (0 = centre line, negative = house left). <b>y</b> runs from the stage edge
          (0) toward the back wall. <b>z</b> is height above the floor.
        </li>
        <li>
          <b>Pan</b> 0° faces the stage; positive pan turns toward house right. <b>Tilt</b> positive looks up.{" "}
          <b>Roll</b> positive is clockwise as seen from behind the projector.
        </li>
      </ul>

      <h3>1. The projector's frustum</h3>
      <p>
        A projector is treated as a pinhole at the lens. With throw ratio <i>T</i> (throw distance ÷ image width)
        and native resolution <i>W × H</i>, the image one unit in front of the lens is a rectangle
      </p>
      <pre>
        width  = 1 / T{"\n"}
        height = (H / W) / T
      </pre>
      <p>
        Lens shift slides that rectangle by a fraction of its own size, so <i>+0.5 vertical</i> puts the bottom edge
        of the image on the lens axis. Any image point with normalised coordinates <i>(a, b)</i> in [−1, 1]² leaves
        the lens along
      </p>
      <pre>
        d = forward + right · (a·w/2 + w·shiftH) + up · (b·h/2 + h·shiftV)
      </pre>
      <p>where forward / right / up are built from pan, tilt and roll.</p>

      <h3>2. Ray–plane intersection</h3>
      <p>
        Each wall is a vertical plane through its two floor endpoints with unit normal <i>n</i> pointing into the
        room. A ray from the lens <i>O</i> in direction <i>d</i> hits the plane at
      </p>
      <pre>
        t = ((P₀ − O) · n) / (d · n){"\n"}
        hit = O + t · d
      </pre>
      <p>
        If <i>d · n</i> is 0 the ray is parallel to the wall; if <i>t ≤ 0</i> the wall is behind the lens. Either way
        that corner "misses" and the footprint is flagged invalid. The hit is then expressed in wall coordinates:
        <i>s</i> along the wall from its stage end, <i>h</i> above the floor.
      </p>

      <h3>3. Footprint and keystone</h3>
      <p>
        The four corner rays give a four-sided footprint on the wall. Because the projector is off to one side, the
        far side of the image is bigger than the near side: that is keystone, and the table shows the near-edge and
        far-edge heights so you can see how much the Player's corner-pin will have to correct. The footprint is then
        clipped to the physical wall rectangle (Sutherland–Hodgman), and the on-wall percentage is clipped area ÷
        total area.
      </p>

      <h3>4. Throw distance and incidence</h3>
      <p>
        Throw distance is <i>t</i> for the centre ray and each corner. Incidence is the angle between the ray and the
        wall normal: 0° is square-on, 60°+ is very oblique (soft focus at the far side, strong keystone).
      </p>

      <h3>5. Pixel density (sharpness)</h3>
      <p>
        The image is divided into an <i>n × n</i> grid; the wall area each cell covers is computed from its four
        corner hits. Pixels per foot at that cell is
      </p>
      <pre>pixelsPerFoot = √( pixelsInCell / cellArea )</pre>
      <p>Phase 2 draws this as a heat map on the wall elevation.</p>

      <h3>Coming in phase 2</h3>
      <ul>
        <li>
          <b>Brightness</b> (foot-lamberts) = lumens × gain × derate ÷ area, weighted by cos(incidence) per cell.
        </li>
        <li>
          <b>Shadow check</b>: the beam path to each wall point tested against the audience volume at seated and
          standing head height.
        </li>
        <li>Blend overlap width and percentage; obstruction conflicts; PDF/PNG summary.</li>
      </ul>
    </div>
  );
}
