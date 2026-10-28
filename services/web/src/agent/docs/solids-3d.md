# 3D solids
Solids are parametric: BOX, CYLINDER, CONE, SPHERE and TORUS, solids made from closed 2D profiles (EXTRUDE,
REVOLVE) and boolean results. Heights go along the Z axis of the current UCS.

BOX: first corner, opposite corner of the base, height.
  BOX 0,0,0 100,60,0 20
CYLINDER: center of base, radius, height. CONE: center, base radius, top radius (0 = pointed), height.
  CYLINDER 50,30,20 10 30
  CONE 150,30,0 15 0 40
SPHERE: center, radius. TORUS: center, radius, tube radius.
  SPHERE 250,30,15 15
  TORUS 350,30,0 20 5
EXTRUDE: closed profiles (circle, closed polyline, rectangle), "", height.
  RECTANGLE 0,100 @40,20
  EXTRUDE L "" 15
REVOLVE: closed profiles, "", two points of the axis, angle (360 = full turn).
  RECTANGLE 100,100 @10,30
  REVOLVE L "" 90,100 90,130 360
Booleans: UNION (objects, ""), SUBTRACT (solids to keep, "", solids to remove, ""), INTERSECT (objects, "").
  CYLINDER 20,110,0 5 40
  SUBTRACT 1,101,1 "" L ""
FILLETEDGE / CHAMFEREDGE round or bevel solid edges: they need edge picks, so prefer building rounded shapes from
profiles. SLICE cuts a solid with a plane.

Points in 3D: type x,y,z. The UCS sets the working plane for profiles and primitives:
- UCS W (world, XY plane) · UCS X 90 (rotate the UCS 90° about its X axis: the XZ plane becomes the working plane)
  · UCS 3 origin pointX pointY (by three points) · UCS P (previous).
  UCS X 90
  CIRCLE 0,0 5
  UCS W
Views: -VIEW FRONT / TOP / RIGHT / SEISO (isometric)… changes the view of the active viewport (and sets that
view's UCS); VSCURRENT S (shaded), W (wireframe), H (hidden), SE (shaded with edges).
  -VIEW SEISO
  VSCURRENT S
  UCS W
