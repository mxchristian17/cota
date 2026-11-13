# Files

Formats Cota opens and saves, and where drawings are stored.

| Format | Open | Save / export | Notes |
| --- | --- | --- | --- |
| `.cota` | `OPEN` | `SAVE` | Native format (JSON). Keeps everything: model, layouts, layers, styles, views |
| `.dxf` | `OPEN`, `IMPORT` | `EXPORT DXF` | Geometry, layers, linetypes, hatches, dimensions, blocks (kept as Cota blocks, with their attributes), layouts on open; see [DWG and DXF coverage](../dwg-coverage.md) |
| `.png`, `.jpg`… | with the drawing, `IMAGE`, or by dropping them | — | The pictures a DXF or DWG uses (it stores only their path): choose them together with the drawing in `OPEN`, drop them on Cota, or press **Load…** in the picture's properties (`IMAGE`). From the working folder, the ones next to the drawing load on their own. They are saved inside the `.cota` |
| `.dwg` | `OPEN`, `IMPORT` | `EXPORT DWG` | Opened and saved in the browser; the file is not uploaded. 3D solids stored as ACIS data open as meshes. See [DWG and DXF coverage](../dwg-coverage.md) |
| `.step`, `.iges` | `OPEN` | — | 3D models, read with OpenCascade, which loads only when you open one of these files |
| `.stl` | `OPEN` | — | 3D meshes |
| `.obj` | `IMPORT` | `EXPORT OBJ` | 3D meshes |
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
