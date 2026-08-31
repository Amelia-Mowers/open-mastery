# Curriculum authoring notes



## COPY GUIDELINES (2026-08-30) — every caption, prompt, and hint

One session of review rejected the same fault a dozen times, so it is now
a rule. The fault: copy about the ACT OF ANSWERING instead of the
mathematics. "What number finishes this line?", "What goes in the next
row?", "what is the missing value?", "what is the move?" all describe the
interface or hedge the question — they could sit over any problem in the
catalog, which is exactly what's wrong with them.

**The test: could this sentence be pasted onto a different problem
unchanged? Then it says nothing. Rewrite it with this problem's own
numbers and objects.**

1. **Ask the mathematical question with the actual quantities in it.**
   "How much does each Pack-A pencil cost?" — never "What number finishes
   this line?" The rendered values belong in the sentence: "$12 shared
   over 3 pounds — what does ONE pound cost?"
2. **Name what the move acts ON.** "To find ONE pound's price, what do
   you do to the $90?" — the move applies to the dollars; "from all 6
   pounds to just ONE — what is the move?" described the journey and
   named the wrong noun.
3. **The board is scenery, never the subject.** Lines, rows, boxes, and
   steps are how the mathematics is displayed. Questions about them
   ("finishes this line", "goes in the next row", "what line is left")
   assess reading the screen, not the skill.
4. **Speak a representation's language only while it is on screen.**
   "row" belongs to a visible table; with a pair input it is a widget
   holdover ("write the ratio", not "write the row"). Pans for the
   balance, sides for the board, pieces for the tape — and none of them
   anywhere else.
5. **No meta-commentary about the method.** "The shortcut — one move
   instead of two" editorializes; the method just IS ("What one factor
   frees x?"). Same for praising, hedging, or narrating the lesson's
   structure.
6. **House voice:** short declaratives; an em-dash pivot into the
   question; ONE stressed word in caps where the stress does real work
   (ONE, BOTH, WHOLE, the REST); the question mark lands at the end of
   the caption that fronts the input asking it.
7. **THE PROBLEM IS DEFINED IN THE FIRST FRAME.** The opening board
   states everything the problem is — the given, the relationship in
   words where one exists ("y is proportional to x"), and the question
   line ("1 pound costs $?", "k = ?", "y = ? when x = 7") — as ONE
   equal-emphasis group (a `line:` array in the t0 patch). A target that
   lives only in captions until the board suddenly answers it was
   reported three times in one session (missing-value, constant-k,
   equation).

The moments are fixed by the invariants — setup caption before a gate,
prompt while it is open, confirmation after, one closing question with
the box ([lead_ends_quiet], [double_ask], [gate_telegraph],
[gate_takes_answer]). These guidelines govern what the words say at each
of those moments.

## Misconception diagnosis (2026-08-28) — the standard

A wrong answer should tell the student WHAT THEY DID, not just that they
missed. Both the final answer and every stepwise gate take an optional
`misconceptions:` list; each entry is
`{ id, when, says }`:

- **`id`** — lower-kebab-case, stable, and named for the ERROR, not the
  value (`added-instead-of-subtracted`, not `answer-29`). It is the
  aggregation key: the same id across items is the same misunderstanding,
  which is what makes "this student keeps inverting operations" a
  question the data can answer.
- **`when`** — a cairn-expr template producing the value that error
  yields under these params (`"{2*p+d}"`), or, at an `op` gate, the MOVE
  it produces (`"divide {a}"`). Matching is by VALUE, not spelling: "29",
  "x = 29" and "21 + 8" are one mistake.
- **`says`** — child-facing, templated, and it must do three things:
  name the move the student made, say why it doesn't work here, and
  point at the fix. Never scold, never merely restate the rule.

Author them for errors that are *predictable from the mathematics* —
inverse-operation slips, sign flips, off-by-one, operating on one side
only, dividing before clearing a term. Do not invent exotic ones: an
unanticipated miss falls back to the generic line, which is correct
behaviour, not a gap.

A `when` may be a NUMBER (most items) or a SYMBOLIC expression — for
expand/combine/write-expression the wrong answer is a different
expression, not a different value, and both are matched by equivalence.

**Invariants:** `[misconception_correct]` errors if a `when` ever equals
(or is equivalent to) the real answer under the authored params or any
generator seed — a diagnosis that fires on a correct answer is the one
thing this system must never do; `[misconception_shape]` and
`[misconception_dup]` catch unparseable templates and duplicate ids; and
`[no_misconceptions]` warns on any item with none, so the coverage gap
is always visible. cairn's `diagnosis-coverage.test.tsx` additionally
replays every authored misconception through the grader — one that
doesn't match its own wrong answer is decorative and fails the build.

Watch for templates that can COLLIDE on some generator seeds: `{a/b}`
as "divided the wrong way" equals `{b/a}` whenever a = b, which the
seed sweep caught. Prefer an error that is structurally distinct from
the answer.

## Every timeline is workable, and items rotate through the reps

Two invariants keep the stepwise promise honest:

- `[no_stepwise]` — the stepwise lead DROPS the final content step
  (it is the resolution the student supplies), so a timeline whose only
  gate sits there plays as a movie. Gate a step BEFORE the resolution.
- Items carry `representation`, and the engine teaches an unseen
  representation before serving an item framed in it. So a skill's items
  should ROTATE across its explanations — if every item declares the same
  rep, the student sees one picture forever no matter how many the skill
  teaches. (24 of 26 skills rotate; the two that don't have only one
  item family each.) Watch `[form_mismatch]` when re-pointing: a rep
  whose banner phrasing doesn't match the item's stem is a wrong-form
  risk, not a rotation.

## `form: expanded` means SIMPLIFIED, not merely bracket-free

Symbolic equivalence accepts the line already on the board: asked to
expand `3(2x + 5)`, a student could type `3*2x + 3*5` and be marked
correct, having demonstrated nothing — producing the simplified form IS
the skill. `form: expanded` now rejects pending arithmetic (a number
times a number, or times a coefficient) as well as parentheses.

GATES take `form` too. Without it a stepwise gate accepts the
unsimplified line even when its item would not — the same answer graded
two different ways depending on where it was typed.

## Answers must be FINISHED (form: evaluated)

`59 − 25` evaluates to the right number but is arithmetic the student
still owes. Any item whose answer is a computed value carries
`form: evaluated`, which requires the submission's value side to be a
literal number. Use it wherever carrying out the computation IS the
skill; leave it off where an expression is the legitimate answer
(expand, combine, write-expression).

## Stepwise gates (2026-08-27)

Passive timelines are DEPRECATED — the validator warns `[no_expects]`
on any explanation with no `expect` gates. Author gates on the steps
that ARE moves: decomposition entrances = `pick` (value = the
eqHighlight indices), both-sides operations = `op` ("<word> <operand>"),
worked lines = `expr` (the clean resulting equation: first `=` segment
+ last), value reveals = `numeric`. Every gate must accept its own
rendered key — cairn's test/client/stepwise-coverage.test.tsx drives
each one and fails the build otherwise; the validator statically
rejects unparseable expr/numeric values and malformed op/pick shapes
([expect_shape]).

Gate-quality invariants — `[gate_tells]` and the `[gate_telegraph]`
tightening were added 2026-08-29, after a full review found these faults
spread across the catalog rather than isolated:
`[gate_tells]` (a prompt that instructs, or asks nothing at all),
`[gate_telegraph]` (the answer or the move already on screen — reads the
caption AND the whiteboard note, with no exemption for gates whose prompt
names their own move: that exemption was what let a telling caption and a
"Do it" prompt stack into one dead step), and `[gate_moves_nothing]` (a
gate whose patch does not change the diagram).

## The skill graph derives from STANDARDS, not textbooks

Textbooks implement the standards; deriving our graph from a textbook
inherits its editorial slicing and its license churn (both OpenStax and
IM drifted to NC terms in recent editions). Derive from the source:
CCSS-M standard IDs are the node vocabulary, the Coherence Map
(achievethecore.org) is the default prerequisite backbone, and the
Progressions documents (mathematicalmusings.org, 2023 compiled PDF) are
the design rationale AND the widget backlog — they name the expected
representations and their ordering per standard. A standard is too
coarse to be a mastery node: decompose it into skills (the decomposition
is OURS — LLM-assisted, human-reviewed), tag every skill with
`standards: [<CCSS ids>]`, and read the standard's actual text before
tagging (6.EE.B.7 is NONNEGATIVE-only — that's why negate is 6.NS.C.6a +
7.EE.B.4a, and why fraction-coefficient reciprocal IS 6.EE.B.7).
Licensing, links, pipeline, and the state-crosswalk caveat:
`sources/standards/SOURCES.md`.

## Pick the representation that can SHOW the operation

A bar of four squares does not show cubing — it shows four of something.
When a picture cannot perform the operation, it is the wrong picture no
matter how well it is built: cube's tape was replaced by the area model
(the square as ONE layer, per the ee-slab's own "c² as a literal square"
note), with the cube-model timeline carrying the stacking. Check the slab
notes and the IM inventory below before authoring; queue a widget rather
than forcing a representation that cannot move the way the maths does.

## Representation sourcing: mine Illustrative Mathematics FIRST

OpenStax Prealgebra teaches through worked symbolic steps and has few
diagrams. **Illustrative Mathematics 6–8 (FIRST EDITION ONLY) is the
diagram quarry** — when authoring a new skill, check IM's treatment of the
topic before inventing a representation, and translate its diagrams into
widgets/explanation timelines.

- Inventory + verified license notes: `sources/illustrative-mathematics/SOURCES.md`
- First edition (© 2017–2019 OUR / © 2019 IM) is CC BY 4.0 — usable.
  **IM v.360 (© 2024+) is CC BY-NC — never derive from it.** Same rule as
  OpenStax: the catalog is CC BY 4.0 only (see `sources/openstax/SOURCES.md`).
- Access: https://im.kendallhunt.com/MS/students/{1|2|3}/{unit}/{lesson}/index.html
  (1 = Grade 6). Cite grade/unit/lesson in each derived record's `source:`.

Implemented so far: tape diagram (G7 U6 L2–3), hanger diagram (G6 U6 L3),
area model (G6 U6 L10), plus OpenStax's envelopes-and-counters (§3.5).

## Representation decisions go IM FIRST, fleet LAST

The order is not a preference, it is the sequence. Reuse is a
CONCLUSION you reach, never the assumption you start from.

1. **Read Illustrative Mathematics first edition** for the matching
   standard — its actual lesson pages, not a memory of them. What does
   IM use to teach this, and what does that picture DO that the maths
   needs done?
2. **Check the Progressions figures** for the domain — they name the
   expected representations and their ordering per standard.
3. **Decide what the representation should BE**, and write it down,
   before looking at what exists.
4. **Only then ask whether the fleet already is that thing.** If a
   widget matches the decision, reuse it. If it merely *could be made
   to* fit, that is not a match — queue the new widget.

Starting from the fleet is how we shipped wrong pictures twice: the
simplify-first number line (removed — a line cannot show combining like
terms) and cube's bar model (replaced by the area model — a bar of four
squares shows four of something, never cubing). Both were "make it fit
what we have"; both cost more to undo than the right widget would have
cost to build. New widgets are cheap; a wrong picture teaches a wrong
idea and is caught late.

Budget for this. A slab in a domain the fleet does not already cover
(8.EE/8.F graphs, SP plots, G scale drawings and angle figures) is
FLEET-BUILDING work, not authoring work, and should be planned at the
first slab's rate rather than the saturated rate EE hit.

## Don't map textbook sections to skills naively

A textbook section is NOT a skill. OpenStax §8.2 quietly contained three
equation forms (ax = b, x/a = b, -x = b) — the last snuck in as "an
example" and initially got no coverage of its own. When converting a
section: FIRST enumerate every distinct equation/problem FORM it contains
(scan the examples and exercise sets), then decide the skill split — one
skill per form that needs its own explanation, with prereq edges between
them. The book's section structure is a reading order, not a skill graph.

## The programmatic-widget standard

**Every equation FORM gets explicit representation coverage — never
implied.** The DANGEROUS case is identifier overlap: feedableParams
checks identifier presence only, so an item of a different form that
reuses the same param names (x − p = q sharing p,d with x + p = q) will
happily feed the WRONG timeline with its numbers — a student asking
"show me how" on a subtraction problem got an addition walkthrough
labeled "same numbers". Different form ⇒ different skill, even when the
identifiers line up. If an item family's shape differs from its skill's explanations
(different identifiers, different structure — e.g. -x = b vs x/a = b), it
is a smell: split it into its own skill with explanations and, if needed,
its own widget/animation authored against ITS params. Widgets are
programmatic: they render from the actual instance variables, and a lesson
that silently falls back to another family's numbers is a bug, not a
feature.

**Identifier discipline:** item families within a skill may share
identifier names ONLY when they share the exact answer formula (same
form). Different-form families must use DISJOINT names so they can never
feed each other's timelines — enforced by [resolution_answer] (ERROR:
any explanation an item's params can feed must state that item's answer
in its resolution) and [form_mismatch].

**Every skill carries at least THREE distinct representations, and one
of them is the whiteboard (`worked-equation`) — but the whiteboard NEVER
leads instruction** (instruction[0] must be a concrete model; worked is
what the models fade toward; validator warns [worked_primary]) — two concrete models
plus the symbolic form the concrete ones fade toward. The validator
warns ([representation_count], [worked_missing]) below the floor.
Prefer worked-equation over caption-only timelines, always.

**Inputs are widgets too.** Where the representation IS the answer space,
let the student answer by manipulating it (e.g. negate items answer by
moving the dot on a number line; `min`/`max`/`step` config values may be
cairn-expr templates evaluated per instance). Direct text entry is the
fallback, not the default.

## `instruction:` IS the priority order

A skill's `instruction` list ranks its representations best-first, and
every chooser reads it in order: the first lesson, "show me differently",
the corrective ladder. Put the representation that explains the idea most
plainly first; the whiteboard is never first (it is what the concrete
models fade toward, [worked_primary]); the weakest fit goes last. Loading
order is NOT priority — buildIndex sorts by this list.

## Number lines: the axis must contain the walk

`min`/`max`/`step` define the ticks, and a number line can only mark,
label or arc to a value that IS a tick. A walk starting at {b} and
stepping by {c} needs `min: "{b}"` — anchoring at 0 makes every value the
timeline names fall between ticks, and the line renders utterly blank.
cairn's lesson-coverage test checks every marker, `labelled` entry and
arc endpoint against the axis it declares.

## A representation must not print the answer

If the picture already shows the result, the student reads it instead of
reasoning — the evaluate number line was labelled 0…{a*c+b}, so the
answer sat on the axis before anything happened. Reveal progressively
(`labelled` on the number line, `cellsIn` on the tape, `reveal` on the
tables) and show each step as a MOVE (`arcs` with their size above the
line, the tape's `removed`, the balance's op badges).

## A GATE ASKS. It never tells the student what to do.

The step the student is asked to work must POSE A QUESTION they answer
from the diagram — never an instruction they execute. "Do it — multiply
both sides by the reciprocal" is not a problem; it is a button labelled
with its own answer, and it teaches nothing.

Two ways this breaks, and both must be checked:

- **The prompt is imperative.** `Do it — …`, `Now subtract 8`, `Multiply
  both sides by 3`. Rewrite as the question the move answers: "The left
  pan holds {p}/{q} of {variable}. What one move leaves exactly one
  {variable}?" Validator: `[gate_tells]` flags imperative openings and
  prompts that name the operation the gate is grading.
- **A caption ANSWERS THE NEXT GATE.** Even a perfect question is dead if
  the caption above it already said "multiply both sides by the
  RECIPROCAL — 2/3 flipped over is 3/2". Scene-setting captions come
  BEFORE their gate; the explanation of a move belongs on the step that
  CONFIRMS it, never on the step that asks. Validator: `[gate_telegraph]`
  (existing) catches the caption; read them together.

The hint is where the method may be stated — a hint is help the student
CHOSE to take. The prompt is the question; the caption before it sets the
scene; the caption after it confirms and explains.

## Ask for the MOVE separately from the RESULT

A both-sides step is two decisions — WHICH move, and WHAT LINE it leaves
— so gate them separately: an `op` gate for the move ("What do you do to
BOTH sides?"), then an `expr` gate for the line it produces.

An open "write the next step" cannot tell them apart. `expr` grades by
equivalence, so `x + 8 − 8 = 21 − 8` and `x = 13` both pass: a student
who skipped straight to the answer looks identical to one who worked the
move, and a miss cannot say which half broke. (Same failure mode the
`form: expanded` / `form: evaluated` guards exist for — equivalence alone
accepts an echo of the stem.)

This also makes the whiteboard ask the way the concrete models already
do: the balance scale takes the move as symbol + operand, and now so does
the board.

Every gate still needs a `prompt`. Without one the player falls back to a
generic line ("Your move — write the next step"), which is both vague and
disconnected from the caption on screen — and note that the caption
DISPLAYED while a gate is open is the one BEFORE it, so a question
written on the gated step itself is never the one the student reads.

## Every timeline must be FEEDABLE by one of its skill's items

A timeline renders with a real item's params. If NO item of the skill can
supply every identifier the timeline uses, the board renders raw `{a*b}`
— content-shaped nonsense that looks like a lesson. That is now a hard
failure in `explanationDemo` (422) and in stepwise-coverage, not a
fallback to whichever item happened to be first.

Two ways to satisfy it, and the choice is the authoring decision:
- give the timeline's own representation an item that carries every
  identifier it needs (constant-k's ratio-table board shows a second row,
  so its item must supply that row's `c`); or
- change the timeline to use only what its items have (percent-of's board
  asked "{p}% of {b}" — identifiers no item defines — when its own
  vocabulary is "{5*f}% of {20*g}").

Both faults were live and invisible until the fallback was removed.

## Ask for the VALUE, not a transcription of the whole line

A gate keyed to a whole equation makes the student retype the parts that
did not change. Asked "the 17s cancel — what line does that leave?", a
student who typed `54` — the correct arithmetic, the actual thinking —
was marked wrong for not writing `6y = 54`. That is assessing
transcription.

Prefer `numeric` on the thing that changed: "The 17s cancel on the left.
What does the RIGHT side come to?" One step, one cognitive demand — load
spent copying an untouched left side is load not spent on the maths.

A whole-equation `expr` key is right only when the equation IS the
answer: "what is {variable}?" wants `x = 4`, and "what is the equation
linking y and x?" wants `y = 3x`. The test is whether the prompt asks for
a LINE or for a VALUE — and it must agree with the key's type, because
`expr` compares full expressions and will reject the bare number a
value-shaped prompt invites.

## WHEN IN DOUBT, GATE THE OPERATION

If a step performs arithmetic, the student should be the one performing
it. A board that writes `3x + 5 − 5 = 17 − 5` and then produces `3x = 12`
on its own has done the subtraction for them — the very subtraction the
lesson is about. Gate it: "The 5s cancel — what line does that leave?"

The default is to gate. Leave a step ungated only when it genuinely
carries no work: pure scene-setting, a label, a restatement. Anything
where a value CHANGES is a move, and a move is a question.

THE ONE EXCEPTION IS THE FINAL LINE. The last content step states the
answer, and the answer box below the lead already collects it — gating it
asks the same question twice, and the lead drops that step anyway. Gate
the intermediate simplifications; leave the resolution plain.

This is why a five-line board is a five-gate timeline and not a
three-gate one. Gate fatigue is a real cost — see the tuning note in
TODO.md — but silently doing the student's arithmetic is the worse
failure: it looks like teaching and produces nothing.

## Whiteboards show EVERY step — never condensed to save lines

One patch, one line, one move. A board that solves an equation writes the
operation on both sides AND the line it produces, for every step:

    3x + 5 = 17
    3x + 5 − 5 = 17 − 5      ← the move
    3x = 12                  ← what it leaves
    3x ÷ 3 = 12 ÷ 3          ← the move
    x = 4                    ← what it leaves

Not `3x = 17 − 5 = 12`. Chaining two assertions onto one line is the
running-equals-sign habit teachers spend years undoing — modelling it on
the board teaches it — and it hides the move the student is meant to
copy. Condensing to fit fewer lines is never a reason; the board is the
one place where showing all the working IS the content.

A named quantity being evaluated is NOT a chain: `discount = 15% of 80 =
12` and `k = y ÷ x = 6 ÷ 2` state one thing and compute it. The fault is
two different EQUATIONS sharing a line.

This costs steps, and that is correct — a two-step equation is a
five-line board, so it is a five-step timeline. Gate the moves; leave the
result lines plain.

## The last gate resolves to the ANSWER, not a working line

A timeline ENDING on a gate is correct — the lead drops the final content
step because the answer box below it IS the resolution. What must not
happen is the last gate keying to an intermediate line: two-step's ended
on `{a}{variable} = {a*ans} ÷ {a}`, so neither the gate nor the box ever
said what {variable} was and the lesson stopped one move short of solving
the problem. Its key is `{variable} = {ans}` now.

Read the last gate's `value`: after its templates are substituted, the
side after `=` should be a NUMBER, not arithmetic still to do. Validator:
`[ends_mid_solution]`.

(Do not "fix" this by appending a resolution step everywhere. A gate that
already resolves to the answer is finished — the student supplies it in
the box, which is the whole design. An earlier sweep added 47 such steps
before this was understood, and reverted.)

## The LAST gate asks the lesson's own question

A timeline ends by answering the problem it opened with, so its final
gate must pose THAT question — "So what is {p}% of {b}?", "Simplify —
what is {variable}?" — not the bookkeeping that gets there. "What number
finishes this line?" and "what line is left?" describe the board; they do
not ask the student anything they came to learn.

The penultimate CAPTION does the setting up: it names what is still
outstanding and puts the question in the air ("Two of the factors make
{n}² = {n*n}. One factor of {n} is still waiting. What does {n}³
equal?"), so the closing gate lands on a question already asked.

## Every channel on screen leaks: caption, note, and prompt

`[gate_telegraph]` reads the caption, but the whiteboard `note` is a
second line of text on the same board — "subtract 8 from both sides"
gives the move away exactly as plainly. Notes on a gated step say what
KIND of thing is happening ("the same move on both sides"), never which
one. The specific move goes on the step that confirms it.

The same applies to the prompt itself: a prompt that names the operation
it is grading has answered its own question.

## A prompt must match what the gate GRADES

Rewriting prompts in a batch is where this breaks. compare-rates' final
gate expects Pack B's unit price, so "which pack is the better buy?" —
which reads perfectly — would mark a correct "A" wrong. Before changing
any prompt, read the `value` beside it. `test/client/stepwise-coverage`
drives every gate against its own key and is the backstop, but it only
catches an unanswerable gate, not a misleading one.

## Decomposition can be a COUNT, not just a construction

Translating notation into a discrete quantity IS a decomposition step:
"how many factors of {n} does {n}³ mean?" turns an exponent into a number
of objects, which is what the later steps then group and multiply. Prefer
it to asking for the written-out form when the written form would make
the student type operators (`*`) they do not otherwise write.

Watch for the collision this creates: the answer (3) is the exponent
already PRINTED on the board, so a caption naming the notation looks like
a leak. That is a false positive — `[gate_telegraph]` now normalises
superscripts and reads the board's `start` line, because the fix belongs
in the check, not in the pedagogy. Never reword a sound question to
appease a lint.

## Decomposition BUILDS the diagram, then asks what it makes obvious

A decomposition step is construction, not annotation. The diagram starts
EMPTY and each gate places a piece of the equation into it — "which piece
goes in the FIRST section of the bar?" fills that section; the next gate
fills the next; a later one supplies the total. Pointing at a finished
picture ("this piece is x") teaches nothing the picture didn't already
say, and gives the student nothing to do.

**A gate must MOVE the picture.** The patch on an expect step is the
confirmation the student's answer earns, so it has to change the diagram
— a section leaves and the bar shrinks, a badge lands on both pans, a
row fills, the rectangle grows to its height. A gate that only changes
the caption (or only the equation highlight) means the diagram sat still
while the student worked, and the representation taught nothing.
Validator: `[gate_moves_nothing]`.

The lead must END BY ASKING. It stops one step short of the resolution,
so the last SURVIVING step has to be a gate — otherwise the student is
left staring at a finished diagram with nothing to do, and the answer box
below has to carry a leap the lesson never set up. Validator:
`[lead_ends_quiet]`. In practice this means the penultimate step poses
the question in the diagram's own terms ("the bar is 21 across and 8 is
the second piece — what do you do to 21?") and the final, dropped step
states the resolution.

Then the LAST gate asks the question the built diagram makes obvious —
"the bar is 21 across and 8 of it is the second piece, how long is the
first?" — so the answer falls out of the construction rather than out of
symbol manipulation. That is the whole point of the representation.

The validator enforces the opening frame: `[arrives_whole]` warns when a
timeline's FIRST patch hands over a finished diagram. Note that omitting a
staging key counts as unstaged — a tape with `cells` but no `cellsIn`
shows every section from frame one, which is how cube's bar model shipped
fully drawn.

Staging flags exist for this: `cellsIn` (tape sections),
`leftIn`/`rightIn` (balance pans), `shapesIn`/`weightIn` (hanger),
`totalIn` (tape total), `topIn`/`bottomIn` (double number line),
`envelopesIn`/`countersIn`, `fillRows`/`products` (area), `reveal`
(tables), `slices` (cube). Whiteboards (`worked-equation`) are exempt —
a board written line by line IS the construction — and the number line's
jumps play the same role.

## Decomposition steps pair the symbol with its region

Lessons open on the raw symbolic equation (`equation` segments) and
decompose it into the diagram. Each arrival step sets `eqHighlight` on
the symbol part AND brings in the region it becomes (staged entrance
flags: `leftIn`/`rightIn`, `shapesIn`/`weightIn`, `totalIn`,
`envelopesIn`/`countersIn` — default true), highlighting that region
where the widget supports it. The student's eye follows symbol → shape
every time. Full standard: `../cairn/GOLDEN_WIDGET.md` §3.

## The scaffolded lead is the visualization, not a separate system

Faded examples are NOT separate items with worked-steps lists (the old
`faded.steps` mechanism is retired, and so are the `faded` PHASE and the
`led` item kind — see cairn-architecture.md). The engine serves an
ordinary practice instance marked `scaffolded`; the client plays the skill's explanation with THAT
instance's numbers up to just before the resolution, and the student
finishes it in the ordinary answer input. Authoring rule this relies on:
**an explanation's final content step must BE the resolution** (the reveal
/ "x = …" step), so truncating one step leaves a complete setup.

## Lead with what it IS

Opening captions teach the concept AFFIRMATIVELY ("6² means a square:
6 rows of 6"), never by negation ("6² is NOT 6 × 2"). These timelines
are the primary learning path, not reminder notes — a misconception
contrast may FOLLOW the positive statement, but never lead it.

## Structure the answer space early, withdraw it at the ceiling

Concreteness fading applies to the ANSWER SPACE, not only the diagram.
`term-input` renders `[ ]x [±] [ ]` — a box per term and the sign chosen,
not printed — for the easier tiers of an expression skill:

- it isolates the mathematics. A free-text box also tests notation
  (writing `6x` not `6*x` or `x6`), so a student who distributes
  perfectly can still be marked wrong for typing;
- the blank structure IS teaching. `[ ]x + [ ]` says the answer has two
  parts, one attached to the variable and one not — the conceptual
  content of distributing over a sum;
- it localises the error. Coefficient right, constant left as the
  original ⇒ distributed to the first term only, which one box cannot
  distinguish from any other mistake.

It must NOT be the ceiling: it gives away the form, and the standard asks
the student to GENERATE an equivalent expression, not fill slots. So:
structured at difficulty 1, raw expression at the hardest item — the
capstone rule below, applied to the same skill.

It assembles an ordinary expression string, so ONE answer key grades both
inputs; a structured answer never needs a structured key.

## Difficulty ceilings are RAW (capstone rule)

Widget answer spaces (tape, number lines, tables, flip, choice) scaffold
the EASIER difficulty tiers of a skill. Every skill's hardest item(s)
must take a raw text answer (numeric/expression/equation input) — checks
pick hardest-first and mastery evidence tops out at the raw symbolic
form. The validator warns ([capstone_raw]) when a skill's difficulty
ceiling is widget-only. Choice answers additionally carry a guessing
floor, so the engine discounts correct choice attempts (hint-level-1,
like rubric items) and they are never check-eligible — prefer richer
interactions (row-select on the table, fill-a-cell) over choice when the
judgment can be expressed in the representation itself.

## Ground rules

- Every record is `review: {status: draft}` until a human vets it; the
  release CI profile refuses unvetted content.
- Explanations are authored against a param FAMILY (usually the skill's
  first practice item). Items of other families must either share those
  identifiers or declare `representation: null`.
- **Every item carries `verify:`** — an independent boolean relation with
  `answer` bound to the computed answer value ("{a * answer == b}"),
  substituting the solution back into the ORIGINAL equation (never the
  answer template — that would be circular). Add `integer: true` on the
  answer whenever instances must have whole-number solutions; CI checks
  both across authored params and generator seeds.
- `npm run validate` (authoring) must pass with 0 errors before committing.

- **Future work is tracked centrally in `../TODO.md`** — don't scatter
  queued-work notes across docs; leave context, move the task.
  Check items off in the SAME commit that finishes them and re-read it
  when picking up work — a stale queue hides what's actually left.
- **MONOREPO (2026-08-27)**: this directory is part of the single git repo
  at the workspace root (github.com/Amelia-Mowers/open-mastery). Commit at
  the ROOT — the old per-directory repos are archived as .git-local-archive
  and must not be used. Every push to main redeploys the Pages demo.
