#!/usr/bin/env bash
# Snapshot the standards-layer reference sources into cache/ (gitignored —
# neither carries a redistribution license, so like the OpenStax corpus
# they are FETCHED, not committed; see SOURCES.md "Local backups").
# Re-run to refresh; then re-run extract-coherence-edges.py and diff the
# committed coherence-edges.json to see whether SAP's graph changed.
set -euo pipefail
cd "$(dirname "$0")/cache"
stamp=$(date +%F)

# The Coherence Map's complete dataset: every CCSS-M standard plus the
# prerequisite (edges) and related (nd_edges) graph, as one JS blob.
curl -sf "https://achievethecore.org/coherence-map/data.js" \
  -o "coherence-map-data-$stamp.js"
echo "coherence map: $(wc -c < "coherence-map-data-$stamp.js") bytes"

# Cathy Kessel's 2023 final compiled Progressions PDF (design rationale +
# expected representations per standard).
curl -sf "https://mathematicalmusings.org/wp-content/uploads/2023/05/Progressions.pdf" \
  -o "progressions-kessel-2023.pdf"
echo "progressions: $(wc -c < progressions-kessel-2023.pdf) bytes"
