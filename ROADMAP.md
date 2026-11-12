# Roadmap

This is the public backlog of Cota: what is planned, roughly in the order it will be tackled. Items move to the
[changelog](CHANGELOG.md) when they ship. Ideas and votes are welcome in
[Discussions](https://github.com/mxchristian17/cota/discussions) or as issues.

Status: **next** = being worked on or up next · **planned** = designed, waiting its turn · **idea** = open for
discussion.

## Files and interoperability

| Status | Item |
|---|---|
| done | **DWG in the browser**: open and save `.dwg` files with no server (a permissively licensed reader, in a background thread), checked against a standard sample drawing saved in every DWG/DXF version. |
| next | **3D solids from DWG/DXF with faces**: the ACIS data of 3DSOLID, REGION and BODY is already read for their edges; the faces are still missing. |
| planned | Blocks and layouts on DXF/DWG export, and WIPEOUT masks. Full list in [DWG and DXF coverage](docs/dwg-coverage.md). |
| next | Blocks from DXF/DWG: import `INSERT` references and attributes as Cota blocks. |
| planned | STEP/IGES: test the import with real-world parts and assemblies; keep the assembly tree. |
| idea | Export STEP from Cota solids. |

## Modeling

| Status | Item |
|---|---|
| next | EXTRUDE with a live solid preview; the height follows the side of the cursor. |
| done | **Exact solid kernel**: booleans, fillets and chamfers of 3D solids are built with an exact B-rep kernel (OpenCascade compiled to WebAssembly, loaded only for 3D solids, `SOLIDKERNEL`), so any subset of edges of a sphere cut by a box rounds cleanly and a sphere–plane circle is one edge; the mesh stays as the fallback (2.39.0). |
| next | **Exact topology**: edges, faces and snaps of solids taken from the B-rep instead of the mesh, exact projected views, STEP export and exact mass properties. |
| planned | Per-object lineweight (ByLayer by default) and a toggle to show lineweights in the model. |
| planned | Isolate / hide objects and quick select from the context menu. |
| done | **Edit a block by double-clicking it**: the block definition opens in the Block Editor (`BEDIT`, `BSAVE`, `BCLOSE`), as in the classic block editor, and saving updates every insert of that block (2.37.0). |
| planned | Drawing in a UCS seen edge-on (the cursor stays on the view plane through the base point). |
| idea | Parametric sketches with geometric and dimensional constraints. |

## Command line for professional use

| Status | Item |
|---|---|
| planned | **Faster command line**: smarter autocomplete (by usage, aliases and system variables), searchable history, and editable aliases in a file. |
| planned | Dynamic input next to the cursor (length, angle and coordinates typed in place) with keyboard-only workflows end to end. |
| next | Scripts: several commands as one operation (one undo step), pasted in the command line, typed in SCRIPT, loaded from a `.scr` file or shared as a link. Recording macros comes later. |
| done | **TRIM and EXTEND by window**: a click on empty space opens a crossing window, and object snap markers stay hidden while picking what to trim (2.40.0). |
| done | **Zoom during a window selection keeps its first corner** where it was in the drawing, so you can zoom in to pick exactly what the box takes (2.40.0). |
| done | **MTEXT edited in place**: a text window on the drawing itself, with the formatting toolbar, as in the classic CAD (2.42.0). |
| done | **Sticky notes**: notes pasted on the drawing with the look of a sticky note (yellow, violet and the usual colors), a close button, a corner to resize them with the text fitting the note, double-click to edit the text. They lie on the working UCS like a rectangle, on the working plane or on the face of any solid. Dragging one of their end or mid grips draws a leader to where you point, with object snaps. Saved in `.cota` files; other formats leave them out. (2.41.0). |

## AI agents

| Status | Item |
|---|---|
| done | **Agent panel**: in the browser with your own API key (2.7.0) and with the optional server (Docker), where the key and the conversations live on the server (2.8.0). |
| next | Providers: Anthropic, OpenAI, Google Gemini and OpenRouter or any OpenAI-compatible endpoint shipped in 2.7.0; direct DeepSeek, Kimi (Moonshot) and GLM (Zhipu) presets next. |
| planned | **Sub-agents**: the main agent can launch helpers for parallel work, each with its own model. |
| next | **Scene context on demand** (objects in a box with bounding boxes and descriptions shipped in 2.7.0): the agent asks for a list of objects with their bounding boxes and short descriptions, picks what it needs, and can limit its context to one or more virtual boxes in space (on a large scene it only loads the region it is working on). |
| planned | **Parametric geometry for agents**: objects are passed by their parameters (a cylinder is its axis, radius and height; a fillet is its edge and radius), never as raw vertices, to keep token use low. |
| done | Context meter and a `COMPACT` command that summarizes a long conversation to free context (2.7.0). |
| planned | **MCP server** so external agents (desktop and coding assistants) can model in Cota with the same tools. |
| idea | Scripting API to drive Cota from code (batch drawings, parametric parts). |

## Mobile and on site

| Status | Item |
|---|---|
| done | **Mobile view for the job site**: a reduced phone interface to open drawings, orbit comfortably with touch, measure with DIST and switch the visual style (shaded, wireframe, hidden) from big on-screen buttons; also views, layers only on screen and layouts. Not the full editor (2.10.0). |

## Mechanisms and assemblies

| Status | Item |
|---|---|
| planned | **Joints between parts**: revolute (a bearing turning on a shaft), prismatic (a slider), cylindrical, planar, fixed. |
| planned | **Motion constraints between parts**: mates that position parts against each other (coincident, concentric, parallel, tangent, distance, angle) and limit how they can move, with travel and angle limits on each joint. |
| planned | **Mechanisms**: crank–slider, four-bar linkages, cams; drive a joint and watch the assembly move. |
| planned | **Gear contact**: a gear rolling against another gear or a rack, with the correct ratio. |
| planned | **Animations**: play a mechanism through its motion, animate the camera (orbits, fly-throughs) and exploded views, and export the result as a video or GIF. |
| idea | Interference and collision checks while the mechanism moves. |
| idea | Exploded views and a bill of materials in layouts. |

## Precision gears

| Status | Item |
|---|---|
| planned | **Gear calculator**: spur and helical involute gears from module, number of teeth, pressure angle, helix angle and profile shift; center distance, contact ratio, backlash and tooth thickness. |
| planned | **Gear drawing**: exact involute and trochoid root profile as 2D geometry and as a solid, ready for manufacturing. |
| planned | Data table for drawings (module, teeth, pressure angle, shift, quality grade, span and pin measurements). |
| idea | Racks, internal gears, bevel gears and worm drives. |
| idea | Strength check (bending and pitting) following the usual standards. |

## Rendering and simulation

| Status | Item |
|---|---|
| done | **Auto-smooth shading**: facets that meet at less than a set angle (`SMOOTHANGLE`, 12° by default, also in OPTIONS) are shaded as one smooth surface, so cylinders, fillets and spheres look round instead of faceted, while real edges stay crisp (2.36.0). |
| idea | **Ray-traced rendering** with physically based materials, environment lighting and soft shadows. |
| idea | **Real physics**: rigid bodies, gravity, contacts and friction, motors on joints. |
| idea | Mass properties for assemblies (mass, center of gravity, inertia) with materials. |

## Manufacturing (CAM)

| Status | Item |
|---|---|
| idea | **2.5D milling**: facing, contours, pockets, drilling and tapping cycles from Cota geometry. |
| idea | **Turning**: profiles, grooving and threading on lathes. |
| idea | Toolpath simulation with material removal. |
| idea | G-code post-processors for common controllers (GRBL, LinuxCNC, and the usual industrial dialects). |
| idea | Tool and material library with feeds and speeds. |

## Performance and quality

| Status | Item |
|---|---|
| next | Heavy models: faster rebuild after each change, orbit and selection with hundreds of filleted solids. |
| planned | Drawing views: small glitches near rounded edges in some projections. |
| done | **Session log and `TRACEBACK`**: Cota keeps a log of everything done since the window was opened, with all its parameters: commands and every input, geometry created or edited, selections, view and visual style changes, settings. It lives until the window is closed. `TRACEBACK` exports the last *n* lines or the last *n* minutes to a file, detailed enough that an agent can replay that interval exactly and reproduce a bug found by you or by a user. (2.38.0). |
