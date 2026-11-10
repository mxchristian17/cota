# Cota documentation

Cota is a free, open-source 2D and 3D CAD that runs in the browser. Draft with a command line and object snaps,
model solids, produce dimensioned drawing sheets and exchange DWG and DXF files, without installing anything.

<div class="cards">
<a class="card" href="getting-started.md"><strong>Quickstart</strong><span>Open Cota, draw a part, turn it into a solid and plot its drawing in ten minutes.</span></a>
<a class="card" href="user-guide.md"><strong>User guide</strong><span>The command line, coordinates, selection, snaps, layers, 3D, layouts and files.</span></a>
<a class="card" href="commands.md"><strong>Commands</strong><span>Every command, alias and system variable, generated from the program itself.</span></a>
<a class="card" href="dwg-coverage.md"><strong>DWG and DXF</strong><span>What opens and saves, object by object, entirely in the browser.</span></a>
<a class="card" href="external-agents.md"><strong>Agents</strong><span>Model by describing the part, or let an external coding agent drive Cota.</span></a>
<a class="card" href="self-hosting.md"><strong>Self-hosting</strong><span>Serve the static app, or run the full stack with accounts and cloud storage.</span></a>
</div>

## What Cota does

| Area | In short |
| --- | --- |
| **Drafting** | Lines, polylines with arcs, circles, arcs, ellipses, splines, text, hatches and blocks, typed as commands or picked from menus and toolbars |
| **Precision** | Absolute, relative and polar coordinates, object snaps on 2D curves and on the real edges of 3D solids, tracking, ortho, polar and user coordinate systems |
| **3D modeling** | Solid primitives, extrude, revolve and slice, booleans, edge fillets and chamfers, threads, visual styles and multiple viewports |
| **Drawing production** | Layouts with scaled viewports, views projected from the model, automatic dimensioning, title blocks and vector PDF |
| **Files** | Native `.cota`, DWG and DXF open and save in the browser, STEP, IGES, STL and OBJ, PDF and images |
| **Everywhere** | A static web app: works offline once installed, on desktop and on phones, with an optional server for accounts |

## How the documentation is organized

- **Get started** walks you through a first drawing.
- **Guides** explain each part of the program in depth, with examples you can type.
- **Reference** lists every command, variable and supported file object.
- **Host and contribute** covers running your own copy and working on the code.

> [!TIP]
> Press <kbd>/</kbd> anywhere in these pages to search. Type a command name (`FILLET`), a topic (`object snaps`)
> or a variable (`OSMODE`).

Cota is licensed under the Apache License 2.0. Questions and bug reports go to the
[issue tracker](https://github.com/mxchristian17/cota/issues).
