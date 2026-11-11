# Third-party notices

Cota itself is licensed under the [Apache License 2.0](LICENSE). It uses the following third-party software, each
under its own license. Full license texts are included in each package's distribution.

## Web app (bundled into the build)

The build ships the full text of these licenses in `THIRD_PARTY_LICENSES.txt`
(source: [`services/web/public/THIRD_PARTY_LICENSES.txt`](services/web/public/THIRD_PARTY_LICENSES.txt)), linked
from the Help dialog.

| Package | Version | License |
| --- | --- | --- |
| [React](https://react.dev) / React DOM / Scheduler | 19.3 | MIT |
| [three.js](https://threejs.org) | 0.169 | MIT |
| [three-bvh-csg](https://github.com/gkjohnson/three-bvh-csg) | 0.0.16 | MIT |
| [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh) | 0.7 | MIT |
| [Zustand](https://github.com/pmndrs/zustand) | 5.0 | MIT |
| [acad-ts](https://github.com/node-projects/acad-ts) (TypeScript port of [ACadSharp](https://github.com/DomCR/ACadSharp)), loaded when a DWG is opened | 3.6.0 | MIT |
| [occt-wasm](https://github.com/andymai/occt-wasm) TypeScript wrapper, in the solid kernel's Worker (the OpenCascade module itself is below) | 5.17.1 | MIT |
| [polygon-clipping](https://github.com/mfogel/polygon-clipping) (uses [splaytree](https://github.com/w8r/splay-tree) 3.2, MIT, and [robust-predicates](https://github.com/mourner/robust-predicates) 3.0, public domain) | 0.15.7 | MIT |

### OpenCascade for STEP/IGES (loaded on demand)

Opening a STEP or IGES file loads [occt-import-js](https://github.com/kovacsv/occt-import-js) 0.0.23, a WebAssembly
build of [Open CASCADE Technology](https://dev.opencascade.org), as a separate, unmodified module
(`occt-import-js-*.js` and `occt-import-js-*.wasm` in the build). Both are licensed under the GNU Lesser General
Public License 2.1 (OCCT with its LGPL exception); their license texts ship in the package
(`node_modules/occt-import-js/dist/license.*.txt`). The module is not part of the rest of the app and can be
replaced with any compatible build of the same version.

### OpenCascade solid kernel (loaded on demand)

3D solids are evaluated with an exact B-rep kernel: [Open CASCADE Technology](https://dev.opencascade.org) 8.0.1
compiled to WebAssembly by [occt-wasm](https://github.com/andymai/occt-wasm) 5.17.1. It runs in its own Web Worker
and is downloaded only when a drawing has solids that need it.

- **The module** (`occt/5.17.1/occt-wasm.wasm` and its Emscripten loader `occt/5.17.1/occt-wasm.js` in the build) is
  licensed under the GNU Lesser General Public License 2.1 with the
  [Open CASCADE exception](https://dev.opencascade.org/resources/licensing). It is shipped unmodified, as separate
  files that Cota loads by URL, so it can be replaced with any compatible build of the same version: put your own
  `occt-wasm.wasm` and `occt-wasm.js` in that folder. The license texts and a README ship next to it
  (`occt/5.17.1/LICENSE_LGPL_21.txt`, `OCCT_LGPL_EXCEPTION.txt`, `README.txt`; source:
  [`services/web/vendor/occt/`](services/web/vendor/occt/)).
- **Its source code**: occt-wasm [v5.17.1](https://github.com/andymai/occt-wasm/tree/v5.17.1) (build scripts and C++
  facade) and the OCCT fork it pins as a submodule,
  [andymai/OCCT@c7f60ff](https://github.com/andymai/OCCT/tree/c7f60ffe85f28c67358d1771454044f0521f2fdd) (OCCT 8.0.1
  plus fixes). Each release attaches both as `cota-occt-source-5.17.1.tar.gz`, built by
  [`services/web/tools/occt-source.sh`](services/web/tools/occt-source.sh).
- **The TypeScript wrapper** of occt-wasm, bundled into the kernel's Web Worker, is MIT-licensed (its text is in
  `THIRD_PARTY_LICENSES.txt`).

This software is based on facilities provided by the Open CASCADE Technology software. `SOLIDKERNEL MESH` turns the
kernel off; solids are then evaluated with triangle meshes only.

### Hershey Simplex stroke font

The vector text font (`services/web/src/core/text/hersheySimplex.ts`) is the Hershey Simplex font by A. V. Hershey
(U.S. National Bureau of Standards, 1967), taken from the JSON port
[hersheytext](https://github.com/techninja/hersheytext) 2.0.0. The hersheytext README states that its font data
is in the public domain and its code is MIT-licensed. The Hershey font distribution may be used for any purpose
provided these acknowledgements are distributed with the font data:

> The Hershey Fonts were originally created by Dr. A. V. Hershey while working at the U. S. National Bureau of
> Standards.
>
> The format of the Font data in this distribution was originally created by James Hurt, Cognition, Inc.,
> 900 Technology Park Drive, Billerica, MA 01821.

The hersheytext license:

> Copyright (c) 2014 James T. Permission is hereby granted, free of charge, to any person obtaining a copy of this
> software and associated documentation files (the "Software"), to deal in the Software without restriction,
> including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following
> conditions: The above copyright notice and this permission notice shall be included in all copies or substantial
> portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
> THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF
> CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
> IN THE SOFTWARE.

## Optional server (`services/api`, not needed by the web app)

| Package | License |
| --- | --- |
| FastAPI, SQLModel, SQLAlchemy, Pydantic, pydantic-settings, Alembic, python-jose, pydantic-ai | MIT |
| Uvicorn, Starlette, HTTPX | BSD-3-Clause |
| bcrypt, OpenAI Python SDK | Apache-2.0 |
| cryptography | Apache-2.0 OR BSD-3-Clause |
| email-validator | Unlicense |
| psycopg 3 | LGPL-3.0 (used as an unmodified library) |

## External tools (not distributed)

DWG conversion on the optional server calls [LibreDWG](https://www.gnu.org/software/libredwg/) (`dwg2dxf` /
`dxf2dwg`, GPL-3.0) as a separate program when it is installed. It is not bundled with Cota.

## Standards

Linetype and hatch pattern definitions follow common drafting conventions (ISO 128 and ANSI line and pattern
families). Dimension styles include presets for ISO 129 and IRAM 4513.
