# Points, coordinates and snaps
Points are typed as numbers separated by commas, without spaces:
- x,y or x,y,z — absolute, in the current UCS (z defaults to 0).
- @dx,dy[,dz] — relative to the last point given.
- @dist<angle — polar, relative: distance and angle in degrees (counterclockwise from +X).
- *x,y,z — absolute world coordinates, ignoring the UCS.
- @ alone — the last point again.

A number alone where a point is expected moves that distance from the last point toward the cursor; avoid it in
scripts and type full coordinates instead. Object snaps (END, MID, CEN…) only work with the mouse: compute the
exact point instead (query_objects and describe_object give centers, endpoints and radii).
  CIRCLE 0,0 20
  LINE 0,0 @20<45 ""
A typed point that lies on an object also picks that object where a command asks for one.

UCS (user coordinate system): the plane where typed points and new 2D objects go. World is the default; for 3D,
see the solids-3d guide.
  UCS W
