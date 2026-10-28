# Roadmap

This is the public backlog of Cota: what is planned, roughly in the order it will be tackled. Items move to the
[changelog](CHANGELOG.md) when they ship. Ideas and votes are welcome in
[Discussions](https://github.com/mxchristian17/cota/discussions) or as issues.

Status: **next** = being worked on or up next · **planned** = designed, waiting its turn · **idea** = open for
discussion.

## Files and interoperability

| Status | Item |
|---|---|
| next | **DWG in the browser**: open (and later save) `.dwg` files with no server, using a permissively licensed reader. |
| next | Blocks from DXF/DWG: import `INSERT` references and attributes as Cota blocks. |
| planned | STEP/IGES: test the import with real-world parts and assemblies; keep the assembly tree. |
| idea | Export STEP from Cota solids. |

## Modeling

| Status | Item |
|---|---|
| next | EXTRUDE with a live solid preview; the height follows the side of the cursor. |
| planned | Per-object lineweight (ByLayer by default) and a toggle to show lineweights in the model. |
| planned | Isolate / hide objects and quick select from the context menu. |
| planned | Drawing in a UCS seen edge-on (the cursor stays on the view plane through the base point). |
| idea | Parametric sketches with geometric and dimensional constraints. |

## Command line for professional use

| Status | Item |
|---|---|
| planned | **Faster command line**: smarter autocomplete (by usage, aliases and system variables), searchable history, and editable aliases in a file. |
| planned | Dynamic input next to the cursor (length, angle and coordinates typed in place) with keyboard-only workflows end to end. |
| next | Scripts: several commands as one operation (one undo step), pasted in the command line, typed in SCRIPT, loaded from a `.scr` file or shared as a link. Recording macros comes later. |

## AI agents

| Status | Item |
|---|---|
| planned | **Agent panel** (collapsible), the evolution of today's `PROMPT` command: bring your own API key, pick the provider and model, and drive all of Cota through a conversation — the agent runs any command, models, edits, manages layouts and every other feature, the way a coding agent works on a repository. |
| planned | Providers: Anthropic, OpenAI, Google Gemini, DeepSeek, Kimi (Moonshot), GLM (Zhipu) and other frontier models, plus any OpenAI-compatible endpoint. |
| planned | **Sub-agents**: the main agent can launch helpers for parallel work, each with its own model. |
| planned | **Scene context on demand**: the agent asks for a list of objects with their bounding boxes and short descriptions, picks what it needs, and can limit its context to one or more virtual boxes in space (on a large scene it only loads the region it is working on). |
| planned | **Parametric geometry for agents**: objects are passed by their parameters (a cylinder is its axis, radius and height; a fillet is its edge and radius), never as raw vertices, to keep token use low. |
| planned | Context meter and a `COMPACT` command that summarizes a long conversation to free context. |
| planned | **MCP server** so external agents (desktop and coding assistants) can model in Cota with the same tools. |
| idea | Scripting API to drive Cota from code (batch drawings, parametric parts). |

## Mobile and on site

| Status | Item |
|---|---|
| planned | **Mobile view for the job site**: a reduced phone interface to open drawings, orbit comfortably with touch, measure with DIST and switch the visual style (shaded, wireframe, hidden) from big on-screen buttons. Not the full editor. |

## Mechanisms and assemblies

| Status | Item |
|---|---|
| planned | **Joints between parts**: revolute (a bearing turning on a shaft), prismatic (a slider), cylindrical, planar, fixed. |
| planned | **Mechanisms**: crank–slider, four-bar linkages, cams; drive a joint and watch the assembly move. |
| planned | **Gear contact**: a gear rolling against another gear or a rack, with the correct ratio. |
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
