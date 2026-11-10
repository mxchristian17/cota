# Modify commands

Commands of the **Modify** menu: move, copy and transform objects, trim and join them, round their corners and
edit 3D solids. Most of them start with `Select objects:`. You can also select first and then run the command:
the selection is used and the prompt is skipped. At `Select objects:` click objects, drag a window (left to right
selects what is fully inside, right to left also what it crosses) or type `ALL`, `L` (last) or `P` (previous);
<kbd>Enter</kbd> ends the selection. See [selecting objects](../guides/selection.md).

## ERASE

Deletes the selected objects.

**Aliases** `E` · **Menu** Edit › Selection

**Steps**

1. `Select objects:` and <kbd>Enter</kbd>.

**Example**: erase the last object drawn.

```text
ERASE L ""
```

**Notes**

- <kbd>Delete</kbd> erases the current selection without the command. `UNDO` (Ctrl+Z) brings objects back.

## MOVE

Moves objects by a displacement given by two points.

**Aliases** `M` · **Menu** Modify › Modify

**Steps**

1. `Select objects:`
2. `Specify base point:` a point that travels with the objects, usually a snap on one of them.
3. `Specify destination:` where the base point goes. The preview follows the cursor.

**Example**: move everything 50 to the right.

```text
MOVE ALL "" 0,0 @50,0
```

**Notes**

- In 3D views the cursor moves in the plane through the base point, so objects keep their height unless you snap
  or type a `z`.
- Grips do the same: click an object, click a grip and drag.

## COPY

Copies objects. After the first copy it keeps asking for more destinations from the same base point.

**Aliases** `CO`, `CP` · **Menu** Modify › Modify

**Steps**

1. `Select objects:`
2. `Specify base point:`
3. `Specify second point (Esc to end):` each point places one copy. <kbd>Enter</kbd> or <kbd>Esc</kbd> ends.

**Example**: three copies of a circle every 20 along X.

```text
CIRCLE 0,0 5
COPY L "" 0,0 @20,0 @40,0 @60,0 ""
```

## ROTATE

Rotates objects around a base point.

**Aliases** `RO` · **Menu** Modify › Modify

**Steps**

1. `Select objects:`
2. `Specify base point:` the center of the rotation.
3. `Specify rotation angle or [Copy/Reference]:` positive angles turn counterclockwise. You can also move the
   cursor and click.

**Options**

| Option | What it does |
| --- | --- |
| `Copy` | Keeps the original and rotates a copy. |
| `Reference` | `Specify the reference angle` and `Specify the new angle`: turns the objects so that a direction you know (for example an edge at 17°) ends at the angle you want. Both angles can be given with two clicks. |

**Example**: rotate the last object 90° about the origin, keeping the original.

```text
ROTATE L "" 0,0 C 90
```

**Notes**

- In 3D views the rotation is about the axis that points at you, through the base point.

## SCALE

Enlarges or reduces objects about a base point.

**Aliases** `SC` · **Menu** Modify › Modify

**Steps**

1. `Select objects:`
2. `Specify base point:` the point that stays fixed.
3. `Specify scale factor or [Reference]:` 2 doubles the size, 0.5 halves it.

**Options**

| Option | What it does |
| --- | --- |
| `Reference` | `Specify reference length` and `Specify new length`: scales so that a known length becomes the one you want, for example to fit an imported drawing to a real dimension. |

**Example**: scale an imported plan so that a wall measured as 3.2 becomes 3000.

```text
SCALE ALL "" 0,0 R 3.2 3000
```

## MIRROR

Creates a mirror image of objects about a line.

**Aliases** `MI` · **Menu** Modify › Modify

**Steps**

1. `Select objects:`
2. `Specify first point of mirror line:` and `Specify second point of mirror line:` the axis of symmetry.
3. `Erase source objects? [Yes/No] <N>:` No keeps both halves.

**Example**: complete a symmetric part about the vertical line through x = 50.

```text
MIRROR ALL "" 50,0 50,10 N
```

**Notes**

- Texts are mirrored as positions only, so they stay readable.

## OFFSET

Creates a parallel copy of a line, arc, circle, polyline or spline at a distance: concentric circles, parallel
walls, the inner outline of a part.

**Aliases** `O` · **Menu** Modify › Modify

**Steps**

1. `Specify offset distance or [Through/Erase/Layer] <1.0000>:`
2. `Select object to offset or [Exit/Undo] <Exit>:` click the object.
3. `Specify point on side to offset or [Exit/Multiple/Undo] <Exit>:` click on the side where the copy goes.
4. The prompts repeat for the next object; <kbd>Enter</kbd> ends.

**Options**

| Option | What it does |
| --- | --- |
| `Through` | Instead of a distance, each copy passes through a point you give. |
| `Erase` | `Erase source object after offsetting? [Yes/No]`: keeps or removes the original (`OFFSETERASE`). |
| `Layer` | `Enter layer option for offset objects [Current/Source]`: puts the copies on the current layer or on the layer of the original (`OFFSETLAYER`). |
| `Multiple` | Keeps offsetting the same object, each copy from the last one. |
| `Undo` | Removes the last copy. |

**Example**: a wall 200 thick from its axis drawn as a line.

```text
LINE 0,0 5000,0 ""
OFFSET 100 2500,0 2500,1 2500,0 2500,-1 ""
```

**Notes**

- When offsetting a polyline outward, the gaps at its corners are closed by extending the segments, by arcs or by
  straight cuts, according to `OFFSETGAPTYPE` (0, 1 or 2).

## TRIM

Cuts objects where they cross other objects, removing the part you click.

**Aliases** `TR` · **Menu** Modify › Modify

**Steps**

1. Cota prints the settings (`Current settings: Projection=UCS, Edge=None`) and `Select cutting edges ...`.
2. `Select objects or <select all>:` the cutting edges. <kbd>Enter</kbd> without selecting uses every object as a
   cutting edge, which is the usual way.
3. `Select object to trim or shift-select to extend or [Fence/Crossing/Project/Edge/eRase/Undo]:` click the part
   to remove. Hold <kbd>Shift</kbd> and click to extend the object instead. <kbd>Enter</kbd> ends.

**Options**

| Option | What it does |
| --- | --- |
| `Fence` | `Specify first fence point:` and `Specify next fence point or [Undo]:`: every object the fence line crosses is trimmed there. |
| `Crossing` | `Specify first corner:` and `Specify opposite corner:`: trims what the window crosses. |
| `Project` | `Enter a projection option [None/Ucs/View]`: how objects in different planes meet (`PROJMODE`). |
| `Edge` | `Enter an implied edge extension mode [Extend/No extend]`: with Extend, an edge that is too short still cuts where its extension would cross (`EDGEMODE`). |
| `eRase` | `Select objects to erase:` erases whole objects without leaving the command. |
| `Undo` | Undoes the last trim. |

**Example**: cut the middle of the horizontal line between two verticals.

```text
LINE 0,0 100,0 ""
LINE 40,-10 40,10 ""
LINE 60,-10 60,10 ""
TRIM "" 50,0 ""
```

## EXTEND

Lengthens objects until they meet other objects. It works like TRIM in reverse.

**Aliases** `EX` · **Menu** Modify › Modify

**Steps**

1. `Select objects or <select all>:` the boundary edges, or <kbd>Enter</kbd> for all objects.
2. `Select object to extend or shift-select to trim or [Fence/Crossing/Project/Edge/Undo]:` click near the end to
   extend. Hold <kbd>Shift</kbd> to trim instead.

**Options**: `Fence`, `Crossing`, `Project`, `Edge` and `Undo` as in [TRIM](#trim).

**Example**

```text
LINE 0,0 50,0 ""
LINE 80,-10 80,10 ""
EXTEND "" 45,0 ""
```

## FILLET

Rounds the corner between two lines, arcs, circles or polyline segments with an arc of a given radius. With
radius 0 it makes a sharp corner, trimming or extending both objects until they meet.

**Aliases** `F` · **Menu** Modify › Modify

**Steps**

1. Cota prints the settings: `Current settings: Mode = TRIM, Radius = 0.0000`.
2. `Select first object or [Undo/Polyline/Radius/Trim/Multiple]:` click the first object on the part to keep.
3. `Select second object or shift-select to apply corner or [Radius]:` the preview shows the fillet. Hold
   <kbd>Shift</kbd> and click for a sharp corner whatever the radius.

**Options**

| Option | What it does |
| --- | --- |
| `Radius` | `Specify fillet radius <0.0000>:` (`FILLETRAD`, remembered). |
| `Polyline` | `Select 2D polyline or [Radius]:` fillets every corner of a polyline at once. |
| `Trim` | `Enter Trim mode option [Trim/No trim]`: with No trim the original objects are left whole and only the arc is added. |
| `Multiple` | Keeps filleting corners until <kbd>Enter</kbd>. |
| `Undo` | Undoes the last fillet in Multiple mode. |

**Example**: round the corner of two lines with radius 5.

```text
LINE 0,0 50,0 ""
LINE 50,0 50,40 ""
FILLET R 5 25,0 50,20
```

**Notes**

- For the edges of 3D solids use [FILLETEDGE](#filletedge).

## CHAMFER

Bevels the corner between two lines or polyline segments.

**Aliases** `CHA` · **Menu** Modify › Modify

**Steps**

1. Cota prints the current distances and method.
2. `Select first line or [Undo/Polyline/Distance/Angle/Trim/mEthod/Multiple]:`
3. `Select second line or shift-select to apply corner or [Distance/Angle/Method]:`

**Options**

| Option | What it does |
| --- | --- |
| `Distance` | `Specify first chamfer distance` and `Specify second chamfer distance`: how much is cut from each line (`CHAMFERA`, `CHAMFERB`). |
| `Angle` | `Specify chamfer length on the first line` and `Specify chamfer angle from the first line` (`CHAMFERC`, `CHAMFERD`). |
| `mEthod` | `Enter trim method [Distance/Angle]`: which pair of values is used (`CHAMMODE`). |
| `Polyline`, `Trim`, `Multiple`, `Undo` | As in [FILLET](#fillet). |

**Example**: a 5 × 5 chamfer.

```text
LINE 0,0 50,0 ""
LINE 50,0 50,40 ""
CHAMFER D 5 5 25,0 50,20
```

**Notes**

- For the edges of 3D solids use [CHAMFEREDGE](#chamferedge).

## ARRAY

Copies objects in a grid of rows and columns, or around a center.

**Aliases** `AR` · **Menu** Modify › Modify

**Steps**

1. `Select objects:`
2. `Array type [Rectangular/Polar] <Rectangular>:` the default is the type used last.

**Rectangular**

1. `Enter number of rows` and `Enter number of columns`: the original counts as one of them.
2. `Enter row spacing (Y)` and `Enter column spacing (X)`: distances between rows and between columns.
   Negative values go down or to the left.

**Polar**

1. `Specify center of array:`
2. `Enter number of items (incl. original)`
3. `Enter angle to fill (deg)`: 360 spreads the items around a full circle; a smaller angle spreads them over that
   arc (positive is counterclockwise).
4. `Rotate items as copied? [Yes/No] <Yes>:` Yes turns each copy to face the center, like holes on a flange;
   No keeps their orientation.

Cota prints how many copies it made.

**Example**: six holes on a 50 mm bolt circle.

```text
CIRCLE 25,0 4
ARRAY L "" P 0,0 6 360 Y
```

**Notes**

- The copies are independent objects.

## STRETCH

Moves the vertices that are inside a crossing window and leaves the others in place, so objects crossed by the
window stretch: make a part longer, move a wall with the walls that meet it.

**Aliases** `S` · **Menu** Modify › Modify

**Steps**

1. `Specify first corner of crossing window:` and `Specify opposite corner:` enclose the end you want to move.
   Cota prints how many objects it found.
2. `Specify base point:` and `Specify second point:` the displacement.

Objects entirely inside the window move; objects that cross it stretch. Cota reports both counts.

**Example**: make a 100-long rectangle 150 long by stretching its right side.

```text
PLINE 0,0 100,0 100,40 0,40 C
STRETCH 90,-5 110,45 0,0 @50,0
```

**Notes**

- Circles, ellipses, texts and blocks are not deformed: they move when their center or insertion point is inside
  the window. A rectangle that is deformed becomes a polyline.

## LENGTHEN

Changes the length of lines, open polylines and arcs, or the included angle of arcs.

**Aliases** `LEN` · **Menu** Modify › Modify

**Steps**

1. `Select an object to measure or [DElta/Percent/Total/DYnamic] <Total>:` click an object to see its current
   length (and the included angle of an arc), or choose a mode.
2. Give the value of the mode.
3. `Select an object to change or [Undo]:` click near the end to change. The prompt repeats.

**Modes**

| Mode | What it does |
| --- | --- |
| `DElta` | `Enter delta length or [Angle]`: adds that length (negative shortens). `Angle` adds an angle to arcs. |
| `Percent` | `Enter percentage length`: 150 makes it half again as long, 50 halves it. |
| `Total` | `Specify total length or [Angle]`: sets the final length (or the final included angle of an arc). |
| `DYnamic` | `Specify new end point:` drag the end. |

The last mode used is remembered (`LENGTHENMODE`, Total at first).

**Example**: make a line exactly 120 long.

```text
LINE 0,0 100,0 ""
LENGTHEN T 120 95,0 ""
```

## BREAK

Removes the part of an object between two points, or splits it in two.

**Aliases** `BR` · **Menu** Modify › Modify

**Steps**

1. `Select object:` the point you click is the first break point.
2. `Specify second break point or [First point]:` the second point. Typing `@` (the same point) splits the object
   without a gap.

**Options**

| Option | What it does |
| --- | --- |
| `First point` | `Specify first break point:` and `Specify second break point:` when the point you clicked to select the object is not where the break starts. |

**Example**: open a 20 gap in a line.

```text
LINE 0,0 100,0 ""
BREAK 40,0 60,0
```

**Notes**

- On circles the part removed goes counterclockwise from the first to the second point.

## BREAKATPOINT

Splits an object in two at a point, without a gap.

**Aliases** none · **Menu** Modify › Modify

**Steps**

1. `Select object:`
2. `Specify break point:`

**Example**

```text
LINE 0,0 100,0 ""
BREAKATPOINT 10,0 50,0
```

## JOIN

Joins lines, arcs, polylines and splines that touch end to end into a single object; closes an arc into a circle.

**Aliases** `J` · **Menu** Modify › Modify

**Steps**

1. `Select source object or multiple objects to join at once:` select all the pieces and press <kbd>Enter</kbd>.
   If you select only one, Cota asks `Select objects to join:` for the others.
2. Cota prints the result, for example `4 objects joined into 1 polyline.`

**Options**

| Option | What it does |
| --- | --- |
| `cLose` | When the source is a single arc or elliptical arc: `Select arcs to join to source or [cLose]:` with `L` it becomes a full circle or ellipse. |

**Example**: four lines into one closed polyline.

```text
LINE 0,0 50,0 ""
LINE 50,0 50,30 ""
LINE 50,30 0,30 ""
LINE 0,30 0,0 ""
JOIN ALL ""
```

**Notes**

- Collinear lines join into one line, even with gaps between them; arcs of the same circle join into the arc that
  covers them (or a circle). Pieces that touch end to end give a polyline, or a spline when one of them is a
  spline or an ellipse. Closed curves are not joined.
- To join pieces with small gaps between them, use `PEDIT` ▸ `Join` with a fuzz distance.

## ALIGN

Moves and turns objects so that up to three points on them land on three target points: place a part against
another in 3D, or fit a detail onto a sloping line in 2D.

**Aliases** `AL` · **Menu** Modify › 3D operations

**Steps**

1. `Select objects:`
2. `Specify first source point:` and `Specify first destination point:`
3. `Specify second source point:` and `Specify second destination point:`
4. `Specify third source point or <continue>:` and its destination, for a 3D alignment; <kbd>Enter</kbd> to
   continue with two pairs.
5. With two pairs: `Scale objects based on alignment points? [Yes/No] <No>:` Yes also scales the objects so that
   the distance between the source points matches the destination points.

**Example**: lay a horizontal 30-long line onto the line from 0,0 to 30,40 (and scale it to fit).

```text
LINE 0,0 30,0 ""
ALIGN L "" 0,0 0,0 30,0 30,40 "" Y
```

## UNION

Combines two or more solids into one, or two or more coplanar regions into one region.

**Aliases** `UNI` · **Menu** Modify › Solid editing

**Steps**

1. `Select objects:` at least two solids or regions, then <kbd>Enter</kbd>.

**Example**

```text
BOX 0,0,0 @40,40 10
CYLINDER 20,20,0 10 30
UNION ALL ""
```

**Notes**

- Object snaps work on the real edges of the result, including the circles where solids meet.
- Solids are combined with solids and regions with regions, in the same command. Only regions in the same plane are
  combined; regions in different planes are combined plane by plane.
- A region result keeps exact arcs: the outline of two overlapping circles has its centers and quadrants.

## SUBTRACT

Removes the volume of some solids from others (holes, pockets, slots), or the area of some regions from others.

**Aliases** `SU` · **Menu** Modify › Solid editing

**Steps**

1. Cota prints `Select solids, surfaces, and regions to subtract from ..` then `Select objects:` the solids that
   remain (for example the plate). <kbd>Enter</kbd>.
2. `Select solids, surfaces, and regions to subtract ..` then `Select objects:` the solids that cut (for example
   the cylinder of the hole). <kbd>Enter</kbd>.

**Example**: drill a 20 mm hole through a plate. Selecting by clicking is easiest; in a script, `L` takes the
last object drawn.

```text
BOX 0,0,0 @100,60 10
CYLINDER 50,30,-1 10 12
SUBTRACT 1,1,10 "" L ""
```

**Notes**

- Several solids to subtract from are first combined into one.
- Regions work the same way, in their plane: a rectangle region minus a circle region is a region with a hole. A
  region can then be measured with AREA or turned into a solid with EXTRUDE.
- When nothing is left, Cota prints `Null region created - deleted.` and the regions are deleted.

## INTERSECT

Keeps only the volume common to all the selected solids, or the area common to coplanar regions.

**Aliases** `IN` · **Menu** Modify › Solid editing

**Steps**

1. `Select objects:` at least two solids or regions, then <kbd>Enter</kbd>.

**Example**: the lens shared by two spheres.

```text
SPHERE 0,0,0 20
SPHERE 25,0,0 20
INTERSECT ALL ""
```

**Notes**

- With regions, the result is the area they share, with exact arcs. Regions that do not overlap give
  `Null region created - deleted.`

## SLICE

Cuts solids with a plane, keeping one side or both.

**Aliases** `SL` · **Menu** Modify › Solid editing

**Steps**

1. `Select objects to slice:`
2. `Specify start point of slicing plane or [Zaxis/View/XY/YZ/ZX/3points] <3points>:` define the plane.
3. `Specify a point on desired side or [keep Both sides] <Both>:` click on the side to keep, or <kbd>Enter</kbd>
   to keep both halves as separate solids.

**Plane options**

| Option | What it does |
| --- | --- |
| `3points` | Three points on the plane (the default; the first can be clicked directly at the first prompt). |
| `Zaxis` | `Specify a point on the section plane:` and `Specify a point on the Z-axis (normal) of the plane:` |
| `View` | The plane facing you, through a point. |
| `XY` / `YZ` / `ZX` | A plane parallel to that plane of the current UCS, through a point (`<0,0,0>` by default). |

**Example**: cut a box in half with the YZ plane through x = 50 and keep both halves.

```text
BOX 0,0,0 @100,60 20
SLICE L "" YZ 50,0,0 ""
```

## FILLETEDGE

Rounds edges of 3D solids with a radius.

**Aliases** none · **Menu** Modify › Solid editing

**Steps**

1. Cota prints the current radius (`Radius = …`).
2. `Select an edge or [Chain/Loop/Radius]:` click edges of one solid. Each click adds one; the preview shows the
   result. <kbd>Enter</kbd> ends the selection.
3. Cota prints how many edges are selected, then `Press Enter to accept the fillet or [Radius]:`.

**Options**

| Option | What it does |
| --- | --- |
| `Radius` | `Enter fillet radius`, remembered in `FILLETRAD`. |
| `Chain` | `Select edge chain`: one click takes all the edges that follow on tangentially from it. |
| `Loop` | `Select edge loop`: one click takes the closed loop of edges of a face. `Enter an option [Accept/Next] <Accept>:` switches to the loop of the other face of that edge. |
| `Edge` | Back to selecting single edges. |

**Notes**

- All the edges of one operation must belong to the same solid. Corners where two filleted edges meet are blended.
- The fillet is part of the solid's history: object snaps work on its real edges (CEN on the round edges).

## CHAMFEREDGE

Bevels edges of 3D solids.

**Aliases** none · **Menu** Modify › Solid editing

**Steps**

1. Cota prints the distances (`Distance1 = …, Distance2 = …`).
2. `Select an edge or [Loop/Distance]:` click the edges. <kbd>Enter</kbd> ends.
3. `Press Enter to accept the chamfer or [Distance]:`

**Options**

| Option | What it does |
| --- | --- |
| `Distance` | `Specify Distance1` and `Specify Distance2`: the setback on each of the two faces (`CHAMFERA`, `CHAMFERB`). |
| `Loop` | As in [FILLETEDGE](#filletedge). |

## EXPLODE

Breaks a compound object into its parts: a block reference into its objects, a polyline or rectangle into lines and
arcs, a pattern hatch into lines.

**Aliases** `X` · **Menu** Modify

**Steps**

1. `Select objects:` and <kbd>Enter</kbd>.

**Example**

```text
RECTANGLE 0,0 @40,20
EXPLODE L ""
```

**Notes**

- Polyline widths are lost when exploding. Objects that cannot be exploded are counted in the message.

## PROPERTIES

Opens or closes the **Properties** palette. It lists the properties of the selected objects (layer, color,
linetype, lineweight and the geometry of each type: coordinates, radius, length, area, text, dimension style…)
and lets you edit them. With several objects selected, it shows the values they share.

**Aliases** `PR`, `CH`, `MO`, `DDMODIFY`, `PROPS`, `SIDEBAR`, `HIDESIDEBAR` · **Menu** Modify

**Notes**

- The palette can be moved and docked. A double click on an object opens it for that object.
- Parametric solids (box, cylinder, extrusion…) show their dimensions here; changing them rebuilds the solid and
  everything made from it.

## MATCHPROP

Copies properties from one object to others, like a format painter.

**Aliases** `MA`, `PAINTER` · **Menu** Modify

**Steps**

1. `Select source object:`
2. Cota prints the active settings, then `Select destination object(s) or [Settings]:` click the objects to
   change. <kbd>Enter</kbd> ends.

**Options**

| Option | What it does |
| --- | --- |
| `Settings` | `Toggle property [Color/Layer/Linetype/LtScale/Lineweight/Text/Dimension/Hatch/Polyline] <done>:` turns each kind of property on or off (active ones are shown in capitals). |

**Example**: give the last object the layer and style of the object at 0,0.

```text
MATCHPROP 0,0 L ""
```

## PEDIT

Edits polylines: open or close them, join pieces, change widths, edit vertices, and turn them into curves.
Lines and arcs can be converted to polylines.

**Aliases** `PE` · **Menu** Modify › Object

**Steps**

1. `Select polyline or [Multiple]:` if the object is a line or an arc, Cota offers to convert it
   (`Do you want to turn it into one? <Y>:`).
2. `Enter an option [Close/Join/Width/Edit vertex/Fit/Spline/Decurve/Ltype gen/Reverse/Undo]:` (`Open` instead of
   `Close` when it is closed). The prompt repeats until <kbd>Enter</kbd>.

**Options**

| Option | What it does |
| --- | --- |
| `Close` / `Open` | Adds or removes the closing segment. |
| `Join` | Adds lines, arcs and polylines that touch its ends. With `Multiple`, `Enter fuzz distance or [Jointype]` joins pieces whose ends are up to that distance apart, by extending them (`Extend`), adding a segment (`Add`) or either (`Both`). |
| `Width` | `Specify new width for all segments`. |
| `Edit vertex` | Moves a marker along the vertices: `[Next/Previous/Break/Insert/Move/Regen/Straighten/Tangent/Width/eXit]` to move, add or remove vertices, straighten a stretch or set the width of one segment. |
| `Fit` | Replaces the segments by arcs through every vertex. |
| `Spline` | Turns the polyline into a smooth spline-fit curve (`SPLINETYPE`, `SPLINESEGS`). |
| `Decurve` | Removes fit and spline curves and arc segments, back to straight segments. |
| `Ltype gen` | `[ON/OFF]`: with ON the linetype pattern runs continuously around the vertices. |
| `Reverse` | Reverses the order of the vertices. |
| `Undo` | Undoes the last PEDIT operation. |

**Multiple**: `Select objects:` several polylines (and, after `Convert Lines, Arcs and Splines to polylines
[Yes/No]? <Y>:`, lines and arcs) to edit at once, typically to join them.

**Example**: join four lines into one closed polyline.

```text
LINE 0,0 50,0 ""
LINE 50,0 50,30 ""
LINE 50,30 0,30 ""
LINE 0,30 0,0 ""
PEDIT M ALL "" Y J 0 ""
```

**Notes**

- `PEDITACCEPT` 1 converts lines and arcs without asking.

## HATCHEDIT

Edits an existing hatch in the Hatch Editor panel: pattern, scale, angle, island style, origin, associativity, and
its boundary.

**Aliases** `HE` · **Menu** Modify › Object

**Steps**

1. Select the hatch.

**Notes**

- `-HATCHEDIT` does it from the command line: `Enter hatch option [Disassociate/Style/Properties/Origin/recreate
  Boundary] <eXit>:`. `recreate Boundary` draws a new polyline or region around the hatch.

## ATTEDIT

Edits the values of the attributes of one block reference from the command line.

**Aliases** `ATE`, `-ATTEDIT` · **Menu** Modify › Object

**Steps**

1. Select the block.
2. Each attribute is asked in turn with its prompt and current value, for example `Part number <P-000>:`.
   <kbd>Enter</kbd> keeps a value.

## EATTEDIT

Edits the attributes of a block reference in a dialog, with every tag, prompt and value in a table.

**Aliases** none · **Menu** Modify › Object

**Steps**

1. Select the block (a double click on a block with attributes opens the same dialog).
