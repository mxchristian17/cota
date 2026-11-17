# Edit commands

Commands of the **Edit** menu: undo and redo, the clipboard and selection. `ERASE` is described with the
[Modify commands](modify.md#erase).

## UNDO

Undoes the last command. Inside a command, it goes back one step instead: the last point of a polyline, the
opposite corner of a box.

**Aliases** `U` · **Menu** Edit

**Notes**

- <kbd>Ctrl</kbd>+<kbd>Z</kbd> does the same. Changes of selection are steps too: after selecting or clearing a
  selection, <kbd>Ctrl</kbd>+<kbd>Z</kbd> first restores the previous selection.
- View changes (zoom, pan, orbit) can be undone as well.
- Commands with their own `Undo` option (LINE, PLINE, TRIM…) use it when you type `U` inside them.

## REDO

Redoes what the last UNDO undid (<kbd>Ctrl</kbd>+<kbd>Y</kbd>).

**Aliases** none · **Menu** Edit

## CUTCLIP

Copies the selected objects to the clipboard and erases them (<kbd>Ctrl</kbd>+<kbd>X</kbd>).

**Aliases** none · **Menu** Edit › Clipboard

**Steps**

1. `Select objects:`

## COPYCLIP

Copies the selected objects to the clipboard (<kbd>Ctrl</kbd>+<kbd>C</kbd>), to paste them in this drawing, in another
drawing (the clipboard stays after `OPEN` or `NEW`) or in another Cota tab or window of the same browser.

**Aliases** none · **Menu** Edit › Clipboard

**Steps**

1. `Select objects:` Cota prints how many objects were copied.

**Notes**

- The copy takes along what the objects need in another drawing: the definitions of the blocks they insert (with the
  blocks nested in them) and their layers. See [PASTECLIP](#pasteclip).
- Every Cota tab of the browser shares the clipboard: the newest copy, made in any of them, is the one pasted. It is
  kept in the browser (not uploaded), so it also reaches tabs opened later, but not another browser or device.

## COPYBASE

Copies objects to the clipboard with a base point of your choice, so they paste exactly where you want
(<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>C</kbd>).

**Aliases** none · **Menu** Edit › Clipboard

**Steps**

1. `Select objects:`
2. `Specify base point:`

## PASTECLIP

Pastes the clipboard at an insertion point (<kbd>Ctrl</kbd>+<kbd>V</kbd>).

**Aliases** none · **Menu** Edit › Clipboard

**Steps**

1. `Specify insertion point:` the base point of the copy lands there (with COPYCLIP and CUTCLIP, the lower left
   corner of the objects copied).

Cota prints how many objects were pasted, and the block definitions and layers it added.

**Notes**

- It pastes the newest copy made in any Cota tab of the browser (see [COPYCLIP](#copyclip)).
- **Blocks** travel with their references, as in a classic CAD: a block the drawing does not have is added with its
  nested blocks, so `INSERT` can place it again and `SAVE` keeps it. If the drawing already has a block with that
  name, its own definition is kept and the pasted references use it; when the two differ, Cota says so (rename the
  block in one of the drawings to have both). Anonymous blocks (names starting with `*`, such as drawing views) are
  added under the next free name instead. A reference whose block is in neither drawing is not pasted, with a message.
- **Layers** are matched by name: the drawing's layer is used when it has one with that name (with its own color and
  linetype); otherwise the layer is created as it was in the copy.
- <kbd>Ctrl</kbd>+<kbd>V</kbd> pastes objects when there are objects copied in this tab, or in another tab while this
  one was open or in the hour before it opened. Otherwise, if the clipboard holds text (for example a script copied from
  these pages), <kbd>Ctrl</kbd>+<kbd>V</kbd> in the command line runs it as a script; `PASTECLIP` still pastes the
  last objects copied.

## PASTEORIG

Pastes the clipboard at the same coordinates the objects had: useful to move objects between drawings (or tabs)
without moving them. Blocks and layers come along as with [PASTECLIP](#pasteclip).

**Aliases** none · **Menu** Edit › Clipboard

## SELECTALL

Selects every object (<kbd>Ctrl</kbd>+<kbd>A</kbd>).

**Aliases** none · **Menu** Edit › Selection

## SELECT

Selects objects to use as the selection of the next command.

**Aliases** `SE` · **Menu** Edit › Selection

**Steps**

1. `Select objects:` click objects or drag windows; <kbd>Enter</kbd> ends.

**Selection keywords** (at any `Select objects:` prompt)

| Keyword | Selects |
| --- | --- |
| `ALL` | Every selectable object. |
| `L` / `Last` | The last object created. |
| `P` / `Previous` | The previous selection. |
| `W` / `Window` | Objects fully inside a window. |
| `C` / `Crossing` | Objects inside or crossing a window. |
| `F` / `Fence` | Objects crossed by a line of several points. |
| `WP` / `CP` | Window and crossing with a polygon. |
| `R` / `Remove`, `A` / `Add` | Switch between removing objects from the selection and adding them. <kbd>Shift</kbd>+click also removes. |
| `U` / `Undo` | Undoes the last selection step. |

## SELECTSIMILAR

Selects every object of the same type and layer as the selected ones: all the circles of a layer, all the
dimensions…

**Aliases** none · **Menu** Edit › Selection

**Steps**

1. `Select objects:` one or more examples. Cota prints how many objects it selected.

## QSELECT

Quick Select: selects objects by type and property (layer, color, linetype, length, radius, area, text…) with a
condition (`=`, `<>`, `>`, `<`, `*` wildcard), from a dialog. The result can be included in or excluded from the
new selection, or appended to the current one.

**Aliases** none · **Menu** Edit › Selection
