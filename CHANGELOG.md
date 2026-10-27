# Changelog

All notable changes to Cota are documented here. The project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
