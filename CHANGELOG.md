# Changelog

All notable changes to Cota are documented here. The project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [2.27.1] — 2026-11-04

### Fixed
- **Symbols in plotted texts**: characters the PDF font lacks (≈, ≤, ≥, the minus sign, ∅…) plot as their closest
  equivalent (~, <=, >=, -, Ø) instead of "?", and the rest of the Windows character set (‰, Š, Œ…) plots as is.

## [2.27.0] — 2026-11-04

### Changed
- **Draw order as in classic CAD**: what covers what follows the order of the objects (the last one on top), on screen
  and in plots, instead of the order of the layers. Fills and masks cover what was drawn before them. The arrows and
  dragging that ordered layers in the Layer Properties dialog are gone.
- DWG and DXF files open **in their own draw order** (the order of the file and its draw order table); block
  insertions keep their place instead of going on top.
- `Last` in Select objects picks the last object created.

### Added
- **`DRAWORDER`** (`DR`: Above objects / Under objects / Front / Back) and **`TEXTTOFRONT`**, also in Tools ▸ Draw
  Order. A new hatch goes behind its boundary.

## [2.26.0] — 2026-11-04

### Changed
- **Much lighter PDFs**: plots are compressed, a viewport writes only what falls inside it, and the lines and dots of a
  hatch pattern go as one path. A sheet with dense hatches in several viewports went from 170 MB to under 5 MB.
- **Plots paint like the screen**: fills under the lines, masks over them and texts on top, so a fill no longer hides
  lines that show on screen.

### Fixed
- **Transparency in PDFs is real**: what is under a transparent fill shows through it, as on screen (it was mixed with
  the paper and covered what was under it).
- **Bold and italic texts** plot in bold and italic.

## [2.25.0] — 2026-11-04

### Added
- **Lineweights in the model** (**LWT** in the status bar, or `LWDISPLAY`): lines thicker than 0.25 mm show thick,
  in pixels that do not change with the zoom, as in classic CAD. The setting is saved with the drawing, and DWG and
  DXF files that have it on open with it on.

### Fixed
- **Dimensions with their own color** (black on a green layer, for example) showed in the color of their layer; their
  own color, lineweight and transparency are now read from DWG and DXF files and kept when exporting to DXF.

## [2.24.0] — 2026-11-04

### Added
- **Transparency** of objects from DWG and DXF files (hatches at 50 %, for example) is applied: they show lighter,
  mixed with the background (and with the paper in plots), so a transparent fill no longer hides the pattern under it.
  It is kept when exporting to DXF.

### Fixed
- **Hatch patterns from DWG files** (GRAVEL, AR-CONC, AR-SAND, bricks and the rest) came out broken: the angles of the
  pattern and of its lines were written in radians where degrees go, so every line of the pattern lay almost flat and
  gravel, for example, showed as loose dashes instead of stones.

## [2.23.0] — 2026-11-03

### Added
- **SHX fonts** (simplex, romans, txt and the rest) are drawn with Cota's single-stroke font, the one of the
  dimensions, on screen and in plots.
- **Dimension text in its font**: a dimension whose text style uses a TrueType font (Arial, for example) shows its
  text in that font, on screen and in plots.
- **WIPEOUT masks** from DWG and DXF files are applied: a fill of the background color that covers the lines of
  every layer under it, with the texts on top; they are exported back as WIPEOUT.

### Changed
- **Text height is the height of the capitals**, as in classic CAD: texts drawn with a font (Cota's and the
  TrueType ones) were about a quarter smaller than in the drawing they came from. Multiline text from a DWG or DXF
  keeps the line spacing it had (5/3 of the height times its factor).

## [2.22.1] — 2026-11-03

### Fixed
- **Dimension overrides** kept in DWG and DXF files (precision, text height, arrow size and the rest that a dimension
  changes from its style) are applied; they were ignored, so dimensions came in with the style's text size and
  decimals. When a dimension's own picture shows the measurement with other decimals than its style, Cota keeps
  those decimals.
- **Dimension text with formatting** (`{\H20x;90.00}`) shows as plain text at its height instead of tiny.

## [2.22.0] — 2026-11-03

### Added
- **Texts keep their font and width** from DWG and DXF files: the TrueType font of their text style is shown with a
  font of the same measures (Arial with Liberation Sans where Arial is missing), narrow fonts and width factors make
  the letters as narrow or wide as in the drawing, and bold and italic styles are kept. A title block now fits its
  cells as it was drawn. SHX fonts are shown with Cota's font.
- **Formatting inside multiline text** is kept: bold, italic, underline, font, height and color changes within a text
  (a bold label followed by a smaller value in a title block cell, for example).
- Plots and DXF export keep the width factor; DXF export also writes the font as formatting.

## [2.21.2] — 2026-11-03

### Fixed
- **Paragraph indents of multiline text** (`\pi…;`, measured in text heights) are applied to left-aligned text: the
  titles of a title block, indented to sit inside their cell, came out over its left border.

## [2.21.1] — 2026-11-03

### Fixed
- **DWG files with fields in their texts** (a title block that shows a property of the drawing, for example) did not
  open: a nested field without an owner stopped the whole conversion. They open now.
- **Splines defined by the points they pass through**, without control points (as some programs write them and as
  the DWG reader delivers them), came in empty; they are now drawn through those points (e.g. the water line of a
  longitudinal profile).
- **Paragraph codes in multiline text** (`\p…;`, indents and tabs) and control characters written as `^J` / `^I`
  showed up as stray characters in title blocks ("xt0;", "^J"); they now become line breaks and spacing.

## [2.21.0] — 2026-11-03

### Added
- **Files dropped on Cota** are opened (a drawing, together with the pictures dropped with it) or loaded into the open
  drawing (its pictures). Before, the browser opened the file instead and the drawing was lost from the tab.

### Changed
- **Loading the pictures of a drawing** is easier: a DXF opened from the working folder brings the pictures that are
  next to it (or at the folder's root) on its own; the Properties palette shows **Load…** next to a picture that is
  not loaded; `IMAGE` goes straight to choosing the files (`-IMAGE` keeps the *Reload/?* options).

### Fixed
- A **selected picture covered the whole drawing**; it now stays under the lines and its frame is highlighted.

## [2.20.1] — 2026-11-03

### Fixed
- **External agent**: when the browser was told not to let Cota reach this computer (it asks once, as "local network
  access"), the agent panel says so and how to allow it, instead of waiting for the bridge forever.

## [2.20.0] — 2026-11-03

### Added
- **Pictures in drawings**: the raster images a DXF or DWG uses (a georeferenced map behind a survey plan, a logo in a
  title block) are shown in their place, under the lines, with their clip and fade. A drawing stores only the path of
  each picture: choose the picture together with the drawing when opening it, or load it later with the new `IMAGE`
  command (on a phone, Menu ▸ Load images). The pictures are saved inside the `.cota` file and DXF export writes the
  image with its path. Until the file is loaded, its frame and name are shown as before; plots show the frame for now.
- **External agents**: an agent that runs on your computer and speaks MCP (the Model Context Protocol) can work on the
  drawing open in Cota with its own model, through the Cota bridge `cota-mcp.mjs` (a single script with no
  dependencies, served with the app). It gets the same tools as Cota's agent, its steps are listed in the agent panel
  and, with *Ask before running*, each script waits for your OK. Turn it on in the agent panel ⚙ ▸ **External agent**;
  setup in [external agents](docs/external-agents.md).

### Changed
- The agent panel keeps room for the conversation (and the Run button) when its settings are open.

## [2.19.0] — 2026-11-03

### Added
- **DeepSeek in the agent**: a provider of its own, with your DeepSeek key and the `deepseek-chat` model. DeepSeek
  models read text only, so the pictures of the drawing that the agent takes to check its work are replaced by a note
  (also when DeepSeek is used through OpenRouter).

### Fixed
- **Georeferenced drawings** (coordinates in the millions, as in survey and civil plans) are drawn to the millimetre.
  The graphics card keeps 7 digits, so far from the origin lines came out in steps of half a metre: a terrain profile
  looked like a staircase. The drawing is now sent relative to an origin of its own; snaps, previews and grips too.

## [2.18.1] — 2026-11-03

### Fixed
- **3D solids whose placement is written as text in the binary ACIS data** (some DWG writers store the matrix of a
  body that way) are turned and moved where they belong. That matrix was skipped, so those solids came in unrotated:
  in a 3D assembly about half of the parts, bearings among them, appeared turned or out of place.

## [2.18.0] — 2026-11-03

### Added
- **Mobile view: a tap selects a part** (another tap lets it go, a tap on empty space clears the selection) and one
  finger then orbits around the selection, which stays still on screen. A double tap still fits the drawing.
- Orbiting with objects selected turns around their center in the full editor too, as in the classic CAD.

### Fixed
- **Blocks inserted sideways in DWG and DXF files** (with an extrusion direction other than +Z) land where they belong:
  their insertion point and rotation were taken as world values instead of values in the plane of the insertion, so
  parts of a 3D assembly appeared displaced and turned.
- Faces of 3D solids that looked inside out: holes, bores and other inner cylinders and cones, solids whose ACIS
  transform mirrors them, and blocks inserted mirrored (negative scale). Meshes are also drawn on both sides, so a face
  that still came in reversed is shaded correctly.
- Selecting a part in a large drawing (tens of thousands of objects) no longer redraws everything: the selection is
  highlighted on top.

## [2.17.0] — 2026-11-03

### Added
- **Large 3D models on phones**: the faces of 3D solids from DWG and DXF use about half the triangles on a phone. A
  3D assembly with 1260 solids now opens on an emulated phone with about 260 MB in use.

### Changed
- Meshes are drawn smooth inside each face (cylinders and fillets no longer show their facets), with sharp edges kept
  where faces meet at an angle.
- Texts smaller than 3 pixels on screen are not drawn, as in the classic CAD, instead of being enlarged to a legible
  size. Only the texts on screen create their label, so a drawing with tens of thousands of texts stays light.

### Fixed
- **Large 3D drawings no longer run out of memory after a few commands.** Each undo step kept a full copy of the
  drawing, meshes included (hundreds of MB in a 3D assembly); the steps now share the meshes that did not change.
- Opening a large DWG needs about a third less memory at its peak: the drawing is read record by record, the meshes
  travel from the reader to the screen without being copied, and they are drawn from indexed buffers of the exact
  size (half the memory).
- Commands that only look at the drawing (ZOOM, PAN, REDRAW, LIST, ID, DIST, HELP) no longer copy it for undo, and the
  cleanup after each command skips meshes that were already clean.
- Turning on the layers of a drawing with 45 thousand texts takes a third of the time, and the page keeps a few
  hundred elements instead of one per text: their selection boxes go in a single mesh.

## [2.16.0] — 2026-11-03

### Added
- **Proxy entities from DXF files** (the custom objects of the CAD's mechanical, architectural or civil editions) come
  in by the replacement drawing the file keeps for them: lines, polylines, circles, arcs and meshes. In DWG files they
  are still left out: the DWG reader does not deliver them yet.

### Fixed
- 3D solids and regions from DXF R13 and R14 files open with their faces (their older ACIS format was not read).

## [2.15.1] — 2026-11-03

### Fixed
- Invisible block attributes from DWG and DXF files no longer show (a 3D assembly brought about a thousand of them).
- Closed NURBS edges of 3D solids follow the right side of the curve, so more curved faces come in with their true shape.

## [2.15.0] — 2026-11-03

### Added
- **3D solids from DWG and DXF open with their faces**: 3DSOLID, BODY and REGION are read from their ACIS model (text
  or binary) and come in as meshes that can be shaded: planes, cylinders and cones, spheres, tori and NURBS faces.
  They used to come in as edges only, which looked like flat lines, and the ones without stored edges were missing.
  A 3D assembly with 1260 solids opens in about 20 seconds.

### Changed
- Large meshes no longer slow down every view change: their triangles, normals and edges are computed once.
- [DWG and DXF coverage](docs/dwg-coverage.md) updated: solids now open with their faces.

## [2.14.0] — 2026-11-03

### Added
- **`STRETCH` stretches 3D solids**: extrusions and boxes, also inside unions, subtractions and fillets. The vertices
  inside the window move, so a piece of furniture drawn as boards gets longer or shorter in any view. Solids used to be
  left out of the selection.
- Cota's version, small at the bottom right.

### Fixed
- **Deep zoom inside a 3D drawing**: when the camera ended up in front of part of the drawing, that part could not be
  clicked, double-clicked or snapped to, and the cursor stopped following the drawing plane.
- Changing the drawing's name in the name box and saving in a working folder overwrote the old file; it now creates the
  new one, as `SAVE` with another name does.
- `UNDO` after a script or an AI change says so (`Undo: SCRIPT.`, `Undo: AI.`).

## [2.13.0] — 2026-11-02

### Added
- **Layouts from DWG and DXF files**: paper space opens as sheets, with their page size, content and viewports. It used
  to be mixed into the model.
- Construction lines and rays: `XLINE` and `RAY` commands, opened from and exported to DWG and DXF as what they are.
- More entities when opening DWG and DXF files: multilines, multileaders, geometric tolerances, arc dimensions, helixes,
  attribute definitions outside blocks and the frames of external images and OLE objects. A message lists what comes in
  simplified.
- 3D solids, regions and surfaces from DWG and DXF that do not store their edges now show them, read from their ACIS data.
- 3D solids and meshes are exported to DXF and DWG as 3D faces (they used to be left out).
- `Ctrl+S` saves the drawing and `Ctrl+Shift+S` saves it with another name.
- `RECT` as a shortcut of `RECTANGLE`.
- [DWG and DXF coverage](docs/dwg-coverage.md): what happens to each entity type when opening and exporting.

### Changed
- Double-clicking any object opens its properties (polylines and hatches used to start an edit command). A block with
  attributes still opens its attribute editor.
- With objects selected, the layer controls show their layer, with `(+N)` if there are several, and go back to the
  current layer when deselecting.
- `UNDO` and `REDO` say what they undid or redid, such as `Undo: EXTRUDE.`
- Clicks catch a line up to 10 pixels away; the line right under the cursor wins over one that is merely close.

### Fixed
- **Saving with another name** in a working folder overwrote the old file and reported its name. It now creates the new file.
- Holding the click or moving the mouse slightly when starting a selection window no longer closes it at once, and such
  a click on a line selects it.
- `STRETCH` outside the plan view: the window preview came out as a triangle and objects off the XY plane were not
  caught. A window marked with the mouse now covers what it shows on screen in any view; with typed coordinates it
  goes in the XY plane of the current UCS.
- `STRETCH` no longer drops a polyline's plane or a spline's data.
- Fence and polygon selections marked with the mouse, and typed `Window` and `Crossing`, work outside the plan view.
- `ZOOM Window` and `-VIEW Window` frame the window as it shows on screen in 3D views, and show its rectangle.
  `TRIM`'s crossing window shows it too.
- Object snaps no longer miss a part close to the camera in perspective.

## [2.12.0] — 2026-10-29

### Changed
- **Frozen layers behave as in classic CAD**: their objects are hidden (they used to show in grey), give no object
  snaps, cannot be selected and do not plot. A block inserted on a frozen layer is hidden whole when opening DXF/DWG
  files, even the parts that are on other layers.
- The mobile view's layer list marks frozen layers as "frozen in the drawing".

## [2.11.0] — 2026-10-29

### Added
- More entities come in when opening DXF and DWG files: 3D faces (3DFACE) and subdivision meshes (MESH) as 3D meshes,
  2D filled shapes (SOLID, TRACE) as solid hatches, tables (ACAD_TABLE) with their lines and texts, and old-style
  leaders (LEADER) as polylines.
- **Binary DXF** files open (they used to come in empty, with no message).
- The DWG/DXF reader is checked against a standard sample drawing with about 40 entity types, saved in several
  versions (DWG 2000 and 2018, binary DXF, DXF R12), from the MIT-licensed ACadSharp project.

### Changed
- IMPORT of a DXF and opening a DXF from the working folder also read it in the background thread.

## [2.10.5] — 2026-10-29

### Fixed
- 3D DWG files opened almost empty: their solids, regions and bodies (ACIS) were skipped. They now show as wireframe,
  from the edges the DWG stores with each one (also inside blocks), on their layer and color. Their faces are not
  read yet, so hidden and shaded styles show the same edges.
- POLYLINE with vertices (old-style 2D polylines with arcs and widths, 3D polylines, polyface and M×N meshes) were
  skipped when opening DXF and DWG files; the meshes now come in as 3D meshes.
- A drawing saved looking in 3D or from a side opens with that view (the active viewport's direction and center),
  not only plan views.
- In the mobile view one finger orbits drawings with real depth (like the edges of a 3D DWG), not only solids.

## [2.10.4] — 2026-10-29

### Fixed
- Some DWG files failed with "… is not a DXF subclass" on the published site: the build renamed the classes that the
  DWG reader looks up by name. Class names are now kept.
- Opening a DWG on a phone could count seconds forever: converting it took more than 400 MB, and the reader thread ran
  out of memory and stopped without a message. The conversion now writes straight to bytes and the drawing is
  interpreted in the background thread too, so a 3.5 MB DWG needs well under 150 MB and opens faster.
- Large DXF files are also read in the background thread (the phone no longer freezes while opening them), with a
  lighter reader.
- The mobile view's menu shows the version, so you can check that the phone has the latest one.

## [2.10.3] — 2026-10-28

### Fixed
- Opening a DXF or DWG showed an empty screen: the view was fitted before the new drawing was drawn. It now opens on
  the view the drawing was saved with (as in classic CAD), or on the whole drawing if there is none.
- DWG files are read in a background thread: the screen keeps responding, the mobile view counts the seconds, and a
  file that takes more than 3 minutes is stopped with a message instead of "Reading DWG…" forever.
- Rectangles inside blocks inserted rotated or out of plan could not be drawn (they kept the rectangle type after
  becoming a polyline).
- The mobile view shows, together with the result of opening, what could not be imported.

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
