OpenCascade solid kernel used by Cota
=====================================

This folder holds the exact solid kernel that Cota loads on demand, in a Web Worker, when a drawing has solids:

  occt-wasm.wasm   Open CASCADE Technology (OCCT) 8.0.1 compiled to WebAssembly by occt-wasm 5.17.1
  occt-wasm.js     its Emscripten loader

Both files are distributed unmodified, exactly as published in the npm package occt-wasm 5.17.1. They are
licensed under the GNU Lesser General Public License version 2.1 (LICENSE_LGPL_21.txt) with the Open CASCADE
exception (OCCT_LGPL_EXCEPTION.txt). The occt-wasm build scripts, C++ facade and TypeScript wrapper are
MIT-licensed (occt-wasm-LICENSE-MIT.txt). The rest of Cota is licensed under the Apache License 2.0 and only
talks to this module through its JavaScript interface.

This software is based on facilities provided by the Open CASCADE Technology software
(https://dev.opencascade.org).

Corresponding source code
-------------------------
- occt-wasm 5.17.1 (build scripts and C++ facade): https://github.com/andymai/occt-wasm/tree/v5.17.1
  (commit 3376af4107385fea1ef33e026aea7ae487f6624f)
- OCCT, the fork pinned by that release as a git submodule (OCCT 8.0.1 plus fixes):
  https://github.com/andymai/OCCT/tree/c7f60ffe85f28c67358d1771454044f0521f2fdd
- Each Cota release also attaches both, as a source archive (cota-occt-source-<version>.tar.gz), next to the app.

Replacing the module
--------------------
You may replace occt-wasm.wasm and occt-wasm.js with your own build of the same occt-wasm version (for example
with a modified OCCT): build it from the sources above and put the two files in this folder of your Cota
installation (or of the built app, under occt/<version>/). Cota loads whatever files are served here.
