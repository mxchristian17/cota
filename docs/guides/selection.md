# Selecting objects

Windows, crossing, keywords, Quick Select, groups and grips.

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

**See also:** [Edit commands](../reference/edit.md) · [Tools › groups](../reference/tools.md#group)
