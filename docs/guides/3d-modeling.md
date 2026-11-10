# 3D modeling

Solids from primitives and profiles, booleans, edge fillets, moving in 3D and looking at the model.

## Creating solids

- **Primitives:** `BOX`, `CYLINDER`, `CONE` (also truncated), `SPHERE`, `TORUS`.
- **From profiles:** `EXTRUDE` a closed profile (polyline, circle, rectangle, ellipse, closed spline…) to a
  height; `REVOLVE` it around an axis.
- **Booleans:** `UNION`, `SUBTRACT` (select the solids to keep, <kbd>Enter</kbd>, then the ones to remove),
  `INTERSECT`.
- **Edges:** `FILLETEDGE` and `CHAMFEREDGE` round or bevel the edges of a solid; corners where two treated edges
  meet are blended.
- **Cutting:** `SLICE` cuts solids with a plane, keeping one side or both.
- **Threads:** `THREAD` adds a cosmetic ISO/IRAM thread to a cylindrical face; it also shows in the drawing views.

Primitives and extrusions stay parametric: select one and change its dimensions in Properties.

Object snaps work on the real edges of solids: endpoints at the corners, midpoints of the edges, and the center
and quadrants of round edges, also after booleans and fillets. Profiles with arcs keep them when extruded.

## Moving in 3D

With a base point, the cursor moves in the plane through that point, so a part moved in an isometric view keeps
its height unless you snap to something else or type a `z`. `MOVE`, `COPY`, `ROTATE`, `MIRROR`, `SCALE`, `ARRAY` and `ALIGN` work on solids in any view. `ROTATE`
rotates about an axis perpendicular to the current view, so to turn a part about a vertical axis use the
Top view, and about a horizontal axis use Front or Right.

## Looking at the model

- **Views:** the **unfolded view cube** (top-right corner) or `VIEW` with `TOP`, `BOTTOM`, `FRONT`, `BACK`, `LEFT`,
  `RIGHT`, `SWISO`, `SEISO`, `NEISO`, `NWISO`. The cube is laid out flat like the views of a drawing: click a
  **face** for that view, an **edge** for the 45° view between its two faces (TOP·FRONT…) or a **corner** for the
  isometric. A **yellow dot** shows where the camera is and moves as you orbit. The **ISO-E / ISO-A** button
  switches the layout between first-angle projection (the default: the top view goes below the front view) and
  third-angle projection (top view above), and is remembered. `VIEW` also saves and restores **named views**. `PLAN` looks at
  the XY plane of the UCS.
- **Projection:** `PERSPECTIVE` and `ORTHOGRAPHIC`.
- **Visual styles** (`VSCURRENT`): `2Dwireframe`, `3Dwireframe`, `Hidden`,
  `Shaded`, `shadedEdges`.
- **Viewports:** `VPORTS` splits the screen into several viewports, each with its own view. Click a viewport
  (or <kbd>Ctrl</kbd>+<kbd>R</kbd>) to make it current.
- **Undo** also undoes view changes, so you can go back to the previous view with `UNDO` or `ZOOM Previous`.

## 2D from 3D

- `FLATSHOT` creates a flat 2D drawing of the solids as seen in the current view (visible and hidden lines).
- `SOLPROF` creates profile lines of the solids inside a layout viewport, on layers for visible and hidden
  lines.

**See also:** [Draw commands › modeling](../reference/draw.md#extrude) · [Modify commands › solid editing](../reference/modify.md#union)
