# Layouts, drawing views and plotting

Drawing sheets, viewports, views generated from the 3D model, title blocks and PDF output.

A **layout** is a drawing sheet. Click the **Layout1** tab (or **+** to add one; `LAYOUT` manages them).

- **Page setup:** `PAGESETUP` — paper size, orientation, margins, plot style (color or monochrome).
- **Viewports:** `MVIEW` opens windows onto the model at a scale; `MSPACE` / `PSPACE` (or double-click
  inside / outside a viewport) switch between working in the model and on the sheet. `VPMAX` / `VPMIN`,
  `VPCLIP` and `VPLAYER` (per-viewport layer visibility) complete the set.
- **Title block:** each new layout comes with a frame and a title block whose fields (file name, sheet
  `n OF m`, date, drawing properties) fill themselves. Save and reuse sheets as `.cotat` templates.
- **Drawing views from the 3D model:** `VIEWBASE` places a base view and its projected views (orthographic
  and isometric), with hidden lines and optional shading; choose first- or third-angle projection with
  `VIEWSTD`. `VIEWPROJ` adds more projected views, `VIEWEDIT` changes a view (scale, hidden lines) and
  `VIEWUPDATE` regenerates views after the model changes.
- **Plot:** `PLOT` opens the plot dialog with a **preview** of the sheet and exports a **vector PDF** with
  lineweights, linetypes, hatches and shading. For the model choose paper size, orientation, plot area (Extents,
  Display or a Window you pick), scale (fit to paper or 1:n), centering, plot style (color, monochrome, grayscale)
  and lineweights; a layout plots at 1:1 with its page setup. `-PLOT` plots right away with the last settings, and
  `PUBLISH` exports several layouts to one multi-page PDF.

**See also:** [Insert commands › drawing views](../reference/insert.md#viewbase) · [View commands › layout viewports](../reference/view.md#mview) · [PLOT](../reference/file.md#plot)
