# Command reference

Every command can be typed in the command line (aliases too) or picked from the menus. Type `HELP` inside Cota for the same list.

## File menu

| Command | Aliases | What it does |
| --- | --- | --- |
| [`NEW`](reference/file.md#new) | — | Start a new empty drawing (asks to save the changes first) |
| [`OPEN`](reference/file.md#open) | — | Open a drawing: from the working folder / cloud list, or from the device (.cota, .dxf, .dwg, .stl, .obj, .step, .iges) |
| [`OPENFOLDER`](reference/file.md#openfolder) | `FOLDER`, `WORKSPACE` | Choose a system folder to open and save drawings as files |
| [`SAVE`](reference/file.md#save) | `QSAVE`, `SAVEAS` | Save the current drawing: working folder, your account, or a downloaded .cota file |
| [`CLOUD`](reference/file.md#cloud) | `CLOUDSTORAGE` | Store drawings in your account again (detach the local folder) |
| [`IMPORT`](reference/file.md#import) | `IMP` | Import geometry from an OBJ or DXF file |
| [`EXPORT`](reference/file.md#export) | `EXP` | Export the drawing to OBJ (3D mesh), DXF (2D) or DWG (2D) |
| [`PAGESETUP`](reference/file.md#pagesetup) | — | Page setup of the current layout (paper, orientation, margins, plot style) |
| [`PLOT`](reference/file.md#plot) | `PRINT` | Plot to a vector PDF from a dialog with preview: paper, orientation, area (Extents/Display/Window), scale, plot style; a layout plots 1:1 with its page setup |
| [`PUBLISH`](reference/file.md#publish) | — | Publish layouts to a multi-page PDF [All/Current or layout names] |
| [`DWGPROPS`](reference/file.md#dwgprops) | — | Drawing properties: title, subject, author, keywords and custom properties (used by fields) |
| [`UNITS`](reference/file.md#units) | `UN` | Set the drawing units: millimeters, centimeters, meters, inches or feet |
| [`TEMPLATE`](reference/file.md#template) | — | Drawing template: save it, open one, make the current settings the default for new drawings, or clear it |
| [`PURGE`](reference/file.md#purge) | `PU`, `-PURGE`, `-PU` | Remove unused blocks, dimension styles, layers and linetypes [Blocks/Dimstyles/LAyers/LTypes/All] |
| [`LOGIN`](reference/file.md#login) | — | Sign in to save and load drawings |

## Edit menu

| Command | Aliases | What it does |
| --- | --- | --- |
| [`UNDO`](reference/edit.md#undo) | `U` | Undo the last command |
| [`REDO`](reference/edit.md#redo) | — | Redo the last undone command |
| [`CUTCLIP`](reference/edit.md#cutclip) | — | Copy objects to the clipboard and erase them (Ctrl+X) |
| [`COPYCLIP`](reference/edit.md#copyclip) | — | Copy objects to the clipboard (Ctrl+C) |
| [`COPYBASE`](reference/edit.md#copybase) | — | Copy objects to the clipboard with a base point (Ctrl+Shift+C) |
| [`PASTECLIP`](reference/edit.md#pasteclip) | — | Paste the clipboard at an insertion point (Ctrl+V) |
| [`PASTEORIG`](reference/edit.md#pasteorig) | — | Paste the clipboard at its original coordinates |
| [`SELECTALL`](reference/edit.md#selectall) | — | Select all objects (Ctrl+A) |
| [`SELECT`](reference/edit.md#select) | `SE` | Select objects |
| [`SELECTSIMILAR`](reference/edit.md#selectsimilar) | — | Select every object of the same type and layer as the selected ones |
| [`QSELECT`](reference/edit.md#qselect) | — | Quick Select: select objects by type and property (layer, linetype, length, radius, area, text…) in a dialog |
| [`ERASE`](reference/modify.md#erase) | `E` | Erase selected objects |

## View menu

| Command | Aliases | What it does |
| --- | --- | --- |
| [`REDRAW`](reference/view.md#redraw) | `REGEN`, `RE`, `R` | Refresh/regenerate the display of all viewports |
| [`ZOOM`](reference/view.md#zoom) | `Z` | Zoom: window, scale (n, nX, nXP), All/Center/Dynamic/Extents/Previous/Scale/Window/Object, Enter = real time |
| [`PAN`](reference/view.md#pan) | `P` | Real-time pan: drag with the left button (Esc or Enter to exit) |
| [`-PAN`](reference/view.md#-pan) | `-P` | Pan by a displacement or from a base point to a second point |
| [`3DORBIT`](reference/view.md#3dorbit) | `3DO`, `ORBIT` | Constrained orbit: drag to turn the view around the target, keeping the Z axis up |
| [`3DFORBIT`](reference/view.md#3dforbit) | — | Free orbit: drag to turn the view in any direction (it may roll) |
| [`3DCORBIT`](reference/view.md#3dcorbit) | — | Continuous orbit: drag and release to keep the view spinning; click to stop |
| [`3DPAN`](reference/view.md#3dpan) | — | Real-time pan in a 3D view |
| [`3DZOOM`](reference/view.md#3dzoom) | — | Real-time zoom in a 3D view |
| [`VIEW`](reference/view.md#view) | `V`, `-VIEW`, `-V` | Views: standard (Top/Front/…/NWiso) and named views (?/Delete/Orthographic/Restore/Save/Window) |
| [`PLAN`](reference/view.md#plan) | — | Plan view of a UCS [Current ucs/Ucs/World] |
| [`PERSPECTIVE`](reference/view.md#perspective) | — | Perspective projection |
| [`ORTHOGRAPHIC`](reference/view.md#orthographic) | — | Orthographic projection |
| [`VPORTS`](reference/view.md#vports) | `VP` | Viewport layout [1/2/3/4] |
| [`MVIEW`](reference/view.md#mview) | `MV` | Create layout viewports [ON/OFF/Fit/Shadeplot/Lock/Object/Polygonal/2/3/4] |
| [`MSPACE`](reference/view.md#mspace) | `MS` | Switch to model space through a layout viewport |
| [`PSPACE`](reference/view.md#pspace) | `PS` | Switch from a layout viewport back to paper space |
| [`VPMAX`](reference/view.md#vpmax) | — | Maximize a layout viewport temporarily (VPMIN restores it) |
| [`VPMIN`](reference/view.md#vpmin) | — | Restore the maximized layout viewport |
| [`VPCLIP`](reference/view.md#vpclip) | — | Clip a layout viewport with a closed object or polygon [Polygonal/Delete] |
| [`VPLAYER`](reference/view.md#vplayer) | — | Layer visibility per layout viewport [?/Freeze/Thaw/Reset/Newfrz/Vpvisdflt] |
| [`VSCURRENT`](reference/view.md#vscurrent) | `VS` | Set the visual style of the active viewport [2Dwireframe/3Dwireframe/Shaded/shadedEdges/Hidden] |
| [`SHADEMODE`](reference/view.md#shademode) | `SHA`, `-SHADEMODE` | Set the shading of the active viewport [2D wireframe/3D wireframe/Hidden/Flat/Gouraud/fLat+edges/gOuraud+edges] |
| [`FULLSCREEN`](reference/view.md#fullscreen) | `FS` | Toggle full screen (no browser or system bars); remembered for next time |
| [`CLEANSCREENON`](reference/view.md#cleanscreenon) | — | Clean screen: hide toolbars and palettes (Ctrl+0) |
| [`CLEANSCREENOFF`](reference/view.md#cleanscreenoff) | — | Restore toolbars and palettes (Ctrl+0) |
| [`COMMANDLINE`](reference/view.md#commandline) | — | Show the full command line window (Ctrl+9) |
| [`COMMANDLINEHIDE`](reference/view.md#commandlinehide) | — | Compact command line: input row only (Ctrl+9) |
| [`NAVVCUBE`](reference/view.md#navvcube) | — | Show or hide the view cube [ON/OFF] |
| [`UCSICON`](reference/view.md#ucsicon) | — | UCS icon [ON/OFF/All/Noorigin/ORigin] |
| [`ATTDISP`](reference/view.md#attdisp) | — | Attribute visibility [Normal/ON/OFF] |
| [`MOBILEVIEW`](reference/view.md#mobileview) | — | Switch to the phone view for the job site (open, orbit, measure, visual styles) [ON/OFF] |

## Insert menu

| Command | Aliases | What it does |
| --- | --- | --- |
| [`INSERT`](reference/insert.md#insert) | `I`, `DDINSERT` | Insert a block reference |
| [`IMAGE`](reference/insert.md#image) | `IM` | Load the files of the pictures the drawing uses (a DXF stores only their path) |
| [`LAYOUT`](reference/insert.md#layout) | `LO` | Manage layouts [Copy/Delete/New/Template/Rename/SAveas/Set/?] |
| [`VIEWBASE`](reference/insert.md#viewbase) | — | Create a base view of the model in a layout, then its projected views |
| [`VIEWGEN`](reference/insert.md#viewgen) | — | Generate the Monge views of a part at once (choose them on a diagram, ISO-E or ISO-A) |
| [`VIEWPROJ`](reference/insert.md#viewproj) | — | Create projected views from an existing drawing view |
| [`VIEWEDIT`](reference/insert.md#viewedit) | — | Edit a drawing view: hidden lines and scale |
| [`VIEWUPDATE`](reference/insert.md#viewupdate) | — | Update drawing views that are out of date with the model |
| [`VIEWSTD`](reference/insert.md#viewstd) | `-VIEWSTD` | Drafting standard of drawing views: first-angle or third-angle projection |
| [`FIELD`](reference/insert.md#field) | — | Insert a field (file name, dates, drawing properties, layout, sheet, viewport scale) into text |
| [`UPDATEFIELD`](reference/insert.md#updatefield) | — | Update the fields of the selected objects |

## Format menu

| Command | Aliases | What it does |
| --- | --- | --- |
| [`LAYER`](reference/format.md#layer) | `LA`, `DDLMODES` | Open the Layer Properties Manager (create, rename, color, lineweight, plot…) |
| [`LAYMCUR`](reference/format.md#laymcur) | — | Make the layer of a selected object current |
| [`LAYISO`](reference/format.md#layiso) | — | Isolate the layers of the selected objects: the other layers are turned off (LAYUNISO restores) |
| [`LAYUNISO`](reference/format.md#layuniso) | — | Restore the layers turned off by the last LAYISO |
| [`LAYOFF`](reference/format.md#layoff) | — | Turn off the layer of the selected objects |
| [`LAYON`](reference/format.md#layon) | — | Turn on all layers |
| [`LAYFRZ`](reference/format.md#layfrz) | — | Freeze the layer of the selected objects |
| [`LAYTHW`](reference/format.md#laythw) | — | Thaw all layers |
| [`LAYLCK`](reference/format.md#laylck) | — | Lock the layer of the selected object |
| [`LAYULK`](reference/format.md#layulk) | — | Unlock the layer of the selected object |
| [`COLOR`](reference/format.md#color) | `COL`, `COLOUR`, `-COLOR`, `CECOLOR` | Color of new objects (CECOLOR): ByLayer, index 1-255, name, #rrggbb or r,g,b |
| [`LINETYPE`](reference/format.md#linetype) | `LT`, `LTYPE`, `DDLTYPE` | Linetype Manager: load linetypes, set the current one and the scale factors |
| [`LWEIGHT`](reference/format.md#lweight) | `LW`, `LINEWEIGHT`, `-LWEIGHT`, `CELWEIGHT` | Lineweight of new objects (CELWEIGHT): ByLayer, Default or a width in mm [?] |
| [`DIMSTYLE`](reference/format.md#dimstyle) | `D`, `DST`, `DDIM`, `DIMSTY` | Dimension Style Manager: create, modify, override and set the current dimension style |
| [`MLEADERSTYLE`](reference/format.md#mleaderstyle) | `MLS` | Multileader style: multileaders use the leader arrow (DIMLDRBLK), arrow size and text of the dimension style |
| [`LIMITS`](reference/format.md#limits) | — | Set the drawing limits (lower left, upper right) and turn the limits check ON/OFF |

## Tools menu

| Command | Aliases | What it does |
| --- | --- | --- |
| [`TOOLBAR`](reference/tools.md#toolbar) | `TO`, `TBCONFIG` | Show or hide toolbars (dialog with the list of toolbars) |
| [`OPTIONS`](reference/tools.md#options) | `OP` | UI settings: theme and colors (background/grid/crosshair) |
| [`OSNAP`](reference/tools.md#osnap) | `OS`, `-OSNAP`, `DDOSNAP` | Configure running object snaps (endpoint, center, quadrant, intersection, …) |
| [`GRID`](reference/tools.md#grid) | — | Show or hide the grid [ON/OFF] (F7) |
| [`UCS`](reference/tools.md#ucs) | — | User coordinate system [Face/NAmed/OBject/Previous/View/World/X/Y/Z/ZAxis] |
| [`DIST`](reference/tools.md#dist) | `DI` | Measure distance and angle between two points |
| [`ID`](reference/tools.md#id) | — | Display the coordinates of a point in the current UCS |
| [`AREA`](reference/tools.md#area) | `AA` | Area and perimeter of points or of an object [Object/Add area/Subtract area]; Add/Subtract keep a running total |
| [`LIST`](reference/tools.md#list) | `LI`, `LS` | List the properties of the selected objects: type, layer, points, lengths, areas, volumes |
| [`MASSPROP`](reference/tools.md#massprop) | — | Mass properties of solids: volume (mass with density 1), surface area, bounding box and centroid |
| [`DRAWORDER`](reference/tools.md#draworder) | `DR` | Change the draw order of objects [Above objects/Under objects/Front/Back] |
| [`TEXTTOFRONT`](reference/tools.md#texttofront) | — | Bring texts and/or dimensions in front of the other objects [Text/Dimensions/Both] |
| [`GROUP`](reference/tools.md#group) | `G` | Group the selected objects so they are selected together [Name/Description]; UNGROUP breaks a group |
| [`UNGROUP`](reference/tools.md#ungroup) | — | Break up the group of a picked object [Name] |
| [`ISOLATEOBJECTS`](reference/tools.md#isolateobjects) | `ISOLATE` | Temporarily hide everything except the selected objects (UNISOLATEOBJECTS shows them again) |
| [`HIDEOBJECTS`](reference/tools.md#hideobjects) | — | Temporarily hide the selected objects (UNISOLATEOBJECTS shows them again) |
| [`UNISOLATEOBJECTS`](reference/tools.md#unisolateobjects) | `UNISOLATE` | Show again the objects hidden by ISOLATEOBJECTS or HIDEOBJECTS |
| [`AGENT`](reference/tools.md#agent) | `AGENTPANEL` | Open or close the modeling agent panel: a conversation with an LLM (your own API key) that runs Cota for you |
| [`COMPACT`](reference/tools.md#compact) | — | Summarize the agent conversation to free its context (the drawing keeps everything built) |
| [`SCRIPT`](reference/tools.md#script) | `SCR` | Run several commands as one operation (one undo step): type or paste them, load a .scr file or share them as a link |
| [`PROMPT`](reference/tools.md#prompt) | `AI` | Generate or edit the model with natural language (LLM). Opens a prompt box. |
| [`ATTSYNC`](reference/tools.md#attsync) | — | Synchronize block references with their redefined attributes [?/Name/Select] |

## Draw menu

| Command | Aliases | What it does |
| --- | --- | --- |
| [`LINE`](reference/draw.md#line) | `L` | Draw connected line segments (closing converts them to a closed polyline) |
| [`XLINE`](reference/draw.md#xline) | `XL` | Construction line, infinite in both directions |
| [`RAY`](reference/draw.md#ray) | — | Ray: a line infinite in one direction |
| [`PLINE`](reference/draw.md#pline) | `PL` | Draw a polyline with straight and arc segments (Arc/Close/Undo) |
| [`POLYGON`](reference/draw.md#polygon) | `POL` | Draw a regular polygon (center + inscribed/circumscribed radius, or Edge) |
| [`RECTANGLE`](reference/draw.md#rectangle) | `REC`, `RECT`, `RECTANG` | Draw a rectangle by two opposite corners [Dimensions] |
| [`ARC`](reference/draw.md#arc) | `A` | Draw an arc: 3 points, or Start/Center/End with Angle, chord Length, Direction or Radius |
| [`CIRCLE`](reference/draw.md#circle) | `C` | Draw a circle: center + radius/Diameter, 3P (points or tangents), 2P or Ttr (tan tan radius) |
| [`SPLINE`](reference/draw.md#spline) | `SPL` | Draw a spline through control points |
| [`ELLIPSE`](reference/draw.md#ellipse) | `EL` | Draw an ellipse (axis endpoints + other axis distance, or Center) |
| [`POINT`](reference/draw.md#point) | `PO` | Place a point object (its look is set by PDMODE and PDSIZE; it snaps as NODE) |
| [`DIVIDE`](reference/draw.md#divide) | `DIV` | Place points that divide an object into equal-length segments |
| [`MEASURE`](reference/draw.md#measure) | `ME` | Place points at measured intervals along an object, from the end nearest the pick |
| [`BLOCK`](reference/draw.md#block) | `B` | Create a block definition from selected objects (and insert a reference) |
| [`ATTDEF`](reference/draw.md#attdef) | `ATT`, `-ATTDEF` | Define a block attribute (tag, prompt, default value, Invisible/Constant/Preset) |
| [`HATCH`](reference/draw.md#hatch) | `H`, `BH`, `BHATCH` | Fill an enclosed area with a hatch pattern, solid fill or user lines |
| [`BOUNDARY`](reference/draw.md#boundary) | `BO`, `BPOLY`, `-BOUNDARY` | Create closed polylines from the area around a picked point [Advanced options: boundary set, islands, gap tolerance] |
| [`REGION`](reference/draw.md#region) | `REG` | Convert closed objects and closed chains of lines and arcs into regions |
| [`TEXT`](reference/draw.md#text) | `DT`, `DTEXT` | Create single-line text on its baseline (Justify: Left/Center/Right); each Enter starts a new line, an empty line finishes. %%c = Ø, %%d = °, %%p = ± |
| [`MTEXT`](reference/draw.md#mtext) | `MT`, `T` | Create multiline text from its top-left corner (enter lines; empty line finishes). %%c = Ø, %%d = °, %%p = ± |
| [`BOX`](reference/draw.md#box) | — | Create a parametric box (two base corners + height) |
| [`CYLINDER`](reference/draw.md#cylinder) | `CYL` | Create a parametric cylinder (base center + radius + height) |
| [`CONE`](reference/draw.md#cone) | — | Create a parametric cone or truncated cone (base center + radius + height + top radius) |
| [`SPHERE`](reference/draw.md#sphere) | `SPH` | Create a parametric sphere (center + radius) |
| [`TORUS`](reference/draw.md#torus) | `TOR` | Create a parametric torus (center + radius + tube radius) |
| [`EXTRUDE`](reference/draw.md#extrude) | `EXT` | Extrude a closed 2D profile into a solid (a circle becomes a parametric cylinder) |
| [`REVOLVE`](reference/draw.md#revolve) | `REV` | Revolve closed profiles about an axis into solids [Object/X/Y/Z, STart angle/Reverse] |
| [`FLATSHOT`](reference/draw.md#flatshot) | — | Create a 2D representation of the 3D solids in the current view |
| [`SOLPROF`](reference/draw.md#solprof) | — | Create profile images of 3D solids for a layout viewport (visible and hidden lines) |

## Dimension menu

| Command | Aliases | What it does |
| --- | --- | --- |
| [`DIM`](reference/dimension.md#dim) | — | Smart dimension: pick an object (line → linear/aligned, arc → radius, circle → diameter) [Angular/Baseline/Continue/Ordinate/aLign/LAyer/Undo] |
| [`QDIM`](reference/dimension.md#qdim) | — | Quick dimension: chain the selected geometry [Continuous/Staggered/Baseline/Ordinate/Radius/Diameter] |
| [`AUTODIM`](reference/dimension.md#autodim) | `ADIM` | Dimension a part automatically: overall sizes, steps, hole positions, diameters and radii |
| [`DIMLINEAR`](reference/dimension.md#dimlinear) | `DLI`, `DIMLIN` | Linear dimension (horizontal, vertical or rotated) [Mtext/Text/Angle/Horizontal/Vertical/Rotated] |
| [`DIMALIGNED`](reference/dimension.md#dimaligned) | `DAL`, `DIMALI` | Aligned dimension [Mtext/Text/Angle] |
| [`DIMARC`](reference/dimension.md#dimarc) | `DAR` | Arc length dimension [Mtext/Text/Angle/Partial] |
| [`DIMORDINATE`](reference/dimension.md#dimordinate) | `DOR` | Ordinate dimension (X or Y datum from the UCS origin) [Xdatum/Ydatum/Mtext/Text/Angle] |
| [`DIMRADIUS`](reference/dimension.md#dimradius) | `DRA`, `DIMRAD` | Radius dimension of an arc or circle [Mtext/Text/Angle] |
| [`DIMJOGGED`](reference/dimension.md#dimjogged) | `DJO`, `JOG` | Jogged radius dimension (center location override) [Mtext/Text/Angle] |
| [`DIMDIAMETER`](reference/dimension.md#dimdiameter) | `DDI`, `DIMDIA` | Diameter dimension of an arc or circle [Mtext/Text/Angle] |
| [`DIMANGULAR`](reference/dimension.md#dimangular) | `DAN` | Angular dimension: two lines, an arc, a circle or a vertex and two points [Mtext/Text/Angle] |
| [`DIMBASELINE`](reference/dimension.md#dimbaseline) | `DBA`, `DIMBASE` | Baseline dimensions from the last (or a selected) dimension, spaced by DIMDLI [Select/Undo] |
| [`DIMCONTINUE`](reference/dimension.md#dimcontinue) | `DCO`, `DIMCONT` | Continued dimensions from the last (or a selected) dimension [Select/Undo] |
| [`DIMSPACE`](reference/dimension.md#dimspace) | — | Space parallel linear or angular dimensions evenly (0 aligns them) |
| [`DIMBREAK`](reference/dimension.md#dimbreak) | — | Break dimension and extension lines where they cross other objects (Auto/Manual/Remove) |
| [`MLEADER`](reference/dimension.md#mleader) | `MLD` | Multileader with text (fields allowed), block or no content [leader Landing first/Content first/Options] |
| [`QLEADER`](reference/dimension.md#qleader) | `LE` | Quick leader: points and text (creates a multileader) |
| [`LEADER`](reference/dimension.md#leader) | `LEAD` | Leader with annotation text (see MLEADER) |
| [`MLEADEREDIT`](reference/dimension.md#mleaderedit) | `MLE` | Add or remove leaders of a multileader [Add leader/Remove leaders] |
| [`MLEADERALIGN`](reference/dimension.md#mleaderalign) | `MLA` | Align multileaders along a direction from a base multileader (current spacing) |
| [`DIMCENTER`](reference/dimension.md#dimcenter) | `DCE`, `CENTERMARK`, `CM` | Center mark (and center lines with DIMCEN < 0) of an arc or circle |
| [`CENTERLINE`](reference/dimension.md#centerline) | — | Associative center line between two lines |
| [`THREAD`](reference/dimension.md#thread) | `COSMETICTHREAD` | Cosmetic thread (ISO/IRAM): 3/4 arc on a circle or thread texture on a cylindrical face, nearest standard size and optional leader |
| [`DIMINSPECT`](reference/dimension.md#diminspect) | — | Add or remove inspection information (label, value, inspection rate) on dimensions |
| [`DIMJOGLINE`](reference/dimension.md#dimjogline) | `DJL` | Add or remove a jog line on a linear or aligned dimension |
| [`DIMEDIT`](reference/dimension.md#dimedit) | `DED`, `DIMED` | Edit dimension text and extension lines: Home, New text, Rotate text, Oblique extension lines |
| [`DIMTEDIT`](reference/dimension.md#dimtedit) | `DIMTED` | Move or rotate dimension text: new location, Left, Right, Center, Home or Angle |
| [`DIMOVERRIDE`](reference/dimension.md#dimoverride) | `DOV`, `DIMOVER` | Override dimension variables on selected dimensions, or Clear their overrides |
| [`DIMREASSOCIATE`](reference/dimension.md#dimreassociate) | `DRE` | Associate the definition points of dimensions with geometry (pick a point on an object; Enter skips) |
| [`DIMDISASSOCIATE`](reference/dimension.md#dimdisassociate) | `DDA` | Remove the associativity of the selected dimensions |
| [`DIMREGEN`](reference/dimension.md#dimregen) | — | Update all associative dimensions |

## Modify menu

| Command | Aliases | What it does |
| --- | --- | --- |
| [`PROPERTIES`](reference/modify.md#properties) | `PR`, `CH`, `MO`, `DDMODIFY`, `PROPS`, `SIDEBAR`, `HIDESIDEBAR` | Show/hide the Properties palette (movable, dockable) |
| [`MATCHPROP`](reference/modify.md#matchprop) | `MA`, `PAINTER` | Copy properties (layer, linetype, linetype scale, text, dimension, hatch, polyline) from one object to others |
| [`PEDIT`](reference/modify.md#pedit) | `PE` | Edit polylines: join (with fuzz), width, vertices, fit/spline curves, decurve, linetype generation, reverse |
| [`HATCHEDIT`](reference/modify.md#hatchedit) | `HE` | Edit a hatch: pattern, scale, angle, island style, origin, associativity, boundary |
| [`ATTEDIT`](reference/modify.md#attedit) | `ATE`, `-ATTEDIT` | Edit the attribute values of a block reference (command line) |
| [`EATTEDIT`](reference/modify.md#eattedit) | — | Enhanced Attribute Editor: edit the attributes of a block reference in a dialog |
| [`COPY`](reference/modify.md#copy) | `CO`, `CP` | Copy selected objects (repeats until Esc) |
| [`MIRROR`](reference/modify.md#mirror) | `MI` | Mirror selected objects about an axis defined by two points |
| [`OFFSET`](reference/modify.md#offset) | `O` | Create concentric circles, parallel lines and parallel curves |
| [`ARRAY`](reference/modify.md#array) | `AR` | Array selected objects [Rectangular/Polar] |
| [`MOVE`](reference/modify.md#move) | `M` | Move selected objects |
| [`ROTATE`](reference/modify.md#rotate) | `RO` | Rotate selected objects about a base point (Copy/Reference) |
| [`SCALE`](reference/modify.md#scale) | `SC` | Scale selected objects about a base point (factor or Reference) |
| [`STRETCH`](reference/modify.md#stretch) | `S` | Stretch objects crossed by a window (vertices inside the window move) |
| [`LENGTHEN`](reference/modify.md#lengthen) | `LEN` | Change the length of objects and the included angle of arcs |
| [`TRIM`](reference/modify.md#trim) | `TR` | Trim objects to meet the edges of other objects (shift-select extends) |
| [`EXTEND`](reference/modify.md#extend) | `EX` | Extend objects to meet the edges of other objects (shift-select trims) |
| [`BREAKATPOINT`](reference/modify.md#breakatpoint) | — | Break the selected object at a single point |
| [`BREAK`](reference/modify.md#break) | `BR` | Break the selected object between two points |
| [`JOIN`](reference/modify.md#join) | `J` | Join lines, arcs, polylines and splines into a single object |
| [`CHAMFER`](reference/modify.md#chamfer) | `CHA` | Bevel the edges of objects |
| [`FILLET`](reference/modify.md#fillet) | `F` | Round and fillet the edges of objects |
| [`ALIGN`](reference/modify.md#align) | `AL` | Align objects with other objects using source/destination point pairs |
| [`UNION`](reference/modify.md#union) | `UNI` | Boolean union of solids or coplanar regions |
| [`SUBTRACT`](reference/modify.md#subtract) | `SU` | Boolean subtraction of solids or coplanar regions |
| [`INTERSECT`](reference/modify.md#intersect) | `IN` | Boolean intersection of solids or coplanar regions |
| [`SLICE`](reference/modify.md#slice) | `SL` | Slice solids with a plane, keeping one side or both |
| [`FILLETEDGE`](reference/modify.md#filletedge) | — | Round and fillet the edges of solid objects |
| [`CHAMFEREDGE`](reference/modify.md#chamferedge) | — | Bevel the edges of solid objects |
| [`EXPLODE`](reference/modify.md#explode) | `X` | Explode block references, polylines and hatches into their component objects |

## Help menu

| Command | Aliases | What it does |
| --- | --- | --- |
| [`HELP`](reference/help.md#help) | `?` | List available commands |
| [`DOCS`](reference/help.md#docs) | `DOCUMENTATION` | Open the documentation (guides and command reference) in a new tab |
| [`ABOUT`](reference/help.md#about) | — | Show the Cota version, author and license |

## Command-line versions

Dash versions run without dialogs, for scripts and power users.

| Command | Aliases | What it does |
| --- | --- | --- |
| [`-GROUP`](reference/command-line.md#-group) | `-G` | Groups from the command line [?/Add/Remove/Explode/REName/Selectable/Create] |
| [`-TOOLBAR`](reference/command-line.md#-toolbar) | `-TO` | Show, hide, dock or float a toolbar from the command line (or ALL toolbars) |
| [`-PLOT`](reference/command-line.md#-plot) | `-PRINT` | Plot to PDF right away with the last PLOT settings (no dialog) |
| [`-DIMSTYLE`](reference/command-line.md#-dimstyle) | — | Dimension styles from the command line [ANnotative/Save/Restore/STatus/Variables/Apply/?] |
| [`-LAYER`](reference/command-line.md#-layer) | `-LA` | Layers from the command line: ?/Make/Set/New/Rename/ON/OFF/Color/Ltype/LWeight/Plot/Freeze/Thaw/LOck/Unlock |
| [`-LINETYPE`](reference/command-line.md#-linetype) | `-LT` | Linetypes from the command line: ?, Create, Load, Set |
| [`-HATCH`](reference/command-line.md#-hatch) | `-H`, `-BHATCH` | Hatch from the command line (Properties, Select objects, Advanced, Origin) |
| [`-HATCHEDIT`](reference/command-line.md#-hatchedit) | `-HE` | Edit a hatch from the command line |
| [`-OPEN`](reference/command-line.md#-open) | — | Open a drawing from the command line [Device/List] |
| [`-IMAGE`](reference/command-line.md#-image) | — | Images of the drawing from the command line [Reload/?] |

## System variables

Type the name to see or change the value. Each one is explained in [System variables](reference/variables.md).

| Variable | What it controls |
| --- | --- |
| [`OFFSETGAPTYPE`](reference/variables.md#offsetgaptype) | Gap fill when offsetting polylines: 0 extend, 1 fillet, 2 chamfer |
| [`POLARANG`](reference/variables.md#polarang) | Polar tracking angle increment in degrees (POLAR / F10 tracks multiples of it from the base point) |
| [`PICKSTYLE`](reference/variables.md#pickstyle) | Group selection: 1 = picking a grouped object selects its group, 0 = single objects (Ctrl+Shift+A toggles) |
| [`LWDISPLAY`](reference/variables.md#lwdisplay) | Show lineweights in the model (ON/OFF); layouts always show them |
| [`ZOOMFACTOR`](reference/variables.md#zoomfactor) | Mouse wheel zoom step (3–100) |
| [`RENDERMINPX`](reference/variables.md#renderminpx) | Draw solids smaller than this many pixels as a point (0 = off) |
| [`ZOOMWHEEL`](reference/variables.md#zoomwheel) | Mouse wheel direction: 0 = forward zooms in, 1 = forward zooms out |
| [`ISAVEBAK`](reference/variables.md#isavebak) | Keep the previous version as a .bak file when saving to the local folder (0/1) |
| [`SAVETIME`](reference/variables.md#savetime) | Minutes between automatic recovery copies (.sv$) in the local folder (0 = off) |
| [`PDMODE`](reference/variables.md#pdmode) | Point style: 0 dot, 1 none, 2 plus, 3 cross, 4 tick; add 32 for a circle and 64 for a square |
| [`PDSIZE`](reference/variables.md#pdsize) | Point size: 0 = 5% of the view, negative = % of the view, positive = drawing units |
| [`DIMTEXTSIZE`](reference/variables.md#dimtextsize) | Set the dimension text height for new dimensions (DIMTXT override) |
| [`DIMASSOC`](reference/variables.md#dimassoc) | Associativity of new dimensions: 2 = associative, 1 = non-associative |
| [`CANNOSCALE`](reference/variables.md#cannoscale) | Annotation scale of model space (annotative dimensions keep their paper size): 1:1, 1:50, 1:100… |
| [`DIMCLRD`](reference/variables.md#dimclrd) | Dimension variable: Dimension line color |
| [`DIMLWD`](reference/variables.md#dimlwd) | Dimension variable: Dimension line lineweight |
| [`DIMDLE`](reference/variables.md#dimdle) | Dimension variable: Extend beyond ticks |
| [`DIMDLI`](reference/variables.md#dimdli) | Dimension variable: Baseline spacing |
| [`DIMSD1`](reference/variables.md#dimsd1) | Dimension variable: Suppress dim line 1 |
| [`DIMSD2`](reference/variables.md#dimsd2) | Dimension variable: Suppress dim line 2 |
| [`DIMCLRE`](reference/variables.md#dimclre) | Dimension variable: Extension line color |
| [`DIMLWE`](reference/variables.md#dimlwe) | Dimension variable: Extension line lineweight |
| [`DIMEXE`](reference/variables.md#dimexe) | Dimension variable: Extend beyond dim lines |
| [`DIMEXO`](reference/variables.md#dimexo) | Dimension variable: Offset from origin |
| [`DIMFXLON`](reference/variables.md#dimfxlon) | Dimension variable: Fixed length extension lines |
| [`DIMFXL`](reference/variables.md#dimfxl) | Dimension variable: Fixed length |
| [`DIMSE1`](reference/variables.md#dimse1) | Dimension variable: Suppress ext line 1 |
| [`DIMSE2`](reference/variables.md#dimse2) | Dimension variable: Suppress ext line 2 |
| [`DIMBLK1`](reference/variables.md#dimblk1) | Dimension variable: First arrowhead |
| [`DIMBLK2`](reference/variables.md#dimblk2) | Dimension variable: Second arrowhead |
| [`DIMLDRBLK`](reference/variables.md#dimldrblk) | Dimension variable: Leader arrowhead |
| [`DIMASZ`](reference/variables.md#dimasz) | Dimension variable: Arrow size |
| [`DIMCEN`](reference/variables.md#dimcen) | Dimension variable: Center marks (− = lines) |
| [`DIMARCSYM`](reference/variables.md#dimarcsym) | Dimension variable: Arc length symbol |
| [`DIMJOGANG`](reference/variables.md#dimjogang) | Dimension variable: Radius jog angle |
| [`DIMCLRT`](reference/variables.md#dimclrt) | Dimension variable: Text color |
| [`DIMTFILL`](reference/variables.md#dimtfill) | Dimension variable: Fill color |
| [`DIMTXT`](reference/variables.md#dimtxt) | Dimension variable: Text height |
| [`DIMGAP`](reference/variables.md#dimgap) | Dimension variable: Offset from dim line (− = box) |
| [`DIMTAD`](reference/variables.md#dimtad) | Dimension variable: Text placement vertical |
| [`DIMJUST`](reference/variables.md#dimjust) | Dimension variable: Text placement horizontal |
| [`DIMTIH`](reference/variables.md#dimtih) | Dimension variable: Text inside horizontal |
| [`DIMTOH`](reference/variables.md#dimtoh) | Dimension variable: Text outside horizontal |
| [`DIMATFIT`](reference/variables.md#dimatfit) | Dimension variable: Fit options |
| [`DIMTIX`](reference/variables.md#dimtix) | Dimension variable: Always keep text between ext lines |
| [`DIMSOXD`](reference/variables.md#dimsoxd) | Dimension variable: Suppress arrows if they do not fit |
| [`DIMTMOVE`](reference/variables.md#dimtmove) | Dimension variable: Text placement when moved |
| [`DIMTOFL`](reference/variables.md#dimtofl) | Dimension variable: Draw dim line between ext lines |
| [`DIMSCALE`](reference/variables.md#dimscale) | Dimension variable: Use overall scale of |
| [`DIMLUNIT`](reference/variables.md#dimlunit) | Dimension variable: Unit format |
| [`DIMDEC`](reference/variables.md#dimdec) | Dimension variable: Precision |
| [`DIMDSEP`](reference/variables.md#dimdsep) | Dimension variable: Decimal separator |
| [`DIMRND`](reference/variables.md#dimrnd) | Dimension variable: Round off |
| [`DIMPOST`](reference/variables.md#dimpost) | Dimension variable: Prefix / suffix (<> = value) |
| [`DIMLFAC`](reference/variables.md#dimlfac) | Dimension variable: Measurement scale factor |
| [`DIMZIN`](reference/variables.md#dimzin) | Dimension variable: Zero suppression (4 leading, 8 trailing) |
| [`DIMAUNIT`](reference/variables.md#dimaunit) | Dimension variable: Angular units |
| [`DIMADEC`](reference/variables.md#dimadec) | Dimension variable: Angular precision |
| [`DIMAZIN`](reference/variables.md#dimazin) | Dimension variable: Angular zero suppression |
| [`DIMALT`](reference/variables.md#dimalt) | Dimension variable: Display alternate units |
| [`DIMALTF`](reference/variables.md#dimaltf) | Dimension variable: Multiplier for alt units |
| [`DIMALTD`](reference/variables.md#dimaltd) | Dimension variable: Alt precision |
| [`DIMALTRND`](reference/variables.md#dimaltrnd) | Dimension variable: Alt round off |
| [`DIMAPOST`](reference/variables.md#dimapost) | Dimension variable: Alt prefix / suffix |
| [`DIMALTU`](reference/variables.md#dimaltu) | Dimension variable: Alt unit format |
| [`DIMALTZ`](reference/variables.md#dimaltz) | Dimension variable: Alt zero suppression |
| [`DIMTOL`](reference/variables.md#dimtol) | Dimension variable: Tolerances (deviation) |
| [`DIMLIM`](reference/variables.md#dimlim) | Dimension variable: Limits |
| [`DIMTP`](reference/variables.md#dimtp) | Dimension variable: Upper value |
| [`DIMTM`](reference/variables.md#dimtm) | Dimension variable: Lower value |
| [`DIMTDEC`](reference/variables.md#dimtdec) | Dimension variable: Precision |
| [`DIMTFAC`](reference/variables.md#dimtfac) | Dimension variable: Scaling for height |
| [`DIMTOLJ`](reference/variables.md#dimtolj) | Dimension variable: Vertical position |
| [`DIMTZIN`](reference/variables.md#dimtzin) | Dimension variable: Zero suppression |
| [`UCSORTHO`](reference/variables.md#ucsortho) | Orthographic views set their orthographic UCS (0/1) |
| [`UCSFOLLOW`](reference/variables.md#ucsfollow) | Plan view whenever the UCS changes (0/1) |
| [`UCSDETECT`](reference/variables.md#ucsdetect) | Dynamic UCS on planar faces of solids (0/1) |
| [`LTSCALE`](reference/variables.md#ltscale) | Global linetype scale factor |
| [`CELTSCALE`](reference/variables.md#celtscale) | Linetype scale of new objects |
| [`CELTYPE`](reference/variables.md#celtype) | Linetype of new objects (ByLayer, ByBlock or a loaded linetype) |
| [`PSLTSCALE`](reference/variables.md#psltscale) | Paper space linetype scaling in layout viewports (0/1) |
| [`MSLTSCALE`](reference/variables.md#msltscale) | Scale model space linetypes by the annotation scale (0/1) |
| [`PLINEGEN`](reference/variables.md#plinegen) | Linetype pattern continuous around polyline vertices (0/1) |
| [`HPNAME`](reference/variables.md#hpname) | Default hatch pattern name |
| [`HPSCALE`](reference/variables.md#hpscale) | Default hatch pattern scale |
| [`HPANG`](reference/variables.md#hpang) | Default hatch pattern angle (degrees) |
| [`HPSPACE`](reference/variables.md#hpspace) | Line spacing of user defined hatches |
| [`HPASSOC`](reference/variables.md#hpassoc) | New hatches are associative (0/1) |
| [`HPGAPTOL`](reference/variables.md#hpgaptol) | Gap tolerance of hatch and BOUNDARY boundaries: gaps up to this size are closed (0 = closed only) |
| [`HPDOUBLE`](reference/variables.md#hpdouble) | User defined hatches are double hatched (0/1) |
| [`HPISLANDDETECTION`](reference/variables.md#hpislanddetection) | Island detection of new hatches: 0 Normal, 1 Outer, 2 Ignore |
| [`PEDITACCEPT`](reference/variables.md#peditaccept) | PEDIT converts lines and arcs to polylines without asking (0/1) |
| [`SPLINETYPE`](reference/variables.md#splinetype) | PEDIT Spline curve: 5 quadratic, 6 cubic B-spline |
| [`SPLINESEGS`](reference/variables.md#splinesegs) | Segments per span of a spline-fit polyline |
