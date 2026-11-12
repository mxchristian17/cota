# Draw commands

Commands of the **Draw** menu: lines and curves, text, points, blocks, hatches and 3D solids. Every prompt shown
here is the exact text Cota prints in the command line. Options in square brackets are chosen by typing their
capitalized letters (or clicking them); a value in angle brackets is the default that <kbd>Enter</kbd> accepts.

Points can be clicked, snapped or typed: `x,y` is absolute, `@dx,dy` is relative to the last point and
`@d<a` is a distance and an angle. While the cursor follows a tracking or polar path, typing a number places
the point at that distance along the path. See [entering points](../guides/coordinates.md).

## LINE

Draws straight segments one after another. Each segment is a separate line object, so you can edit them one by
one. Closing the chain turns it into a single closed polyline, ready to extrude or hatch.

**Aliases** `L` · **Menu** Draw

**Steps**

1. `Specify first point:` the start of the first segment.
2. `Specify next point or [Close/Undo]:` the end of the segment. The prompt repeats, and each new segment starts
   where the last one ended.
3. Press <kbd>Enter</kbd>, <kbd>Space</kbd> or <kbd>Esc</kbd> to finish. The segments already drawn stay.

**Options**

| Option | What it does |
| --- | --- |
| `Close` | Draws the last segment back to the first point and replaces the chain with one closed polyline. Clicking the first point again does the same. |
| `Undo` | Removes the last segment and goes back to its start point. |

**Example**: a 100 × 50 rectangle as a closed outline.

```text
LINE 0,0 @100,0 @0,50 @-100,0 C
```

**Notes**

- With the Tangent or Perpendicular object snap on the first point, the line is solved when you give the second
  point: it leaves the curve tangent (or perpendicular) to it. The preview shows the solution while you move.
- Lines are drawn in the plane of the current view and UCS. In 3D views a typed `x,y,z` places points anywhere.
- See also [PLINE](#pline) for one object with straight and arc segments, [XLINE](#xline) and [RAY](#ray).

## XLINE

Draws construction lines: infinite in both directions. Use them as guides for projecting views or aligning
geometry; they are not printed differently, so put them on their own layer and turn it off before plotting.

**Aliases** `XL` · **Menu** Draw

**Steps**

1. `Specify a point:` a point the lines pass through.
2. `Specify through point:` a second point on the line. Every point you give draws another line through the
   first point, so you can fan out several guides.
3. <kbd>Enter</kbd> finishes.

**Example**: a horizontal and a vertical guide through 50,50.

```text
XLINE 50,50 @1,0 @0,1
```

**Notes**

- Object snaps work on construction lines (intersection, perpendicular, nearest), and TRIM can cut them into
  ordinary segments.
- See also [RAY](#ray).

## RAY

Draws rays: lines that start at a point and are infinite in one direction.

**Aliases** none · **Menu** Draw

**Steps**

1. `Specify start point:` where the rays start.
2. `Specify through point:` the direction of a ray. Each point adds another ray from the same start point.
3. <kbd>Enter</kbd> finishes.

**Example**: rays at 0°, 30° and 60°.

```text
RAY 0,0 @10<0 @10<30 @10<60
```

## PLINE

Draws a polyline: one object made of straight and arc segments, optionally with width. Polylines are the
profiles you extrude, revolve, hatch, offset and measure.

**Aliases** `PL` · **Menu** Draw

**Steps**

1. `Specify start point:` Cota reports the current width (`Current line-width is 0.0000`).
2. `Specify next point or [Arc/Close/Halfwidth/Length/Undo/Width]:` the end of a straight segment. The prompt
   repeats for the next segment.
3. Type `A` to switch to arcs. The prompt becomes
   `Specify endpoint of arc or [Angle/CEnter/CLose/Direction/Halfwidth/Line/Radius/Second pt/Undo/Width]:` and each
   arc starts tangent to the previous segment. Type `L` to go back to straight segments.
4. <kbd>Enter</kbd> finishes an open polyline, or use `Close`.

**Options in line mode**

| Option | What it does |
| --- | --- |
| `Arc` | Switches to arc segments. |
| `Close` | Adds a straight segment back to the start point and closes the polyline. |
| `Halfwidth` / `Width` | Asks for the starting and ending (half-)width of the next segments. Equal values give a constant width; different values give a taper. |
| `Length` | Draws a segment of the length you type in the direction of the previous segment (tangent to it if it was an arc). |
| `Undo` | Removes the last segment. |

**Options in arc mode**

| Option | What it does |
| --- | --- |
| *(a point)* | End point of an arc tangent to the previous segment. On the first segment there is nothing to be tangent to, so Cota asks for a second point and draws a three-point arc. |
| `Angle` | Included angle of the arc, then its end point. |
| `CEnter` | Center of the arc, then its end point. |
| `CLose` | Closes the polyline with an arc back to the start point. `C` alone also closes. |
| `Direction` | Tangent direction at the start of the arc, then its end point. |
| `Radius` | Radius of the arc, then its end point. |
| `Second pt` | A point on the arc and its end point (three-point arc). |
| `Line` | Back to straight segments. |
| `Halfwidth`, `Width`, `Undo` | As in line mode. |

**Example**: a slot 60 long and 20 wide, closed with arcs.

```text
PLINE 0,0 @60,0 A @0,20 L @-60,0 A CL
```

**Notes**

- If you finish exactly on the start point, the polyline is closed automatically, so it can be extruded.
- Arc segments keep their exact geometry: after `EXTRUDE`, their centers and quadrants can still be snapped.
- Widths are set for new polylines by `PLINEWID`. Edit an existing polyline with `PEDIT`.

## POLYGON

Draws a regular polygon (3 to 1024 sides) as a closed polyline, around a center or from one edge.

**Aliases** `POL` · **Menu** Draw

**Steps**

1. `Enter number of sides <4>:` the default is the last number used (`POLYSIDES`).
2. `Specify center of polygon or [Edge]:` the center.
3. `Enter an option [Inscribed in circle/Circumscribed about circle] <I>:` whether the radius goes to the
   corners (`I`) or to the middle of the sides (`C`). Cota remembers the choice.
4. `Specify radius of circle:` type the radius or click a point at that distance.

**Options**

| Option | What it does |
| --- | --- |
| `Edge` | Asks for the two endpoints of one side (`Specify first endpoint of edge:`, `Specify second endpoint of edge:`) and builds the polygon from it. |
| `Inscribed` | The polygon fits inside the circle: the radius is the distance to the corners. |
| `Circumscribed` | The polygon fits around the circle: the radius is the distance to the middle of each side (use it for a hexagon "across flats"). |

**Example**: a hexagon nut outline 19 across flats.

```text
POLYGON 6 0,0 C 9.5
```

## RECTANGLE

Draws a rectangle from two opposite corners, or from its length and width.

**Aliases** `REC`, `RECT`, `RECTANG` · **Menu** Draw

**Steps**

1. `Specify first corner point:`
2. `Specify other corner point or [Dimensions]:` the opposite corner, for example `@80,40`.

**Options**

| Option | What it does |
| --- | --- |
| `Dimensions` | Asks `Specify length for rectangles` and `Specify width for rectangles`, then `Specify other corner point (side of the rectangle):`: click on the side of the first corner where the rectangle goes. |

**Example**

```text
RECTANGLE 0,0 @80,40
```

**Notes**

- ORTHO does not constrain the opposite corner, so the preview is always a rectangle.
- In a plan view the result is a rectangle object; in front, side or other views it is a closed polyline in the
  plane you are looking at. Both can be extruded.

## ARC

Draws a circular arc. By default it passes through three points; the options give every classic way of
defining an arc.

**Aliases** `A` · **Menu** Draw

**Steps** (three points)

1. `Specify start point of arc or [Center]:`
2. `Specify second point of arc or [Center/End]:` a point the arc passes through.
3. `Specify end point of arc:`

**Options**

| Option | What it does |
| --- | --- |
| <kbd>Enter</kbd> at the first prompt | **Continue**: starts at the end of the last line, arc or polyline drawn, tangent to it. Only the end point is asked. |
| `Center` (first prompt) | `Specify center point of arc:`, `Specify start point of arc:`, then `Specify end point of arc or [Angle/chord Length]:`. The arc goes counterclockwise from the start point. |
| `Center` (second prompt) | Start point, center, then end point (or `Angle` / `chord Length`). |
| `End` | Start and end points first, then `Specify center point of arc or [Angle/Direction/Radius]:`. |
| `Angle` | Included angle of the arc. A negative angle goes clockwise. |
| `chord Length` | Straight distance between the start and end points (`Specify length of chord`). |
| `Direction` | Tangent direction at the start point (`Specify tangent direction for the start point of arc:`). |
| `Radius` | Radius of the arc (`Specify radius of arc`). |

**Example**: a 90° arc of radius 20 centered on the origin.

```text
ARC C 0,0 20,0 A 90
```

**Notes**

- An arc that sweeps a full turn is created as a circle, and Cota says so.
- The arc is drawn in the plane of the current view and UCS.

## CIRCLE

Draws a circle by center and radius or diameter, through two or three points, or tangent to other objects.

**Aliases** `C` · **Menu** Draw

**Steps**

1. `Specify center point for circle or [3P/2P/Ttr (tan tan radius)]:`
2. `Specify radius of circle or [Diameter] <10.0000>:` the default is the last radius used (`CIRCLERAD`), so
   <kbd>Enter</kbd> repeats it.

**Options**

| Option | What it does |
| --- | --- |
| `Diameter` | `Specify diameter of circle`: type the diameter instead of the radius. |
| `3P` | Three points on the circle. Any of them can be a Tangent object snap, which gives the circle tangent to up to three objects. |
| `2P` | The two ends of a diameter. |
| `Ttr` | Tangent, tangent, radius: click near the tangency point on two lines, arcs, circles or polyline segments, then type the radius. Of the possible circles, Cota draws the one nearest to the points you clicked. Works in a plan view. |

**Example**: a 10 mm hole at 40,20, then a second one of the same size.

```text
CIRCLE 40,20 D 10
CIRCLE 80,20 ""
```

**Notes**

- The circle lies in the plane you are looking at: in a front view it is vertical.
- `Circle does not exist.` means no circle fits the points or tangents given.

## SPLINE

Draws a smooth curve through the points you pick.

**Aliases** `SPL` · **Menu** Draw

**Steps**

1. `Specify first point:`
2. `Specify next point or [Undo] (Enter to finish):` each point is a fit point the curve passes through.
   `Undo` removes the last one.
3. <kbd>Enter</kbd> finishes.

**Example**

```text
SPLINE 0,0 20,15 40,0 60,-15 80,0 ""
```

**Notes**

- Object snaps follow the real curve: Endpoint at its two ends, Node at every fit point, Midpoint at half its
  length, and Nearest, Perpendicular and Intersection on the curve itself.

## ELLIPSE

Draws an ellipse or an elliptical arc.

**Aliases** `EL` · **Menu** Draw

**Steps** (axis and distance)

1. `Specify axis endpoint of ellipse or [Arc/Center]:` one end of an axis.
2. `Specify other endpoint of axis:` the other end.
3. `Specify distance to other axis`: half the length of the other axis.

**Options**

| Option | What it does |
| --- | --- |
| `Center` | `Specify center of ellipse:`, `Specify endpoint of axis:`, then the distance to the other axis. |
| `Arc` | Draws an elliptical arc: the ellipse as above (`Specify axis endpoint of elliptical arc or [Center]:`), then `Specify start angle or [Parameter]` and `Specify end angle or [Parameter/Included angle]`. Angles are measured from the first axis. |
| `Parameter` | Gives the start or end by the parameter of the ellipse equation instead of an angle. |
| `Included angle` | Gives the end as the angle swept from the start. |

**Example**: an ellipse 100 × 40 centered on the origin.

```text
ELLIPSE C 0,0 @50,0 20
```

## TEXT

Creates single-line text. Each line is its own object, placed on its baseline.

**Aliases** `DT`, `DTEXT` · **Menu** Draw › Text

**Steps**

1. `Specify start point of text or [Justify]:` the left end of the baseline.
2. `Specify height <2.5000>:` the default comes from the current text style.
3. `Specify rotation angle of text <0>:`
4. `Enter text:` type the line and press <kbd>Enter</kbd>. The next line starts below it. An empty line ends the
   command.

**Options**

| Option | What it does |
| --- | --- |
| `Justify` | `Enter an option [Left/Center/Right]:` which point of the baseline you give: its left end, its middle or its right end. Cota remembers it for the next TEXT. |

**Special characters**: `%%c` gives Ø, `%%d` gives °, `%%p` gives ±.

**Example**

```text
TEXT 10,70 5 0 "Base plate %%c40" ""
```

**Notes**

- A double click on a text selects it and opens **Properties**, where its properties can be changed.
- See also [MTEXT](#mtext).

## MTEXT

Creates multiline text: one object with several lines, placed from its top-left corner.

**Aliases** `MT`, `T` · **Menu** Draw › Text

**Steps**

1. `Specify start point of text:` the top-left corner.
2. The height and the rotation, as in TEXT.
3. A text window opens on the drawing itself, at the text's place, height and angle, with a formatting bar. Bold,
   italic, underline, color, font and relative size (0.5× to 2×) apply to the selected characters, so one word can be
   bold or red; height and justification (left, center, right) apply to the whole text; Ø, ° and ± are inserted. <kbd>Enter</kbd> starts a new
   line; <kbd>Ctrl</kbd>+<kbd>Enter</kbd>, **OK** or a click away accepts; <kbd>Esc</kbd> cancels. From a script or
   an agent there is no window: `Line 1 (empty line to finish):`, `Line 2…` ask for each line and an empty line ends.

**Example**

```text
MTEXT 0,100 3.5 0 "NOTES" "1. Break all sharp edges." "2. Tolerances ISO 2768-m." ""
```

**Notes**

- `%%c`, `%%d` and `%%p` work as in TEXT. Cota prints `MText created (n line(s)).`
- Double-click any text (MTEXT or TEXT) to edit it in the same window on the drawing; the original hides while you edit.

## POINT

Places a point object. Points mark positions (survey points, hole centers, divisions) and snap with the Node
object snap.

**Aliases** `PO` · **Menu** Draw › Point

**Steps**

1. Cota shows the current style: `Current point modes:  PDMODE=0  PDSIZE=0.0000`.
2. `Specify a point:` one point object is created.

**Example**

```text
POINT 25,40
```

**Notes**

- The look of every point is set by `PDMODE` (0 dot, 2 plus, 3 cross, 4 tick; add 32 for a circle, 64 for a
  square) and its size by `PDSIZE` (0 = 5 % of the view, negative = percent of the view, positive = drawing units).
  Changing them redraws the existing points.

## DIVIDE

Places point objects that divide an object into equal-length parts. The object itself is not cut.

**Aliases** `DIV` · **Menu** Draw › Point

**Steps**

1. `Select object to divide:` click a line, arc, circle, ellipse, polyline or spline. If objects were selected
   before the command, all of them are divided and this prompt is skipped.
2. `Enter the number of segments:` from 2 to 32767.

**Example**: five equal parts of a 100-long line give four points.

```text
LINE 0,0 100,0 ""
DIVIDE 50,0 5
```

**Notes**

- With `PDMODE` 0 the points are tiny dots; Cota suggests `PDMODE` 3 to see them as crosses.
- Snap to the points with the Node object snap.

## MEASURE

Places point objects at a fixed distance along an object, starting from the end nearest to where you clicked.

**Aliases** `ME` · **Menu** Draw › Point

**Steps**

1. `Select object to measure:` click near the end the measuring starts from.
2. `Specify length of segment:` the distance between points.

**Example**: points every 30 along a 100-long line, from its left end.

```text
LINE 0,0 100,0 ""
MEASURE 5,0 30
```

**Notes**

- The remainder that does not fill a whole segment is left at the far end. If the segment is longer than the
  object, Cota says so and places nothing.

## BLOCK

Turns the selected objects into a block definition and puts one reference to it in their place. Every
reference to a block shows the same definition: redefine it and all of them update.

**Aliases** `B` · **Menu** Draw › Block

**Steps**

1. `Select objects:` the objects that form the block. <kbd>Enter</kbd> ends the selection.
2. `Block name:` a new name, or an existing one to redefine it.
3. `Specify base point:` the point that will sit on the insertion point of each reference.

Cota prints `Block "NAME" defined (n object(s)).` or, for an existing name,
`Block "NAME" redefined (n object(s)); all inserts updated.`

**Example**: a 10 × 10 square as a block with its base point in the middle.

```text
RECTANGLE 0,0 @10,10
BLOCK L "" SQUARE 5,5
```

**Notes**

- Attribute definitions (`ATTDEF`) included in the selection become the fields asked for on every insert.
- Place more references with `INSERT`; break one into its objects with `EXPLODE`. Layout viewports cannot be part
  of a block.

## ATTDEF

Defines an attribute: a text field of a block that is filled in each time the block is inserted, such as a part
number or a drawing title. Include the attribute in the selection when you create the block.

**Aliases** `ATT`, `-ATTDEF` · **Menu** Draw › Block

**Steps**

1. Cota shows the modes: `Current attribute modes: Invisible=N Constant=N Preset=N`.
   `Enter an option to change [Invisible/Constant/Preset] <done>:` toggles a mode; <kbd>Enter</kbd> continues.
2. `Enter attribute tag name:` the name of the field, without spaces (it is stored in capitals).
3. `Enter attribute prompt <TAG>:` the question asked on insert.
4. `Enter default attribute value:` the value offered by default.
5. `Specify start point of text or [Justify]:`, `Specify text height` and `Specify rotation angle of text`, as in
   TEXT.

**Modes**

| Mode | What it does |
| --- | --- |
| `Invisible` | The value is stored but not shown on the drawing. |
| `Constant` | The value is fixed in the block: it is not asked on insert (the prompt becomes `Enter attribute value:`). |
| `Preset` | The default value is used without asking; it can be edited later. |

**Example**

```text
ATTDEF "" PARTNO "Part number" "P-000" 0,-5 2.5 0
```

**Notes**

- Edit the values of an inserted block with a double click (`EATTEDIT`) or `ATTEDIT`. After redefining a block,
  `ATTSYNC` updates the attributes of its references.

## HATCH

Fills an enclosed area with a pattern, a solid fill or parallel lines. The Hatch Creation panel opens next to
the drawing with the pattern, scale, angle and island settings; click inside the areas to fill.

**Aliases** `H`, `BH`, `BHATCH` · **Menu** Draw › Hatch

**Steps**

1. Choose the pattern, scale and angle in the panel.
2. `Pick internal point or [Select objects/Undo/seTtings]:` click inside each closed area. The preview shows the
   boundary Cota found, including the islands inside it.
3. <kbd>Enter</kbd> creates the hatch.

**Options**

| Option | What it does |
| --- | --- |
| `Select objects` | Hatches the inside of closed objects you select (circles, closed polylines, rectangles, regions with their holes…) instead of finding the boundary from a point. |
| `Undo` | Removes the last area picked. |
| `seTtings` | Points to the Hatch Creation panel, where the settings are. |

**Example**

```text
RECTANGLE 0,0 @100,60
CIRCLE 50,30 15
HATCH 10,10 ""
```

The hatch fills the rectangle and leaves the circle empty (island detection).

**Notes**

- Island detection (`HPISLANDDETECTION`): Normal alternates filled and empty areas inside each other, Outer fills
  only the outermost area, Ignore fills everything inside the outer boundary.
- Small gaps in the boundary are closed up to `HPGAPTOL`.
- Associative hatches (`HPASSOC`) follow their boundary when it is moved or stretched.
- Edit a hatch with a double click or `HATCHEDIT`. `-HATCH` does the same from the command line (Properties,
  Select objects, Advanced, Origin).

## BOUNDARY

Creates a closed polyline around the area that contains a point: the outline you would hatch, as an object you
can extrude, offset or measure.

**Aliases** `BO`, `BPOLY`, `-BOUNDARY` · **Menu** Draw › Hatch

**Steps**

1. `Specify internal point or [Advanced options]:` click inside each area. Each click creates its outline.
   After an advanced option, Cota asks for the internal point again.
2. <kbd>Enter</kbd> ends. Cota prints `BOUNDARY created n polyline(s)`.

**Advanced options**: `Enter an option [Boundary set/Island detection/Object type/Gap tolerance]:`

| Option | What it does |
| --- | --- |
| `Boundary set` | `Specify candidate set for boundary [New/Everything] <Everything>:` `New` limits the search to objects you select; `Everything` uses all visible objects. |
| `Island detection` | `Do you want island detection? [Yes/No]:` with Yes, closed objects inside the area also get their outline. |
| `Object type` | `Enter type of boundary object [Region/Polyline] <Polyline>:` with `Region`, each outline is created as a region instead of a closed polyline. |
| `Gap tolerance` | `Specify a gap tolerance value`: gaps up to this size between the boundary objects are closed (`HPGAPTOL`). |

**Example**: the outline of a shape whose corner does not quite close.

```text
LINE 0,0 100,0 100,50 0,50 0,0.4 ""
BOUNDARY A G 0.5 50,25 ""
```

## REGION

Converts closed objects into regions: flat areas with an outline, which you can measure, move, explode and, later,
combine with UNION, SUBTRACT and INTERSECT or turn into solids.

**Aliases** `REG` · **Menu** Draw › Hatch

**Steps**

1. `Select objects:` select the objects and press <kbd>Enter</kbd>.
   - Each closed object becomes a region: a closed polyline, circle, ellipse, rectangle or closed spline.
   - Lines, arcs and open polylines also make a region when they close end to end in the same plane, in any order
     and direction.
2. Cota prints `n loop(s) extracted.` and `n Region(s) created.`. The objects that formed a region are deleted;
   objects that do not close are left as they are.

**Notes**

- One region per closed outline, as in classic CAD: a circle inside a rectangle gives two regions. SUBTRACT the
  circle from the rectangle to get a region with a hole; UNION and INTERSECT combine regions too.
- Regions work in the XY plane of the current UCS.
- A region keeps arcs exact. AREA › Object, LIST and the Properties palette show its area and perimeter.
- EXPLODE turns a region back into lines and arcs.
- In the shaded visual styles a region shows its face. Plotting shows its outline.
- DXF and DWG files get each outline of a region as a closed polyline.

**Example**: a slot made of two lines and two arcs, turned into one region.

```text
LINE 0,0 40,0 ""
ARC 40,0 50,10 40,20
LINE 40,20 0,20 ""
ARC 0,20 -10,10 0,0
REGION ALL ""
```

## EXTRUDE

Turns closed 2D profiles into solids by giving them height, by pulling them along a direction or along a path,
optionally with a taper.

**Aliases** `EXT` · **Menu** Draw › Modeling

**Steps**

1. `Select objects to extrude:` closed polylines, rectangles, polygons, circles, ellipses and regions. A region
   with holes gives a solid with those holes through it. <kbd>Enter</kbd> ends the selection.
2. `Specify height of extrusion or [Direction/Path/Taper angle]:` type the height, or move the cursor to see the
   solid grow and click. A negative height extrudes to the other side of the profile.

**Options**

| Option | What it does |
| --- | --- |
| `Direction` | `Specify start point of direction:` and `Specify end point of direction:` the profile is pulled along that vector. |
| `Path` | `Select extrusion path:` a line, polyline, arc or spline that does not lie in the plane of the profile. The profile is swept along it. |
| `Taper angle` | `Specify angle of taper for extrusion`: positive angles narrow the solid as it rises. If the taper would make the profile vanish before the height, Cota says so. |

**Example**: a 100 × 60 plate 10 thick and a 20 mm pin through it. `SUBTRACT` the pin from the plate to make
the hole.

```text
RECTANGLE 0,0 @100,60
CIRCLE 50,30 10
EXTRUDE ALL "" 10
```

**Notes**

- A circle becomes a parametric cylinder: its radius and height can be changed later in **Properties**.
- Arc segments of polylines stay exact arcs on the solid, so their centers and quadrants snap.
- The extrusion goes along the Z axis of the profile's plane: profiles drawn in a front view extrude toward you.

## REVOLVE

Creates a solid by revolving closed profiles around an axis: shafts, pulleys, rings.

**Aliases** `REV` · **Menu** Draw › Modeling

**Steps**

1. `Select objects to revolve:` closed profiles or regions (a region's holes are revolved out of the solid).
2. `Specify axis start point or define axis by [Object/X/Y/Z] <Object>:` the first point of the axis, then
   `Specify axis endpoint:`.
3. `Specify angle of revolution or [STart angle/Reverse] <360>:` 360 makes a full solid of revolution.

**Options**

| Option | What it does |
| --- | --- |
| `Object` | `Select an object to define the axis of revolution:` a line or a polyline segment is the axis. |
| `X` / `Y` / `Z` | The axis is that axis of the current UCS, through its origin. |
| `STart angle` | `Specify start angle`: where the revolution starts, measured from the plane of the profile. |
| `Reverse` | Revolves in the opposite direction. |

**Example**: a ring from a rectangle revolved around the Y axis.

```text
RECTANGLE 20,0 @5,10
REVOLVE L "" Y 360
```

## BOX

Creates a parametric box from two corners of its base and its height.

**Aliases** none · **Menu** Draw › Modeling

**Steps**

1. `Specify first corner:`
2. `Specify opposite corner:` the opposite corner of the base, for example `@100,60`.
3. `Specify height`: type it or drag the preview. A negative height goes the other way.

**Example**

```text
BOX 0,0,0 @100,60 20
```

**Notes**

- The base lies in the plane of the current view and UCS. ORTHO does not constrain the opposite corner.
- Length, width and height can be changed later in **Properties**. Ctrl+Z inside the command goes back one step,
  for example to the opposite corner.

## CYLINDER

Creates a parametric cylinder from the center and radius of its base and its height.

**Aliases** `CYL` · **Menu** Draw › Modeling

**Steps**

1. `Specify center of base:`
2. `Specify base radius`
3. `Specify height or [Axis endpoint]`

**Options**

| Option | What it does |
| --- | --- |
| `Axis endpoint` | `Specify axis endpoint:` the center of the top face. The axis can point in any direction. |

**Example**: a pin of diameter 10 and length 40 lying along X.

```text
CYLINDER 0,0,0 5 A 40,0,0
```

## CONE

Creates a parametric cone or a truncated cone.

**Aliases** none · **Menu** Draw › Modeling

**Steps**

1. `Specify center of base:`
2. `Specify base radius`
3. `Specify top radius <0>`: 0 gives a pointed cone; a positive value gives a truncated cone.
4. `Specify height or [Axis endpoint]`

**Example**: a truncated cone, base radius 20, top radius 10, height 30.

```text
CONE 0,0,0 20 10 30
```

## SPHERE

Creates a parametric sphere.

**Aliases** `SPH` · **Menu** Draw › Modeling

**Steps**

1. `Specify center:`
2. `Specify radius`

**Example**

```text
SPHERE 0,0,0 25
```

## TORUS

Creates a parametric torus (a ring with a round section).

**Aliases** `TOR` · **Menu** Draw › Modeling

**Steps**

1. `Specify center point:`
2. `Specify radius or [Diameter]`: from the center to the middle of the tube.
3. `Specify tube radius or [Diameter]`

**Example**: an O-ring 50 across with a 3 mm section.

```text
TORUS 0,0,0 D 47 1.5
```

## FLATSHOT

Creates a 2D drawing of the 3D solids as you see them in the current view: visible edges, and optionally the
hidden ones. Use it for a quick 2D view or to export one.

**Aliases** none · **Menu** Draw › Modeling

**Steps**

1. A dialog asks where the result goes (a new block, replacing an existing block, or a DXF file) and whether to
   include obscured (hidden) lines and tangential edges.
2. `Specify insertion point:` for a new block, where to place it.

**Notes**

- The result is flat 2D geometry; it does not follow later changes to the solids. For views that update with the
  model, use layouts and `VIEWBASE`.

## SOLPROF

Creates the profile of 3D solids inside a layout viewport: visible lines on one layer and hidden lines on
another, ready for a technical drawing.

**Aliases** none · **Menu** Draw › Modeling

**Steps**

1. Work inside a layout viewport (double click into it, or `MSPACE`). Elsewhere Cota says
   `** Command only valid in a layout viewport (MSPACE).`
2. `Select objects:` the solids.
3. `Display hidden profile lines on separate layer? [Yes/No] <Y>:`

Cota puts the visible lines on layer `PV-<viewport>` and, with Yes, the hidden lines on `PH-<viewport>` (with
the HIDDEN linetype).

**Notes**

- Freeze the layer of the solids in that viewport (`VPLAYER`) to see only the profile.
