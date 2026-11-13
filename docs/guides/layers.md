# Layers and properties

Layers, colors, linetypes, lineweights, draw order and the Properties palette.

`LAYER` opens the **Layer Properties** dialog: create, rename and delete layers and set their color, linetype,
lineweight and plot style; turn them on or off, freeze, lock and set whether they plot. The current layer is
shown in the status bar (and remembered in the saved file). New objects go to the current layer.

The **layer control** of the status bar (and of the Layers toolbar) shows the layer of the selected objects, or the
current one. Open it to choose a layer (with objects selected they move to it; without, it becomes current) or to
switch each layer right there without closing the list: 👁 on/off, ☀/❄ thaw/freeze (the current layer cannot be
frozen) and 🔓/🔒 unlock/lock. With many layers, type in its box to filter them by name.

Layer tools: `LAYMCUR` (make the layer of an object current), `LAYISO` / `LAYUNISO`, `LAYOFF` / `LAYON`,
`LAYFRZ` / `LAYTHW`, `LAYLCK` / `LAYULK`. `-LAYER` does the same from the command line, for scripts.

`LINETYPE` loads linetypes (CENTER, HIDDEN, PHANTOM, DASHED, ISO patterns…) and sets the global scale.

**Color and lineweight per object:** objects take the color and lineweight of their layer (**ByLayer**) unless
they have their own. `COLOR` (index 1–255, a name, `#rrggbb` or `r,g,b`) and `LWEIGHT` (ByLayer, Default or mm) set
them for new objects; change them for the selection in Properties or in the lists of the Properties toolbar.
They are saved in DXF/DWG and plotted.

**Draw order:** what covers what follows the order of the objects, as in classic CAD: the last one drawn is on top
(the layers do not decide it). `DRAWORDER` (`DR`) sends the selection to the front or back, or above or under other
objects; `TEXTTOFRONT` brings texts and dimensions to the front. A new hatch goes behind its boundary. DWG and DXF
files open in their own draw order, and plots follow it; texts are always shown on top.

**Properties** (`PROPERTIES`, or the ▣ strip on the left) shows the properties of the selection: layer,
color, linetype, lineweight and the geometry of the object (coordinates, radius, height…). Edit any value
there. `MATCHPROP` copies properties from one object to others.

**See also:** [Format commands](../reference/format.md)
