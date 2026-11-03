# DWG and DXF coverage

What happens to each entity type when a DWG or DXF is opened and exported. The list is the ENTITIES section of the official
DXF reference. It was checked against 338 public reference files: the [ACadSharp](https://github.com/DomCR/ACadSharp) samples
kept in this repository as tests, plus the LibreDWG test suite and the ezdxf example and test files (read locally, not kept
here). 329 of them open; the other 9 are DWG files from R11 or earlier.

| Entity | Open | Export | Notes |
|---|---|---|---|
| LINE, POINT, CIRCLE, ARC, ELLIPSE, SPLINE | Native | Native | |
| LWPOLYLINE, POLYLINE (2D and 3D) | Native | Native | Bulges and widths kept |
| POLYLINE (polyface and M×N mesh), 3DFACE, MESH | Mesh | 3DFACE | |
| TEXT, MTEXT, ATTRIB | Native | Native | MTEXT formatting is reduced to plain text |
| ATTDEF | Native in blocks; its tag outside them | As text | |
| HATCH, SOLID, TRACE | Native | Native | |
| DIMENSION | Native | Exploded to lines, arrows and text | |
| ARC_DIMENSION, LARGE_RADIAL_DIMENSION | By their stored block | Exploded | |
| LEADER | Polyline | Polyline | Without the arrow |
| MLEADER (MULTILEADER) | Lines, arrows and text | The same pieces | Block content only from DWG |
| INSERT, ACAD_TABLE | Expanded | Expanded | Blocks are not kept as blocks |
| XLINE, RAY | Native infinite lines | Native | |
| MLINE | One polyline per element | Polylines | Without the style's end caps |
| TOLERANCE | Frame, symbols and text | The same pieces | |
| HELIX | Spline | Spline | From DXF; the DWG reader does not deliver it yet |
| VIEWPORT and paper space | Layouts with their sheet, content and viewports | Not exported | |
| 3DSOLID, REGION, BODY, SURFACE | Edges | Edges | From stored wires or the ACIS model (SAT and SAB); faces are not read yet |
| IMAGE | Frame and file name | Same pieces | The picture is an external file |
| PDF, DWF and DGN UNDERLAY | File name at the insertion point | Text | The content is an external file |
| OLE2FRAME | Frame | Polyline | |
| WIPEOUT | Skipped, with a notice | — | The mask is not applied |
| SHAPE | Point, with a notice | Point | Its drawing is in an external shape file |
| LIGHT, SUN | Ignored | — | Not drawing content |
| ACAD_PROXY_ENTITY, SECTION, POINTCLOUD, COORDINATION MODEL, OLEFRAME | Listed as unsupported on open | — | |

Cota's 3D solids are exported as meshes of their faces (3DFACE), so a part looks the same but stops being a solid.

## Next, by impact

1. Faces of ACIS solids, so 3D drawings can be shaded and not just shown as edges.
2. Blocks and layouts on export (today blocks are expanded and layouts stay out of the file).
3. WIPEOUT masks, which need a draw order for the fills.
4. Proxy entities, by their stored graphics.
