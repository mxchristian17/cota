# Dimension commands

Commands of the **Dimension** menu: linear, aligned, angular, radial, arc length and ordinate dimensions,
chains and baselines, automatic dimensioning, leaders, center marks, threads and the tools that edit dimensions.

Dimensions are drawn in the plane you are looking at, with the current dimension style (`DIMSTYLE`). They are
**associative**: when a dimension is attached to geometry and the geometry changes, the dimension updates. After
each dimension Cota prints the value it measured, for example `Dimension text = 100`.

**Options common to most dimensions** (at the prompt that places the dimension line):

| Option | What it does |
| --- | --- |
| `Mtext` / `Text` | `Enter dimension text <100>:` replaces the measured value. Type `<>` inside your text to keep the measurement, for example `<> H7` or `4× <>`. |
| `Angle` | `Specify angle of dimension text:` rotates the text. |

## DIM

Smart dimension: one command for most dimensions. Pick an object and Cota proposes the right kind from where
the cursor is; or give points as in DIMLINEAR. It keeps creating dimensions until <kbd>Enter</kbd>.

**Aliases** none · **Menu** Dimension

**Steps**

1. `Select objects or specify first extension line origin or [Angular/Baseline/Continue/Ordinate/aLign/LAyer/Undo]:`
   - Click a line or polyline segment: moving the cursor beside it gives an aligned dimension, beyond its ends a
     horizontal or vertical one.
   - Click an arc for a radius, a circle for a diameter.
   - Click a point to start a linear dimension between two points.
2. Place the dimension line. The prompt comes back for the next dimension.

**Options**

| Option | What it does |
| --- | --- |
| `Angular` | An angular dimension, as in [DIMANGULAR](#dimangular). |
| `Baseline` / `Continue` | Dimensions that start from the first extension line of the last dimension, or continue from its second one, as in [DIMBASELINE](#dimbaseline) and [DIMCONTINUE](#dimcontinue). |
| `Ordinate` | `Specify feature location:` an ordinate dimension, as in [DIMORDINATE](#dimordinate). |
| `aLign` | `Select dimensions to align:` moves the dimension lines of other dimensions onto the line of a base dimension. |
| `LAyer` | `Enter layer name or select an object for DIMLAYER`: the layer that new dimensions go on (`DIMLAYER`; `.` = current layer). |
| `Undo` | Removes the last dimension created in this command. |

**Example**: dimension the bottom edge of a plate and the diameter of its hole.

```text
RECTANGLE 0,0 @100,60
CIRCLE 50,30 10
DIM 50,0 50,-12 50,40 70,50 ""
```

## QDIM

Quick dimension: dimensions a whole selection at once, as a chain, staggered, baseline, ordinate, radius or
diameter set.

**Aliases** none · **Menu** Dimension

**Steps**

1. `Select geometry to dimension:` the objects (for example all the holes and edges of a view). <kbd>Enter</kbd>.
2. `Specify dimension line position, or [Continuous/Staggered/Baseline/Ordinate/Radius/Diameter] <Continuous>:`
   click where the dimension line goes, or change the type first. Cota remembers the last type.

**Types**

| Type | Result |
| --- | --- |
| `Continuous` | A chain of dimensions between consecutive points. |
| `Staggered` | Dimensions nested symmetrically, the outer ones farther from the geometry. |
| `Baseline` | Every dimension from the first point, spaced by `DIMDLI`. |
| `Ordinate` | Ordinate dimensions from the UCS origin. |
| `Radius` / `Diameter` | A radius or diameter dimension for each arc or circle. |

**Example**

```text
LINE 0,0 30,0 30,20 70,20 70,0 100,0 ""
QDIM ALL "" 50,-15
```

## AUTODIM

Dimensions a part automatically: overall sizes, the positions of steps, the positions of holes, diameters and
radii, laid out so that they do not overlap. On a layout it dimensions the drawing views generated from the 3D
model.

**Aliases** `ADIM` · **Menu** Dimension

**Steps**

1. In the model: `Select objects to dimension:` the 2D geometry of the part, seen in plan.
   On a layout: `Select drawing views to dimension or [All] <All>:`.
2. `Type [Baseline/Chain] <Baseline>:` baseline dimensions from one edge, or chains.
3. `Features [All/Overall] <All>:` every feature, or only the overall sizes.

Cota prints how many dimensions it created.

**Example**

```text
RECTANGLE 0,0 @100,60
CIRCLE 25,30 5
CIRCLE 75,30 5
AUTODIM ALL "" B A
```

**Notes**

- It works on lines, circles and arcs in plan view. Check the result and adjust it with the editing commands
  below; delete the dimensions you do not want.

## DIMLINEAR

A horizontal, vertical or rotated dimension between two points.

**Aliases** `DLI`, `DIMLIN` · **Menu** Dimension › Linear

**Steps**

1. `Specify first extension line origin or <select object>:` the first point, or <kbd>Enter</kbd> and then
   `Select object to dimension:` to take the two ends of a line, an arc or a polyline segment (on a circle, the
   two quadrants in the direction you drag).
2. `Specify second extension line origin:`
3. `Specify dimension line location or [Mtext/Text/Angle/Horizontal/Vertical/Rotated]:` dragging up or down gives
   a horizontal dimension, left or right a vertical one.

**Options**

| Option | What it does |
| --- | --- |
| `Horizontal` / `Vertical` | Forces the direction, wherever you place the line. |
| `Rotated` | `Specify angle of dimension line <0>:` measures along that angle. |
| `Mtext`, `Text`, `Angle` | See the common options at the top of this page. |

**Example**

```text
DIMLINEAR 0,0 100,0 50,-10
```

## DIMALIGNED

A dimension parallel to the line between its two points: the true length of a sloping edge.

**Aliases** `DAL`, `DIMALI` · **Menu** Dimension › Linear

**Steps**

1. `Specify first extension line origin or <select object>:`
2. `Specify second extension line origin:`
3. `Specify dimension line location or [Mtext/Text/Angle]:`

**Example**

```text
DIMALIGNED 0,0 30,40 10,30
```

## DIMARC

The length of an arc, measured along it, with the arc symbol.

**Aliases** `DAR` · **Menu** Dimension › Linear

**Steps**

1. `Select arc or polyline arc segment:`
2. `Specify dimension line location or [Mtext/Text/Angle/Partial]:`

**Options**

| Option | What it does |
| --- | --- |
| `Partial` | `Specify first point for arc length dimension:` and `Specify second point for arc length dimension:` measure only part of the arc. |

**Example**

```text
ARC C 0,0 20,0 A 90
DIMARC 14.142,14.142 25,25
```

## DIMORDINATE

The X or Y distance of a point from the origin of the UCS, written at the end of a leader: the usual way to
dimension hole positions for machining.

**Aliases** `DOR` · **Menu** Dimension › Linear

**Steps**

1. `Specify feature location:` the point to dimension.
2. `Specify leader endpoint or [Xdatum/Ydatum/Mtext/Text/Angle]:` a leader that goes mostly up or down gives the
   X value; mostly sideways gives the Y value.

**Options**

| Option | What it does |
| --- | --- |
| `Xdatum` / `Ydatum` | Forces the X or the Y value. |

**Example**: the X position of a hole, with the UCS origin at the corner of the part.

```text
DIMORDINATE 25,30 25,75
```

**Notes**

- Move the origin with `UCS` (`UCS 0,0` then a corner of the part) before dimensioning.

## DIMRADIUS

The radius of an arc or circle.

**Aliases** `DRA`, `DIMRAD` · **Menu** Dimension › Radial and angular

**Steps**

1. `Select arc or circle:`
2. Cota prints the value (`Dimension text = R15`), then `Specify dimension line location or [Mtext/Text/Angle]:`.

**Example**

```text
CIRCLE 0,0 15
DIMRADIUS 15,0 25,10
```

## DIMJOGGED

A radius dimension for large arcs whose center is far away or off the sheet: the dimension line starts from a
point you choose and has a jog.

**Aliases** `DJO`, `JOG` · **Menu** Dimension › Radial and angular

**Steps**

1. `Select arc or circle:`
2. `Specify center location override:` where the dimension line starts, in place of the real center.
3. `Specify dimension line location or [Mtext/Text/Angle]:` the jog is placed between the override point and the
   arc.

**Example**

```text
CIRCLE 0,0 100
DIMJOGGED 100,0 50,50 80,30
```

## DIMDIAMETER

The diameter of a circle or arc, with the Ø symbol.

**Aliases** `DDI`, `DIMDIA` · **Menu** Dimension › Radial and angular

**Steps**

1. `Select arc or circle:`
2. Cota prints the value (`Dimension text = ⌀20`), then `Specify dimension line location or [Mtext/Text/Angle]:`.

**Example**

```text
CIRCLE 0,0 10
DIMDIAMETER 10,0 20,15
```

## DIMANGULAR

The angle between two lines, the angle of an arc, an angle on a circle, or the angle at a vertex between two
points.

**Aliases** `DAN` · **Menu** Dimension › Radial and angular

**Steps**

1. `Select arc, circle, line, or <specify vertex>:`
   - A line: `Select second line:` the angle between them.
   - An arc: its included angle.
   - A circle: the point you clicked and `Specify second angle endpoint:`.
   - <kbd>Enter</kbd>: `Specify angle vertex:`, `Specify first angle endpoint:` and `Specify second angle endpoint:`.
2. `Specify dimension arc line location or [Mtext/Text/Angle]:` the side you drag to chooses which of the angles
   is dimensioned.

**Example**

```text
LINE 0,0 50,0 ""
LINE 0,0 40,30 ""
DIMANGULAR 25,0 20,15 30,10
```

## DIMBASELINE

Dimensions that all start from the same base line, stacked at the spacing `DIMDLI`.

**Aliases** `DBA`, `DIMBASE` · **Menu** Dimension › Baseline and continue

**Steps**

1. The base is the last linear, aligned, angular or ordinate dimension created. If there is none, or you choose
   `Select`, `Select base dimension:` click it near the extension line to use as the base.
2. `Specify a second extension line origin or [Select/Undo] <Select>:` each point adds a dimension from the base.
   (For ordinate dimensions: `Specify feature location or [Select/Undo] <Select>:`.)
3. <kbd>Enter</kbd> ends. Before the first new dimension, <kbd>Enter</kbd> means `Select`.

**Example**

```text
DIMLINEAR 0,0 30,0 15,-10
DIMBASELINE 60,0 100,0 ""
```

## DIMCONTINUE

A chain of dimensions, each starting where the previous one ended.

**Aliases** `DCO`, `DIMCONT` · **Menu** Dimension › Baseline and continue

**Steps**: as in [DIMBASELINE](#dimbaseline), with `Select continued dimension:` to choose another start.

**Example**

```text
DIMLINEAR 0,0 30,0 15,-10
DIMCONTINUE 60,0 100,0 ""
```

## DIMSPACE

Spaces parallel linear or angular dimensions evenly from a base dimension, or lines them up.

**Aliases** none · **Menu** Dimension › Baseline and continue

**Steps**

1. `Select base dimension:`
2. `Select dimensions to space:`
3. `Enter value or [Auto] <Auto>:` the distance between dimension lines; `Auto` uses twice the text height; `0`
   lines them all up with the base.

## DIMBREAK

Breaks the dimension and extension lines where other objects cross them, for a cleaner drawing.

**Aliases** none · **Menu** Dimension › Baseline and continue

**Steps**

1. `Select dimension to add/remove break or [Multiple]:`
2. `Select object to break dimension or [Auto/Manual/Remove] <Auto>:` click the object that crosses it, or:
   `Auto` breaks it wherever objects cross it; `Manual` asks `Specify first break point:` and
   `Specify second break point:` (linear and aligned dimensions); `Remove` takes its breaks away.
   With `Multiple`: `Select dimensions:`, then `Enter an option [Break/Remove] <Break>:`.

## MLEADER

A multileader: an arrow, a leader line and a landing with text, a block or nothing. Use it for notes, part
numbers and callouts.

**Aliases** `MLD` · **Menu** Dimension › Leaders and marks

**Steps**

1. `Specify leader arrowhead location or [leader Landing first/Content first/Options] <Options>:` where the arrow
   points.
2. `Specify leader landing location:` where the text goes.
3. Type the text (fields are allowed). An empty line ends it.

**Options**

| Option | What it does |
| --- | --- |
| `leader Landing first` | Asks for the landing first, then the arrowhead. |
| `Content first` | Asks for the text first. |
| `Options` | `Enter an option [Content type/Maxpoints/eXit options]`: `Content type` chooses `[Block/Mtext/None]` (a block asks `Enter block name`); `Maxpoints` sets the points of the leader line, so `Specify next leader point or <landing>:` lets you bend it. |

The look (arrow, landing, text style) comes from the multileader style (`MLEADERSTYLE`).

## QLEADER

A quick leader: points, then text. It creates a multileader.

**Aliases** `LE` · **Menu** Dimension › Leaders and marks

**Steps**

1. `Specify first leader point:` the arrow.
2. `Specify next point:` the bends; <kbd>Enter</kbd> to stop.
3. The text lines; an empty line ends.

## LEADER

A leader line with an annotation: arrow, segments and text.

**Aliases** `LEAD` · **Menu** Dimension › Leaders and marks

**Steps**

1. `Specify leader start point:` the arrow.
2. `Specify next point:` repeats; <kbd>Enter</kbd> ends the line.
3. `Enter first line of annotation text <none>:` and the following lines; an empty line ends.

**Notes**

- For new drawings prefer [MLEADER](#mleader), which has styles, alignment and leaders that can be added later.

## MLEADEREDIT

Adds leaders to a multileader or removes them, so one note can point at several places.

**Aliases** `MLE` · **Menu** Dimension › Leaders and marks

**Steps**

1. `Select a multileader:`
2. `Specify leader arrowhead location or [Remove leaders] <Add leader>:` each point adds a leader. With
   `Remove leaders`, `Specify leaders to remove:`.

## MLEADERALIGN

Lines up several multileaders along a direction, at the current spacing.

**Aliases** `MLA` · **Menu** Dimension › Leaders and marks

**Steps**

1. `Select multileaders:` the ones to align.
2. `Select multileader to align to:` the reference.
3. `Specify direction:` the line along which they are lined up.

## DIMCENTER

A center mark (a small cross) on an arc or circle; with a negative `DIMCEN`, also center lines that extend past it.

**Aliases** `DCE`, `CENTERMARK`, `CM` · **Menu** Dimension › Leaders and marks

**Steps**

1. `Select arc or circle:`

**Example**

```text
CIRCLE 0,0 10
DIMCENTER 10,0 ""
```

**Notes**

- The size of the mark is `DIMCEN` in the dimension style: positive draws a cross of that size, negative draws the
  cross and center lines, 0 draws nothing.

## CENTERLINE

An associative center line midway between two lines, for the axis of a shaft or a symmetric part in a side view.

**Aliases** none · **Menu** Dimension › Leaders and marks

**Steps**

1. `Select first line:`
2. `Select second line:`

**Example**

```text
LINE 0,0 100,0 ""
LINE 0,20 100,20 ""
CENTERLINE 50,0 50,20
```

## THREAD

Draws a cosmetic thread following ISO metric and IRAM standards: on a circle in 2D, the three-quarter arc of the
thread; on a cylindrical face of a solid, a thread texture that also shows in the drawing views. The nearest
standard size is proposed.

**Aliases** `COSMETICTHREAD` · **Menu** Dimension › Leaders and marks

**Steps**

1. `Select circle, thread or cylindrical face:`
2. For a circle: `Specify point on side to thread (inside = shaft, outside = hole) or [Inside/Outside]:` a shaft
   gets the root circle inside, a tapped hole the major diameter outside.
3. `Select thread [M10 / M10x1.25 / …]:` the closest standard sizes are listed.
4. `Add dimension? [Yes/No] <Yes>:` a leader with the designation (for example `M10`), then
   `Specify leader landing location:`.

**Notes**

- Selecting an existing thread without a dimension offers to add it.
- Add a tolerance by editing the text of the dimension in **Properties**, for example `M20-6g`.

## DIMINSPECT

Turns dimensions into inspection dimensions: a frame around the value, with an optional label and inspection rate.

**Aliases** none · **Menu** Dimension › Leaders and marks

**Steps**

1. `Enter option [Add/Remove] <Add>:`
2. Select the dimensions.
3. For Add: `Enter shape [Round/Angular/None]`, `Enter label (Enter = none)` and `Enter inspection rate (Enter = none)`.

## DIMJOGLINE

Adds a jog (a zigzag) to the dimension line of a linear or aligned dimension, to show that the value is not drawn
to scale.

**Aliases** `DJL` · **Menu** Dimension › Leaders and marks

**Steps**

1. `Select dimension to add jog or [Remove]:`
2. `Specify jog location (or press ENTER):` <kbd>Enter</kbd> puts it in the middle.

## DIMEDIT

Edits the text and extension lines of dimensions.

**Aliases** `DED`, `DIMED` · **Menu** Dimension › Edit

**Steps**

1. `Enter type of dimension editing [Home/New/Rotate/Oblique] <Home>:`
2. Select the dimensions.

**Options**

| Option | What it does |
| --- | --- |
| `Home` | Puts moved text back in its default place. |
| `New` | `Enter new dimension text (<> = measurement, Enter = measurement only):` |
| `Rotate` | `Specify angle for dimension text:` |
| `Oblique` | `Enter obliquing angle (press ENTER for none):` slants the extension lines, as in isometric drawings. |

## DIMTEDIT

Moves or rotates the text of a dimension.

**Aliases** `DIMTED` · **Menu** Dimension › Edit

**Steps**

1. `Select dimension:`
2. `Specify new location for dimension text or [Left/Right/Center/Home/Angle]:` drag the text, or align it to
   one end, the center, back home, or rotate it (`Specify angle for dimension text:`).

## DIMOVERRIDE

Changes dimension variables on selected dimensions only, without changing their style; or clears those overrides.

**Aliases** `DOV`, `DIMOVER` · **Menu** Dimension › Edit

**Steps**

1. `Enter dimension variable name to override or [Clear overrides]:` for example `DIMTXT`, then its new value.
   Repeat for more variables; <kbd>Enter</kbd> continues.
2. Select the dimensions.

**Example**: larger text on one dimension.

```text
DIMLINEAR 0,0 100,0 50,-10
DIMOVERRIDE DIMTXT 5 "" L ""
```

## DIMREASSOCIATE

Attaches the points of dimensions to geometry, so they follow it when it changes.

**Aliases** `DRE` · **Menu** Dimension › Edit

**Steps**

1. `Select dimensions to reassociate:`
2. For each definition point: `Specify point 1 of 2 on an object <next>:` snap to the object point;
   <kbd>Enter</kbd> leaves that point as it is.

## DIMDISASSOCIATE

Detaches dimensions from the geometry: they stop following it.

**Aliases** `DDA` · **Menu** Dimension › Edit

**Steps**

1. `Select dimensions to disassociate:` Cota prints how many were detached.

## DIMREGEN

Updates every associative dimension to the current position of its geometry.

**Aliases** none · **Menu** Dimension › Edit

**Notes**

- Cota normally updates dimensions on its own; use DIMREGEN after opening a drawing edited elsewhere.
