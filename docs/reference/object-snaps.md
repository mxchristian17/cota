# Object snaps and tracking

Object snaps place points exactly on the geometry: the end of a line, the center of a hole, the point where two
edges cross. They work in 2D and on the real edges and faces of 3D solids, in any view and UCS.

There are two ways to use them:

- **Running snaps** are always active while a command asks for a point. Turn them on and off with
  <kbd>F3</kbd> or the OSNAP button of the status bar; choose which ones run with `OSNAP` or the ▾ next to the
  button.
- **A single snap**: type its abbreviation at a point prompt (for example `CEN`) and the next point uses only that
  snap, whatever the running snaps are. `NON` turns snaps off for that one point.

When the cursor is near a snap point, a marker shows which snap it is and a tooltip names it. If several snaps
fall in the same place, Cota prefers the more specific one (an endpoint over a nearest point) and, in 3D, the one
closer to you.

## The snaps

| Snap | Type | Running by default | Snaps to |
| --- | --- | --- | --- |
| Endpoint | `END`, `ENDP` | Yes | The ends of lines, arcs, polyline segments, splines and the corners of solids. |
| Midpoint | `MID`, `MIDP` | Yes | The middle of lines, arcs, polyline segments, splines (by length) and the edges of solids. |
| Center | `CEN` | Yes | The center of circles, arcs, ellipses and the round edges of solids (also after fillets and booleans). |
| Geometric center | `GCE`, `GCEN` | No | The centroid of a closed polyline or polygon. |
| Quadrant | `QUA`, `QUAD` | Yes | The 0°, 90°, 180° and 270° points of circles, arcs and ellipses, in their own plane. |
| Intersection | `INT` | Yes | Where two objects cross, including lines that cross the edges of solids. |
| Apparent intersection | `APP`, `APPINT` | No | Where two objects seem to cross in the current view, even if they are at different heights. |
| Perpendicular | `PER`, `PERP` | No | The point of an object where a line from the last point is perpendicular to it. On the first point of a line, the line is solved later (deferred perpendicular). |
| Tangent | `TAN` | No | The point of a circle or arc where a line from the last point is tangent. On the first point of a line, or in CIRCLE 3P/Ttr, the tangency is solved when the other points are known. |
| Nearest | `NEA`, `NEAR` | No | The point of an object nearest to the cursor. |
| Node | `NOD`, `NODE` | No | Point objects and the fit points of splines. |
| Extension | `EXT` | Yes | Points along the extension of a line or arc: pause over an end, then move along its direction. |
| Parallel | `PAR` | No | A direction parallel to a line: pause over the line, then move near the parallel direction. |
| Insertion | `INS` | No | The insertion point of blocks, texts and attribute definitions. |
| Center of face (3D) | `ZCEN` | No | The center of the planar face of a solid under the cursor. |
| Perpendicular to face (3D) | `ZPER` | No | The foot of the perpendicular from the last point to the face under the cursor. |
| Nearest to face (3D) | `ZNEA` | No | The point of the face under the cursor. |

## Point modifiers

Typed at a point prompt, they build the point from other points:

| Modifier | Type | What it does |
| --- | --- | --- |
| Mid between 2 points | `M2P`, `MTP` | `First point of mid:` and `Second point of mid:` (with snaps): the point halfway between them. |
| From | `FROM`, `FRO` | `Base point:` then `<Offset>:` such as `@10,5`: the point is relative to the base point, not to the last point. |
| None | `NON`, `NONE` | No snap for this point. |

**Example**: a circle centered between the ends of two lines, and a line starting 10 to the right of a corner.

```text
LINE 0,0 100,0 ""
LINE 0,40 100,40 ""
CIRCLE M2P 0,0 100,40 8
LINE FROM 100,0 @10,0 @0,40 ""
```

## Tracking

**Object snap tracking** (<kbd>F11</kbd>): pause the cursor over a snap point for a moment to *acquire* it (a small
cross marks it). Moving away horizontally, vertically or along polar angles from it shows a dotted tracking line;
where two tracking lines cross, or a tracking line crosses an object, the cursor snaps.

**Polar tracking** (<kbd>F10</kbd>): from the base point, the cursor locks to multiples of `POLARANG`. **ORTHO**
(<kbd>F8</kbd>) locks it to horizontal and vertical; ORTHO and POLAR exclude each other.

**A typed distance follows the tracking line**: while the cursor runs along any tracking, extension or parallel
line, type a number and press <kbd>Enter</kbd>: the point is placed at that distance along the line, from its
origin. It works at any point prompt, for example to start a polyline 25 to the right of a corner, or to place a
circle center on the extension of an edge.

**Extension** and **Parallel** work the same way: pause over a line (or an arc for Extension) to acquire it, then
the dotted path appears when the cursor is near its extension or near the parallel through the base point.

## On 3D solids

- Snaps use the real edges of solids, not the triangles of their display: Endpoint at the corners, Midpoint on the
  straight edges, and Center, Quadrant, Tangent and Perpendicular on the round edges, also after EXTRUDE of
  profiles with arcs, booleans, FILLETEDGE and CHAMFEREDGE.
- In 3D views snaps work from any angle. When a point at the front and one at the back fall on the same pixel, the
  one closer to you wins.
- `ZCEN`, `ZPER` and `ZNEA` snap to faces.
- Dynamic UCS (`UCSDETECT`): while a drawing command waits for its first point, hovering a flat face puts the UCS
  on it, so the new geometry is drawn on that face.
