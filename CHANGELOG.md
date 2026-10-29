# Changelog

All notable changes to Cota are documented here. The project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [2.10.2] — 2026-10-28

### Fixed
- On phones and tablets the file picker let you choose `.dwg` (and `.cota`) files: their pickers only know file
  types, so those extensions appeared greyed out. Now every file can be picked and Cota checks the extension, with a
  clear message for files it cannot open.
- The mobile view shows what happened when opening a drawing ("Reading DWG…", opened, or why it could not be read).

## [2.10.1] — 2026-10-28

### Fixed
- The end-to-end tests of the mobile view tap like a finger (a short pause between touches), so they pass reliably in
  CI.

## [2.10.0] — 2026-10-28

### Added
- **Mobile view for the job site.** On a phone Cota opens a reduced view instead of the editor: open a drawing from
  the device (or from your account with the server), orbit with one finger, pinch to zoom, move with two fingers,
  double tap to see everything, and big buttons for **Fit**, **Views** (top, front, right, isometrics…), **Style**
  (2D wireframe, wireframe, hidden, shaded, shaded with edges), **Layers** (turn them off only on screen, the drawing
  does not change) and **Measure**: drag a ring that sits above your finger onto the points, with object snap, and
  read the distance, ΔX, ΔY, ΔZ and the angle; the measured segment stays drawn. Layouts can be viewed too.
  **Full editor** in its menu, or **MOBILEVIEW** in the editor, switches; the choice is saved with your preferences.
- **Touch in the full editor** (tablets): pinch to zoom and move with two fingers; one finger still works as the mouse.

### Changed
- The agent panel and its tab show a **beta** label.

## [2.9.0] — 2026-10-28

### Changed
- The **agent panel** is a column at the right of the drawing (it no longer covers the view cube) and is open on the
  first visit. Closed, it leaves a narrow **Agents** tab to open it again; **Options ▸ User Preferences** can hide the
  tab. Both are saved with your preferences, in the browser and in your account when signed in.

## [2.8.2] — 2026-10-28

More fixes from testing the modeling agent with real Gemini models.

### Fixed
- When the provider stops in the middle of a turn (quota used up, network), what the agent already did stays in the
  conversation, so "continue" picks up from there, also with another model.
- Switching the model in the middle of a conversation works with Gemini 3 (the previous model's reasoning signatures
  no longer block the next one).

### Changed
- The agent sends each step as one complete script and asks for several guides at once, which saves requests (free
  tiers allow few per day).
- The 3D guide teaches turned parts with chamfers as one REVOLVE of a half-section profile, with no edge picking.

## [2.8.1] — 2026-10-28

Fixes found testing the modeling agent with a real Google Gemini key.

### Fixed
- Gemini 3 models: the agent keeps the reasoning signature of each tool call, which these models require on the next
  turn (it failed after the first tool), also through the optional server.
- Busy or rate-limited providers (HTTP 429/5xx): the agent waits as long as the provider asks and retries, and says
  clearly when a daily quota is used up. The default Gemini model is now `gemini-3.5-flash`, available on the free tier.
- `%%c` (Ø), `%%d` (°) and `%%p` (±) in dimension and leader text are shown as symbols, as in TEXT.
- Dimensions drawn on a sheet over a drawing view measure the part, not the paper (a 1:2 view showed half sizes).

### Changed
- The agent can read the lines, circles and arcs of a drawing view in sheet coordinates to dimension it, gets the
  sheet size, and is told which input and prompt rejected a script.

## [2.8.0] — 2026-10-28

### Added
- **Modeling agent with the optional server (Docker)**: signed in, the AGENT panel uses the server, which calls the
  model with pydantic-ai and your key saved on the server (it never comes back to the browser) and stores the
  conversations in its database; the commands still run in the browser on the open drawing. Anthropic joins OpenAI
  and Gemini as a server provider.

### Fixed
- The agent finds the command lists of the menus whatever the interface language.

## [2.7.0] — 2026-10-28

### Added
- **Modeling agent** (**AGENT**): a panel where an LLM models for you through Cota's own commands, using your own
  API key from the browser (Anthropic, OpenAI, Google Gemini, OpenRouter or any OpenAI-compatible API; Cota ships no
  key). Choose whether each batch of commands is shown for approval or runs automatically; every batch is one undo
  step. The agent can query the drawing (objects in a box with their parameters), select objects, change their
  properties, look at the view and read short guides per topic, so it starts with only what it needs. Conversations
  are kept in the browser, the context bar shows how much is used and **COMPACT** summarizes the conversation. The
  first API key asks once whether to remember it in the browser, explaining the risk.
- A point typed at a prompt that asks for an object (and at "Select objects") picks the object passing through it,
  so scripts can select without clicking.

## [2.6.0] — 2026-10-28

### Added
- **Scripts**: several commands as one operation, written like classic CAD scripts (inputs separated by spaces or new
  lines, `""` for Enter, quotes for text with spaces). Paste them in the command line or run **SCRIPT** to type them,
  load a `.scr` file or copy a link that shares them; a shared link shows the script and runs it only when you
  confirm. The whole script is one undo step, and it stops at the first rejected input, saying which one.

### Changed
- **DIVIDE** and **MEASURE** use the objects already selected (several at once) instead of asking for one again.
- <kbd>Ctrl</kbd>+<kbd>V</kbd> pastes text in the command line when no objects are copied.

## [2.5.1] — 2026-10-28

### Fixed
- A layout now uses its own UCS: after setting a view-based UCS in the model (for example with `-VIEW FRONT`), points
  typed on the sheet went to the wrong place (drawing views and lines landed at y = 0). Going back to the model keeps
  its UCS and its name.
- THREAD finds the axis of a hole in a solid exactly: it was off by a few hundredths of a millimetre when the
  boolean operation had split the faces of the hole unevenly.

## [2.5.0] — 2026-10-28

### Added
- **THREAD**: cosmetic threads drawn as ISO 6410 / IRAM recommend. On a circle, pick the side as with OFFSET:
  inside for a shaft (the circle is the major diameter and a thin 3/4 arc marks the root) or outside for a tapped
  hole (the circle is the drill and the thin arc marks the major diameter), with the open quarter at the upper right.
  On a cylindrical face of a solid the side comes from the face itself (shaft or hole) and the face shows a helical
  thread texture with the real pitch, which follows the solid when it is moved, rotated, mirrored, scaled or arrayed.
  The command lists the nearest size of each series (ISO metric coarse and fine, Whitworth BSW, BSP G and ISO
  trapezoidal; for holes it matches the minor diameter) and can add a leader with the standard designation
  (`M10`, `M10x1,25`, `W 3/8"`, `G 1/2`, `Tr 20x4`), whose text can be overridden in Properties. Running it again
  on a thread adds the leader only if it has none.
- Drawing views show the threads of solids: thin root lines in side views (hidden for holes) and the thin 3/4 arc in
  end views; THREAD on that arc in a layout adds the leader on the sheet.

## [2.4.0] — 2026-10-28

### Added
- **Color and lineweight per object**, ByLayer by default as in classic CAD: set them for the selection in
  Properties or in the Properties toolbar (color list with ByLayer, the named colors and Select Color…; lineweight
  list), and for new objects with **COLOR** (`CECOLOR`: index 1–255, name, `#rrggbb` or `r,g,b`) and **LWEIGHT**
  (`CELWEIGHT`: ByLayer, Default or mm). They are drawn, plotted, copied with the object, matched by MATCHPROP and
  saved in DXF (codes 62/420/370) and DWG.

## [2.3.0] — 2026-10-28

### Added
- **QSELECT** Quick Select dialog: by object type and property (layer, linetype, length, angle, radius, diameter,
  area, closed, text contents and height, dimension measurement and style, block name, hatch pattern), with
  equals / not equal / greater / less / wildcard / select all, include or exclude, and append to the selection.
- **GROUP**, **UNGROUP** and **-GROUP** (list, create, add, remove, explode, rename, selectable): picking an object of
  a group selects the whole group; **PICKSTYLE** (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd>) turns it off. Groups are
  saved with the drawing.
- **ISOLATEOBJECTS**, **HIDEOBJECTS** and **UNISOLATEOBJECTS**: temporarily show only, or hide, the selected objects;
  hidden objects give no snaps and cannot be selected. In the right-click menu with Quick Select.
- **PURGE**: removes unused blocks (nested ones too), dimension styles, layers and linetypes, by name or wildcard,
  optionally confirming each one.

## [2.2.0] — 2026-10-28

### Added
- **POLAR** polar tracking (<kbd>F10</kbd> or the POLAR button): near a multiple of `POLARANG` (90° by default) from
  the base point, the cursor runs along that ray, shown dashed, and a typed distance goes that way. ORTHO and POLAR
  turn each other off, as in classic CAD.
- Inquiry commands: **ID** (coordinates of a point in the current UCS), **AREA** (area and perimeter of points or of
  a circle, polyline, rectangle, ellipse, spline, hatch or the surface of a solid, with `Add area`/`Subtract area`
  for a running total), **LIST** (type, layer, points, lengths, angles, areas, volumes of the selected objects) and
  **MASSPROP** (volume, surface area, bounding box and centroid of solids). Under Tools ▸ Inquiry.

## [2.1.0] — 2026-10-28

### Added
- **Views are saved with the drawing**: the view (camera and UCS) of each model viewport, the active viewport, the
  view of each layout sheet and the visual style. Opening the drawing again shows it as it was saved. Drawings saved
  before open in plan view, zoomed to their extents, instead of keeping the view of the previous drawing.

### Changed
- Thinner, rounded scrollbars throughout the interface (command history, panels, dialogs and lists), more visible
  on hover.

## [2.0.0] — 2026-10-28

### Changed (breaking)
- **Typed coordinates are absolute**, as on the classic CAD command line: `10,20` is the point X = 10, Y = 20 at
  any prompt, and `@10,20` is relative to the last point. Until now, `x,y` after the first point was relative
  (like the dynamic input box); that behavior is now **dynamic input**, toggled with <kbd>F12</kbd> or the new
  **DYN** button in the status bar (with it on, `#x,y` is absolute). Scripts and macros that typed relative
  coordinates without `@` need the `@` (or DYN on).
- **TEXT** sits on its baseline: the point you give is the start (or the center or end, with the new `Justify`
  option) of the baseline, instead of the top-left corner. Every <kbd>Enter</kbd> starts the next line below; an
  empty line ends. Texts in existing drawings keep their place.
- **Esc cancels the whole command** and prints `*Cancel*`; before, some commands went back to their options (for
  example a `-LAYER` sub-prompt) or took Esc as Enter.

### Added
- **PLOT dialog with preview**: paper size (ISO A4–A0, ANSI Letter, Legal, Tabloid), orientation, plot area
  (Extents, Display or a Window picked in the drawing), plot scale (fit to paper, showing the resulting scale, or a
  standard 1:n), center the plot, plot style (color, monochrome, grayscale) and lineweights. The preview draws the
  same sheet that is exported. A layout plots at 1:1 with its page setup. `-PLOT` plots right away with the last
  settings (for scripts and macros).
- **Grip modes**: with a hot grip, <kbd>Space</kbd> or <kbd>Enter</kbd> cycles STRETCH → MOVE → ROTATE → SCALE →
  MIRROR, acting on the whole selection, with `Base point`, `Copy` (multiple copies) and `eXit`.
- `%%c`, `%%d`, `%%p` and `%%%` in TEXT, MTEXT and Properties become Ø, °, ± and %; DXF export writes them back as
  control codes.
- NEW asks to save the changes first, and starts in plan view with the world UCS. Closing or reloading the tab with
  unsaved changes asks for confirmation.
- When a window or crossing in a command leaves objects out because their layer is locked, the command line says
  how many ("1 was on a locked layer.").

### Fixed
- Esc at the format prompt of EXPORT exported the drawing; Esc in ARRAY (rotate items), OFFSET (multiple), MLEADER
  and DIMREASSOC continued instead of cancelling.
- With a menu open, Esc closes it and typing closes it and goes to the command line. When a menu, a panel or a
  button that had the focus closes, the keyboard goes back to the command line.
- `@` at a prompt without a base point (the dimension line location of DIMLINEAR, for example) is relative to the
  last point instead of being rejected.
- EXTRUDE with a taper angle showed the solid inside out (and without its top) when the profile was drawn
  clockwise; any LOFT now faces outwards.
- DXF: TEXT keeps its baseline and justification (center/right with the alignment point, vertical justification
  on import); MTEXT keeps its attachment point (middle and bottom rows) and arrives as plain text, without
  formatting codes, with `\U+` characters. MTEXT shows as MTEXT in Properties, with its lines separated by `\P`.
- After NEW, the UCS list said "Front" while the UCS was the world one.
- Properties shows numbers without floating-point noise (a viewport custom scale of 0.832572, not
  0.8325718347040308).
- BLOCK with nothing selected, and `-OPEN` ▸ List without a folder or account, say what happened.
- OPTIONS keeps the same size on every tab; the layer manager fits better in narrow windows.
- Paper and layout template names in English ("IRAM A3 landscape", "Letter / ANSI A").
- Saved PDMODE and PDSIZE were not restored on the next visit.

## [1.11.0] — 2026-10-27

### Added
- **POINT**, **DIVIDE** and **MEASURE**: point objects drawn with the classic point styles (`PDMODE`: dot, plus,
  cross, tick, with a circle and/or a square; `PDSIZE`: a share of the view or drawing units), selectable, with
  grips, NODE object snap and DXF/DWG import and export. DIVIDE places points that split an object into equal
  lengths; MEASURE places them at a given length from the end nearest the pick. Under Draw ▸ Point.

### Fixed
- When DWG export or import fails in the browser, the message gives the real reason (and how to fix it when the
  converter could not be loaded) instead of "Request failed" from the optional server.

## [1.10.0] — 2026-10-27

### Added
- OPTIONS is organized in tabs, like the classic CAD options dialog: **Display** (color scheme, crosshair, UCS
  icon, mouse wheel zoom), **Open and Save** (autosave, layout and drawing templates), **Drafting** (object snaps,
  dynamic UCS and UCS behavior), **Editing** (fillet and chamfer, trim and extend, offset gaps, PEDIT) and **User
  Preferences** (block attributes, drawing units). It opens on the last tab you used.

### Fixed
- OPEN and SAVE in a new browser tab with a remembered working folder: the browser asks again for permission to
  use the folder, instead of OPEN failing with "Request failed" and SAVE downloading the drawing. If permission is
  not given, OPEN explains it and offers to allow access, choose another folder or open a file from the device.

## [1.9.0] — 2026-10-27

### Changed
- Visit statistics for a public deployment use [Umami](https://umami.is) (open source, no cookies): visits, where
  visitors come from (including UTM tags) and how long the visit lasted. No third-party script is loaded; off
  unless the build sets `VITE_ANALYTICS_UMAMI`. The Google Analytics and GoatCounter options added in 1.8.0 are
  removed.

## [1.8.0] — 2026-10-27

### Added
- Optional visit statistics for a public deployment, off unless the build configures them: GoatCounter (one
  request per visit, no cookies and no third-party script) or Google Analytics 4 (nothing from Google loads until
  the visitor accepts). "Do Not Track" is honored, and drawings or commands are never sent. Builds you make yourself
  send nothing. See `docs/self-hosting.md`.

## [1.7.0] — 2026-10-27

### Added
- **Save DWG in the browser**: EXPORT ▸ DWG writes a DWG 2018 file with no server (layers, colors, linetypes and the
  geometry, through acad-ts). The optional server is only a fallback.

### Fixed
- True colors (not from the color index) keep red and blue in the right order in the DWG files Cota writes.

## [1.6.0] — 2026-10-27

### Added
- **DWG files open in the browser, with no server**: OPEN and IMPORT read `.dwg` (2000 to 2018+ formats) with
  [acad-ts](https://github.com/node-projects/acad-ts) (MIT), loaded only when the first DWG is opened. The optional
  server is still used to save DWG, and as a fallback for files the browser cannot read. 3D solids stored as ACIS
  data are not read yet.
- Blocks in DXF and DWG files are imported: every insertion is expanded into its geometry (base point, rotation,
  scale and nested blocks), objects on layer 0 inside a block take the layer of the insertion, and attribute values
  come in as text.

### Performance
- Booleans reuse what was already computed: adding a hole to a part you just joined, or slicing it, no longer
  recomputes the whole part (the bore of a finned cylinder went from 5 s to 1.6 s).
- Edges and snaps of parts with many booleans are about 7 times faster (4.8 s to 0.7 s on a finned cylinder), and
  the clean-up after each boolean only tests the zone where both parts meet.

## [1.5.1] — 2026-10-27

### Fixed
- A union of many parts (a crankshaft with its webs, pin and a flywheel with lightening holes) could silently drop
  one of them: needle-thin triangles in an operand made the boolean fail. They are removed before each operation,
  and the inside/outside test retries without normals when it meets one.

## [1.5.0] — 2026-10-27

### Added
- EXTRUDE, BOX, CYLINDER and CONE show the solid they will create while you pick the height, shaded and
  translucent, and the height follows the side of the cursor: move it below the profile to extrude downwards (into
  another solid to cut a pocket). A typed positive height still grows towards the viewer.
- CYLINDER and CONE ▸ Axis endpoint: the axis goes from the base center to a picked point in any direction (a
  horizontal shaft without changing the UCS).
- VIEWGEN from the model asks for a layout, like VIEWBASE: a new one is created without its initial viewport, so
  the views are not hidden behind it (`Model` keeps the 2D blocks in the model).
- Public roadmap (`ROADMAP.md`): command line for professional use, an AI agent panel and MCP server, mechanisms
  and joints, precision gears, ray-traced rendering, physics and CAM.

### Fixed
- Solids made with booleans showed tiny dark specks on flat faces: the mesh had thousands of T-junctions (a vertex
  in the middle of a neighbour's edge) that left sub-pixel cracks. They are closed now, and nearly coincident
  vertices are welded.
- UNION, SUBTRACT and INTERSECT keep the layer and linetype of the first object picked (the result went to the
  current layer). SUBTRACT ignores an object picked both as the base and as something to subtract.
- `W` or `C` typed at "Select objects" in a 3D view: the window is drawn on the screen, even if its first corner
  falls on an object and whatever its direction (it was measured on the drawing plane and could miss what you see).
  During a Fence or a polygon, clicks are points.
- Lines tangent to circles drawn in a rotated UCS (TAN to TAN) are solved in the plane of the circles; they came out
  of that plane.
- TRIM of a circle whose remaining part passes through its 0° point gives an arc, not a two-arc polyline (JOIN can
  then close the outline).
- Objects on layers that are turned off no longer act as cutting edges in TRIM ▸ select all, and FILLETEDGE,
  CHAMFEREDGE and UCS ▸ Face only pick solids you can see and edit.
- Colors 10–255 of the classic color index (in DXF files and `-LAYER Color`) showed as white; the full table is used.
- VIEWGEN places the isometric view in a free corner next to the other views, so the sheet is not taller than
  needed and the scale is larger.
- The console warning "render loop error" when a view was created (the first frame ran before the view existed).
- A height picked with a 3D object snap is measured along the extrusion axis, not as the straight distance to
  the point.

### Performance
- Booleans where faces touch or are flush (a hole as deep as the plate, a part resting on another) are about 50
  times faster: a plate with four holes went from 6.6 s to 0.13 s.
- The rubber-band, object snap and tracking overlays no longer rebuild their shaders on every mouse move.

## [1.4.1] — 2026-10-27

### Fixed
- CIRCLE: a radius or diameter picked with the cursor is measured in the circle's plane, as the preview shows (with
  the center taken from a 3D snap, the circle came out with another radius).
- OFFSET of an open polyline with arcs at a distance larger than one of its radii returned several pieces and a
  stray loop; it now returns one clean polyline.
- EXTRUDE ▸ Path: each straight run between sharp corners is its own face, so the miter edge shows and the
  shading at the corner is clean.
- Silhouettes are recomputed when the visual style changes (they kept the color of the previous style).

### Performance
- Drawing views (VIEWGEN, VIEWBASE, VIEWUPDATE) are about 13 times faster on parts with fillets: hidden lines are
  resolved with a spatial grid and each solid's topology is reused instead of rebuilt for every view.
- Clicking to select no longer recomputes the bounds of every object in the drawing.

## [1.4.0] — 2026-10-27

### Added
- UNITS: drawing units in millimeters, centimeters, meters, inches or feet (what is drawn keeps its size; scales
  and linetypes follow the unit).
- Drawing templates (TEMPLATE): save the current settings as a `.cotatpl` file — units, layers, linetypes,
  dimension styles, variables and the layouts with their title block, plus your preferences (interface colors,
  object snaps, visual style, palettes and toolbars) — open one to start a new drawing from it, or make the current
  settings the default so every new drawing starts from them (stored in the browser; Clear goes back to the
  built-in settings).

## [1.3.0] — 2026-10-27

### Added
- VIEWGEN: generate the projection views of a part at once. A diagram of the views around the front view lets you
  pick which ones (top, bottom, left, right, back and the four isometrics), the arrangement (ISO-E first angle by
  default, or ISO-A third angle) and hidden lines. In a layout they become associated drawing views aligned with
  the front view, at a scale that fits the sheet; in the model, 2D blocks of the projection.

## [1.2.0] — 2026-10-27

### Added
- Orbit commands: 3DORBIT (also 3DO and ORBIT), 3DFORBIT (free orbit, may roll the view), 3DCORBIT (keeps spinning
  after you release; click to stop), 3DPAN and 3DZOOM. Right-click during any of them switches between Pan, Zoom
  and the three orbits.
- SLICE: cut solids with a plane through two points (perpendicular to the UCS XY plane), three points, the XY / YZ
  / ZX planes, a Z axis or the current view, keeping one side or both.
- Layer lineweights are drawn on screen in layouts (paper space and the model seen through viewports), at their
  real width on the sheet. The model stays with thin lines.
- Curved faces of solids show their silhouette from the current view: the sides of a cylinder, the outline of a
  sphere or of a swept tube are drawn, not only their end circles.

### Fixed
- Object snaps on filleted or curved solids no longer offer an intersection at every facet of the tessellation;
  real corners still snap.

## [1.1.0] — 2026-10-27

### Added
- Frozen layers are shown in grays (from #222 to #CCC, by the brightness of their color): they cannot be
  selected or edited but still give object snaps. Layers turned off disappear completely until turned on.
- A clean click inside a solid selects it, in wireframe styles too.
- Objects taken with a click by FILLET, CHAMFER, OFFSET, BREAK, LENGTHEN, JOIN, MATCHPROP, PEDIT and DIMEDIT stay
  highlighted until the command ends.
- Color 7 behaves as in classic CAD in both directions: white layers display black on a light background and
  black layers display white on a dark one.
- Unexpected errors show a closable message and the app keeps working; if the interface itself fails it is
  remounted instead of leaving a blank screen.
- Solids show their tangent edges (where a flat face meets a fillet), in the model and in drawing views, as in
  classic CAD. Drawing views also include the outline of fully rounded parts.
- While drawing a polyline, the segments already placed give object snaps (endpoint, midpoint, intersection…).
- With ortho on, intersection snaps mark where the segment being drawn will cross nearby objects.
- FILLET and CHAMFER on a solid edge (clicked or typed) work like FILLETEDGE and CHAMFEREDGE.
- After a fillet or chamfer, object snaps use the vertices of the resulting solid: the removed corner no longer
  snaps, the tangent points of a fillet are endpoints and its centers are available with a typed CEN. Their
  coordinates are exact (the tessellation error is removed).
- Context menu on right-click, the Menu key or Shift+F10, as in classic CAD: Enter, Cancel, the prompt options and
  snap overrides during a command; Repeat, Recent Input, clipboard, Erase/Move/Copy/Scale/Rotate/Mirror, Select
  Similar, Deselect All and Properties with a selection; Undo/Redo, Pan, Zoom and Options otherwise. Right-click is
  still Enter at "Select objects".
- Clipboard: COPYCLIP (Ctrl+C), CUTCLIP (Ctrl+X), COPYBASE (Ctrl+Shift+C), PASTECLIP (Ctrl+V) and PASTEORIG; and
  SELECTSIMILAR.
- EXTRUDE options as in classic CAD: Direction (oblique prism), Path (sweep along a line, polyline, arc or spline)
  and Taper angle (circles become frustums; polygons keep every side at the same offset).
- Locked layers are shown faded (as LAYLOCKFADECTL 50): visible and snappable, but not selectable.
- The layer lineweight is chosen from the standard list (Default, 0.05 … 2.11 mm) and is used when plotting.
- OPEN reads 3D models as a new drawing: STL (ASCII and binary), OBJ, STEP and IGES (through OpenCascade, loaded
  only when one of these files is opened). DXF and DWG as before (DWG needs the optional server).
- Default lighting follows the camera (two distant lights), so faces with different orientations never share
  the same shade.

### Changed
- GitHub Actions on their current major versions; Zustand 5.0.16.
- React 19; @eslint/js 10 and current typescript-eslint; GitHub Actions on their current major versions.
- Development toolchain updated: Vite 8, Vitest 5, ESLint 10, Playwright 1.64, @vitejs/plugin-react 6. No known
  vulnerabilities in the development dependencies either (`npm audit`: 0).
- Dependabot opens one grouped pull request per ecosystem and month; three.js and its CSG libraries are upgraded
  by hand, with tests.

### Fixed
- EXTRUDE ▸ Path follows the path exactly (its corners are mitered instead of rounded off), no longer twists along
  S-shaped curves, starts at the end of the path nearest the profile, and reports when the path lies in the
  profile's plane. A height picked with the cursor is measured from the profile.
- Drawing views keep their projection alignment: a view with arcs (a bored or notched part) was shifted sideways
  from its parent. VIEWUPDATE on existing views realigns them.
- VIEWPROJ with solids selected in the model hung the app; any command asking for objects again no longer loops
  on the preselection.
- Coordinates no longer carry floating-point noise (a line drawn to x = 1 stored 0.9999999999995453); ortho keeps
  the locked coordinate exact.
- Object snaps and tracking no longer pick points from layers that are off or frozen.
- STRETCH: ortho no longer flattens the crossing window, and the objects found stay highlighted until the
  command ends (also ZOOM Window, MVIEW, TRIM fence windows and VIEW Window ignore ortho).
- The browser's hand cursor no longer appears over the crosshair when hovering a grip.
- VIEWBASE on a part with every edge rounded reported "No 3D solids to document".
- Clicking empty space starts a selection window and a second click closes it (no need to drag); clicking a
  solid selects it reliably.
- Browser auto-translation is disabled: it rewrote the command prompt ("Domain:") and crashed the interface.
- Two end-to-end tests that could fail on busy CI machines now wait for the command to finish and the canvas to
  settle before clicking.

## [1.0.0] — 2026-10-21

First public release.

### Drafting and editing
- Command-line driven interface with prompts, options, defaults, aliases, command history and completion;
  menus for every command; 240+ commands and system variables.
- Lines, polylines with arcs and widths, arcs, circles, ellipses, splines, polygons, rectangles, single-line and
  multiline text, associative hatches with islands, blocks with attributes.
- Move, copy, rotate, scale, mirror, offset, stretch, lengthen, trim, extend, break, join, fillet, chamfer,
  rectangular and polar arrays, align, explode, match properties, grips.
- Absolute, relative, polar, cylindrical and spherical coordinates; direct distance entry; object snaps,
  ortho, snap grid, object snap tracking; user coordinate systems; undo and redo, including view changes.
- Layers with color, linetype, lineweight, freeze, lock and plot settings; linetype library; layer tools.

### 3D
- Box, cylinder, cone, sphere and torus primitives; extrude and revolve; union, subtract and intersect; fillet
  and chamfer of solid edges; 3D-aware rotate, mirror and array in any view.
- Wireframe, hidden, shaded and shaded-with-edges visual styles; unfolded view cube (faces, edges and corners, first- or third-angle layout, camera dot); perspective; multiple viewports;
  named views.

### Dimensions and drawings
- Linear, aligned, angular, arc length, radius, diameter, jogged, ordinate, baseline and continue dimensions;
  quick and automatic dimensioning (`AUTODIM`); leaders and multileaders; center marks and centerlines;
  dimension styles; annotative scales; associative dimensions.
- Layouts with scaled and clipped viewports, title block with fields and attributes, layout templates.
- Drawing views from the 3D model (`VIEWBASE`, `VIEWPROJ`) with hidden lines and shading, `SOLPROF`,
  `FLATSHOT`.
- Vector PDF plotting with lineweights and plot styles; multi-page `PUBLISH`.

### Interface
- 23 classic toolbars with their own icons (hidden by default except Dimension): Tools ▸ Toolbars, right-click
  list, `TOOLBAR` dialog and `-TOOLBAR`; several per edge, draggable, floating.
- The interface and display setup is remembered in the browser and, when signed in, in the account.
- GRID (status bar, F7, command), FULLSCREEN (status bar, command; remembered).
- Installable as an app (PWA): own window without the address bar, desktop shortcut, works offline.

### Files and server
- Native `.cota` format; DXF and OBJ import and export in the browser; DWG through the optional server.
- Works without a server: save as a download or to a folder on disk, with autosave.
- Optional FastAPI server: accounts, document storage, DWG conversion and natural-language modeling with the
  user's own LLM key.
