# Selecting objects
Commands that work on several objects ask "Select objects:". Answer with any of these, then "" to finish:
- ALL — everything selectable in the current space.
- L — the last object created. P — the previous selection.
- W x1,y1 x2,y2 — window: objects fully inside the rectangle.
- C x1,y1 x2,y2 — crossing: objects inside or touching it.
- a point on an object — picks it.
- R then objects — remove from the selection; A — add again.
  CIRCLE 0,0 10
  CIRCLE 30,0 10
  ERASE C -15,-15 45,15 ""
  U

By id: call the select tool with the ids (from query_objects), then run the command; it uses that selection and
does not ask again. The same happens if the user selected objects before.

Commands that ask for ONE object ("Select object to offset", "Select first object") take a point on that object:
type a point that lies on it (an endpoint, a midpoint or any point of the curve).
