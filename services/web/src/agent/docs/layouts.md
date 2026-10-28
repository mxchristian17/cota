# Layouts, drawing views and plotting
The model is where you draw at real size. Layouts are paper sheets (with a title block) to plot; each layout has
viewports that show the model at a scale. Points typed in a layout are paper millimetres.

LAYOUT ? lists layouts; LAYOUT S name makes one current; LAYOUT N name creates one. Return to the model with
LAYOUT S Model.
  LAYOUT N Sheet2
  LAYOUT S Model
VIEWBASE: drawing views of the 3D solids. From the model it first asks the objects ("" = all solids) and the
layout ("" = the first one) and switches to it; from a layout it starts directly with the views. Then S and a scale
(1 = 1:1, 0.5 = 1:2, 2 = 2:1) if you want one (otherwise it picks one), the location of the base (front) view, then
the locations of the projected views: below it = top view and to its right = left view
(first-angle projection), a point diagonal from it = an isometric view; "" ends. Leave room between views for the
dimensions. VIEWUPDATE refreshes the views after the model changes.
  BOX 0,0,0 40,20,0 10
    VIEWBASE "" "" S 1 100,150 100,60 200,150 ""
Layout1 comes with a VIEWPORT showing the model: before placing drawing views, find it with query_objects
(types ["VIEWPORT"]) and erase it (select it by id, then ERASE).

Dimensioning a drawing view: query_objects in the layout lists the views (INSERT … drawing view); describe_object
on a view gives its lines, circles and arcs in sheet coordinates. Dimension with points typed in sheet coordinates
(the value shown is the model size, because the view scale is taken into account):
- lengths: DIMLINEAR point1 point2 location (horizontal or vertical by where the location is).
- diameters: the circles of a view cannot be picked, so use DIMLINEAR across the circle (two ends of a diameter)
  with T and %%c<> as text (%%c is Ø, <> the measured value), e.g. DIMLINEAR 70,100 170,100 T %%c<> 120,85
- notes such as hole patterns: MLEADER arrowhead landing "6x %%c9 on %%c76" "".
- threads: THREAD with a point on the thin thread arc of a view adds the leader with its designation.
Keep dimensions outside the outline of the views, a few millimetres apart from each other.
PLOT opens the plot dialog (the user confirms); -PLOT plots from the command line.
