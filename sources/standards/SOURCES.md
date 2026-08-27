# Standards-first skill graph derivation

**The skill graph derives from the standards and their design documents,
not from any textbook's table of contents.** Textbooks (OpenStax, IM) are
implementations of the standards; deriving our graph from them inherits
their editorial slicing AND their license churn (both have drifted to NC
terms in recent editions). The standards layer has no such problem and is
the actual spec.

## The three source layers

1. **CCSS-M standards** (thecorestandards.org) — the node vocabulary.
   Copyright 2010 NGA Center/CCSSO under their own public license: NOT a
   CC license. Royalty-free copy/publish/display with the attribution
   notice; NO revising, editing, or recasting of the standards text; but
   inclusion "in larger works published by the Licensee, even if such
   larger works are sold" is expressly permitted.
   - What we actually need is unproblematic either way: standard IDs
     (6.EE.B.7) and the concepts they describe are facts/methods, not
     protectable expression. Tag skills with IDs freely. If we ever quote
     a standard's text verbatim in shipped content, carry the notice:
     "© Copyright 2010. National Governors Association Center for Best
     Practices and Council of Chief State School Officers. All rights
     reserved."
2. **The Coherence Map** (achievethecore.org/coherence-map — Student
   Achievement Partners, still hosted) — the prerequisite skeleton. A
   directed graph over K–8 CCSS-M: solid arrows A→B mean "a student who
   cannot meet A is not likely to meet B" (prerequisite); dashed lines
   mean related. This is a public annotation of public standards and
   encodes SAP's editorial judgment — treat it as the default backbone,
   overridable by our own mastery data.
3. **The Progressions documents** — the design rationale and the WIDGET
   BACKLOG. Written by the standards' lead authors (McCallum et al.);
   the university site is gone, current home is mathematicalmusings.org,
   which hosts Cathy Kessel's 2023 final compiled PDF of all
   progressions. Each progression explains why a standard sits in its
   grade, what representations are expected (tape diagrams, double
   number lines, area models — with figures), and the known misconception
   sequences. When a progression says "students move from double number
   lines to tables to equations," that is three widget types and an
   ordering. Cite structure and representation choices freely; REDRAW
   figures, never lift them.

## The derivation pipeline

standards backbone (Coherence Map edges) → decompose each standard into
mastery-sized skills (a standard like 7.RP.A.2 is 6–10 skills; the
decomposition is OURS, guided by the progression's narrative and
misconception ordering, LLM-assisted, human-reviewed) → representations
per skill from the progression → widgets per the Golden Widget standard →
parameterized item templates (`generator` + `verify:` — answers computed,
never asserted; the LLM writes TEMPLATES, validation stays mechanical).

Every skill carries `standards: [<CCSS ids>]`. Prereq edges default to
the Coherence Map's arrows at standard granularity, refined within a
standard by our own decomposition.

## Where IM/OpenStax still fit

They remain REFERENCE implementations: consult them to see which
representation a working curriculum chose for a standard (widget concepts
— number lines, tape diagrams, hangers — are unprotectable methods of
instruction), and mine the CC BY-pinned editions for diagrams to
translate (see `../illustrative-mathematics/SOURCES.md`,
`../openstax/SOURCES.md`). What we never do is take their problem text,
images, or lesson narratives from NC editions, or their section structure
as our skill graph (a textbook section is a reading order, not a graph —
see CLAUDE.md).

## The state-standards caveat

CCSS covers most states; Texas (TEKS), Virginia (SOL), Florida (BEST)
and a few others diverged. Build the graph on CCSS node IDs and keep a
mapping layer to state codes — several divergent states publish their own
crosswalks to CCSS to start from. Never fork the graph per state.
