# View commands

Commands of the **View** menu: zoom and pan, standard and named views, orbiting in 3D, visual styles, model
viewports, layout viewports and the parts of the screen you can show or hide.

The mouse does most of this without commands: the wheel zooms at the cursor, the middle button pans,
<kbd>Shift</kbd> + middle button (or the right button in 3D views) orbits, and a double click with the middle
button zooms to the extents. See [keyboard and mouse](../guides/interface.md#keyboard-and-mouse).

## VIEW

Switches to a standard view (top, front, isometric…) or saves and restores named views.

**Aliases** `V`, `-VIEW`, `-V` · **Menu** View › Views

**Steps**

1. `Enter an option [?/Delete/Orthographic/Restore/Save/Window] or a view [Top/Bottom/Front/BAck/Left/Right/SWiso/SEiso/NEiso/NWiso]:`
   type a view name to switch to it, or an option.

**Options**

| Option | What it does |
| --- | --- |
| *a standard view* | `Top`, `Bottom`, `Front`, `BAck`, `Left`, `Right` and the isometric views `SWiso`, `SEiso`, `NEiso`, `NWiso`. |
| `Save` | `Enter view name to save:` stores the current view (camera and zoom) with the drawing. |
| `Window` | `Enter view name to save:` then `Specify first corner:` and `Specify opposite corner:` saves the area inside the window. |
| `Restore` | `Enter view name to restore:` |
| `Delete` | `Enter view name(s) to delete:` |
| `?` | Lists the named views. |
| `Orthographic` | `Enter an option [Top/Bottom/Front/BAck/Left/Right] <Top>:` the same standard views. |

**Example**

```text
VIEW SEiso
VIEW S Detail
VIEW Top
VIEW R Detail
```

**Notes**

- The view cube in the corner of the viewport does the same with a click on a face, an edge or a corner.
- Views of each viewport and each layout are saved with the drawing.

## PERSPECTIVE

Shows the active viewport in perspective: far things look smaller.

**Aliases** none · **Menu** View › Views

## ORTHOGRAPHIC

Shows the active viewport in parallel projection, the usual projection for technical drawing.

**Aliases** none · **Menu** View › Views

## ZOOM

Zooms the view in or out: to a window, by a factor, to the drawing's extents or limits, to objects, or back to the
previous view.

**Aliases** `Z` · **Menu** View

**Steps**

1. `Specify corner of window, enter a scale factor (nX or nXP), or [All/Center/Dynamic/Extents/Previous/Scale/Window/Object] <real time>:`
   - Click two corners: zooms to that window.
   - Type a factor: `2` (relative to the limits), `2X` (relative to the current view), `1/50XP` (relative to paper
     space, inside a layout viewport, to set its scale).
   - <kbd>Enter</kbd>: real-time zoom, dragging up and down. <kbd>Esc</kbd> or <kbd>Enter</kbd> exits.

**Options**

| Option | What it does |
| --- | --- |
| `All` | Shows the limits and everything drawn (in 3D views, everything drawn). |
| `Center` | `Specify center point:` and `Enter magnification or height`: centers the view on a point with a height (or a factor `nX`). |
| `Dynamic` | Shows the whole drawing with a box the size of the view. Move the box, click to switch to resizing it, <kbd>Enter</kbd> to zoom to it. |
| `Extents` | Fits everything drawn in the view. |
| `Previous` | Goes back to the previous view. |
| `Scale` | `Enter a scale factor (nX or nXP):` |
| `Window` | `Specify first corner:` and `Specify opposite corner:` |
| `Object` | `Select objects:` fits the selected objects in the view. |

**Example**

```text
ZOOM E
ZOOM 0.8X
```

## PAN

Real-time pan: drag the view with the left button.

**Aliases** `P` · **Menu** View › Pan

**Steps**

1. `Press ESC or ENTER to exit, or right-click to display shortcut menu.` drag with the left button. The right
   button offers the other real-time tools (zoom, orbit).

## -PAN

Moves the view by a displacement you type or give with two points.

**Aliases** `-P` · **Menu** View › Pan

**Steps**

1. `Specify base point or displacement:` a point, or a displacement such as `100,0`.
2. `Specify second point:` <kbd>Enter</kbd> takes the first answer as the displacement.

**Example**: shift the view by 100 units along X.

```text
-PAN 0,0 100,0
```

## 3DORBIT

Turns the view around the target by dragging, keeping the Z axis vertical.

**Aliases** `3DO`, `ORBIT` · **Menu** View › Orbit

**Steps**

1. `Press ESC or ENTER to exit, or right-click to display shortcut menu.` drag with the left button.

**Notes**

- Orbiting with the mouse does the same without a command: the right button (or <kbd>Shift</kbd> + middle button)
  in a 3D view.

## 3DFORBIT

Free orbit: drag to turn the view in any direction; the view can roll.

**Aliases** none · **Menu** View › Orbit

## 3DCORBIT

Continuous orbit: drag and release, and the view keeps spinning in that direction. A click stops it.

**Aliases** none · **Menu** View › Orbit

## 3DPAN

Real-time pan in a 3D view (drag with the left button).

**Aliases** none · **Menu** View › Orbit

## 3DZOOM

Real-time zoom in a 3D view (drag up and down).

**Aliases** none · **Menu** View › Orbit

## VPORTS

Splits the model area into several viewports, each with its own view, zoom and visual style: for example top,
front, right and isometric at the same time.

**Aliases** `VP` · **Menu** View › Viewports

**Steps**

1. `Number of viewports [1/2/3/4] <1>:`

**Notes**

- Click a viewport to make it active; commands work in the active viewport and you can start an operation in one
  viewport and finish it in another.

## VSCURRENT

Sets the visual style of the active viewport.

**Aliases** `VS` · **Menu** View › Visual styles

**Steps**

1. `Visual style [2Dwireframe/3Dwireframe/Shaded/shadedEdges/Hidden] <2Dwireframe>:`

**Styles**

| Style | Look |
| --- | --- |
| `2Dwireframe` | Edges only, for 2D drafting. |
| `3Dwireframe` | Edges only, as a 3D wireframe. |
| `Hidden` | Edges, with the hidden ones removed. |
| `Shaded` | Shaded faces, with the edges of solids drawn in a darker tone of their color. |
| `shadedEdges` | Shaded faces with all the edges drawn. |

## SHADEMODE

The same as VSCURRENT with the names of an older shading command.

**Aliases** `SHA`, `-SHADEMODE` · **Menu** View › Visual styles

**Steps**

1. `Enter option [2Dwireframe/3Dwireframe/Hidden/Flat/Gouraud/fLat+edges/gOuraud+edges] <2Dwireframe>:`
   `Flat` and `Gouraud` give Shaded; `fLat+edges` and `gOuraud+edges` give shadedEdges.

## REDRAW

Refreshes the display of all viewports.

**Aliases** `REGEN`, `RE`, `R` · **Menu** View

## FULLSCREEN

Toggles full screen: no browser bars or system bars. Cota remembers the choice for next time.

**Aliases** `FS` · **Menu** View › Display

## CLEANSCREENON

Hides the toolbars and palettes to leave the most room for the drawing. <kbd>Ctrl</kbd>+<kbd>0</kbd> toggles it.

**Aliases** none · **Menu** View › Display

## CLEANSCREENOFF

Shows the toolbars and palettes again (<kbd>Ctrl</kbd>+<kbd>0</kbd>).

**Aliases** none · **Menu** View › Display

## COMMANDLINE

Shows the full command line window with its history (<kbd>Ctrl</kbd>+<kbd>9</kbd> toggles).

**Aliases** none · **Menu** View › Display

## COMMANDLINEHIDE

Compacts the command line to its input row (<kbd>Ctrl</kbd>+<kbd>9</kbd> toggles).

**Aliases** none · **Menu** View › Display

## NAVVCUBE

Shows or hides the view cube.

**Aliases** none · **Menu** View › Display

**Steps**

1. `Enter an option [ON/OFF] <ON>:`

## MOBILEVIEW

Switches to the phone view for the job site: a simple screen to open drawings, orbit, measure with an offset
crosshair, change the visual style and pick views, layers and layouts with your fingers.

**Aliases** none · **Menu** View › Display

**Steps**

1. `Enter an option [ON/OFF] <ON>:` OFF returns to the full interface.

**Notes**

- On phones Cota opens in this view. See [mobile view](../guides/mobile.md).

## MVIEW

Creates viewports on a layout sheet: windows that show the model at a scale.

**Aliases** `MV` · **Menu** View › Viewports

**Steps**

1. Run it on a layout tab (on the Model tab Cota says `** Command not allowed in Model Tab **`).
2. `Specify corner of viewport or [ON/OFF/Fit/Shadeplot/Lock/Object/Polygonal/2/3/4]:` then
   `Specify opposite corner:` for a rectangular viewport.

**Options**

| Option | What it does |
| --- | --- |
| `Fit` | One viewport that fills the printable area of the sheet. |
| `2` / `3` / `4` | Several viewports in an area (`Enter viewport arrangement …` for 2 and 3). |
| `Object` | `Select object to clip viewport:` a closed polyline, circle or rectangle on the sheet becomes the viewport outline. |
| `Polygonal` | `Specify start point:` and the next points: a viewport with a polygonal outline. |
| `ON` / `OFF` | `Select objects:` turns the display of viewports on or off. |
| `Lock` | `Viewport View Locking [ON/OFF]:` locked viewports keep their view and scale when you zoom inside them. |
| `Shadeplot` | `Shade plot? […]`: how the viewport is plotted (as displayed, wireframe, hidden or shaded). |

**Notes**

- Set the scale of a viewport in **Properties** or with `ZOOM 1/50XP` from inside it.
- For views projected from a 3D model use `VIEWBASE`.

## MSPACE

Works on the model through a layout viewport: zoom, pan and edit the model inside it.

**Aliases** `MS` · **Menu** View › Viewports

**Notes**

- A double click inside a viewport does the same; a double click outside returns to paper space.

## PSPACE

Returns from a layout viewport to paper space, to work on the sheet.

**Aliases** `PS` · **Menu** View › Viewports

## VPMAX

Maximizes a layout viewport temporarily, to work on the model at full screen. `VPMIN` restores it.

**Aliases** none · **Menu** View › Viewports

## VPMIN

Restores the layout viewport maximized with VPMAX.

**Aliases** none · **Menu** View › Viewports

## VPCLIP

Clips a layout viewport with a closed object or a polygon, or removes the clipping.

**Aliases** none · **Menu** View › Viewports

**Steps**

1. Select the viewport.
2. `Select clipping object or [Polygonal/Delete]:` a closed polyline, circle or rectangle on the sheet; `Polygonal`
   to draw the outline; `Delete` to remove the clipping.

## VPLAYER

Controls the visibility of layers per layout viewport: a layer can be frozen in one viewport and visible in
another.

**Aliases** none · **Menu** View › Viewports

**Steps**

1. `Enter an option [?/Freeze/Thaw/Reset/Newfrz/Vpvisdflt]:`
2. For Freeze, Thaw and Reset: the layer names, then `Enter an option [All/Select/Current] <Current>:` which
   viewports.

**Options**

| Option | What it does |
| --- | --- |
| `?` | Lists the layers frozen in a viewport. |
| `Freeze` / `Thaw` | Freezes or thaws layers in the chosen viewports only. |
| `Reset` | Back to the default visibility of the layers. |
| `Newfrz` | `Enter name(s) of new layers frozen in all viewports:` creates layers that are frozen everywhere, to thaw where needed. |
| `Vpvisdflt` | `Enter a viewport visibility option [Frozen/Thawed] <Thawed>:` the visibility of layers in new viewports. |

## ATTDISP

Controls the display of block attributes.

**Aliases** none · **Menu** View › Display

**Steps**

1. `Enter attribute visibility setting [Normal/ON/OFF] <Normal>:` Normal shows each attribute as defined, ON shows
   them all (also invisible ones), OFF hides them all.

## PLAN

Shows the plan view (looking down the Z axis) of a UCS.

**Aliases** none · **Menu** View › Views

**Steps**

1. `Enter an option [Current ucs/Ucs/World] <Current>:` the current UCS, a named one (`Enter name of UCS or [?]:`)
   or the world coordinate system.

## UCSICON

Controls the UCS icon in the viewports.

**Aliases** none · **Menu** View › Display

**Steps**

1. `Enter an option [ON/OFF/All/Noorigin/ORigin] <ON>:`

**Options**

| Option | What it does |
| --- | --- |
| `ON` / `OFF` | Shows or hides the icon. |
| `All` | Applies the change to every viewport. |
| `Noorigin` | Shows the icon in the corner of the viewport. |
| `ORigin` | Shows the icon at the origin of the UCS when it is in view. |
