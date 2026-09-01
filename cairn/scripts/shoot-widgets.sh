#!/usr/bin/env bash
# Programmatic widget review: screenshot EVERY curriculum explanation at its
# final (resolved) timeline state via the demo build's ?view=zoo&exp=<id>
# mode, then tile contact sheets for human/model review.
# Usage: scripts/shoot-widgets.sh <out-dir> [port]
set -e
OUT=${1:?out dir}
PORT=${2:-4890}
CHROMIUM=${CHROMIUM:-$(ls -d /nix/store/*chromium-*/bin/chromium 2>/dev/null | sort | tail -1)}
mkdir -p "$OUT/each"
cd "$(dirname "$0")/.."
[ -f dist-demo/index.html ] || npm run build:demo
(cd dist-demo && python3 -m http.server $PORT >/dev/null 2>&1) &
SRV=$!
trap "kill $SRV 2>/dev/null" EXIT
sleep 1
IDS=$(node -e "
const b = require('./src/client/demo/bundle.json')
console.log(b.explanations.map(e => e.id).join('\n'))")
for id in $IDS; do
  "$CHROMIUM" --headless --disable-gpu --window-size=760,760 --virtual-time-budget=60000 --run-all-compositor-stages-before-draw \
    --screenshot="$OUT/each/$id.png" \
    "http://localhost:$PORT/?student=shoot&view=zoo&exp=$id" 2>/dev/null
done
# contact sheets: 3x3 tiles, scaled
cd "$OUT/each"
ls *.png | sort | split -l 9 - /tmp/sheet-batch-
n=0
for batch in /tmp/sheet-batch-*; do
  n=$((n+1))
  mapfile -t files < "$batch"
  args=(); for f in "${files[@]}"; do args+=(-i "$f"); done
  count=${#files[@]}
  ffmpeg -y -loglevel error "${args[@]}" \
    -filter_complex "$(for i in $(seq 0 $((count-1))); do printf '[%d]scale=380:-1,pad=384:520:2:2:white[t%d];' $i $i; done; for i in $(seq 0 $((count-1))); do printf '[t%d]' $i; done; printf 'xstack=inputs=%d:layout=' $count; for i in $(seq 0 $((count-1))); do col=$((i%3)); row=$((i/3)); printf '%s%d_%d' "$([ $i -gt 0 ] && echo '|')" $((col*384)) $((row*520)); done)" \
    "../sheet-$n.png" 2>/dev/null || echo "sheet $n failed"
  rm "$batch"
done
echo "done: $(ls *.png | wc -l) shots, $(ls ../sheet-*.png 2>/dev/null | wc -l) sheets"
