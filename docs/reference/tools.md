# Tools commands

Commands of the **Tools** menu: measuring and inquiry, groups, isolating objects, draw order, coordinate systems,
object snaps, settings, scripts and the modeling agent.

## DIST

Measures the distance and angles between two points.

**Aliases** `DI` · **Menu** Tools › Inquiry

**Steps**

1. `Specify first point:` and `Specify second point:` snap to the geometry for exact results.

Cota prints, for example:

```text
Distance = 50.0000, Angle in XY Plane = 36.87, Angle from XY Plane = 0.00
Delta X = 40.0000, Delta Y = 30.0000, Delta Z = 0.0000
```

**Example**

```text
DIST 0,0 40,30
```

## ID

Shows the coordinates of a point in the current UCS.

**Aliases** none · **Menu** Tools › Inquiry

**Steps**

1. `Specify point:` Cota prints `X = …  Y = …  Z = …`.

**Example**

```text
ID 25,40
```

## AREA

Measures the area and perimeter of a region given by points, or of an object; keeps a running total when adding
and subtracting areas.

**Aliases** `AA` · **Menu** Tools › Inquiry

**Steps**

1. `Specify first corner point or [Object/Add area/Subtract area] <Object>:` click the corners of the area one after
   the other and press <kbd>Enter</kbd>, or press <kbd>Enter</kbd> at once to pick an object.
2. Cota prints `Area = …, Perimeter = …` (for a circle, `Circumference`).

**Options**

| Option | What it does |
| --- | --- |
| `Object` | `Select objects:` the area of a circle, closed polyline, rectangle, ellipse, spline or hatch. |
| `Add area` | Starts a running total. The prompts begin with `(ADD mode)`; each area measured is added and Cota prints `Total area = …`. |
| `Subtract area` | In `(SUBTRACT mode)` each area measured is subtracted from the total (for holes). Switch between adding and subtracting at any time; `eXit` (the default) ends. |

**Example**: a plate minus a hole.

```text
RECTANGLE 0,0 @100,60
CIRCLE 50,30 10
AREA A O 0,30 "" S O 60,30 "" X
```

## LIST

Lists the properties of the selected objects in the command line: type, layer, points, lengths, radii, areas and
volumes.

**Aliases** `LI`, `LS` · **Menu** Tools › Inquiry

**Steps**

1. `Select objects:` and <kbd>Enter</kbd>.

## MASSPROP

Mass properties of 3D solids: volume, mass (with density 1), surface area, bounding box and centroid.

**Aliases** none · **Menu** Tools › Inquiry

**Steps**

1. `Select objects:` the solids.

Cota prints:

```text
----------------   SOLIDS   ----------------
Mass:            12000.0000
Volume:          12000.0000
Surface area:    3200.0000
Bounding box:    X: 0.0000 -- 20.0000
                 Y: 0.0000 -- 30.0000
                 Z: 0.0000 -- 20.0000
Centroid:        X = 10.0000  Y = 15.0000  Z = 10.0000
```

**Example**

```text
BOX 0,0,0 @20,30 20
MASSPROP L ""
```

**Notes**

- Multiply the volume by the density of the material to get the real mass.

## GROUP

Groups objects so that they are selected together with one click, while each keeps its own properties.

**Aliases** `G` · **Menu** Tools › Groups

**Steps**

1. `Select objects or [Name/Description]:` the objects, then <kbd>Enter</kbd>. Without a name the group is
   unnamed: `Unnamed group has been created (*A1).`

**Options**

| Option | What it does |
| --- | --- |
| `Name` | `Enter a group name:` gives the group a name of your own before selecting. |
| `Description` | `Enter group description:` |

**Notes**

- <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd> switches group selection on and off (`PICKSTYLE`), to pick a
  single object inside a group.
- `-GROUP` does everything from the command line:
  `Enter a group option [?/Add/Remove/Explode/REName/Selectable/Create] <Create>:` to list, add or remove objects,
  explode, rename or make a group not selectable as a whole.

## UNGROUP

Breaks up a group; its objects stay as they are.

**Aliases** none · **Menu** Tools › Groups

**Steps**

1. `Select group or [Name]:` click an object of the group, or `Name` and `Enter a group name:`.

## ISOLATEOBJECTS

Temporarily hides everything except the selected objects, to work on them without clutter.

**Aliases** `ISOLATE` · **Menu** Tools › Isolate

**Steps**

1. `Select objects:` the objects to keep visible.

**Notes**

- `UNISOLATEOBJECTS` shows everything again. The same options are in the right-click menu of a selection.

## HIDEOBJECTS

Temporarily hides the selected objects.

**Aliases** none · **Menu** Tools › Isolate

**Steps**

1. `Select objects:` the objects to hide.

## UNISOLATEOBJECTS

Shows again the objects hidden by ISOLATEOBJECTS or HIDEOBJECTS.

**Aliases** `UNISOLATE` · **Menu** Tools › Isolate

## DRAWORDER

Changes which objects are drawn on top of which: put a hatch behind its outline, a wipeout under a text, an image
at the back.

**Aliases** `DR` · **Menu** Tools › Draw Order

**Steps**

1. `Select objects:`
2. `Enter object ordering option [Above objects/Under objects/Front/Back] <Back>:`

**Options**

| Option | What it does |
| --- | --- |
| `Front` / `Back` | In front of or behind everything. |
| `Above objects` / `Under objects` | `Select reference objects:` just above or just below the objects you choose. |

**Example**

```text
DRAWORDER L "" B
```

## TEXTTOFRONT

Brings texts, dimensions or both in front of all other objects, so hatches and images never cover them.

**Aliases** none · **Menu** Tools › Draw Order

**Steps**

1. `Bring to front [Text/Dimensions/Both] <Both>:` Cota prints how many objects moved.

## UCS

Defines a user coordinate system: a new origin and orientation for typed coordinates, ORTHO, the grid and new
objects. Use it to draw on a sloping face or to dimension from a datum.

**Aliases** none · **Menu** Tools › UCS

**Steps**

1. Cota prints the current UCS (`Current ucs name:  *WORLD*`).
2. `Specify origin of UCS or [Face/NAmed/OBject/Previous/View/World/X/Y/Z/ZAxis] <World>:` a point moves the
   origin; then `Specify point on X-axis or <Accept>:` and `Specify point on the XY plane or <Accept>:` turn the
   axes (three-point UCS). <kbd>Enter</kbd> accepts at each step.

**Options**

| Option | What it does |
| --- | --- |
| `World` | Back to the world coordinate system. |
| `Previous` | The UCS used before. |
| `View` | The XY plane facing you. |
| `Face` | `Select face of solid, surface, or mesh:` the UCS lies on that face; `Enter an option [Next/Xflip/Yflip] <accept>:` adjusts it. |
| `OBject` | `Select object to align UCS:` the UCS takes the orientation of that object. |
| `X` / `Y` / `Z` | `Specify rotation angle about X axis <90>:` rotates the UCS about that axis. |
| `ZAxis` | `Specify new origin point or [Object] <0,0,0>:` and `Specify point on positive portion of Z-axis`: an origin and the direction of Z. |
| `NAmed` | `Enter an option [Restore/Save/Delete/?]:` saves the current UCS with a name, restores or deletes one, or lists them. |

**Example**: a UCS with its origin at a corner of the part, then back to World.

```text
UCS 100,50 ""
UCS W
```

**Notes**

- Dynamic UCS: while a drawing command waits for its first point, hovering a flat face of a solid puts the UCS on
  that face temporarily (the UCS button in the status bar).
- `UCSICON` controls the icon; `PLAN` looks straight down the UCS.

## OSNAP

Opens the **Object Snap** settings: which snaps are running (always active) while you pick points. See
[object snaps](object-snaps.md).

**Aliases** `OS`, `-OSNAP`, `DDOSNAP` · **Menu** Tools

**Notes**

- <kbd>F3</kbd> turns running snaps on and off. A snap name typed at a point prompt (`END`, `MID`, `CEN`, `INT`,
  `TAN`, `PER`, `NEA`, `QUA`, `NOD`, `EXT`, `PAR`, `INS`, `GCE`, `APPINT`, `M2P`, `FROM`, `NON`…) applies to that
  point only.
- On 3D solids the snaps use the real edges (Endpoint, Midpoint, Center and Quadrant of round edges, after
  booleans and fillets too), and `ZCEN`, `ZPER` and `ZNEA` snap to faces.

## GRID

Shows or hides the grid.

**Aliases** none · **Menu** Tools

**Steps**

1. `Enter an option [ON/OFF] <OFF>:` <kbd>F7</kbd> does the same.

## TOOLBAR

Shows or hides toolbars, from a dialog with the list of the 23 toolbars. Toolbars can be docked on any edge or
float; Cota remembers your layout.

**Aliases** `TO`, `TBCONFIG` · **Menu** Tools

## OPTIONS

Opens the settings dialog, with the tabs **Display** (theme and colors of the background, grid and crosshair),
**Open and Save**, **Drafting**, **Editing** and **User Preferences**.

**Aliases** `OP` · **Menu** Tools

## SCRIPT

Runs several commands as one operation and one undo step: type or paste them, load a `.scr` file, or copy a link
that shares the script.

**Aliases** `SCR` · **Menu** Tools › Other

**Notes**

- The inputs answer the prompts in order, as if typed: separate them with spaces or new lines, write `""` for an
  empty <kbd>Enter</kbd> and put text with spaces in double quotes. When a command ends, the next input starts
  another one. Every example on these reference pages is a script.
- If an input is rejected, the script stops there and says which one. A shared link only shows the script; it
  runs when you press Run.
- Pasting a script in the command line (<kbd>Ctrl</kbd>+<kbd>V</kbd> with nothing copied) runs it directly.

## AGENT

Opens or closes the modeling agent panel: a conversation with a language model, using your own API key, that runs
Cota for you. Describe the part ("a 100 × 60 plate 10 thick with four Ø8 holes 10 mm from the corners") and the
agent draws it with commands you can see and undo.

**Aliases** `AGENTPANEL` · **Menu** Tools › Other

**Notes**

- The key stays in your browser and is sent only to the provider you choose. See
  [modeling agent](../guides/agent.md) and [external agents](../external-agents.md).

## COMPACT

Summarizes the agent conversation to free its context. The drawing keeps everything already built.

**Aliases** none · **Menu** Tools › Other

## PROMPT

Generates or edits the model with natural language through the optional server: opens a prompt box.

**Aliases** `AI` · **Menu** Tools › Other

**Notes**

- It needs the optional server with a configured language model. Without a server, use [AGENT](#agent).

## ATTSYNC

Updates block references after their attribute definitions changed, keeping the values already filled in.

**Aliases** none · **Menu** Tools › Other

**Steps**

1. `Enter an option [?/Name/Select] <Select>:` `?` lists the blocks with attributes; `Name` asks
   `Enter name of block to synchronize:`; `Select` asks `Select a block:`.
