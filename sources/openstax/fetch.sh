#!/usr/bin/env bash
# Fetch the OpenStax corpus at the pinned CC BY 4.0 revisions (see SOURCES.md).
set -euo pipefail
cd "$(dirname "$0")"

fetch() {
  local repo="$1" sha="$2"
  if [ ! -d "$repo/.git" ]; then
    git clone --depth 1 "https://github.com/openstax/$repo"
  fi
  git -C "$repo" fetch --depth 1 origin "$sha"
  git -C "$repo" -c advice.detachedHead=false checkout "$sha"
  head -1 "$repo/LICENSE" | grep -q '^Attribution 4.0 International' \
    || { echo "ERROR: $repo@$sha is not CC BY 4.0 — refusing to proceed" >&2; exit 1; }
  echo "ok: $repo @ $sha (CC BY 4.0)"
}

fetch osbooks-prealgebra-bundle 77a933c672e9c48c746eb802d588a9a7ddfd6e0d
fetch osbooks-algebra-1 a277f9bb2abcc90d201a66879973463a45e5eaa4
