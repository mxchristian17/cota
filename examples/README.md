# Examples

Sample drawings made in Cota by typing commands, the same way a user would. Open a `.cota` file with
`OPEN` (the file picker; with a working folder or an account, pick *Device*). The drawings use Spanish layer names and title blocks (IRAM drafting standard), which is
also a good example of how to set up your own.

`#` before a coordinate means absolute; `↵` means <kbd>Enter</kbd>.

## Bearing support — 3D part and drawing sheet

| File | What it is |
| --- | --- |
| `soporte-rodamiento.cota` | The drawing: 3D solid, dimensioned 2D views and the `Layout1` sheet |
| `soporte-rodamiento.pdf` | `PLOT` of `Layout1` (A3 landscape, 1:1, monochrome) |
| `soporte-rodamiento-lamina.png` | The sheet on screen |
| `soporte-rodamiento-3d.png` | The solid in an isometric view, shaded with edges |

**The part (mm):** a 140 × 60 × 16 base with R10 fillets on its four vertical edges, a 60 × 40 × 40 pedestal,
a Ø70 × 50 hub with its axis at a height of 56, a Ø40 through hole with a 1.5 chamfer, ribs on both sides,
two Ø13 mounting holes at ±55 and a Ø6 lubrication hole.

**How it was made:**

1. **Solid** (layer `PIEZA`):
   - `BOX #-70,-30,0 #70,30 16` and `BOX #-30,-20,16 #30,20 40`.
   - In `VIEW FRONT`: `CYLINDER #0,25,56 35 50` (in the Front view the height grows towards the viewer).
     The rib: `PLINE #30,4,16 #45,4,16 #30,4,42 C`, then `EXTRUDE L ↵ 8`.
   - `MIRROR` the rib and `UNION` everything.
   - Cutters: `CYLINDER #0,40,56 20 80` in Front; `CYLINDER #±55,0,-5 6.5 30` and `CYLINDER #0,0,80 3 20` in Top.
     `SUBTRACT` the four cutters.
2. **Fillets and chamfer:** `FILLETEDGE R 10` on the four vertical edges of the base (the back ones are picked
   after turning to the NW isometric with the view cube, without leaving the command). `CHAMFEREDGE D 1.5 1.5`
   on the edge of the hole.
3. **Views:** `FLATSHOT ↵ E #250,0`, first-angle projection. It creates the `PROJ` and `PROJ-HIDDEN` layers;
   the second one uses a dashed linetype.
4. **Dimensions** (layer `COTAS`): `DIMLINEAR`, `DIMDIAMETER` (with the text `2× <>`) and `DIMRADIUS`.
5. **Sheet** (`Layout1`):
   - A non-plotting `VPORTS` layer (`-LAYER … P N`); `ERASE L` removes the initial viewport.
   - Viewport for the views: `MV #7,53 #297,290`, then `MS`, `ZOOM W …`, `ZOOM 1XP` and `VPLAYER F PIEZA`.
   - Isometric viewport: `MV #300,135 #413,290`, double-click inside, `VPLAYER F PROJ,PROJ-HIDDEN,COTAS`,
     `VIEW ISO`, `ZOOM E`, `ZOOM 1:2XP` and `VS H`; finally `MV S H L` (shade plot: hidden).
   - Notes with `TEXT`, title block with `ATTEDIT`, `PAGESETUP` (monochrome) and `PLOT`.

## Plate in section with hatching — 2D drafting

| File | What it is |
| --- | --- |
| `placa-corte-hatch.cota` | The drawing |
| `placa-corte-hatch.pdf` | `PLOT` of the model: linetypes, hatch and wide polylines in the PDF |
| `placa-corte-hatch.dxf` | `EXPORT DXF`: `LTYPE` table, `HATCH` entity and LWPOLYLINE with widths |
| `placa-corte-hatch.png` | The drawing on screen |
| `placa-corte-hatch-panel.png` | The *Hatch Creation* panel during the command |

**How it was made:**

1. **Layers:** `-LAYER M EJES C 1 EJES L CENTER EJES` (`CENTER` loads from the linetype library by itself);
   the same for `OCULTAS` (color 6, `HIDDEN`) and `CONTORNO` (color 7), which stays current.
2. **Outline:** `RECTANGLE 0,0 @120,60`, `CIRCLE 30,30 12` and `CIRCLE 90,30 12`.
3. **Hatch:** `HATCH` and a click inside the plate: one hatch with the two holes as islands. In the
   *Hatch Creation* panel: pattern `ANSI37`, scale `2`, then *Close Hatch Creation*.
4. **Associativity:** `MOVE` the right hole 8 units up; the hatch follows.
5. **Center and hidden lines** (after hatching, so they do not split the area): on `EJES`,
   `LINE -10,30 #130,30`, `LINE 30,-8 #30,68` and `LINE 90,-8 #90,68`; on `OCULTAS`, `LINE 0,72 #120,72`.
6. **Frame:** four `LINE`s (one starts at 0,4, off the corner), then `PEDIT M` with the four, `Y` to convert them,
   `J` with fuzz `1` (Extend) and `W 0.7`: one closed polyline 0.7 wide.
7. **Arrow:** `PLINE 150,30 W 1 1 #170,30 W 4 0 #178,30`.
8. **Curve:** three `LINE`s in a zigzag; `PEDIT`, click the first, `Y`, `J` with the other two and `F`: a curve of
   arcs through the vertices.
9. **Linetype:** `LINETYPE`, *Load…* `PHANTOM`, *Current*, global scale `0.5`. A new line comes out `PHANTOM`;
   in the palette it is set back to `ByLayer` with scale `2`.
10. **HATCHEDIT:** double-click the hatch; islands *Ignore* and back to *Outer*.

## L bracket — working with 3D user coordinate systems

| File | What it is |
| --- | --- |
| `soporte-L-ucs.cota` | The solid, text on the plate and on the chamfer, dimensions in the Front UCS and the saved UCS "Inclinada" |
| `soporte-L-ucs-iso.png` | Isometric view |
| `soporte-L-ucs-chaflan.png` | Detail of the chamfer with the pocket and the holes |
| `soporte-L-ucs-front.png` | Front view with the dimensions |

**How it was made:**

1. **Base:** `BOX 0,0 @80,50 12`.
2. **Plate:** `VIEW FRONT` activates the Front UCS. The profile with a round head, in view coordinates:
   `PLINE 0,12 @60,0 @0,28 A @-60,0 L C`. `EXTRUDE L ↵ 12` grows towards the viewer.
3. `UNION ALL`.
4. **Ø20 hole in the plate:** `CYLINDER 30,40,1 10 14` in the Front UCS, then `SUBTRACT`.
5. **Ø8 holes in the base, with the dynamic UCS:** `CYLINDER`, click on the top face, `4`, `-14`; then `SUBTRACT`.
6. **Chamfer:** `CHAMFEREDGE D 6 6` on the top right edge of the base.
7. **UCS on the sloped face:** `UCS F` on the chamfer; a 3-point UCS on that face saved with `UCS NA S Inclinada`.
8. **Pocket and text:** `RECTANGLE 5,1.5 @30,5.5`, `EXTRUDE L ↵ 2` and `SUBTRACT`; text on the sloped face;
   `PLAN` shows it face-on.
9. **Dimensions in the Front UCS:** `DIMLINEAR 0,0 0,70 …`, `DIMLINEAR 0,0 80,0 …` and the Ø20 with
   `DIMLINEAR 20,40 @20,0 T ⌀<> …`.
10. **Text "SOPORTE" on the plate:** `TEXT` with the dynamic UCS (click on the front face).
