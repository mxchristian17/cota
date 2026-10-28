# Getting started

## 1. Open Cota

**Online:** open <https://mxchristian17.github.io/cota/>. It runs entirely in your browser.

**On your computer:** install [Node.js](https://nodejs.org/) 20 or newer, then:

```bash
git clone https://github.com/mxchristian17/cota.git
cd cota/services/web
npm install
npm run dev
```

and open <http://localhost:5173>. A Chromium-based browser (Chrome, Edge, Brave, Opera) is recommended: it is
the only one that lets Cota open and save files directly in a folder of your disk. Firefox and Safari work too,
saving by download.

## 2. The screen

```text
┌──────────────────────────────────────────────────────────────────────┐
│ ☰ Cota  drawing1   File Edit View Insert Format Tools Draw …   Help  │  menus
├──┬───────────────────────────────────────────────────────────────────┤
│  │                                                        view cube  │
│▣ │                                                                   │
│  │                       drawing area                                │
│  │                                                                   │
├──┴───────────────────────────────────────────────────────────────────┤
│ Model  Layout1  +   X  Y  Z   layer   GRID SNAP ORTHO OSNAP OTRACK UCS│  status bar
├──────────────────────────────────────────────────────────────────────┤
│ Command:                                                             │  command line
└──────────────────────────────────────────────────────────────────────┘
```

- **Menus** list every command by topic. Picking a menu item is the same as typing its command.
- **Properties** (left strip, ▣) shows and edits the properties of the selected objects. Type `PROPERTIES`
  or click ▣ to expand it.
- **Toolbars:** the Dimension toolbar (left) gives one-click access to the dimension commands. 22 more
  toolbars (Draw, Modify, Object Snap, View, Zoom…) are in **Tools ▸ Toolbars**.
- **Status bar:** Model and layout tabs, cursor coordinates, the current layer and the drawing aids
  (GRID, SNAP, ORTHO, OSNAP, OTRACK, DYN, UCS). Click a button or use its function key to toggle it.
- **Command line:** where you type commands and answer their prompts. You do not need to click it:
  start typing anywhere and the text goes there.

## 3. Draw something

Type each line and press <kbd>Enter</kbd>. `@` means "relative to the last point".

```text
LINE 0,0 @80,0 @0,40 @-80,0 C
```

`C` closes the shape. Now a circle with center 40,20 and radius 10:

```text
CIRCLE 40,20 10
```

Press <kbd>Enter</kbd> on an empty command line to repeat the last command. Press <kbd>Esc</kbd> to cancel.

## 4. Edit it

```text
MOVE
```

Click the circle, press <kbd>Enter</kbd>, click a base point, then a second point (or type `0,0` and `5,0` to move it
5 units to the right). Every editing command works
the same way: **select, Enter, follow the prompts**. You can also select first (click or drag a window) and then
type the command.

Click an object without a command running to show its **grips** (small squares). Click a grip, then click its
new position to stretch, move or resize the object.

## 5. Go 3D

```text
EXTRUDE
```

Click the circle, press <kbd>Enter</kbd> and type `30`: the circle becomes a cylinder. Press <kbd>Enter</kbd> to repeat
`EXTRUDE`, click the outline, <kbd>Enter</kbd> and type `10`. Look at it from an angle:

```text
VIEW SWISO
```

Now drill the hole: type `SUBTRACT`, click the block, <kbd>Enter</kbd>, click the cylinder where it sticks out of the
block, <kbd>Enter</kbd>. Shade it:

```text
VSCURRENT SHADEDEDGES
```

Orbit with the right mouse button (or <kbd>Shift</kbd> + middle button), pan with the middle button, zoom with
the wheel. Double-click the middle button to fit everything on screen. Click a face, an edge or a corner of the
**unfolded view cube** to jump to that view; the yellow dot shows where the camera is.

## 6. Make a drawing sheet

From the **Model** tab:

```text
VIEWBASE
```

Press <kbd>Enter</kbd> to take the entire model and <kbd>Enter</kbd> again to use `Layout1`. Cota switches to the sheet:
click where the base (front) view goes, then where the projected views should go (to the side, above or below,
diagonally for an isometric) and press <kbd>Enter</kbd>. The default is first-angle projection: the top view goes
below the front view and an isometric seen from above goes diagonally below; `VIEWSTD` switches to third-angle.
Dimension them all at once:

```text
AUTODIM
```

Accept the defaults with <kbd>Enter</kbd>. Export the sheet to PDF with `PLOT`.

## 7. Save and open

| Where | How |
| --- | --- |
| **A file you download** | `SAVE`, then <kbd>Enter</kbd> to keep the name: with no folder chosen it downloads `name.cota`. `OPEN` opens the file picker to bring it back. |
| **A folder on your disk** | `OPENFOLDER` (Chromium browsers) and pick a folder. `SAVE` writes there, `OPEN` lists its drawings and **Autosave** keeps them up to date. |
| **Your account** | Only when the optional server is running: `LOGIN`, then `SAVE` and `OPEN` use the server. See [self-hosting](self-hosting.md). |

`OPEN` also reads `.dxf` files (and `.dwg` with the server). `IMPORT` adds OBJ or DXF geometry to the current
drawing; `EXPORT` writes OBJ, DXF or DWG.

## Next steps

- [User guide](user-guide.md): every concept in depth.
- [Command reference](commands.md): all commands and aliases. Type `HELP` inside Cota for the same list.
- [Examples](../examples/): sample drawings to open and explore.
