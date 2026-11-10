# System variables

System variables store settings. Type the name of a variable in the command line to see its value and change it:
Cota prints `Enter new value for NAME <current>:` and <kbd>Enter</kbd> keeps the current value. Most of them are
saved with the drawing; the ones about the interface (mouse, backups) are saved with your preferences.

```text
PDMODE 3
LTSCALE 10
```

## Drawing and editing

| Variable | Values | What it controls |
| --- | --- | --- |
| `POLARANG` | Angle in degrees, default 90 | The increment of polar tracking (<kbd>F10</kbd>): with 30, the cursor locks to 0°, 30°, 60°… from the base point. |
| `OFFSETGAPTYPE` | 0 extend, 1 fillet, 2 chamfer | How OFFSET closes the gaps at the corners of a polyline offset outward. |
| `PICKSTYLE` | 1 groups, 0 single objects | Whether picking an object of a group selects the whole group. <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd> toggles it. |
| `PEDITACCEPT` | 0 ask, 1 convert | Whether PEDIT turns lines and arcs into polylines without asking. |
| `SPLINETYPE` | 5 quadratic, 6 cubic | The curve PEDIT ▸ Spline fits through a polyline. |
| `SPLINESEGS` | Number, default 8 | Segments per span of a spline-fit polyline: more is smoother. |
| `PDMODE` | 0 dot, 1 none, 2 plus, 3 cross, 4 tick; +32 circle, +64 square | The look of point objects (POINT, DIVIDE, MEASURE). 35 = cross in a circle. |
| `PDSIZE` | 0 = 5 % of the view, negative = % of the view, positive = drawing units | The size of point objects. |

## Display and mouse

| Variable | Values | What it controls |
| --- | --- | --- |
| `LWDISPLAY` | ON / OFF | Whether lineweights are shown in the model. Layouts always show them, and plots always use them. |
| `ZOOMFACTOR` | 3 to 100, default 60 | How much each step of the mouse wheel zooms. |
| `ZOOMWHEEL` | 0 forward zooms in, 1 forward zooms out | The direction of the mouse wheel. |
| `RENDERMINPX` | Pixels, default 3 (0 = off) | Solids smaller than this on screen are drawn as a point, to keep huge models fluid. |

## Saving

| Variable | Values | What it controls |
| --- | --- | --- |
| `ISAVEBAK` | 1 on, 0 off | When saving to a working folder, keep the previous version as `name.bak`. |
| `SAVETIME` | Minutes, default 10 (0 = off) | How often Cota writes a recovery copy `name.sv$` in the working folder while the drawing has changes. |

## Coordinate systems

| Variable | Values | What it controls |
| --- | --- | --- |
| `UCSORTHO` | 1 on, 0 off | Whether switching to a standard view (Front, Left…) also sets the matching UCS, so you draw on the plane you see. |
| `UCSFOLLOW` | 0 off, 1 on | Whether changing the UCS also switches to its plan view. |
| `UCSDETECT` | 1 on, 0 off | Dynamic UCS: while a command asks for its first point, hovering a flat face of a solid places the UCS on that face. |

## Linetypes

| Variable | Values | What it controls |
| --- | --- | --- |
| `LTSCALE` | Number, default 1 | Global scale of all linetype patterns. Use the inverse of the plot scale: 50 for a 1:50 drawing in model space. |
| `CELTSCALE` | Number, default 1 | Linetype scale of new objects, multiplied by LTSCALE. |
| `CELTYPE` | ByLayer, ByBlock or a loaded linetype | Linetype of new objects. |
| `PSLTSCALE` | 1 on, 0 off | In layout viewports, linetypes keep their paper size whatever the viewport scale. |
| `MSLTSCALE` | 1 on, 0 off | In model space, linetypes are scaled by the annotation scale (`CANNOSCALE`). |
| `PLINEGEN` | 0 off, 1 on | Whether the linetype pattern of new polylines runs continuously around their vertices. |

## Hatches

| Variable | Values | What it controls |
| --- | --- | --- |
| `HPNAME` | A pattern name, `.` for none | Default pattern of new hatches (ANSI31 at first). |
| `HPSCALE` | Number, default 1 | Default pattern scale. |
| `HPANG` | Degrees, default 0 | Default pattern angle. |
| `HPSPACE` | Drawing units, default 1 | Line spacing of user-defined hatches. |
| `HPDOUBLE` | 0 off, 1 on | Whether user-defined hatches are crossed with a second set of lines at 90°. |
| `HPASSOC` | 1 on, 0 off | Whether new hatches follow their boundary when it changes. |
| `HPISLANDDETECTION` | 0 Normal, 1 Outer, 2 Ignore | How areas inside the boundary are treated: Normal alternates filled and empty, Outer fills only the outer ring, Ignore fills everything. |
| `HPGAPTOL` | Drawing units, default 0 | Gaps up to this size in a boundary are closed by HATCH and BOUNDARY. |

## Annotation

| Variable | Values | What it controls |
| --- | --- | --- |
| `CANNOSCALE` | 1:1, 1:50, 1:100… | The annotation scale of model space: annotative dimensions and texts keep their size on paper at this scale. |
| `DIMASSOC` | 2 associative, 1 not | Whether new dimensions follow the geometry they measure. |
| `DIMTEXTSIZE` | Height | Shortcut to set the text height (`DIMTXT`) of new dimensions. |

## Dimension variables

These variables are the settings of a dimension style. Typing one changes it for **new** dimensions (as an override
of the current style, which Cota confirms: `DIMTAD = Above (override of "IRAM 4513")`); to change a style for good use `DIMSTYLE`, and to change existing dimensions use
`DIMOVERRIDE` or **Properties**. The defaults depend on the style (Cota includes ISO and IRAM styles).

**Lines and arrows**

| Variable | Values | What it controls |
| --- | --- | --- |
| `DIMCLRD` | ByLayer or `#rrggbb` | Color of the dimension line. |
| `DIMLWD` | ByLayer or millimeters | Lineweight of the dimension line. |
| `DIMDLE` | Length | How far the dimension line extends past the extension lines when the arrows are ticks. |
| `DIMDLI` | Length | Spacing between the dimension lines of DIMBASELINE (and of QDIM baseline). |
| `DIMSD1` | On / Off (or 1 / 0) | Hide the first half of the dimension line. |
| `DIMSD2` | On / Off (or 1 / 0) | Hide the second half of the dimension line. |
| `DIMCLRE` | ByLayer or `#rrggbb` | Color of the extension lines. |
| `DIMLWE` | ByLayer or millimeters | Lineweight of the extension lines. |
| `DIMEXE` | Length | How far the extension lines go past the dimension line. |
| `DIMEXO` | Length | Gap between the object and the start of the extension lines. |
| `DIMFXLON` | On / Off (or 1 / 0) | Extension lines of a fixed length (`DIMFXL`), measured from the dimension line. |
| `DIMFXL` | Length | The fixed length of extension lines when `DIMFXLON` is on. |
| `DIMSE1` | On / Off (or 1 / 0) | Hide the first extension line. |
| `DIMSE2` | On / Off (or 1 / 0) | Hide the second extension line. |
| `DIMBLK1` | Arrowhead name | The first arrowhead: `Closed filled`, `Closed filled 4:1 (IRAM)`, `Closed blank`, `Closed`, `Open`, `Open 30`, `Oblique`, `Architectural tick`, `Dot`, `Dot small`, `Dot blank`, `Dot small blank`, `Right angle`, `Box`, `Box filled`, `Datum triangle`, `Datum triangle filled`, `Integral` or `None`. |
| `DIMBLK2` | Arrowhead name | The second arrowhead (names as in `DIMBLK1`). |
| `DIMLDRBLK` | Arrowhead name | The arrowhead of leaders and multileaders. |
| `DIMASZ` | Length | Size of the arrowheads. |
| `DIMCEN` | Length; negative draws lines | Center marks of radius and diameter dimensions and DIMCENTER: positive a cross of that size, negative a cross and center lines, 0 none. |
| `DIMARCSYM` | 0 Preceding text, 1 Above text, 2 None | Where the arc symbol of arc length dimensions goes. |
| `DIMJOGANG` | Degrees | Angle of the jog of jogged radius dimensions. |

**Text**

| Variable | Values | What it controls |
| --- | --- | --- |
| `DIMTXT` | Height | Text height. |
| `DIMCLRT` | ByLayer or `#rrggbb` | Text color. |
| `DIMTFILL` | 0 None, 1 Background | Whether the text has an opaque background that hides lines behind it. |
| `DIMGAP` | Length; negative draws a box | Space between the text and the dimension line. A negative value frames the text (inspection style). |
| `DIMTAD` | 0 Centered, 1 Above, 2 Outside, 4 Below | Vertical position of the text relative to the dimension line. |
| `DIMJUST` | 0 Centered, 1 At ext line 1, 2 At ext line 2, 3 Over ext line 1, 4 Over ext line 2 | Horizontal position of the text along the dimension line. |
| `DIMTIH` | On / Off (or 1 / 0) | Text inside the extension lines always horizontal (instead of aligned with the dimension line). |
| `DIMTOH` | On / Off (or 1 / 0) | Text outside the extension lines always horizontal. |

**Fit**

| Variable | Values | What it controls |
| --- | --- | --- |
| `DIMATFIT` | 3 Either text or arrows (best fit), 1 Arrows, 2 Text, 0 Both text and arrows | What moves outside the extension lines first when there is not enough room. |
| `DIMTIX` | On / Off (or 1 / 0) | Always keep the text between the extension lines. |
| `DIMSOXD` | On / Off (or 1 / 0) | Hide the arrows if they do not fit inside. |
| `DIMTMOVE` | 0 Beside the dimension line, 1 Over with leader, 2 Over without leader | Where the text goes when you move it. |
| `DIMTOFL` | On / Off (or 1 / 0) | Draw the dimension line between the extension lines even when the arrows are outside. |
| `DIMSCALE` | Number | Overall scale of all sizes of the style (text, arrows, gaps). |

**Primary units**

| Variable | Values | What it controls |
| --- | --- | --- |
| `DIMLUNIT` | 2 Decimal, 1 Scientific, 3 Engineering, 4 Architectural, 5 Fractional, 6 Windows desktop | Format of linear values. |
| `DIMDEC` | Number of decimals | Precision of linear values. |
| `DIMDSEP` | A character, such as `,` or `.` | Decimal separator. |
| `DIMRND` | Length | Rounds values to this increment (0.5 rounds to the nearest half). |
| `DIMPOST` | Text with `<>` | Prefix and suffix around the value: `<> mm`, `Ø<>`. |
| `DIMLFAC` | Number | Factor applied to measured lengths (for details drawn at another scale). |
| `DIMZIN` | Sum of 4 (no leading zero) and 8 (no trailing zeros) | Zero suppression: 8 shows `2,5` instead of `2,50`. |
| `DIMAUNIT` | 0 Decimal degrees, 1 Degrees minutes seconds, 2 Gradians, 3 Radians | Format of angles. |
| `DIMADEC` | Number of decimals | Precision of angles. |
| `DIMAZIN` | Like DIMZIN | Zero suppression of angles. |

**Alternate units** (a second value in brackets, for example millimeters and inches)

| Variable | Values | What it controls |
| --- | --- | --- |
| `DIMALT` | On / Off (or 1 / 0) | Show alternate units. |
| `DIMALTF` | Number, 0.0394 for mm to inches | Multiplier from primary to alternate units. |
| `DIMALTD` | Number of decimals | Precision of alternate units. |
| `DIMALTRND` | Length | Rounding of alternate units. |
| `DIMAPOST` | Text with `<>` | Prefix and suffix of alternate units. |
| `DIMALTU` | As DIMLUNIT | Format of alternate units. |
| `DIMALTZ` | As DIMZIN | Zero suppression of alternate units. |

**Tolerances**

| Variable | Values | What it controls |
| --- | --- | --- |
| `DIMTOL` | On / Off (or 1 / 0) | Show deviation tolerances after the value: `25 +0,1/−0,05`. |
| `DIMLIM` | On / Off (or 1 / 0) | Show limits instead: the upper and lower sizes stacked. |
| `DIMTP` | Number | Upper deviation. |
| `DIMTM` | Number | Lower deviation. |
| `DIMTDEC` | Number of decimals | Precision of tolerances. |
| `DIMTFAC` | Number | Height of the tolerance text relative to the value. |
| `DIMTOLJ` | 0 Bottom, 1 Middle, 2 Top | Vertical alignment of tolerances with the value. |
| `DIMTZIN` | As DIMZIN | Zero suppression of tolerances. |

**Example**: dimensions with 1 decimal, a box around the value and the text above the line.

```text
DIMDEC 1
DIMGAP -1
DIMTAD 1
DIMLINEAR 0,0 100,0 50,-10
```
