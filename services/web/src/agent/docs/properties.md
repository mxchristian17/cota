# Layers and object properties
Every object has a layer, and color, linetype and lineweight that are "ByLayer" (taken from the layer) unless set
on the object. New objects take the current layer and the current color and lineweight.

-LAYER (command line version of LAYER; "" leaves it):
- M name — make a layer (created if needed) and set it current.
- S name — set an existing layer current.
- C color names — color of layers (color: index 1–255, name such as red, #rrggbb or r,g,b).
- L linetype names — linetype of layers (the linetype must be loaded: -LINETYPE L name).
- LW mm names — lineweight. OFF / ON / F (freeze) / T (thaw) / LO (lock) / U (unlock) + names.
  -LAYER M Holes C red Holes ""
  -LINETYPE L CENTER ""
  -LAYER M Axes L CENTER Axes ""
COLOR value and LWEIGHT value set the color and lineweight of NEW objects (ByLayer goes back to the layer's).
  COLOR blue
  LWEIGHT 0.5
  COLOR ByLayer
  LWEIGHT ByLayer
To change existing objects (layer, color, linetype, lineweight), use the set_properties tool with their ids.
