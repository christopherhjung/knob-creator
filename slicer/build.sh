#!/usr/bin/env bash
# Compiles CuraEngine to WebAssembly into slicer/engine/. The output is committed,
# so this only needs to run again to change the engine version.
# Needs: emscripten, cmake, ninja.
set -euo pipefail

ENGINE_VERSION=4.13.2 # the last release that builds without Conan

cd "$(dirname "$0")"
BUILD="$PWD/.build"
OUT="$PWD/engine"
mkdir -p "$BUILD" "$OUT"

[ -d "$BUILD/CuraEngine" ] || git clone -q --depth 1 --branch "$ENGINE_VERSION" \
  https://github.com/Ultimaker/CuraEngine "$BUILD/CuraEngine"
[ -d "$BUILD/stb" ] || git clone -q --depth 1 https://github.com/nothings/stb "$BUILD/stb"

# Replaces the one use of threads, which this build doesn't have.
git -C "$BUILD/CuraEngine" checkout -q -- .
git -C "$BUILD/CuraEngine" apply "$PWD/engine.patch"

COMPILE_FLAGS="-fexceptions -O3 -w" # -w: the old sources warn on nearly every file
LINK_FLAGS="-fexceptions -O3 \
  -sMODULARIZE -sEXPORT_ES6 -sEXPORT_NAME=createCuraEngine \
  -sENVIRONMENT=worker,node -sINVOKE_RUN=0 -sEXIT_RUNTIME=0 \
  -sALLOW_MEMORY_GROWTH -sMAXIMUM_MEMORY=2GB -sSTACK_SIZE=8MB \
  -sFORCE_FILESYSTEM -sEXPORTED_RUNTIME_METHODS=FS,callMain,ENV"

# The extra optimization flags add -Ofast, which assumes infinity never occurs. The
# path optimizer starts its searches from infinity, so it then finds no paths at all
# and the G-code comes out empty.
emcmake cmake -S "$BUILD/CuraEngine" -B "$BUILD/out" -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DENABLE_MORE_COMPILER_OPTIMIZATION_FLAGS=OFF \
  -DCMAKE_POLICY_VERSION_MINIMUM=3.5 \
  -DENABLE_ARCUS=OFF \
  -DENABLE_OPENMP=OFF \
  -DBUILD_TESTS=OFF \
  -DStb_INCLUDE_DIRS="$BUILD" \
  -DCMAKE_CXX_FLAGS="$COMPILE_FLAGS" \
  -DCMAKE_C_FLAGS="$COMPILE_FLAGS" \
  -DCMAKE_EXE_LINKER_FLAGS="$LINK_FLAGS"
# -k 0 reports every failing file at once instead of stopping at the first.
cmake --build "$BUILD/out" --target CuraEngine -- -k 0 2>&1 | tee "$BUILD/build.log"

# Keep these names: the .js loads CuraEngine.wasm, and Linux and GitHub Pages are case-sensitive.
cp "$BUILD/out/CuraEngine.js" "$BUILD/out/CuraEngine.wasm" "$OUT/"
cp "$BUILD/CuraEngine/LICENSE" "$OUT/LICENSE-CuraEngine"
