# User guide

This guide explains how Cota works. For the list of every command see the [command reference](commands.md);
for a first walkthrough see [getting started](getting-started.md).

- [The command line](#the-command-line)
- [Entering points and distances](#entering-points-and-distances)
- [Selecting objects](#selecting-objects)
- [Drawing aids](#drawing-aids)
- [Layers and properties](#layers-and-properties)
- [Blocks, text and hatches](#blocks-text-and-hatches)
- [3D modeling](#3d-modeling)
- [Dimensions](#dimensions)
- [Layouts, drawing views and plotting](#layouts-drawing-views-and-plotting)
- [Files](#files)
- [Natural-language modeling](#natural-language-modeling)
- [Toolbars](#toolbars)
- [Settings and system variables](#settings-and-system-variables)
- [Install as an app](#install-as-an-app)
- [Keyboard and mouse](#keyboard-and-mouse)

## The command line

Everything in Cota is a command. Type its name (or an alias: `L` for `LINE`, `C` for `CIRCLE`, `M` for
`MOVE`…) and press <kbd>Enter</kbd> or <kbd>Space</kbd>. While you type, the command line suggests matching
commands; <kbd>Tab</kbd> completes the suggestion. Menus and toolbars run the same commands.

A command asks questions in the command line, for example:

```text
Specify center point for circle or [3P/2P/Ttr (tan tan radius)]:
```

- **Options** are in square brackets. Type the capitalized letters (`3P`, `T`) or click the option.
- **The default** is in angle brackets, `<10.0000>`: press <kbd>Enter</kbd> to accept it.
- <kbd>Enter</kbd> (or <kbd>Space</kbd>, or a right-click) finishes the current step.
- <kbd>Esc</kbd> cancels the command.
- <kbd>Enter</kbd> on an empty command line repeats the last command.
- <kbd>↑</kbd> and <kbd>↓</kbd> walk through the command history.

You never need to click the command line: typing anywhere in the window sends the keys there (unless you are
typing in another field or a dialog is open).

### Scripts: several commands at once

A script is a list of inputs that answer the prompts in order, as if you typed them: separate them with spaces or
new lines, write `""` for an empty Enter and put text with spaces in double quotes. When a command ends, the next
input starts another one.

```
CIRCLE 50,50 20
RECTANGLE 0,0 @100,60
TEXT 10,70 5 0 "Base plate" ""
```

Paste a script in the command line (<kbd>Ctrl</kbd>+<kbd>V</kbd>, when no objects are copied) or run **SCRIPT** to
type it, load a `.scr` file or **copy a link** that shares it. The whole script is one undo step. If an input is
rejected, the script stops there and tells you which one. A shared link only shows the script: it runs when you
press Run.

## Entering points and distances

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

Angles are in degrees. Coordinates are in the current **UCS** (user coordinate system); see [UCS](#ucs).

With **dynamic input** on (<kbd>F12</kbd> or **DYN** in the status bar), `10,20` after the first point is
relative to the last point, as in the input box next to the cursor of classic CAD; `#10,20` stays absolute.

## Selecting objects

When a command asks you to *select objects*:

- **Click** an object to add it.
- **Drag from left to right** (blue window): selects objects completely inside.
- **Drag from right to left** (green crossing): selects objects inside or touching.
- Type an option: `ALL`, `Last`, `Previous`, `Window`, `Crossing`, `WPolygon`, `CPolygon`, `Fence`,
  `Remove` (then click to deselect), `Add`, `Undo`.
- <kbd>Enter</kbd> ends the selection.

You can also select **before** the command: click or drag with no command running, then type the command.
<kbd>Ctrl</kbd>+<kbd>A</kbd> selects everything, <kbd>Esc</kbd> clears the selection and <kbd>Delete</kbd> erases it.

- **Quick Select:** `QSELECT` (also in the right-click menu) selects by object type and property — layer,
  linetype, length, radius, area, text contents, dimension measurement, block name… — with `=`, `<>`, `>`, `<` or a
  wildcard, to include or exclude, optionally appending to the current selection.
- **Groups:** `GROUP` (with `Name` and `Description`) makes objects select together; `UNGROUP` breaks a group and
  `-GROUP` lists, adds, removes, renames or makes a group not selectable. <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd>
  (`PICKSTYLE`) turns group selection off and on.
- **Isolate:** `ISOLATEOBJECTS` leaves only the selected objects in sight, `HIDEOBJECTS` hides them,
  `UNISOLATEOBJECTS` shows everything again (also in the right-click menu). Hidden objects are not saved as hidden.
- **Clean up:** `PURGE` removes unused blocks (also nested ones), dimension styles, layers and linetypes.

**Grips:** selected objects show grips. Click a grip, then click its new position to stretch a corner, move a
center, change a radius or move a dimension text. Press <kbd>Space</kbd> (or <kbd>Enter</kbd>) to switch the grip
to **MOVE**, **ROTATE**, **SCALE** and **MIRROR**, which act on everything selected from that grip; `Base point`
picks another base, `Copy` leaves copies until you exit, `eXit` or <kbd>Esc</kbd> ends.

<kbd>Esc</kbd> cancels the whole command (the command line shows `*Cancel*`).

**Saved views:** saving a drawing also saves the view of each viewport (and of each layout sheet) and the
active viewport; opening it again restores them.

## Drawing aids

| Aid | Key | What it does |
| --- | --- | --- |
| **OSNAP** (object snap) | <kbd>F3</kbd> | Snaps the cursor to exact points of objects: endpoint, midpoint, center, geometric center, node, quadrant, intersection, perpendicular, tangent, nearest. Click the ▾ next to OSNAP or type `OSNAP` to choose the modes |
| **ORTHO** | <kbd>F8</kbd> | Restricts the cursor to horizontal and vertical directions |
| **POLAR** (polar tracking) | <kbd>F10</kbd> | Near a multiple of `POLARANG` (90° by default; 45, 30, 15…) from the base point, the cursor runs along that dashed ray; a typed distance goes that way. ORTHO and POLAR exclude each other |
| **SNAP** | <kbd>F9</kbd> | Snaps the cursor to a grid of fixed spacing |
| **OTRACK** (object snap tracking) | <kbd>F11</kbd> | Hover a snap point to acquire it; dashed tracking lines show alignments with it |
| **DYN** (dynamic input) | <kbd>F12</kbd> | After the first point, typed `x,y` is relative without `@` |

Measure distances with `DIST`. `ID` shows the coordinates of a point, `AREA` the area and perimeter of points or
an object (with `Add area`/`Subtract area` for a running total), `LIST` the properties of the selected objects and
`MASSPROP` the volume, surface area, bounding box and centroid of solids.

### UCS

The **UCS** (user coordinate system) defines where X, Y and Z point. Drawing commands work on its XY plane, so
to draw on a face of a solid you first align the UCS to it. `UCS` offers: World, Origin, 3 points, Object,
Face, View, X/Y/Z rotations, Previous, and named UCSs (Save/Restore). The UCS icon shows its axes.

When you switch to a standard view (`VIEW FRONT`, `VIEW RIGHT`, or the view cube), Cota aligns the
construction plane with the view, so you always draw on the plane you are looking at.

## Layers and properties

`LAYER` opens the **Layer Properties** dialog: create, rename and delete layers and set their color, linetype,
lineweight and plot style; turn them on or off, freeze, lock and set whether they plot. The current layer is
shown in the status bar (and remembered in the saved file). New objects go to the current layer.

Layer tools: `LAYMCUR` (make the layer of an object current), `LAYISO` / `LAYUNISO`, `LAYOFF` / `LAYON`,
`LAYFRZ` / `LAYTHW`, `LAYLCK` / `LAYULK`. `-LAYER` does the same from the command line, for scripts.

`LINETYPE` loads linetypes (CENTER, HIDDEN, PHANTOM, DASHED, ISO patterns…) and sets the global scale.

**Color and lineweight per object:** objects take the color and lineweight of their layer (**ByLayer**) unless
they have their own. `COLOR` (index 1–255, a name, `#rrggbb` or `r,g,b`) and `LWEIGHT` (ByLayer, Default or mm) set
them for new objects; change them for the selection in Properties or in the lists of the Properties toolbar.
They are saved in DXF/DWG and plotted.

**Properties** (`PROPERTIES`, or the ▣ strip on the left) shows the properties of the selection: layer,
color, linetype, lineweight and the geometry of the object (coordinates, radius, height…). Edit any value
there. `MATCHPROP` copies properties from one object to others.

## Blocks, text and hatches

- **Blocks:** `BLOCK` turns a group of objects into a reusable definition; `INSERT` places it (with scale and
  rotation). `ATTDEF` adds attributes (text fields asked on insertion); `ATTEDIT` / `EATTEDIT` edit their
  values, `ATTSYNC` updates references after a block changes. `EXPLODE` breaks a block into its parts.
- **Text:** `TEXT` writes single lines on their **baseline** (`Justify` for center or right; every <kbd>Enter</kbd>
  starts the next line, an empty line ends), `MTEXT` multiline text from its top-left corner. `%%c`, `%%d` and
  `%%p` give Ø, ° and ±. Double-click a text to edit it.
  `FIELD` inserts live fields (date, file name, drawing properties set with `DWGPROPS`, sheet number…).
- **Hatches:** `HATCH`, then click inside a closed area. The *Hatch Creation* panel sets pattern, scale, angle,
  solid fill and island detection. Hatches are associative: they follow when their boundary moves.
  `HATCHEDIT` (or a double-click) edits them.

## 3D modeling

### Creating solids

- **Primitives:** `BOX`, `CYLINDER`, `CONE` (also truncated), `SPHERE`, `TORUS`.
- **From profiles:** `EXTRUDE` a closed profile (polyline, circle, rectangle, ellipse, closed spline…) to a
  height; `REVOLVE` it around an axis.
- **Booleans:** `UNION`, `SUBTRACT` (select the solids to keep, <kbd>Enter</kbd>, then the ones to remove),
  `INTERSECT`.
- **Edges:** `FILLETEDGE` and `CHAMFEREDGE` round or bevel the edges of a solid.

Primitives and extrusions stay parametric: select one and change its dimensions in Properties.

### Moving in 3D

`MOVE`, `COPY`, `ROTATE`, `MIRROR`, `SCALE`, `ARRAY` and `ALIGN` work on solids in any view. `ROTATE`
rotates about an axis perpendicular to the current view, so to turn a part about a vertical axis use the
Top view, and about a horizontal axis use Front or Right.

### Looking at the model

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

### 2D from 3D

- `FLATSHOT` creates a flat 2D drawing of the solids as seen in the current view (visible and hidden lines).
- `SOLPROF` creates profile lines of the solids inside a layout viewport, on layers for visible and hidden
  lines.

## Dimensions

The dimension commands are in the **Dimension** menu and on the dimension toolbar on the left.

| Kind | Commands |
| --- | --- |
| Linear | `DIMLINEAR`, `DIMALIGNED`, `DIMBASELINE`, `DIMCONTINUE`, `DIMORDINATE` |
| Radial and angular | `DIMRADIUS`, `DIMDIAMETER`, `DIMJOGGED`, `DIMANGULAR`, `DIMARC` |
| Smart | `DIM` (picks the right type from what you click), `QDIM` (many at once) |
| Automatic | `AUTODIM`: dimensions a whole part — overall sizes, steps, hole positions, diameters and radii — in baseline or chain style. In a layout it dimensions every drawing view without repeating what an aligned view already shows |
| Leaders | `MLEADER`, `QLEADER`, `LEADER`, with `MLEADERSTYLE`, `MLEADEREDIT`, `MLEADERALIGN` |
| Annotation | `DIMCENTER`, `CENTERLINE`, `THREAD`, `DIMINSPECT`, `DIMBREAK`, `DIMSPACE`, `DIMJOGLINE` |
| Editing | `DIMEDIT`, `DIMTEDIT`, `DIMOVERRIDE`, `DIMREASSOCIATE`, `DIMDISASSOCIATE`, `DIMREGEN`, and right-click on a dimension |

`DIMSTYLE` manages dimension styles (text, arrows, lines, units, tolerances, fit). Dimensions are
**associative**: they update when the geometry changes (`DIMASSOC`). Annotative dimensions keep their
paper size at any annotation scale (`CANNOSCALE`).

## Layouts, drawing views and plotting

A **layout** is a drawing sheet. Click the **Layout1** tab (or **+** to add one; `LAYOUT` manages them).

- **Page setup:** `PAGESETUP` — paper size, orientation, margins, plot style (color or monochrome).
- **Viewports:** `MVIEW` opens windows onto the model at a scale; `MSPACE` / `PSPACE` (or double-click
  inside / outside a viewport) switch between working in the model and on the sheet. `VPMAX` / `VPMIN`,
  `VPCLIP` and `VPLAYER` (per-viewport layer visibility) complete the set.
- **Title block:** each new layout comes with a frame and a title block whose fields (file name, sheet
  `n OF m`, date, drawing properties) fill themselves. Save and reuse sheets as `.cotat` templates.
- **Drawing views from the 3D model:** `VIEWBASE` places a base view and its projected views (orthographic
  and isometric), with hidden lines and optional shading; choose first- or third-angle projection with
  `VIEWSTD`. `VIEWPROJ` adds more projected views, `VIEWEDIT` changes a view (scale, hidden lines) and
  `VIEWUPDATE` regenerates views after the model changes.
- **Plot:** `PLOT` opens the plot dialog with a **preview** of the sheet and exports a **vector PDF** with
  lineweights, linetypes, hatches and shading. For the model choose paper size, orientation, plot area (Extents,
  Display or a Window you pick), scale (fit to paper or 1:n), centering, plot style (color, monochrome, grayscale)
  and lineweights; a layout plots at 1:1 with its page setup. `-PLOT` plots right away with the last settings, and
  `PUBLISH` exports several layouts to one multi-page PDF.

## Files

| Format | Open | Save / export | Notes |
| --- | --- | --- | --- |
| `.cota` | `OPEN` | `SAVE` | Native format (JSON). Keeps everything: model, layouts, layers, styles, views |
| `.dxf` | `OPEN`, `IMPORT` | `EXPORT DXF` | 2D geometry, layers, linetypes, hatches, dimensions, blocks |
| `.dwg` | `OPEN` | `EXPORT DWG` | Requires the optional server with LibreDWG installed |
| `.obj` | `IMPORT` | `EXPORT OBJ` | 3D meshes |
| `.pdf` | — | `PLOT`, `PUBLISH` | Vector output |
| `.cotat` | layout templates | layout templates | Sheets with title block |

**Where drawings are stored:**

- **Download:** with no folder chosen and no account, `SAVE` downloads `name.cota`; `OPEN` opens
  the file picker (with a folder or an account, pick *Device* in its dialog).
- **Working folder:** `OPENFOLDER` (Chrome, Edge and other Chromium browsers) gives Cota access to a folder.
  `SAVE` writes into it, `OPEN` lists its drawings, and the drawing name in the top bar accepts
  `folder/subfolder/name`. Turn on **Autosave** to save the open file every two minutes.
- **Account:** with the optional server, `LOGIN` and save to the server (`CLOUD` switches back from a local
  folder to the account).

## Natural-language modeling

`PROMPT` (alias `AI`) opens a box where you describe what you want ("a 100×60×10 plate with four Ø8 holes
at 10 from the corners") and Cota builds or edits the model. It needs the optional server and your own key for
a compatible LLM provider, configured in the same dialog. The key is stored encrypted on your server.

## Toolbars

Cota has 23 classic toolbars with icons: Dimension, Standard, Styles, Layers, Layers II, Properties, Draw, Modify,
Modify II, Object Snap, UCS, View, Visual Styles, Zoom, Viewports, Layouts, Modeling, Solid Editing, Text,
Multileader, Insert, Inquiry and Drawing Views. Only Dimension is shown at first.

- **Show or hide them** from **Tools ▸ Toolbars** (a check mark means visible), by **right-clicking** any
  toolbar, with `TOOLBAR` (a dialog with *Show all*, *Hide all* and *Reset*), or from the command line with
  `-TOOLBAR <name>|ALL [Show/Hide/Left/Right/Top/Bottom/Float]`.
- **Dock or float them:** drag a toolbar by its grip (the dotted strip) to any edge of the drawing area, next to
  other toolbars, or leave it floating. A floating toolbar has a title bar: drag it to move it, double-click it
  to dock it again, ✕ to close it. Right-click also offers *Dock Top/Left/Right/Bottom*, *Float* and *Close*.
- A button cancels the command in progress and starts its own, like typing it. The **Object Snap** buttons are
  different: they act inside the current command (for example, click *Endpoint* when LINE asks for a point).
- The lists on the toolbars set the current layer (Layers), the color, linetype and lineweight of the selection or
  of new objects (Properties) and the current dimension style (Dimension, Styles).

**Your setup is remembered:** toolbars, palettes, command line, clean screen, view cube, theme, visual style,
drawing aids and their modes, autosave, full screen and user variables (`UCSICON`, `ZOOMFACTOR`, `ZOOMWHEEL`…)
are saved in your browser, even without an account. When you sign in to a Cota server they are also saved to your
account and follow you to other computers (the most recent copy wins).

## Settings and system variables

`OPTIONS` sets the theme and the colors of the background, grid and crosshair. `LIMITS` sets the drawing
limits. Type the name of a system variable to see or change it, for example `ZOOMFACTOR`, `ZOOMWHEEL`,
`OFFSETGAPTYPE`, `DIMASSOC` or any `DIM*` variable. The full list is in the
[command reference](commands.md#system-variables).

Screen: <kbd>Ctrl</kbd>+<kbd>0</kbd> toggles a clean screen (only the drawing), <kbd>Ctrl</kbd>+<kbd>9</kbd>
a compact command line; `NAVVCUBE` and `UCSICON` show or hide the view cube and the UCS icon. `GRID` (or
<kbd>F7</kbd>, or the GRID button of the status bar) shows or hides the grid. `FULLSCREEN` (or the ⤢ button)
hides every browser and system bar; press and hold <kbd>Esc</kbd> to leave it (a short <kbd>Esc</kbd> still
cancels commands).

## Install as an app

In Chrome, Edge and other Chromium browsers, click **Install app** in the top bar (or the install icon in the
address bar). Cota then opens in its own window, without the address bar or tabs, with a shortcut on your desktop
and in your applications menu, and it **works offline**: drawing, files on your disk, DXF and PDF need no
connection (an account, cloud storage and DWG need the server). It updates itself when a new version is
published. If you turned full screen on, it comes back with your first click after opening the app.

## Keyboard and mouse

| Input | Action |
| --- | --- |
| <kbd>Enter</kbd> / <kbd>Space</kbd> | Run the command, finish a step, or repeat the last command |
| <kbd>Esc</kbd> | Close the open dialog; otherwise cancel the command and clear the selection |
| <kbd>Tab</kbd> | Complete the suggested command |
| <kbd>↑</kbd> / <kbd>↓</kbd> | Command history |
| <kbd>F3</kbd> | Object snap on/off |
| <kbd>F7</kbd> | Grid on/off |
| <kbd>F8</kbd> | Ortho on/off |
| <kbd>F9</kbd> | Snap on/off |
| <kbd>F10</kbd> | Polar tracking on/off |
| <kbd>F11</kbd> | Object snap tracking on/off |
| <kbd>F12</kbd> | Dynamic input on/off |
| <kbd>Ctrl</kbd>+<kbd>Z</kbd> | Undo |
| <kbd>Ctrl</kbd>+<kbd>Y</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> | Redo |
| <kbd>Ctrl</kbd>+<kbd>A</kbd> | Select all |
| <kbd>Delete</kbd> | Erase the selection |
| <kbd>Ctrl</kbd>+<kbd>R</kbd> | Next viewport |
| <kbd>Ctrl</kbd>+<kbd>PgUp</kbd> / <kbd>PgDn</kbd> | Previous / next tab (Model, layouts) |
| <kbd>Ctrl</kbd>+<kbd>0</kbd> / <kbd>Ctrl</kbd>+<kbd>9</kbd> | Clean screen / compact command line |
| Left click | Pick a point, select an object |
| Left drag | Selection window (left to right) or crossing (right to left) |
| Right click | Enter (during a command) |
| Middle drag | Pan |
| Middle double-click | Zoom extents |
| Right drag / <kbd>Shift</kbd> + middle drag | Orbit (in the model) |
| Wheel | Zoom at the cursor |
