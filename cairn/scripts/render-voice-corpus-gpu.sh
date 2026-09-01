#!/usr/bin/env bash
# GPU corpus render (~20x CPU on an RTX 3080 Ti). Needs the CUDA 12
# runtime + cuDNN 9 shared libs, which NixOS does not ship: the .so
# files inside NVIDIA's pip wheels work as-is. To (re)build the cache,
# download the manylinux x86_64 wheels for
#   nvidia-cuda-runtime-cu12 nvidia-cublas-cu12 nvidia-cudnn-cu12
#   nvidia-cufft-cu12 nvidia-curand-cu12 nvidia-cuda-nvrtc-cu12
# from PyPI, unzip them, and collect */lib/*.so* into $LIBS.
# /run/opengl-driver/lib supplies the driver's libcuda.so.1.
set -euo pipefail
LIBS="${CAIRN_CUDA_LIBS:-$HOME/.cache/cairn-cuda-libs}"
if [ ! -e "$LIBS/libcudnn.so.9" ]; then
  echo "CUDA runtime libs not found at $LIBS — see the comment in this script" >&2
  exit 1
fi
cd "$(dirname "$0")/.."
VOICE_DEVICE=cuda LD_LIBRARY_PATH="$LIBS:/run/opengl-driver/lib" \
  exec node --experimental-transform-types scripts/render-voice-corpus.ts
