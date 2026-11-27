# Files

Formats Cota opens and saves, and where drawings are stored.

| Format | Open | Save / export | Notes |
| --- | --- | --- | --- |
| `.cota` | `OPEN` | `SAVE` | Native format (JSON). Keeps everything: model, layouts, layers, styles, views |
| `.dxf` | `OPEN`, `IMPORT` | `EXPORT DXF` | Geometry, layers, linetypes, hatches, dimensions, blocks (kept as Cota blocks, with their attributes), layouts on open; see [DWG and DXF coverage](../dwg-coverage.md) |
| `.png`, `.jpg`… | with the drawing, `IMAGE`, or by dropping them | — | The pictures a DXF or DWG uses (it stores only their path): choose them together with the drawing in `OPEN`, drop them on Cota, or press **Load…** in the picture's properties (`IMAGE`). From the working folder, the ones next to the drawing load on their own. They are saved inside the `.cota` |
| `.dwg` | `OPEN`, `IMPORT` | `EXPORT DWG` | Opened and saved in the browser; the file is not uploaded. 3D solids stored as ACIS data open as exact solids (see `SOLIDIMPORT`) and are saved as ACIS solids (see `SOLIDEXPORT`). See [DWG and DXF coverage](../dwg-coverage.md) |
| External references | while opening a `.dwg` or `.dxf` | — | A drawing that uses other drawings (XREF) opens them too: from the working folder, the ones next to the drawing load on their own; for the rest, a window lists each missing reference with the path it was saved with, so you can choose its file (**Browse…**) before the drawing finishes opening, or go on without them (they stay empty) |
| `.step` | `OPEN`, `IMPORT` | `EXPORT STEP` | Exact 3D solids with the assembly tree: each part and subassembly is a block with its name, each instance a block reference with its color. Read and written with OpenCascade (the exact kernel), which loads only when needed; without it, STEP opens as meshes. `IMPORT` adds it to the open drawing on the current layer or as one block. `EXPORT STEP` writes each solid with its exact shape, a name (its block's, or «Solid n») and its color, in the drawing units |
| `.iges` | `OPEN`, `IMPORT` | — | 3D models as meshes, read with OpenCascade, which loads only when you open or import one of these files. `IMPORT` adds them to the open drawing as meshes or as a block |
| `.stl` | `OPEN`, `IMPORT` | — | 3D meshes |
| `.obj` | `OPEN`, `IMPORT` | `EXPORT OBJ` | 3D meshes |
| `.pdf` | — | `PLOT`, `PUBLISH` | Vector output |
| `.cotat` | layout templates | layout templates | Sheets with title block |

**Where drawings are stored:**

- **Download:** with no folder chosen and no account, `SAVE` downloads `name.cota`; `OPEN` opens
  the file picker (with a folder or an account, pick *Device* in its dialog).
- **Working folder:** `OPENFOLDER` (Chrome, Edge and other Chromium browsers) gives Cota access to a folder.
  `SAVE` writes into it, `OPEN` lists its drawings, and the drawing name in the top bar accepts
  `folder/subfolder/name`. Turn on **Autosave** to save the open file every two minutes. Each save keeps the
  previous version as `name.bak` (`ISAVEBAK`), and every `SAVETIME` minutes (10 by default) Cota writes a
  recovery copy `name.sv$` while the drawing has unsaved changes. Open a `.bak` or `.sv$` with `OPEN` to recover it.
- **Account:** with the optional server, `LOGIN` and save to the server (`CLOUD` switches back from a local
  folder to the account).

**See also:** [File commands](../reference/file.md) · [DWG and DXF coverage](../dwg-coverage.md)
