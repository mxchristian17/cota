# Text, dimensions and hatches
TEXT: start point, height, rotation angle, then one line of text per input; "" ends. J before the point changes
the justification (Left/Center/Right).
  TEXT 0,60 5 0 "Base plate" ""
MTEXT works like TEXT for paragraphs: the lines are one object.

Dimensions take their look (text height, arrows) from the current dimension style.
DIMLINEAR: two points, then the location of the dimension line (horizontal or vertical by where you put it).
DIMALIGNED: the same, parallel to the two points.
  LINE 0,0 @100,0 @0,40 ""
  DIMLINEAR 0,0 100,0 50,-15
  DIMALIGNED 100,0 100,40 115,20
DIMRADIUS / DIMDIAMETER: a point on the circle or arc, then the location of the text.
  CIRCLE 50,20 10
  DIMDIAMETER 60,20 80,40
DIMANGULAR: a point on each of two lines, then the location of the arc.
  DIMANGULAR 50,0 100,20 90,10
MLEADER (leader with text): arrowhead point, landing point, text lines, "".
  MLEADER 40,20 20,45 "Hole" ""
THREAD: the ISO thread symbol on a circle: a point on the circle, a point inside (shaft) or outside (hole), the
number of the suggested thread ("" = the nearest), Y/N for its leader and, if Y, the leader landing. On a 3D
solid it takes a point on a cylindrical face instead (no side: shaft or hole comes from the face): the point must
be on the side of the face that the current view sees, e.g. after -VIEW FRONT the point x,y−r,z at the front of a
vertical shaft of radius r centered at x,y.
  THREAD 60,20 50,20 "" N

-HATCH (command-line HATCH): P and a pattern name (ANSI31, ANSI37, SOLID…), pattern scale and angle, then a point inside each closed
area, "" ends.
  RECTANGLE 200,0 @50,30
  -HATCH P ANSI31 1 0 225,15 ""
