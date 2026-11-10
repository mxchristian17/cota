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

Copies the selected objects to the clipboard (<kbd>Ctrl</kbd>+<kbd>C</kbd>), to paste them in this drawing or in
another tab.

**Aliases** none · **Menu** Edit › Clipboard

**Steps**

1. `Select objects:` Cota prints how many objects were copied.

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

**Notes**

- If the clipboard holds text instead of objects (for example a script copied from these pages),
  <kbd>Ctrl</kbd>+<kbd>V</kbd> in the command line runs it as a script.

## PASTEORIG

Pastes the clipboard at the same coordinates the objects had: useful to move objects between drawings without
moving them.

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
