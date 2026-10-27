# Changelog

All notable changes to Cota are documented here. The project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
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
- Default lighting follows the camera (two distant lights), so faces with different orientations never share
  the same shade.

### Changed
- React 19; @eslint/js 10 and current typescript-eslint; GitHub Actions on their current major versions.
- Development toolchain updated: Vite 8, Vitest 5, ESLint 10, Playwright 1.64, @vitejs/plugin-react 6. No known
  vulnerabilities in the development dependencies either (`npm audit`: 0).
- Dependabot opens one grouped pull request per ecosystem and month; three.js and its CSG libraries are upgraded
  by hand, with tests.

### Fixed
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
