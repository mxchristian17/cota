# Command reference

Every command can be typed in the command line (aliases too) or picked from the menus. Type `HELP` inside Cota for the same list.

## File menu

| Command | Aliases | What it does |
| --- | --- | --- |
| `NEW` | — | Start a new empty drawing (asks to save the changes first) |
| `OPEN` | — | Open a drawing: from the working folder / cloud list, or from the device (.cota, .dxf, .dwg, .stl, .obj, .step, .iges) |
| `OPENFOLDER` | `FOLDER`, `WORKSPACE` | Choose a system folder to open and save drawings as files |
| `SAVE` | `QSAVE`, `SAVEAS` | Save the current drawing: working folder, your account, or a downloaded .cota file |
| `CLOUD` | `CLOUDSTORAGE` | Store drawings in your account again (detach the local folder) |
| `IMPORT` | `IMP` | Import geometry from an OBJ or DXF file |
| `EXPORT` | `EXP` | Export the drawing to OBJ (3D mesh), DXF (2D) or DWG (2D) |
| `PAGESETUP` | — | Page setup of the current layout (paper, orientation, margins, plot style) |
| `PLOT` | `PRINT` | Plot to a vector PDF from a dialog with preview: paper, orientation, area (Extents/Display/Window), scale, plot style; a layout plots 1:1 with its page setup |
| `PUBLISH` | — | Publish layouts to a multi-page PDF [All/Current or layout names] |
| `DWGPROPS` | — | Drawing properties: title, subject, author, keywords and custom properties (used by fields) |
| `UNITS` | `UN` | Set the drawing units: millimeters, centimeters, meters, inches or feet |
| `TEMPLATE` | — | Drawing template: save it, open one, make the current settings the default for new drawings, or clear it |
| `PURGE` | `PU`, `-PURGE`, `-PU` | Remove unused blocks, dimension styles, layers and linetypes [Blocks/Dimstyles/LAyers/LTypes/All] |
| `LOGIN` | — | Sign in to save and load drawings |

## Edit menu

| Command | Aliases | What it does |
| --- | --- | --- |
| `UNDO` | `U` | Undo the last command |
| `REDO` | — | Redo the last undone command |
| `CUTCLIP` | — | Copy objects to the clipboard and erase them (Ctrl+X) |
| `COPYCLIP` | — | Copy objects to the clipboard (Ctrl+C) |
| `COPYBASE` | — | Copy objects to the clipboard with a base point (Ctrl+Shift+C) |
| `PASTECLIP` | — | Paste the clipboard at an insertion point (Ctrl+V) |
| `PASTEORIG` | — | Paste the clipboard at its original coordinates |
| `SELECTALL` | — | Select all objects (Ctrl+A) |
| `SELECT` | `SE` | Select objects |
| `SELECTSIMILAR` | — | Select every object of the same type and layer as the selected ones |
| `QSELECT` | — | Quick Select: select objects by type and property (layer, linetype, length, radius, area, text…) in a dialog |
| `ERASE` | `E` | Erase selected objects |

## View menu

| Command | Aliases | What it does |
| --- | --- | --- |
| `REDRAW` | `REGEN`, `RE`, `R` | Refresh/regenerate the display of all viewports |
| `ZOOM` | `Z` | Zoom: window, scale (n, nX, nXP), All/Center/Dynamic/Extents/Previous/Scale/Window/Object, Enter = real time |
| `PAN` | `P` | Real-time pan: drag with the left button (Esc or Enter to exit) |
| `-PAN` | `-P` | Pan by a displacement or from a base point to a second point |
| `3DORBIT` | `3DO`, `ORBIT` | Constrained orbit: drag to turn the view around the target, keeping the Z axis up |
| `3DFORBIT` | — | Free orbit: drag to turn the view in any direction (it may roll) |
| `3DCORBIT` | — | Continuous orbit: drag and release to keep the view spinning; click to stop |
| `3DPAN` | — | Real-time pan in a 3D view |
| `3DZOOM` | — | Real-time zoom in a 3D view |
| `VIEW` | `V`, `-VIEW`, `-V` | Views: standard (Top/Front/…/NWiso) and named views (?/Delete/Orthographic/Restore/Save/Window) |
| `PLAN` | — | Plan view of a UCS [Current ucs/Ucs/World] |
| `PERSPECTIVE` | — | Perspective projection |
| `ORTHOGRAPHIC` | — | Orthographic projection |
| `VPORTS` | `VP` | Viewport layout [1/2/3/4] |
| `MVIEW` | `MV` | Create layout viewports [ON/OFF/Fit/Shadeplot/Lock/Object/Polygonal/2/3/4] |
| `MSPACE` | `MS` | Switch to model space through a layout viewport |
| `PSPACE` | `PS` | Switch from a layout viewport back to paper space |
| `VPMAX` | — | Maximize a layout viewport temporarily (VPMIN restores it) |
| `VPMIN` | — | Restore the maximized layout viewport |
| `VPCLIP` | — | Clip a layout viewport with a closed object or polygon [Polygonal/Delete] |
| `VPLAYER` | — | Layer visibility per layout viewport [?/Freeze/Thaw/Reset/Newfrz/Vpvisdflt] |
| `VSCURRENT` | `VS` | Set the visual style of the active viewport [2Dwireframe/3Dwireframe/Shaded/shadedEdges/Hidden] |
| `SHADEMODE` | `SHA`, `-SHADEMODE` | Set the shading of the active viewport [2D wireframe/3D wireframe/Hidden/Flat/Gouraud/fLat+edges/gOuraud+edges] |
| `FULLSCREEN` | `FS` | Toggle full screen (no browser or system bars); remembered for next time |
| `CLEANSCREENON` | — | Clean screen: hide toolbars and palettes (Ctrl+0) |
| `CLEANSCREENOFF` | — | Restore toolbars and palettes (Ctrl+0) |
| `COMMANDLINE` | — | Show the full command line window (Ctrl+9) |
| `COMMANDLINEHIDE` | — | Compact command line: input row only (Ctrl+9) |
| `NAVVCUBE` | — | Show or hide the view cube [ON/OFF] |
| `UCSICON` | — | UCS icon [ON/OFF/All/Noorigin/ORigin] |
| `ATTDISP` | — | Attribute visibility [Normal/ON/OFF] |
| `MOBILEVIEW` | — | Switch to the phone view for the job site (open, orbit, measure, visual styles) [ON/OFF] |

## Insert menu

| Command | Aliases | What it does |
| --- | --- | --- |
| `INSERT` | `I`, `DDINSERT` | Insert a block reference |
| `LAYOUT` | `LO` | Manage layouts [Copy/Delete/New/Template/Rename/SAveas/Set/?] |
| `VIEWBASE` | — | Create a base view of the model in a layout, then its projected views |
| `VIEWGEN` | — | Generate the Monge views of a part at once (choose them on a diagram, ISO-E or ISO-A) |
| `VIEWPROJ` | — | Create projected views from an existing drawing view |
| `VIEWEDIT` | — | Edit a drawing view: hidden lines and scale |
| `VIEWUPDATE` | — | Update drawing views that are out of date with the model |
| `VIEWSTD` | `-VIEWSTD` | Drafting standard of drawing views: first-angle or third-angle projection |
| `FIELD` | — | Insert a field (file name, dates, drawing properties, layout, sheet, viewport scale) into text |
| `UPDATEFIELD` | — | Update the fields of the selected objects |

## Format menu

| Command | Aliases | What it does |
| --- | --- | --- |
| `LAYER` | `LA`, `DDLMODES` | Open the Layer Properties Manager (create, rename, color, lineweight, plot…) |
| `LAYMCUR` | — | Make the layer of a selected object current |
| `LAYISO` | — | Isolate the layers of the selected objects: the other layers are turned off (LAYUNISO restores) |
| `LAYUNISO` | — | Restore the layers turned off by the last LAYISO |
| `LAYOFF` | — | Turn off the layer of the selected objects |
| `LAYON` | — | Turn on all layers |
| `LAYFRZ` | — | Freeze the layer of the selected objects |
| `LAYTHW` | — | Thaw all layers |
| `LAYLCK` | — | Lock the layer of the selected object |
| `LAYULK` | — | Unlock the layer of the selected object |
| `COLOR` | `COL`, `COLOUR`, `-COLOR`, `CECOLOR` | Color of new objects (CECOLOR): ByLayer, index 1-255, name, #rrggbb or r,g,b |
| `LINETYPE` | `LT`, `LTYPE`, `DDLTYPE` | Linetype Manager: load linetypes, set the current one and the scale factors |
| `LWEIGHT` | `LW`, `LINEWEIGHT`, `-LWEIGHT`, `CELWEIGHT` | Lineweight of new objects (CELWEIGHT): ByLayer, Default or a width in mm [?] |
| `DIMSTYLE` | `D`, `DST`, `DDIM`, `DIMSTY` | Dimension Style Manager: create, modify, override and set the current dimension style |
| `MLEADERSTYLE` | `MLS` | Multileader style: multileaders use the leader arrow (DIMLDRBLK), arrow size and text of the dimension style |
| `LIMITS` | — | Set the drawing limits (lower left, upper right) and turn the limits check ON/OFF |

## Tools menu

| Command | Aliases | What it does |
| --- | --- | --- |
| `TOOLBAR` | `TO`, `TBCONFIG` | Show or hide toolbars (dialog with the list of toolbars) |
| `OPTIONS` | `OP` | UI settings: theme and colors (background/grid/crosshair) |
| `OSNAP` | `OS`, `-OSNAP`, `DDOSNAP` | Configure running object snaps (endpoint, center, quadrant, intersection, …) |
| `GRID` | — | Show or hide the grid [ON/OFF] (F7) |
| `UCS` | — | User coordinate system [Face/NAmed/OBject/Previous/View/World/X/Y/Z/ZAxis] |
| `DIST` | `DI` | Measure distance and angle between two points |
| `ID` | — | Display the coordinates of a point in the current UCS |
| `AREA` | `AA` | Area and perimeter of points or of an object [Object/Add area/Subtract area]; Add/Subtract keep a running total |
| `LIST` | `LI`, `LS` | List the properties of the selected objects: type, layer, points, lengths, areas, volumes |
| `MASSPROP` | — | Mass properties of solids: volume (mass with density 1), surface area, bounding box and centroid |
| `GROUP` | `G` | Group the selected objects so they are selected together [Name/Description]; UNGROUP breaks a group |
| `UNGROUP` | — | Break up the group of a picked object [Name] |
| `ISOLATEOBJECTS` | `ISOLATE` | Temporarily hide everything except the selected objects (UNISOLATEOBJECTS shows them again) |
| `HIDEOBJECTS` | — | Temporarily hide the selected objects (UNISOLATEOBJECTS shows them again) |
| `UNISOLATEOBJECTS` | `UNISOLATE` | Show again the objects hidden by ISOLATEOBJECTS or HIDEOBJECTS |
| `AGENT` | `AGENTPANEL` | Open or close the modeling agent panel: a conversation with an LLM (your own API key) that runs Cota for you |
| `COMPACT` | — | Summarize the agent conversation to free its context (the drawing keeps everything built) |
| `SCRIPT` | `SCR` | Run several commands as one operation (one undo step): type or paste them, load a .scr file or share them as a link |
| `PROMPT` | `AI` | Generate or edit the model with natural language (LLM). Opens a prompt box. |
| `ATTSYNC` | — | Synchronize block references with their redefined attributes [?/Name/Select] |

## Draw menu

| Command | Aliases | What it does |
| --- | --- | --- |
| `LINE` | `L` | Draw connected line segments (closing converts them to a closed polyline) |
| `PLINE` | `PL` | Draw a polyline with straight and arc segments (Arc/Close/Undo) |
| `POLYGON` | `POL` | Draw a regular polygon (center + inscribed/circumscribed radius, or Edge) |
| `RECTANGLE` | `REC`, `RECTANG` | Draw a rectangle by two opposite corners [Dimensions] |
| `ARC` | `A` | Draw an arc: 3 points, or Start/Center/End with Angle, chord Length, Direction or Radius |
| `CIRCLE` | `C` | Draw a circle: center + radius/Diameter, 3P (points or tangents), 2P or Ttr (tan tan radius) |
| `SPLINE` | `SPL` | Draw a spline through control points |
| `ELLIPSE` | `EL` | Draw an ellipse (axis endpoints + other axis distance, or Center) |
| `POINT` | `PO` | Place a point object (its look is set by PDMODE and PDSIZE; it snaps as NODE) |
| `DIVIDE` | `DIV` | Place points that divide an object into equal-length segments |
| `MEASURE` | `ME` | Place points at measured intervals along an object, from the end nearest the pick |
| `BLOCK` | `B` | Create a block definition from selected objects (and insert a reference) |
| `ATTDEF` | `ATT`, `-ATTDEF` | Define a block attribute (tag, prompt, default value, Invisible/Constant/Preset) |
| `HATCH` | `H`, `BH`, `BHATCH` | Fill an enclosed area with a hatch pattern, solid fill or user lines |
| `TEXT` | `DT`, `DTEXT` | Create single-line text on its baseline (Justify: Left/Center/Right); each Enter starts a new line, an empty line finishes. %%c = Ø, %%d = °, %%p = ± |
| `MTEXT` | `MT`, `T` | Create multiline text from its top-left corner (enter lines; empty line finishes). %%c = Ø, %%d = °, %%p = ± |
| `BOX` | — | Create a parametric box (two base corners + height) |
| `CYLINDER` | `CYL` | Create a parametric cylinder (base center + radius + height) |
| `CONE` | — | Create a parametric cone or truncated cone (base center + radius + height + top radius) |
| `SPHERE` | `SPH` | Create a parametric sphere (center + radius) |
| `TORUS` | `TOR` | Create a parametric torus (center + radius + tube radius) |
| `EXTRUDE` | `EXT` | Extrude a closed 2D profile into a solid (a circle becomes a parametric cylinder) |
| `REVOLVE` | `REV` | Revolve closed profiles about an axis into solids [Object/X/Y/Z, STart angle/Reverse] |
| `FLATSHOT` | — | Create a 2D representation of the 3D solids in the current view |
| `SOLPROF` | — | Create profile images of 3D solids for a layout viewport (visible and hidden lines) |

## Dimension menu

| Command | Aliases | What it does |
| --- | --- | --- |
| `DIM` | — | Smart dimension: pick an object (line → linear/aligned, arc → radius, circle → diameter) [Angular/Baseline/Continue/Ordinate/aLign/LAyer/Undo] |
| `QDIM` | — | Quick dimension: chain the selected geometry [Continuous/Staggered/Baseline/Ordinate/Radius/Diameter] |
| `AUTODIM` | `ADIM` | Dimension a part automatically: overall sizes, steps, hole positions, diameters and radii |
| `DIMLINEAR` | `DLI`, `DIMLIN` | Linear dimension (horizontal, vertical or rotated) [Mtext/Text/Angle/Horizontal/Vertical/Rotated] |
| `DIMALIGNED` | `DAL`, `DIMALI` | Aligned dimension [Mtext/Text/Angle] |
| `DIMARC` | `DAR` | Arc length dimension [Mtext/Text/Angle/Partial] |
| `DIMORDINATE` | `DOR` | Ordinate dimension (X or Y datum from the UCS origin) [Xdatum/Ydatum/Mtext/Text/Angle] |
| `DIMRADIUS` | `DRA`, `DIMRAD` | Radius dimension of an arc or circle [Mtext/Text/Angle] |
| `DIMJOGGED` | `DJO`, `JOG` | Jogged radius dimension (center location override) [Mtext/Text/Angle] |
| `DIMDIAMETER` | `DDI`, `DIMDIA` | Diameter dimension of an arc or circle [Mtext/Text/Angle] |
| `DIMANGULAR` | `DAN` | Angular dimension: two lines, an arc, a circle or a vertex and two points [Mtext/Text/Angle] |
| `DIMBASELINE` | `DBA`, `DIMBASE` | Baseline dimensions from the last (or a selected) dimension, spaced by DIMDLI [Select/Undo] |
| `DIMCONTINUE` | `DCO`, `DIMCONT` | Continued dimensions from the last (or a selected) dimension [Select/Undo] |
| `DIMSPACE` | — | Space parallel linear or angular dimensions evenly (0 aligns them) |
| `DIMBREAK` | — | Break dimension and extension lines where they cross other objects (Auto/Manual/Remove) |
| `MLEADER` | `MLD` | Multileader with text (fields allowed), block or no content [leader Landing first/Content first/Options] |
| `QLEADER` | `LE` | Quick leader: points and text (creates a multileader) |
| `LEADER` | `LEAD` | Leader with annotation text (see MLEADER) |
| `MLEADEREDIT` | `MLE` | Add or remove leaders of a multileader [Add leader/Remove leaders] |
| `MLEADERALIGN` | `MLA` | Align multileaders along a direction from a base multileader (current spacing) |
| `DIMCENTER` | `DCE`, `CENTERMARK`, `CM` | Center mark (and center lines with DIMCEN < 0) of an arc or circle |
| `CENTERLINE` | — | Associative center line between two lines |
| `THREAD` | `COSMETICTHREAD` | Cosmetic thread (ISO/IRAM): 3/4 arc on a circle or thread texture on a cylindrical face, nearest standard size and optional leader |
| `DIMINSPECT` | — | Add or remove inspection information (label, value, inspection rate) on dimensions |
| `DIMJOGLINE` | `DJL` | Add or remove a jog line on a linear or aligned dimension |
| `DIMEDIT` | `DED`, `DIMED` | Edit dimension text and extension lines: Home, New text, Rotate text, Oblique extension lines |
| `DIMTEDIT` | `DIMTED` | Move or rotate dimension text: new location, Left, Right, Center, Home or Angle |
| `DIMOVERRIDE` | `DOV`, `DIMOVER` | Override dimension variables on selected dimensions, or Clear their overrides |
| `DIMREASSOCIATE` | `DRE` | Associate the definition points of dimensions with geometry (pick a point on an object; Enter skips) |
| `DIMDISASSOCIATE` | `DDA` | Remove the associativity of the selected dimensions |
| `DIMREGEN` | — | Update all associative dimensions |

## Modify menu

| Command | Aliases | What it does |
| --- | --- | --- |
| `PROPERTIES` | `PR`, `CH`, `MO`, `DDMODIFY`, `PROPS`, `SIDEBAR`, `HIDESIDEBAR` | Show/hide the Properties palette (movable, dockable) |
| `MATCHPROP` | `MA`, `PAINTER` | Copy properties (layer, linetype, linetype scale, text, dimension, hatch, polyline) from one object to others |
| `PEDIT` | `PE` | Edit polylines: join (with fuzz), width, vertices, fit/spline curves, decurve, linetype generation, reverse |
| `HATCHEDIT` | `HE` | Edit a hatch: pattern, scale, angle, island style, origin, associativity, boundary |
| `ATTEDIT` | `ATE`, `-ATTEDIT` | Edit the attribute values of a block reference (command line) |
| `EATTEDIT` | — | Enhanced Attribute Editor: edit the attributes of a block reference in a dialog |
| `COPY` | `CO`, `CP` | Copy selected objects (repeats until Esc) |
| `MIRROR` | `MI` | Mirror selected objects about an axis defined by two points |
| `OFFSET` | `O` | Create concentric circles, parallel lines and parallel curves |
| `ARRAY` | `AR` | Array selected objects [Rectangular/Polar] |
| `MOVE` | `M` | Move selected objects |
| `ROTATE` | `RO` | Rotate selected objects about a base point (Copy/Reference) |
| `SCALE` | `SC` | Scale selected objects about a base point (factor or Reference) |
| `STRETCH` | `S` | Stretch objects crossed by a window (vertices inside the window move) |
| `LENGTHEN` | `LEN` | Change the length of objects and the included angle of arcs |
| `TRIM` | `TR` | Trim objects to meet the edges of other objects (shift-select extends) |
| `EXTEND` | `EX` | Extend objects to meet the edges of other objects (shift-select trims) |
| `BREAKATPOINT` | — | Break the selected object at a single point |
| `BREAK` | `BR` | Break the selected object between two points |
| `JOIN` | `J` | Join lines, arcs, polylines and splines into a single object |
| `CHAMFER` | `CHA` | Bevel the edges of objects |
| `FILLET` | `F` | Round and fillet the edges of objects |
| `ALIGN` | `AL` | Align objects with other objects using source/destination point pairs |
| `UNION` | `UNI` | Boolean union of solids |
| `SUBTRACT` | `SU` | Boolean subtraction of solids |
| `INTERSECT` | `IN` | Boolean intersection of solids |
| `SLICE` | `SL` | Slice solids with a plane, keeping one side or both |
| `FILLETEDGE` | — | Round and fillet the edges of solid objects |
| `CHAMFEREDGE` | — | Bevel the edges of solid objects |
| `EXPLODE` | `X` | Explode block references, polylines and hatches into their component objects |

## Help menu

| Command | Aliases | What it does |
| --- | --- | --- |
| `HELP` | `?` | List available commands |
| `ABOUT` | — | Show the Cota version, author and license |

## Command-line versions

Dash versions run without dialogs, for scripts and power users.

| Command | Aliases | What it does |
| --- | --- | --- |
| `-GROUP` | `-G` | Groups from the command line [?/Add/Remove/Explode/REName/Selectable/Create] |
| `-TOOLBAR` | `-TO` | Show, hide, dock or float a toolbar from the command line (or ALL toolbars) |
| `-PLOT` | `-PRINT` | Plot to PDF right away with the last PLOT settings (no dialog) |
| `-DIMSTYLE` | — | Dimension styles from the command line [ANnotative/Save/Restore/STatus/Variables/Apply/?] |
| `-LAYER` | `-LA` | Layers from the command line: ?/Make/Set/New/Rename/ON/OFF/Color/Ltype/LWeight/Plot/Freeze/Thaw/LOck/Unlock |
| `-LINETYPE` | `-LT` | Linetypes from the command line: ?, Create, Load, Set |
| `-HATCH` | `-H`, `-BHATCH` | Hatch from the command line (Properties, Select objects, Advanced, Origin) |
| `-HATCHEDIT` | `-HE` | Edit a hatch from the command line |
| `-OPEN` | — | Open a drawing from the command line [Device/List] |

## System variables

Type the name to see or change the value.

| Variable | What it controls |
| --- | --- |
| `OFFSETGAPTYPE` | Gap fill when offsetting polylines: 0 extend, 1 fillet, 2 chamfer |
| `POLARANG` | Polar tracking angle increment in degrees (POLAR / F10 tracks multiples of it from the base point) |
| `PICKSTYLE` | Group selection: 1 = picking a grouped object selects its group, 0 = single objects (Ctrl+Shift+A toggles) |
| `ZOOMFACTOR` | Mouse wheel zoom step (3–100) |
| `RENDERMINPX` | Draw solids smaller than this many pixels as a point (0 = off) |
| `ZOOMWHEEL` | Mouse wheel direction: 0 = forward zooms in, 1 = forward zooms out |
| `PDMODE` | Point style: 0 dot, 1 none, 2 plus, 3 cross, 4 tick; add 32 for a circle and 64 for a square |
| `PDSIZE` | Point size: 0 = 5% of the view, negative = % of the view, positive = drawing units |
| `DIMTEXTSIZE` | Set the dimension text height for new dimensions (DIMTXT override) |
| `DIMASSOC` | Associativity of new dimensions: 2 = associative, 1 = non-associative |
| `CANNOSCALE` | Annotation scale of model space (annotative dimensions keep their paper size): 1:1, 1:50, 1:100… |
| `DIMCLRD` | Dimension variable: Dimension line color |
| `DIMLWD` | Dimension variable: Dimension line lineweight |
| `DIMDLE` | Dimension variable: Extend beyond ticks |
| `DIMDLI` | Dimension variable: Baseline spacing |
| `DIMSD1` | Dimension variable: Suppress dim line 1 |
| `DIMSD2` | Dimension variable: Suppress dim line 2 |
| `DIMCLRE` | Dimension variable: Extension line color |
| `DIMLWE` | Dimension variable: Extension line lineweight |
| `DIMEXE` | Dimension variable: Extend beyond dim lines |
| `DIMEXO` | Dimension variable: Offset from origin |
| `DIMFXLON` | Dimension variable: Fixed length extension lines |
| `DIMFXL` | Dimension variable: Fixed length |
| `DIMSE1` | Dimension variable: Suppress ext line 1 |
| `DIMSE2` | Dimension variable: Suppress ext line 2 |
| `DIMBLK1` | Dimension variable: First arrowhead |
| `DIMBLK2` | Dimension variable: Second arrowhead |
| `DIMLDRBLK` | Dimension variable: Leader arrowhead |
| `DIMASZ` | Dimension variable: Arrow size |
| `DIMCEN` | Dimension variable: Center marks (− = lines) |
| `DIMARCSYM` | Dimension variable: Arc length symbol |
| `DIMJOGANG` | Dimension variable: Radius jog angle |
| `DIMCLRT` | Dimension variable: Text color |
| `DIMTFILL` | Dimension variable: Fill color |
| `DIMTXT` | Dimension variable: Text height |
| `DIMGAP` | Dimension variable: Offset from dim line (− = box) |
| `DIMTAD` | Dimension variable: Text placement vertical |
| `DIMJUST` | Dimension variable: Text placement horizontal |
| `DIMTIH` | Dimension variable: Text inside horizontal |
| `DIMTOH` | Dimension variable: Text outside horizontal |
| `DIMATFIT` | Dimension variable: Fit options |
| `DIMTIX` | Dimension variable: Always keep text between ext lines |
| `DIMSOXD` | Dimension variable: Suppress arrows if they do not fit |
| `DIMTMOVE` | Dimension variable: Text placement when moved |
| `DIMTOFL` | Dimension variable: Draw dim line between ext lines |
| `DIMSCALE` | Dimension variable: Use overall scale of |
| `DIMLUNIT` | Dimension variable: Unit format |
| `DIMDEC` | Dimension variable: Precision |
| `DIMDSEP` | Dimension variable: Decimal separator |
| `DIMRND` | Dimension variable: Round off |
| `DIMPOST` | Dimension variable: Prefix / suffix (<> = value) |
| `DIMLFAC` | Dimension variable: Measurement scale factor |
| `DIMZIN` | Dimension variable: Zero suppression (4 leading, 8 trailing) |
| `DIMAUNIT` | Dimension variable: Angular units |
| `DIMADEC` | Dimension variable: Angular precision |
| `DIMAZIN` | Dimension variable: Angular zero suppression |
| `DIMALT` | Dimension variable: Display alternate units |
| `DIMALTF` | Dimension variable: Multiplier for alt units |
| `DIMALTD` | Dimension variable: Alt precision |
| `DIMALTRND` | Dimension variable: Alt round off |
| `DIMAPOST` | Dimension variable: Alt prefix / suffix |
| `DIMALTU` | Dimension variable: Alt unit format |
| `DIMALTZ` | Dimension variable: Alt zero suppression |
| `DIMTOL` | Dimension variable: Tolerances (deviation) |
| `DIMLIM` | Dimension variable: Limits |
| `DIMTP` | Dimension variable: Upper value |
| `DIMTM` | Dimension variable: Lower value |
| `DIMTDEC` | Dimension variable: Precision |
| `DIMTFAC` | Dimension variable: Scaling for height |
| `DIMTOLJ` | Dimension variable: Vertical position |
| `DIMTZIN` | Dimension variable: Zero suppression |
| `UCSORTHO` | Orthographic views set their orthographic UCS (0/1) |
| `UCSFOLLOW` | Plan view whenever the UCS changes (0/1) |
| `UCSDETECT` | Dynamic UCS on planar faces of solids (0/1) |
| `LTSCALE` | Global linetype scale factor |
| `CELTSCALE` | Linetype scale of new objects |
| `CELTYPE` | Linetype of new objects (ByLayer, ByBlock or a loaded linetype) |
| `PSLTSCALE` | Paper space linetype scaling in layout viewports (0/1) |
| `MSLTSCALE` | Scale model space linetypes by the annotation scale (0/1) |
| `PLINEGEN` | Linetype pattern continuous around polyline vertices (0/1) |
| `HPNAME` | Default hatch pattern name |
| `HPSCALE` | Default hatch pattern scale |
| `HPANG` | Default hatch pattern angle (degrees) |
| `HPSPACE` | Line spacing of user defined hatches |
| `HPASSOC` | New hatches are associative (0/1) |
| `HPDOUBLE` | User defined hatches are double hatched (0/1) |
| `HPISLANDDETECTION` | Island detection of new hatches: 0 Normal, 1 Outer, 2 Ignore |
| `PEDITACCEPT` | PEDIT converts lines and arcs to polylines without asking (0/1) |
| `SPLINETYPE` | PEDIT Spline curve: 5 quadratic, 6 cubic B-spline |
| `SPLINESEGS` | Segments per span of a spline-fit polyline |
