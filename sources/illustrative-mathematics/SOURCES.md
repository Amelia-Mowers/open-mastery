# Illustrative Mathematics — provenance and representation mining

**Only the FIRST EDITION (© 2017–2019 Open Up Resources, © 2019 Illustrative
Mathematics) is CC BY 4.0** and usable in this catalog. IM v.360 (© 2024+)
is CC BY-NC and excluded — see `../openstax/SOURCES.md` for the policy.
License statements verified on-page 2026-08-26.

Access points (first edition):
- https://im.kendallhunt.com/MS/students/{grade}/{unit}/{lesson}/index.html
  (grade 1 = Grade 6, 2 = Grade 7, 3 = Grade 8)
- https://access.openupresources.org/curricula/our6-8math/ (OUR mirror)

No public source repos exist (unlike OpenStax) — mining is from the
published pages; keep per-record `source:` citations to grade/unit/lesson.

## Representation inventory (widget-worthy diagrams)

OpenStax Prealgebra teaches mostly through color-coded worked steps with few
diagrams; IM is diagram-first. Verified inventory:

### 1. Hanger diagrams — Grade 6 Unit 6 Lesson 3 "Staying in Balance"
Balanced hangers where each side holds SHAPES: a variable is n copies of a
shape (3x = three circles), knowns are labeled rectangles. Solving is
physical: remove equal weights from both sides (subtraction), split the
hanger into equal groups (division). Richer than our balance-scale tiles —
the coefficient is VISIBLE as object count. Planned upgrade path for the
`balance-scale` widget (multi-copy weights) or a distinct `hanger-diagram`
widget; also the natural intro for §8.1 (add/subtract properties).

### 2. Tape diagrams — Grade 7 Unit 6 Lessons 2–3
A bar split into equal parts (each labeled x, x+2, w−2…), optional known
segments, with a brace for the total. Models ax = b, ax + c = b, and
a(x + c) = b — the whole two-step chapter. **Implemented as the
`tape-diagram` widget** (first used by prealg.lineq.multiply).

### 3. Area/rectangle diagrams — Grade 6 Unit 6 Lesson 10
"The Distributive Property, Part 2": a rectangle 3 × (2 + x) partitioned
into 3×2 and 3×x demonstrates 3(2+x) = 6 + 3x by area. The right
representation for our simplify-first distribute family (−a(x − b)) and
later equivalent-expressions work. Widget candidate: `area-model`.

### Also noted (later chapters)
- Number-line arrows for signed-number operations (Grade 7 Unit 5).
- Double number lines / ratio tables (Grade 6 Units 2–3).
