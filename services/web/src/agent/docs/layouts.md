# Layouts, drawing views and plotting
The model is where you draw at real size. Layouts are paper sheets (with a title block) to plot; each layout has
viewports that show the model at a scale. Points typed in a layout are paper millimetres.

LAYOUT ? lists layouts; LAYOUT S name makes one current; LAYOUT N name creates one. Return to the model with
LAYOUT S Model.
  LAYOUT N Sheet2
  LAYOUT S Model
VIEWBASE: drawing views of the 3D solids on the current layout (it switches to one if you are in the model):
"" (all solids), "" (front view, default settings), the location of the base view, then the locations of the
projected views (above/below/left/right of the base), "" ends. VIEWUPDATE refreshes them after the model changes.
  BOX 0,0,0 40,20,0 10
    VIEWBASE "" "" 100,150 100,60 ""
PLOT opens the plot dialog (the user confirms); -PLOT plots from the command line.
