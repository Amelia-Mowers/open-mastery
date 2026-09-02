#!/usr/bin/env python3
"""Extract the Coherence Map's edge list as CCSS code pairs.

The committed coherence-edges.json holds only FACTS — which standard
depends on which (bare code pairs) — extracted from the cached data.js;
SAP's expression (descriptions, progression notes, example problems)
stays in the gitignored cache. Codes are built standard → cluster →
domain: "{grade}.{domain}.{cluster}.{ordinal}" (e.g. 6.EE.B.7).

  python3 extract-coherence-edges.py cache/coherence-map-data-<date>.js
"""
import json
import re
import sys
from datetime import date
from pathlib import Path

src = Path(sys.argv[1] if len(sys.argv) > 1 else sorted(Path(__file__).parent.glob('cache/coherence-map-data-*.js'))[-1])
raw = src.read_text()
data = json.loads(raw[raw.index('=') + 1 :].strip().rstrip(';'))
st, cl, dom = data['standards'], data['clusters'], data['domains']


def code(sid: str) -> str:
    r = st[sid]
    c = cl[r['ccmathcluster_id']]
    d = dom[c['ccmathdomain_id']]
    return f"{d['grade']}.{d['ordinal']}.{c['ordinal']}.{r['ordinal']}"


codes = sorted(code(sid) for sid in st)
assert len(codes) == len(set(codes)), 'code collision — mapping broke'

out = {
    'source': 'https://achievethecore.org/coherence-map/data.js',
    'fetched': re.search(r'(\d{4}-\d{2}-\d{2})', src.name).group(1) if re.search(r'\d{4}-\d{2}-\d{2}', src.name) else str(date.today()),
    'note': 'solid arrows (prereq): "a student who cannot meet A is not likely to meet B"; related: dashed links',
    'standards': codes,
    'prereq': sorted({(code(e['from']), code(e['to'])) for e in data['edges']}),
    'related': sorted({(code(e['from']), code(e['to'])) for e in data['nd_edges']}),
}
dest = Path(__file__).parent / 'coherence-edges.json'
dest.write_text(json.dumps(out, indent=1))
print(f"{len(out['standards'])} standards, {len(out['prereq'])} prereq edges, {len(out['related'])} related → {dest.name}")
