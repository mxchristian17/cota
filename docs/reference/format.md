# Format commands

Commands of the **Format** menu: layers, the color, linetype and lineweight of new objects, styles and the drawing
limits.

Every object has a layer, a color, a linetype and a lineweight. By default the last three are **ByLayer**: the
object takes them from its layer, so changing the layer changes all its objects at once. Change the properties of
existing objects in **Properties** or in the Properties toolbar.

## LAYER

Opens the **Layer Properties** manager: create, rename and delete layers, and set for each one its color,
linetype, lineweight, whether it is on, frozen, locked and plotted, and which layer is current.

**Aliases** `LA`, `DDLMODES` · **Menu** Format

**Notes**

- Off layers are hidden; frozen layers are hidden and not plotted (like the classic CAD); locked layers are visible
  but cannot be edited.
- `-LAYER` does the same from the command line:
  `Enter an option [?/Make/Set/New/Rename/ON/OFF/Color/Ltype/LWeight/Plot/Freeze/Thaw/LOck/Unlock]:`.
- The layer tools below change layers by picking objects.

## LAYMCUR

Makes the layer of a selected object the current layer.

**Aliases** none · **Menu** Format › Layer tools

**Steps**

1. `Select object whose layer will become current:`

## LAYISO

Isolates the layers of the selected objects: every other layer is turned off. `LAYUNISO` restores them.

**Aliases** none · **Menu** Format › Layer tools

**Steps**

1. `Select objects on the layer(s) to be isolated:`

## LAYUNISO

Turns back on the layers turned off by the last LAYISO.

**Aliases** none · **Menu** Format › Layer tools

## LAYOFF

Turns off the layer of each object you pick.

**Aliases** none · **Menu** Format › Layer tools

**Steps**

1. `Select an object on the layer to be turned off or [Undo]:` the prompt repeats; `Undo` turns the last one back on.

## LAYON

Turns on all layers.

**Aliases** none · **Menu** Format › Layer tools

## LAYFRZ

Freezes the layer of each object you pick.

**Aliases** none · **Menu** Format › Layer tools

**Steps**

1. `Select an object on the layer to be frozen or [Undo]:`

## LAYTHW

Thaws all layers.

**Aliases** none · **Menu** Format › Layer tools

## LAYLCK

Locks the layer of the object you pick: its objects stay visible but cannot be selected for editing.

**Aliases** none · **Menu** Format › Layer tools

**Steps**

1. `Select an object on the layer to be locked or [Undo]:`

## LAYULK

Unlocks the layer of the object you pick.

**Aliases** none · **Menu** Format › Layer tools

**Steps**

1. `Select an object on the layer to be unlocked or [Undo]:`

## COLOR

Sets the color of new objects (`CECOLOR`).

**Aliases** `COL`, `COLOUR`, `-COLOR`, `CECOLOR` · **Menu** Format › Styles

**Steps**

1. `Enter default object color [ByLayer] <ByLayer>:` `ByLayer`, a color index from 1 to 255, a name (`red`,
   `yellow`…), `#rrggbb` or `r,g,b`.

**Example**

```text
COLOR red
COLOR #2f5bff
COLOR ByLayer
```

## LINETYPE

Opens the **Linetype Manager**: load linetypes (dashed, hidden, center, phantom…), set the linetype of new
objects and the global and current scale factors (`LTSCALE`, `CELTSCALE`).

**Aliases** `LT`, `LTYPE`, `DDLTYPE` · **Menu** Format › Styles

## LWEIGHT

Sets the lineweight of new objects (`CELWEIGHT`).

**Aliases** `LW`, `LINEWEIGHT`, `-LWEIGHT`, `CELWEIGHT` · **Menu** Format › Styles

**Steps**

1. Cota prints the current value (`Current lineweight: ByLayer`).
2. `Enter default lineweight for new objects or [?] <ByLayer>:` `ByLayer`, `Default`, or a width in millimeters
   (0.05 to 2.11). Other values are set to the nearest standard width. `?` lists the standard widths.

**Example**

```text
LWEIGHT 0.5
```

**Notes**

- Lineweights are always plotted. `LWDISPLAY` controls whether they are shown on screen.

## DIMSTYLE

Opens the **Dimension Style Manager**: create and modify dimension styles (lines, arrows, text, fit, units,
tolerances), override the current one and set which style is current.

**Aliases** `D`, `DST`, `DDIM`, `DIMSTY` · **Menu** Format › Styles

**Notes**

- `-DIMSTYLE` works from the command line. Each dimension variable (`DIMTXT`, `DIMASZ`, `DIMDEC`…) can also be typed
  as a command to change it in the current style.
- See also [DIMOVERRIDE](dimension.md#dimoverride).

## MLEADERSTYLE

Multileaders use the leader arrowhead (`DIMLDRBLK`), arrow size and text settings of the current dimension style;
this command says so and opens nothing else. Change those settings in `DIMSTYLE`.

**Aliases** `MLS` · **Menu** Format › Styles

## LIMITS

Sets the drawing limits: the area that `ZOOM All` shows and, with the limits check on, the area where points can
be given.

**Aliases** none · **Menu** Format › Drawing

**Steps**

1. Cota prints `Reset Model space limits:`.
2. `Specify lower left corner or [ON/OFF] <0.0000,0.0000>:`
3. `Specify upper right corner <420.0000,297.0000>:` (an A3 sheet by default in millimeters; 12 × 9 in inches).

**Options**

| Option | What it does |
| --- | --- |
| `ON` / `OFF` | Turns the limits check (`LIMCHECK`) on or off: with ON, points outside the limits are rejected. |

**Example**: limits of an A3 sheet at 1:1.

```text
LIMITS 0,0 420,297
```
