# Insert commands

Commands of the **Insert** menu: blocks, drawing views of the 3D model, layouts, fields and images.

## INSERT

Places a reference to a block defined in the drawing.

**Aliases** `I`, `DDINSERT` · **Menu** Insert

**Steps**

1. `Block name [BOLT, NUT…] <BOLT>:` the blocks of the drawing are listed.
2. `Specify insertion point:`
3. `X scale factor <1>:` the same factor applies to X, Y and Z.
4. `Rotation angle <0>:`
5. If the block has attributes, `Enter attribute values` and one prompt per attribute.

Cota prints `Inserted "NAME".`

**Example**

```text
RECTANGLE 0,0 @10,10
BLOCK L "" SQUARE 0,0
INSERT SQUARE 50,50 2 45
```

**Notes**

- Define blocks with [BLOCK](draw.md#block). Blocks from DWG and DXF files come with them.

## BEDIT

Opens a block definition in the **Block Editor**: the drawing shows only the block, in its own coordinates, with
its base point at 0,0,0. Every command works there as usual (draw, edit, object snaps, 3D, dimensions). A bar at the
top of the view shows the block name with **Save** and **Close**.

**Aliases** `BE` · **Menu** Insert

Double-clicking a block without attributes opens it here.

**Steps**

1. With a block selected (or after a double click) it opens that block. Otherwise:
   `Block to edit [BOLT, NUT…] <BOLT>:`

Cota prints `Block Editor: "NAME" (base point at 0,0,0). BSAVE saves it, BCLOSE closes the editor.`

**Example**

```text
BEDIT SQUARE
CIRCLE 5,5 2
BCLOSE Save
```

**Notes**

- While the editor is open the layout tabs stay on Model, and a block cannot be inserted into itself (directly or
  through another block).
- Undo works inside the editor. A block with attributes opens its attribute editor on double click; use `BEDIT` to
  change its geometry.

## BSAVE

Saves the block open in the Block Editor without closing it: every reference to it shows the change, and it becomes
the state that `BCLOSE` › `Discard` returns to.

**Aliases** none · **Menu** Insert

Cota prints `Block "NAME" saved; all its references are updated.`

## BCLOSE

Closes the Block Editor and returns to the model with the view it had before.

**Aliases** none · **Menu** Insert

**Steps**

1. If there are unsaved changes: `Save changes to block "NAME"? [Save/Discard] <Save>:`. **Discard** puts the block
   back as it was when it was opened or last saved.

## NOTE

Pastes a sticky note on the drawing: a paper note (yellow, violet, pink, green, blue or orange) with a folded corner,
a close cross and text that resizes itself to fill the note. It lies on the working UCS like a rectangle, or on the
face of a solid when the dynamic UCS is on.

**Aliases** `STICKY` · **Menu** Insert

**Steps**

1. `Specify first corner or [Color] <yellow>:` (`Color` picks the paper color for this and the next notes).
2. `Specify opposite corner:`
3. `Note text (double-click the note later to edit it):`

**Example**

```text
NOTE 0,0 40,25 Check the chamfer before machining
```

**Notes**

- Double-click a note to edit its text on the note itself (<kbd>Ctrl</kbd>+<kbd>Enter</kbd> or clicking away accepts,
  <kbd>Esc</kbd> cancels). The cross closes it (undo brings it back).
- Select it to see its grips: the bottom-right corner resizes it and the text adjusts; dragging any other corner or
  midpoint draws a leader from there to the point you pick, with object snaps.
- Notes are kept in `.cota` files only: DWG, DXF and PDF leave them out.

## VIEWBASE

Creates a base view of the 3D model on a layout, and then the views projected from it (front, top, side,
isometric). The views stay linked to the model: when the model changes, `VIEWUPDATE` brings them up to date.

**Aliases** none · **Menu** Insert › Drawing views

**Steps**

1. `Select objects or [Entire model] <Entire model>:` the solids to document.
2. From the model tab: `Enter new or existing layout name to make current` (where the views go).
3. `Specify location of base view or [Type/Orientation/Hidden lines/Scale] <Type>:` click on the sheet.
4. With `Type` = Base and Projected, move the cursor around the base view and click to place each projected view;
   <kbd>Enter</kbd> ends.

**Options**

| Option | What it does |
| --- | --- |
| `Type` | `Select type [Base only/Base and Projected] <Base and Projected>:` |
| `Orientation` | `Select orientation [...]`: which side of the model the base view shows (front, top, left…). |
| `Hidden lines` | `Select style [Visible lines/visible and Hidden lines/Shaded with visible lines/Shaded with visible and hidden lines (SHidden)]`. |
| `Scale` | `Enter scale <1:1>:` for example `1:2`, `2:1` or `0.5`. |

**Notes**

- Projection is first-angle (ISO-E) or third-angle (ISO-A), as set with [VIEWSTD](#viewstd).
- Dimension the views with [AUTODIM](dimension.md#autodim) or by hand; dimensions attach to the view geometry.

## VIEWPROJ

Creates more projected views from an existing drawing view.

**Aliases** none · **Menu** Insert › Drawing views

**Steps**

1. Select the parent view, then click where each projected view goes; <kbd>Enter</kbd> ends.

## VIEWEDIT

Changes a drawing view: its hidden lines and its scale.

**Aliases** none · **Menu** Insert › Drawing views

**Steps**

1. `Select view:`
2. `Select option [Hidden lines/Scale/eXit] <eXit>:`

## VIEWUPDATE

Updates the drawing views that are out of date with the model.

**Aliases** none · **Menu** Insert › Drawing views

**Steps**

1. `Select views to update or [All] <All>:`

## VIEWSTD

Sets the projection standard of drawing views.

**Aliases** `-VIEWSTD` · **Menu** Insert › Drawing views

**Steps**

1. `Projection type [First angle/Third angle] <First>:` first angle (ISO-E, used in Europe and South America) or
   third angle (ISO-A, used in North America).

## VIEWGEN

Generates all the standard views of a part at once: choose them on a diagram of the unfolded box (front, top,
bottom, left, right, back and isometric), in ISO-E or ISO-A.

**Aliases** none · **Menu** Insert › Drawing views

**Steps**

1. `Select objects or [Entire model] <Entire model>:`
2. A dialog shows the diagram: tick the views you want and the standard.
3. On a layout, `Specify center of the views:` places the set. From the model, the views go to a layout (as with
   VIEWBASE), or stay in the model as 2D blocks.

## LAYOUT

Creates, copies, deletes, renames, lists and activates layouts (the sheets you plot).

**Aliases** `LO` · **Menu** Insert › Layout

**Steps**

1. `Enter layout option [Copy/Delete/New/Template/Rename/SAveas/Set/?] <set>:`

**Options**

| Option | What it does |
| --- | --- |
| `New` | `Enter name of new layout <Layout2>:` |
| `Copy` | Copies a layout with its viewports and page setup (`Enter layout name for copy`). |
| `Delete` | Deletes a layout. |
| `Rename` | `Enter name of layout to rename`, then `Enter new layout name:`. |
| `Template` | Creates a layout from a template file (`Enter template file name`). |
| `SAveas` | Saves a layout as a template. |
| `Set` | `Enter layout to make current:` |
| `?` | Lists the layouts. |

**Notes**

- A double click on a layout tab renames it.

## FIELD

Inserts a field into a text: a value that updates on its own, such as the file name, the date, a drawing property,
the layout name, the sheet number or the scale of a viewport. Title blocks use them.

**Aliases** none · **Menu** Insert › Fields

**Steps**

1. `Field name [Filename/SaveDate/CreateDate/PlotDate/Author/Title/Subject/Keywords/LayoutName/SheetNumber/SheetCount/ViewportScale/CustomDP] <Filename>:`
2. Options of the field: `Show extension? [Yes/No] <Yes>:` for the file name, `Date format <dd/MM/yyyy>:` for
   dates, `Custom property name:` for custom drawing properties.
3. `Specify start point of text or [Object]:` a new text with the field, or `Object` and
   `Select text to add the field to:`.

**Notes**

- Drawing properties (title, author…) are set in [DWGPROPS](file.md#dwgprops).
- Fields show `----` when they have no value yet and `####` when they cannot be evaluated.

## UPDATEFIELD

Updates the fields of the selected objects now.

**Aliases** none · **Menu** Insert › Fields

**Steps**

1. `Select objects:` Cota prints how many fields it found and updated.

## IMAGE

Loads the picture files a drawing uses. A DXF or DWG stores only the path of its images; this command asks for the
files so they show in the drawing.

**Aliases** `IM` · **Menu** Insert

**Notes**

- If the drawing has no images, Cota says so. You can also choose the pictures together with the drawing when you
  open it.
