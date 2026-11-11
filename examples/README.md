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

## Slider-crank with rod ends — 3D assembly

| File | What it is |
| --- | --- |
| `biela-manivela.cota` | The assembly: 27 solids on Spanish-named layers (`BANCADA`, `MANIVELA`, `BIELA`, `CABEZAS`, `ARO_INT`…) |
| `biela-manivela.png` | Isometric view, shaded with edges |

**What it is:** an in-line slider-crank, crank radius 50 and connecting rod 200 between centers (L/r = 4), shown with
the crank at 60°. The rod has a rod end with a spherical plain bearing at each end, bolted to the crank and to a
slider that runs on two Ø12 guide shafts.

**Parts and sizes (mm):**
- **Rod ends:** ISO 12240-4, dimension series E, type F (female thread M10): d 10, d2 29 (eye), C1 7 (eye width),
  h1 43 (center to end of shank), l3 20 (thread length), d5 19 with W 17 wrench flats. Source: Schaeffler catalogue
  HG 1, rod ends GIR..-DO, pp. 266–267 (row d = 10).
- **Spherical plain bearing:** GE 10 E (ISO 12240-1): d 10, D 19, B 9, C 6, dk 16, r min 0.3. Source: SKF catalogue of
  spherical plain bearings, pp. 104–105. The inner ring is a Ø16 sphere minus two caps at ±4.5 and a Ø10 bore; its
  sphere-to-face edges carry the catalogue's 0.3 edge radius (`FILLETEDGE R 0.3`, *Loop*).
- **Fasteners:** ISO 4017 M10×40 hex bolts (s 16, k 6.4, 30° chamfer on the head), ISO 4032 M10 nuts (s 16, m 8.4,
  30° chamfer on both faces), ISO 7089 washers (10.5/20/2), ISO 4035 M10 jam nuts (s 16, m 5) on the rod, and
  Ø12 × 3 spacers against the inner rings (abutment 11.7–13.2 from the bearing table).
- **Crank:** 10 thick, Ø40 hub on a Ø20 shaft, Ø24 boss at the crank pin, R1 rounded outline, C0.5 on the holes.
- **Rod:** Ø14 bar with M10 ends screwed 18 into the rod ends; C0.5 on the shoulders, C1 at the thread starts.
- **Slider and frame:** 60 × 50 × 30 slider with two Ø12 bores and an M10 tapped hole; 410 × 140 × 12 base plate
  (R5 corners, C1 top edge), shaft support and guide supports with R2–R3 corners, C1 top edges and C0.5–C1 on the
  holes; C0.5 on the ends of the guide shafts, C1 on the crank shaft.

**How it was made** (everything typed in the command line):

1. **Layers:** one per part family, `-LAYER M <name> C <#rrggbb> <name> ↵`.
2. **Blocks:** `BOX #-80,-70,-12 #330,70,-12 12` (base plate), `BOX` + `CYLINDER` + `SUBTRACT` for the supports and the
   slider. Horizontal bores with the *Axis endpoint* option: `CYLINDER #99,-15,35 6 A #116,-15,35`.
3. **Crank from regions:** `CIRCLE` R20 and R12 at the hub and the pin, a `PLINE` along the two outer tangents,
   `REGION`, `UNION`, `EXTRUDE 10`, then `SUBTRACT` the Ø20 and Ø10.5 holes.
4. **Bearing:** `SPHERE` R8, `SUBTRACT` two `BOX`es (the caps) and a `CYLINDER` (the bore); outer ring: `CYLINDER`
   R9.5 × 6 minus the `SPHERE`.
5. **Rod end housing:** built at the origin along +X (eye, neck and collar `CYLINDER`s, `UNION`, flats and thread hole
   with `SUBTRACT`), then `ROTATE` and `MOVE` to each pin.
6. **Hex heads and nuts:** `POLYGON 6 … C 8` + `EXTRUDE`; the 30° chamfer subtracts a ring made of a `CYLINDER` minus a
   truncated `CONE` (base radius, top radius, *Axis endpoint*). Jam nuts are drawn in `UCS ZA` along the rod.
7. **Finishing:** `FILLETEDGE R …` and `CHAMFEREDGE D … …` picking each edge (or the tangent *Chain* of the crank
   outline).
8. View: `-VIEW SEISO`, `VSCURRENT shadedEdges`.

## Bolted splice of two IPE 100 beams — 3D assembly

| File | What it is |
| --- | --- |
| `empalme-ipe100.cota` | The splice: two beams, two end plates and four bolt sets (20 solids) |
| `empalme-ipe100.png` | Isometric view, shaded with edges |

**What it is:** two IPE 100 beams joined end to end with 200 × 100 × 10 end plates and four M10 bolts.

**Parts and sizes (mm):**
- **IPE 100** (EN 10365): h 100, b 55, tw 4.1, tf 5.7, r 7. `MASSPROP` of the section region gives area 1032.32 mm²
  and moments of inertia 1 710 121 mm⁴ (strong axis) and 159 187 mm⁴ (weak axis), the same as the published tables
  (10.3 cm², 171 cm⁴, 15.9 cm⁴).
- **End plates:** 200 × 100 × 10 with four Ø11 holes at ±30 / ±80 (ISO 273 medium clearance for M10). Edge distance 20
  ≥ 1.2·d0 and gauge 60 ≥ 2.4·d0, the minimums of EN 1993-1-8, table 3.3.
- **Bolts:** ISO 4017 M10×40, ISO 4032 nuts, two ISO 7089 washers each. Grip 24, so 7.6 of thread shows past the nut.

**How it was made:**

1. **Plates:** `BOX` with the four holes as `CYLINDER … A …` cutters and `SUBTRACT`.
2. **Profile on the plate face:** `UCS #0,-10,0 ↵`, `UCS X 90`, `PLAN ↵`, then the outline typed with `PLINE`, using
   `A` (tangent arc) at the four root radii and `L` back to lines:
   `PLINE -27.5,-50 27.5,-50 27.5,-44.3 9.05,-44.3 A 2.05,-37.3 L 2.05,37.3 A 9.05,44.3 L 27.5,44.3 27.5,50 -27.5,50
   -27.5,44.3 -9.05,44.3 A -2.05,37.3 L -2.05,-37.3 A -9.05,-44.3 L -27.5,-44.3 C`.
3. **Section and beam:** `REGION L ↵`, `MASSPROP L ↵` (section properties), `EXTRUDE L ↵ 400`. The other beam is the
   same profile in the UCS of the other plate, extruded −400.
4. **Bolts:** hexagons drawn in `UCS X 90` and extruded, shanks with `CYLINDER … A …`, washers and nut holes with
   `SUBTRACT`. `THREAD` on a shank adds the M10 (P 1.5) thread texture and its leader.

## Disc brake — 3D assembly

| File | What it is |
| --- | --- |
| `freno-disco.cota` | Vented and cross-drilled disc, hub with five studs, caliper with four pistons, pads, bracket and bolts (23 solids) |
| `freno-disco.png` | Isometric view, shaded with edges |

**What it is:** a Ø300 × 28 ventilated brake disc (36 radial vanes, cross-drilled in staggered groups of three every
30°) on a hub with five studs on a Ø114.3 circle, and a four-piston caliper over the friction ring.

**How it was made:** the disc is a `PLINE` profile turned with `REVOLVE … Z 360`; the vanes and holes are `BOX` and
`CYLINDER` cutters repeated with `ARRAY P`, joined with `UNION` and removed with `SUBTRACT`. Hub, studs, caliper, pads
and bracket are revolved profiles too (`REVOLVE … ST <start angle> <angle>` for the partial ones), and the bolts are
`POLYGON 6` + `EXTRUDE` joined to their shanks.
