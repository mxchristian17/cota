# Measuring and inquiring
These commands print their results in the transcript.
- DIST: two points → distance, angle and deltas.
- ID: a point → its coordinates.
- AREA: points of a polygon then "" (or O and a point on a closed object) → area and perimeter.
- LIST: objects, "" → their properties. MASSPROP: solids, "" → volume, centroid and inertia.
  DIST 0,0 30,40
  ID 10,20
  AREA 0,0 40,0 40,30 ""
  CIRCLE 0,0 10
  LIST L ""
  BOX 0,0,0 10,10,0 10
  MASSPROP L ""
Prefer query_objects / describe_object to know what is in the drawing; these commands are for measurements.
