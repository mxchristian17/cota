# Interface, settings and shortcuts

Toolbars, settings, installing the app, and the keyboard and mouse.

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
[command reference](../commands.md#system-variables).

Screen: <kbd>Ctrl</kbd>+<kbd>0</kbd> toggles a clean screen (only the drawing), <kbd>Ctrl</kbd>+<kbd>9</kbd>
a compact command line; `NAVVCUBE` and `UCSICON` show or hide the view cube and the UCS icon. `GRID` (or
<kbd>F7</kbd>, or the GRID button of the status bar) shows or hides the grid. `FULLSCREEN` (or the ⤢ button)
hides every browser and system bar; press and hold <kbd>Esc</kbd> to leave it (a short <kbd>Esc</kbd> still
cancels commands).

## Install as an app

In Chrome, Edge and other Chromium browsers, click **Install app** in the top bar (or the install icon in the
address bar). Cota then opens in its own window, without the address bar or tabs, with a shortcut on your desktop
and in your applications menu, and it **works offline**: drawing, files on your disk, DXF and PDF need no
connection (an account and cloud storage need the server). It updates itself when a new version is
published. If you turned full screen on, it comes back with your first click after opening the app.

## Keyboard and mouse

| Input | Action |
| --- | --- |
| <kbd>Enter</kbd> / <kbd>Space</kbd> | Run the command, finish a step, or repeat the last command |
| <kbd>Esc</kbd> | Close the open dialog; otherwise cancel the command and clear the selection |
| <kbd>Tab</kbd> | Complete the suggested command |
| <kbd>↑</kbd> / <kbd>↓</kbd> | Command history |
| <kbd>F1</kbd> | Documentation; during a command, the reference of that command |
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
| Ctrl+S / Ctrl+Shift+S | Save / save with another name |
| Right drag / <kbd>Shift</kbd> + middle drag | Orbit (in the model) |
| Wheel | Zoom at the cursor |

**See also:** [View commands](../reference/view.md) · [Tools commands](../reference/tools.md) · [System variables](../reference/variables.md)
