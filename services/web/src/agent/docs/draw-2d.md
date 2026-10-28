# Drawing in 2D
New objects go to the current layer, in the XY plane of the current UCS. Defaults in <…> are accepted with "".

LINE: first point, then each next point; "" ends. Close joins back to the first point and turns the segments into
one closed polyline.
  LINE 0,0 @80,0 @0,40 ""
PLINE (polyline: one object with straight and arc segments): start point, next points; A switches to arc
segments, L back to straight; C ends closed; "" ends open.
  PLINE 0,0 @60,0 A @0,30 L @-60,0 C
CIRCLE: center, then radius (or D and the diameter). 2P = two diameter ends; 3P = three points.
  CIRCLE 50,50 20
  CIRCLE 50,50 D 40
ARC: start, second point, end (three points). C first = center, start, end (counterclockwise).
  ARC 0,0 20,10 40,0
  ARC C 0,0 10,0 0,10
RECTANGLE: two opposite corners.
  RECTANGLE 0,0 @100,50
POLYGON: number of sides, center, I (inscribed) or C (circumscribed), radius. E = by one edge.
  POLYGON 6 0,0 I 25
ELLIPSE: C, center, axis endpoint, distance to the other axis.
  ELLIPSE C 0,0 @40,0 15
SPLINE: fit points, "" ends.
  SPLINE 0,0 20,15 40,0 60,15 ""
POINT: one point per call. PDMODE sets the marker (3 = X).
  POINT 10,10
