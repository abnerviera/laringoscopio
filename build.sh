#!/bin/sh
# Compila src/vl3d.js (incluye three.js, licencia MIT) en vl3d.min.js
# Uso: npm i three esbuild  (en THREE_DIR, por defecto /tmp/npm3) y luego ./build.sh
THREE_DIR=${THREE_DIR:-/tmp/npm3}
"$THREE_DIR/node_modules/.bin/esbuild" src/vl3d.js --bundle --minify --format=iife --target=es2019 \
  --legal-comments=eof --alias:three="$THREE_DIR/node_modules/three/build/three.module.js" --outfile=vl3d.min.js
