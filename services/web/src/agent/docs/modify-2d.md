# Modifying objects
Commands that ask "Select objects:" accept a selection (see the selection guide) ended with "". Below, L picks
the last object created.

  RECTANGLE 0,0 @40,20
MOVE: objects, base point, second point.
  MOVE L "" 0,0 @10,5
COPY: objects, base point, one or more second points, "" ends.
  COPY L "" 0,0 @0,40 @0,80 ""
ROTATE: objects, base point, angle (degrees, counterclockwise).
  ROTATE L "" 10,85 90
SCALE: objects, base point, factor.
  SCALE L "" 10,85 0.5
MIRROR: objects, two points of the mirror line, then Y to erase the originals or N to keep them.
  MIRROR L "" 0,0 0,10 N
ERASE: objects.
  ERASE L ""
OFFSET: distance, then a point ON the object, then a point on the side to offset to; "" ends.
  CIRCLE 100,0 10
  OFFSET 5 110,0 120,0 ""
FILLET: R and the radius, then a point on each of two lines (FILLET R 0 makes a sharp corner). CHAMFER works the
same with D and two distances.
  LINE 200,0 @50,0 ""
  LINE 200,0 @0,50 ""
  FILLET R 10 230,0 200,30
TRIM: "" to use every object as a cutting edge, then a point on each part to remove, "" ends. EXTEND is the same,
picking the end to extend.
  LINE 300,0 @60,0 ""
  LINE 330,-20 @0,40 ""
  TRIM "" 350,0 ""
ARRAY: objects, then R (rectangular: rows, columns, row and column spacing) or P (polar: center, count, angle to
fill, rotate items Y/N).
  CIRCLE 0,200 5
  ARRAY L "" R 2 3 20 20
  CIRCLE 100,200 3
  ARRAY L "" P 100,180 6 360 Y
EXPLODE turns polylines, rectangles and blocks into their parts; JOIN does the opposite with touching lines and arcs.
  EXPLODE ALL ""
