# Entering points and distances

Absolute, relative, polar and typed distances.

Click in the drawing, or type coordinates. Typed coordinates are **absolute**; put `@` in front to make them
**relative to the previous point**.

| You type | Meaning |
| --- | --- |
| `10,20` | X = 10, Y = 20 |
| `10,20,5` | The same with Z |
| `@10,20` | 10 to the right and 20 up from the last point |
| `50<30` / `@50<30` | Polar: 50 units at 30° (counterclockwise from the X axis), from the origin / from the last point |
| `@50<30,10` | Cylindrical: polar in XY plus Z |
| `@50<30<45` | Spherical: 45° above the XY plane |
| `#10,20` | Absolute in the current UCS (also with dynamic input) |
| `*10,20` | Absolute in the world coordinate system (ignores the UCS) |
| `40` | **Direct distance**: 40 units in the direction of the cursor (great with ORTHO) |

Angles are in degrees. Coordinates are in the current **UCS** (user coordinate system); see [UCS](drawing-aids.md#ucs).

With **dynamic input** on (<kbd>F12</kbd> or **DYN** in the status bar), `10,20` after the first point is
relative to the last point, as in the input box next to the cursor of classic CAD; `#10,20` stays absolute.

**See also:** [Drawing aids](drawing-aids.md) · [Object snaps and tracking](../reference/object-snaps.md)
