# Drawing aids

Object snaps, ortho, polar and object tracking, dynamic input and the UCS.

| Aid | Key | What it does |
| --- | --- | --- |
| **OSNAP** (object snap) | <kbd>F3</kbd> | Snaps the cursor to exact points of objects: endpoint, midpoint, center, geometric center, node, quadrant, intersection, apparent intersection, perpendicular, tangent, nearest, extension, parallel, insertion and the 3D face snaps. Click the ▾ next to OSNAP or type `OSNAP` to choose the modes |
| **ORTHO** | <kbd>F8</kbd> | Restricts the cursor to horizontal and vertical directions |
| **POLAR** (polar tracking) | <kbd>F10</kbd> | Near a multiple of `POLARANG` (90° by default; 45, 30, 15…) from the base point, the cursor runs along that dashed ray; a typed distance goes that way. ORTHO and POLAR exclude each other |
| **SNAP** | <kbd>F9</kbd> | Snaps the cursor to a grid of fixed spacing |
| **OTRACK** (object snap tracking) | <kbd>F11</kbd> | Hover a snap point to acquire it; dashed tracking lines show alignments with it |
| **DYN** (dynamic input) | <kbd>F12</kbd> | After the first point, typed `x,y` is relative without `@` |
| **LWT** (lineweights) | | Shows lineweights in the model, in pixels that do not change with the zoom (thicker than 0.25 mm only). It is saved with the drawing (`LWDISPLAY`); layouts always show lineweights |

Measure distances with `DIST`. `ID` shows the coordinates of a point, `AREA` the area and perimeter of points or
an object (with `Add area`/`Subtract area` for a running total), `LIST` the properties of the selected objects and
`MASSPROP` the volume, surface area, bounding box and centroid of solids.

## UCS

The **UCS** (user coordinate system) defines where X, Y and Z point. Drawing commands work on its XY plane, so
to draw on a face of a solid you first align the UCS to it. `UCS` offers: World, Origin, 3 points, Object,
Face, View, X/Y/Z rotations, Previous, and named UCSs (Save/Restore). The UCS icon shows its axes.

When you switch to a standard view (`VIEW FRONT`, `VIEW RIGHT`, or the view cube), Cota aligns the
construction plane with the view, so you always draw on the plane you are looking at.

## Typed distances on tracking

While the cursor runs along a tracking line, a polar ray, an extension or a parallel path, type a number and press
<kbd>Enter</kbd>: the point goes at that distance along the line. It works at any point prompt, for example to start
a polyline 25 to the right of a corner.

**See also:** [Object snaps and tracking](../reference/object-snaps.md) · [UCS](../reference/tools.md#ucs)
