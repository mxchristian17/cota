# Third-party notices

Cota itself is licensed under the [Apache License 2.0](LICENSE). It uses the following third-party software, each
under its own license. Full license texts are included in each package's distribution.

## Web app (bundled into the build)

The build ships the full text of these licenses in `THIRD_PARTY_LICENSES.txt`
(source: [`services/web/public/THIRD_PARTY_LICENSES.txt`](services/web/public/THIRD_PARTY_LICENSES.txt)), linked
from the Help dialog.

| Package | Version | License |
| --- | --- | --- |
| [React](https://react.dev) / React DOM / Scheduler | 18.3 | MIT |
| [three.js](https://threejs.org) | 0.169 | MIT |
| [three-bvh-csg](https://github.com/gkjohnson/three-bvh-csg) | 0.0.16 | MIT |
| [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh) | 0.7 | MIT |
| [Zustand](https://github.com/pmndrs/zustand) | 5.0 | MIT |

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
