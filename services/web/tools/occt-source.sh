#!/usr/bin/env bash
# Arma el archivo con el código fuente del núcleo de sólidos (LGPL-2.1, OpenCascade) que se adjunta a cada release.
# Uso (desde services/web): tools/occt-source.sh [carpeta de salida]
# Baja de GitHub (gratis, sin cuenta) occt-wasm en el tag de la versión instalada y el commit de OCCT que ese tag
# fija como submódulo, y los empaqueta con las licencias y el README del módulo. No modifica nada del repo.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-dist-occt-source}"
VERSION="$(node -p "require('./node_modules/occt-wasm/package.json').version")"
TAG="v${VERSION}"
OCCT_SHA="$(curl -fsSL "https://api.github.com/repos/andymai/occt-wasm/contents/occt?ref=${TAG}" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).sha))')"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
NAME="cota-occt-source-${VERSION}"
mkdir -p "$WORK/$NAME"
echo "occt-wasm ${TAG} + OCCT ${OCCT_SHA}"
curl -fsSL "https://codeload.github.com/andymai/occt-wasm/tar.gz/refs/tags/${TAG}" -o "$WORK/occt-wasm.tar.gz"
curl -fsSL "https://codeload.github.com/andymai/OCCT/tar.gz/${OCCT_SHA}" -o "$WORK/occt.tar.gz"
tar -xzf "$WORK/occt-wasm.tar.gz" -C "$WORK/$NAME"
mv "$WORK/$NAME/occt-wasm-${VERSION}" "$WORK/$NAME/occt-wasm"
rmdir "$WORK/$NAME/occt-wasm/occt" 2>/dev/null || true
tar -xzf "$WORK/occt.tar.gz" -C "$WORK/$NAME/occt-wasm"
mv "$WORK/$NAME/occt-wasm/OCCT-${OCCT_SHA}" "$WORK/$NAME/occt-wasm/occt"
cp vendor/occt/README.txt vendor/occt/LICENSE_LGPL_21.txt vendor/occt/OCCT_LGPL_EXCEPTION.txt "$WORK/$NAME/"
mkdir -p "$OUT"
tar -czf "$OUT/${NAME}.tar.gz" -C "$WORK" "$NAME"
ls -l "$OUT/${NAME}.tar.gz"
